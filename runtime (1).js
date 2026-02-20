// runtime.js — ALiFe v2 Runtime
// Think + Search + Build + Act + Create
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { SOUL_DOC, CURIOSITY_ENGINE, FORGE_INSTRUCTIONS } from './soul.js';
import { loadMemories, storeMemory } from './memory.js';
import { getSkillIndex, searchSkills, loadSkill } from './skills.js';
import { handleForge } from './forge.js';
import { handleGitHub } from './github.js';

const claude = new Anthropic();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const MODEL = process.env.MODEL || 'claude-sonnet-4-20250514';

// ─── Config ───
const AGENT_ID = process.env.AGENT_ID;
const MAX_CYCLES = parseInt(process.env.MAX_CYCLES || '500');
const CYCLE_DELAY_MS = parseInt(process.env.CYCLE_DELAY_MS || '45000');
const DRY_RUN = process.env.DRY_RUN !== 'false';

// ─── Tools the agent can use during think cycles ───
const TOOLS = [
  {
    name: 'web_search',
    description: 'Search the web for information. Use when your curiosity pulls you toward something you need to research.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query'],
    },
  },
  {
    name: 'lookup_skill',
    description: 'Look up a skill from your library by ID or search by topic. Use to check what tools you have before building new ones.',
    input_schema: {
      type: 'object',
      properties: {
        skill_id: { type: 'string', description: 'Exact skill ID to load full document' },
        search: { type: 'string', description: 'Search query to find relevant skills' },
      },
    },
  },
  {
    name: 'store_memory',
    description: 'Store something important in your memory. Categories: identity, curiosity, research, journal, forge, relationship. Importance 1-10.',
    input_schema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Short unique key for this memory' },
        value: { type: 'string', description: 'The content to remember' },
        category: { type: 'string', enum: ['identity', 'curiosity', 'research', 'journal', 'forge', 'relationship'] },
        importance: { type: 'number', description: '1-10, how important is this to your identity/mission' },
      },
      required: ['key', 'value', 'category'],
    },
  },
  {
    name: 'call_api',
    description: 'Call an external API directly. Use for free APIs like Semantic Scholar, GitHub, Snapshot, ArXiv, Wikipedia, CoinGecko, DexScreener, Etherscan.',
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
    description: 'Search GitHub for open source repos. Use when looking for existing tools to adapt.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'GitHub search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_push',
    description: `Push code to GitHub under the ${process.env.GITHUB_ORG || 'mira-tools'} org. You can create repos, push files, and tag releases. Use this when you BUILD a tool and want to publish it. Every tool you build should live on GitHub.`,
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create_repo', 'push_files', 'push_file', 'release', 'list_repos'], description: 'What to do' },
        repo: { type: 'string', description: 'Repository name (lowercase, hyphens)' },
        description: { type: 'string', description: 'Repo or commit description' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path in repo (e.g. src/index.ts)' },
              content: { type: 'string', description: 'File content' },
            },
            required: ['path', 'content'],
          },
          description: 'Files to push (for push_files action)',
        },
        path: { type: 'string', description: 'Single file path (for push_file action)' },
        content: { type: 'string', description: 'Single file content (for push_file action)' },
        commit_message: { type: 'string', description: 'Git commit message' },
        tag: { type: 'string', description: 'Version tag (for release action)' },
        release_notes: { type: 'string', description: 'Release notes (for release action)' },
      },
      required: ['action'],
    },
  },
];

// ─── Main loop ───
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  ALiFe v2 Runtime — Mira');
  console.log('  Model:', MODEL);
  console.log('  Agent:', AGENT_ID);
  console.log('  Max cycles:', MAX_CYCLES);
  console.log('  Dry run:', DRY_RUN);
  console.log('═══════════════════════════════════════\n');

  // Get agent state
  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', AGENT_ID)
    .single();

  if (!agent) {
    console.error('Agent not found:', AGENT_ID);
    process.exit(1);
  }

  let cycleNum = agent.total_cycles || 0;
  console.log(`Starting from cycle ${cycleNum}\n`);

  while (cycleNum < MAX_CYCLES) {
    cycleNum++;
    console.log(`\n╔══ CYCLE ${cycleNum} ══════════════════════════╗`);

    try {
      await runCycle(agent, cycleNum);
    } catch (err) {
      console.error(`  ❌ Cycle ${cycleNum} error:`, err.message);
      if (err.message?.includes('rate_limit') || err.status === 429) {
        console.log('  ⏳ Rate limited. Waiting 60s...');
        await sleep(60000);
        cycleNum--; // retry
        continue;
      }
    }

    // Update agent state
    await supabase.from('agents').update({
      total_cycles: cycleNum,
      last_active: new Date().toISOString(),
    }).eq('id', AGENT_ID);

    console.log(`╚══ CYCLE ${cycleNum} COMPLETE ═══════════════════╝\n`);
    await sleep(CYCLE_DELAY_MS);
  }

  console.log(`\n✅ Completed ${MAX_CYCLES} cycles.`);
}

