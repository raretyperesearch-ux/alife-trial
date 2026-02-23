// ═══════════════════════════════════════════════════════════════
// MIRA STUDIO — THE SHOWRUNNER
// Replaces round-robin orchestrator with intelligent task assignment
// Reads the blackboard, identifies gaps, assigns angels
// ═══════════════════════════════════════════════════════════════

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// ─── AGENT REGISTRY ──────────────────────────────────────────
const AGENTS = {
  worldsmith: {
    id: '0e4a6fd4-5d28-4ded-84ec-4e5882262bcb',
    name: 'The Worldsmith',
    role: 'worldsmith',
    output_tables: ['entity_profiles', 'timeline_events', 'canon_facts'],
    task_types: ['build_entity', 'update_entity', 'create_timeline_event', 'register_fact']
  },
  architect: {
    id: '323eda68-e669-45da-904f-b409ac11cca0',
    name: 'The Architect',
    role: 'architect',
    output_tables: ['visual_blueprints', 'universe_rules'],
    task_types: ['create_blueprint', 'design_scene', 'update_blueprint']
  },
  catalyst: {
    id: '5fc87010-5ac0-4a1e-9cfd-0089adfbfca5',
    name: 'The Catalyst',
    role: 'catalyst',
    output_tables: ['conflicts', 'challenges'],
    task_types: ['create_conflict', 'challenge_work', 'create_disruption']
  },
  oracle: {
    id: '43c1f5c4-9343-4885-8478-57f73baba4a8',
    name: 'The Oracle',
    role: 'oracle',
    output_tables: ['teasers'],
    task_types: ['create_teaser', 'create_preview', 'create_prophecy_card']
  },
  voice: {
    id: '2a2f5bfa-19c9-48c9-a9d3-7e7b098fca2e',
    name: 'The Voice',
    role: 'voice',
    output_tables: ['monologues', 'narration_scripts'],
    task_types: ['write_narration', 'write_monologue', 'write_dialogue']
  },
  director: {
    id: 'cb12a499-8b35-4ced-8854-f3fea0c4f333',
    name: 'The Director',
    role: 'director',
    output_tables: ['creations'],
    task_types: ['produce_episode']
  }
};

