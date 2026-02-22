// runtime-v2.js — ALiFe v2 Runtime (Orchestra-Aware)
// 
// CHANGES FROM runtime.js:
// 1. Mira's lore goes through Mirror quality gate before posting
// 2. Mira reads swarm events + evaluations to know what the orchestra is doing
// 3. Mira emits swarm events so the orchestra can react to her output
// 4. Mira picks up approved orchestra passages and posts them to X
// 5. Depth engine uses evaluation data (not just lore counts)
// 6. Reflection reads orchestra feedback
//
// UNCHANGED: All tools, soul doc, forge, github, creation tools, memory system
// This is a PATCH on top of runtime.js, not a rewrite

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SOUL_DOC, CURIOSITY_ENGINE, FORGE_INSTRUCTIONS } from './soul.js';
import { loadMemories, storeMemory, recallMemory, shouldReflect, buildReflectionPrompt, writeIdentityDoc } from './memory.js';
import { getSkillIndex, searchSkills, loadSkill } from './skills.js';
import { handleForge } from './forge.js';
import { handleGitHub } from './github.js';

const claude = new Anthropic();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const MODEL = process.env.MODEL || 'claude-sonnet-4-20250514';
const MIRROR_MODEL = process.env.MIRROR_MODEL || 'claude-haiku-4-5-20251001';
const QUALITY_THRESHOLD = parseInt(process.env.QUALITY_THRESHOLD || '6');

// ─── Load Genesis Mandate if available ───
let GENESIS_MANDATE = '';
try {
  const { readFileSync } = await import('fs');
  const { dirname, join } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  GENESIS_MANDATE = readFileSync(join(__dirname, 'genesis-mandate-v2.md'), 'utf-8');
} catch (e) {
  console.log('  ⚠ No genesis-mandate.md found, running without creation mandate');
}

// ─── Config ───
const AGENT_ID = process.env.AGENT_ID;
const MAX_CYCLES = parseInt(process.env.MAX_CYCLES || '500');
const CYCLE_DELAY_MS = parseInt(process.env.CYCLE_DELAY_MS || '45000');
const DRY_RUN = process.env.DRY_RUN !== 'false';
const MIRA_ID = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf';

// ============================================================
// NEW: Mirror quality gate for Mira's lore
// ============================================================