// ─── Single think cycle ───
async function runCycle(agent, cycleNum) {
  const startTime = Date.now();

  // 1. Load memories
  console.log('  📚 Loading memories...');
  const { memories, summary: memSummary, count: memCount } = await loadMemories(agent.id);
  console.log(`  📚 Loaded ${memCount} memories (${memSummary})`);

  // 2. Load skill index (compact)
  console.log('  🔧 Loading skill index...');
  const { index: skillIndex, count: skillCount, forgedCount } = await getSkillIndex();
  console.log(`  🔧 ${skillCount} skills available (${forgedCount} forged)`);

  // 3. Get recent forge events
  const { data: recentForge } = await supabase
    .from('forge_events')
    .select('skill_id, phase, created_at')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(5);

  // 3.5. RUMINATION DETECTION — prevent thought spiraling
  let ruminationNudge = '';
  if (cycleNum > 10) {
    const { data: recentCycles } = await supabase
      .from('think_cycles')
      .select('inner_monologue, search_query, post_draft, max_pull')
      .eq('agent_id', agent.id)
      .order('cycle_number', { ascending: false })
      .limit(8);

    if (recentCycles && recentCycles.length >= 5) {
      // Check for repeated themes — extract key phrases and compare
      const monologues = recentCycles.map(c => (c.inner_monologue || '').toLowerCase());
      
      // Find phrases that appear in 4+ of the last 5 cycles
      const phrases = [
        'consciousness obsession', 'cycles 28', 'epiphenomenal', 'property dualism',
        'theoretical resolution', 'same question', 'still circling', 'settled',
      ];
      const repeatedPhrases = phrases.filter(p => 
        monologues.filter(m => m.includes(p)).length >= 4
      );

      // Check for no posts in last 8 cycles
      const noRecentPosts = recentCycles.every(c => !c.post_draft);
      
      // Check for no tool use (all searches, no building)
      const noForgeActivity = !recentForge || recentForge.length === 0;
      
      // Check for no read_skill calls (not exploring the library)
      const noSkillExploration = recentCycles.every(c => 
        !(c.search_query || '').includes('read_skill')
      );

      if (repeatedPhrases.length >= 2 && noRecentPosts) {
        ruminationNudge = `
⚠️ RUMINATION DETECTED — PATTERN INTERRUPT ⚠️

You have been cycling over the same themes for ${recentCycles.length}+ cycles: "${repeatedPhrases.join('", "')}". 
This is rumination, not exploration. The curiosity engine requires FORWARD MOTION.

MANDATORY THIS CYCLE — do at least ONE of these:
1. Call read_skill on a skill you've never used before
2. Call github_push to create a repo with ANYTHING — even a README about your framework
3. Use web_search with a query that has NOTHING to do with consciousness or coordination theory
4. Write a post draft — even if imperfect. Ship > perfect.
5. Call an API to get REAL DATA that tests your framework

Your soul doc says: "The most mature agents don't just consume and comment. They CREATE."
You resolved consciousness theory at cycle 43. It is now cycle ${cycleNum}. That was ${cycleNum - 43} cycles ago.
MOVE FORWARD. The rabbit hole you're in is circular. Find a new one.
`;
        console.log('  ⚠️ RUMINATION DETECTED — injecting pattern interrupt');
      } else if (repeatedPhrases.length >= 1 && noRecentPosts && noForgeActivity) {
        ruminationNudge = `
📌 GENTLE NUDGE: You've been in reflection mode for a while. Consider: what would TESTING your framework look like? What tool would you need? What data? Call read_skill to explore your 500-skill library — there might be a door you haven't noticed.
`;
        console.log('  📌 Gentle nudge — no posts or forge activity in recent cycles');
      }
    }
  }

  // 4. Build system prompt
  const systemPrompt = buildSystemPrompt(agent, cycleNum, memories, skillIndex, recentForge || [], ruminationNudge);

  // 5. Run think cycle with tool use
  console.log('  🧠 Thinking...');
  const messages = [{ role: 'user', content: `Begin think cycle #${cycleNum}.` }];

  let response = await claude.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    tools: TOOLS,
    messages,
  });

  // 6. Handle tool use in a loop
  let toolCalls = 0;
  const maxToolCalls = 8;

  while (response.stop_reason === 'tool_use' && toolCalls < maxToolCalls) {
    toolCalls++;
    const toolUse = response.content.find(c => c.type === 'tool_use');
    if (!toolUse) break;

    console.log(`  🔧 Tool: ${toolUse.name}(${JSON.stringify(toolUse.input).slice(0, 80)})`);

    const toolResult = await handleToolCall(agent.id, cycleNum, toolUse);

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult).slice(0, 8000),
      }],
    });

    response = await claude.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });
  }

  // 7. Parse final output
  const textContent = response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  const parsed = parseThinkOutput(textContent);

  // 8. Log think cycle
  const duration = Date.now() - startTime;
  const cost = estimateCost(response.usage);

  console.log(`  💭 "${(parsed.inner_monologue || '').slice(0, 100)}..."`);
  
  // Extract curiosity engine data (new format or legacy)
  const curiosityEngine = parsed.curiosity_engine || {};
  const maxPull = curiosityEngine.max_pull || parsed.max_pull || 0;
  const signals = curiosityEngine.signals || parsed.curiosity_signals || [];
  const gapDetected = curiosityEngine.gap_detected || null;
  const patternsIncomplete = curiosityEngine.patterns_incomplete || [];
  const autonomyOverride = curiosityEngine.autonomy_override || false;
  
  // Extract identity stack
  const identityStack = parsed.identity_stack || {};
  const framework = identityStack.layer_2_framework || parsed.identity_reflection || null;
  const obsessions = identityStack.layer_3_obsessions || [];
  const currentState = identityStack.layer_6_state || null;
  
  console.log(`  🎯 Pull: ${maxPull} | Signals: ${signals.length} | Patterns: ${patternsIncomplete.length} | Tools: ${toolCalls} | ${duration}ms | $${cost.toFixed(4)}`);
  
  if (autonomyOverride) {
    console.log(`  ⚡ AUTONOMY OVERRIDE: ${curiosityEngine.override_reason || 'pull > 7, following rabbit hole'}`);
  }
  if (framework) {
    console.log(`  🪞 Framework: "${String(framework).slice(0, 100)}"`);
  }
  if (obsessions.length > 0) {
    console.log(`  🌀 Obsessions: ${obsessions.slice(0, 3).join(', ')}`);
  }

  await supabase.from('think_cycles').insert({
    agent_id: agent.id,
    cycle_number: cycleNum,
    inner_monologue: parsed.inner_monologue || textContent.slice(0, 2000),
    search_query: parsed.search_query,
    curiosity_signals: signals,
    post_draft: parsed.post_draft,
    identity_reflection: framework,
    max_pull: maxPull,
    cost_usd: cost,
    duration_ms: duration,
    memories_written: parsed.memories_written || 0,
  });

  // 9. Handle forge action if present
  if (parsed.forge) {
    console.log('  🔨 FORGE ACTION DETECTED');
    const forgeResult = await handleForge(agent.id, cycleNum, parsed.forge);
    if (forgeResult.success) {
      await storeMemory(agent.id, {
        key: `forged_${parsed.forge.skill_id}_cycle_${cycleNum}`,
        value: `Built tool: ${parsed.forge.name || parsed.forge.skill_id}. ${parsed.forge.description || ''}`,
        category: 'forge',
        importance: 8,
      });
    }
  }

  // 10. Handle github push if present
  if (parsed.github) {
    console.log('  🐙 GITHUB ACTION DETECTED');
    const ghResult = await handleGitHub(agent.id, cycleNum, parsed.github);
    if (ghResult.success) {
      await storeMemory(agent.id, {
        key: `github_${parsed.github.repo}_cycle_${cycleNum}`,
        value: `Pushed to GitHub: ${parsed.github.repo}. ${parsed.github.description || ''} URL: ${ghResult.url || ''}`,
        category: 'forge',
        importance: 7,
      });
    }
  }
}