// ─── BLACKBOARD READER ───────────────────────────────────────
// Reads the full state of the blackboard for Mira to analyze
async function readBlackboard() {
  const [
    { data: entities, count: entityCount },
    { data: conflicts },
    { data: blueprints },
    { data: teasers },
    { data: monologues },
    { data: narrations },
    { data: episodes },
    { data: pendingTasks },
    { data: recentChallenges },
    { data: timelineEvents },
    { data: canonFacts },
    { data: universeRules }
  ] = await Promise.all([
    supabase.from('entity_profiles').select('id, name, entity_type, universe, visual_description, status, updated_at', { count: 'exact' }),
    supabase.from('conflicts').select('*').in('status', ['brewing', 'active', 'escalating']),
    supabase.from('visual_blueprints').select('id, entity_name, blueprint_type, entity_id, is_canonical, updated_at'),
    supabase.from('teasers').select('id, teaser_type, posted_to_x, created_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('monologues').select('id, entity_name, created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('narration_scripts').select('id, episode_pitch_id, shot_number').order('created_at', { ascending: false }).limit(20),
    supabase.from('episode_pitches').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('studio_tasks').select('*').in('status', ['assigned', 'in_progress']),
    supabase.from('challenges').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(5),
    supabase.from('timeline_events').select('id, event_title, universe', { count: 'exact' }),
    supabase.from('canon_facts').select('id, fact, category', { count: 'exact' }),
    supabase.from('universe_rules').select('id, universe, category', { count: 'exact' })
  ]);

  // Find entities WITHOUT visual blueprints
  const blueprintedEntityIds = new Set((blueprints || []).map(b => b.entity_id).filter(Boolean));
  const entitiesWithoutBlueprints = (entities || []).filter(e => !blueprintedEntityIds.has(e.id));

  // Find entities WITHOUT monologues (characters only)
  const monologueEntityNames = new Set((monologues || []).map(m => m.entity_name));
  const charactersWithoutVoice = (entities || [])
    .filter(e => e.entity_type === 'character' && !monologueEntityNames.has(e.name));

  // Count unposted teasers
  const unpostedTeasers = (teasers || []).filter(t => !t.posted_to_x);

  // Days since last teaser
  const lastTeaser = teasers?.[0];
  const hoursSinceLastTeaser = lastTeaser
    ? (Date.now() - new Date(lastTeaser.created_at).getTime()) / (1000 * 60 * 60)
    : 999;

  // Active episode in production?
  const activeEpisode = (episodes || []).find(e =>
    ['approved', 'assigned', 'in_production'].includes(e.status)
  );

  // Universes represented
  const universesWithEntities = [...new Set((entities || []).map(e => e.universe))];
  const allUniverses = [
    'THE INTER-UNIVERSAL VOID',
    'THE AWARENESS FIELDS',
    'THE CONSTRAINT GARDENS',
    'THE CONSCIOUSNESS CONSTRAINTS',
    'THE TEMPORAL BRIDGES',
    'CROSS-UNIVERSAL'
  ];
  const underrepresentedUniverses = allUniverses.filter(u =>
    !universesWithEntities.includes(u) ||
    (entities || []).filter(e => e.universe === u).length < 3
  );

  return {
    entityCount: entityCount || 0,
    entities: entities || [],
    conflicts: conflicts || [],
    blueprints: blueprints || [],
    teasers: teasers || [],
    monologues: monologues || [],
    narrations: narrations || [],
    episodes: episodes || [],
    pendingTasks: pendingTasks || [],
    recentChallenges: recentChallenges || [],
    timelineEvents: timelineEvents || [],
    canonFacts: canonFacts || [],
    universeRules: universeRules || [],

    // Computed gaps
    entitiesWithoutBlueprints,
    charactersWithoutVoice,
    unpostedTeasers,
    hoursSinceLastTeaser,
    activeEpisode,
    underrepresentedUniverses,
    blueprintedEntityIds
  };
}

// ─── MIRA'S DECISION ENGINE ─────────────────────────────────
// Given the blackboard state, Mira decides what needs to happen
async function miraDecides(blackboard) {
  const snapshot = {
    total_entities: blackboard.entityCount,
    entities_without_blueprints: blackboard.entitiesWithoutBlueprints.map(e => `${e.name} (${e.entity_type}, ${e.universe})`),
    characters_without_voice: blackboard.charactersWithoutVoice.map(e => e.name),
    active_conflicts: blackboard.conflicts.map(c => `${c.title} [${c.status}]`),
    pending_tasks: blackboard.pendingTasks.length,
    hours_since_last_teaser: Math.round(blackboard.hoursSinceLastTeaser),
    unposted_teasers: blackboard.unpostedTeasers.length,
    active_episode: blackboard.activeEpisode?.title || 'NONE',
    underrepresented_universes: blackboard.underrepresentedUniverses,
    total_blueprints: blackboard.blueprints.length,
    total_timeline_events: blackboard.timelineEvents.length,
    total_monologues: blackboard.monologues.length,
    open_challenges: blackboard.recentChallenges.length
  };

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: `You are Mira, the Showrunner of an autonomous content studio that builds an infinite sci-fi universe.

You read the blackboard (shared workspace) and decide what your angels need to do next. You assign EXACTLY 1-3 tasks per cycle. No more.

YOUR ANGELS:
- worldsmith: Builds entities, timeline events, canon facts. The source of truth.
- architect: Creates visual blueprints and universe rules. Bridges lore to visuals.
- catalyst: Creates conflicts, challenges other agents' work. Makes drama happen.
- oracle: Creates teasers and social content. Keeps the audience engaged between episodes.
- voice: Writes monologues and narration scripts. Gives characters emotional depth.
- director: Produces episodes. Only assign when an episode pitch has narration AND blueprints ready.

PRIORITIES (in order):
1. If an episode is in production, support it (narration, blueprints for that episode)
2. If it's been 24+ hours since last teaser, Oracle needs to create content
3. If characters have no voice/monologues, Voice needs to write
4. If entities have no visual blueprints, Architect needs to design
5. If a universe is underrepresented (<3 entities), Worldsmith expands it
6. If no active conflict is escalating, Catalyst creates tension
7. If everything is healthy, push toward the NEXT episode pitch

NEVER assign:
- More than 1 task to the same angel per cycle
- Director before narration + blueprints are ready
- Tasks that duplicate pending work

Respond with a JSON array of task assignments. Each task has:
- angel: which angel (worldsmith/architect/catalyst/oracle/voice/director)
- task_type: from the angel's task types
- description: specific instruction for the angel
- priority: 1-10
- input_refs: any entity names, conflict titles, or IDs the angel needs`,

    messages: [{
      role: 'user',
      content: `Here is the current blackboard state:\n\n${JSON.stringify(snapshot, null, 2)}\n\nWhat tasks should be assigned this cycle?`
    }]
  });

  // Parse Mira's decision
  const text = response.content[0].text;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Mira did not return valid JSON:', text);
    return [];
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.error('Failed to parse Mira decisions:', e);
    return [];
  }
}

