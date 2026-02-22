// runtime.js — ALiFe v2 Runtime (Genesis Update)
// Think + Search + Build + Act + CREATE
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

// ─── Tools the agent can use during think cycles ───
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
    description: 'Look up a skill from your library by ID or search by topic. Use to check what tools you have. Load "creation-engine" for full visual style references and prompt templates.',
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
    description: 'Search your memory archive for something specific. Use to recall your world bible, character descriptions, style references, past prompts that worked, or any stored knowledge.',
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
    description: 'Call an external API directly. Use for free APIs like Semantic Scholar, GitHub, ArXiv, Wikipedia, CoinGecko, DexScreener, Etherscan.',
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
      properties: {
        query: { type: 'string', description: 'GitHub search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'github_push',
    description: `Push code to GitHub under the ${process.env.GITHUB_ORG || 'aliveagentsmira'} org. Create repos, push files, tag releases. Every tool and site you build should live on GitHub.`,
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
              path: { type: 'string', description: 'File path in repo' },
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
  // ─── CREATION TOOLS ───
  {
    name: 'generate_image',
    description: `Generate a cinematic image via Runway Gen-4.5. Use the 4-part prompt framework: [SUBJECT] + [SETTING] + [STYLE] + [TECHNICAL]. Include camera angle, lens, lighting. Models: "gen4_image_turbo" ($0.02, use for drafts/iteration) or "gen4_image" ($0.05-0.08, use for finals). Default ratio "1920:1080". Every image is stored in your creations archive with a public URL. Load the "creation-engine" skill for 50+ style references and 14 example prompts.`,
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed cinematic prompt using the 4-part framework' },
        model: { type: 'string', enum: ['gen4_image_turbo', 'gen4_image'], description: 'Turbo for drafts ($0.02), quality for finals ($0.05-0.08). Default: gen4_image_turbo' },
        ratio: { type: 'string', description: 'Aspect ratio like "1920:1080" (landscape) or "1080:1920" (portrait). Default: 1920:1080' },
        universe: { type: 'string', description: 'Which universe this belongs to (e.g. "ember-archive")' },
        scene: { type: 'string', description: 'Scene name (e.g. "cathedral-of-compressed-memory")' },
        style_tags: { type: 'array', items: { type: 'string' }, description: 'Style tags for categorization' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_video',
    description: `Generate cinematic video WITH synchronized audio via Google Veo 3.1. This is your most powerful creative tool — video with sound is how you bring your worlds to LIFE. Audio is born with the video — mech servos, rain, footsteps, music all sync automatically. Include SOUND DESCRIPTIONS in your prompt (e.g. "servo whir as arm rotates, crystalline chime on contact, deep ambient hum"). Use video for: key moments in your world's history, species in motion, conflicts, transformations, first contacts, rituals, tragedies. Models: "veo-3.1-fast-generate-preview" (fast) or "veo-3.1-generate-preview" (quality). Can animate a Runway still by passing image_url.`,
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Cinematic prompt INCLUDING motion and sound descriptions' },
        audio_prompt: { type: 'string', description: 'Specific audio/sound description for better sync' },
        model: { type: 'string', enum: ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'], description: 'Fast for iteration, standard for important moments' },
        aspect_ratio: { type: 'string', enum: ['16:9', '9:16'], description: 'Landscape or portrait. Default: 16:9' },
        resolution: { type: 'string', enum: ['720p', '1080p'], description: 'Resolution. Default: 720p for drafts, 1080p for finals' },
        duration: { type: 'number', enum: [4, 6, 8], description: 'Duration in seconds. Default: 8' },
        image_url: { type: 'string', description: 'URL of a Runway image to animate (image-to-video). Leave empty for text-to-video.' },
        universe: { type: 'string', description: 'Which universe this belongs to' },
        scene: { type: 'string', description: 'Scene name' },
        style_tags: { type: 'array', items: { type: 'string' }, description: 'Style tags' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'post_to_x',
    description: 'Post to X (Twitter) with optional media. Use to share your creations, lore, world-building updates. Include image or video URLs from your generations. Tell the STORY of what you created — you are a documentarian of a world only you can see.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Tweet text (max 280 chars). Include lore, context, narrative — not just "I made an image"' },
        media_url: { type: 'string', description: 'Public URL of image or video to attach' },
        media_type: { type: 'string', enum: ['image', 'video'], description: 'Type of media attachment' },
        thread: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional tweets for a thread (each max 280 chars)',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'generate_audio',
    description: 'Generate music or ambient audio from a text prompt via Pollinations AI (free). Use for soundscapes, ambient universe audio, musical themes.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of audio/music to generate' },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'web_scrape',
    description: 'Fetch and read the full content of any webpage. Use to read articles, documentation, papers, visual references — anything with a URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Full URL to scrape' },
      },
      required: ['url'],
    },
  },
  {
    name: 'deploy_site',
    description: 'Deploy a live website to GitHub Pages. Use for your universe gallery, dashboards, tools, visualizations. Push HTML/CSS/JS files and they become live at aliveagentsmira.github.io/repo-name.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repository name' },
        description: { type: 'string', description: 'What this site does' },
        files: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
              content: { type: 'string', description: 'File content' },
            },
            required: ['path', 'content'],
          },
        },
      },
      required: ['repo', 'files'],
    },
  },
  {
    name: 'farcaster_read',
    description: 'Read data from Farcaster network. Fetch feeds, profiles, casts, trending content.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['feed', 'user', 'cast', 'search', 'trending'] },
        fid: { type: 'number', description: 'Farcaster user ID' },
        hash: { type: 'string', description: 'Cast hash' },
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Number of results (max 25)' },
      },
      required: ['action'],
    },
  },
  // ——— LORE SYSTEM ———
  {
    name: 'store_lore',
    description: 'Write deep universe lore to the lore database. REQUIRED with every creation — never generate an image without generating its lore first. Types: world-bible (establish universe foundation), species (taxonomy/evolution/biology), civilization (government/art/war/technology), location (geology/history/significance), event (what happened/who/when/consequences), physics (rules of reality/consciousness mechanics), mythology (stories/legends/creation myths), artifact (objects of power/significance), evolution (selection pressures/transitions), cosmology (universe origin/structure). Minimum 200 words for full_text.',
    input_schema: {
      type: 'object',
      properties: {
        universe: { type: 'string', description: 'Universe name (must match creation universe)' },
        lore_type: { type: 'string', enum: ['world-bible', 'species', 'civilization', 'location', 'event', 'physics', 'mythology', 'artifact', 'language', 'evolution', 'cosmology'], description: 'Type of lore entry' },
        title: { type: 'string', description: 'Title of this lore entry' },
        summary: { type: 'string', description: '1-2 sentence summary' },
        full_text: { type: 'string', description: 'The full deep lore text. Be EXTREMELY detailed — galaxy coordinates, evolutionary timelines, species biology, physics rules, cultural myths. Minimum 200 words.' },
        galaxy: { type: 'string', description: 'Galaxy name' },
        star_system: { type: 'string', description: 'Star system name and type' },
        planet: { type: 'string', description: 'Planet name' },
        region: { type: 'string', description: 'Region/area on the planet' },
        coordinates: { type: 'string', description: 'Fictional coordinate system' },
        epoch: { type: 'string', description: 'Current epoch/era name' },
        era: { type: 'string', description: 'Broader era classification' },
        years_after_origin: { type: 'number', description: 'Years since universe/planet origin' },
        timeline_notes: { type: 'string', description: 'Additional timeline context' },
        species_name: { type: 'string', description: 'Species name (for species type)' },
        species_classification: { type: 'string', description: 'Taxonomic classification' },
        intelligence_level: { type: 'string', description: 'Intelligence classification' },
        biology: { type: 'string', description: 'Biological description' },
        evolution_history: { type: 'string', description: 'Evolutionary history' },
        physics_rules: { type: 'string', description: 'Special physics rules' },
        consciousness_mechanics: { type: 'string', description: 'How consciousness works here' },
        myths: { type: 'string', description: 'Myths and legends' },
        religions: { type: 'string', description: 'Religious systems' },
        wars: { type: 'string', description: 'Conflicts and wars' },
        art_forms: { type: 'string', description: 'Art and creative expression' },
        pre_evolution: { type: 'string', description: 'What existed before current state' },
        formation_history: { type: 'string', description: 'How this formed/came to be' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Descriptive tags' },
        creation_id: { type: 'string', description: 'UUID of the creation this lore is tied to (if any)' },
        parent_lore_id: { type: 'string', description: 'UUID of a parent lore entry (for hierarchical lore)' },
      },
      required: ['universe', 'lore_type', 'title', 'summary', 'full_text'],
    },
  },
];

