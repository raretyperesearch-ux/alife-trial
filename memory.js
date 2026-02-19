// memory.js — Smart memory retrieval for ALiFe v2
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * Load the RIGHT memories, not ALL memories.
 * Categories: identity, curiosity, research, journal, forge, relationship
 * Strategy: latest identity + recent research + high importance + active obsessions
 */
export async function loadMemories(agentId, opts = {}) {
  const {
    maxTotal = 25,
    identityCount = 3,
    curiosityCount = 3,
    researchCount = 8,
    journalCount = 2,
    forgeCount = 3,
    highImportanceMin = 8,
    highImportanceCount = 5,
  } = opts;

  const results = [];
  const seen = new Set();

  const add = (rows) => {
    for (const r of rows || []) {
      const key = r.id || `${r.category}-${r.key}`;
      if (!seen.has(key) && results.length < maxTotal) {
        seen.add(key);
        results.push(r);
      }
    }
  };

  // 1. Latest identity snapshots (who am I?)
  const { data: identity } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).eq('category', 'identity')
    .order('created_at', { ascending: false }).limit(identityCount);
  add(identity);

  // 2. Active curiosity signals (what am I obsessed with?)
  const { data: curiosity } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).eq('category', 'curiosity')
    .order('created_at', { ascending: false }).limit(curiosityCount);
  add(curiosity);

  // 3. Recent research (what have I learned?)
  const { data: research } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).eq('category', 'research')
    .order('created_at', { ascending: false }).limit(researchCount);
  add(research);

  // 4. Journal entries (what have I reflected on?)
  const { data: journal } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).eq('category', 'journal')
    .order('created_at', { ascending: false }).limit(journalCount);
  add(journal);

  // 5. Forge memories (what have I built?)
  const { data: forge } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).eq('category', 'forge')
    .order('created_at', { ascending: false }).limit(forgeCount);
  add(forge);

  // 6. High importance across all categories (the BIG stuff)
  const { data: important } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).gte('importance', highImportanceMin)
    .order('importance', { ascending: false }).limit(highImportanceCount);
  add(important);

  const cats = {};
  results.forEach(r => { cats[r.category] = (cats[r.category] || 0) + 1; });
  const summary = Object.entries(cats).map(([k, v]) => `${v} ${k}`).join(', ');

  return { memories: results, summary, count: results.length };
}

/**
 * Store a memory with smart importance scoring
 */
export async function storeMemory(agentId, { key, value, category, importance = 5, content }) {
  const { error } = await supabase.from('memories').insert({
    agent_id: agentId,
    key,
    value: typeof value === 'string' ? { text: value } : value,
    category,
    importance: Math.min(10, Math.max(1, importance)),
    content: content || (typeof value === 'string' ? value : JSON.stringify(value)),
  });
  if (error) console.error('  ⚠ Memory store error:', error.message);
  return !error;
}

/**
 * Search skills by relevance to current obsession
 */
export async function searchSkills(query, limit = 5) {
  const { data } = await supabase
    .from('skills')
    .select('id, name, domain, tier, description, word_count, forged, created_by')
    .textSearch('name', query.split(' ').join(' | '), { type: 'websearch' })
    .limit(limit);
  return data || [];
}

/**
 * Load a full skill document by ID
 */
export async function loadSkill(skillId) {
  const { data } = await supabase
    .from('skills')
    .select('*')
    .eq('id', skillId)
    .single();
  return data;
}

/**
 * Get agent's forged skills
 */
export async function getForgedSkills(agentId) {
  const { data } = await supabase
    .from('skills')
    .select('id, name, description, created_at_cycle')
    .eq('created_by', agentId)
    .eq('forged', true);
  return data || [];
}

export default { loadMemories, storeMemory, searchSkills, loadSkill, getForgedSkills };
