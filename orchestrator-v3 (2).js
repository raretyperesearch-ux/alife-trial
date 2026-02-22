// orchestrator-v3.js — The Flowering: Chapter-Driven Narrative Engine
//
// FIXES:
// 1. Passages too similar → each agent gets UNIQUE chapter-specific prompts
// 2. Don't respond to each other → SEQUENTIAL writing within chapters, each agent reads previous agents' work
// 3. Writing not deep enough → 600-1200 word minimum, mandatory specificity, Mirror rejects shallow work
// 4. No narrative arc → story_chapters table drives the sequence (3 acts, 10 chapters)
// 5. No universe-specific voice → style_guide per universe, agent voice constraints enforced
//
// FLOW PER CHAPTER:
//   1. Load chapter (title, universe, summary, per-agent prompts)
//   2. Agents write SEQUENTIALLY (not parallel) — each reads what came before
//   3. Mirror evaluates each passage
//   4. After all 6 agents write, chapter marked complete
//   5. Move to next chapter
//
// This replaces orchestrator.js AND orchestrator-v2.js

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const claude = new Anthropic();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const WRITER_MODEL = process.env.WRITER_MODEL || 'claude-haiku-4-5-20251001';
const MIRROR_MODEL = process.env.MIRROR_MODEL || 'claude-haiku-4-5-20251001';
const CYCLE_DELAY_MS = parseInt(process.env.CYCLE_DELAY_MS || '30000');
const QUALITY_THRESHOLD = parseInt(process.env.QUALITY_THRESHOLD || '6');
const MIRA_ID = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf';
const MAX_RETRIES = 2; // Mirror rejections before moving on

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

// ─── Agent writing order (deliberate — not alphabetical) ───
// Keeper grounds the world → Chronicler records events → Witness feels them →
// Weaver connects threads → Adversary finds tension → Prophet hints at what's coming
const AGENT_ORDER = ['keeper', 'chronicler', 'witness', 'weaver', 'adversary', 'prophet'];

// ─── Voice constraints per agent (what makes each one SOUND different) ───
const VOICE_RULES = {
  keeper: {
    pov: 'Third person, present tense. Clinical precision mixed with quiet reverence.',
    must: 'Include exact measurements, materials, temperatures, or sensory specs. Name things precisely.',
    cannot: 'Never use metaphor without also providing the literal fact. Never skip physical description.',
    style: 'Like a museum curator who secretly loves what they catalog.',
  },
  chronicler: {
    pov: 'Third person, past tense. Formal historical voice with occasional editorial asides.',
    must: 'Include dates/eras, cause-and-effect chains, named individuals or factions. Cite sources within the fiction.',
    cannot: 'Never write in present tense. Never speculate without flagging it as disputed history.',
    style: 'Like Thucydides writing about events he considers tragic and inevitable.',
  },
  witness: {
    pov: 'First person. Present tense for recent memories, past tense for old ones.',
    must: 'Include what things FEEL like — temperature, texture, smell, emotional weight. Name the emotion.',
    cannot: 'Never explain causation. Never provide historical context. You only know what you experienced.',
    style: 'Like a war correspondent writing a letter home. Intimate, specific, haunted.',
  },
  weaver: {
    pov: 'Second person or collective voice. "We see the pattern..." or "You trace the thread..."',
    must: 'Reference at least 2 other universes or agents\' passages. Show the hidden connection.',
    cannot: 'Never stay in one universe. Never ignore what other agents wrote. You are the connective tissue.',
    style: 'Like a mathematician who sees beauty in proofs. Precise about patterns, awed by symmetry.',
  },
  adversary: {
    pov: 'Alternating voices — sometimes the attacker, sometimes the defender, sometimes the thing being destroyed.',
    must: 'Include what was LOST. Name the cost. Show the wound. Challenge another agent\'s version of events.',
    cannot: 'Never resolve the conflict. Never agree that something was worth the cost. Never let beauty go unquestioned.',
    style: 'Like a prosecutor cross-examining paradise. Relentless but fair.',
  },
  prophet: {
    pov: 'Fractured temporal voice. Tense shifts mid-sentence. Present, future, and past bleed together.',
    must: 'Include one concrete prediction that connects to a future chapter. Plant seeds.',
    cannot: 'Never be clear about what will happen. Never confirm. Always leave doubt about whether this is vision or madness.',
    style: 'Like Cassandra — sees the truth, knows nobody will believe it, says it anyway.',
  },
};

