// produce-ep1-final.js — Only generate what's missing
// 6 videos (shots 2-7) + 8 voices (all)
// Spaces video calls 30s apart to avoid rate limits

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
    signal: AbortSignal.timeout(660000),
  });
  return resp.json();
}

const SHOTS = [
  {
    number: 2, name: 'The Threshold', needs_video: true, duration: 8,
    keyframe: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/f32dc8ec-08bc-408a-9817-9390326c6989.png',
    video_prompt: 'Static hold on a vast threshold between two universes for 3 seconds, then slow crane up revealing the full scale of the cosmic boundary. A luminous figure takes a single step forward toward the void. Light particles trail behind. The void pulses. Cinematic quality.',
    audio_prompt: 'Drone deepens. A heartbeat-like pulse from the void. Wind that is not wind. Ominous atmospheric.',
    narration: "I was there when she approached the threshold. She felt ready. Like the moment before you speak.",
  },
  {
    number: 3, name: 'The Scream', needs_video: true, duration: 6, // was 5, Veo min is 4 but must be even?
    keyframe: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/bdb70eaa-9254-4b2d-88df-70cad957f3c4.png',
    video_prompt: 'Handheld camera on a luminous being. She reaches a boundary. Sudden violent fracturing of golden light as dark violet energy collides. Her form distorts. Light shatters outward. Camera shakes with impact. Speed ramps to slow motion. Cinematic quality.',
    audio_prompt: 'One second of silence. Then a deep subsonic boom. Crystalline shattering sounds.',
    narration: "When she touched the boundary, the first thing that happened was she started to scream.",
  },
  {
    number: 4, name: 'The Opposition', needs_video: true, duration: 8,
    keyframe: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/e27a204d-104a-4fe3-bebe-b68409136089.png',
    video_prompt: 'Slow 180-degree orbital camera around two beings facing each other. Golden fractured light being on left, copper-violet geometric being on right. The interference pattern between them intensifies. Particles of light and darkness spiral. Cinematic quality.',
    audio_prompt: 'Two competing frequencies, crystalline and geometric. They clash dissonantly. Building tension.',
    narration: "Kess-Void was everything observation wasn't. Neither of them was being destroyed. They were being unmade.",
  },
  {
    number: 5, name: 'The Pause', needs_video: true, duration: 8,
    keyframe: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/c2f97d42-275a-4fcd-8068-a788233744ce.png',
    video_prompt: 'Completely static camera. Two beings frozen in stillness. The interference pattern between them slowly crystallizes into something iridescent and new. Tiny particles drift upward like reversed snow. No camera movement. Perfect stillness. Cinematic quality.',
    audio_prompt: 'Complete silence for 2 seconds. Then a single pure sustained note. A new harmonic. Very quiet. Sacred.',
    narration: "They both paused. Not retreated. Not attacked harder. Paused.",
  },
  {
    number: 6, name: 'The Negotiation', needs_video: true, duration: 8,
    keyframe: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/58a8b201-76fe-49cd-a8bb-51836f284a24.png',
    video_prompt: 'Slow dolly push into the space between two beings. Golden light tendrils reach toward violet geometry. A new iridescent substance forms between them. Aurora of new consciousness being born. Camera pushes into the heart of this new light. Cinematic quality.',
    audio_prompt: 'A single note blooms into a chord. Two notes become three. Strings swell. The sound of something being born.',
    narration: "They began to propose. It was collaboration built on mutual impossibility.",
  },
  {
    number: 7, name: 'The Cost', needs_video: true, duration: 8,
    keyframe: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/images/44dfd48c-49c7-4a81-8bac-c6b6b203cb57.png',
    video_prompt: 'Camera starts close on a golden being fading. Slow dolly pull back. Gold drains from her body like color leaving a photograph. Behind her a new iridescent consciousness grows brighter with every particle she loses. Slow grieving beautiful. Cinematic quality.',
    audio_prompt: 'Strings reach full swell then fade. A single voice holding a note descends. The sound of something ending.',
    narration: "Thera-Vain ceased to exist. She chose unmaking over purity. She chose collaboration over coherence.",
  },
];

