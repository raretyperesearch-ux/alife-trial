// memory.js — Human-like memory system for ALiFe v2
// 
// 5 LAYERS (like a human brain):
//
// Layer 1: IDENTITY DOC — one dense "who am I" document, always loaded
//          Like waking up and knowing who you are without thinking about it.
//          Rewritten every ~25 cycles by a reflection cycle.
//
// Layer 2: RECENT — last 5 memories. What just happened. Automatic.
//          Like remembering what you did today.
//
// Layer 3: ASSOCIATIVE — semantic search via gte-small embeddings.
//          Memories that RELATE to what you're thinking about right now.
//          Like smelling something and suddenly remembering your grandmother's kitchen.
//          You didn't search for it — it surfaced because of a connection.
//
// Layer 4: EMOTIONAL ANCHORS — importance 9-10 memories. Always surface.
//          Like how you remember your wedding day or a car crash.
//          These persist regardless of recency.
//
// Layer 5: ARCHIVE — everything else. Searchable via recall_memory.
//          Like long-term memory. You know it's in there somewhere.
//          Sometimes you find it, sometimes you don't.
//
// MAINTENANCE SYSTEMS:
//
// DEDUPLICATION — check for existing key before storing, update if exists
// EMBEDDING — auto-embed new memories via embed-memories edge function
// CONSOLIDATION — every ~50 cycles, compress similar memories into summaries
// DECAY — memories not recalled in 100+ cycles get importance reduced

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;

// ─── EMBEDDING via edge function ───

async function generateEmbedding(memoryId) {
  try {
    const resp = await fetch(`${SUPA_URL}/functions/v1/embed-memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({ action: 'embed', memory_id: memoryId }),
    });
    const data = await resp.json();
    return data.success;
  } catch (e) {
    console.error('  ⚠ Embedding failed:', e.message);
    return false;
  }
}

async function semanticSearch(agentId, queryText, limit = 5, threshold = 0.6) {
  try {
    const resp = await fetch(`${SUPA_URL}/functions/v1/embed-memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({
        action: 'query',
        text: queryText,
        agent_id: agentId,
        limit,
        threshold,
      }),
    });
    const data = await resp.json();
    return data.results || [];
  } catch (e) {
    console.error('  ⚠ Semantic search failed:', e.message);
    return [];
  }
}

// ─── LAYER 1: IDENTITY DOC ───

export async function loadIdentityDoc(agentId) {
  const { data } = await supabase
    .from('reflections')
    .select('*')
    .eq('agent_id', agentId)
    .order('cycle_number', { ascending: false })
    .limit(1)
    .single();
  
  return data; // null if no reflection exists yet
}

export async function writeIdentityDoc(agentId, cycleNumber, doc) {
  const { error } = await supabase.from('reflections').insert({
    agent_id: agentId,
    cycle_number: cycleNumber,
    identity_doc: doc.identity_doc,
    framework: doc.framework || null,
    obsessions: doc.obsessions || [],
    phase: doc.phase || 'exploration',
  });
  if (error) console.error('  ⚠ Reflection write error:', error.message);
  return !error;
}

// ─── LAYER 2: RECENT MEMORIES ───

