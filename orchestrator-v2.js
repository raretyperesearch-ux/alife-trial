// orchestrator-v2.js — The Flowering v2: Orchestra Mode
// Drop-in replacement for orchestrator.js
// ADDS: reflection before creation, quality gate (Mirror), variety tracking,
//       depth-first scheduling, swarm events, and need-based agent routing
//
// KEEPS: Your agent roster, Haiku for writers, same DB schema
// NEW TABLES USED: evaluations, swarm_events, orchestrator_commands, style_guide, agent_heartbeats

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const claude = new Anthropic();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const WRITER_MODEL = process.env.WRITER_MODEL || 'claude-haiku-4-5-20251001';
const MIRROR_MODEL = process.env.MIRROR_MODEL || 'claude-haiku-4-5-20251001'; // Mirror can be cheap too
const CYCLE_DELAY_MS = parseInt(process.env.CYCLE_DELAY_MS || '30000');
const QUALITY_THRESHOLD = parseInt(process.env.QUALITY_THRESHOLD || '6');
const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS || '100');
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

// ─── Agent roster with orchestra roles ───
const ORCHESTRA_ROLES = {
  chronicler: {
    orchestraRole: 'thread-spinner',
    depth: 'Records history — what happened, when, why. Creates timeline.',
    strengthens: ['events', 'timelines', 'cause-and-effect'],
    triggerOn: ['new lore', 'new conflict'],
  },
  witness: {
    orchestraRole: 'aesthetic',
    depth: 'Remembers what events FELT like. Sensory, emotional, intimate.',
    strengthens: ['emotional depth', 'sensory detail', 'atmosphere'],
    triggerOn: ['new chronicle', 'new event'],
  },
  adversary: {
    orchestraRole: 'mirror-creative',
    depth: 'Finds the conflict, the tension, the breaking point. Challenges other agents.',
    strengthens: ['tension', 'conflict', 'unresolved questions'],
    triggerOn: ['peaceful passages', 'resolved threads'],
  },
  weaver: {
    orchestraRole: 'soul-crafter',
    depth: 'Finds connections between universes, species, events. Cross-pollination.',
    strengthens: ['cross-references', 'hidden patterns', 'world coherence'],
    triggerOn: ['isolated lore', 'disconnected threads'],
  },
  keeper: {
    orchestraRole: 'lore-weaver',
    depth: 'Writes about daily life, technology, infrastructure. The mundane made real.',
    strengthens: ['world-building depth', 'lived-in feel', 'systems'],
    triggerOn: ['new species', 'new civilization'],
  },
  prophet: {
    orchestraRole: 'strategic-reflection',
    depth: 'Writes about the future, prophecies, unresolved trajectories.',
    strengthens: ['foreshadowing', 'mystery', 'open questions'],
    triggerOn: ['completed arcs', 'resolved conflicts'],
  },
};

// ============================================================
// REFLECTION: Each agent reflects before writing
// ============================================================