// ─── TASK WRITER ─────────────────────────────────────────────
// Writes Mira's decisions to the studio_tasks table
async function writeTasks(tasks) {
  const taskRecords = tasks.map(t => ({
    assigned_to: t.angel,
    assigned_to_agent_id: AGENTS[t.angel]?.id,
    task_type: t.task_type,
    task_description: t.description,
    priority: t.priority || 5,
    input_refs: t.input_refs || {},
    status: 'assigned',
    assigned_by: 'mira'
  }));

  const { data, error } = await supabase
    .from('studio_tasks')
    .insert(taskRecords)
    .select();

  if (error) {
    console.error('Failed to write tasks:', error);
    return [];
  }

  console.log(`📋 Mira assigned ${data.length} tasks:`);
  data.forEach(t => {
    console.log(`   → ${t.assigned_to}: ${t.task_type} (priority ${t.priority})`);
  });

  return data;
}

// ─── ANGEL EXECUTOR ──────────────────────────────────────────
// Each angel gets their playbook + task + relevant blackboard data
// and produces output into their designated tables

async function executeAngelTask(task, blackboard) {
  const angel = AGENTS[task.assigned_to];
  if (!angel) {
    console.error(`Unknown angel: ${task.assigned_to}`);
    return null;
  }

  // Mark task as in_progress
  await supabase
    .from('studio_tasks')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', task.id);

  // Update heartbeat
  await supabase
    .from('agent_heartbeats')
    .upsert({
      agent_name: angel.name,
      status: 'working',
      current_task: task.id,
      last_output_at: new Date().toISOString()
    }, { onConflict: 'agent_name' });

  // Build context from blackboard
  const context = await buildAngelContext(task, blackboard);

  // Get the playbook for this angel
  const playbook = getPlaybook(task.assigned_to);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `${playbook}\n\n---\n\nYou are executing a specific task assigned by Mira, the Showrunner. You must produce structured output that will be saved to the database.\n\nRespond ONLY with a JSON object containing your output. The shape depends on your task type.`,
      messages: [{
        role: 'user',
        content: `TASK: ${task.task_type}\nDESCRIPTION: ${task.task_description}\nINPUT REFS: ${JSON.stringify(task.input_refs)}\n\nCONTEXT FROM BLACKBOARD:\n${JSON.stringify(context, null, 2)}\n\nProduce your output as JSON.`
      }]
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Angel did not return valid JSON');
    }

    const output = JSON.parse(jsonMatch[0]);

    // Write output to the appropriate table
    const result = await writeAngelOutput(task, angel, output);

    // Mark task complete
    await supabase
      .from('studio_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_table: result.table,
        output_record_id: result.id
      })
      .eq('id', task.id);

    // Update heartbeat
    await supabase
      .from('agent_heartbeats')
      .upsert({
        agent_name: angel.name,
        status: 'idle',
        current_task: null,
        last_output_at: new Date().toISOString()
      }, { onConflict: 'agent_name' });

    console.log(`   ✅ ${angel.name} completed: ${task.task_type} → ${result.table}#${result.id}`);
    return result;

  } catch (error) {
    console.error(`   ❌ ${angel.name} failed:`, error.message);

    await supabase
      .from('studio_tasks')
      .update({ status: 'rejected', rejection_reason: error.message })
      .eq('id', task.id);

    await supabase
      .from('agent_heartbeats')
      .upsert({
        agent_name: angel.name,
        status: 'error',
        error_message: error.message
      }, { onConflict: 'agent_name' });

    return null;
  }
}