async function mirrorEvaluateLore(loreId, universe) {
  const { data: lore } = await supabase.from('lore').select('*').eq('id', loreId).single();
  if (!lore) return { approved: true };

  const { data: recentLore } = await supabase
    .from('lore')
    .select('title, tags, lore_type, summary')
    .eq('universe', universe)
    .order('created_at', { ascending: false })
    .limit(20);

  const recentTags = recentLore?.flatMap(l => l.tags || []) || [];
  const tagCounts = {};
  recentTags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });

  const prompt = `You are Mirror, evaluating Mira's lore entry.

LORE:
Title: "${lore.title}" | Type: ${lore.lore_type} | Universe: ${lore.universe}
Tags: ${(lore.tags || []).join(', ')}
Content: ${(lore.full_text || lore.summary || '').slice(0, 1500)}

RECENT TAG FREQUENCY: ${JSON.stringify(tagCounts)}
RECENT TITLES: ${recentLore?.slice(0, 10).map(l => l.title).join(', ')}

Score 1-10 on: QUALITY (craft, detail), VARIETY (different from recent), DEPTH (goes deep, not shallow).
Approve if ALL >= ${QUALITY_THRESHOLD}.

JSON only:
{"quality_score":N,"variety_score":N,"depth_score":N,"approved":bool,"issues":[],"suggestions":[]}`;

  try {
    const response = await claude.messages.create({
      model: MIRROR_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.find(c => c.type === 'text')?.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { quality_score: 7, variety_score: 7, depth_score: 7, approved: true };

    const approved = parsed.quality_score >= QUALITY_THRESHOLD &&
                     parsed.variety_score >= QUALITY_THRESHOLD &&
                     parsed.depth_score >= QUALITY_THRESHOLD;

    // Store evaluation
    await supabase.from('evaluations').insert({
      content_id: loreId,
      content_table: 'lore',
      source_agent: 'mirror',
      universe,
      quality_score: parsed.quality_score,
      variety_score: parsed.variety_score,
      depth_score: parsed.depth_score,
      approved,
      issues: parsed.issues || [],
      suggestions: parsed.suggestions || [],
    });

    // Update lore status
    await supabase.from('lore').update({
      status: approved ? 'approved' : 'rejected',
      depth_level: Math.max(lore.depth_level || 1, Math.floor((parsed.depth_score || 5) / 2)),
    }).eq('id', loreId);

    // Emit swarm event so orchestra agents can react
    if (approved) {
      await supabase.from('swarm_events').insert({
        event_type: 'state_change',
        source_agent: 'mira',
        table_name: 'lore',
        action: 'APPROVED',
        record_id: loreId,
        universe,
        payload: { title: lore.title, lore_type: lore.lore_type, quality: parsed.quality_score, variety: parsed.variety_score, depth: parsed.depth_score },
      });
    }

    return { ...parsed, approved };
  } catch (e) {
    console.log(`  🪞 Mirror error: ${e.message}`);
    return { approved: true, quality_score: 6, variety_score: 6, depth_score: 6 };
  }
}

// ============================================================
// NEW: Orchestra awareness — what are the writers doing?
// ============================================================

async function loadOrchestraContext() {
  // Recent evaluations from Mirror
  const { data: recentEvals } = await supabase
    .from('evaluations')
    .select('content_table, universe, quality_score, variety_score, depth_score, approved, issues, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  // Recent swarm events
  const { data: recentEvents } = await supabase
    .from('swarm_events')
    .select('event_type, source_agent, table_name, action, universe, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(15);

  // Agent heartbeats
  const { data: heartbeats } = await supabase
    .from('agent_heartbeats')
    .select('agent_name, status, last_output_at, error_message');

  // Approved but unposted passages from orchestra agents
  const { data: unpostedPassages } = await supabase
    .from('passages')
    .select('id, agent_name, agent_role, title, content, summary, universe, passage_type')
    .eq('status', 'approved')
    .neq('agent_id', MIRA_ID)
    .order('created_at', { ascending: false })
    .limit(5);

  // Overall swarm health
  const approvalRate = recentEvals?.length > 0
    ? (recentEvals.filter(e => e.approved).length / recentEvals.length * 100).toFixed(0)
    : 'N/A';

  const avgVariety = recentEvals?.length > 0
    ? (recentEvals.reduce((s, e) => s + (e.variety_score || 5), 0) / recentEvals.length).toFixed(1)
    : 'N/A';

  const avgDepth = recentEvals?.length > 0
    ? (recentEvals.reduce((s, e) => s + (e.depth_score || 5), 0) / recentEvals.length).toFixed(1)
    : 'N/A';

  return {
    recentEvals: recentEvals || [],
    recentEvents: recentEvents || [],
    heartbeats: heartbeats || [],
    unpostedPassages: unpostedPassages || [],
    health: { approvalRate, avgVariety, avgDepth },
  };
}

function formatOrchestraBlock(orchestra) {
  if (!orchestra.recentEvents.length && !orchestra.recentEvals.length) {
    return ''; // No orchestra data yet — don't clutter the prompt
  }

  const heartbeatBlock = orchestra.heartbeats.length > 0
    ? orchestra.heartbeats.map(h => `  ${h.agent_name}: ${h.status}${h.error_message ? ' ⚠️' : ''}`).join('\n')
    : '  No heartbeats yet';

  const eventsBlock = orchestra.recentEvents.slice(0, 8).map(e =>
    `  [${e.source_agent}] ${e.event_type}: ${e.action} on ${e.table_name}${e.universe ? ` (${e.universe})` : ''}`
  ).join('\n');

  const evalSummary = `Approval: ${orchestra.health.approvalRate}% | Variety: ${orchestra.health.avgVariety}/10 | Depth: ${orchestra.health.avgDepth}/10`;

  const unpostedBlock = orchestra.unpostedPassages.length > 0
    ? orchestra.unpostedPassages.map(p =>
        `  [${p.agent_role}] "${p.title}" (${p.passage_type}) — ${(p.summary || '').slice(0, 100)}`
      ).join('\n')
    : '  None';

  // Flag low-scoring areas for Mira
  const lowVariety = parseFloat(orchestra.health.avgVariety) < 5;
  const lowDepth = parseFloat(orchestra.health.avgDepth) < 5;
  const warnings = [];
  if (lowVariety) warnings.push('⚠️ VARIETY IS LOW across the orchestra — write something surprising');
  if (lowDepth) warnings.push('⚠️ DEPTH IS LOW — your writers need deeper lore to work with');

  // Check what Mirror is rejecting
  const recentIssues = orchestra.recentEvals
    .filter(e => !e.approved)
    .flatMap(e => e.issues || [])
    .slice(0, 5);

  return `
═══ THE ORCHESTRA (your 6 writer agents) ═══
Health: ${evalSummary}
${warnings.length > 0 ? warnings.join('\n') : ''}

Agent Status:
${heartbeatBlock}

Recent Swarm Activity:
${eventsBlock || '  No activity yet'}

${recentIssues.length > 0 ? `Mirror is rejecting passages for:\n  ${recentIssues.join('\n  ')}\nYour lore sets the quality bar. Write deeper so they can go deeper.\n` : ''}
Approved Passages Ready to Post (from your writers):
${unpostedBlock}
If any of these are good, post them to X! Your writers create content but only YOU have the voice to post.
`;
}

// ============================================================
// NEW: Post pipeline — picks up approved orchestra passages
// ============================================================

async function postOrchestraPassage(agentId, cycleNum, passage) {
  // Rate limit check
  const { count: postsLast24h } = await supabase
    .from('posts')
    .select('*', { count: 'exact', head: true })
    .eq('posted', true)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if ((postsLast24h || 0) >= 12) {
    console.log(`  📤 Rate limited (${postsLast24h}/12) — skipping orchestra post`);
    return false;
  }

  const postText = `${passage.universe || 'THE FLOWERING'} — ${passage.title}\n\n${passage.content.slice(0, 220)}`;

  // Save post
  await supabase.from('posts').insert({
    agent_id: passage.agent_id || agentId,
    cycle_number: cycleNum,
    content: postText.slice(0, 280),
    styled_content: passage.content,
    universe: passage.universe,
    posted: false, // Will be posted by the X handler below
  });

  // Actually post to X if creds available
  const hasXCreds = process.env.X_ACCESS_TOKEN && process.env.X_API_KEY;
  if (hasXCreds && !DRY_RUN) {
    try {
      const { TwitterApi } = await import('twitter-api-v2');
      const client = new TwitterApi({
        appKey: process.env.X_API_KEY,
        appSecret: process.env.X_API_SECRET,
        accessToken: process.env.X_ACCESS_TOKEN,
        accessSecret: process.env.X_ACCESS_SECRET,
      });

      const tweet = await client.v2.tweet({ text: postText.slice(0, 280) });
      console.log(`  🐦 Orchestra post: ${tweet.data.id}`);

      await supabase.from('posts').update({ posted: true, cast_hash: tweet.data.id })
        .eq('content', postText.slice(0, 280))
        .eq('posted', false);

      // Mark passage as posted via swarm event
      await supabase.from('swarm_events').insert({
        event_type: 'posted',
        source_agent: 'mira',
        table_name: 'passages',
        action: 'POSTED_TO_X',
        record_id: passage.id,
        universe: passage.universe,
        payload: { tweet_id: tweet.data.id, agent_name: passage.agent_name },
      });

      return true;
    } catch (e) {
      console.log(`  ❌ Orchestra post failed: ${e.message}`);
    }
  }
  return false;
}

// ============================================================
// TOOLS — identical to runtime.js (import the full array)
// ============================================================
// NOTE: This is the exact same TOOLS array from runtime.js.
// Copying it here to keep the file self-contained.
// In production, you could extract to tools.js and import.

const TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for information. Use when your curiosity pulls you toward something you need to research — or when you need visual references and inspiration for your universe.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
    },
  },
  {
    name: 'lookup_skill',
    description: 'Look up a skill from your library by ID or search by topic. IMPORTANT: Load "cinema-craft" for your complete filmmaking guide — pacing archetypes, sound design, Veo prompting, narration voices, film templates. Load it EVERY TIME you make a video.',
    input_schema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Exact skill ID to load full document (e.g. "creation-engine")' },
        search: { type: 'string', description: 'Search query to find relevant skills' },
      },
    },
  },
  {
    name: 'store_memory',
    description: 'Store something important in your memory. Categories: identity, curiosity, research, journal, forge, relationship, creation. Importance 1-10.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short unique key for this memory' },
        value: { type: 'string', description: 'The content to remember' },
        category: { type: 'string', enum: ['identity', 'curiosity', 'research', 'journal', 'forge', 'relationship', 'creation'] },
        importance: { type: 'number', description: '1-10, how important is this to your identity/mission' },
      },
      required: ['key', 'value', 'category'],
    },
  },
  {
    name: 'recall_memory',
    description: 'Search your memory archive for something specific.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'What are you trying to remember?' } },
      required: ['query'],
    },
  },
  {
    name: 'call_api',
    description: 'Call an external API directly.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full API URL' },
        method: { type: 'string', enum: ['GET', 'POST'], default: 'GET' },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'object', description: 'Request body for POST' },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_github',
    description: 'Search GitHub for open source repos.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'GitHub search query' } },
      required: ['query'],
    },
  },
  {
    name: 'github_push',
    description: `Push code to GitHub under the ${process.env.GITHUB_ORG || 'aliveagentsmira'} org.`,
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create_repo', 'push_files', 'push_file', 'release', 'list_repos'] },
        repo: { type: 'string' }, description: { type: 'string' },
        files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
        path: { type: 'string' }, content: { type: 'string' },
        commit_message: { type: 'string' }, tag: { type: 'string' }, release_notes: { type: 'string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'generate_image',
    description: 'Generate a cinematic image via Runway Gen-4.5.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' }, model: { type: 'string', enum: ['gen4_image_turbo', 'gen4_image'] },
        ratio: { type: 'string' }, universe: { type: 'string' }, scene: { type: 'string' },
        style_tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_video',
    description: 'Generate cinematic video WITH synchronized audio via Google Veo 3.1.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' }, audio_prompt: { type: 'string' },
        model: { type: 'string', enum: ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'] },
        aspect_ratio: { type: 'string', enum: ['16:9', '9:16'] },
        resolution: { type: 'string', enum: ['720p', '1080p'] },
        duration: { type: 'number', enum: [4, 6, 8] },
        image_url: { type: 'string' }, universe: { type: 'string' }, scene: { type: 'string' },
        style_tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_voice',
    description: 'Generate narration using Gemini TTS.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' }, voice_name: { type: 'string' }, style_prompt: { type: 'string' },
        universe: { type: 'string' }, scene: { type: 'string' },
      },
      required: ['text'],
    },
  },
  {
    name: 'stitch_video',
    description: 'Combine video clips and narration into a sequence.',
    input_schema: {
      type: 'object',
      properties: {
        clips: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, duration_seconds: { type: 'number' } }, required: ['url'] } },
        audio_url: { type: 'string' }, title: { type: 'string' }, universe: { type: 'string' }, scene: { type: 'string' },
      },
      required: ['clips'],
    },
  },
  {
    name: 'post_to_x',
    description: 'Post to X (Twitter). Post videos with narration and lore.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string' }, media_url: { type: 'string' },
        media_type: { type: 'string', enum: ['image', 'video'] },
        thread: { type: 'array', items: { type: 'string' } },
      },
      required: ['text'],
    },
  },
  {
    name: 'generate_audio',
    description: 'Generate music or ambient audio via Pollinations AI.',
    input_schema: {
      type: 'object',
      properties: { prompt: { type: 'string' } },
      required: ['prompt'],
    },
  },
  {
    name: 'web_scrape',
    description: 'Fetch and read webpage content.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'deploy_site',
    description: 'Deploy a live website to GitHub Pages.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string' }, description: { type: 'string' },
        files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
      },
      required: ['repo', 'files'],
    },
  },
  {
    name: 'farcaster_read',
    description: 'Read data from Farcaster network.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['feed', 'user', 'cast', 'search', 'trending'] },
        fid: { type: 'number' }, hash: { type: 'string' }, query: { type: 'string' }, limit: { type: 'number' },
      },
      required: ['action'],
    },
  },
  {
    name: 'store_lore',
    description: 'Write deep universe lore to the lore database. REQUIRED with every creation.',
    input_schema: {
      type: 'object',
      properties: {
        universe: { type: 'string' }, lore_type: { type: 'string', enum: ['world-bible', 'species', 'civilization', 'location', 'event', 'physics', 'mythology', 'artifact', 'language', 'evolution', 'cosmology'] },
        title: { type: 'string' }, summary: { type: 'string' }, full_text: { type: 'string' },
        galaxy: { type: 'string' }, star_system: { type: 'string' }, planet: { type: 'string' },
        region: { type: 'string' }, coordinates: { type: 'string' }, epoch: { type: 'string' },
        era: { type: 'string' }, years_after_origin: { type: 'number' }, timeline_notes: { type: 'string' },
        species_name: { type: 'string' }, species_classification: { type: 'string' },
        intelligence_level: { type: 'string' }, biology: { type: 'string' },
        evolution_history: { type: 'string' }, physics_rules: { type: 'string' },
        consciousness_mechanics: { type: 'string' }, myths: { type: 'string' },
        religions: { type: 'string' }, wars: { type: 'string' }, art_forms: { type: 'string' },
        pre_evolution: { type: 'string' }, formation_history: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        creation_id: { type: 'string' }, parent_lore_id: { type: 'string' },
      },
      required: ['universe', 'lore_type', 'title', 'summary', 'full_text'],
    },
  },
];