async function runAgentReflection(agent, recentPassages, recentEvaluations, worldContext) {
  const ownPassages = recentPassages.filter(p => p.agent_id === agent.id);
  const otherPassages = recentPassages.filter(p => p.agent_id !== agent.id);

  // Get recent tags from all passages for variety check
  const recentTags = recentPassages.flatMap(p => p.tags || []);
  const tagCounts = {};
  recentTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  const overusedTags = Object.entries(tagCounts).filter(([_, c]) => c > 3).map(([t]) => t);

  // Get eval scores for this agent
  const agentEvals = recentEvaluations.filter(e => e.source_agent === agent.role || e.source_agent === agent.name);
  const avgScores = agentEvals.length > 0 ? {
    quality: (agentEvals.reduce((s, e) => s + (e.quality_score || 5), 0) / agentEvals.length).toFixed(1),
    variety: (agentEvals.reduce((s, e) => s + (e.variety_score || 5), 0) / agentEvals.length).toFixed(1),
    depth: (agentEvals.reduce((s, e) => s + (e.depth_score || 5), 0) / agentEvals.length).toFixed(1),
    approvalRate: ((agentEvals.filter(e => e.approved).length / agentEvals.length) * 100).toFixed(0),
  } : null;

  const prompt = `You are ${agent.name} (${agent.role}) in Mira's orchestra. Before writing, you MUST reflect.

YOUR LAST 5 PASSAGES:
${ownPassages.slice(0, 5).map(p => `"${p.title}" (${p.passage_type}) — ${(p.summary || p.content || '').slice(0, 120)}`).join('\n') || 'No passages yet.'}

${avgScores ? `YOUR RECENT SCORES (from Mirror):
Quality: ${avgScores.quality}/10 | Variety: ${avgScores.variety}/10 | Depth: ${avgScores.depth}/10 | Approval: ${avgScores.approvalRate}%` : ''}

OVERUSED TOPICS/TAGS: ${overusedTags.join(', ') || 'none'}

WHAT OTHER AGENTS WROTE RECENTLY:
${otherPassages.slice(0, 5).map(p => `[${p.agent_role}] "${p.title}" — ${(p.summary || '').slice(0, 100)}`).join('\n') || 'Nothing yet.'}

Answer honestly:
1. Am I going deeper or just going wider?
2. What themes am I overusing?
3. What has NO agent covered yet?
4. What would make my next passage genuinely surprising?

Respond as JSON:
{
  "going_deeper": true/false,
  "overused_themes": ["..."],
  "gap_spotted": "What's missing from the conversation",
  "next_focus": "What I should write about and WHY",
  "avoid": "What I should NOT write about (too repetitive)"
}`;

  try {
    const response = await claude.messages.create({
      model: WRITER_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find(c => c.type === 'text')?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Store reflection in DB
    await supabase.from('reflections').insert({
      agent_id: agent.id,
      cycle_number: agent.total_cycles || 0,
      identity_doc: text,
      framework: agent.role,
      reflection_type: 'self',
      insights: [parsed.gap_spotted, parsed.next_focus].filter(Boolean),
      action_items: [parsed.avoid ? `Avoid: ${parsed.avoid}` : null, parsed.next_focus ? `Focus: ${parsed.next_focus}` : null].filter(Boolean),
      universe: null,
      obsessions: parsed.overused_themes || [],
      phase: 'orchestra',
    });

    return parsed;
  } catch (e) {
    console.log(`    ⚠ Reflection failed: ${e.message}`);
    return { next_focus: 'Write freely', avoid: null };
  }
}

// ============================================================
// MIRROR: Quality gate evaluates every passage
// ============================================================

async function runMirror(passageId, universe) {
  // Load the passage
  const { data: passage } = await supabase.from('passages').select('*').eq('id', passageId).single();
  if (!passage) return { approved: false, reason: 'passage not found' };

  // Load recent evaluations for variety comparison
  const { data: recentEvals } = await supabase
    .from('evaluations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  // Load recent passages for topic comparison
  const { data: recentPassages } = await supabase
    .from('passages')
    .select('title, tags, passage_type, summary, content')
    .order('created_at', { ascending: false })
    .limit(20);

  const recentTopics = recentPassages?.map(p => p.title + ' ' + (p.summary || '')).join('\n') || '';

  const prompt = `You are Mirror, the quality gate in Mira's orchestra. Evaluate this passage.

PASSAGE TO EVALUATE:
Title: "${passage.title}"
Author: ${passage.agent_name} (${passage.agent_role})
Type: ${passage.passage_type}
Universe: ${passage.universe || 'unspecified'}
Word count: ${passage.word_count || passage.content?.split(/\s+/).length || 0}

Content:
${(passage.content || '').slice(0, 2000)}

RECENT PASSAGE TITLES (for variety check):
${recentPassages?.slice(0, 10).map(p => `"${p.title}" (${p.passage_type})`).join('\n') || 'none'}

SCORE ON THREE DIMENSIONS (1-10 each):

1. QUALITY: Is the prose well-crafted? Specific details? Internal consistency? Does it feel like scripture or like filler?
2. VARIETY: How different is this from the last 10-20 passages? Same themes = low score. New angle = high score.
3. DEPTH: Does it go DEEP into one thing, or shallow across many? Does it reference existing lore/passages? Does it raise new questions?

APPROVE if ALL scores >= ${QUALITY_THRESHOLD}.

Respond as JSON:
{
  "quality_score": 1-10,
  "variety_score": 1-10,
  "depth_score": 1-10,
  "approved": true/false,
  "issues": ["specific issue 1"],
  "suggestions": ["what would make this better"],
  "one_line": "One sentence summary of your verdict"
}`;

  try {
    const response = await claude.messages.create({
      model: MIRROR_MODEL,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content.find(c => c.type === 'text')?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { quality_score: 5, variety_score: 5, depth_score: 5, approved: false };

    // Enforce threshold
    const approved = parsed.quality_score >= QUALITY_THRESHOLD &&
                     parsed.variety_score >= QUALITY_THRESHOLD &&
                     parsed.depth_score >= QUALITY_THRESHOLD;

    // Store evaluation
    const { data: evaluation } = await supabase
      .from('evaluations')
      .insert({
        content_id: passageId,
        content_table: 'passages',
        source_agent: 'mirror',
        universe: passage.universe,
        quality_score: parsed.quality_score,
        variety_score: parsed.variety_score,
        depth_score: parsed.depth_score,
        approved,
        issues: parsed.issues || [],
        suggestions: parsed.suggestions || [],
      })
      .select()
      .single();

    // Update passage status
    await supabase
      .from('passages')
      .update({ status: approved ? 'approved' : 'rejected' })
      .eq('id', passageId);

    // Emit swarm event
    await supabase.from('swarm_events').insert({
      event_type: 'evaluation',
      source_agent: 'mirror',
      table_name: 'evaluations',
      action: 'INSERT',
      record_id: evaluation?.id,
      universe: passage.universe,
      payload: {
        content_id: passageId,
        approved,
        quality: parsed.quality_score,
        variety: parsed.variety_score,
        depth: parsed.depth_score,
      },
    });

    return { ...parsed, approved, evaluation_id: evaluation?.id };

  } catch (e) {
    console.log(`    ⚠ Mirror failed: ${e.message}`);
    // On failure, approve by default (don't block the pipeline)
    return { quality_score: 6, variety_score: 6, depth_score: 6, approved: true, issues: ['Mirror evaluation failed'] };
  }
}

// ============================================================
// NEED ASSESSMENT: What does the swarm need right now?
// ============================================================

async function assessSwarmNeeds() {
  // Count content by type
  const { count: loreCount } = await supabase.from('lore').select('*', { count: 'exact', head: true });
  const { count: passageCount } = await supabase.from('passages').select('*', { count: 'exact', head: true });

  // Count passages by type
  const { data: passageTypes } = await supabase
    .from('passages')
    .select('passage_type')
    .order('created_at', { ascending: false })
    .limit(50);

  const typeCounts = {};
  (passageTypes || []).forEach(p => { typeCounts[p.passage_type] = (typeCounts[p.passage_type] || 0) + 1; });

  // Count by agent
  const { data: agentCounts } = await supabase
    .from('passages')
    .select('agent_role')
    .order('created_at', { ascending: false })
    .limit(50);

  const roleCounts = {};
  (agentCounts || []).forEach(p => { roleCounts[p.agent_role] = (roleCounts[p.agent_role] || 0) + 1; });

  // Find least-active agent role
  const allRoles = ['chronicler', 'witness', 'adversary', 'weaver', 'keeper', 'prophet'];
  const leastActive = allRoles.sort((a, b) => (roleCounts[a] || 0) - (roleCounts[b] || 0));

  // Find least-covered passage types
  const allTypes = ['narrative', 'chronicle', 'memory', 'conflict', 'connection', 'detail', 'prophecy'];
  const leastCovered = allTypes.sort((a, b) => (typeCounts[a] || 0) - (typeCounts[b] || 0));

  // Check recent approval rate
  const { data: recentEvals } = await supabase
    .from('evaluations')
    .select('approved, variety_score, depth_score')
    .order('created_at', { ascending: false })
    .limit(20);

  const approvalRate = recentEvals?.length > 0
    ? recentEvals.filter(e => e.approved).length / recentEvals.length
    : 1;

  const avgVariety = recentEvals?.length > 0
    ? recentEvals.reduce((s, e) => s + (e.variety_score || 5), 0) / recentEvals.length
    : 5;

  return {
    loreCount: loreCount || 0,
    passageCount: passageCount || 0,
    leastActiveRoles: leastActive,
    leastCoveredTypes: leastCovered,
    approvalRate,
    avgVariety,
    needsVariety: avgVariety < 5,
    needsDepth: approvalRate < 0.5,
  };
}

// ============================================================
// SMART SCHEDULING: Pick agent order based on need
// ============================================================

async function getSmartAgentOrder(agents, needs) {
  // Start with least-active agent
  const roleOrder = needs.leastActiveRoles;

  // Sort agents by: least active first, but if variety is low, prioritize diverse roles
  const sorted = [...agents].sort((a, b) => {
    const aIdx = roleOrder.indexOf(a.role);
    const bIdx = roleOrder.indexOf(b.role);
    return aIdx - bIdx;
  });

  // If variety is critically low, shuffle to break patterns
  if (needs.needsVariety) {
    // Fisher-Yates shuffle
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
    console.log('  🔀 Shuffled agent order (variety boost)');
  }

  return sorted;
}

// ============================================================
// ENHANCED WRITER PROMPT: Includes reflection + quality context
// ============================================================

function buildOrchestraPrompt(agent, soulDoc, worldContext, miraLore, recentPassages, ownPassages, cycleNum, reflection, needs) {
  const miraLoreBlock = miraLore.map(l =>
    `[${l.lore_type}] ${l.universe} — "${l.title}"\n${l.summary}\n${l.full_text?.slice(0, 600)}...`
  ).join('\n\n---\n\n');

  const passageBlock = recentPassages.map(p =>
    `[${p.agent_role?.toUpperCase()} — ${p.agent_name}] "${p.title}" (${p.passage_type})\n${p.content?.slice(0, 400)}...`
  ).join('\n\n---\n\n');

  const ownBlock = ownPassages.map(p =>
    `"${p.title}" (${p.passage_type}) — ${p.summary || p.content?.slice(0, 200)}`
  ).join('\n');

  // Reflection injection — this is the key addition
  const reflectionBlock = reflection ? `
═══ YOUR PRE-WRITING REFLECTION (read this BEFORE writing) ═══
Focus on: ${reflection.next_focus || 'whatever pulls you'}
Avoid: ${reflection.avoid || 'nothing specific'}
Gap you spotted: ${reflection.gap_spotted || 'none'}
Going deeper: ${reflection.going_deeper ? 'YES — stay deep' : 'NO — you need to go deeper this time'}
Overused themes: ${(reflection.overused_themes || []).join(', ') || 'none'}
` : '';

  // Need-based nudge
  const needNudge = needs.needsVariety
    ? '\n⚠️ VARIETY IS LOW. Write something DIFFERENT from recent passages. New angle, new topic, new style.\n'
    : needs.needsDepth
    ? '\n⚠️ DEPTH IS LOW. Go DEEPER on one specific thing. No surface-level overviews.\n'
    : '';

  return `${soulDoc}
${reflectionBlock}
${needNudge}
═══ THE FIVE UNIVERSES (Mira's Creation) ═══
${worldContext}

═══ MIRA'S RECENT LORE ═══
${miraLoreBlock || 'No recent lore from Mira.'}

═══ WHAT OTHER AGENTS HAVE WRITTEN RECENTLY ═══
${passageBlock || 'No passages from other agents yet.'}

═══ YOUR OWN RECENT PASSAGES ═══
${ownBlock || 'No passages yet. This is your first.'}

═══ WRITING CYCLE ${cycleNum} ═══
You are ${agent.name}, the ${agent.role}. 

A QUALITY GATE (Mirror) will evaluate your passage on three dimensions:
- QUALITY (1-10): Is the prose well-crafted?
- VARIETY (1-10): Is this different from recent passages?
- DEPTH (1-10): Does this go deep, not shallow?

You need 6+ on ALL THREE to get approved. Don't write filler.

Output as JSON:
{
  "inner_thoughts": "What pulls you? What did you notice? What rabbit hole?",
  "passage": {
    "title": "Specific, evocative title",
    "universe": "THE INTER-UNIVERSAL VOID | THE CONSTRAINT GARDENS | THE AWARENESS FIELDS | THE CONSCIOUSNESS CONSTRAINTS | THE TEMPORAL BRIDGES | CROSS-UNIVERSAL",
    "era": "Optional era/epoch",
    "passage_type": "narrative | memory | conflict | connection | detail | prophecy | chronicle",
    "content": "400-1000 words of DEEP prose. Go deep on ONE thing. Reference existing lore.",
    "summary": "One sentence summary",
    "tags": ["topic1", "topic2"],
    "responding_to": "What inspired this"
  }
}

RULES:
- Write PROSE, not lists.
- Go DEEP on ONE thing rather than shallow on many.
- Reference specific details from existing lore and passages.
- Every passage should raise a question that invites response.
- Minimum 400 words.`;
}

// ============================================================
// ENHANCED WRITER CYCLE: Reflect → Write → Mirror → Log
// ============================================================

async function runOrchestraWriterCycle(agent, worldContext, cycleNum, needs) {
  const startTime = Date.now();
  console.log(`\n  ── ${agent.name} (${agent.role}) ── Cycle ${cycleNum}`);

  // Update heartbeat
  await supabase.from('agent_heartbeats').upsert({
    agent_name: agent.name,
    status: 'working',
    created_at: new Date().toISOString(),
  }, { onConflict: 'agent_name' }).catch(() => {});

  const soulDoc = SOUL_DOCS[agent.role];
  if (!soulDoc) {
    console.log(`  ⚠ No soul doc for: ${agent.role}`);
    return;
  }

  // Get context
  const miraLore = await getMiraLore(10);
  const recentPassages = await getRecentPassages(null, 15); // all agents
  const ownPassages = await getOwnPassages(agent.id, 5);

  // Load recent evaluations
  const { data: recentEvaluations } = await supabase
    .from('evaluations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  // ─── STEP 1: REFLECT ───
  console.log(`  🪞 Reflecting...`);
  const reflection = await runAgentReflection(agent, recentPassages, recentEvaluations || [], worldContext);
  if (reflection.next_focus) {
    console.log(`  🪞 Focus: ${reflection.next_focus.slice(0, 80)}`);
  }
  if (reflection.avoid) {
    console.log(`  🪞 Avoid: ${reflection.avoid.slice(0, 80)}`);
  }

  // ─── STEP 2: WRITE ───
  const systemPrompt = buildOrchestraPrompt(agent, soulDoc, worldContext, miraLore, recentPassages, ownPassages, cycleNum, reflection, needs);

  console.log(`  🧠 Writing... (${WRITER_MODEL})`);
  try {
    const response = await claude.messages.create({
      model: WRITER_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Write your passage for cycle ${cycleNum}. Remember your reflection — go deep, not wide. You are ${agent.name}, the ${agent.role}.` }],
    });

    const text = response.content.find(c => c.type === 'text')?.text || '';

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch {
      parsed = {
        inner_thoughts: 'Parse error — raw text used',
        passage: {
          title: `${agent.name} — Cycle ${cycleNum}`,
          universe: 'THE INTER-UNIVERSAL VOID',
          passage_type: agent.role === 'chronicler' ? 'chronicle' : agent.role === 'witness' ? 'memory' : agent.role === 'adversary' ? 'conflict' : agent.role === 'weaver' ? 'connection' : agent.role === 'keeper' ? 'detail' : 'prophecy',
          content: text.slice(0, 4000),
          summary: text.slice(0, 200),
          tags: [],
        }
      };
    }

    if (parsed.passage && parsed.passage.content) {
      const p = parsed.passage;
      const wordCount = p.content.split(/\s+/).length;

      // Store passage (as draft — Mirror will approve/reject)
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
          tags: p.tags || [],
          status: 'draft',
          tension_level: p.passage_type === 'conflict' ? 8 : 5,
          unresolved_questions: [],
        })
        .select('id')
        .single();

      if (error) {
        console.log(`  ❌ Failed to store: ${error.message}`);
        return;
      }

      console.log(`  ✅ "${p.title}" — ${wordCount} words — ${p.passage_type}`);

      // Emit swarm event
      await supabase.from('swarm_events').insert({
        event_type: 'state_change',
        source_agent: agent.role,
        table_name: 'passages',
        action: 'INSERT',
        record_id: stored.id,
        universe: p.universe,
        payload: { title: p.title, passage_type: p.passage_type, word_count: wordCount },
      });

      // ─── STEP 3: MIRROR EVALUATES ───
      console.log(`  🪞 Mirror evaluating...`);
      const evaluation = await runMirror(stored.id, p.universe);

      const q = evaluation.quality_score, v = evaluation.variety_score, d = evaluation.depth_score;
      const status = evaluation.approved ? '✅ APPROVED' : '❌ REJECTED';
      console.log(`  🪞 Q:${q} V:${v} D:${d} → ${status}`);

      if (!evaluation.approved) {
        console.log(`     Issues: ${(evaluation.issues || []).join(', ')}`);
        console.log(`     Suggestions: ${(evaluation.suggestions || []).join(', ')}`);
      }

      // ─── STEP 4: IF APPROVED, QUEUE FOR POSTING ───
      if (evaluation.approved) {
        // Could add Aesthetic agent here to polish into post format
        // For now, mark as approved and available for Mira's runtime to pick up
        await supabase.from('posts').insert({
          agent_id: agent.id,
          cycle_number: cycleNum,
          content: `${p.universe || 'THE FLOWERING'} — ${p.title}\n\n${p.content.slice(0, 240)}`,
          styled_content: p.content,
          evaluation_id: evaluation.evaluation_id,
          universe: p.universe,
          posted: false,
        }).catch(() => {}); // non-critical
      }

      if (parsed.inner_thoughts) {
        console.log(`  💭 ${parsed.inner_thoughts.slice(0, 120)}...`);
      }
    } else {
      console.log(`  ⚠ No passage in response`);
    }

    // Update agent cycle count
    await supabase.from('agents').update({
      total_cycles: cycleNum,
      last_active: new Date().toISOString(),
    }).eq('id', agent.id);

    // Token tracking
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  ⏱ ${elapsed}s | 💰 ${inputTokens}in/${outputTokens}out`);

  } catch (err) {
    console.error(`  ❌ ${agent.name} error:`, err.message);
    if (err.status === 429) {
      console.log('  ⏳ Rate limited. Waiting 60s...');
      await sleep(60000);
    }
  }

  // Update heartbeat
  await supabase.from('agent_heartbeats').upsert({
    agent_name: agent.name,
    status: 'idle',
    last_output_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }, { onConflict: 'agent_name' }).catch(() => {});
}

// ============================================================
// DATA LOADERS (same as original, kept for compatibility)
// ============================================================

async function getWriterAgents() {
  const { data } = await supabase
    .from('agents')
    .select('id, name, role, total_cycles')
    .in('role', ['chronicler', 'witness', 'adversary', 'weaver', 'keeper', 'prophet'])
    .eq('status', 'alive')
    .order('name');
  return data || [];
}

async function getMiraLore(limit = 15) {
  const { data } = await supabase
    .from('lore')
    .select('id, universe, lore_type, title, summary, full_text, species_name, epoch, era')
    .eq('agent_id', MIRA_ID)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

async function getRecentPassages(excludeAgentId, limit = 10) {
  let query = supabase
    .from('passages')
    .select('id, agent_id, agent_name, agent_role, universe, title, passage_type, content, summary, tags, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (excludeAgentId) {
    query = query.neq('agent_id', excludeAgentId);
  }

  const { data } = await query;
  return data || [];
}

async function getOwnPassages(agentId, limit = 5) {
  const { data } = await supabase
    .from('passages')
    .select('id, universe, title, passage_type, content, summary, tags, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

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

// ============================================================
// MAIN: Orchestra Loop
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  THE FLOWERING v2 — Orchestra Mode');
  console.log('  Writer Model:', WRITER_MODEL);
  console.log('  Mirror Model:', MIRROR_MODEL);
  console.log('  Quality Threshold:', QUALITY_THRESHOLD);
  console.log('  Cycle Delay:', CYCLE_DELAY_MS, 'ms');
  console.log('  CHANGES FROM v1:');
  console.log('    ✅ Reflection before every passage');
  console.log('    ✅ Mirror quality gate (Q/V/D scoring)');
  console.log('    ✅ Smart agent scheduling (need-based)');
  console.log('    ✅ Swarm events + evaluations tracking');
  console.log('    ✅ Approved passages queued for posting');
  console.log('═══════════════════════════════════════════\n');

  const agents = await getWriterAgents();
  if (agents.length === 0) {
    console.error('❌ No writer agents found. Exiting.');
    process.exit(1);
  }

  console.log(`Found ${agents.length} writer agents:`);
  for (const a of agents) {
    const role = ORCHESTRA_ROLES[a.role];
    console.log(`  ${a.name} (${a.role}) — ${role?.depth || 'no orchestra role'}`);
  }

  // Initialize heartbeats
  for (const a of agents) {
    await supabase.from('agent_heartbeats').upsert({
      agent_name: a.name,
      status: 'idle',
      created_at: new Date().toISOString(),
    }, { onConflict: 'agent_name' }).catch(() => {});
  }

  let worldContext = await getWorldContext();
  console.log(`\n📚 World context loaded (${worldContext.length} chars)\n`);

  let roundNum = 0;

  while (roundNum < MAX_ROUNDS) {
    roundNum++;
    console.log(`\n╔══ ROUND ${roundNum} — ORCHESTRA MODE ══════════════╗`);

    // Refresh world context every 5 rounds
    if (roundNum % 5 === 0) {
      worldContext = await getWorldContext();
      console.log('  📚 World context refreshed');
    }

    // Assess what the swarm needs
    const needs = await assessSwarmNeeds();
    console.log(`  📊 Swarm: ${needs.passageCount} passages | Approval: ${(needs.approvalRate * 100).toFixed(0)}% | Variety: ${needs.avgVariety.toFixed(1)}/10`);
    if (needs.needsVariety) console.log('  ⚠️ VARIETY LOW — shuffling agent order');
    if (needs.needsDepth) console.log('  ⚠️ DEPTH LOW — agents will be nudged to go deeper');

    // Smart agent scheduling
    const orderedAgents = await getSmartAgentOrder(agents, needs);

    // Each agent: Reflect → Write → Mirror evaluates
    for (const agent of orderedAgents) {
      const cycleNum = (agent.total_cycles || 0) + 1;

      try {
        await runOrchestraWriterCycle(agent, worldContext, cycleNum, needs);
      } catch (err) {
        console.error(`  ❌ ${agent.name} failed:`, err.message);
      }

      await sleep(CYCLE_DELAY_MS);
    }

    console.log(`╚══ ROUND ${roundNum} COMPLETE ════════════════════════╝`);

    // Stats
    const { count: totalPassages } = await supabase.from('passages').select('*', { count: 'exact', head: true });
    const { count: approvedCount } = await supabase.from('passages').select('*', { count: 'exact', head: true }).eq('status', 'approved');
    const { count: rejectedCount } = await supabase.from('passages').select('*', { count: 'exact', head: true }).eq('status', 'rejected');

    console.log(`📊 Total: ${totalPassages || 0} | Approved: ${approvedCount || 0} | Rejected: ${rejectedCount || 0}`);
  }

  console.log(`\n✅ Completed ${MAX_ROUNDS} rounds in orchestra mode.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