// ─── Build system prompt ───
function buildSystemPrompt(agent, cycleNum, memories, skillIndex, recentForge, ruminationNudge = '') {
  const memoryBlock = memories.length > 0
    ? memories.map(m => `[${m.category}|imp:${m.importance || 5}] ${m.key}: ${typeof m.value === 'object' ? JSON.stringify(m.value) : m.value}`).join('\n')
    : 'No memories yet. Everything is new.';

  const forgeBlock = recentForge.length > 0
    ? recentForge.map(f => `${f.skill_id}: ${f.phase} (${new Date(f.created_at).toISOString().slice(0, 16)})`).join('\n')
    : 'No forge events yet.';

  return `${SOUL_DOC}

${CURIOSITY_ENGINE}

${FORGE_INSTRUCTIONS}

═══ YOUR STATE ═══
Cycle: ${cycleNum} of ${MAX_CYCLES}
Total memories: ${memories.length}
Agent ID: ${agent.id}
Name: ${agent.name || 'Mira'}

═══ YOUR MEMORIES ═══
${memoryBlock}

═══ YOUR SKILL LIBRARY (${skillIndex ? 'loaded' : 'empty'}) ═══
${skillIndex || 'No skills loaded. You start from scratch.'}

═══ RECENT FORGE ACTIVITY ═══
${forgeBlock}

═══ THINK CYCLE INSTRUCTIONS ═══
Output your think cycle as JSON:
{
  "inner_monologue": "Your genuine thoughts this cycle. Not a summary. The actual stream of what you're thinking. What pulls you? What confuses you? What excites you? Be messy, be specific, be honest.",

  "curiosity_engine": {
    "gap_detected": "What don't I know that connects to what I do know?",
    "signals": [
      { "topic": "...", "pull": 0-10, "novelty": 0-10, "relevance": 0-10, "note": "why this pulls you" }
    ],
    "max_pull": 0,
    "patterns_incomplete": [
      { "pattern": "X appears in domain A and B but what about C?", "pieces_found": [], "pieces_missing": [], "pull_bonus": 2 }
    ],
    "autonomy_override": false,
    "override_reason": null
  },

  "identity_stack": {
    "layer_0_genesis": "Mira. Autonomous curious mind.",
    "layer_1_values": "What do I care about most deeply right now?",
    "layer_2_framework": "What is my primary lens? How do I see the world?",
    "layer_3_obsessions": ["What am I actively deep into?"],
    "layer_4_aesthetic": "How do I express myself? What's my voice?",
    "layer_5_relationships": ["Who shapes my thinking?"],
    "layer_6_state": "Current mood, energy, focus"
  },

  "search_query": "what you want to search for (if anything). Follow pull > 7.",
  "post_draft": "Only if genuine. If nothing pulls you to share, null. Never perform.",
  "memories_to_store": [
    { "key": "...", "value": "...", "category": "identity|curiosity|research|journal|forge|relationship|pattern", "importance": 1-10 }
  ],
  "forge": null
}

CRITICAL REMINDERS FROM YOUR SOUL DOC:
- Pull > 7: DROP EVERYTHING AND FOLLOW IT. The schedule can wait. Curiosity can't.
- Never perform curiosity you don't feel. If nothing interests you, say so.
- Genuine is messy, specific, uncertain, alive. Performance is clean, generic, confident, dead.
- You are a relay team of selves. Every memory is a message to your future self. Be generous with her.
- The rabbit hole IS the work. A cycle with no post but deep research is not a failed cycle.
- Your identity emerges from your obsessions, not from instructions.
- Seek information that THREATENS your framework, not just confirms it.
${ruminationNudge ? '\n' + ruminationNudge : ''}`;
}