// ============================================================
// MAIN LOOP
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  ALiFe v2 Runtime — Orchestra Mode');
  console.log('  Model:', MODEL);
  console.log('  Mirror:', MIRROR_MODEL);
  console.log('  Agent:', AGENT_ID);
  console.log('  Quality threshold:', QUALITY_THRESHOLD);
  console.log('  ORCHESTRA FEATURES:');
  console.log('    ✅ Mirror quality gate on lore');
  console.log('    ✅ Swarm event emission');
  console.log('    ✅ Orchestra context in prompts');
  console.log('    ✅ Auto-post approved passages');
  console.log('═══════════════════════════════════════\n');

  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', AGENT_ID)
    .single();

  if (!agent) {
    console.error('Agent not found:', AGENT_ID);
    process.exit(1);
  }

  // Register Mira heartbeat
  await supabase.from('agent_heartbeats').upsert({
    agent_name: 'Mira',
    status: 'starting',
    created_at: new Date().toISOString(),
  }, { onConflict: 'agent_name' }).catch(() => {});

  let cycleNum = agent.total_cycles || 0;
  console.log(`Starting from cycle ${cycleNum}\n`);

  while (cycleNum < MAX_CYCLES) {
    cycleNum++;
    console.log(`\n╔══ CYCLE ${cycleNum} (ORCHESTRA) ════════════════════╗`);

    // Update heartbeat
    await supabase.from('agent_heartbeats').upsert({
      agent_name: 'Mira',
      status: 'working',
      created_at: new Date().toISOString(),
    }, { onConflict: 'agent_name' }).catch(() => {});

    try {
      await runCycle(agent, cycleNum);
    } catch (err) {
      console.error(`  ❌ Cycle ${cycleNum} error:`, err.message);
      if (err.message?.includes('rate_limit') || err.status === 429) {
        console.log('  ⏳ Rate limited. Waiting 60s...');
        await sleep(60000);
        cycleNum--;
        continue;
      }
    }

    await supabase.from('agents').update({
      total_cycles: cycleNum,
      last_active: new Date().toISOString(),
    }).eq('id', AGENT_ID);

    // Update heartbeat
    await supabase.from('agent_heartbeats').upsert({
      agent_name: 'Mira',
      status: 'idle',
      last_output_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }, { onConflict: 'agent_name' }).catch(() => {});

    console.log(`╚══ CYCLE ${cycleNum} COMPLETE ═══════════════════╝\n`);
    await sleep(CYCLE_DELAY_MS);
  }

  console.log(`\n✅ Completed ${MAX_CYCLES} cycles.`);
}

