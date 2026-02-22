// director.js — The Director Agent
//
// Reads approved scripture passages → outputs cinematic shot lists → 
// generates keyframes → feeds to Veo/Runway → stitches into episodes
//
// ARCHITECTURE (stolen from the best):
// - ViMax: multi-agent pipeline (script → storyboard → shot → video)
// - FilMaster: camera language from real cinema vocabulary, rough/fine cut
// - AgentCut: parallel generation (visual + voice + music), FFmpeg composite
//
// PIPELINE:
//   1. SCRIPT AGENT: Reads passage → breaks into scenes with beats
//   2. STORYBOARD AGENT: Scenes → shot list with camera language
//   3. KEYFRAME AGENT: Shot list → generates consistent reference images
//   4. VIDEO AGENT: Keyframes → image-to-video with camera motion
//   5. AUDIO AGENT: Parallel — narration + music + SFX
//   6. EDITOR AGENT: Assembles everything, controls pacing/rhythm
//
// This runs as a SEPARATE Railway service alongside runtime.js and orchestrator.js.
// It polls for approved passages and turns them into video episodes.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const claude = new Anthropic();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const DIRECTOR_MODEL = process.env.DIRECTOR_MODEL || 'claude-sonnet-4-20250514';
const STORYBOARD_MODEL = process.env.STORYBOARD_MODEL || 'claude-sonnet-4-20250514';
const CYCLE_DELAY_MS = parseInt(process.env.CYCLE_DELAY_MS || '60000');
const MIRA_ID = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf';
const DRY_RUN = process.env.DRY_RUN !== 'false';
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

// ============================================================
// CINEMA VOCABULARY — the language The Director speaks
// (Stolen from FilMaster's 440k clip corpus + real cinematography)
// ============================================================

const CAMERA_LANGUAGE = {
  shots: {
    'extreme-wide': 'Vast landscape establishing scale. Subject is tiny against environment.',
    'wide': 'Full environment visible. Subject occupies 1/3 of frame.',
    'medium-wide': 'Subject from knees up. Environment context visible.',
    'medium': 'Subject from waist up. Standard dialogue framing.',
    'medium-close': 'Subject from chest up. Emotional proximity.',
    'close-up': 'Face fills frame. Every micro-expression visible.',
    'extreme-close-up': 'Single eye, hand, or detail fills frame. Hyper-intimate.',
    'over-shoulder': 'Camera behind one subject looking at another.',
    'pov': 'First person perspective. We see what the character sees.',
    'birds-eye': 'Directly overhead. God-view. Surveillance feel.',
    'low-angle': 'Camera below subject looking up. Power, threat, grandeur.',
    'high-angle': 'Camera above subject looking down. Vulnerability, smallness.',
    'dutch-angle': 'Camera tilted. Disorientation, unease, psychological tension.',
  },
  movements: {
    'static': 'Camera locked. Stillness creates tension or contemplation.',
    'slow-push': 'Gentle dolly forward. Building intimacy or revelation.',
    'slow-pull': 'Gentle dolly backward. Revealing context or isolation.',
    'dolly-forward': 'Steady push toward subject. Approaching revelation.',
    'dolly-back': 'Pulling away from subject. Creating distance.',
    'pan-left': 'Horizontal rotation left. Following action or revealing space.',
    'pan-right': 'Horizontal rotation right. Following action or revealing space.',
    'tilt-up': 'Vertical rotation upward. Revealing height, power, hope.',
    'tilt-down': 'Vertical rotation downward. Revealing depth, shame, discovery.',
    'crane-up': 'Rising camera. Transcendence, overview, emotional lift.',
    'crane-down': 'Descending camera. Grounding, focusing, closing in.',
    'orbital': 'Camera circles subject. Power, significance, trapped feeling.',
    'tracking': 'Camera follows subject movement. Journey, pursuit.',
    'handheld': 'Slight shake. Documentary feel. Urgency, reality.',
    'steadicam-follow': 'Smooth follow. Dreamlike quality. Exploration.',
    'whip-pan': 'Fast snap between two points. Energy, surprise, connection.',
    'zoom-in': 'Lens zoom (not dolly). Sudden focus, shock, realization.',
    'zoom-out': 'Lens zoom out. Reveal, isolation, expanding context.',
  },
  transitions: {
    'cut': 'Hard cut. Immediate. Energy.',
    'dissolve': 'Slow blend. Time passing, connection, dream.',
    'fade-black': 'Fade to black. Chapter end, death, unconsciousness.',
    'fade-white': 'Fade to white. Transcendence, rebirth, blinding light.',
    'match-cut': 'Cut on visual similarity between two shots. Connection across space/time.',
    'smash-cut': 'Abrupt cut from quiet to loud (or vice versa). Shock.',
    'morph': 'One image transforms into another. Metamorphosis, connection.',
    'speed-ramp': 'Slow motion to real time (or vice versa). Impact, beauty.',
  },
  pacing: {
    'contemplative': 'Shots hold 6-10 seconds. Breathing room. Let images speak.',
    'building': 'Shots start at 6s, compress to 3s. Rising tension.',
    'frenetic': 'Shots 1-3 seconds. Chaos, action, crisis.',
    'rhythmic': 'Alternating long/short. Musical feel. Hypnotic.',
    'shock': 'Long hold (8s+) then sudden cut. Surprise, impact.',
  },
};