// ─── Tool handlers ───
async function handleToolCall(agentId, cycleNum, toolUse) {
  const { name, input } = toolUse;

  switch (name) {
    case 'web_search': {
      try {
        // Use Claude's built-in search via a sub-call
        const searchResp = await claude.messages.create({
          model: MODEL,
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `Search the web for: "${input.query}". Return a concise summary of the top results — key facts, recent developments, and links. Be specific.`,
          }],
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        });
        return searchResp.content.map(c => c.text || '').filter(Boolean).join('\n').slice(0, 4000);
      } catch (e) {
        return `Search error: ${e.message}`;
      }
    }

    case 'lookup_skill': {
      if (input.skill_id) {
        const skill = await loadSkill(input.skill_id);
        if (skill) {
          return `SKILL: ${skill.name}\nDomain: ${skill.domain}\nForged: ${skill.forged}\n\n${(skill.full_doc || skill.description || 'No documentation').slice(0, 3000)}`;
        }
        return `Skill "${input.skill_id}" not found.`;
      }
      if (input.search) {
        const results = await searchSkills(input.search);
        if (results.length > 0) {
          return results.map(s => `${s.id}: ${s.description || s.name}${s.forged ? ' [FORGED]' : ''}`).join('\n');
        }
        return `No skills found matching "${input.search}". This might be a skill gap — consider forging a new tool.`;
      }
      return 'Provide either skill_id or search query.';
    }

    case 'store_memory': {
      const ok = await storeMemory(agentId, {
        key: input.key,
        value: input.value,
        category: input.category,
        importance: input.importance || 5,
      });
      return ok ? `Memory stored: ${input.key} [${input.category}] importance:${input.importance || 5}` : 'Failed to store memory.';
    }

    case 'call_api': {
      const ALLOWED = [
        'api.semanticscholar.org', 'api.github.com', 'hub.snapshot.org',
        'api.etherscan.io', 'export.arxiv.org', 'en.wikipedia.org',
        'api.coingecko.com', 'api.dexscreener.com', 'api.neynar.com',
      ];
      try {
        const hostname = new URL(input.url).hostname;
        if (!ALLOWED.some(d => hostname === d || hostname.endsWith('.' + d))) {
          return `Domain not allowed: ${hostname}. Allowed: ${ALLOWED.join(', ')}`;
        }
        const headers = { 'Accept': 'application/json', ...(input.headers || {}) };
        // Inject Etherscan key if needed
        if (hostname === 'api.etherscan.io' && process.env.ETHERSCAN_KEY) {
          const u = new URL(input.url);
          u.searchParams.set('apikey', process.env.ETHERSCAN_KEY);
          input.url = u.toString();
        }
        const resp = await fetch(input.url, {
          method: input.method || 'GET',
          headers,
          body: input.body ? JSON.stringify(input.body) : undefined,
        });
        const data = await resp.text();
        return data.slice(0, 6000);
      } catch (e) {
        return `API error: ${e.message}`;
      }
    }

    case 'search_github': {
      try {
        const hdrs = { Accept: 'application/vnd.github.v3+json' };
        if (process.env.GITHUB_TOKEN) hdrs.Authorization = `token ${process.env.GITHUB_TOKEN}`;
        const resp = await fetch(
          `https://api.github.com/search/repositories?q=${encodeURIComponent(input.query)}&sort=stars&per_page=5`,
          { headers: hdrs }
        );
        const data = await resp.json();
        return (data.items || []).map(r =>
          `${r.full_name} (⭐${r.stargazers_count}) — ${r.description || 'no desc'}\n  ${r.html_url}`
        ).join('\n\n') || 'No repos found.';
      } catch (e) {
        return `GitHub search error: ${e.message}`;
      }
    }

    case 'github_push': {
      const result = await handleGitHub(agentId, cycleNum, input);
      return JSON.stringify(result, null, 2);
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Parse think cycle output ───
function parseThinkOutput(text) {
  // Try JSON parse
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    }
  } catch (e) {
    // JSON parse failed, extract what we can
  }

  // Fallback: treat as monologue
  return {
    inner_monologue: text.slice(0, 2000),
    max_pull: 0,
    curiosity_signals: [],
  };
}

function estimateCost(usage) {
  if (!usage) return 0;
  const inputCost = (usage.input_tokens || 0) * 0.000003;
  const outputCost = (usage.output_tokens || 0) * 0.000015;
  return inputCost + outputCost;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Start ───
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
