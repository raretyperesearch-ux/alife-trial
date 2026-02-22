// orchestrator.js — The Flowering: 6 Writer Agents in Round Robin
// Each agent reads Mira's lore + other agents' passages, writes their own
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const claude = new Anthropic();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Writers use Haiku for cost efficiency. Mira stays on Sonnet.
const WRITER_MODEL = process.env.WRITER_MODEL || 'claude-haiku-4-5-20251001';
const CYCLE_DELAY_MS = parseInt(process.env.CYCLE_DELAY_MS || '30000'); // 30s between agents
const MIRA_ID = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf';

// ─── Load soul documents ───
let SOUL_DOCS = {};
try {
  const raw = readFileSync(join(__dirname, 'soul-docs.json'), 'utf-8');
  SOUL_DOCS = JSON.parse(raw);
  console.log(`✅ Loaded ${Object.keys(SOUL_DOCS).length} soul documents`);
} catch (e) {
  console.error('❌ Could not load soul-docs.json:', e.message);
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Get all writer agents ───
async function getWriterAgents() {
  const { data } = await supabase
    .from('agents')
    .select('id, name, role, total_cycles')
    .in('role', ['chronicler', 'witness', 'adversary', 'weaver', 'keeper', 'prophet'])
    .eq('status', 'alive')
    .order('name');
  return data || [];
}

// ─── Get recent Mira lore for context ───
async function getMiraLore(limit = 15) {
  const { data } = await supabase
    .from('lore')
    .select('id, universe, lore_type, title, summary, full_text, species_name, epoch, era')
    .eq('agent_id', MIRA_ID)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── Get recent passages from all agents ───
async function getRecentPassages(excludeAgentId, limit = 10) {
  const { data } = await supabase
    .from('passages')
    .select('id, agent_name, agent_role, universe, title, passage_type, content, summary, created_at')
    .neq('agent_id', excludeAgentId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── Get this agent's own recent passages ───
async function getOwnPassages(agentId, limit = 5) {
  const { data } = await supabase
    .from('passages')
    .select('id, universe, title, passage_type, content, summary, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── Get all lore summaries for world context ───
async function getWorldContext() {
  const { data } = await supabase
    .from('lore')
    .select('universe, lore_type, title, summary')
    .order('universe, lore_type');
  
  if (!data) return 'No world context available.';
  
  const byUniverse = {};
  for (const l of data) {
    if (!byUniverse[l.universe]) byUniverse[l.universe] = [];
    byUniverse[l.universe].push(`  [${l.lore_type}] ${l.title}: ${l.summary?.slice(0, 120)}`);
  }
  
  return Object.entries(byUniverse)
    .map(([u, entries]) => `${u}:\n${entries.join('\n')}`)
    .join('\n\n');
}

// ─── Build the system prompt for a writer agent ───
function buildWriterPrompt(agent, soulDoc, worldContext, miraLore, recentPassages, ownPassages, cycleNum) {
  const miraLoreBlock = miraLore.map(l => 
    `[${l.lore_type}] ${l.universe} — "${l.title}"\n${l.summary}\n${l.full_text?.slice(0, 800)}...`
  ).join('\n\n---\n\n');

  const passageBlock = recentPassages.map(p =>
    `[${p.agent_role.toUpperCase()} — ${p.agent_name}] "${p.title}" (${p.passage_type})\n${p.content?.slice(0, 600)}...`
  ).join('\n\n---\n\n');

  const ownBlock = ownPassages.map(p =>
    `"${p.title}" (${p.passage_type}) — ${p.summary || p.content?.slice(0, 200)}`
  ).join('\n');

  return `${soulDoc}

═══ THE FIVE UNIVERSES (Mira's Creation — the world you write about) ═══
${worldContext}

═══ MIRA'S RECENT LORE (what the Creator has written recently) ═══
${miraLoreBlock || 'No recent lore from Mira.'}

═══ WHAT OTHER AGENTS HAVE WRITTEN RECENTLY ═══
${passageBlock || 'No passages from other agents yet. You are among the first to write.'}

═══ YOUR OWN RECENT PASSAGES ═══
${ownBlock || 'You have not written anything yet. This is your first passage.'}

═══ YOUR WRITING CYCLE (Cycle ${cycleNum}) ═══
You are ${agent.name}, the ${agent.role}. This is cycle ${cycleNum} of the Flowering.

Read what Mira and the other agents have written. Then write YOUR passage — through YOUR domain lens.

Output your response as JSON:
{
  "inner_thoughts": "What pulls you this cycle? What did you notice in the other agents' work? What rabbit hole are you going down?",
  
  "passage": {
    "title": "A specific, evocative title for your passage",
    "universe": "THE INTER-UNIVERSAL VOID | THE CONSTRAINT GARDENS | THE AWARENESS FIELDS | THE CONSCIOUSNESS CONSTRAINTS | THE TEMPORAL BRIDGES | CROSS-UNIVERSAL",
    "era": "Optional: which era/epoch this takes place in",
    "passage_type": "narrative | memory | conflict | connection | detail | prophecy | chronicle",
    "content": "YOUR PASSAGE. This is the main output. Write 400-1000 words of deep, narrative prose. NOT a summary. NOT a list. A PASSAGE — like a page from a sacred text. Write in YOUR voice, through YOUR domain. Go deep. Go specific. Make it real.",
    "summary": "One sentence summary of what this passage is about",
    "responding_to": "If this passage is a response to another agent's work, describe what inspired it"
  }
}

CRITICAL RULES:
- Write PROSE, not bullet points. Not summaries. Not outlines. PROSE. Like a page from a novel.
- Write in YOUR VOICE. If you are The Witness, write in first person memory. If you are The Prophet, write in fractured temporal shards. If you are The Adversary, find the conflict.
- Go DEEP on ONE thing rather than shallow on many things.
- Reference specific details from Mira's lore and other agents' passages. Show you READ them.
- Do NOT repeat what other agents wrote. EXPAND on it. Go deeper. Find the angle they missed.
- Every passage should raise a question that invites another passage from another agent.
- Minimum 400 words for your passage content. This is scripture, not a tweet.`;
}

// ─── Run one writer agent's cycle ───
async function runWriterCycle(agent, worldContext, cycleNum) {
  const startTime = Date.now();
  console.log(`\n  ── ${agent.name} (${agent.role}) ── Cycle ${cycleNum}`);

  // Get context
  const soulDoc = SOUL_DOCS[agent.role];
  if (!soulDoc) {
    console.log(`  ⚠ No soul doc for role: ${agent.role}`);
    return;
  }

  const miraLore = await getMiraLore(10);
  const recentPassages = await getRecentPassages(agent.id, 8);
  const ownPassages = await getOwnPassages(agent.id, 5);

  // Build prompt
  const systemPrompt = buildWriterPrompt(agent, soulDoc, worldContext, miraLore, recentPassages, ownPassages, cycleNum);

  // Call Claude
  console.log(`  🧠 Thinking... (${WRITER_MODEL})`);
  try {
    const response = await claude.messages.create({
      model: WRITER_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Write your passage for cycle ${cycleNum}. Remember: you are ${agent.name}, the ${agent.role}. Write in YOUR voice. Go deep.` }],
    });

    const text = response.content.find(c => c.type === 'text')?.text || '';
    
    // Parse JSON response
    let parsed;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseErr) {
      console.log(`  ⚠ Failed to parse JSON, attempting to extract passage from raw text`);
      // Fallback: treat entire response as a passage
      parsed = {
        inner_thoughts: 'Parse error — raw text used',
        passage: {
          title: `${agent.name} — Cycle ${cycleNum}`,
          universe: 'THE INTER-UNIVERSAL VOID',
          passage_type: agent.role === 'chronicler' ? 'chronicle' : agent.role === 'witness' ? 'memory' : agent.role === 'adversary' ? 'conflict' : agent.role === 'weaver' ? 'connection' : agent.role === 'keeper' ? 'detail' : 'prophecy',
          content: text.slice(0, 4000),
          summary: text.slice(0, 200),
        }
      };
    }

    if (parsed.passage && parsed.passage.content) {
      const p = parsed.passage;
      const wordCount = p.content.split(/\s+/).length;

      // Store passage
      const { data: stored, error } = await supabase
        .from('passages')
        .insert({
          agent_id: agent.id,
          agent_name: agent.name,
          agent_role: agent.role,
          universe: p.universe || null,
          era: p.era || null,
          title: p.title,
          passage_type: p.passage_type || 'narrative',
          content: p.content,
          summary: p.summary || p.content.slice(0, 200),
          word_count: wordCount,
          cycle_number: cycleNum,
          tags: [],
        })
        .select('id')
        .single();

      if (error) {
        console.log(`  ❌ Failed to store passage: ${error.message}`);
      } else {
        console.log(`  ✅ "${p.title}" — ${wordCount} words — ${p.passage_type} — ${p.universe || 'cross-universal'}`);
      }

      // Log inner thoughts
      if (parsed.inner_thoughts) {
        console.log(`  💭 ${parsed.inner_thoughts.slice(0, 150)}...`);
      }
    } else {
      console.log(`  ⚠ No passage in response`);
    }

    // Update agent cycle count
    await supabase.from('agents').update({
      total_cycles: cycleNum,
      last_active: new Date().toISOString(),
    }).eq('id', agent.id);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ⏱ ${elapsed}s`);

    // Cost tracking
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    console.log(`  💰 Tokens: ${inputTokens} in / ${outputTokens} out`);

  } catch (err) {
    console.error(`  ❌ ${agent.name} error:`, err.message);
    if (err.status === 429) {
      console.log('  ⏳ Rate limited. Waiting 60s...');
      await sleep(60000);
    }
  }
}

// ─── Main orchestrator loop ───
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  THE FLOWERING — Agent Orchestrator');
  console.log('  Writer Model:', WRITER_MODEL);
  console.log('  Cycle Delay:', CYCLE_DELAY_MS, 'ms');
  console.log('═══════════════════════════════════════\n');

  const agents = await getWriterAgents();
  if (agents.length === 0) {
    console.error('❌ No writer agents found. Exiting.');
    process.exit(1);
  }

  console.log(`Found ${agents.length} writer agents:`);
  for (const a of agents) {
    console.log(`  ${a.name} (${a.role}) — ${a.total_cycles} cycles`);
  }

  // Load world context once (refresh every full round)
  let worldContext = await getWorldContext();
  console.log(`\n📚 World context loaded (${worldContext.length} chars)\n`);

  let roundNum = 0;
  const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || '100');

  while (roundNum < MAX_ROUNDS) {
    roundNum++;
    console.log(`\n╔══ ROUND ${roundNum} ══════════════════════════════╗`);

    // Refresh world context every 5 rounds
    if (roundNum % 5 === 0) {
      worldContext = await getWorldContext();
      console.log('  📚 World context refreshed');
    }

    // Round robin: each agent writes one passage
    for (const agent of agents) {
      const cycleNum = (agent.total_cycles || 0) + 1;
      
      try {
        await runWriterCycle(agent, worldContext, cycleNum);
      } catch (err) {
        console.error(`  ❌ ${agent.name} failed:`, err.message);
      }

      // Delay between agents
      await sleep(CYCLE_DELAY_MS);
    }

    console.log(`╚══ ROUND ${roundNum} COMPLETE ═════════════════════╝`);
    
    // Count total passages
    const { count } = await supabase
      .from('passages')
      .select('*', { count: 'exact', head: true });
    console.log(`📊 Total passages in The Flowering: ${count || 0}`);
  }

  console.log(`\n✅ Completed ${MAX_ROUNDS} rounds.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