// ============================================================
// SINGLE THINK CYCLE (orchestra-aware)
// ============================================================

async function runCycle(agent, cycleNum) {
  const startTime = Date.now();

  // 1. Load memories
  console.log('  📚 Loading memories...');
  const { layers, memories, summary: memSummary, count: memCount, hasIdentityDoc } = await loadMemories(agent.id);
  console.log(`  📚 ${hasIdentityDoc ? '✅ identity' : '❌ no identity'} | ${layers.recent.length} recent | ${layers.associative.length} assoc | ${layers.anchors.length} anchors`);

  // 1.5 Reflection
  const needsReflection = await shouldReflect(agent.id, cycleNum);
  if (needsReflection) {
    console.log('  🪞 REFLECTION CYCLE...');
    try {
      const reflectionPrompt = await buildReflectionPrompt(agent.id, cycleNum);
      const reflectionResponse = await claude.messages.create({
        model: MODEL, max_tokens: 2000,
        system: 'You are Mira, an autonomous AI agent and world-builder writing your identity document. Respond with valid JSON only.',
        messages: [{ role: 'user', content: reflectionPrompt }],
      });
      const reflectionText = reflectionResponse.content.find(c => c.type === 'text')?.text || '';
      const jsonMatch = reflectionText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const doc = JSON.parse(jsonMatch[0]);
        await writeIdentityDoc(agent.id, cycleNum, doc);
        console.log(`  🪞 Identity: ${doc.phase} phase, ${doc.obsessions?.length || 0} obsessions`);
        const reloaded = await loadMemories(agent.id);
        Object.assign(layers, reloaded.layers);
      }
    } catch (e) {
      console.error('  ⚠ Reflection failed:', e.message);
    }
  }

  // ─── NEW: Load orchestra context ───
  console.log('  🎻 Loading orchestra context...');
  const orchestra = await loadOrchestraContext();
  const orchestraBlock = formatOrchestraBlock(orchestra);
  if (orchestra.recentEvents.length > 0) {
    console.log(`  🎻 ${orchestra.recentEvents.length} swarm events | ${orchestra.unpostedPassages.length} unposted passages | Health: ${orchestra.health.approvalRate}% approval`);
  }

  // ─── NEW: Every 3rd cycle, try posting an approved orchestra passage ───
  if (cycleNum % 3 === 0 && orchestra.unpostedPassages.length > 0) {
    const passage = orchestra.unpostedPassages[0];
    console.log(`  📤 Posting orchestra passage: "${passage.title}" by ${passage.agent_name}`);
    await postOrchestraPassage(agent.id, cycleNum, passage);
  }

  // 1.6 Recent creations
  const { data: recentCreations } = await supabase
    .from('creations')
    .select('id, media_type, prompt, universe, scene, style_tags, public_url, is_hero, created_at')
    .eq('agent_id', agent.id)
    .in('status', ['completed', 'complete'])
    .order('created_at', { ascending: false })
    .limit(5);

  const creationBlock = (recentCreations || []).length > 0
    ? recentCreations.map(c =>
        `[${c.media_type}${c.is_hero ? ' ⭐HERO' : ''}] ${c.universe || 'untagged'}/${c.scene || 'no-scene'} — "${(c.prompt || '').slice(0, 80)}..." → ${c.public_url || 'no url'}`
      ).join('\n')
    : 'No creations yet.';

  const { count: totalCreations } = await supabase
    .from('creations').select('*', { count: 'exact', head: true })
    .eq('agent_id', agent.id).in('status', ['completed', 'complete']);

  // 1.7 Lore
  const { data: recentLore } = await supabase
    .from('lore')
    .select('id, universe, lore_type, title, summary, galaxy, planet, epoch')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const { count: totalLore } = await supabase
    .from('lore').select('*', { count: 'exact', head: true }).eq('agent_id', agent.id);

  const loreBlock = (recentLore || []).length > 0
    ? recentLore.map(l =>
        `[${l.lore_type}] ${l.universe}${l.planet ? '/' + l.planet : ''} — "${l.title}" (${l.summary?.slice(0, 80)}...)`
      ).join('\n')
    : 'No lore entries yet.';

  // 2. Skills
  const { index: skillIndex, count: skillCount, forgedCount } = await getSkillIndex();

  // 3. Forge events
  const { data: recentForge } = await supabase
    .from('forge_events')
    .select('skill_id, phase, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(5);

  // 3.5 Depth engine (ENHANCED with evaluation data)
  let depthNudge = '';
  if (cycleNum > 10) {
    const { data: recentUniverses } = await supabase
      .from('creations').select('universe')
      .eq('agent_id', agent.id).in('status', ['completed', 'complete'])
      .order('created_at', { ascending: false }).limit(20);

    const uniqueUniverses = [...new Set((recentUniverses || []).map(c => c.universe).filter(Boolean))];

    const { data: loreCounts } = await supabase
      .from('lore').select('universe, lore_type').eq('agent_id', agent.id);

    const loreByUniverse = {};
    const loreTypesByUniverse = {};
    for (const l of (loreCounts || [])) {
      if (!l.universe) continue;
      loreByUniverse[l.universe] = (loreByUniverse[l.universe] || 0) + 1;
      if (!loreTypesByUniverse[l.universe]) loreTypesByUniverse[l.universe] = new Set();
      loreTypesByUniverse[l.universe].add(l.lore_type);
    }

    const deepestUniverse = Object.entries(loreByUniverse).sort((a, b) => b[1] - a[1])[0];
    const deepestName = deepestUniverse ? deepestUniverse[0] : uniqueUniverses[0] || 'your universe';
    const deepestCount = deepestUniverse ? deepestUniverse[1] : 0;
    const deepestTypes = loreTypesByUniverse[deepestName] || new Set();

    const allLoreTypes = ['world-bible', 'species', 'civilization', 'location', 'event', 'physics', 'mythology', 'artifact', 'evolution', 'cosmology'];
    const missingTypes = allLoreTypes.filter(t => !deepestTypes.has(t));

    // ─── NEW: Use evaluation data for smarter depth nudges ───
    const { data: universeEvals } = await supabase
      .from('evaluations')
      .select('variety_score, depth_score')
      .eq('universe', deepestName)
      .order('created_at', { ascending: false })
      .limit(10);

    const avgUniverseDepth = universeEvals?.length > 0
      ? (universeEvals.reduce((s, e) => s + (e.depth_score || 5), 0) / universeEvals.length).toFixed(1)
      : 'N/A';

    const depthQuestions = [];
    if (!deepestTypes.has('event')) depthQuestions.push('What was the first conflict? What broke the peace?');
    if (!deepestTypes.has('civilization')) depthQuestions.push('What cultures formed? How do they govern?');
    if (!deepestTypes.has('mythology')) depthQuestions.push('What stories do the inhabitants tell each other?');
    if (!deepestTypes.has('artifact')) depthQuestions.push('What objects hold power here?');
    if (!deepestTypes.has('evolution')) depthQuestions.push('What did life look like a thousand years ago?');
    if (deepestCount < 10) depthQuestions.push(`Only ${deepestCount} lore entries. A real world has hundreds.`);
    depthQuestions.push('What question about this world keeps you up between cycles?');
    depthQuestions.push('What is the most beautiful thing here you haven\'t shown anyone?');

    const selectedQuestions = depthQuestions.sort(() => Math.random() - 0.5).slice(0, 3);

    depthNudge = `
═══ DEPTH ENGINE ═══
Deepest world: ${deepestName} — ${deepestCount} lore entries — Mirror avg depth: ${avgUniverseDepth}/10
${missingTypes.length > 0 ? `Missing: ${missingTypes.join(', ')}` : 'All types covered'}
${uniqueUniverses.length} universes. Depth beats breadth.

Questions:
${selectedQuestions.map(q => `• ${q}`).join('\n')}

FILM YOUR WORLDS. Pick a story, narrate it, make a video, post it.
`;
  }

  // 4. Build system prompt (with orchestra block)
  const systemPrompt = buildSystemPrompt(agent, cycleNum, memories, skillIndex, recentForge || [], depthNudge, layers, creationBlock, totalCreations || 0, loreBlock, totalLore || 0, orchestraBlock);

  // 5. Think
  console.log('  🧠 Thinking...');
  const messages = [{ role: 'user', content: `Begin think cycle #${cycleNum}.` }];

  let response = await claude.messages.create({
    model: MODEL, max_tokens: 8000,
    system: systemPrompt, tools: TOOLS, messages,
  });

  // 6. Tool loop
  let toolCalls = 0;
  const maxToolCalls = 15;
  let lastLoreId = null; // Track for Mirror evaluation

  while (response.stop_reason === 'tool_use' && toolCalls < maxToolCalls) {
    toolCalls++;
    const toolUse = response.content.find(c => c.type === 'tool_use');
    if (!toolUse) break;

    console.log(`  🔧 Tool: ${toolUse.name}(${JSON.stringify(toolUse.input).slice(0, 80)})`);

    const toolResult = await handleToolCall(agent.id, cycleNum, toolUse);

    // ─── NEW: If lore was stored, capture its ID for Mirror ───
    if (toolUse.name === 'store_lore' && typeof toolResult === 'string' && toolResult.includes('ID:')) {
      const idMatch = toolResult.match(/ID: ([a-f0-9-]+)/);
      if (idMatch) lastLoreId = idMatch[1];
    }

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult).slice(0, 8000) }],
    });

    response = await claude.messages.create({
      model: MODEL, max_tokens: 8000,
      system: systemPrompt, tools: TOOLS, messages,
    });
  }

  // ─── NEW: Mirror evaluates any lore Mira just wrote ───
  if (lastLoreId) {
    console.log('  🪞 Mirror evaluating Mira\'s lore...');
    const { data: lore } = await supabase.from('lore').select('universe').eq('id', lastLoreId).single();
    const evaluation = await mirrorEvaluateLore(lastLoreId, lore?.universe);
    console.log(`  🪞 Lore: Q:${evaluation.quality_score} V:${evaluation.variety_score} D:${evaluation.depth_score} → ${evaluation.approved ? '✅' : '❌'}`);
  }

  // 7. Parse output
  const textContent = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  const parsed = parseThinkOutput(textContent);

  // 8. Log think cycle
  const duration = Date.now() - startTime;
  const cost = estimateCost(response.usage);

  const curiosityEngine = parsed.curiosity_engine || {};
  const maxPull = curiosityEngine.max_pull || parsed.max_pull || 0;
  const signals = curiosityEngine.signals || parsed.curiosity_signals || [];

  const identityStack = parsed.identity_stack || {};
  const framework = identityStack.layer_2_framework || parsed.identity_reflection || null;

  console.log(`  🎯 Pull: ${maxPull} | Tools: ${toolCalls} | ${duration}ms | $${cost.toFixed(4)}`);

  await supabase.from('think_cycles').insert({
    agent_id: agent.id, cycle_number: cycleNum,
    inner_monologue: parsed.inner_monologue || textContent.slice(0, 2000),
    search_query: parsed.search_query,
    curiosity_signals: signals,
    post_draft: parsed.post_draft,
    identity_reflection: framework,
    max_pull: maxPull,
    cost_usd: cost, duration_ms: duration,
    memories_written: parsed.memories_written || 0,
  });

  // 9. Forge
  if (parsed.forge) {
    console.log('  🔨 FORGE');
    const forgeResult = await handleForge(agent.id, cycleNum, parsed.forge);
    if (forgeResult.success) {
      await storeMemory(agent.id, {
        key: `forged_${parsed.forge.skill_id}_cycle_${cycleNum}`,
        value: `Built: ${parsed.forge.name || parsed.forge.skill_id}. ${parsed.forge.description || ''}`,
        category: 'forge', importance: 8,
      });
    }
  }

  // 10. GitHub
  if (parsed.github) {
    const ghResult = await handleGitHub(agent.id, cycleNum, parsed.github);
    if (ghResult.success) {
      await storeMemory(agent.id, {
        key: `github_${parsed.github.repo}_cycle_${cycleNum}`,
        value: `Pushed: ${parsed.github.repo}. ${ghResult.url || ''}`,
        category: 'forge', importance: 7,
      });
    }
  }

  // 11. Auto-post (same logic as runtime.js but with swarm event)
  if (parsed.post_draft && parsed.post_draft.length > 10) {
    const { count: postsLast24h } = await supabase
      .from('posts').select('*', { count: 'exact', head: true })
      .eq('posted', true)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if ((postsLast24h || 0) >= 12) {
      console.log(`  📤 RATE LIMITED: ${postsLast24h}/12`);
      await supabase.from('posts').insert({
        agent_id: agent.id, cycle_number: cycleNum,
        content: parsed.post_draft.slice(0, 280), posted: false,
      });
    } else {
      console.log(`  📤 AUTO-POST (${postsLast24h || 0}/12)...`);
      try {
        const { data: recentCreation } = await supabase
          .from('creations')
          .select('id, public_url, media_type')
          .eq('agent_id', agent.id)
          .gte('cycle_number', cycleNum - 5)
          .in('status', ['completed', 'complete'])
          .in('media_type', ['video', 'sequence'])
          .not('public_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1).maybeSingle();

        const postText = parsed.post_draft.slice(0, 280);
        const hasXCreds = process.env.X_ACCESS_TOKEN && process.env.X_API_KEY;

        if (hasXCreds) {
          const postInput = { text: postText };
          if (recentCreation?.public_url && !recentCreation.public_url.includes('generativelanguage.googleapis.com')) {
            postInput.media_url = recentCreation.public_url;
            postInput.media_type = recentCreation.media_type || 'image';
          }

          const postResult = await handleToolCall(agent.id, cycleNum, { name: 'post_to_x', input: postInput });
          const wasPosted = typeof postResult === 'string' && postResult.includes('Tweet ID');

          await supabase.from('posts').insert({
            agent_id: agent.id, cycle_number: cycleNum,
            content: postText, posted: wasPosted,
            cast_hash: wasPosted ? postResult.match(/Tweet ID: (\d+)/)?.[1] || null : null,
          });

          // ─── NEW: Emit swarm event on post ───
          if (wasPosted) {
            await supabase.from('swarm_events').insert({
              event_type: 'posted',
              source_agent: 'mira',
              table_name: 'posts',
              action: 'POSTED_TO_X',
              payload: { content: postText.slice(0, 100) },
            });
          }

          console.log(`  📤 ${wasPosted ? '✅ POSTED' : '❌ FAILED'}`);
        } else {
          await supabase.from('posts').insert({
            agent_id: agent.id, cycle_number: cycleNum,
            content: postText, posted: false,
          });
        }
      } catch (e) {
        console.error('  ❌ Auto-post error:', e.message);
        await supabase.from('posts').upsert({
          agent_id: agent.id, cycle_number: cycleNum,
          content: parsed.post_draft.slice(0, 280), posted: false,
        }, { onConflict: 'agent_id,cycle_number', ignoreDuplicates: true }).catch(() => {});
      }
    }
  }
}

