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
// Layer 3: ASSOCIATIVE — semantic search based on current state.
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

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const claude = new Anthropic();

// ─── EMBEDDING ───
// We use Claude to generate a short summary, then use Supabase's built-in
// embedding via pg_net + OpenAI, OR we generate embeddings via a lightweight 
// approach: store a searchable text field and use full-text search as a 
// fallback when embeddings aren't available yet.

async function generateEmbedding(text) {
  // Use Anthropic to create a compact semantic fingerprint
  // For now, we use Supabase full-text search as primary
  // and add embedding support later when we have an embedding API key
  // This is a placeholder that returns null — associative recall
  // will fall back to full-text search
  return null;
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
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── LAYER 3: ASSOCIATIVE RECALL ───
// Given current context (obsessions, recent thoughts), find memories
// that RELATE — not by recency, but by connection.

async function associativeRecall(agentId, contextHints, limit = 5) {
  // contextHints is an array of keywords/phrases from current state
  // e.g. ["stigmergy", "coordination", "ant colonies", "cultural evolution"]
  
  if (!contextHints || contextHints.length === 0) return [];

  // Build a full-text search query from context hints
  const searchTerms = contextHints
    .flatMap(h => h.split(/\s+/))
    .filter(w => w.length > 3)  // skip short words
    .slice(0, 8)                // max 8 terms
    .join(' | ');

  if (!searchTerms) return [];

  const { data } = await supabase
    .from('memories')
    .select('*')
    .eq('agent_id', agentId)
    .textSearch('content', searchTerms, { type: 'websearch' })
    .order('importance', { ascending: false })
    .limit(limit);

  return data || [];
}

// ─── LAYER 4: EMOTIONAL ANCHORS ───
// High-importance memories that always surface, like vivid human memories

async function loadAnchors(agentId, minImportance = 9, limit = 5) {
  const { data } = await supabase
    .from('memories')
    .select('*')
    .eq('agent_id', agentId)
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
  // Build context hints from identity doc + recent memories
  const contextHints = [];
  if (reflection) {
    if (reflection.framework) contextHints.push(reflection.framework);
    if (reflection.obsessions) contextHints.push(...reflection.obsessions);
  }
  // Add topics from recent memories
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
    memories: allMemories,  // backward compat
    summary,
    count: allMemories.length,
    hasIdentityDoc: !!reflection,
  };
}

// ─── STORE MEMORY ───

export async function storeMemory(agentId, { key, value, category, importance = 5, content }) {
  const contentText = content || (typeof value === 'string' ? value : JSON.stringify(value));
  
  const { error } = await supabase.from('memories').insert({
    agent_id: agentId,
    key,
    value: typeof value === 'string' ? { text: value } : value,
    category,
    importance: Math.min(10, Math.max(1, importance)),
    content: contentText,
  });
  if (error) console.error('  ⚠ Memory store error:', error.message);
  return !error;
}

// ─── RECALL MEMORY (Layer 5: Archive search) ───
// Agent calls this explicitly when reaching for something

export async function recallMemory(agentId, query, limit = 5) {
  const searchTerms = query.split(/\s+/).filter(w => w.length > 2).join(' | ');
  
  if (!searchTerms) return [];

  const { data } = await supabase
    .from('memories')
    .select('*')
    .eq('agent_id', agentId)
    .textSearch('content', searchTerms, { type: 'websearch' })
    .order('importance', { ascending: false })
    .limit(limit);

  return data || [];
}

// ─── REFLECTION CYCLE ───
// Every ~25 cycles, compress recent experience into an identity doc.
// This is the equivalent of a human sitting down and journaling
// "who am I right now?"

export async function shouldReflect(agentId, currentCycle) {
  const lastReflection = await loadIdentityDoc(agentId);
  if (!lastReflection) return true; // never reflected, do it now
  
  const cyclesSinceReflection = currentCycle - lastReflection.cycle_number;
  return cyclesSinceReflection >= 25;
}

export async function buildReflectionPrompt(agentId, currentCycle) {
  // Load ALL recent memories since last reflection (not just 5)
  const lastReflection = await loadIdentityDoc(agentId);
  const sinceDate = lastReflection ? lastReflection.created_at : '2020-01-01';

  const { data: recentMemories } = await supabase
    .from('memories')
    .select('key, content, category, importance, created_at')
    .eq('agent_id', agentId)
    .gte('created_at', sinceDate)
    .order('created_at', { ascending: true })
    .limit(50);

  // Load recent think cycle monologues
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
- What you've built (if anything)
- Relationships or communities you're part of
- Unresolved questions that haunt you

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

// ─── SKILL HELPERS (unchanged) ───

export async function searchSkills(query, limit = 5) {
  const { data } = await supabase
    .from('skills')
    .select('id, name, domain, tier, description, word_count, forged, created_by')
    .textSearch('name', query.split(' ').join(' | '), { type: 'websearch' })
    .limit(limit);
  return data || [];
}

export async function loadSkill(skillId) {
  const { data } = await supabase
    .from('skills')
    .select('*')
    .eq('id', skillId)
    .single();
  return data;
}

export async function getForgedSkills(agentId) {
  const { data } = await supabase
    .from('skills')
    .select('id, name, description, created_at_cycle')
    .eq('created_by', agentId)
    .eq('forged', true);
  return data || [];
}

export default {
  loadMemories,
  loadIdentityDoc,
  writeIdentityDoc,
  storeMemory,
  recallMemory,
  associativeRecall,
  shouldReflect,
  buildReflectionPrompt,
  searchSkills,
  loadSkill,
  getForgedSkills,
};