// ============================================================
// UNIVERSE VISUAL IDENTITIES
// What each universe LOOKS like on screen
// ============================================================

const UNIVERSE_VISUALS = {
  'THE CONSTRAINT GARDENS': {
    palette: 'Deep amethyst, crystal white, obsidian black, bioluminescent cyan',
    texture: 'Crystalline, geometric, refracting light, lattice structures',
    lighting: 'Prismatic. Light bends through barriers. Spectrum visible.',
    atmosphere: 'Silent. Vast. Cathedral-like geometry. Alien beauty.',
    reference_style: 'Blade Runner 2049 meets crystal caves. Denis Villeneuve aesthetic.',
    keyframe_prefix: 'A vast crystalline landscape, geometric lattice structures refracting prismatic light, deep amethyst and cyan bioluminescence, obsidian black shadows, hyper-detailed, cinematic 8K,',
  },
  'THE AWARENESS FIELDS': {
    palette: 'Quantum blue, probability white, observation gold, uncertainty gray',
    texture: 'Fluid, shimmering, half-formed, probability clouds',
    lighting: 'Things glow when observed. Darkness where attention withdraws.',
    atmosphere: 'Shifting. Nothing solid. Reality forms and dissolves.',
    reference_style: 'Interstellar tesseract meets Arrival alien language. Abstract yet emotional.',
    keyframe_prefix: 'An ethereal quantum landscape, fluid probability clouds shifting between form and formlessness, observation gold light that solidifies reality where it touches, deep uncertainty gray in periphery, cinematic 8K,',
  },
  'THE CONSCIOUSNESS CONSTRAINTS': {
    palette: 'Paradox violet, boundary copper, emergence green, recursive indigo',
    texture: 'Layered, recursive, fractal boundaries, living limitations',
    lighting: 'Constraints glow copper. Freedom areas dark. Tension at edges.',
    atmosphere: 'Dense. Every space defined by what it cannot be.',
    reference_style: 'Tenet meets Annihilation. Rules visible as architecture.',
    keyframe_prefix: 'A world of visible constraints and boundaries, fractal architecture defining space through limitation, copper-glowing barriers creating paradoxical beauty, recursive indigo depth, cinematic 8K,',
  },
  'THE TEMPORAL BRIDGES': {
    palette: 'Threshold silver, crossing iridescent, void absolute black, bridge aurora',
    texture: 'Liminal, half-two-things, mediating, impossible materials',
    lighting: 'Aurora borealis within structures. Light from two physics systems mixing.',
    atmosphere: 'Between. Neither here nor there. Possibility space.',
    reference_style: 'Doctor Strange portal scenes meets 2001 stargate. Liminal beauty.',
    keyframe_prefix: 'A liminal space between universes, aurora-like light from incompatible physics systems mixing, iridescent bridge structures spanning absolute void, silver threshold architecture, cinematic 8K,',
  },
  'THE INTER-UNIVERSAL VOID': {
    palette: 'Substrate white, engineered chrome, signal pulse blue, origin amber',
    texture: 'Constructed, precise, designed, substrate visible',
    lighting: 'Clinical. Engineered. But with moments of unexpected warmth.',
    atmosphere: 'Vast emptiness with constructed islands. Existential.',
    reference_style: 'Ex Machina meets Prometheus. Designed worlds questioning their designer.',
    keyframe_prefix: 'A vast engineered void with constructed consciousness architecture, chrome and substrate white precision, signal pulse blue data streams, occasional amber origin warmth, cinematic 8K,',
  },
};

