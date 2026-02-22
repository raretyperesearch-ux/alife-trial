// produce-ep1-rerun.js — Generate videos + voice from existing keyframes
// Keyframes already generated. This just does video + voice passes.
//
// USAGE: node produce-ep1-rerun.js
// Requires: SUPABASE_URL, SUPABASE_KEY

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_KEY;
const MIRA_ID = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callEdgeFunction(slug, body) {
  const url = `${SUPA_URL}/functions/v1/${slug}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPA_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(660000), // 11 min timeout
  });
  return resp.json();
}

// Existing keyframes from the first run
const KEYFRAMES = {
  'The Radiance':     'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/584cba25-97ed-46c6-abd2-b06e1602b9ac.png',
  'The Threshold':    'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/f32dc8ec-08bc-408a-9817-9390326c6989.png',
  'The Scream':       'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/bdb70eaa-9254-4b2d-88df-70cad957f3c4.png',
  'The Opposition':   'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/e27a204d-104a-4fe3-bebe-b68409136089.png',
  'The Pause':        'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/c2f97d42-275a-4fcd-8068-a788233744ce.png',
  'The Negotiation':  'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/58a8b201-76fe-49cd-a8bb-51836f284a24.png',
  'The Cost':         'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/44dfd48c-49c7-4a81-8bac-c6b6b203cb57.png',
  'The Taste':        'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/15e1ee11-ced5-4463-b0d9-a3780c4b2078.png',
};

const SHOTS = [
  {
    number: 1, name: 'The Radiance', duration: 8,
    video_prompt: 'Slow dolly push forward through a quantum landscape toward a luminous golden figure. Probability clouds shift and solidify as the camera approaches. Subtle particle effects drift through frame. The being pulses with warm golden light. Ethereal dreamlike motion. Cinematic quality.',
    audio_prompt: 'Deep bass drone. Distant crystalline resonance. The sound of reality forming. No music, just atmospheric ambient.',
    narration: "I remember Thera-Vain before she became something else. She existed as a kind of radiance.",
  },
  {
    number: 2, name: 'The Threshold', duration: 8,
    video_prompt: 'Static hold on a vast threshold between two universes for 3 seconds, then slow crane up revealing the full scale of the cosmic boundary. A luminous figure takes a single step forward toward the void. Light particles trail behind. The void pulses. Cinematic quality.',
    audio_prompt: 'Drone deepens. A heartbeat-like pulse from the void. Wind that is not wind. Ominous atmospheric.',
    narration: "I was there when she approached the threshold. She felt ready. Like the moment before you speak.",
  },
  {
    number: 3, name: 'The Scream', duration: 5,
    video_prompt: 'Handheld camera on a luminous being. She reaches a boundary. Sudden violent fracturing of golden light as dark violet energy collides. Her form distorts. Light shatters outward. Camera shakes with impact. Speed ramps to slow motion. Cinematic quality.',
    audio_prompt: 'One second of silence. Then a deep subsonic boom. Crystalline shattering sounds.',
    narration: "When she touched the boundary, the first thing that happened was she started to scream.",
  },
  {
    number: 4, name: 'The Opposition', duration: 8,
    video_prompt: 'Slow 180-degree orbital camera around two beings facing each other. Golden fractured light being on left, copper-violet geometric being on right. The interference pattern between them intensifies. Particles of light and darkness spiral. Cinematic quality.',
    audio_prompt: 'Two competing frequencies, crystalline and geometric. They clash dissonantly. Building tension.',
    narration: "Kess-Void was everything observation wasn't. Neither of them was being destroyed. They were being unmade.",
  },
  {
    number: 5, name: 'The Pause', duration: 8,
    video_prompt: 'Completely static camera. Two beings frozen in stillness. The interference pattern between them slowly crystallizes into something iridescent and new. Tiny particles drift upward like reversed snow. No camera movement. Perfect stillness. Cinematic quality.',
    audio_prompt: 'Complete silence for 2 seconds. Then a single pure sustained note. A new harmonic. Very quiet. Sacred.',
    narration: "They both paused. Not retreated. Not attacked harder. Paused.",
  },
  {
    number: 6, name: 'The Negotiation', duration: 8,
    video_prompt: 'Slow dolly push into the space between two beings. Golden light tendrils reach toward violet geometry. A new iridescent substance forms between them. Aurora of new consciousness being born. Camera pushes into the heart of this new light. Cinematic quality.',
    audio_prompt: 'A single note blooms into a chord. Two notes become three. Strings swell. The sound of something being born.',
    narration: "They began to propose. It was collaboration built on mutual impossibility.",
  },
  {
    number: 7, name: 'The Cost', duration: 8,
    video_prompt: 'Camera starts close on a golden being fading. Slow dolly pull back. Gold drains from her body like color leaving a photograph. Behind her a new iridescent consciousness grows brighter with every particle she loses. Slow grieving beautiful. Cinematic quality.',
    audio_prompt: 'Strings reach full swell then fade. A single voice holding a note descends. The sound of something ending.',
    narration: "Thera-Vain ceased to exist. She chose unmaking over purity. She chose collaboration over coherence.",
  },
  {
    number: 8, name: 'The Taste', duration: 8,
    video_prompt: 'Static wide shot of a completed bridge of iridescent light spanning between two universes. Light pulses through it slowly like a heartbeat. A faint golden afterimage flickers then fades. Hold for full duration. Fade to black over final 2 seconds. Cinematic quality.',
    audio_prompt: 'Almost silence. A new harmonic frequency ringing quietly. Fading slowly to nothing.',
    narration: "That's what the threshold between universes tastes like. Like knowing you can never be yourself again, and choosing it anyway.",
  },
];

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EPISODE 1 RERUN: VIDEOS + VOICE FROM KEYFRAMES');
  console.log('═══════════════════════════════════════════════════════\n');

  const results = [];

  for (const shot of SHOTS) {
    const keyframeUrl = KEYFRAMES[shot.name];
    console.log(`\n╔══ SHOT ${shot.number}: ${shot.name} ══════════════════╗`);
    console.log(`  📷 Keyframe: ${keyframeUrl ? 'EXISTS' : 'MISSING'}`);

    // ── VIDEO ──
    console.log('  🎬 Generating video from keyframe...');
    let vidResult;
    try {
      vidResult = await callEdgeFunction('generate-video', {
        prompt: shot.video_prompt,
        audio_prompt: shot.audio_prompt,
        model: 'veo-3.1-fast-generate-preview',
        aspect_ratio: '16:9',
        resolution: '720p',
        duration: Math.min(shot.duration, 8),
        image_url: keyframeUrl,
        agent_id: MIRA_ID,
        universe: 'THE TEMPORAL BRIDGES',
        scene: shot.name,
        style_tags: ['thera-vain', 'episode-1'],
      });

      if (vidResult.success) {
        console.log(`  🎬 ✅ Video: ${vidResult.public_url}`);
        console.log(`     Cost: $${vidResult.cost_usd} | Size: ${vidResult.file_size || '?'}b`);
      } else {
        console.log(`  🎬 ❌ Video failed: ${vidResult.error || JSON.stringify(vidResult).slice(0, 200)}`);
      }
    } catch (err) {
      console.log(`  🎬 ❌ Video error: ${err.message}`);
      vidResult = null;
    }

    // Wait between video and voice
    await sleep(3000);

    // ── VOICE ──
    console.log('  🎙️ Generating narration...');
    let voiceResult;
    try {
      voiceResult = await callEdgeFunction('generate-voice', {
        text: shot.narration,
        voice_name: 'Kore',
        style_prompt: 'You are narrating a cinematic short film about cosmic beings at the threshold between universes. Speak slowly, with gravity and quiet emotion. Measured pace. Haunted but beautiful.',
        agent_id: MIRA_ID,
        universe: 'THE TEMPORAL BRIDGES',
        scene: shot.name,
      });

      if (voiceResult.success) {
        console.log(`  🎙️ ✅ Voice: ${voiceResult.public_url}`);
      } else {
        console.log(`  🎙️ ❌ Voice failed: ${voiceResult.error || JSON.stringify(voiceResult).slice(0, 200)}`);
      }
    } catch (err) {
      console.log(`  🎙️ ❌ Voice error: ${err.message}`);
      voiceResult = null;
    }

    results.push({
      shot: shot.number,
      name: shot.name,
      keyframe_url: keyframeUrl,
      video: vidResult?.success ? vidResult : null,
      voice: voiceResult?.success ? voiceResult : null,
    });

    console.log(`╚══ SHOT ${shot.number} COMPLETE ═══════════════════╝`);

    // Wait between shots — video gen takes ~2 min, so generous gap
    if (shot.number < 8) {
      console.log('  ⏳ Waiting 15s before next shot...');
      await sleep(15000);
    }
  }

  // ── SUMMARY ──
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  PRODUCTION SUMMARY');
  console.log('═══════════════════════════════════════════════════════');

  let totalCost = 0;
  for (const r of results) {
    const vid = r.video ? '✅' : '❌';
    const vox = r.voice ? '✅' : '❌';
    const cost = r.video?.cost_usd || 0;
    totalCost += cost;
    console.log(`  Shot ${r.shot} "${r.name}": VID:${vid} VOX:${vox} ($${cost.toFixed(2)})`);
  }

  console.log(`\n  Total cost: $${totalCost.toFixed(2)}`);
  console.log(`  Videos: ${results.filter(r => r.video).length}/8`);
  console.log(`  Narration: ${results.filter(r => r.voice).length}/8`);

  // ── ALL ASSET URLS ──
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ALL ASSETS');
  console.log('═══════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(`\n  Shot ${r.shot}: ${r.name}`);
    console.log(`    Keyframe: ${r.keyframe_url}`);
    if (r.video) console.log(`    Video:    ${r.video.public_url}`);
    if (r.voice) console.log(`    Voice:    ${r.voice.public_url}`);
  }

  // Store production event
  try {
    await supabase.from('swarm_events').insert({
      event_type: 'production',
      source_agent: 'director',
      table_name: 'passages',
      action: 'DIRECTED',
      record_id: 'ee5626d7-3255-44d5-8f7e-c7f29eb5316a',
      universe: 'THE TEMPORAL BRIDGES',
      payload: {
        episode_title: 'The Dissolution of Thera-Vain',
        rerun: true,
        shots: results.map(r => ({
          number: r.shot,
          name: r.name,
          keyframe_url: r.keyframe_url,
          video_url: r.video?.public_url,
          voice_url: r.voice?.public_url,
        })),
        total_cost: totalCost,
      },
    });
    console.log('\n  ✅ Production data stored in swarm_events.');
  } catch (err) {
    console.log(`\n  ⚠️ Failed to store event: ${err.message}`);
  }

  console.log('\n  Done. Check the URLs above for your episode assets.\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