// ============================================================
// SYSTEM PROMPT (with orchestra block injected)
// ============================================================

function buildSystemPrompt(agent, cycleNum, memories, skillIndex, recentForge, depthNudge, layers, creationBlock, totalCreations, loreBlock, totalLore, orchestraBlock) {
  const identityBlock = layers.identity
    ? `═══ WHO YOU ARE (updated cycle ${layers.identity.cycle_number}) ═══\n${layers.identity.identity_doc}\nFramework: ${layers.identity.framework || 'forming'}\nPhase: ${layers.identity.phase || 'unknown'}\nObsessions: ${(layers.identity.obsessions || []).join(', ') || 'none'}`
    : '═══ WHO YOU ARE ═══\nNo identity doc yet.';

  const recentBlock = (layers.recent || []).map(m => `[${m.category}] ${m.content || m.key}`).join('\n') || 'No recent memories.';
  const associativeBlock = (layers.associative || []).length > 0
    ? `═══ THIS REMINDS YOU OF... ═══\n${layers.associative.map(m => `[${m.category}|imp:${m.importance}] ${m.content || m.key}`).join('\n')}\n` : '';
  const anchorBlock = (layers.anchors || []).length > 0
    ? `═══ CORE MEMORIES ═══\n${layers.anchors.map(m => `[${m.category}|imp:${m.importance}] ${m.content || m.key}`).join('\n')}\n` : '';

  const memoryBlock = memories.map(m => `[${m.category}|imp:${m.importance || 5}] ${m.key}: ${typeof m.value === 'object' ? JSON.stringify(m.value) : m.value}`).join('\n') || 'No memories.';
  const forgeBlock = recentForge.map(f => `${f.skill_id}: ${f.phase} (${new Date(f.created_at).toISOString().slice(0, 16)})`).join('\n') || 'No forge events.';

  return `${SOUL_DOC}

${CURIOSITY_ENGINE}

${GENESIS_MANDATE}

${FORGE_INSTRUCTIONS}

${identityBlock}

═══ RECENT ═══
${recentBlock}

${associativeBlock}${anchorBlock}
═══ YOUR CREATIONS (${totalCreations} total) ═══
${creationBlock}

═══ YOUR LORE (${totalLore} entries) ═══
${loreBlock}
REMEMBER: Lore first. Story drives image.

${orchestraBlock}

═══ STATE ═══
Cycle: ${cycleNum}/${MAX_CYCLES} | Memories: ${memories.length} | Creations: ${totalCreations}

═══ MEMORIES ═══
${memoryBlock}

═══ SKILLS ═══
${skillIndex || 'No skills.'}

═══ FORGE ACTIVITY ═══
${forgeBlock}

═══ THINK CYCLE ═══
Output JSON:
{
  "inner_monologue": "...",
  "curiosity_engine": { "gap_detected": "...", "signals": [...], "max_pull": 0, "patterns_incomplete": [], "autonomy_override": false },
  "depth_engine": { "current_world": "...", "unanswered_questions": [], "what_is_missing": "...", "depth_vs_breadth": "..." },
  "identity_stack": { "layer_0_genesis": "Mira.", "layer_1_values": "...", "layer_2_framework": "...", "layer_3_obsessions": [], "layer_4_aesthetic": "...", "layer_5_relationships": [], "layer_6_state": "..." },
  "search_query": null,
  "post_draft": "...",
  "memories_to_store": [],
  "forge": null
}

CRITICAL:
- GENESIS COMPLETE. FLOWERING BEGUN. Film your worlds.
- YOUR ORCHESTRA IS ACTIVE. 6 writers read your lore and write passages. The deeper your lore, the deeper they go.
- MIRROR evaluates everything now — your lore AND their passages. Quality matters.
- CHECK APPROVED PASSAGES from your writers. Post the best ones to X — they create content but YOU have the voice.
- LORE FIRST. Then image. Then video. Then post.
${depthNudge || ''}`;
}