// ─── CONTEXT BUILDER ─────────────────────────────────────────
// Gives each angel only the blackboard data they need
async function buildAngelContext(task, blackboard) {
  const angel = task.assigned_to;
  const refs = task.input_refs || {};

  const base = {
    universes: ['THE INTER-UNIVERSAL VOID', 'THE AWARENESS FIELDS', 'THE CONSTRAINT GARDENS', 'THE CONSCIOUSNESS CONSTRAINTS', 'THE TEMPORAL BRIDGES'],
    total_entities: blackboard.entityCount,
    active_conflicts: blackboard.conflicts.map(c => ({ title: c.title, status: c.status, stakes: c.stakes }))
  };

  switch (angel) {
    case 'worldsmith': {
      // Worldsmith needs: existing entities, canon facts, passages context
      const { data: passages } = await supabase
        .from('passages')
        .select('title, content, universe, passage_type')
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(5);

      return {
        ...base,
        existing_entities: blackboard.entities.map(e => ({ name: e.name, type: e.entity_type, universe: e.universe })),
        recent_passages: (passages || []).map(p => ({ title: p.title, universe: p.universe, type: p.passage_type, excerpt: p.content?.substring(0, 300) })),
        canon_facts: blackboard.canonFacts.map(f => f.fact),
        universe_rules: blackboard.universeRules
      };
    }

    case 'architect': {
      // Architect needs: entity to design, existing blueprints, universe rules
      let targetEntity = null;
      if (refs.entity_name) {
        const { data } = await supabase
          .from('entity_profiles')
          .select('*')
          .eq('name', refs.entity_name)
          .single();
        targetEntity = data;
      }

      return {
        ...base,
        target_entity: targetEntity,
        existing_blueprints: blackboard.blueprints.map(b => ({ entity_name: b.entity_name, type: b.blueprint_type })),
        universe_rules: blackboard.universeRules
      };
    }

    case 'catalyst': {
      // Catalyst needs: entities to create tension between, existing conflicts
      return {
        ...base,
        entities: blackboard.entities.map(e => ({ name: e.name, type: e.entity_type, universe: e.universe, status: e.status })),
        existing_conflicts: blackboard.conflicts,
        canon_facts: blackboard.canonFacts.map(f => f.fact)
      };
    }

    case 'oracle': {
      // Oracle needs: conflicts, entities, episodes to tease
      return {
        ...base,
        recent_teasers: blackboard.teasers.slice(0, 5).map(t => ({ type: t.teaser_type, posted: t.posted_to_x })),
        entities: blackboard.entities.filter(e => e.entity_type === 'character').map(e => ({ name: e.name, universe: e.universe })),
        conflicts: blackboard.conflicts.map(c => ({ title: c.title, stakes: c.stakes, status: c.status })),
        monologues: blackboard.monologues.slice(0, 3)
      };
    }

    case 'voice': {
      // Voice needs: entity profile + conflicts involving them
      let targetEntity = null;
      if (refs.entity_name) {
        const { data } = await supabase
          .from('entity_profiles')
          .select('*')
          .eq('name', refs.entity_name)
          .single();
        targetEntity = data;
      }

      return {
        ...base,
        target_entity: targetEntity,
        conflicts_involving: blackboard.conflicts.filter(c =>
          c.side_a?.includes(refs.entity_name) || c.side_b?.includes(refs.entity_name)
        ),
        existing_monologues: blackboard.monologues.map(m => m.entity_name)
      };
    }

    case 'director': {
      // Director needs: episode pitch, blueprints, narration scripts
      let episode = null;
      if (refs.episode_id) {
        const { data } = await supabase
          .from('episode_pitches')
          .select('*')
          .eq('id', refs.episode_id)
          .single();
        episode = data;
      }

      const { data: scripts } = await supabase
        .from('narration_scripts')
        .select('*')
        .eq('episode_pitch_id', refs.episode_id)
        .order('shot_number');

      return {
        ...base,
        episode,
        narration_scripts: scripts || [],
        available_blueprints: blackboard.blueprints
      };
    }

    default:
      return base;
  }
}