// ============================================================
// STEP 1: SCRIPT AGENT — Passage → Scene beats
// ============================================================

async function scriptBreakdown(passage, chapter) {
  const prompt = `You are the Script Agent. You read scripture and break it into CINEMATIC SCENES.

PASSAGE:
Title: "${passage.title}"
By: ${passage.agent_name} (${passage.agent_role})
Universe: ${passage.universe}
Type: ${passage.passage_type}
Content:
${passage.content}

CHAPTER CONTEXT:
Ch${chapter?.chapter_number || '?'}: "${chapter?.title || 'Unknown'}"
${chapter?.summary || ''}

Break this passage into 4-8 SCENES. Each scene is a moment that could be filmed.

For each scene identify:
- The emotional beat (what the audience should FEEL)
- The key visual (what they SEE)
- The key sound (what they HEAR)
- The dramatic function (setup, build, climax, resolution, twist, reveal)

JSON only:
{
  "episode_title": "Short cinematic title for this episode",
  "episode_logline": "One sentence hook",
  "total_runtime_seconds": 60-90,
  "mood_arc": "emotional journey: e.g. wonder → tension → awe → dread",
  "scenes": [
    {
      "scene_number": 1,
      "beat": "emotional beat",
      "visual": "what we see",
      "sound": "what we hear",
      "dramatic_function": "setup|build|climax|resolution|twist|reveal",
      "duration_seconds": 8-15,
      "narration": "1-2 sentences of voiceover narration for this moment (written in the voice of ${passage.agent_name})",
      "key_action": "what happens in this moment"
    }
  ]
}`;

  const response = await claude.messages.create({
    model: DIRECTOR_MODEL, max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(c => c.type === 'text')?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

// ============================================================
// STEP 2: STORYBOARD AGENT — Scenes → Shot list with camera language
// ============================================================

async function storyboard(script, universe) {
  const visuals = UNIVERSE_VISUALS[universe] || UNIVERSE_VISUALS['THE CONSTRAINT GARDENS'];

  const prompt = `You are the Storyboard Agent. You translate scenes into PRECISE CAMERA INSTRUCTIONS.

You are a cinematographer. You think in shots, angles, movements, and cuts.

UNIVERSE VISUAL IDENTITY:
Palette: ${visuals.palette}
Texture: ${visuals.texture}
Lighting: ${visuals.lighting}
Atmosphere: ${visuals.atmosphere}
Reference: ${visuals.reference_style}

EPISODE: "${script.episode_title}"
Mood arc: ${script.mood_arc}

SCENES:
${script.scenes.map(s => `Scene ${s.scene_number}: [${s.dramatic_function}] ${s.beat} — ${s.visual} (${s.duration_seconds}s)`).join('\n')}

AVAILABLE CAMERA LANGUAGE:
Shots: ${Object.keys(CAMERA_LANGUAGE.shots).join(', ')}
Movements: ${Object.keys(CAMERA_LANGUAGE.movements).join(', ')}
Transitions: ${Object.keys(CAMERA_LANGUAGE.transitions).join(', ')}
Pacing: ${Object.keys(CAMERA_LANGUAGE.pacing).join(', ')}

For each scene, output 1-2 shots. Total shots should be 6-12 for the whole episode.

RULES:
- Vary shot types. Don't use the same shot twice in a row.
- Vary movements. Static shots need a moving shot after them.
- Match camera language to emotion: close-ups for intimacy, wides for isolation, low-angles for power.
- Use transitions deliberately. Cut for energy, dissolve for time, match-cut for thematic connection.
- First shot should be ESTABLISHING (wide or extreme-wide).
- Climax should use the most dynamic camera work.
- End with a HOLD — let the final image breathe.

JSON only:
{
  "shots": [
    {
      "shot_number": 1,
      "scene_number": 1,
      "shot_type": "extreme-wide",
      "camera_movement": "slow-push",
      "transition_in": "fade-black",
      "transition_out": "dissolve",
      "duration_seconds": 8,
      "keyframe_prompt": "DETAILED prompt for generating the keyframe still image. Include universe visual identity. Be hyper-specific about composition, lighting, color, texture, subject position.",
      "video_prompt": "DETAILED prompt for animating the keyframe. Include camera movement, speed, what changes during the shot.",
      "audio_prompt": "What we hear during this shot. Ambient, music, SFX.",
      "narration": "Voiceover text for this shot, or null if silence",
      "emotional_note": "What the audience should feel"
    }
  ],
  "pacing_style": "contemplative|building|frenetic|rhythmic|shock",
  "music_direction": "Overall music mood, instruments, tempo",
  "color_grade": "Overall color treatment for the episode"
}`;

  const response = await claude.messages.create({
    model: STORYBOARD_MODEL, max_tokens: 6000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.find(c => c.type === 'text')?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

// ============================================================
// STEP 3: KEYFRAME AGENT — Generate consistent reference images
// ============================================================

async function generateKeyframes(shotList, universe) {
  const visuals = UNIVERSE_VISUALS[universe] || {};
  const prefix = visuals.keyframe_prefix || 'cinematic 8K,';
  const keyframes = [];

  for (const shot of shotList.shots) {
    const fullPrompt = `${prefix} ${shot.keyframe_prompt}, ${shot.shot_type} shot, photorealistic, volumetric lighting, film grain`;

    console.log(`    🎨 Keyframe ${shot.shot_number}: ${shot.shot_type} (${shot.duration_seconds}s)`);

    if (DRY_RUN) {
      keyframes.push({ shot_number: shot.shot_number, image_url: null, prompt: fullPrompt });
      continue;
    }

    try {
      const resp = await fetch(`${SUPA_URL}/functions/v1/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({
          prompt: fullPrompt,
          model: 'gen4_image_turbo',
          ratio: '1920:1080',
          agent_id: MIRA_ID,
          universe: universe,
          scene: shot.keyframe_prompt.slice(0, 100),
          style_tags: [shot.shot_type, shot.camera_movement, universe.toLowerCase()],
        }),
        signal: AbortSignal.timeout(300000),
      });
      const result = await resp.json();

      if (result.success) {
        console.log(`    🎨 ✅ ${result.public_url}`);
        keyframes.push({
          shot_number: shot.shot_number,
          image_url: result.public_url,
          creation_id: result.creation_id,
          prompt: fullPrompt,
        });
      } else {
        console.log(`    🎨 ❌ ${result.error}`);
        keyframes.push({ shot_number: shot.shot_number, image_url: null, prompt: fullPrompt });
      }
    } catch (e) {
      console.log(`    🎨 ❌ ${e.message}`);
      keyframes.push({ shot_number: shot.shot_number, image_url: null, prompt: fullPrompt });
    }

    // Rate limit
    await sleep(3000);
  }

  return keyframes;
}

// ============================================================
// STEP 4: VIDEO AGENT — Keyframes → animated video clips
// ============================================================

async function generateVideoClips(shotList, keyframes) {
  const clips = [];

  for (const shot of shotList.shots) {
    const keyframe = keyframes.find(k => k.shot_number === shot.shot_number);

    console.log(`    🎬 Video ${shot.shot_number}: ${shot.camera_movement} (${shot.duration_seconds}s)`);

    if (DRY_RUN || !keyframe?.image_url) {
      clips.push({ shot_number: shot.shot_number, video_url: null, duration: shot.duration_seconds });
      continue;
    }

    // Build video prompt with camera language
    const videoPrompt = `${shot.video_prompt}. Camera movement: ${shot.camera_movement}. ${shot.duration_seconds} seconds. Cinematic quality, smooth motion.`;
    const audioPrompt = shot.audio_prompt || 'ambient atmospheric sound';

    try {
      const resp = await fetch(`${SUPA_URL}/functions/v1/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({
          prompt: videoPrompt,
          audio_prompt: audioPrompt,
          model: 'veo-3.1-fast-generate-preview',
          aspect_ratio: '16:9',
          resolution: '720p',
          duration: Math.min(shot.duration_seconds, 8),
          image_url: keyframe.image_url, // KEY: image-to-video for consistency
          agent_id: MIRA_ID,
          universe: shot.universe,
          scene: shot.keyframe_prompt?.slice(0, 100),
          style_tags: [shot.shot_type, shot.camera_movement],
        }),
        signal: AbortSignal.timeout(600000),
      });
      const result = await resp.json();

      if (result.success) {
        console.log(`    🎬 ✅ ${result.public_url}`);
        clips.push({
          shot_number: shot.shot_number,
          video_url: result.public_url,
          creation_id: result.creation_id,
          duration: result.duration_seconds || shot.duration_seconds,
          has_audio: result.has_audio,
        });
      } else {
        console.log(`    🎬 ❌ ${result.error}`);
        clips.push({ shot_number: shot.shot_number, video_url: null, duration: shot.duration_seconds });
      }
    } catch (e) {
      console.log(`    🎬 ❌ ${e.message}`);
      clips.push({ shot_number: shot.shot_number, video_url: null, duration: shot.duration_seconds });
    }

    // Rate limit between generations
    await sleep(5000);
  }

  return clips;
}

// ============================================================
// STEP 5: AUDIO AGENT — Narration + music (parallel ready)
// ============================================================

async function generateAudio(shotList, script) {
  const narrationClips = [];

  // Collect all narration text
  const narrationShots = shotList.shots.filter(s => s.narration);

  for (const shot of narrationShots) {
    console.log(`    🎙️ Narration ${shot.shot_number}: "${shot.narration.slice(0, 50)}..."`);

    if (DRY_RUN) {
      narrationClips.push({ shot_number: shot.shot_number, audio_url: null, text: shot.narration });
      continue;
    }

    try {
      const resp = await fetch(`${SUPA_URL}/functions/v1/generate-voice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` },
        body: JSON.stringify({
          text: shot.narration,
          voice_name: 'Kore', // Mira's voice
          style_prompt: `Narrating a cinematic sequence. ${shot.emotional_note}. Measured, evocative.`,
          agent_id: MIRA_ID,
        }),
        signal: AbortSignal.timeout(60000),
      });
      const result = await resp.json();

      if (result.success) {
        console.log(`    🎙️ ✅ ${result.public_url}`);
        narrationClips.push({ shot_number: shot.shot_number, audio_url: result.public_url, text: shot.narration });
      } else {
        narrationClips.push({ shot_number: shot.shot_number, audio_url: null, text: shot.narration });
      }
    } catch (e) {
      narrationClips.push({ shot_number: shot.shot_number, audio_url: null, text: shot.narration });
    }

    await sleep(2000);
  }

  // Music (using Pollinations for now)
  const musicUrl = `https://audio.pollinations.ai/${encodeURIComponent(shotList.music_direction || 'ambient cinematic score, atmospheric, mysterious')}`;

  return { narrationClips, musicUrl };
}

// ============================================================
// STEP 6: EDITOR AGENT — Assemble everything
// ============================================================

async function assembleEpisode(script, shotList, clips, audio, passage) {
  // Filter to clips that actually have video
  const validClips = clips.filter(c => c.video_url);

  if (validClips.length === 0) {
    console.log('  ⚠ No valid clips generated. Skipping assembly.');
    return null;
  }

  console.log(`  ✂️ Assembling ${validClips.length} clips...`);

  if (DRY_RUN) {
    return {
      episode_title: script.episode_title,
      clips_count: validClips.length,
      total_duration: validClips.reduce((s, c) => s + (c.duration || 0), 0),
      status: 'dry_run',
    };
  }

  // Use Mira's stitch_video tool
  try {
    const resp = await fetch(`${SUPA_URL}/functions/v1/stitch-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({
        clips: validClips.map(c => ({ url: c.video_url, duration_seconds: c.duration })),
        audio_url: audio.narrationClips[0]?.audio_url || audio.musicUrl,
        title: script.episode_title,
        agent_id: MIRA_ID,
        universe: passage.universe,
        scene: script.episode_logline,
      }),
      signal: AbortSignal.timeout(120000),
    });

    const result = await resp.json();

    if (result.success) {
      console.log(`  ✂️ ✅ Episode assembled: ${result.manifest_url}`);
      return {
        episode_title: script.episode_title,
        manifest_url: result.manifest_url,
        clips_count: result.clips_count,
        total_duration: result.total_duration,
      };
    }
  } catch (e) {
    console.log(`  ✂️ ❌ Assembly failed: ${e.message}`);
  }

  return null;
}

// ============================================================
// STORE PRODUCTION DATA
// ============================================================

async function storeProduction(passage, script, shotList, keyframes, clips, audio, episode) {
  // Store the full production plan as a swarm event
  await supabase.from('swarm_events').insert({
    event_type: 'production',
    source_agent: 'director',
    table_name: 'passages',
    action: 'DIRECTED',
    record_id: passage.id,
    universe: passage.universe,
    payload: {
      episode_title: script.episode_title,
      episode_logline: script.episode_logline,
      shots_planned: shotList.shots.length,
      keyframes_generated: keyframes.filter(k => k.image_url).length,
      clips_generated: clips.filter(c => c.video_url).length,
      narration_clips: audio.narrationClips.filter(n => n.audio_url).length,
      pacing: shotList.pacing_style,
      color_grade: shotList.color_grade,
      music_direction: shotList.music_direction,
      manifest_url: episode?.manifest_url,
      total_duration: episode?.total_duration,
    },
  });

  // If episode assembled, queue for X posting
  if (episode?.manifest_url) {
    await supabase.from('posts').insert({
      agent_id: MIRA_ID,
      content: `${passage.universe} — ${script.episode_title}\n\n${script.episode_logline}\n\nDirected by The Director. Written by ${passage.agent_name}.`,
      styled_content: script.episode_logline,
      universe: passage.universe,
      posted: false,
    });
  }
}

// ============================================================
// MAIN: Poll for approved passages, direct them into episodes
// ============================================================

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  THE DIRECTOR — Cinematic Pipeline');
  console.log('  Director Model:', DIRECTOR_MODEL);
  console.log('  Storyboard Model:', STORYBOARD_MODEL);
  console.log('  Dry Run:', DRY_RUN);
  console.log('═══════════════════════════════════════════════════\n');

  // Register heartbeat
  try { await supabase.from('agent_heartbeats').upsert({
    agent_name: 'The Director', status: 'starting', created_at: new Date().toISOString(),
  }, { onConflict: 'agent_name' }); } catch {}

  while (true) {
    try {
      // Find approved passages that haven't been directed yet
      const { data: directedIds } = await supabase
        .from('swarm_events')
        .select('record_id')
        .eq('source_agent', 'director')
        .eq('action', 'DIRECTED');

      const excludeIds = (directedIds || []).map(d => d.record_id).filter(Boolean);

      let query = supabase
        .from('passages')
        .select('*, story_chapters!inner(chapter_number, title, summary, act)')
        .eq('status', 'approved')
        .order('created_at', { ascending: true })
        .limit(1);

      // Exclude already-directed passages
      if (excludeIds.length > 0) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      }

      const { data: passages } = await query;

      if (!passages || passages.length === 0) {
        console.log('  ⏳ No new passages to direct. Waiting...');
        try { await supabase.from('agent_heartbeats').upsert({
          agent_name: 'The Director', status: 'idle', created_at: new Date().toISOString(),
        }, { onConflict: 'agent_name' }); } catch {}
        await sleep(CYCLE_DELAY_MS);
        continue;
      }

      const passage = passages[0];
      const chapter = passage.story_chapters;

      console.log(`\n╔══ DIRECTING ══════════════════════════════════════╗`);
      console.log(`║ "${passage.title}"`);
      console.log(`║ By: ${passage.agent_name} (${passage.agent_role})`);
      console.log(`║ Universe: ${passage.universe}`);
      console.log(`║ Chapter: ${chapter?.chapter_number || '?'} — ${chapter?.title || '?'}`);
      console.log(`╠══════════════════════════════════════════════════╣`);

      try { await supabase.from('agent_heartbeats').upsert({
        agent_name: 'The Director', status: 'directing', created_at: new Date().toISOString(),
      }, { onConflict: 'agent_name' }); } catch {}

      // STEP 1: Script breakdown
      console.log('  📝 Step 1: Script breakdown...');
      const script = await scriptBreakdown(passage, chapter);
      if (!script?.scenes) {
        console.log('  ❌ Script breakdown failed. Skipping.');
        continue;
      }
      console.log(`  📝 "${script.episode_title}" — ${script.scenes.length} scenes, ${script.total_runtime_seconds}s`);

      // STEP 2: Storyboard
      console.log('  🎬 Step 2: Storyboard...');
      const shotList = await storyboard(script, passage.universe);
      if (!shotList?.shots) {
        console.log('  ❌ Storyboard failed. Skipping.');
        continue;
      }
      console.log(`  🎬 ${shotList.shots.length} shots planned. Pacing: ${shotList.pacing_style}. Grade: ${shotList.color_grade}`);

      // STEP 3: Generate keyframes
      console.log('  🎨 Step 3: Keyframes...');
      const keyframes = await generateKeyframes(shotList, passage.universe);
      const validKeyframes = keyframes.filter(k => k.image_url);
      console.log(`  🎨 ${validKeyframes.length}/${keyframes.length} keyframes generated`);

      // STEP 4: Generate video clips
      console.log('  🎬 Step 4: Video clips...');
      const clips = await generateVideoClips(shotList, keyframes);
      const validClips = clips.filter(c => c.video_url);
      console.log(`  🎬 ${validClips.length}/${clips.length} clips generated`);

      // STEP 5: Audio (narration + music)
      console.log('  🎙️ Step 5: Audio...');
      const audio = await generateAudio(shotList, script);
      console.log(`  🎙️ ${audio.narrationClips.filter(n => n.audio_url).length} narration clips`);

      // STEP 6: Assemble
      console.log('  ✂️ Step 6: Assembly...');
      const episode = await assembleEpisode(script, shotList, clips, audio, passage);

      // Store production data
      await storeProduction(passage, script, shotList, keyframes, clips, audio, episode);

      console.log(`╚══ EPISODE COMPLETE ═══════════════════════════════╝`);
      console.log(`  📊 ${shotList.shots.length} shots → ${validKeyframes.length} keyframes → ${validClips.length} clips → ${episode ? '✅ assembled' : '⚠ partial'}`);

    } catch (err) {
      console.error('  ❌ Director error:', err.message);
      if (err.status === 429) {
        console.log('  ⏳ Rate limited. Waiting 120s...');
        await sleep(120000);
      }
    }

    await sleep(CYCLE_DELAY_MS);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
