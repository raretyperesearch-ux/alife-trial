// skills.js — Smart skill loading for ALiFe v2
// Instead of cramming 500 skills into the prompt, load only what's relevant
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

/**
 * Get a compact skill index for the system prompt
 * Just names + descriptions, grouped by domain. Enough for the agent to know what exists.
 */
export async function getSkillIndex() {
  const { data } = await supabase
    .from('skills')
    .select('id, name, domain, tier, description, forged, created_by')
    .order('domain')
    .order('tier');

  if (!data || data.length === 0) {
    return { index: 'No skills loaded yet.', count: 0 };
  }

  // Group by domain, just show id + one-line description
  const domains = {};
  for (const s of data) {
    const d = s.domain || 'general';
    if (!domains[d]) domains[d] = [];
    const forgedTag = s.forged ? ' [FORGED]' : '';
    domains[d].push(`${s.id}: ${(s.description || s.name || '').slice(0, 80)}${forgedTag}`);
  }

  let index = '';
  for (const [domain, skills] of Object.entries(domains).sort()) {
    index += `\n[${domain.toUpperCase()}] (${skills.length} skills)\n`;
    // Show first 10 per domain to keep it manageable
    for (const s of skills.slice(0, 10)) {
      index += `  ${s}\n`;
    }
    if (skills.length > 10) {
      index += `  ... and ${skills.length - 10} more. Use lookup_skill to explore.\n`;
    }
  }

  return { index, count: data.length, forgedCount: data.filter(s => s.forged).length };
}

/**
 * Search skills relevant to a topic
 */
export async function searchSkills(query, limit = 5) {
  // First try full-text search
  const { data: fts } = await supabase
    .from('skills')
    .select('id, name, domain, description, forged')
    .textSearch('name', query.split(/\s+/).join(' | '), { type: 'websearch' })
    .limit(limit);

  if (fts && fts.length > 0) return fts;

  // Fallback: ilike search on name and description
  const { data: ilike } = await supabase
    .from('skills')
    .select('id, name, domain, description, forged')
    .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(limit);

  return ilike || [];
}

/**
 * Load full skill document
 */
export async function loadSkill(skillId) {
  const { data } = await supabase
    .from('skills')
    .select('*')
    .eq('id', skillId)
    .single();
  return data;
}

export default { getSkillIndex, searchSkills, loadSkill };