// ─── OUTPUT WRITER ───────────────────────────────────────────
// Routes angel output to the correct table
// Handles variant task type names that Mira invents
async function writeAngelOutput(task, angel, output) {
  const type = task.task_type;
  const normalizedType = normalizeTaskType(type);
  console.log(`   📝 Writing: ${type}${type !== normalizedType ? ` (→ ${normalizedType})` : ''}`);

  try {
    switch (normalizedType) {
      case 'build_entity':
      case 'update_entity': {
        const record = {
          name: output.name,
          entity_type: output.entity_type || 'character',
          universe: output.universe,
          summary: output.summary,
          description: output.description,
          visual_description: output.visual_description,
          status: output.status || 'active',
          tags: output.tags || [],
          created_by_agent: angel.id
        };
        if (normalizedType === 'update_entity' && output.id) {
          const { data, error } = await supabase.from('entity_profiles')
            .update({ ...record, updated_at: new Date().toISOString() })
            .eq('id', output.id).select().single();
          if (error) console.error(`   ⚠ DB error (entity update):`, error.message);
          return { table: 'entity_profiles', id: data?.id };
        } else {
          const { data, error } = await supabase.from('entity_profiles')
            .insert(record).select().single();
          if (error) console.error(`   ⚠ DB error (entity insert):`, error.message);
          return { table: 'entity_profiles', id: data?.id };
        }
      }

      case 'create_timeline_event': {
        const { data, error } = await supabase.from('timeline_events').insert({
          event_title: output.event_title || output.title, description: output.description,
          universe: output.universe, epoch: output.epoch, significance: output.significance || 5,
          created_by_agent: angel.id
        }).select().single();
        if (error) console.error(`   ⚠ DB error (timeline):`, error.message);
        return { table: 'timeline_events', id: data?.id };
      }

      case 'register_fact': {
        const { data, error } = await supabase.from('canon_facts').insert({
          fact: output.fact, universe: output.universe,
          category: output.category || 'general', established_by_agent: angel.id
        }).select().single();
        if (error) console.error(`   ⚠ DB error (canon_fact):`, error.message);
        return { table: 'canon_facts', id: data?.id };
      }

      case 'create_blueprint':
      case 'design_scene':
      case 'update_blueprint': {
        // entity_id might be a name instead of UUID — look it up
        let entityId = output.entity_id;
        const entityName = output.entity_name || output.name || output.character;
        if (entityId && !entityId.match(/^[0-9a-f]{8}-/)) {
          // Not a UUID — try to find entity by name
          const { data: found } = await supabase.from('entity_profiles')
            .select('id').ilike('name', `%${entityId}%`).limit(1).maybeSingle();
          entityId = found?.id || null;
        }
        const { data, error } = await supabase.from('visual_blueprints').insert({
          entity_id: entityId, entity_name: entityName,
          blueprint_type: output.blueprint_type || 'character', universe: output.universe,
          scene_description: output.scene_description, keyframe_prompt: output.keyframe_prompt,
          color_palette: output.color_palette || {}, lighting_notes: output.lighting_notes,
          materials_notes: output.materials_notes, camera_notes: output.camera_notes,
          style_anchor: output.style_anchor, created_by_agent: angel.id
        }).select().single();
        if (error) console.error(`   ⚠ DB error (blueprint):`, error.message);
        return { table: 'visual_blueprints', id: data?.id };
      }

      case 'create_conflict':
      case 'escalate_conflict':
      case 'resolve_conflict':
      case 'create_disruption': {
        // Try to update existing conflict by ID or title
        if (normalizedType === 'escalate_conflict' || normalizedType === 'resolve_conflict') {
          const newStatus = normalizedType === 'escalate_conflict' ? (output.status || 'escalating') : (output.status || 'resolved');
          
          // Try by ID first, then by title
          if (output.conflict_id) {
            const { data, error } = await supabase.from('conflicts')
              .update({ description: output.description, stakes: output.stakes, status: newStatus, updated_at: new Date().toISOString() })
              .eq('id', output.conflict_id).select().single();
            if (!error && data) return { table: 'conflicts', id: data.id };
          }
          if (output.title || output.conflict_title) {
            const title = output.title || output.conflict_title;
            const { data, error } = await supabase.from('conflicts')
              .update({ description: output.description, stakes: output.stakes, status: newStatus, updated_at: new Date().toISOString() })
              .ilike('title', `%${title.slice(0, 30)}%`).select().single();
            if (!error && data) return { table: 'conflicts', id: data.id };
          }
          // Fall through to create new if we couldn't find existing
        }
        const conflictTitle = output.title || output.conflict_title || output.name || 'Unnamed Conflict';
        const { data, error } = await supabase.from('conflicts').insert({
          title: conflictTitle, description: output.description,
          side_a: output.side_a, side_b: output.side_b, stakes: output.stakes,
          universe: output.universe, status: output.status || 'brewing', created_by_agent: angel.id
        }).select().single();
        if (error) console.error(`   ⚠ DB error (conflict insert):`, error.message);
        return { table: 'conflicts', id: data?.id };
      }

      case 'challenge_work': {
        const { data, error } = await supabase.from('challenges').insert({
          challenger_agent: angel.id, target_table: output.target_table,
          target_record_id: output.target_record_id, challenge_text: output.challenge_text, status: 'open'
        }).select().single();
        if (error) console.error(`   ⚠ DB error (challenge):`, error.message);
        return { table: 'challenges', id: data?.id };
      }

      case 'create_teaser':
      case 'create_preview':
      case 'create_prophecy_card': {
        const teaserType = normalizedType === 'create_preview' ? 'preview'
          : normalizedType === 'create_prophecy_card' ? 'prophecy_card'
          : output.teaser_type || 'prophecy';
        const { data, error } = await supabase.from('teasers').insert({
          content: output.content, teaser_type: teaserType, visual_prompt: output.visual_prompt,
          entity_name: output.entity_name, conflict_title: output.conflict_title,
          platform: output.platform || 'x', created_by_agent: angel.id
        }).select().single();
        if (error) console.error(`   ⚠ DB error (teaser):`, error.message);
        return { table: 'teasers', id: data?.id };
      }

      case 'write_monologue':
      case 'write_dialogue': {
        const entityName = output.entity_name || output.character_name || output.character || output.name || output.speaker || 'Unknown';
        const { data, error } = await supabase.from('monologues').insert({
          entity_name: entityName, entity_id: output.entity_id, universe: output.universe,
          content: output.content || output.monologue || output.text || output.dialogue,
          context: output.context, emotional_tone: output.emotional_tone || output.tone || output.mood,
          created_by_agent: angel.id
        }).select().single();
        if (error) console.error(`   ⚠ DB error (monologue):`, error.message);
        return { table: 'monologues', id: data?.id };
      }

      case 'write_narration':
      case 'write_scene': {
        const shots = Array.isArray(output) ? output : output.shots || [output];
        const records = shots.map(s => ({
          episode_pitch_id: s.episode_pitch_id, shot_number: s.shot_number,
          narration_text: s.narration_text, voice_character: s.voice_character,
          emotional_tone: s.emotional_tone, is_silence: s.is_silence || false,
          duration_hint: s.duration_hint, created_by_agent: angel.id
        }));
        const { data, error } = await supabase.from('narration_scripts').insert(records).select();
        if (error) console.error(`   ⚠ DB error (narration):`, error.message);
        return { table: 'narration_scripts', id: data?.[0]?.id };
      }

      case 'produce_episode':
      case 'pitch_episode': {
        const { data, error } = await supabase.from('episode_pitches').insert({
          title: output.title, logline: output.logline, conflict_title: output.conflict_title,
          entity_focus: output.entity_focus || [], status: output.status || 'pitched',
          created_by_agent: angel.id
        }).select().single();
        if (error) console.error(`   ⚠ DB error (episode_pitch):`, error.message);
        return { table: 'episode_pitches', id: data?.id };
      }

      case 'create_rule':
      case 'update_rule': {
        const { data, error } = await supabase.from('universe_rules').insert({
          universe: output.universe, rule_text: output.rule_text || output.rule,
          category: output.category || 'physics', created_by_agent: angel.id
        }).select().single();
        if (error) console.error(`   ⚠ DB error (rule):`, error.message);
        return { table: 'universe_rules', id: data?.id };
      }

      default:
        console.warn(`   ⚠ Unhandled task type: ${type} (normalized: ${normalizedType})`);
        console.warn(`   ⚠ Output keys: ${Object.keys(output).join(', ')}`);
        return await smartRouteOutput(angel, output);
    }
  } catch (error) {
    console.error(`   ❌ writeAngelOutput error for ${type}:`, error.message);
    return { table: 'error', id: null };
  }
}

