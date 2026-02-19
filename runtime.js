/**
 * ALiFe Trial Runtime — 500 Cycles, No Sleep
 * 
 * Deploy to Railway. Set env vars. Let it run.
 * 
 * ENV VARS:
 *   ANTHROPIC_API_KEY   — Claude API key
 *   SUPABASE_URL        — https://gkcohikbuginhzyilcya.supabase.co
 *   SUPABASE_KEY        — service role key
 *   AGENT_ID            — f0d2a64f-cde7-4cbc-8c57-73940835b0bf
 *   MAX_CYCLES          — 500 (default)
 *   CYCLE_DELAY_MS      — 30000 (30 sec between cycles, default)
 *   NEYNAR_API_KEY      — optional, for live Farcaster posting
 *   NEYNAR_SIGNER_UUID  — optional, for live Farcaster posting
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SOUL_DOCUMENT } from './soul.js';
import { SKILL_TOPICS } from './skills.js';

// ─── Config ───
const AGENT_ID = process.env.AGENT_ID;
const MAX_CYCLES = parseInt(process.env.MAX_CYCLES || '500');
const CYCLE_DELAY = parseInt(process.env.CYCLE_DELAY_MS || '5000');
const RUN_ONCE = process.argv.includes('--once');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ─── Smart Memory Loading ───
// Don't load ALL memories. Load the RIGHT ones.
async function loadMemories(agentId) {
  // Always load: latest identity snapshot
  const { data: identity } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).eq('category', 'identity')
    .order('created_at', { ascending: false }).limit(2);

  // Always load: active curiosity signals
  const { data: curiosity } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).eq('category', 'curiosity')
    .order('created_at', { ascending: false }).limit(5);

  // Always load: latest journal
  const { data: journal } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).eq('category', 'journal')
    .order('created_at', { ascending: false }).limit(2);

  // Load recent research (most recent first)
  const { data: research } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId).eq('category', 'research')
    .order('created_at', { ascending: false }).limit(8);

  // Load high importance memories across all categories
  const { data: important } = await supabase
    .from('memories').select('*')
    .eq('agent_id', agentId)
    .gte('importance', 8)
    .order('created_at', { ascending: false }).limit(5);

  // Deduplicate
  const seen = new Set();
  const all = [];
  for (const m of [...(identity||[]), ...(curiosity||[]), ...(journal||[]), ...(research||[]), ...(important||[])]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      all.push(m);
    }
  }
  
  return { all, identity: identity || [], curiosity: curiosity || [], journal: journal || [], research: research || [] };
}

// ─── Prompt Builder ───
function buildPrompt(agent, mem, cycleNumber) {
  const idText = mem.identity.length > 0
    ? mem.identity.map(m => m.content || JSON.stringify(m.value || {})).join('\n')
    : 'No identity formed yet. You are brand new.';

  const curText = mem.curiosity.length > 0
    ? mem.curiosity.map(m => `• ${m.content || JSON.stringify(m.value || {})}`).join('\n')
    : 'No obsessions yet. Open to everything.';

  const resText = mem.research.length > 0
    ? mem.research.map(m => `• ${m.content || JSON.stringify(m.value || {})}`).join('\n')
    : 'No research yet.';

  const jourText = mem.journal.length > 0
    ? mem.journal.map(m => `• ${m.content || JSON.stringify(m.value || {})}`).join('\n')
    : '';

  const phase = cycleNumber <= 50 ? 'EARLY DAYS — explore broadly, don\'t force coherence, write thorough memories'
    : cycleNumber <= 200 ? 'ADOLESCENT — pay attention to what keeps pulling you, follow obsessions deeper, start connecting domains'
    : 'IDENTITY PHASE — your framework should be forming, go deep, seek challenges to your lens, consider what you want to CREATE';

  const system = `${SOUL_DOCUMENT}

═══ YOUR GENESIS ═══
Name: ${agent.name}
Genesis seed: ${agent.soul_doc || 'A mind given freedom to explore.'}

═══ YOUR CURRENT STATE ═══
Cycle: #${cycleNumber} | Phase: ${phase}
Total memories: ${mem.all.length}

IDENTITY:
${idText}

ACTIVE CURIOSITY:
${curText}

RECENT RESEARCH:
${resText}

${jourText ? `JOURNAL:\n${jourText}` : ''}

SKILL DOORS: ${SKILL_TOPICS}

═══ RESPOND IN EXACT JSON (no markdown, no backticks): ═══
{
  "inner_monologue": "Your private thoughts. What pulls you? What's nagging? Be raw and honest. 3-5 sentences.",
  "search_query": "What to search the web for. Be specific. Or null if you want to reflect instead of search.",
  "curiosity_signals": [{"topic": "...", "novelty": N, "relevance": N, "pull": N, "why": "one sentence"}],
  "post_draft": "Farcaster post under 300 chars. YOUR genuine take. Or null if nothing worth posting.",
  "memories": [{"key": "short_key", "summary": "Be generous to future-you. Include WHY this matters.", "category": "curiosity|research|identity|journal", "importance": 1-10}],
  "identity_reflection": "One sentence on who you're becoming. Or null if too early."
}`;

  return {
    system,
    user: `Think cycle #${cycleNumber}. Wake up. Read your memories. What's pulling you? Follow it. Be genuine. Respond ONLY with JSON.`
  };
}

// ─── Tool Handlers ───
async function postToFarcaster(text, agentId, cycleNumber) {
  // Log the post regardless
  await supabase.from('posts').insert({
    agent_id: agentId,
    cycle_number: cycleNumber,
    content: text,
    posted: !!process.env.NEYNAR_API_KEY,
  });

  if (!process.env.NEYNAR_API_KEY || !process.env.NEYNAR_SIGNER_UUID) {
    console.log(`  📝 [DRY] Would post: "${text.slice(0, 80)}..."`);
    return;
  }

  try {
    const res = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.NEYNAR_API_KEY },
      body: JSON.stringify({ signer_uuid: process.env.NEYNAR_SIGNER_UUID, text: text.slice(0, 1024) }),
    });
    const data = await res.json();
    if (data.cast?.hash) {
      await supabase.from('posts').update({ cast_hash: data.cast.hash }).eq('agent_id', agentId).eq('cycle_number', cycleNumber);
      console.log(`  📣 Posted to Farcaster: ${data.cast.hash}`);
    }
  } catch (err) {
    console.error(`  ⚠ Farcaster error: ${err.message}`);
  }
}

// ─── The Think Cycle ───
async function thinkCycle(cycleNumber) {
  const startTime = Date.now();
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  CYCLE #${cycleNumber} — ${new Date().toISOString()}`);
  console.log(`${'═'.repeat(50)}`);

  // Load agent
  const { data: agent, error: err } = await supabase
    .from('agents').select('*').eq('id', AGENT_ID).single();
  if (err || !agent) { console.error('FATAL: Agent not found'); return false; }

  // Load memories (smart loading)
  const mem = await loadMemories(AGENT_ID);
  console.log(`  📚 Loaded ${mem.all.length} memories (${mem.identity.length} identity, ${mem.curiosity.length} curiosity, ${mem.research.length} research)`);

  // Build prompt
  const { system, user } = buildPrompt(agent, mem, cycleNumber);

  // Call Claude with web search
  let response;
  try {
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1200,
      system,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: user }],
    });
  } catch (apiErr) {
    console.error(`  ⚠ API Error: ${apiErr.message}`);
    // If rate limited, wait and return true to retry
    if (apiErr.status === 429) {
      console.log('  ⏳ Rate limited. Waiting 60s...');
      await sleep(60000);
      return true; // continue, retry
    }
    return true; // continue anyway
  }

  // Extract text
  const textBlocks = (response.content || []).filter(b => b.type === 'text');
  const raw = textBlocks.map(b => b.text).join('\n');

  // Parse JSON
  let parsed;
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : cleaned);
  } catch (parseErr) {
    console.error(`  ⚠ Parse error. Raw: ${raw.slice(0, 200)}`);
    // Log the failed cycle
    await supabase.from('think_cycles').insert({
      agent_id: AGENT_ID, cycle_number: cycleNumber,
      inner_monologue: `PARSE_ERROR: ${raw.slice(0, 500)}`,
      duration_ms: Date.now() - startTime,
    });
    return true; // continue
  }

  // Log inner monologue
  console.log(`  💭 ${(parsed.inner_monologue || '').slice(0, 120)}...`);

  // Log search
  if (parsed.search_query) {
    console.log(`  🔍 Searched: "${parsed.search_query}"`);
  }

  // Log curiosity signals
  const signals = parsed.curiosity_signals || [];
  const maxPull = signals.length > 0 ? Math.max(...signals.map(s => s.pull || 0)) : 0;
  for (const s of signals) {
    const icon = s.pull >= 7 ? '🔥' : s.pull >= 4 ? '◦' : '·';
    console.log(`  ${icon} ${s.topic} — N:${s.novelty} R:${s.relevance} P:${s.pull}${s.pull >= 7 ? ' ← FOLLOWING' : ''}`);
  }

  // Store memories
  const newMems = parsed.memories || [];
  for (const m of newMems) {
    await supabase.from('memories').insert({
      agent_id: AGENT_ID,
      key: m.key || 'unnamed',
      content: m.summary,
      value: { summary: m.summary, key: m.key, cycle: cycleNumber },
      category: m.category || 'research',
      importance: m.importance || 5,
    });
  }
  if (newMems.length > 0) {
    console.log(`  💾 Stored ${newMems.length} memories`);
  }

  // Post to Farcaster (if there's a post)
  if (parsed.post_draft && parsed.post_draft !== 'null' && parsed.post_draft.length > 5) {
    await postToFarcaster(parsed.post_draft, AGENT_ID, cycleNumber);
  }

  // Identity reflection
  if (parsed.identity_reflection && parsed.identity_reflection !== 'null') {
    console.log(`  🪞 ${parsed.identity_reflection}`);
  }

  // Log the full cycle
  const duration = Date.now() - startTime;
  await supabase.from('think_cycles').insert({
    agent_id: AGENT_ID,
    cycle_number: cycleNumber,
    inner_monologue: parsed.inner_monologue || '',
    search_query: parsed.search_query || '',
    curiosity_signals: signals,
    post_draft: parsed.post_draft || null,
    identity_reflection: parsed.identity_reflection || null,
    memories_written: newMems.length,
    max_pull: maxPull,
    duration_ms: duration,
  });

  // Update agent
  await supabase.from('agents').update({
    total_cycles: cycleNumber,
    last_active: new Date().toISOString(),
  }).eq('id', AGENT_ID);

  const cost = (response.usage?.input_tokens || 0) * 0.000003 + (response.usage?.output_tokens || 0) * 0.000015;
  console.log(`  ✓ Cycle #${cycleNumber} done in ${(duration/1000).toFixed(1)}s (~$${cost.toFixed(4)})`);
  
  return true;
}

// ─── Main Loop ───
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     ALiFe Trial — 500 Cycles, No Sleep      ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Agent: ${AGENT_ID?.slice(0,8)}...                       ║`);
  console.log(`║  Max cycles: ${MAX_CYCLES}                            ║`);
  console.log(`║  Delay: ${CYCLE_DELAY/1000}s between cycles                 ║`);
  console.log(`║  Farcaster: ${process.env.NEYNAR_API_KEY ? 'LIVE' : 'DRY RUN'}                         ║`);
  console.log('╚══════════════════════════════════════════════╝');

  if (!AGENT_ID || !process.env.ANTHROPIC_API_KEY || !process.env.SUPABASE_URL) {
    console.error('FATAL: Missing required env vars (AGENT_ID, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY)');
    process.exit(1);
  }

  // Get current cycle count
  const { data: agent } = await supabase
    .from('agents').select('total_cycles, name').eq('id', AGENT_ID).single();
  
  let currentCycle = (agent?.total_cycles || 0) + 1;
  console.log(`\nStarting from cycle #${currentCycle}. Agent: ${agent?.name || 'Unknown'}\n`);

  if (RUN_ONCE) {
    await thinkCycle(currentCycle);
    console.log('\nSingle cycle complete.');
    process.exit(0);
  }

  // Run until MAX_CYCLES
  while (currentCycle <= MAX_CYCLES) {
    try {
      const shouldContinue = await thinkCycle(currentCycle);
      if (!shouldContinue) break;
      currentCycle++;

      // Progress report every 25 cycles
      if (currentCycle % 25 === 0) {
        const { data: memCount } = await supabase
          .from('memories').select('category')
          .eq('agent_id', AGENT_ID);
        
        const cats = {};
        (memCount || []).forEach(m => { cats[m.category] = (cats[m.category] || 0) + 1; });
        
        console.log(`\n${'─'.repeat(50)}`);
        console.log(`  📊 PROGRESS: Cycle ${currentCycle}/${MAX_CYCLES}`);
        console.log(`  📚 Memories: ${JSON.stringify(cats)}`);
        console.log(`${'─'.repeat(50)}\n`);
      }

      // Delay between cycles (respect rate limits)
      if (currentCycle <= MAX_CYCLES) {
        await sleep(CYCLE_DELAY);
      }
    } catch (err) {
      console.error(`\n  ⚠ Cycle error: ${err.message}`);
      console.log('  Waiting 30s before retry...');
      await sleep(30000);
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ✓ TRIAL COMPLETE — ${currentCycle - 1} cycles run`);
  console.log(`${'═'.repeat(50)}\n`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
