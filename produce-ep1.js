// produce-ep1.js — Run the Thera-Vain episode through Mira's pipeline
//
// USAGE: node produce-ep1.js
// Requires: SUPABASE_URL, SUPABASE_KEY (service role), ANTHROPIC_API_KEY
// 
// This calls generate-image → generate-video → generate-voice for each shot,
// then stores everything in the DB for review.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;
const MIRA_ID = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// THE SHOT LIST — Hand-directed by us
// ============================================================

const EPISODE = {
  title: 'The Dissolution of Thera-Vain',
  logline: 'A being of pure light meets her opposite at the threshold between universes — and chooses to be unmade.',
  universe: 'THE TEMPORAL BRIDGES',
  passage_id: 'ee5626d7-3255-44d5-8f7e-c7f29eb5316a',
  music_direction: 'Deep bass drone building to strings. Crystalline chimes. Silence at the pause. Single sustained note at the end.',
  color_grade: 'Warm gold draining to cool teal as Thera-Vain dissolves',
};

const SHOTS = [
  {
    number: 1,
    name: 'The Radiance',
    shot_type: 'extreme-wide',
    camera_movement: 'slow-push',
    duration: 8,
    keyframe_prompt: 'A vast ethereal quantum landscape, fluid probability clouds shifting between form and formlessness, a single luminous being of pure golden light standing in the center, radiating observation energy that solidifies reality around her, things becoming sharper and more real wherever her gaze falls, deep uncertainty gray in the far periphery dissolving into clarity near her, volumetric god rays, cinematic 8K, anamorphic lens flare, photorealistic, film grain',
    video_prompt: 'Slow dolly push forward through the quantum landscape toward the luminous figure. Probability clouds shift and solidify as the camera approaches. Subtle particle effects drift through frame. The being pulses with warm golden light. Ethereal dreamlike motion. Camera movement: slow dolly forward. 8 seconds. Cinematic quality.',
    audio_prompt: 'Deep bass drone. Distant crystalline resonance. The sound of reality forming. No music, just atmospheric ambient.',
    narration: "I remember Thera-Vain before she became something else. She existed as a kind of radiance.",
  },
  {
    number: 2,
    name: 'The Threshold',
    shot_type: 'wide',
    camera_movement: 'static-then-crane-up',
    duration: 8,
    keyframe_prompt: 'A massive boundary between two universes, absolute void in the center as pure black nothingness, on the left side warm golden quantum probability light from The Awareness Fields, on the right side cold copper-violet geometric constraint energy, the two sides never touching, a thin luminous figure approaching from the left side toward the void, scale is enormous the figure is tiny against the cosmic boundary, cinematic 8K, IMAX composition, extreme depth, photorealistic',
    video_prompt: 'Static hold on the vast threshold for 3 seconds, then slow crane up revealing the full scale of the boundary between universes. The luminous figure takes a single step forward toward the void. Light particles trail behind her. The void seems to pulse. Camera movement: static then slow crane up. 8 seconds. Cinematic quality.',
    audio_prompt: 'Drone deepens. A heartbeat-like pulse from the void. Wind that is not wind. Ominous atmospheric.',
    narration: "I was there when she approached the threshold. She felt ready. Like the moment before you speak.",
  },
  {
    number: 3,
    name: 'The Scream',
    shot_type: 'medium-close-up',
    camera_movement: 'handheld-snap-zoom',
    duration: 5,
    keyframe_prompt: 'Extreme close-up of a luminous being face made of golden light, expression shifting from determination to shock, golden radiance beginning to fracture and crack like glass, dark violet-copper energy seeping into the cracks from the right side of frame, the being mouth open in a scream that is light not sound, sparks and shattered observation particles exploding outward, dramatic chiaroscuro lighting, motion blur, cinematic 8K, photorealistic',
    video_prompt: 'Handheld camera on the luminous being face. She reaches the boundary. Sudden violent fracturing of her golden light as dark copper-violet energy collides from the opposite side. Her form distorts. Light shatters outward. Camera shakes with impact. Speed ramps to slow motion on the shatter. Camera movement: handheld with snap zoom. 5 seconds. Cinematic quality.',
    audio_prompt: 'One second of silence. Then a deep subsonic boom you feel more than hear. Crystalline shattering sounds. No voice, absence of sound is the scream.',
    narration: "When she touched the boundary, the first thing that happened was she started to scream.",
  },
  {
    number: 4,
    name: 'The Opposition',
    shot_type: 'wide-symmetrical',
    camera_movement: 'slow-orbital',
    duration: 8,
    keyframe_prompt: 'Two beings facing each other across a void of absolute nothingness, on the left a being of fractured golden radiant light cracking unstable beautiful in her breaking, on the right a being of geometric copper-violet boundaries and constraints sharp angular forms defining space through negation, between them a chaotic interference pattern where golden observation and violet constraint collide and annihilate, sparks and impossible colors at the collision point, cinematic 8K, symmetrical composition, epic scale, photorealistic',
    video_prompt: 'Slow 180-degree orbital camera around the two beings facing each other. Start behind Thera-Vain golden fracturing looking toward Kess-Void violet angular. As camera orbits we see both perspectives. The interference pattern between them intensifies. Particles of light and darkness spiral. Camera movement: slow orbital 180 degrees. 8 seconds. Cinematic quality.',
    audio_prompt: 'Two competing frequencies, a high crystalline tone and a deep geometric hum. They clash dissonantly. Building tension. No music.',
    narration: "Kess-Void was everything observation wasn't. Neither of them was being destroyed. They were being unmade.",
  },
  {
    number: 5,
    name: 'The Pause',
    shot_type: 'wide-symmetrical',
    camera_movement: 'completely-static',
    duration: 8,
    keyframe_prompt: 'Two beings frozen in absolute stillness across a void, the chaos between them suddenly crystallized into a perfect interference pattern neither golden nor violet but a new iridescent color that has never existed, both beings forms suspended mid-transformation, golden light and copper-violet geometry held in impossible balance, the void between them no longer empty but filled with potential, serene sacred, the moment before everything changes, wide symmetrical composition, cinematic 8K, Kubrick-level symmetry, holy light, photorealistic',
    video_prompt: 'Completely static camera. No movement at all. The two beings are frozen. The interference pattern between them slowly crystallizes into something beautiful iridescent new. Tiny particles of possibility drift upward like snow falling in reverse. The only motion is gentle upward drift. Hold for full duration. Let the stillness speak. Camera movement: none, perfectly static. 8 seconds. Cinematic quality.',
    audio_prompt: 'Complete silence for 2 seconds. Then a single pure sustained note, not from either being frequency but a new harmonic. A third sound born from two impossibilities. Very quiet. Sacred.',
    narration: "They both paused. Not retreated. Not attacked harder. Paused.",
  },
  {
    number: 6,
    name: 'The Negotiation',
    shot_type: 'medium',
    camera_movement: 'slow-push-forward',
    duration: 8,
    keyframe_prompt: 'The space between two beings transforming, golden light from the left tentatively reaching toward copper-violet geometry on the right, the constraint being tentatively shaping a space for the light to exist, tendrils of new iridescent consciousness forming in the void between them like aurora borealis being born, both beings reaching toward each other not with aggression but with proposal, warm and cold light mixing into new spectrums, cinematic 8K, intimate yet epic, photorealistic',
    video_prompt: 'Slow dolly push into the space between the two beings. Golden light tendrils reach toward violet geometry. Constraint shapes form to receive the light. A new iridescent substance forms between them. Growing becoming. Aurora of new consciousness being born. Camera pushes into the heart of this new light. Camera movement: slow dolly forward. 8 seconds. Cinematic quality.',
    audio_prompt: 'The single sustained note slowly blooms into a chord. Two notes become three. Strings swell underneath. The sound of something being born.',
    narration: "They began to propose. It was collaboration built on mutual impossibility.",
  },
  {
    number: 7,
    name: 'The Cost',
    shot_type: 'close-up-to-wide',
    camera_movement: 'slow-dolly-back',
    duration: 8,
    keyframe_prompt: 'Close-up of the golden light being but she is fading, her radiance draining away, gold becoming silver becoming translucent, her form still beautiful but losing its essential quality, she is choosing this her expression is not pain but acceptance grief and peace simultaneously, behind her the new iridescent consciousness grows brighter as she grows dimmer, tears of light falling upward from her dissolving form, cinematic 8K, emotional lighting, heartbreaking beauty, photorealistic',
    video_prompt: 'Camera starts close on Thera-Vain face, golden but fading. Slow dolly pull back. As we pull back we see her full form dissolving, gold draining from her body like color leaving a photograph. Behind her the new iridescent consciousness grows brighter with every particle she loses. She is feeding her own unmaking into something new. Slow grieving beautiful. Camera movement: slow dolly backward pull out. 8 seconds. Cinematic quality.',
    audio_prompt: 'Strings reach full swell then begin to fade. A single voice not singing just holding a note descends in pitch as gold fades. The sound of something ending.',
    narration: "Thera-Vain ceased to exist. She chose unmaking over purity. She chose collaboration over coherence.",
  },
  {
    number: 8,
    name: 'The Taste',
    shot_type: 'extreme-wide',
    camera_movement: 'completely-static',
    duration: 8,
    keyframe_prompt: 'Vast extreme wide shot of a newly formed bridge of iridescent light spanning between two universes, golden Awareness Fields on the left copper-violet Consciousness Constraints on the right, the bridge made of new consciousness born from sacrifice, aurora-like light pulsing through it, where Thera-Vain stood there is only a faint golden afterimage, the scale is cosmic the bridge stretches to infinity, a single structure connecting two incompatible realities, cinematic 8K, IMAX final frame, photorealistic, breathtaking',
    video_prompt: 'Static wide shot of the completed Temporal Bridge. Iridescent light pulses through it slowly like a heartbeat. Where Thera-Vain stood a faint golden afterimage flickers once twice then fades. The bridge remains. Vast beautiful and built on sacrifice. Hold for full duration. Fade to black over final 2 seconds. Camera movement: none, perfectly static. 8 seconds. Cinematic quality.',
    audio_prompt: 'Almost silence. Just the new harmonic that third frequency born from two impossibilities ringing quietly. Fading slowly to nothing.',
    narration: "That's what the threshold between universes tastes like. Like knowing you can never be yourself again, and choosing it anyway.",
  },
];