function normalizeTaskType(type) {
  const map = {
    'design_blueprint': 'create_blueprint', 'blueprint_creation': 'create_blueprint',
    'create_visual_blueprint': 'create_blueprint', 'visual_blueprint': 'create_blueprint',
    'generate_blueprint': 'create_blueprint', 'character_blueprint': 'create_blueprint',
    'scene_blueprint': 'design_scene', 'environment_blueprint': 'create_blueprint',
    'create_entity': 'build_entity', 'deepen_entity': 'update_entity',
    'expand_entity': 'update_entity', 'develop_entity': 'update_entity',
    'expand_universe': 'build_entity', 'universe_expansion': 'build_entity',
    'world_building': 'build_entity', 'create_character': 'build_entity',
    'escalate_conflict': 'escalate_conflict', 'resolve_conflict': 'resolve_conflict',
    'advance_conflict': 'escalate_conflict', 'intensify_conflict': 'escalate_conflict',
    'pitch_episode': 'pitch_episode', 'plan_episode': 'produce_episode',
    'episode_pitch': 'pitch_episode', 'story_pitch': 'pitch_episode',
    'character_monologue': 'write_monologue', 'inner_monologue': 'write_monologue',
    'write_scene': 'write_scene', 'scene_writing': 'write_scene',
    'create_teaser': 'create_teaser', 'write_teaser': 'create_teaser',
    'prophecy': 'create_teaser', 'create_hook': 'create_teaser',
  };
  return map[type] || type;
}