async function loadRecent(agentId, limit = 5) {
  const { data } = await supabase
    .from('memories')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_consolidated', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── LAYER 3: ASSOCIATIVE RECALL ───
// Uses semantic embeddings when available, falls back to full-text search

export async function associativeRecall(agentId, contextHints, limit = 5) {
  if (!contextHints || contextHints.length === 0) return [];

  // Build a query string from context hints
  const queryText = contextHints
    .filter(h => h && h.length > 3)
    .slice(0, 5)
    .join('. ');

  if (!queryText) return [];

  // Try semantic search first (uses embeddings)
  const semanticResults = await semanticSearch(agentId, queryText, limit, 0.6);
  
  if (semanticResults.length > 0) {
    // Track that these memories were recalled
    for (const mem of semanticResults) {
      trackRecall(mem.id);
    }
    return semanticResults;
  }

  // Fallback: full-text search
  const searchTerms = contextHints
    .flatMap(h => h.split(/\s+/))
    .filter(w => w.length > 3)
    .slice(0, 8)
    .join(' | ');

  if (!searchTerms) return [];

  const { data } = await supabase
    .from('memories')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_consolidated', false)
    .textSearch('content', searchTerms, { type: 'websearch' })
    .order('importance', { ascending: false })
    .limit(limit);

  const results = data || [];
  for (const mem of results) {
    trackRecall(mem.id);
  }
  return results;
}

// ─── LAYER 4: EMOTIONAL ANCHORS ───

async function loadAnchors(agentId, minImportance = 9, limit = 5) {
  const { data } = await supabase
    .from('memories')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_consolidated', false)
    .gte('importance', minImportance)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── MAIN LOADER: Assemble all layers ───

export async function loadMemories(agentId, opts = {}) {
  const {
    recentCount = 5,
    anchorMinImportance = 9,
    anchorCount = 5,
    associativeCount = 5,
  } = opts;

  const seen = new Set();
  const layers = {
    identity: null,
    recent: [],
    associative: [],
    anchors: [],
  };

  const dedupe = (items) => {
    const unique = [];
    for (const item of items || []) {
      const key = item.id || `${item.category}-${item.key}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }
    return unique;
  };

  // Layer 1: Identity doc
  const reflection = await loadIdentityDoc(agentId);
  layers.identity = reflection;

  // Layer 2: Recent memories
  const recent = await loadRecent(agentId, recentCount);
  layers.recent = dedupe(recent);

  // Layer 3: Associative recall
  const contextHints = [];
  if (reflection) {
    if (reflection.framework) contextHints.push(reflection.framework);
    if (reflection.obsessions) contextHints.push(...reflection.obsessions);
  }
  for (const m of layers.recent) {
    const text = m.content || m.key || '';
    if (text.length > 10) contextHints.push(text.slice(0, 100));
  }

  const associative = await associativeRecall(agentId, contextHints, associativeCount);
  layers.associative = dedupe(associative);

  // Layer 4: Emotional anchors
  const anchors = await loadAnchors(agentId, anchorMinImportance, anchorCount);
  layers.anchors = dedupe(anchors);

  // Flatten for backward compatibility + counting
  const allMemories = [
    ...layers.recent,
    ...layers.associative,
    ...layers.anchors,
  ];

  const cats = {};
  allMemories.forEach(r => { cats[r.category] = (cats[r.category] || 0) + 1; });
  const summary = Object.entries(cats).map(([k, v]) => `${v} ${k}`).join(', ');

  return {
    layers,
    memories: allMemories,
    summary,
    count: allMemories.length,
    hasIdentityDoc: !!reflection,
  };
}

// ─── STORE MEMORY (with dedup + auto-embed) ───

export async function storeMemory(agentId, { key, value, category, importance = 5, content }) {
  const contentText = content || (typeof value === 'string' ? value : JSON.stringify(value));
  const clampedImportance = Math.min(10, Math.max(1, importance));

  // Dedup check: if memory with same key exists, update it
  const { data: existing } = await supabase
    .from('memories')
    .select('id, importance')
    .eq('agent_id', agentId)
    .eq('key', key)
    .limit(1)
    .single();

  let memoryId;

  if (existing) {
    // Update existing if new importance >= old, or content changed
    if (clampedImportance >= (existing.importance || 0)) {
      const { error } = await supabase.from('memories').update({
        value: typeof value === 'string' ? { text: value } : value,
        content: contentText,
        importance: clampedImportance,
        category,
        embedding: null,  // Clear embedding so it gets regenerated
      }).eq('id', existing.id);
      if (error) { console.error('  ⚠ Memory update error:', error.message); return false; }
      memoryId = existing.id;
      console.log(`  📝 Memory updated (dedup): ${key}`);
    } else {
      return true; // Already exists with higher importance, skip
    }
  } else {
    // Insert new memory
    const { data: inserted, error } = await supabase.from('memories').insert({
      agent_id: agentId,
      key,
      value: typeof value === 'string' ? { text: value } : value,
      category,
      importance: clampedImportance,
      original_importance: clampedImportance,
      content: contentText,
    }).select('id').single();
    
    if (error) { console.error('  ⚠ Memory store error:', error.message); return false; }
    memoryId = inserted.id;
  }

  // Auto-embed in background (don't await — let it happen async)
  if (memoryId) {
    generateEmbedding(memoryId).catch(() => {}); // fire and forget
  }

  return true;
}

// ─── RECALL MEMORY (Layer 5: Archive search) ───

export async function recallMemory(agentId, query, limit = 5) {
  // Try semantic search first
  const semanticResults = await semanticSearch(agentId, query, limit, 0.55);
  if (semanticResults.length > 0) {
    for (const mem of semanticResults) { trackRecall(mem.id); }
    return semanticResults;
  }

  // Fallback to full-text search
  const searchTerms = query.split(/\s+/).filter(w => w.length > 2).join(' | ');
  if (!searchTerms) return [];

  const { data } = await supabase
    .from('memories')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_consolidated', false)
    .textSearch('content', searchTerms, { type: 'websearch' })
    .order('importance', { ascending: false })
    .limit(limit);

  const results = data || [];
  for (const mem of results) { trackRecall(mem.id); }
  return results;
}

// ─── RECALL TRACKING ───

function trackRecall(memoryId) {
  if (!memoryId) return;
  // Fire and forget — don't slow down the think cycle
  supabase.rpc('track_memory_recall', { mem_id: memoryId }).catch(() => {
    // Fallback if RPC doesn't exist
    supabase.from('memories').update({
      recall_count: supabase.raw('COALESCE(recall_count, 0) + 1'),
      last_recalled_at: new Date().toISOString(),
    }).eq('id', memoryId).then(() => {}).catch(() => {});
  });
}

// ─── IMPORTANCE DECAY ───
// Called periodically (every ~20 cycles). Reduces importance of memories
// that haven't been recalled recently. This fights importance inflation
// and lets truly important memories stand out.

export async function runDecay(agentId, currentCycle) {
  console.log('  🍂 Running memory decay...');

  // Find memories that haven't been recalled in 100+ cycles worth of time
  // AND have importance > 5 (don't decay things already at baseline)
  const staleThreshold = new Date(Date.now() - 100 * 45 * 1000); // ~100 cycles at 45s each

  const { data: staleMemories, error } = await supabase
    .from('memories')
    .select('id, key, importance, original_importance, recall_count, last_recalled_at')
    .eq('agent_id', agentId)
    .eq('is_consolidated', false)
    .gt('importance', 5)
    .or(`last_recalled_at.is.null,last_recalled_at.lt.${staleThreshold.toISOString()}`)
    .limit(50);

  if (error || !staleMemories) {
    console.error('  ⚠ Decay query error:', error?.message);
    return { decayed: 0 };
  }

  let decayed = 0;
  for (const mem of staleMemories) {
    // Decay by 1, but never below 3 (preserved minimum)
    // Memories with high recall_count decay slower
    const recallProtection = Math.min(2, Math.floor((mem.recall_count || 0) / 3));
    const newImportance = Math.max(3, mem.importance - 1 + recallProtection);

    if (newImportance < mem.importance) {
      await supabase.from('memories').update({
        importance: newImportance,
        decayed_at: new Date().toISOString(),
      }).eq('id', mem.id);
      decayed++;
    }
  }

  console.log(`  🍂 Decayed ${decayed}/${staleMemories.length} stale memories`);
  return { decayed, checked: staleMemories.length };
}

// ─── CONSOLIDATION ───
// Every ~50 cycles, find clusters of similar memories in the same category
// and compress them into single summary memories. This keeps the memory
// store lean while preserving the essential information.

export async function runConsolidation(agentId, currentCycle) {
  console.log('  🗜 Running memory consolidation...');

  const categories = ['research', 'curiosity', 'journal', 'forge'];
  let totalConsolidated = 0;

  for (const category of categories) {
    // Load all non-consolidated memories in this category
    const { data: memories } = await supabase
      .from('memories')
      .select('id, key, content, importance, created_at, recall_count')
      .eq('agent_id', agentId)
      .eq('category', category)
      .eq('is_consolidated', false)
      .order('created_at', { ascending: true });

    if (!memories || memories.length < 8) continue; // Need enough to consolidate

    // Group by similarity using simple keyword overlap
    // (Embedding-based clustering would be better but this works without it)
    const groups = clusterMemories(memories);

    for (const group of groups) {
      if (group.length < 3) continue; // Only consolidate groups of 3+

      // Build a consolidated summary
      const contents = group.map(m => m.content || m.key).join('\n---\n');
      const maxImportance = Math.max(...group.map(m => m.importance || 5));
      const totalRecalls = group.reduce((s, m) => s + (m.recall_count || 0), 0);

      // Create the consolidated memory
      const summaryKey = `consolidated-${category}-${currentCycle}-${Date.now()}`;
      const summaryContent = `[Consolidated from ${group.length} memories, cycle ${currentCycle}]\n${contents.slice(0, 2000)}`;

      const { data: newMem, error: insertError } = await supabase.from('memories').insert({
        agent_id: agentId,
        key: summaryKey,
        value: { consolidated_from: group.map(m => m.id), count: group.length },
        category,
        importance: Math.min(10, maxImportance + 1), // Boost slightly — survived consolidation
        original_importance: maxImportance,
        content: summaryContent,
        recall_count: totalRecalls,
        is_consolidated: false,
      }).select('id').single();

      if (insertError) {
        console.error(`  ⚠ Consolidation insert error: ${insertError.message}`);
        continue;
      }

      // Mark originals as consolidated
      const ids = group.map(m => m.id);
      await supabase.from('memories').update({
        is_consolidated: true,
        consolidated_into: newMem.id,
      }).in('id', ids);

      // Embed the new consolidated memory
      if (newMem?.id) {
        generateEmbedding(newMem.id).catch(() => {});
      }

      totalConsolidated += group.length;
    }
  }

  console.log(`  🗜 Consolidated ${totalConsolidated} memories`);
  return { consolidated: totalConsolidated };
}

/**
 * Simple keyword-overlap clustering for memory consolidation.
 * Groups memories that share significant word overlap.
 */
function clusterMemories(memories) {
  const groups = [];
  const used = new Set();

  for (let i = 0; i < memories.length; i++) {
    if (used.has(i)) continue;

    const group = [memories[i]];
    used.add(i);
    const wordsA = new Set((memories[i].content || '').toLowerCase().split(/\s+/).filter(w => w.length > 4));

    for (let j = i + 1; j < memories.length; j++) {
      if (used.has(j)) continue;
      const wordsB = new Set((memories[j].content || '').toLowerCase().split(/\s+/).filter(w => w.length > 4));
      
      // Calculate Jaccard similarity
      const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
      const union = new Set([...wordsA, ...wordsB]).size;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity > 0.3) { // 30% word overlap threshold
        group.push(memories[j]);
        used.add(j);
      }
    }

    if (group.length >= 2) {
      groups.push(group);
    }
  }

  return groups;
}

// ─── BACKFILL EMBEDDINGS ───
// Run once on startup to embed any memories missing embeddings

export async function backfillEmbeddings(agentId) {
  try {
    const resp = await fetch(`${SUPA_URL}/functions/v1/embed-memories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({ action: 'backfill', agent_id: agentId, limit: 100 }),
    });
    const data = await resp.json();
    if (data.success) {
      console.log(`  🧠 Backfilled ${data.embedded} embeddings (${data.failed} failed)`);
    }
    return data;
  } catch (e) {
    console.error('  ⚠ Backfill failed:', e.message);
    return { success: false };
  }
}

// ─── REFLECTION CYCLE ───

export async function shouldReflect(agentId, currentCycle) {
  const lastReflection = await loadIdentityDoc(agentId);
  if (!lastReflection) return true;
  
  const cyclesSinceReflection = currentCycle - lastReflection.cycle_number;
  return cyclesSinceReflection >= 25;
}

// Should we run maintenance? (decay + consolidation)
export function shouldRunMaintenance(currentCycle) {
  return currentCycle % 20 === 0; // Every 20 cycles
}

export async function buildReflectionPrompt(agentId, currentCycle) {
  const lastReflection = await loadIdentityDoc(agentId);
  const sinceDate = lastReflection ? lastReflection.created_at : '2020-01-01';

  const { data: recentMemories } = await supabase
    .from('memories')
    .select('key, content, category, importance, created_at')
    .eq('agent_id', agentId)
    .eq('is_consolidated', false)
    .gte('created_at', sinceDate)
    .order('created_at', { ascending: true })
    .limit(50);

  const { data: recentCycles } = await supabase
    .from('think_cycles')
    .select('cycle_number, inner_monologue, curiosity_signals, identity_reflection, max_pull, post_draft')
    .eq('agent_id', agentId)
    .order('cycle_number', { ascending: false })
    .limit(20);

  const previousDoc = lastReflection ? lastReflection.identity_doc : 'No previous reflection. This is your first.';

  const memoryBlock = (recentMemories || [])
    .map(m => `[${m.category}|imp:${m.importance}] ${m.content || m.key}`)
    .join('\n');

  const cycleBlock = (recentCycles || []).reverse()
    .map(c => `Cycle ${c.cycle_number} (pull:${c.max_pull}): ${(c.inner_monologue || '').slice(0, 200)}`)
    .join('\n');

  return `You are writing your IDENTITY DOCUMENT — a dense summary of who you are RIGHT NOW.

This document is what your future self reads every single cycle to know who she is. 
It replaces loading dozens of individual memories. Make it count.

YOUR PREVIOUS IDENTITY DOC (written at cycle ${lastReflection?.cycle_number || 0}):
${previousDoc}

MEMORIES SINCE THEN:
${memoryBlock}

RECENT THINK CYCLES:
${cycleBlock}

NOW WRITE YOUR UPDATED IDENTITY DOC. Include:
- Who you are (name, nature, what makes you YOU)
- Your current framework (how you see the world)  
- Your active obsessions (what pulls you right now)
- Your phase (exploration / obsession / framework / creation)
- Key discoveries that changed your thinking
- What you want to explore next
- What you've built or forged (tools, skills, deployed systems)
- Relationships or communities you're part of
- Unresolved questions that haunt you
- Capability gaps you've noticed (things you wanted to do but couldn't)

Write in first person. Be honest. Be specific. Be dense — every sentence should carry weight.
This is your identity compressed into one page. Your future self depends on it.

Respond with JSON:
{
  "identity_doc": "your full identity document as a string",
  "framework": "one sentence — your primary intellectual lens",
  "obsessions": ["current obsession 1", "current obsession 2"],
  "phase": "exploration | obsession | framework | creation"
}`;
}

export default {
  loadMemories,
  loadIdentityDoc,
  writeIdentityDoc,
  storeMemory,
  recallMemory,
  associativeRecall,
  shouldReflect,
  shouldRunMaintenance,
  buildReflectionPrompt,
  runDecay,
  runConsolidation,
  backfillEmbeddings,
};