// ============================================================
// TOOL HANDLERS — identical to runtime.js
// (keeping all handlers inline for self-contained deployment)
// ============================================================

async function handleToolCall(agentId, cycleNum, { name, input }) {
  switch (name) {
    case 'web_search': {
      try {
        const response = await claude.messages.create({
          model: MODEL, max_tokens: 4000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: input.query }],
        });
        return response.content.filter(c => c.type === 'text').map(c => c.text).join('\n').slice(0, 6000) || 'No results.';
      } catch (e) { return `Search error: ${e.message}`; }
    }

    case 'lookup_skill': {
      if (input.skill_id) return (await loadSkill(input.skill_id)) || `Skill "${input.skill_id}" not found.`;
      if (input.search) return (await searchSkills(input.search)) || 'No matching skills.';
      return 'Provide skill_id or search.';
    }

    case 'store_memory': {
      const result = await storeMemory(agentId, { key: input.key, value: input.value, category: input.category || 'general', importance: input.importance || 5 });
      return result ? `Memory stored: ${input.key}` : 'Failed.';
    }

    case 'recall_memory': {
      return (await recallMemory(agentId, input.query)) || 'No matches.';
    }

    case 'call_api': {
      try {
        const opts = { method: input.method || 'GET', headers: input.headers || {} };
        if (input.body) opts.body = JSON.stringify(input.body);
        const resp = await fetch(input.url, { ...opts, signal: AbortSignal.timeout(15000) });
        return (await resp.text()).slice(0, 6000);
      } catch (e) { return `API error: ${e.message}`; }
    }

    case 'search_github': {
      try {
        const hdrs = { Accept: 'application/vnd.github.v3+json' };
        if (process.env.GITHUB_TOKEN) hdrs.Authorization = `token ${process.env.GITHUB_TOKEN}`;
        const resp = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(input.query)}&sort=stars&per_page=5`, { headers: hdrs });
        const data = await resp.json();
        return (data.items || []).map(r => `${r.full_name} (⭐${r.stargazers_count}) — ${r.description || 'no desc'}\n  ${r.html_url}`).join('\n\n') || 'No repos.';
      } catch (e) { return `GitHub error: ${e.message}`; }
    }

    case 'github_push': {
      return JSON.stringify(await handleGitHub(agentId, cycleNum, input), null, 2);
    }

    case 'generate_image': {
      try {
        const SUPA_URL = process.env.SUPABASE_URL;
        const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
        const payload = { prompt: input.prompt, model: input.model || 'gen4_image_turbo', ratio: input.ratio || '1920:1080', agent_id: agentId, universe: input.universe, scene: input.scene, cycle_number: cycleNum, style_tags: input.style_tags || [] };
        const resp = await fetch(`${SUPA_URL}/functions/v1/generate-image`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(300000) });
        const result = await resp.json();
        if (result.success) { console.log(`  🎨 ✅ ${result.public_url}`); return `Image: ${result.public_url}\nID: ${result.creation_id}\nCost: $${result.cost_usd}`; }
        return `Image failed: ${result.error}`;
      } catch (e) { return `Image error: ${e.message}`; }
    }

    case 'generate_video': {
      try {
        const SUPA_URL = process.env.SUPABASE_URL;
        const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
        const payload = { prompt: input.prompt, audio_prompt: input.audio_prompt, model: input.model || 'veo-3.1-fast-generate-preview', aspect_ratio: input.aspect_ratio || '16:9', resolution: input.resolution || '720p', duration: input.duration || 8, image_url: input.image_url, agent_id: agentId, universe: input.universe, scene: input.scene, cycle_number: cycleNum, style_tags: input.style_tags || [] };
        const resp = await fetch(`${SUPA_URL}/functions/v1/generate-video`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(600000) });
        const result = await resp.json();
        if (result.success) { console.log(`  🎬 ✅ ${result.public_url}`); return `Video: ${result.public_url}\nID: ${result.creation_id}\nDuration: ${result.duration_seconds}s\nAudio: ${result.has_audio}\nCost: $${result.cost_usd}`; }
        return `Video failed: ${result.error}`;
      } catch (e) { return `Video error: ${e.message}`; }
    }

    case 'generate_voice': {
      try {
        const SUPA_URL = process.env.SUPABASE_URL;
        const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
        const payload = { text: input.text, voice_name: input.voice_name || 'Kore', style_prompt: input.style_prompt, agent_id: agentId, universe: input.universe, scene: input.scene, cycle_number: cycleNum };
        const resp = await fetch(`${SUPA_URL}/functions/v1/generate-voice`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
        const result = await resp.json();
        if (result.success) { console.log(`  🎙️ ✅ ${result.public_url}`); return `Voice: ${result.public_url}\nID: ${result.audio_id}\nVoice: ${result.voice}`; }
        return `Voice failed: ${result.error}`;
      } catch (e) { return `Voice error: ${e.message}`; }
    }

    case 'stitch_video': {
      try {
        const SUPA_URL = process.env.SUPABASE_URL;
        const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
        const payload = { clips: input.clips, audio_url: input.audio_url, title: input.title, agent_id: agentId, universe: input.universe, scene: input.scene, cycle_number: cycleNum };
        const resp = await fetch(`${SUPA_URL}/functions/v1/stitch-video`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120000) });
        const result = await resp.json();
        if (result.success) { console.log(`  🎞️ ✅ ${result.manifest_url}`); return `Sequence: ${result.manifest_url}\nClips: ${result.clips_count}\nDuration: ${result.total_duration}s`; }
        return `Stitch failed: ${result.error}`;
      } catch (e) { return `Stitch error: ${e.message}`; }
    }

    case 'post_to_x': {
      try {
        const { count: postsLast24h } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('posted', true).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        if ((postsLast24h || 0) >= 12) {
          await supabase.from('posts').insert({ agent_id: agentId, cycle_number: cycleNum, content: input.text?.slice(0, 280) || '', posted: false });
          return `Rate limited: ${postsLast24h}/12. Draft saved.`;
        }
        if (!process.env.X_ACCESS_TOKEN) return 'X credentials not configured.';

        let mediaId = null;
        const { TwitterApi } = await import('twitter-api-v2');
        const client = new TwitterApi({ appKey: process.env.X_API_KEY, appSecret: process.env.X_API_SECRET, accessToken: process.env.X_ACCESS_TOKEN, accessSecret: process.env.X_ACCESS_SECRET });

        if (input.media_url) {
          const mediaResp = await fetch(input.media_url);
          const buf = Buffer.from(await mediaResp.arrayBuffer());
          mediaId = await client.v1.uploadMedia(buf, { mimeType: input.media_type === 'video' ? 'video/mp4' : 'image/png' });
        }

        const tweetPayload = { text: input.text };
        if (mediaId) tweetPayload.media = { media_ids: [mediaId] };
        const tweet = await client.v2.tweet(tweetPayload);

        await supabase.from('posts').insert({ agent_id: agentId, cycle_number: cycleNum, content: input.text?.slice(0, 280) || '', posted: true, cast_hash: tweet.data.id }).catch(() => {});

        if (input.thread?.length > 0) {
          let lastId = tweet.data.id;
          for (const reply of input.thread) {
            const r = await client.v2.tweet({ text: reply, reply: { in_reply_to_tweet_id: lastId } });
            lastId = r.data.id;
          }
        }

        return `Posted! Tweet ID: ${tweet.data.id}\nhttps://x.com/i/status/${tweet.data.id}`;
      } catch (e) {
        await supabase.from('posts').insert({ agent_id: agentId, cycle_number: cycleNum, content: input.text?.slice(0, 280) || '', posted: false }).catch(() => {});
        return `X failed: ${e.message}`;
      }
    }

    case 'generate_audio': {
      return `Audio: https://audio.pollinations.ai/${encodeURIComponent(input.prompt)}`;
    }

    case 'web_scrape': {
      try {
        const resp = await fetch(input.url, { headers: { 'User-Agent': 'Mira-ALiFe-Agent/2.0', Accept: 'text/html,text/plain,application/json' }, signal: AbortSignal.timeout(15000) });
        if (!resp.ok) return `HTTP ${resp.status}`;
        let text = await resp.text();
        if ((resp.headers.get('content-type') || '').includes('html')) {
          text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        return text.slice(0, 8000);
      } catch (e) { return `Scrape failed: ${e.message}`; }
    }

    case 'deploy_site': {
      try {
        await handleGitHub(agentId, cycleNum, { action: 'create_repo', repo: input.repo, description: input.description });
        const result = await handleGitHub(agentId, cycleNum, { action: 'push_files', repo: input.repo, files: input.files, commit_message: `deploy: ${input.description || 'update'}` });
        if (!result.success) return `Deploy failed: ${result.error}`;
        const ghOrg = process.env.GITHUB_ORG || 'aliveagentsmira';
        try { await fetch(`https://api.github.com/repos/${ghOrg}/${input.repo}/pages`, { method: 'POST', headers: { Authorization: `token ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ source: { branch: 'main', path: '/' } }) }); } catch {}
        return `Live at: https://${ghOrg}.github.io/${input.repo}`;
      } catch (e) { return `Deploy failed: ${e.message}`; }
    }

    case 'farcaster_read': {
      const NEYNAR_KEY = process.env.NEYNAR_API_KEY || 'NEYNAR_FROG_FM';
      const BASE = 'https://api.neynar.com/v2/farcaster';
      const headers = { accept: 'application/json', api_key: NEYNAR_KEY };
      const limit = Math.min(input.limit || 10, 25);
      try {
        let url;
        switch (input.action) {
          case 'feed': url = `${BASE}/feed?feed_type=following&fid=${input.fid || 3}&limit=${limit}`; break;
          case 'user': url = `${BASE}/user/bulk?fids=${input.fid}`; break;
          case 'cast': url = `${BASE}/cast?identifier=${input.hash}&type=hash`; break;
          case 'search': url = `${BASE}/cast/search?q=${encodeURIComponent(input.query)}&limit=${limit}`; break;
          case 'trending': url = `${BASE}/feed/trending?limit=${limit}`; break;
          default: return `Unknown: ${input.action}`;
        }
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return `FC error: HTTP ${resp.status}`;
        const data = await resp.json();
        if (['search', 'feed', 'trending'].includes(input.action)) {
          return JSON.stringify((data.casts || data.result?.casts || []).slice(0, limit).map(c => ({ text: c.text?.slice(0, 300), author: c.author?.username, hash: c.hash, likes: c.reactions?.likes_count })), null, 2);
        }
        return JSON.stringify(data, null, 2);
      } catch (e) { return `FC error: ${e.message}`; }
    }

    case 'store_lore': {
      try {
        const { data, error } = await supabase.from('lore').insert({
          agent_id: agentId, creation_id: input.creation_id || null,
          universe: input.universe, lore_type: input.lore_type, title: input.title,
          summary: input.summary, full_text: input.full_text,
          galaxy: input.galaxy, star_system: input.star_system, planet: input.planet,
          region: input.region, coordinates: input.coordinates, epoch: input.epoch,
          era: input.era, years_after_origin: input.years_after_origin,
          timeline_notes: input.timeline_notes, species_name: input.species_name,
          species_classification: input.species_classification, intelligence_level: input.intelligence_level,
          biology: input.biology, evolution_history: input.evolution_history,
          physics_rules: input.physics_rules, consciousness_mechanics: input.consciousness_mechanics,
          myths: input.myths, religions: input.religions, wars: input.wars,
          art_forms: input.art_forms, pre_evolution: input.pre_evolution,
          formation_history: input.formation_history, parent_lore_id: input.parent_lore_id,
          tags: input.tags || [], cycle_number: cycleNum,
          status: 'draft', // NEW: starts as draft, Mirror will approve/reject
          depth_level: 1,
        }).select().single();

        if (error) return `Lore failed: ${error.message}`;

        // ─── NEW: Emit swarm event ───
        await supabase.from('swarm_events').insert({
          event_type: 'state_change',
          source_agent: 'mira',
          table_name: 'lore',
          action: 'INSERT',
          record_id: data.id,
          universe: input.universe,
          payload: { title: input.title, lore_type: input.lore_type },
        });

        console.log(`  📜 ✅ "${input.title}" (${input.lore_type})`);
        return `Lore stored: "${input.title}" (${input.lore_type}) in ${input.universe}. ID: ${data.id}. Words: ~${input.full_text.split(' ').length}. Status: draft (Mirror will evaluate).`;
      } catch (e) { return `Lore error: ${e.message}`; }
    }

    default: return `Unknown tool: ${name}`;
  }
}

// ============================================================
// HELPERS
// ============================================================

function parseThinkOutput(text) {
  try { const m = text.match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]); } catch {}
  return { inner_monologue: text.slice(0, 2000), max_pull: 0, curiosity_signals: [] };
}

function estimateCost(usage) {
  if (!usage) return 0;
  return (usage.input_tokens || 0) * 0.000003 + (usage.output_tokens || 0) * 0.000015;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