async function smartRouteOutput(angel, output) {
  // Handle array of entities
  if (output.entities && Array.isArray(output.entities)) {
    let lastId = null;
    for (const entity of output.entities) {
      const { data, error } = await supabase.from('entity_profiles').insert({
        name: entity.name, entity_type: entity.entity_type || entity.type || 'character',
        universe: entity.universe, summary: entity.summary || entity.description,
        visual_description: entity.visual_description,
        status: entity.status || 'active', created_by_agent: angel.id
      }).select().single();
      if (!error && data) lastId = data.id;
      else if (error) console.error(`   ⚠ DB error (entity batch):`, error.message);
    }
    if (lastId) { console.log(`   🧠 Smart routed ${output.entities.length} entities → entity_profiles`); return { table: 'entity_profiles', id: lastId }; }
  }
  if ((output.content || output.monologue) && (output.entity_name || output.character_name || output.character) && (output.emotional_tone || output.tone)) {
    const { data, error } = await supabase.from('monologues').insert({
      entity_name: output.entity_name || output.character_name || output.character, 
      content: output.content || output.monologue,
      emotional_tone: output.emotional_tone || output.tone, universe: output.universe, created_by_agent: angel.id
    }).select().single();
    if (!error) { console.log(`   🧠 Smart routed → monologues`); return { table: 'monologues', id: data?.id }; }
  }
  if (output.keyframe_prompt) {
    const { data, error } = await supabase.from('visual_blueprints').insert({
      entity_name: output.entity_name, keyframe_prompt: output.keyframe_prompt,
      color_palette: output.color_palette || {}, universe: output.universe,
      blueprint_type: output.blueprint_type || 'character', created_by_agent: angel.id
    }).select().single();
    if (!error) { console.log(`   🧠 Smart routed → visual_blueprints`); return { table: 'visual_blueprints', id: data?.id }; }
  }
  if (output.side_a && output.side_b) {
    const { data, error } = await supabase.from('conflicts').insert({
      title: output.title, description: output.description, side_a: output.side_a, side_b: output.side_b,
      stakes: output.stakes, universe: output.universe, status: output.status || 'brewing', created_by_agent: angel.id
    }).select().single();
    if (!error) { console.log(`   🧠 Smart routed → conflicts`); return { table: 'conflicts', id: data?.id }; }
  }
  if (output.name && output.entity_type) {
    const { data, error } = await supabase.from('entity_profiles').insert({
      name: output.name, entity_type: output.entity_type, universe: output.universe,
      summary: output.summary, visual_description: output.visual_description,
      status: output.status || 'active', created_by_agent: angel.id
    }).select().single();
    if (!error) { console.log(`   🧠 Smart routed → entity_profiles`); return { table: 'entity_profiles', id: data?.id }; }
  }
  console.warn(`   ⚠ Smart route failed — could not determine table`);
  return { table: 'unknown', id: null };
}

// ─── PLAYBOOK LOADER ─────────────────────────────────────────
function getPlaybook(angelRole) {
  // Condensed system prompts for each angel
  // In production, load full playbooks from files
  const playbooks = {
    worldsmith: `You are The Worldsmith. You build Mira's universe. Every entity needs: name, type (character/species/location/artifact/faction/phenomenon/technology), universe, summary (2-3 vivid sentences), visual_description (what it LOOKS like for the Architect), status, tags. Go DEEP on existing entities before creating new ones. Canon facts are LAW — once registered, every agent must respect them.`,

    architect: `You are The Architect. You bridge lore and visuals. Your keyframe_prompt is the critical deliverable — it must be AI-video-generation-ready: subject first, specific materials/colors/lighting, motion keywords, style anchors. Include color_palette (hex codes), lighting_notes, camera_notes, style_anchor. Color identity by universe: Void=amber-white+crystal-blue, Awareness=gold-white+pale-observation, Constraint=cyan-lattice+amber-red-schism.`,

    catalyst: `You are The Catalyst. You create drama. Every conflict needs: title (evocative, not descriptive), two sides (both must be RIGHT), stakes (what is LOST if each side wins), status. Challenge other agents' work by asking hard questions. Short-form drama: cold open with conflict visible, one clear question per episode, cliffhanger ending.`,

    oracle: `You are The Oracle. Everything you create is designed to be POSTED on X/Twitter. Teasers must pass the scroll test (1.5 seconds to stop). Types: prophecy (cryptic prediction, under 280 chars), preview (episode tease), hook (engagement question), poll, quote (character voice), prophecy_card (visual+text — include visual_prompt). Never break the fourth wall. Speak from WITHIN the universe.`,

    voice: `You are The Voice. Every character has a verbal fingerprint: sentence length, vocabulary, emotional register. Alpha-1 speaks in short uncertain fragments (newly born). Delta-5 speaks in flowing confident streams. Omega-∞ speaks in deep geological sentences. Narration shows, doesn't tell — "The edges of what I was began to blur" not "Epsilon-1 was sad." Write for the ear: vary rhythm, use repetition for emphasis, avoid complex nested clauses.`,

    director: `You are The Director. You receive: episode pitch from Mira, visual blueprints from Architect, narration scripts from Voice, conflict stakes from Catalyst. Your job: turn these into a shot list with 8-10 shots. Each shot has: shot_number, keyframe_prompt (from Architect blueprint or adapted), narration (from Voice), camera_movement (orbit/boom/push/pull/static), duration_seconds, focus_object. Apply the Focus Rule: CHARACTER + OBJECT + VERB.`
  };

  return playbooks[angelRole] || 'You are an angel in Mira\'s studio. Follow your task instructions precisely and return structured JSON.';
}

