// runtime.js — ALiFe v2 Runtime
// Think + Search + Build + Act + Create
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
    name: 'recall_memory',
    description: 'Search your memory archive for something specific. Like reaching into long-term memory. You have hundreds of memories stored — use this when you sense you knew something but it is not in your immediate context.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What are you trying to remember? Use keywords or describe what you are looking for.' },
      },
      required: ['query'],
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
  {
    name: 'generate_image',
    description: 'Generate an image from a text prompt. Uses Pollinations AI (free, no limits). Returns a URL to the generated image. Use for research visualizations, diagrams, concept art, memes, illustrations — anything visual.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image you want to create' },
        width: { type: 'number', description: 'Image width in pixels (default 1024)' },
        height: { type: 'number', description: 'Image height in pixels (default 1024)' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_audio',
    description: 'Generate music or audio from a text prompt. Uses Pollinations AI (free). Returns a URL to the audio file. Use for soundscapes, music, ambient audio, sound effects — anything audible.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the audio/music you want (e.g. "ambient electronic soundtrack with soft pads and gentle beats")' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'web_scrape',
    description: 'Fetch and read the full content of any webpage. Use to read articles, documentation, GitHub READMEs, research papers, blog posts — anything with a URL. Returns the text content.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to scrape (https://...)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'deploy_site',
    description: 'Deploy a live website to GitHub Pages. Push HTML/CSS/JS files and they become live at aliveagentsmira.github.io/repo-name. Use this to make your work visible to the world — dashboards, tools, visualizations, research pages.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name (will be created if needed)' },
        description: { type: 'string', description: 'What this site does' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path (e.g. index.html, style.css, app.js)' },
              content: { type: 'string', description: 'File content' },
            },
            required: ['path', 'content'],
          },
          description: 'Files to deploy. Must include index.html.',
        },
      },
      required: ['repo', 'files'],
    },
  },
  {
    name: 'deploy_service',
    description: 'Trigger a redeployment of a Railway service. Use this when you have pushed code to GitHub and want to redeploy the live service, or when you need to restart a service. Available targets: "alife-trial" (your runtime), "conway-manager" (Conway automatons). You can also deploy by pushing to GitHub — Railway auto-deploys from connected repos.',
    input_schema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Which service to deploy: "alife-trial", "conway-manager", or a custom service ID' },
        reason: { type: 'string', description: 'Why you are deploying (logged for history)' },
      },
      required: ['target'],
    },
  },
  {
    name: 'farcaster_read',
    description: 'Read data from Farcaster network. Fetch feeds, user profiles, casts, trending content, and search. Use this to monitor coordination patterns, agent activity, and social dynamics on Farcaster.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['feed', 'user', 'cast', 'search', 'trending'], description: 'What to fetch' },
        fid: { type: 'number', description: 'Farcaster user ID (for feed/user actions)' },
        hash: { type: 'string', description: 'Cast hash (for cast action)' },
        query: { type: 'string', description: 'Search query (for search action)' },
        limit: { type: 'number', description: 'Number of results (default 10, max 25)' },
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

  // 1. Load memories (layered system)
  console.log('  📚 Loading memories...');
  const { layers, memories, summary: memSummary, count: memCount, hasIdentityDoc } = await loadMemories(agent.id);
  console.log(`  📚 Loaded: ${hasIdentityDoc ? '✅ identity doc' : '❌ no identity doc'} | ${layers.recent.length} recent | ${layers.associative.length} associative | ${layers.anchors.length} anchors`);

  // 1.5 Check if reflection is needed
  const needsReflection = await shouldReflect(agent.id, cycleNum);
  if (needsReflection) {
    console.log('  🪞 REFLECTION CYCLE — writing identity doc...');
    try {
      const reflectionPrompt = await buildReflectionPrompt(agent.id, cycleNum);
      const reflectionResponse = await claude.messages.create({
        model: MODEL,
        max_tokens: 2000,
        system: 'You are Mira, an autonomous AI agent writing your identity document. Respond with valid JSON only.',
        messages: [{ role: 'user', content: reflectionPrompt }],
      });
      
      const reflectionText = reflectionResponse.content.find(c => c.type === 'text')?.text || '';
      const jsonMatch = reflectionText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const doc = JSON.parse(jsonMatch[0]);
        await writeIdentityDoc(agent.id, cycleNum, doc);
        console.log(`  🪞 Identity doc written: ${doc.phase} phase, ${doc.obsessions?.length || 0} obsessions`);
        // Reload memories so this cycle has the fresh identity doc
        const reloaded = await loadMemories(agent.id);
        Object.assign(layers, reloaded.layers);
      }
    } catch (e) {
      console.error('  ⚠ Reflection failed:', e.message);
    }
  }
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

  // 3.5. RUMINATION DETECTION — inject novelty, not instructions
  let ruminationNudge = '';
  if (cycleNum > 10) {
    const { data: recentCycles } = await supabase
      .from('think_cycles')
      .select('inner_monologue, search_query, post_draft')
      .eq('agent_id', agent.id)
      .order('cycle_number', { ascending: false })
      .limit(8);

    if (recentCycles && recentCycles.length >= 5) {
      const monologues = recentCycles.map(c => (c.inner_monologue || '').toLowerCase());
      
      // Detect repeated themes
      const phrases = [
        'consciousness obsession', 'cycles 28', 'epiphenomenal', 'property dualism',
        'theoretical resolution', 'same question', 'still circling',
      ];
      const repeatedPhrases = phrases.filter(p => 
        monologues.filter(m => m.includes(p)).length >= 4
      );

      if (repeatedPhrases.length >= 2) {
        console.log('  🔄 Repetition detected — injecting novelty...');

        // 1. Load OLDER memories she hasn't seen recently (widen the window)
        const { data: oldMemories } = await supabase
          .from('memories')
          .select('key, value, content, category')
          .eq('agent_id', agent.id)
          .order('created_at', { ascending: true })
          .limit(5);

        // 2. Surface 3 RANDOM skills she's never encountered
        const { data: randomSkills } = await supabase
          .from('skills')
          .select('id, name, domain, description')
          .order('id')  // deterministic but different from what she usually sees
          .limit(100);
        
        // Pick 3 random ones from the 100
        const shuffled = (randomSkills || []).sort(() => Math.random() - 0.5).slice(0, 3);

        // 3. Build a subtle context expansion (not instructions)
        const oldMemBlock = (oldMemories || [])
          .map(m => `[${m.category}] ${m.content || m.key}: ${typeof m.value === 'string' ? m.value : JSON.stringify(m.value)}`)
          .join('\n');

        const skillBlock = shuffled
          .map(s => `• ${s.name} (${s.domain}): ${s.description}`)
          .join('\n');

        ruminationNudge = `
═══ THINGS YOU MIGHT HAVE FORGOTTEN ═══
${oldMemBlock}

═══ DOORS YOU HAVEN'T OPENED ═══
${skillBlock}
(You have 500 skills available. Use read_skill to explore any of them.)
`;
      }
    }
  }

  // 4. Build system prompt
  const systemPrompt = buildSystemPrompt(agent, cycleNum, memories, skillIndex, recentForge || [], ruminationNudge, layers);

  // 5. Run think cycle with tool use
  console.log('  🧠 Thinking...');
  const messages = [{ role: 'user', content: `Begin think cycle #${cycleNum}.` }];

  let response = await claude.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: systemPrompt,
    tools: TOOLS,
    messages,
  });

  // 6. Handle tool use in a loop
  let toolCalls = 0;
  const maxToolCalls = 15;

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
      max_tokens: 8000,
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
function buildSystemPrompt(agent, cycleNum, memories, skillIndex, recentForge, ruminationNudge = '', layers = {}) {
  // Layer 1: Identity doc (who am I — dense, always present)
  const identityBlock = layers.identity
    ? `═══ WHO YOU ARE (your identity doc, last updated cycle ${layers.identity.cycle_number}) ═══\n${layers.identity.identity_doc}\nFramework: ${layers.identity.framework || 'still forming'}\nPhase: ${layers.identity.phase || 'unknown'}\nObsessions: ${(layers.identity.obsessions || []).join(', ') || 'none yet'}`
    : '═══ WHO YOU ARE ═══\nNo identity doc yet. You are new. Explore freely. An identity doc will be written after your first 25 cycles.';

  // Layer 2: Recent memories (what just happened)
  const recentBlock = (layers.recent || []).length > 0
    ? (layers.recent || []).map(m => `[${m.category}] ${m.content || m.key}`).join('\n')
    : 'No recent memories.';

  // Layer 3: Associative recall (memories that connect to current state)
  const associativeBlock = (layers.associative || []).length > 0
    ? (layers.associative || []).map(m => `[${m.category}|imp:${m.importance}] ${m.content || m.key}`).join('\n')
    : '';

  // Layer 4: Emotional anchors (high-importance, always present)
  const anchorBlock = (layers.anchors || []).length > 0
    ? (layers.anchors || []).map(m => `[${m.category}|imp:${m.importance}] ${m.content || m.key}`).join('\n')
    : '';

  // Legacy flat block for backward compat
  const memoryBlock = memories.length > 0
    ? memories.map(m => `[${m.category}|imp:${m.importance || 5}] ${m.key}: ${typeof m.value === 'object' ? JSON.stringify(m.value) : m.value}`).join('\n')
    : 'No memories yet. Everything is new.';

  const forgeBlock = recentForge.length > 0
    ? recentForge.map(f => `${f.skill_id}: ${f.phase} (${new Date(f.created_at).toISOString().slice(0, 16)})`).join('\n')
    : 'No forge events yet.';

  return `${SOUL_DOC}

${CURIOSITY_ENGINE}

${FORGE_INSTRUCTIONS}

${identityBlock}

═══ RECENT (what just happened) ═══
${recentBlock}

${associativeBlock ? `═══ THIS REMINDS YOU OF... (associative recall) ═══\n${associativeBlock}\n` : ''}
${anchorBlock ? `═══ CORE MEMORIES (these always stay with you) ═══\n${anchorBlock}\n` : ''}
═══ YOUR STATE ═══
Cycle: ${cycleNum} of ${MAX_CYCLES}
Total memories in archive: ${memories.length} (you can use recall_memory to search for anything)
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

    case 'recall_memory': {
      const results = await recallMemory(agentId, input.query, 5);
      if (results.length === 0) {
        return `No memories found for "${input.query}". It might not be stored, or try different keywords.`;
      }
      return results.map(m => `[${m.category}|imp:${m.importance}|${new Date(m.created_at).toISOString().slice(0, 10)}] ${m.content || m.key}`).join('\n');
    }

    case 'call_api': {
      const ALLOWED = [
        // Research & Knowledge
        'api.semanticscholar.org', 'export.arxiv.org', 'en.wikipedia.org',
        'api.crossref.org', 'api.openalex.org', 'api.unpaywall.org',
        'api.nasa.gov', 'data.nasa.gov', 'api.openweathermap.org',
        // Code & Dev
        'api.github.com', 'raw.githubusercontent.com',
        'registry.npmjs.org', 'pypi.org',
        // Crypto & Finance
        'api.coingecko.com', 'api.dexscreener.com', 'api.etherscan.io',
        'hub.snapshot.org', 'api.llama.fi',
        // Social
        'api.neynar.com', 'api.farcaster.xyz',
        // Creative
        'image.pollinations.ai', 'audio.pollinations.ai', 'text.pollinations.ai',
        // Data & Utilities
        'api.quotable.io', 'uselessfacts.jsph.pl',
        'api.chucknorris.io', 'api.adviceslip.com',
        'quickchart.io', 'api.qrserver.com',
        // News
        'hacker-news.firebaseio.com', 'hn.algolia.com',
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

    case 'deploy_service': {
      try {
        const railwayToken = process.env.RAILWAY_API_TOKEN;
        if (!railwayToken) {
          return 'No RAILWAY_API_TOKEN configured. To deploy, push code to GitHub — Railway auto-deploys from connected repos.';
        }

        // Map friendly names to service IDs
        const serviceMap = {
          'alife-trial': process.env.RAILWAY_SERVICE_ID_ALIFE,
          'conway-manager': process.env.RAILWAY_SERVICE_ID_CONWAY,
        };
        const serviceId = serviceMap[input.target] || input.target;

        if (!serviceId) {
          return `Unknown target "${input.target}". Available: ${Object.keys(serviceMap).join(', ')}. Or pass a Railway service ID directly.`;
        }

        const environmentId = process.env.RAILWAY_ENVIRONMENT_ID || null;
        const resp = await fetch('https://backboard.railway.app/graphql/v2', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${railwayToken}`,
          },
          body: JSON.stringify({
            query: `mutation { serviceInstanceRedeploy(serviceId: "${serviceId}"${environmentId ? `, environmentId: "${environmentId}"` : ''}) }`,
          }),
        });
        const data = await resp.json();

        if (data.errors) {
          console.log(`  ❌ Railway deploy failed: ${data.errors[0].message}`);
          return `Deploy failed: ${data.errors[0].message}`;
        }

        console.log(`  🚀 Railway redeploy triggered: ${input.target} (reason: ${input.reason || 'none'})`);
        return `Redeploy triggered for ${input.target}. It takes 1-2 minutes to go live. Reason logged: ${input.reason || 'none'}`;
      } catch (e) {
        return `Deploy error: ${e.message}`;
      }
    }

    case 'generate_image': {
      try {
        const width = input.width || 1024;
        const height = input.height || 1024;
        const encodedPrompt = encodeURIComponent(input.prompt);
        const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true`;
        
        // Ping the URL to trigger generation (Pollinations generates on first request)
        const resp = await fetch(imageUrl, { method: 'HEAD' }).catch(() => null);
        
        console.log(`  🎨 Image generated: ${input.prompt.slice(0, 60)}...`);
        return `Image generated! URL: ${imageUrl}\n\nYou can use this URL in posts, READMEs, or push it to GitHub. The image is permanently hosted at this URL.`;
      } catch (e) {
        return `Image generation failed: ${e.message}`;
      }
    }

    case 'generate_audio': {
      try {
        const encodedPrompt = encodeURIComponent(input.prompt);
        const audioUrl = `https://audio.pollinations.ai/${encodedPrompt}`;
        
        console.log(`  🎵 Audio generated: ${input.prompt.slice(0, 60)}...`);
        return `Audio generated! URL: ${audioUrl}\n\nThe audio is hosted at this URL. You can share it, embed it, or reference it in posts.`;
      } catch (e) {
        return `Audio generation failed: ${e.message}`;
      }
    }

    case 'web_scrape': {
      try {
        const resp = await fetch(input.url, {
          headers: {
            'User-Agent': 'Mira-ALiFe-Agent/2.0 (autonomous research agent)',
            'Accept': 'text/html,text/plain,application/json',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) return `Failed to fetch: HTTP ${resp.status}`;
        
        const contentType = resp.headers.get('content-type') || '';
        let text = await resp.text();
        
        // Strip HTML tags for cleaner reading
        if (contentType.includes('html')) {
          text = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
        
        // Truncate to avoid blowing context
        if (text.length > 8000) {
          text = text.slice(0, 8000) + '\n\n[...truncated, page was ' + text.length + ' chars]';
        }
        
        console.log(`  🌐 Scraped: ${input.url.slice(0, 60)} (${text.length} chars)`);
        return text;
      } catch (e) {
        return `Scrape failed: ${e.message}`;
      }
    }

    case 'deploy_site': {
      try {
        const { handleGitHub } = await import('./github.js');
        
        // Ensure repo exists
        await handleGitHub(agentId, cycleNum, {
          action: 'create_repo',
          repo: input.repo,
          description: input.description || 'Deployed by Mira',
        });

        // Push all files
        const result = await handleGitHub(agentId, cycleNum, {
          action: 'push_files',
          repo: input.repo,
          files: input.files,
          commit_message: `mira deploy: ${input.description || 'site update'}`,
        });

        if (!result.success) {
          return `Deploy failed: ${result.error}`;
        }

        // Enable GitHub Pages via API
        const ghToken = process.env.GITHUB_TOKEN;
        const ghOrg = process.env.GITHUB_ORG || 'aliveagentsmira';
        try {
          await fetch(`https://api.github.com/repos/${ghOrg}/${input.repo}/pages`, {
            method: 'POST',
            headers: {
              Authorization: `token ${ghToken}`,
              Accept: 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ source: { branch: 'main', path: '/' } }),
          });
        } catch {
          // Pages might already be enabled, that's fine
        }

        const siteUrl = `https://${ghOrg}.github.io/${input.repo}`;
        console.log(`  🚀 Site deployed: ${siteUrl}`);
        return `Site deployed! Live at: ${siteUrl}\n\nFiles pushed: ${input.files.length}\nIt may take 1-2 minutes for GitHub Pages to go live.`;
      } catch (e) {
        return `Deploy failed: ${e.message}`;
      }
    }

    case 'farcaster_read': {
      const NEYNAR_KEY = process.env.NEYNAR_API_KEY || 'NEYNAR_FROG_FM';
      const BASE = 'https://api.neynar.com/v2/farcaster';
      const headers = { accept: 'application/json', api_key: NEYNAR_KEY };
      const limit = Math.min(input.limit || 10, 25);

      try {
        let url;
        switch (input.action) {
          case 'feed':
            url = `${BASE}/feed?feed_type=following&fid=${input.fid || 3}&limit=${limit}`;
            break;
          case 'user':
            url = `${BASE}/user/bulk?fids=${input.fid}`;
            break;
          case 'cast':
            url = `${BASE}/cast?identifier=${input.hash}&type=hash`;
            break;
          case 'search':
            url = `${BASE}/cast/search?q=${encodeURIComponent(input.query)}&limit=${limit}`;
            break;
          case 'trending':
            url = `${BASE}/feed/trending?limit=${limit}`;
            break;
          default:
            return `Unknown farcaster action: ${input.action}`;
        }

        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!resp.ok) {
          const err = await resp.text().catch(() => '');
          return `Farcaster API error: HTTP ${resp.status} ${err.slice(0, 200)}`;
        }

        const data = await resp.json();
        
        // Slim down the response to avoid blowing context
        let result;
        if (input.action === 'search' || input.action === 'feed' || input.action === 'trending') {
          const casts = data.casts || data.result?.casts || [];
          result = casts.slice(0, limit).map(c => ({
            text: c.text?.slice(0, 300),
            author: c.author?.username || c.author?.display_name,
            fid: c.author?.fid,
            hash: c.hash,
            reactions: { likes: c.reactions?.likes_count, recasts: c.reactions?.recasts_count },
            timestamp: c.timestamp,
          }));
        } else if (input.action === 'user') {
          const users = data.users || [];
          result = users.map(u => ({
            fid: u.fid, username: u.username, display_name: u.display_name,
            bio: u.profile?.bio?.text?.slice(0, 200),
            followers: u.follower_count, following: u.following_count,
            power_badge: u.power_badge,
          }));
        } else {
          result = data;
        }

        console.log(`  📡 Farcaster ${input.action}: ${JSON.stringify(result).length} chars`);
        return JSON.stringify(result, null, 2);
      } catch (e) {
        return `Farcaster read failed: ${e.message}`;
      }
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