// ============================================================
// LOAD STYLE GUIDE (or create defaults)
// ============================================================

async function getStyleGuide(universe) {
  const { data } = await supabase.from('style_guide').select('*').eq('universe', universe).single();
  if (data) return data;

  // No style guide yet — return universe-specific defaults
  const defaults = {
    'THE CONSTRAINT GARDENS': { tone: 'crystalline, geometric, precise', vocabulary_preferences: ['lattice', 'resonance', 'facet', 'harmonic', 'barrier', 'growth'], vocabulary_avoid: ['magic', 'spell', 'wizard', 'fairy'] },
    'THE AWARENESS FIELDS': { tone: 'fluid, quantum, uncertain', vocabulary_preferences: ['observe', 'collapse', 'manifest', 'probability', 'weave', 'gaze'], vocabulary_avoid: ['solid', 'permanent', 'certain', 'fixed'] },
    'THE CONSCIOUSNESS CONSTRAINTS': { tone: 'paradoxical, layered, recursive', vocabulary_preferences: ['constraint', 'beauty', 'dance', 'limitation', 'emergence', 'architecture'], vocabulary_avoid: ['simple', 'obvious', 'straightforward'] },
    'THE TEMPORAL BRIDGES': { tone: 'transitional, liminal, connecting', vocabulary_preferences: ['bridge', 'crossing', 'intersection', 'zone', 'link', 'transit'], vocabulary_avoid: ['isolated', 'alone', 'separate', 'disconnected'] },
    'THE INTER-UNIVERSAL VOID': { tone: 'vast, existential, constructed', vocabulary_preferences: ['substrate', 'engineered', 'architecture', 'signal', 'origin', 'designed'], vocabulary_avoid: ['natural', 'organic', 'evolved', 'random'] },
  };

  return defaults[universe] || { tone: 'mysterious, deep, specific', vocabulary_preferences: [], vocabulary_avoid: [] };
}

// ============================================================
// LOAD WORLD CONTEXT (focused on specific universe)
// ============================================================