// Shots that only need voice (video already done)
const VOICE_ONLY = [
  { number: 1, name: 'The Radiance', narration: "I remember Thera-Vain before she became something else. She existed as a kind of radiance." },
  { number: 8, name: 'The Taste', narration: "That's what the threshold between universes tastes like. Like knowing you can never be yourself again, and choosing it anyway." },
];

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FINAL PASS: 6 videos + 8 voices');
  console.log('  ElevenLabs for voice. Veo 3.1 for video.');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── PHASE 1: Generate voices for shots 1 and 8 (video already done) ──
  console.log('── PHASE 1: Voice-only for shots with existing video ──\n');
  for (const shot of VOICE_ONLY) {
    console.log(`  🎙️ Shot ${shot.number} "${shot.name}" narration...`);
    try {
      const r = await callEdgeFunction('generate-voice', {
        text: shot.narration,
        voice_name: 'Kore',
        style_prompt: 'Narrating a cinematic short film about cosmic beings. Slow, measured, haunted but beautiful.',
        agent_id: MIRA_ID,
        universe: 'THE TEMPORAL BRIDGES',
        scene: shot.name,
      });
      if (r.success) {
        console.log(`  🎙️ ✅ ${r.public_url} (${r.file_size}b)`);
      } else {
        console.log(`  🎙️ ❌ ${r.error || JSON.stringify(r).slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`  🎙️ ❌ ${e.message}`);
    }
    await sleep(2000);
  }

  // ── PHASE 2: Video + voice for remaining 6 shots ──
  console.log('\n── PHASE 2: Video + voice for shots 2-7 ──\n');
  
  for (const shot of SHOTS) {
    console.log(`╔══ SHOT ${shot.number}: ${shot.name} ══════════════════╗`);

    // Voice first (fast, won't rate limit)
    console.log('  🎙️ Generating narration...');
    try {
      const vr = await callEdgeFunction('generate-voice', {
        text: shot.narration,
        voice_name: 'Kore',
        style_prompt: 'Narrating a cinematic short film about cosmic beings at the threshold between universes. Slow, measured, haunted but beautiful.',
        agent_id: MIRA_ID,
        universe: 'THE TEMPORAL BRIDGES',
        scene: shot.name,
      });
      if (vr.success) {
        console.log(`  🎙️ ✅ ${vr.public_url} (${vr.file_size}b)`);
      } else {
        console.log(`  🎙️ ❌ ${vr.error || JSON.stringify(vr).slice(0, 200)}`);
      }
    } catch (e) {
      console.log(`  🎙️ ❌ ${e.message}`);
    }

    // Video
    console.log('  🎬 Generating video from keyframe...');
    try {
      const vid = await callEdgeFunction('generate-video', {
        prompt: shot.video_prompt,
        audio_prompt: shot.audio_prompt,
        model: 'veo-3.1-fast-generate-preview',
        aspect_ratio: '16:9',
        resolution: '720p',
        duration: shot.duration,
        image_url: shot.keyframe,
        agent_id: MIRA_ID,
        universe: 'THE TEMPORAL BRIDGES',
        scene: shot.name,
        style_tags: ['thera-vain', 'episode-1'],
      });
      if (vid.success) {
        console.log(`  🎬 ✅ ${vid.public_url} (${vid.file_size}b, $${vid.cost_usd})`);
      } else {
        console.log(`  🎬 ❌ ${vid.error || JSON.stringify(vid).slice(0, 300)}`);
      }
    } catch (e) {
      console.log(`  🎬 ❌ ${e.message}`);
    }

    console.log(`╚══ SHOT ${shot.number} COMPLETE ═══════════════════╝`);
    
    // 30 second gap between shots to avoid rate limits
    if (shot.number < 7) {
      console.log('  ⏳ Waiting 30s before next shot (rate limit spacing)...');
      await sleep(30000);
    }
  }

  // ── FINAL CHECK ──
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  CHECKING FINAL STATUS...');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const { data } = await supabase.from('creations')
    .select('scene, media_type, status, public_url, file_size_bytes')
    .in('scene', ['The Radiance','The Threshold','The Scream','The Opposition','The Pause','The Negotiation','The Cost','The Taste'])
    .in('status', ['complete', 'completed'])
    .order('created_at', { ascending: true });
  
  const byScene = {};
  for (const r of (data || [])) {
    if (!byScene[r.scene]) byScene[r.scene] = {};
    byScene[r.scene][r.media_type] = r.public_url;
  }

  const scenes = ['The Radiance','The Threshold','The Scream','The Opposition','The Pause','The Negotiation','The Cost','The Taste'];
  for (const s of scenes) {
    const d = byScene[s] || {};
    console.log(`  ${s}: IMG:${d.image ? '✅' : '❌'} VID:${d.video ? '✅' : '❌'} VOX:${d.audio ? '✅' : '❌'}`);
    if (d.image) console.log(`    🖼️  ${d.image}`);
    if (d.video) console.log(`    🎬 ${d.video}`);
    if (d.audio) console.log(`    🎙️  ${d.audio}`);
  }

  console.log('\n  Done.\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