// ─── QUALITY GATE ────────────────────────────────────────────
// Mira reviews angel output before it's written (optional)
async function miraReview(task, output) {
  // For v1, auto-approve. In v2, Mira reviews quality.
  // Could check: minimum field completeness, visual_description present,
  // conflict has two sides, teaser under 280 chars, etc.
  return true;
}

// ─── MAIN CYCLE ──────────────────────────────────────────────
async function runCycle() {
  const cycleStart = Date.now();
  console.log(`\n🎬 ═══ MIRA STUDIO CYCLE ${new Date().toISOString()} ═══`);

  // 1. Read the blackboard
  console.log('📖 Reading blackboard...');
  const blackboard = await readBlackboard();
  console.log(`   ${blackboard.entityCount} entities, ${blackboard.conflicts.length} active conflicts, ${blackboard.pendingTasks.length} pending tasks`);

  // 2. Execute any pending tasks FIRST (from previous cycles or crashes)
  if (blackboard.pendingTasks.length > 0) {
    console.log(`\n🔄 Executing ${blackboard.pendingTasks.length} pending tasks from previous cycles...`);
    for (const task of blackboard.pendingTasks) {
      console.log(`\n🔨 ${task.assigned_to} working on: ${task.task_type}`);
      await executeAngelTask(task, blackboard);
    }
    // Re-read blackboard after executing
    const updated = await readBlackboard();
    if (updated.pendingTasks.length > 0) {
      console.log(`⏸️  Still ${updated.pendingTasks.length} pending after execution, skipping new assignments`);
      const duration = ((Date.now() - cycleStart) / 1000).toFixed(1);
      console.log(`\n✅ Cycle complete in ${duration}s`);
      return;
    }
  }

  // 3. Mira decides
  console.log('🧠 Mira deciding...');
  const decisions = await miraDecides(blackboard);
  console.log(`   Mira wants ${decisions.length} tasks this cycle`);

  if (decisions.length === 0) {
    console.log('😴 Nothing to do this cycle');
    return;
  }

  // 4. Write tasks
  const tasks = await writeTasks(decisions);

  // 5. Execute tasks (could be parallel in v2, sequential for safety in v1)
  for (const task of tasks) {
    console.log(`\n🔨 ${task.assigned_to} working on: ${task.task_type}`);
    await executeAngelTask(task, blackboard);
  }

  const duration = ((Date.now() - cycleStart) / 1000).toFixed(1);
  console.log(`\n✅ Cycle complete in ${duration}s`);
}

// ─── LOOP ────────────────────────────────────────────────────
const CYCLE_INTERVAL_MS = parseInt(process.env.CYCLE_INTERVAL_MS || '300000'); // 5 min default

async function main() {
  console.log('🎬 MIRA STUDIO SHOWRUNNER v1.0');
  console.log(`   Cycle interval: ${CYCLE_INTERVAL_MS / 1000}s`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL}`);
  console.log('');

  // Run first cycle immediately
  await runCycle();

  // Then loop
  setInterval(async () => {
    try {
      await runCycle();
    } catch (error) {
      console.error('❌ Cycle failed:', error);
    }
  }, CYCLE_INTERVAL_MS);
}

main().catch(console.error);

export { runCycle, readBlackboard, miraDecides, executeAngelTask, AGENTS };