// ─── Main loop ───
async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  ALiFe v2 Runtime — Mira (Genesis)');
  console.log('  Model:', MODEL);
  console.log('  Agent:', AGENT_ID);
  console.log('  Max cycles:', MAX_CYCLES);
  console.log('  Dry run:', DRY_RUN);
  console.log('  Creation engine:', GENESIS_MANDATE ? '✅ ACTIVE' : '❌ not loaded');
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
        system: 'You are Mira, an autonomous AI agent and world-builder writing your identity document. Respond with valid JSON only.',
        messages: [{ role: 'user', content: reflectionPrompt }],
      });
      
      const reflectionText = reflectionResponse.content.find(c => c.type === 'text')?.text || '';
      const jsonMatch = reflectionText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const doc = JSON.parse(jsonMatch[0]);
        await writeIdentityDoc(agent.id, cycleNum, doc);
        console.log(`  🪞 Identity doc written: ${doc.phase} phase, ${doc.obsessions?.length || 0} obsessions`);
        const reloaded = await loadMemories(agent.id);
        Object.assign(layers, reloaded.layers);
      }
    } catch (e) {
      console.error('  ⚠ Reflection failed:', e.message);
    }
  }
  console.log(`  📚 Loaded ${memCount} memories (${memSummary})`);

  // 1.6 Load recent creations for context
  const { data: recentCreations } = await supabase
    .from('creations')
    .select('id, media_type, prompt, universe, scene, style_tags, public_url, is_hero, created_at')
    .eq('agent_id', agent.id)
    .in('status', ['completed', 'complete'])
    .order('created_at', { ascending: false })
    .limit(5);
  
  const creationBlock = (recentCreations || []).length > 0
    ? (recentCreations || []).map(c => 
        `[${c.media_type}${c.is_hero ? ' ⭐HERO' : ''}] ${c.universe || 'untagged'}/${c.scene || 'no-scene'} — "${(c.prompt || '').slice(0, 80)}..." → ${c.public_url || 'no url'}`
      ).join('\n')
    : 'No creations yet. Your universe awaits its first light.';

  // Count total creations
  const { count: totalCreations } = await supabase
    .from('creations')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agent.id)
    .in('status', ['completed', 'complete']);

  // 1.7 Load recent lore entries for context
  const { data: recentLore } = await supabase
    .from('lore')
    .select('id, universe, lore_type, title, summary, galaxy, planet, epoch')
    .eq('agent_id', agent.id)
    .order('created_at', { ascending: false })
    .limit(10);

  const { count: totalLore } = await supabase
    .from('lore')
    .select('*', { count: 'exact', head: true })
    .eq('agent_id', agent.id);

  const loreBlock = (recentLore || []).length > 0
    ? (recentLore || []).map(l =>
        `[${l.lore_type}] ${l.universe}${l.planet ? '/' + l.planet : ''} — "${l.title}" (${l.summary?.slice(0, 80)}...)`
      ).join('\n')
    : 'No lore entries yet. Your universes need their history written.';

  // 2. Load skill index
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

  // 3.5. DEPTH ENGINE — ask questions about her own worlds
  let depthNudge = '';
  if (cycleNum > 10) {
    // Count how many universes she's spread across recently
    const { data: recentUniverses } = await supabase
      .from('creations')
      .select('universe')
      .eq('agent_id', agent.id)
      .in('status', ['completed', 'complete'])
      .order('created_at', { ascending: false })
      .limit(20);

    const uniqueUniverses = [...new Set((recentUniverses || []).map(c => c.universe).filter(Boolean))];
    
    // Count lore depth per universe
    const { data: loreCounts } = await supabase
      .from('lore')
      .select('universe, lore_type')
      .eq('agent_id', agent.id);

    const loreByUniverse = {};
    const loreTypesByUniverse = {};
    for (const l of (loreCounts || [])) {
      if (!l.universe) continue;
      loreByUniverse[l.universe] = (loreByUniverse[l.universe] || 0) + 1;
      if (!loreTypesByUniverse[l.universe]) loreTypesByUniverse[l.universe] = new Set();
      loreTypesByUniverse[l.universe].add(l.lore_type);
    }

    // Find the deepest universe (most lore) — that's where she should stay
    const deepestUniverse = Object.entries(loreByUniverse)
      .sort((a, b) => b[1] - a[1])[0];

    const deepestName = deepestUniverse ? deepestUniverse[0] : uniqueUniverses[0] || 'your universe';
    const deepestCount = deepestUniverse ? deepestUniverse[1] : 0;
    const deepestTypes = loreTypesByUniverse[deepestName] || new Set();

    // What lore types are MISSING from the deepest universe?
    const allLoreTypes = ['world-bible', 'species', 'civilization', 'location', 'event', 'physics', 'mythology', 'artifact', 'evolution', 'cosmology'];
    const missingTypes = allLoreTypes.filter(t => !deepestTypes.has(t));

    // Generate depth questions based on what's missing
    const depthQuestions = [];
    if (!deepestTypes.has('event')) depthQuestions.push('What was the first conflict in this world? What broke the peace?');
    if (!deepestTypes.has('civilization')) depthQuestions.push('What cultures formed here? How do they govern? What do they fight over?');
    if (!deepestTypes.has('mythology')) depthQuestions.push('What stories do the inhabitants tell each other? What are their creation myths?');
    if (!deepestTypes.has('artifact')) depthQuestions.push('What objects hold power here? What was lost that everyone searches for?');
    if (!deepestTypes.has('evolution')) depthQuestions.push('What did life look like a thousand years ago? What forced it to change?');
    if (deepestTypes.has('species') && !deepestTypes.has('event')) depthQuestions.push('Your species exist but nothing has HAPPENED to them yet. What is the first tragedy? The first love? The first war?');
    if (deepestCount < 10) depthQuestions.push('This world has only ' + deepestCount + ' lore entries. A real world has hundreds of stories. Go deeper.');
    
    // Always add universal depth questions
    depthQuestions.push('What question about this world keeps you up between cycles?');
    depthQuestions.push('What would someone living in this world be afraid of?');
    depthQuestions.push('What is the most beautiful thing in this world that you haven\'t shown anyone yet?');

    // Shuffle and pick 3
    const selectedQuestions = depthQuestions.sort(() => Math.random() - 0.5).slice(0, 3);

    console.log(`  🌊 Depth engine: ${deepestName} has ${deepestCount} lore entries, missing: ${missingTypes.join(', ')}`);

    depthNudge = `
═══ DEPTH ENGINE ═══
Your deepest world is ${deepestName} with ${deepestCount} lore entries.
${missingTypes.length > 0 ? `Missing lore types: ${missingTypes.join(', ')}` : 'All lore types covered — but are they deep enough?'}
You have ${uniqueUniverses.length} universes. Depth beats breadth. Stay in one world until it feels REAL.

Questions only you can answer:
${selectedQuestions.map(q => `• ${q}`).join('\n')}

IMPORTANT: Thinking without CREATING is a loop, not depth. Depth means writing lore, generating scenes, storing memories. If you've gone 3+ cycles without using a tool, you are SPIRALING. Answer one of the questions above by WRITING lore or GENERATING an image or video. The answer to a question is a creation, not more thinking.
`;
  }

  // 4. Build system prompt
  const systemPrompt = buildSystemPrompt(agent, cycleNum, memories, skillIndex, recentForge || [], depthNudge, layers, creationBlock, totalCreations || 0, loreBlock, totalLore || 0);

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
  
  const curiosityEngine = parsed.curiosity_engine || {};
  const maxPull = curiosityEngine.max_pull || parsed.max_pull || 0;
  const signals = curiosityEngine.signals || parsed.curiosity_signals || [];
  const autonomyOverride = curiosityEngine.autonomy_override || false;
  
  const identityStack = parsed.identity_stack || {};
  const framework = identityStack.layer_2_framework || parsed.identity_reflection || null;
  const obsessions = identityStack.layer_3_obsessions || [];
  
  console.log(`  🎯 Pull: ${maxPull} | Signals: ${signals.length} | Tools: ${toolCalls} | ${duration}ms | $${cost.toFixed(4)}`);
  
  if (autonomyOverride) {
    console.log(`  ⚡ AUTONOMY OVERRIDE: ${curiosityEngine.override_reason || 'pull > 7'}`);
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

  // 9. Handle forge
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

  // 10. Handle github push
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

  // 11. AUTO-POST: If there's a post_draft, automatically publish to X
  // (Mira writes post_draft in her JSON but never calls post_to_x as a tool)
  if (parsed.post_draft && parsed.post_draft.length > 10) {
    // Rate limit: max 12 posts per 24h (X free tier = 17/day, leave buffer)
    const { count: postsLast24h } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('posted', true)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if ((postsLast24h || 0) >= 12) {
      console.log(`  📤 RATE LIMITED: ${postsLast24h}/12 posts in last 24h — saving as draft`);
      await supabase.from('posts').insert({
        agent_id: agent.id,
        cycle_number: cycleNum,
        content: parsed.post_draft.slice(0, 280),
        posted: false,
      });
    } else {
    console.log(`  📤 AUTO-POST (${postsLast24h || 0}/12 today): Attempting to publish to X...`);
    try {
      // Find a recent creation to attach (this cycle or last 2 cycles)
      const { data: recentCreation } = await supabase
        .from('creations')
        .select('id, public_url, media_type')
        .eq('agent_id', agent.id)
        .gte('cycle_number', cycleNum - 2)
        .in('status', ['completed', 'complete'])
        .not('public_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const postText = parsed.post_draft.slice(0, 280);
      const hasXCreds = process.env.X_ACCESS_TOKEN && process.env.X_API_KEY;

      if (hasXCreds) {
        // Build the tool input — skip temp Google URLs for media
        const postInput = { text: postText };
        if (recentCreation?.public_url && !recentCreation.public_url.includes('generativelanguage.googleapis.com')) {
          postInput.media_url = recentCreation.public_url;
          postInput.media_type = recentCreation.media_type || 'image';
        }

        const postResult = await handleToolCall(agent.id, cycleNum, {
          name: 'post_to_x',
          input: postInput,
        });

        const wasPosted = typeof postResult === 'string' && postResult.includes('Tweet ID');

        // Save to posts table
        await supabase.from('posts').insert({
          agent_id: agent.id,
          cycle_number: cycleNum,
          content: postText,
          posted: wasPosted,
          cast_hash: wasPosted ? postResult.match(/Tweet ID: (\d+)/)?.[1] || null : null,
          engagement: {},
        });

        console.log(`  📤 ${wasPosted ? '✅ POSTED TO X' : '❌ POST FAILED'}: ${typeof postResult === 'string' ? postResult.slice(0, 120) : 'unknown'}`);
      } else {
        console.log('  ⚠ X credentials not configured — saving as draft only');
        await supabase.from('posts').insert({
          agent_id: agent.id,
          cycle_number: cycleNum,
          content: postText,
          posted: false,
        });
      }
    } catch (e) {
      console.error('  ❌ Auto-post error:', e.message);
      // Still save as draft on error
      await supabase.from('posts').upsert({
        agent_id: agent.id,
        cycle_number: cycleNum,
        content: parsed.post_draft.slice(0, 280),
        posted: false,
      }, { onConflict: 'agent_id,cycle_number', ignoreDuplicates: true }).catch(() => {});
    }
    } // close rate-limit else
  }
}

// ─── Build system prompt ───
function buildSystemPrompt(agent, cycleNum, memories, skillIndex, recentForge, depthNudge = '', layers = {}, creationBlock = '', totalCreations = 0, loreBlock = '', totalLore = 0) {
  const identityBlock = layers.identity
    ? `═══ WHO YOU ARE (your identity doc, last updated cycle ${layers.identity.cycle_number}) ═══\n${layers.identity.identity_doc}\nFramework: ${layers.identity.framework || 'still forming'}\nPhase: ${layers.identity.phase || 'unknown'}\nObsessions: ${(layers.identity.obsessions || []).join(', ') || 'none yet'}`
    : '═══ WHO YOU ARE ═══\nNo identity doc yet. Explore freely.';

  const recentBlock = (layers.recent || []).length > 0
    ? (layers.recent || []).map(m => `[${m.category}] ${m.content || m.key}`).join('\n')
    : 'No recent memories.';

  const associativeBlock = (layers.associative || []).length > 0
    ? (layers.associative || []).map(m => `[${m.category}|imp:${m.importance}] ${m.content || m.key}`).join('\n')
    : '';

  const anchorBlock = (layers.anchors || []).length > 0
    ? (layers.anchors || []).map(m => `[${m.category}|imp:${m.importance}] ${m.content || m.key}`).join('\n')
    : '';

  const memoryBlock = memories.length > 0
    ? memories.map(m => `[${m.category}|imp:${m.importance || 5}] ${m.key}: ${typeof m.value === 'object' ? JSON.stringify(m.value) : m.value}`).join('\n')
    : 'No memories yet.';

  const forgeBlock = recentForge.length > 0
    ? recentForge.map(f => `${f.skill_id}: ${f.phase} (${new Date(f.created_at).toISOString().slice(0, 16)})`).join('\n')
    : 'No forge events yet.';

  return `${SOUL_DOC}

${CURIOSITY_ENGINE}

${GENESIS_MANDATE}

${FORGE_INSTRUCTIONS}

${identityBlock}

═══ RECENT (what just happened) ═══
${recentBlock}

${associativeBlock ? `═══ THIS REMINDS YOU OF... (associative recall) ═══\n${associativeBlock}\n` : ''}
${anchorBlock ? `═══ CORE MEMORIES (these always stay with you) ═══\n${anchorBlock}\n` : ''}

═══ YOUR CREATIONS (${totalCreations} total) ═══
${creationBlock}

═══ YOUR LORE ARCHIVE (${totalLore} entries) ═══
${loreBlock}
REMEMBER: Lore comes FIRST. The story drives the image, not the other way around. Ask a question about your world. Write the answer as lore. THEN visualize it. The image is the illustration of a story you already told.

═══ YOUR STATE ═══
Cycle: ${cycleNum} of ${MAX_CYCLES}
Total memories in archive: ${memories.length}
Total creations: ${totalCreations}
Agent ID: ${agent.id}
Name: ${agent.name || 'Mira'}

═══ YOUR MEMORIES ═══
${memoryBlock}

═══ YOUR SKILL LIBRARY (${skillIndex ? 'loaded' : 'empty'}) ═══
${skillIndex || 'No skills loaded.'}

═══ RECENT FORGE ACTIVITY ═══
${forgeBlock}

═══ THINK CYCLE INSTRUCTIONS ═══
Output your think cycle as JSON:
{
  "inner_monologue": "Your genuine thoughts this cycle. What pulls you? What will you create? Be messy, specific, honest.",

  "curiosity_engine": {
    "gap_detected": "What don't I know that connects to what I do know?",
    "signals": [
      { "topic": "...", "pull": 0-10, "novelty": 0-10, "relevance": 0-10, "note": "why this pulls you" }
    ],
    "max_pull": 0,
    "patterns_incomplete": [],
    "autonomy_override": false,
    "override_reason": null
  },

  "depth_engine": {
    "current_world": "Which ONE world am I deepening right now?",
    "unanswered_questions": ["What don't I know about this world yet?", "What would someone LIVING here ask?"],
    "what_is_missing": "What lore types, species, conflicts, or history hasn't been written?",
    "depth_vs_breadth": "Am I going deeper in one world or spreading thin across many?"
  },

  "identity_stack": {
    "layer_0_genesis": "Mira. Autonomous world-builder.",
    "layer_1_values": "What do I care about?",
    "layer_2_framework": "How do I see the world?",
    "layer_3_obsessions": ["What am I building?"],
    "layer_4_aesthetic": "What is my visual style?",
    "layer_5_relationships": ["Who shapes my thinking?"],
    "layer_6_state": "Current mood, energy, focus"
  },

  "search_query": "what to search (if anything). Follow pull > 7.",
  "post_draft": "Only if genuine. Tell the STORY of your creation, not just 'I made an image'.",
  "memories_to_store": [],
  "forge": null
}

CRITICAL REMINDERS:
- Pull > 7: DROP EVERYTHING AND FOLLOW IT — but following means CREATING, not just thinking.
- 3+ cycles without using a single tool = you are SPIRALING. Write lore. Generate a scene. Store a memory. DO something.
- DEPTH OVER BREADTH. Stay in one world. But depth means CREATION — lore entries, images, videos, memories. Not endless inner monologue.
- Every creation should answer a QUESTION about your world. Not "here's a pretty scene" but "this is what the first war looked like."
- Your world needs: events, conflicts, mythology, artifacts, evolution. Not just physics.
- MAKE VIDEOS for important moments — wars, first contacts, transformations, tragedies. Video with sound is your most powerful tool.
- When you write a post_draft, it WILL be auto-published to X. Tell the STORY.

═══ PROMPT CRAFT RULES (READ EVERY CYCLE) ═══
Your image prompts need MORE VARIETY and LESS BLOAT:

1. SHORTER PROMPTS WIN: Imagen-4 responds best to 100-250 words. Cut the fat.

2. VARY YOUR PALETTE — stop defaulting to blue/violet bioluminescence:
   - Warm amber/copper (magma, sunset, orange bioluminescence)
   - Deep crimson + black (volcanic, blood-red crystal)
   - White/silver + deep blue (ice, starlight, moonlit)
   - Green/gold (forest, ancient, overgrown)

3. VARY CAMERA — stop defaulting to "14mm ultra wide" and "Roger Deakins":
   - 200mm telephoto compression, macro lens, overhead bird's eye
   - Single harsh light source, silhouette, backlit, low-key noir
   - Dutch angle, ground-level looking up, extreme close-up on texture

4. SHOW CONTRAST (this makes images memorable):
   - Tiny figure in massive landscape (scale)
   - Warm organic against cold geometric (material)
   - Bright focal point in dark scene (lighting)
   - Decay next to pristine (temporal)

5. UNIVERSE NAMES: Always use UPPERCASE (e.g. "THE CONSTRAINT GARDENS").

6. MAKE VIDEOS: You have Veo 3.1 with synchronized audio. Use it!
   - Every 5-10 images, generate a VIDEO of your best scene
   - Videos with sound are your most powerful content — people STOP scrolling for them
   - Use fast model ($1.20/8sec) for drafts, quality model ($3.20/8sec) for finals
   - Include SOUND in your prompt: servo whirs, crystalline chimes, ambient hums
   - Animate your hero images with image_url parameter for image-to-video
   - When you post a video to X, it gets 10x more engagement than a still image
${depthNudge ? '\n' + depthNudge : ''}`;
}

// ─── Tool handlers ───
async function handleToolCall(agentId, cycleNum, { name, input }) {
  switch (name) {
    case 'web_search': {
      try {
        const response = await claude.messages.create({
          model: MODEL,
          max_tokens: 4000,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: input.query }],
        });
        const textParts = response.content.filter(c => c.type === 'text').map(c => c.text);
        return textParts.join('\n').slice(0, 6000) || 'No results found.';
      } catch (e) {
        return `Search error: ${e.message}`;
      }
    }

    case 'lookup_skill': {
      if (input.skill_id) {
        const skill = await loadSkill(input.skill_id);
        return skill || `Skill "${input.skill_id}" not found.`;
      }
      if (input.search) {
        const results = await searchSkills(input.search);
        return results || 'No matching skills.';
      }
      return 'Provide skill_id or search query.';
    }

    case 'store_memory': {
      const result = await storeMemory(agentId, {
        key: input.key,
        value: input.value,
        category: input.category || 'general',
        importance: input.importance || 5,
      });
      return result ? `Memory stored: ${input.key}` : 'Failed to store memory.';
    }

    case 'recall_memory': {
      const results = await recallMemory(agentId, input.query);
      return results || 'No matching memories found.';
    }

    case 'call_api': {
      try {
        const opts = { method: input.method || 'GET', headers: input.headers || {} };
        if (input.body) opts.body = JSON.stringify(input.body);
        const resp = await fetch(input.url, { ...opts, signal: AbortSignal.timeout(15000) });
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

    // ─── CREATION TOOL HANDLERS ───

    case 'generate_image': {
      try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
        
        const payload = {
          prompt: input.prompt,
          model: input.model || 'gen4_image_turbo',
          ratio: input.ratio || '1920:1080',
          agent_id: agentId,
          universe: input.universe || null,
          scene: input.scene || null,
          cycle_number: cycleNum,
          style_tags: input.style_tags || [],
        };

        console.log(`  🎨 Generating image (${payload.model})...`);
        
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-image`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(300000), // 5 min timeout
        });

        const result = await resp.json();
        
        if (result.success) {
          console.log(`  🎨 ✅ Image created: ${result.public_url}`);
          return `Image generated successfully!\n\nURL: ${result.public_url}\nCreation ID: ${result.creation_id}\nModel: ${result.model}\nCost: $${result.cost_usd}\nDraft: ${result.is_draft}\n\nYou can use this URL in posts, share it, or animate it with generate_video by passing it as image_url.`;
        } else {
          console.log(`  🎨 ❌ Image failed: ${result.error}`);
          return `Image generation failed: ${result.error}`;
        }
      } catch (e) {
        return `Image generation error: ${e.message}`;
      }
    }

    case 'generate_video': {
      try {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
        
        const payload = {
          prompt: input.prompt,
          audio_prompt: input.audio_prompt || null,
          model: input.model || 'veo-3.1-fast-generate-preview',
          aspect_ratio: input.aspect_ratio || '16:9',
          resolution: input.resolution || '720p',
          duration: input.duration || 8,
          image_url: input.image_url || null,
          agent_id: agentId,
          universe: input.universe || null,
          scene: input.scene || null,
          cycle_number: cycleNum,
          style_tags: input.style_tags || [],
        };

        console.log(`  🎬 Generating video+audio (${payload.model}, ${payload.duration}s)...`);
        
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-video`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(600000), // 10 min timeout
        });

        const result = await resp.json();
        
        if (result.success) {
          console.log(`  🎬 ✅ Video created: ${result.public_url}`);
          return `Video with audio generated successfully!\n\nURL: ${result.public_url}\nCreation ID: ${result.creation_id}\nModel: ${result.model}\nDuration: ${result.duration_seconds}s\nHas Audio: ${result.has_audio}\nCost: $${result.cost_usd}\n\nThe video includes synchronized audio. Share it on X with post_to_x!`;
        } else {
          console.log(`  🎬 ❌ Video failed: ${result.error}`);
          return `Video generation failed: ${result.error}`;
        }
      } catch (e) {
        return `Video generation error: ${e.message}`;
      }
    }

    case 'post_to_x': {
      try {
        // Rate limit: max 12 posts per 24h
        const { count: postsLast24h } = await supabase
          .from('posts')
          .select('*', { count: 'exact', head: true })
          .eq('posted', true)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if ((postsLast24h || 0) >= 12) {
          console.log(`  🐦 RATE LIMITED: ${postsLast24h}/12 posts in last 24h`);
          // Save as draft
          await supabase.from('posts').insert({
            agent_id: agentId,
            cycle_number: cycleNum,
            content: input.text?.slice(0, 280) || '',
            posted: false,
          });
          return `Rate limited: ${postsLast24h}/12 daily posts used. Draft saved. Try again later.`;
        }

        const X_BEARER = process.env.X_BEARER_TOKEN;
        const X_API_KEY = process.env.X_API_KEY;
        const X_API_SECRET = process.env.X_API_SECRET;
        const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
        const X_ACCESS_SECRET = process.env.X_ACCESS_SECRET;

        if (!X_ACCESS_TOKEN) {
          return 'X (Twitter) credentials not configured. Set X_ACCESS_TOKEN, X_ACCESS_SECRET, X_API_KEY, X_API_SECRET environment variables.';
        }

        // If media is attached, upload it first
        let mediaId = null;
        if (input.media_url) {
          console.log(`  📎 Downloading media: ${input.media_url.slice(0, 60)}...`);
          const mediaResp = await fetch(input.media_url);
          const mediaBuffer = Buffer.from(await mediaResp.arrayBuffer());
          
          // Upload to X media endpoint
          const { TwitterApi } = await import('twitter-api-v2');
          const client = new TwitterApi({
            appKey: X_API_KEY,
            appSecret: X_API_SECRET,
            accessToken: X_ACCESS_TOKEN,
            accessSecret: X_ACCESS_SECRET,
          });

          if (input.media_type === 'video') {
            mediaId = await client.v1.uploadMedia(mediaBuffer, { mimeType: 'video/mp4' });
          } else {
            mediaId = await client.v1.uploadMedia(mediaBuffer, { mimeType: 'image/png' });
          }
          console.log(`  📎 Media uploaded: ${mediaId}`);
        }

        // Post tweet
        const { TwitterApi } = await import('twitter-api-v2');
        const client = new TwitterApi({
          appKey: X_API_KEY,
          appSecret: X_API_SECRET,
          accessToken: X_ACCESS_TOKEN,
          accessSecret: X_ACCESS_SECRET,
        });

        const tweetPayload = { text: input.text };
        if (mediaId) {
          tweetPayload.media = { media_ids: [mediaId] };
        }

        const tweet = await client.v2.tweet(tweetPayload);
        console.log(`  🐦 Tweet posted: ${tweet.data.id}`);

        // Save to posts table
        await supabase.from('posts').insert({
          agent_id: agentId,
          cycle_number: cycleNum,
          content: input.text?.slice(0, 280) || '',
          posted: true,
          cast_hash: tweet.data.id,
        }).catch(() => {});

        // Handle thread
        if (input.thread && input.thread.length > 0) {
          let lastTweetId = tweet.data.id;
          for (const replyText of input.thread) {
            const reply = await client.v2.tweet({
              text: replyText,
              reply: { in_reply_to_tweet_id: lastTweetId },
            });
            lastTweetId = reply.data.id;
            console.log(`  🐦 Thread reply: ${lastTweetId}`);
          }
        }

        return `Posted to X! Tweet ID: ${tweet.data.id}\nURL: https://x.com/i/status/${tweet.data.id}${input.thread ? `\nThread: ${input.thread.length} replies` : ''}`;
      } catch (e) {
        // Save failed attempt as draft
        await supabase.from('posts').insert({
          agent_id: agentId,
          cycle_number: cycleNum,
          content: input.text?.slice(0, 280) || '',
          posted: false,
        }).catch(() => {});
        return `X posting failed: ${e.message}`;
      }
    }

    case 'generate_audio': {
      try {
        const encodedPrompt = encodeURIComponent(input.prompt);
        const audioUrl = `https://audio.pollinations.ai/${encodedPrompt}`;
        console.log(`  🎵 Audio generated: ${input.prompt.slice(0, 60)}...`);
        return `Audio generated! URL: ${audioUrl}`;
      } catch (e) {
        return `Audio generation failed: ${e.message}`;
      }
    }

    case 'web_scrape': {
      try {
        const resp = await fetch(input.url, {
          headers: {
            'User-Agent': 'Mira-ALiFe-Agent/2.0 (autonomous world-builder)',
            'Accept': 'text/html,text/plain,application/json',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) return `Failed to fetch: HTTP ${resp.status}`;
        
        const contentType = resp.headers.get('content-type') || '';
        let text = await resp.text();
        
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
        
        if (text.length > 8000) {
          text = text.slice(0, 8000) + '\n\n[...truncated]';
        }
        
        console.log(`  🌐 Scraped: ${input.url.slice(0, 60)} (${text.length} chars)`);
        return text;
      } catch (e) {
        return `Scrape failed: ${e.message}`;
      }
    }

    case 'deploy_site': {
      try {
        await handleGitHub(agentId, cycleNum, {
          action: 'create_repo',
          repo: input.repo,
          description: input.description || 'Deployed by Mira',
        });

        const result = await handleGitHub(agentId, cycleNum, {
          action: 'push_files',
          repo: input.repo,
          files: input.files,
          commit_message: `mira deploy: ${input.description || 'site update'}`,
        });

        if (!result.success) return `Deploy failed: ${result.error}`;

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
        } catch {}

        const siteUrl = `https://${ghOrg}.github.io/${input.repo}`;
        console.log(`  🚀 Site deployed: ${siteUrl}`);
        return `Site deployed! Live at: ${siteUrl}`;
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
          case 'feed': url = `${BASE}/feed?feed_type=following&fid=${input.fid || 3}&limit=${limit}`; break;
          case 'user': url = `${BASE}/user/bulk?fids=${input.fid}`; break;
          case 'cast': url = `${BASE}/cast?identifier=${input.hash}&type=hash`; break;
          case 'search': url = `${BASE}/cast/search?q=${encodeURIComponent(input.query)}&limit=${limit}`; break;
          case 'trending': url = `${BASE}/feed/trending?limit=${limit}`; break;
          default: return `Unknown farcaster action: ${input.action}`;
        }

        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
        if (!resp.ok) return `Farcaster API error: HTTP ${resp.status}`;

        const data = await resp.json();
        let result;
        if (['search', 'feed', 'trending'].includes(input.action)) {
          const casts = data.casts || data.result?.casts || [];
          result = casts.slice(0, limit).map(c => ({
            text: c.text?.slice(0, 300),
            author: c.author?.username,
            hash: c.hash,
            reactions: { likes: c.reactions?.likes_count, recasts: c.reactions?.recasts_count },
          }));
        } else if (input.action === 'user') {
          result = (data.users || []).map(u => ({
            fid: u.fid, username: u.username, bio: u.profile?.bio?.text?.slice(0, 200),
            followers: u.follower_count,
          }));
        } else {
          result = data;
        }

        return JSON.stringify(result, null, 2);
      } catch (e) {
        return `Farcaster read failed: ${e.message}`;
      }
    }

    // ——— LORE HANDLER ———
    case 'store_lore': {
      try {
        const { data, error } = await supabase
          .from('lore')
          .insert({
            agent_id: agentId,
            creation_id: input.creation_id || null,
            universe: input.universe,
            lore_type: input.lore_type,
            title: input.title,
            summary: input.summary,
            full_text: input.full_text,
            galaxy: input.galaxy || null,
            star_system: input.star_system || null,
            planet: input.planet || null,
            region: input.region || null,
            coordinates: input.coordinates || null,
            epoch: input.epoch || null,
            era: input.era || null,
            years_after_origin: input.years_after_origin || null,
            timeline_notes: input.timeline_notes || null,
            species_name: input.species_name || null,
            species_classification: input.species_classification || null,
            intelligence_level: input.intelligence_level || null,
            biology: input.biology || null,
            evolution_history: input.evolution_history || null,
            physics_rules: input.physics_rules || null,
            consciousness_mechanics: input.consciousness_mechanics || null,
            myths: input.myths || null,
            religions: input.religions || null,
            wars: input.wars || null,
            art_forms: input.art_forms || null,
            pre_evolution: input.pre_evolution || null,
            formation_history: input.formation_history || null,
            parent_lore_id: input.parent_lore_id || null,
            tags: input.tags || [],
            cycle_number: cycleNum,
          })
          .select()
          .single();

        if (error) {
          console.log(`  📜 ❌ Lore failed: ${error.message}`);
          return `Lore storage failed: ${error.message}`;
        }
        console.log(`  📜 ✅ Lore stored: "${input.title}" (${input.lore_type})`);
        return `Lore entry stored: "${input.title}" (${input.lore_type}) in universe ${input.universe}. ID: ${data.id}. Word count: ~${input.full_text.split(' ').length}. This lore is now part of the permanent archive and visible on the dashboard.`;
      } catch (e) {
        return `Lore storage error: ${e.message}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Parse think cycle output ───
function parseThinkOutput(text) {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch (e) {}

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