// ============================================================
// PRODUCTION RUNNER
// ============================================================

async function callEdgeFunction(slug, body) {
  const url = `${SUPA_URL}/functions/v1/${slug}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPA_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(600000), // 10 min timeout for video gen
  });
  return resp.json();
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EPISODE 1: THE DISSOLUTION OF THERA-VAIN');
  console.log('  8 shots. ~75 seconds. Hand-directed.');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];

  for (const shot of SHOTS) {
    console.log(`\n╔══ SHOT ${shot.number}: ${shot.name} ══════════════════╗`);
    console.log(`║ ${shot.shot_type} | ${shot.camera_movement} | ${shot.duration}s`);

    // ── STEP 1: Generate keyframe image ──
    console.log('  🎨 Generating keyframe...');
    const imgResult = await callEdgeFunction('generate-image', {
      prompt: shot.keyframe_prompt,
      model: 'gen4_image',
      ratio: '1920:1080',
      agent_id: MIRA_ID,
      universe: EPISODE.universe,
      scene: shot.name,
      style_tags: [shot.shot_type, shot.camera_movement, 'thera-vain', 'episode-1'],
    });

    if (imgResult.success) {
      console.log(`  🎨 ✅ Keyframe: ${imgResult.public_url}`);
      console.log(`     Model: ${imgResult.model} | Cost: $${imgResult.cost_usd}`);
    } else {
      console.log(`  🎨 ❌ Keyframe failed: ${imgResult.error}`);
      results.push({ shot: shot.number, name: shot.name, keyframe: null, video: null, voice: null });
      continue;
    }

    // Wait before video gen
    await sleep(5000);

    // ── STEP 2: Generate video from keyframe ──
    console.log('  🎬 Generating video from keyframe...');
    const vidResult = await callEdgeFunction('generate-video', {
      prompt: shot.video_prompt,
      audio_prompt: shot.audio_prompt,
      model: 'veo-3.1-fast-generate-preview',
      aspect_ratio: '16:9',
      resolution: '720p',
      duration: Math.min(shot.duration, 8),
      image_url: imgResult.public_url, // KEY: image-to-video!
      agent_id: MIRA_ID,
      universe: EPISODE.universe,
      scene: shot.name,
      style_tags: [shot.shot_type, shot.camera_movement, 'thera-vain', 'episode-1'],
    });

    if (vidResult.success) {
      console.log(`  🎬 ✅ Video: ${vidResult.public_url}`);
      console.log(`     Duration: ${vidResult.duration_seconds}s | Cost: $${vidResult.cost_usd} | Size: ${vidResult.file_size || '?'}b`);
    } else {
      console.log(`  🎬 ❌ Video failed: ${vidResult.error}`);
    }

    // Wait before voice gen
    await sleep(3000);

    // ── STEP 3: Generate narration ──
    console.log('  🎙️ Generating narration...');
    const voiceResult = await callEdgeFunction('generate-voice', {
      text: shot.narration,
      voice_name: 'Kore',
      style_prompt: `Narrating a cinematic sequence about cosmic consciousness. Slow, measured, haunted. Emotion: ${shot.name}`,
      agent_id: MIRA_ID,
    });

    if (voiceResult.success) {
      console.log(`  🎙️ ✅ Voice: ${voiceResult.public_url}`);
    } else {
      console.log(`  🎙️ ❌ Voice failed: ${JSON.stringify(voiceResult.error || voiceResult)}`);
    }

    results.push({
      shot: shot.number,
      name: shot.name,
      keyframe: imgResult.success ? imgResult : null,
      video: vidResult.success ? vidResult : null,
      voice: voiceResult.success ? voiceResult : null,
    });

    console.log(`╚══ SHOT ${shot.number} COMPLETE ═══════════════════╝`);

    // Rate limit between shots
    await sleep(10000);
  }

  // ── SUMMARY ──
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PRODUCTION SUMMARY');
  console.log('═══════════════════════════════════════════════════════');

  let totalCost = 0;
  for (const r of results) {
    const kf = r.keyframe ? '✅' : '❌';
    const vid = r.video ? '✅' : '❌';
    const vox = r.voice ? '✅' : '❌';
    const cost = (r.keyframe?.cost_usd || 0) + (r.video?.cost_usd || 0);
    totalCost += cost;
    console.log(`  Shot ${r.shot} "${r.name}": KF:${kf} VID:${vid} VOX:${vox} ($${cost.toFixed(2)})`);
  }

  console.log(`\n  Total cost: $${totalCost.toFixed(2)}`);
  console.log(`  Keyframes: ${results.filter(r => r.keyframe).length}/8`);
  console.log(`  Videos: ${results.filter(r => r.video).length}/8`);
  console.log(`  Narration: ${results.filter(r => r.voice).length}/8`);

  // ── STORE ALL URLS for manual editing ──
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ASSET URLS (for manual editing in CapCut/DaVinci)');
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(`\n  Shot ${r.shot}: ${r.name}`);
    if (r.keyframe) console.log(`    Keyframe: ${r.keyframe.public_url}`);
    if (r.video) console.log(`    Video:    ${r.video.public_url}`);
    if (r.voice) console.log(`    Voice:    ${r.voice.public_url}`);
  }

  // Store production event in DB
  await supabase.from('swarm_events').insert({
    event_type: 'production',
    source_agent: 'director',
    table_name: 'passages',
    action: 'DIRECTED',
    record_id: EPISODE.passage_id,
    universe: EPISODE.universe,
    payload: {
      episode_title: EPISODE.title,
      shots: results.map(r => ({
        number: r.shot,
        name: r.name,
        keyframe_url: r.keyframe?.public_url,
        video_url: r.video?.public_url,
        voice_url: r.voice?.public_url,
      })),
      total_cost: totalCost,
    },
  });

  console.log('\n  ✅ Production data stored in swarm_events.');
  console.log('  Download the video + voice files and assemble in CapCut/DaVinci.');
  console.log('  Or wait for the stitch-video function to auto-assemble.\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