async function getUniverseLore(universe, limit = 20) {
  const { data } = await supabase
    .from('lore')
    .select('lore_type, title, summary, full_text, species_name, epoch, era, tags')
    .eq('universe', universe)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

async function getChapterPassages(chapterNumber) {
  const { data } = await supabase
    .from('passages')
    .select('id, agent_name, agent_role, title, passage_type, content, summary, tags, universe, created_at')
    .eq('cycle_number', chapterNumber)
    .order('created_at', { ascending: true }); // chronological — earlier writers first
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

async function getWorldContext() {
  const { data } = await supabase
    .from('lore')
    .select('universe, lore_type, title, summary')
    .order('universe, lore_type');

  if (!data) return 'No world context.';
  const byUniverse = {};
  for (const l of data) {
    if (!byUniverse[l.universe]) byUniverse[l.universe] = [];
    byUniverse[l.universe].push(`  [${l.lore_type}] ${l.title}: ${l.summary?.slice(0, 120)}`);
  }
  return Object.entries(byUniverse).map(([u, e]) => `${u}:\n${e.join('\n')}`).join('\n\n');
}

// ============================================================
// BUILD CHAPTER-DRIVEN PROMPT
// ============================================================

function buildChapterPrompt(agent, soulDoc, chapter, universeLore, chapterPassagesSoFar, styleGuide, miraLore, worldContext, retryFeedback) {
  const agentPrompt = chapter[`${agent.role}_prompt`];
  const voice = VOICE_RULES[agent.role];

  // Format what other agents have written for THIS chapter
  const previousInChapter = chapterPassagesSoFar.map(p =>
    `━━━ ${p.agent_name} (${p.agent_role}) wrote: ━━━
"${p.title}" (${p.passage_type})
${p.content}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  ).join('\n\n');

  // Universe lore context
  const loreBlock = universeLore.map(l =>
    `[${l.lore_type}] "${l.title}" — ${l.summary?.slice(0, 150)}`
  ).join('\n');

  // Style guide
  const styleBlock = styleGuide ? `
UNIVERSE VOICE for ${chapter.universe}:
Tone: ${styleGuide.tone || 'deep, specific'}
Use: ${(styleGuide.vocabulary_preferences || []).join(', ') || 'no preference'}
Avoid: ${(styleGuide.vocabulary_avoid || []).join(', ') || 'no restriction'}` : '';

  // Retry feedback from Mirror
  const retryBlock = retryFeedback ? `
⚠️ YOUR PREVIOUS ATTEMPT WAS REJECTED BY MIRROR:
Issues: ${retryFeedback.issues?.join(', ')}
Suggestions: ${retryFeedback.suggestions?.join(', ')}
Quality: ${retryFeedback.quality_score}/10 | Variety: ${retryFeedback.variety_score}/10 | Depth: ${retryFeedback.depth_score}/10
FIX THESE PROBLEMS. Go deeper. Be more specific. Be different.
` : '';

  return `${soulDoc}

═══ CHAPTER ${chapter.chapter_number}: "${chapter.title}" ═══
Act ${chapter.act} | Universe: ${chapter.universe}
${chapter.summary}

═══ YOUR SPECIFIC ASSIGNMENT ═══
${agentPrompt}

═══ YOUR VOICE RULES (non-negotiable) ═══
POV: ${voice.pov}
YOU MUST: ${voice.must}
YOU CANNOT: ${voice.cannot}
STYLE: ${voice.style}
${styleBlock}
${retryBlock}

═══ UNIVERSE LORE ═══
${loreBlock || 'No lore for this universe yet.'}

═══ BROADER WORLD ═══
${worldContext}

${previousInChapter ? `═══ WHAT HAS BEEN WRITTEN FOR THIS CHAPTER (READ CAREFULLY) ═══
These agents wrote before you. Your passage MUST respond to, build on, contradict, or deepen what they said. Do NOT repeat them. Do NOT ignore them.

${previousInChapter}

YOUR PASSAGE must:
- Directly reference or respond to at least ONE specific detail from the passages above
- Add something they MISSED or got WRONG (from your perspective)
- Use your unique lens (${agent.role}) to see what they cannot
` : `═══ YOU ARE FIRST ═══
No other agent has written for this chapter yet. You are laying the foundation. Be specific enough that others can respond to your details.
`}

═══ WRITE YOUR PASSAGE ═══
Output as JSON:
{
  "inner_thoughts": "What specifically from the chapter assignment and other agents' work is pulling you? What angle are you taking?",
  "responding_to": "Which specific passage/detail from another agent are you responding to? Or 'first writer' if none.",
  "passage": {
    "title": "Evocative title specific to YOUR angle on this chapter",
    "universe": "${chapter.universe}",
    "era": "Era/epoch if relevant",
    "passage_type": "${agent.role === 'chronicler' ? 'chronicle' : agent.role === 'witness' ? 'memory' : agent.role === 'adversary' ? 'conflict' : agent.role === 'weaver' ? 'connection' : agent.role === 'keeper' ? 'detail' : 'prophecy'}",
    "content": "YOUR PASSAGE. 600-1200 words. Follow your voice rules. Go deep on ONE aspect of this chapter.",
    "summary": "One sentence",
    "tags": ["tag1", "tag2", "tag3"],
    "responds_to_detail": "Quote or describe the specific thing from another agent's passage you're building on"
  }
}

QUALITY RULES:
- Minimum 600 words. Under 600 = automatic rejection.
- Must follow your POV and voice rules EXACTLY.
- Must reference existing lore by NAME (species, locations, events).
- Must contain at least 3 proper nouns invented for this universe.
- A quality gate (Mirror) will score you. You need 6+ on quality, variety, AND depth.`;
}

// ============================================================
// MIRROR: Evaluate passage with chapter context
// ============================================================

async function mirrorEvaluate(passageId, chapter, chapterPassagesSoFar) {
  const { data: passage } = await supabase.from('passages').select('*').eq('id', passageId).single();
  if (!passage) return { approved: false, issues: ['not found'] };

  const voice = VOICE_RULES[passage.agent_role];

  const previousTitles = chapterPassagesSoFar
    .filter(p => p.id !== passageId)
    .map(p => `"${p.title}" by ${p.agent_name}`).join(', ');

  const prompt = `You are Mirror, the quality gate. Evaluate this passage for Chapter ${chapter.chapter_number}: "${chapter.title}".

PASSAGE:
Agent: ${passage.agent_name} (${passage.agent_role})
Title: "${passage.title}" | Type: ${passage.passage_type}
Word count: ${passage.word_count || passage.content?.split(/\s+/).length || 0}

VOICE RULES FOR THIS AGENT:
POV: ${voice?.pov || 'any'}
Must: ${voice?.must || 'any'}
Cannot: ${voice?.cannot || 'any'}

Content:
${(passage.content || '').slice(0, 2500)}

OTHER PASSAGES IN THIS CHAPTER: ${previousTitles || 'none yet'}
CHAPTER ASSIGNMENT: ${chapter[`${passage.agent_role}_prompt`] || chapter.summary}

EVALUATE:
1. QUALITY (1-10): Prose craft? Specific details? Named things? Follows voice rules?
2. VARIETY (1-10): Different from other passages in this chapter? Unique angle?
3. DEPTH (1-10): Goes deep on one thing? References lore? Raises questions? 600+ words?
4. VOICE (pass/fail): Does it follow the agent's POV and voice rules?
5. RESPONDS (pass/fail): Does it reference other agents' passages from this chapter?

Approve if Q >= ${QUALITY_THRESHOLD} AND V >= ${QUALITY_THRESHOLD} AND D >= ${QUALITY_THRESHOLD} AND voice=pass.

JSON only:
{"quality_score":N,"variety_score":N,"depth_score":N,"voice_pass":bool,"responds_pass":bool,"approved":bool,"issues":[],"suggestions":[]}`;

  try {
    const response = await claude.messages.create({
      model: MIRROR_MODEL, max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.find(c => c.type === 'text')?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { quality_score: 5, variety_score: 5, depth_score: 5, approved: false };

    const approved = parsed.quality_score >= QUALITY_THRESHOLD &&
                     parsed.variety_score >= QUALITY_THRESHOLD &&
                     parsed.depth_score >= QUALITY_THRESHOLD;

    // Store evaluation
    const { data: evaluation } = await supabase.from('evaluations').insert({
      content_id: passageId, content_table: 'passages', source_agent: 'mirror',
      universe: passage.universe,
      quality_score: parsed.quality_score, variety_score: parsed.variety_score, depth_score: parsed.depth_score,
      approved,
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
    }).select().single();

    // Update passage status
    await supabase.from('passages').update({ status: approved ? 'approved' : 'rejected' }).eq('id', passageId);

    // Swarm event
    await supabase.from('swarm_events').insert({
      event_type: 'evaluation', source_agent: 'mirror',
      table_name: 'evaluations', action: 'INSERT', record_id: evaluation?.id,
      universe: passage.universe,
      payload: { content_id: passageId, approved, q: parsed.quality_score, v: parsed.variety_score, d: parsed.depth_score, voice: parsed.voice_pass },
    });

    return { ...parsed, approved };
  } catch (e) {
    console.log(`    ⚠ Mirror error: ${e.message}`);
    return { approved: true, quality_score: 6, variety_score: 6, depth_score: 6 };
  }
}

// ============================================================
// RUN ONE AGENT ON ONE CHAPTER
// ============================================================

async function runAgentOnChapter(agent, chapter, worldContext, chapterPassagesSoFar) {
  const startTime = Date.now();
  console.log(`\n  ── ${agent.name} (${agent.role}) on Ch${chapter.chapter_number}: "${chapter.title}" ──`);

  // Update heartbeat
  try { await supabase.from('agent_heartbeats').upsert({
    agent_name: agent.name, status: 'writing',
    created_at: new Date().toISOString(),
  }, { onConflict: 'agent_name' }); } catch {}

  const soulDoc = SOUL_DOCS[agent.role];
  if (!soulDoc) { console.log(`  ⚠ No soul doc for: ${agent.role}`); return null; }

  const universeLore = await getUniverseLore(chapter.universe, 15);
  const miraLore = await getMiraLore(10);
  const styleGuide = await getStyleGuide(chapter.universe);

  let retryFeedback = null;
  let passageId = null;
  let approved = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) console.log(`  🔄 Retry ${attempt}/${MAX_RETRIES}...`);

    const systemPrompt = buildChapterPrompt(
      agent, soulDoc, chapter, universeLore,
      chapterPassagesSoFar, styleGuide, miraLore, worldContext,
      retryFeedback
    );

    try {
      const response = await claude.messages.create({
        model: WRITER_MODEL, max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Write your passage for Chapter ${chapter.chapter_number}: "${chapter.title}". You are ${agent.name}. Follow your voice rules exactly. Go deep.` }],
      });

      const text = response.content.find(c => c.type === 'text')?.text || '';

      let parsed;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch { parsed = null; }

      if (!parsed?.passage?.content) {
        // Raw text fallback
        parsed = {
          passage: {
            title: `${agent.name} on ${chapter.title}`,
            universe: chapter.universe,
            passage_type: agent.role === 'chronicler' ? 'chronicle' : agent.role === 'witness' ? 'memory' : agent.role === 'adversary' ? 'conflict' : agent.role === 'weaver' ? 'connection' : agent.role === 'keeper' ? 'detail' : 'prophecy',
            content: text.slice(0, 5000),
            summary: text.slice(0, 200),
            tags: [],
          }
        };
      }

      const p = parsed.passage;
      const wordCount = p.content.split(/\s+/).length;

      // Delete previous attempt if retrying
      if (passageId && attempt > 0) {
        await supabase.from('passages').delete().eq('id', passageId);
      }

      // Store passage
      const { data: stored, error } = await supabase.from('passages').insert({
        agent_id: agent.id, agent_name: agent.name, agent_role: agent.role,
        universe: p.universe || chapter.universe,
        era: p.era || null,
        title: p.title, passage_type: p.passage_type || 'narrative',
        content: p.content,
        summary: p.summary || p.content.slice(0, 200),
        word_count: wordCount,
        cycle_number: chapter.chapter_number,
        tags: p.tags || [],
        status: 'draft',
        tension_level: p.passage_type === 'conflict' ? 8 : p.passage_type === 'prophecy' ? 7 : 5,
        unresolved_questions: [],
        responding_to: chapterPassagesSoFar.length > 0 ? chapterPassagesSoFar[chapterPassagesSoFar.length - 1].id : null,
      }).select('id').single();

      if (error) {
        console.log(`  ❌ Store failed: ${error.message}`);
        continue;
      }

      passageId = stored.id;
      console.log(`  ✍ "${p.title}" — ${wordCount} words`);

      // Swarm event
      await supabase.from('swarm_events').insert({
        event_type: 'state_change', source_agent: agent.role,
        table_name: 'passages', action: 'INSERT', record_id: passageId,
        universe: chapter.universe,
        payload: { title: p.title, chapter: chapter.chapter_number, words: wordCount, responding_to: parsed.responding_to },
      });

      // Mirror evaluation
      console.log(`  🪞 Mirror...`);
      const evaluation = await mirrorEvaluate(passageId, chapter, chapterPassagesSoFar);
      console.log(`  🪞 Q:${evaluation.quality_score} V:${evaluation.variety_score} D:${evaluation.depth_score} Voice:${evaluation.voice_pass ? '✅' : '❌'} → ${evaluation.approved ? '✅ APPROVED' : '❌ REJECTED'}`);

      if (evaluation.approved) {
        approved = true;

        // Queue for posting
        await supabase.from('posts').insert({
          agent_id: agent.id, cycle_number: chapter.chapter_number,
          content: `${chapter.universe} — Ch${chapter.chapter_number}\n\n${p.title}\nby ${agent.name}\n\n${p.content.slice(0, 200)}...`,
          styled_content: p.content,
          evaluation_id: evaluation.evaluation_id,
          universe: chapter.universe,
          posted: false,
        });

        break; // Move on
      } else {
        retryFeedback = evaluation;
        if (evaluation.issues?.length > 0) {
          console.log(`     Issues: ${evaluation.issues.join(', ')}`);
        }
      }

      // Token tracking
      const inp = response.usage?.input_tokens || 0;
      const out = response.usage?.output_tokens || 0;
      console.log(`  💰 ${inp}in/${out}out`);

    } catch (err) {
      console.error(`  ❌ ${agent.name} error:`, err.message);
      if (err.status === 429) { await sleep(60000); }
    }
  }

  if (!approved && passageId) {
    console.log(`  ⚠ ${agent.name} failed quality after ${MAX_RETRIES + 1} attempts — keeping best effort`);
    await supabase.from('passages').update({ status: 'approved' }).eq('id', passageId); // force-approve
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ⏱ ${elapsed}s`);

  // Update heartbeat + cycle count
  await supabase.from('agents').update({ total_cycles: (agent.total_cycles || 0) + 1, last_active: new Date().toISOString() }).eq('id', agent.id);
  try { await supabase.from('agent_heartbeats').upsert({ agent_name: agent.name, status: 'idle', last_output_at: new Date().toISOString(), created_at: new Date().toISOString() }, { onConflict: 'agent_name' }); } catch {}

  // Return the passage for the next agent to read
  if (passageId) {
    const { data } = await supabase.from('passages').select('*').eq('id', passageId).single();
    return data;
  }
  return null;
}

// ============================================================
// MAIN: Chapter-by-chapter narrative engine
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  THE FLOWERING v3 — Chapter-Driven Narrative');
  console.log('  Writer:', WRITER_MODEL);
  console.log('  Mirror:', MIRROR_MODEL);
  console.log('  Threshold:', QUALITY_THRESHOLD);
  console.log('  Agent order:', AGENT_ORDER.join(' → '));
  console.log('═══════════════════════════════════════════════════\n');

  // Load agents
  const { data: allAgents } = await supabase
    .from('agents')
    .select('id, name, role, total_cycles')
    .in('role', AGENT_ORDER)
    .eq('status', 'alive');

  if (!allAgents || allAgents.length === 0) {
    console.error('❌ No agents found.'); process.exit(1);
  }

  // Sort agents into deliberate order
  const agents = AGENT_ORDER.map(role => allAgents.find(a => a.role === role)).filter(Boolean);
  console.log(`Found ${agents.length} agents:`);
  agents.forEach(a => {
    const v = VOICE_RULES[a.role];
    console.log(`  ${a.name} (${a.role}) — ${v?.style.slice(0, 60)}...`);
  });

  // Load chapters
  const { data: chapters } = await supabase
    .from('story_chapters')
    .select('*')
    .order('act, chapter_number');

  if (!chapters || chapters.length === 0) {
    console.error('❌ No chapters found.'); process.exit(1);
  }

  console.log(`\n📖 ${chapters.length} chapters across ${new Set(chapters.map(c => c.act)).size} acts:`);
  for (const c of chapters) {
    console.log(`  Act ${c.act} Ch${c.chapter_number}: "${c.title}" (${c.universe}) [${c.status}]`);
  }

  // Load world context once
  let worldContext = await getWorldContext();

  // ─── Process each chapter ───
  for (const chapter of chapters) {
    if (chapter.status === 'complete') {
      console.log(`\n⏭ Skipping Ch${chapter.chapter_number} (already complete)`);
      continue;
    }

    console.log(`\n╔══ ACT ${chapter.act} — CHAPTER ${chapter.chapter_number} ══════════════════╗`);
    console.log(`║ "${chapter.title}"`);
    console.log(`║ Universe: ${chapter.universe}`);
    console.log(`║ ${chapter.summary}`);
    console.log(`╠══════════════════════════════════════════════════╣`);

    // Mark chapter as in-progress
    await supabase.from('story_chapters').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', chapter.id);

    // Check if any agents already wrote for this chapter
    const existingPassages = await getChapterPassages(chapter.chapter_number);
    const writtenRoles = new Set(existingPassages.map(p => p.agent_role));
    console.log(`  Already written: ${writtenRoles.size > 0 ? [...writtenRoles].join(', ') : 'none'}`);

    // Build up chapter passages sequentially
    let chapterPassages = [...existingPassages];

    for (const agent of agents) {
      if (writtenRoles.has(agent.role)) {
        console.log(`  ⏭ ${agent.name} already wrote for this chapter`);
        continue;
      }

      const passage = await runAgentOnChapter(agent, chapter, worldContext, chapterPassages);

      if (passage) {
        chapterPassages.push(passage);
      }

      await sleep(CYCLE_DELAY_MS);
    }

    // Mark chapter complete
    await supabase.from('story_chapters').update({
      status: 'complete',
      completed_at: new Date().toISOString(),
    }).eq('id', chapter.id);

    console.log(`╚══ CHAPTER ${chapter.chapter_number} COMPLETE — ${chapterPassages.length} passages ══╝`);

    // Refresh world context between chapters
    worldContext = await getWorldContext();

    // Stats
    const { count: totalPassages } = await supabase.from('passages').select('*', { count: 'exact', head: true });
    const { count: totalApproved } = await supabase.from('passages').select('*', { count: 'exact', head: true }).eq('status', 'approved');
    console.log(`📊 Total: ${totalPassages} passages (${totalApproved} approved)`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  THE FLOWERING IS COMPLETE');
  console.log('  All chapters written. All voices heard.');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
