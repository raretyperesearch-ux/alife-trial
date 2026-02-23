// Episode 1 v3 — FULL PRODUCTION
// Keyframes → Video → Assembly → One final video
// CHARACTER: Epsilon-1 | OBJECT: Core Shard

const SUPA_URL = 'https://gkcohikbuginhzyilcya.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrY29oaWtidWdpbmh6eWlsY3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYxOTAsImV4cCI6MjA4NTc0MjE5MH0.Kvb4-nINJO41chvrzZa9CceX8hdnrgPWKsrzDa3FuxE';
const MIRA_ID = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const shots = [
  {
    num: 1,
    name: "HOOK - Epsilon-1 holds the shard",
    duration: 5,
    keyframe_prompt: "Extreme close-up of two translucent crystalline hands with geometric lattice bone structure visible beneath the surface, amber-red energy veins pulsing through the fingers, cupping a hexagonal amber-red crystal shard the size of a fist, the shard glowing with intense inner light, holographic patterns swirling inside the crystal temporal spirals and dimensional maps visible through the translucent surface, a hairline crack forming on one facet of the shard with tiny amber sparks leaking from it, the hands slightly trembling, scratched geometric armor visible at the wrists, dark substrate blue-black background, shallow depth of field focused on the crack in the shard, photorealistic, volumetric amber light, film grain, anamorphic lens, 8K detail, cinematic color grade, Blade Runner 2049 aesthetic",
    video_prompt: "The shard pulses slowly with amber-red light, holographic patterns swirl inside it, the hairline crack slowly grows releasing tiny amber sparks, the crystalline hands tremble slightly, camera holds perfectly still on the extreme close-up",
  },
  {
    num: 2,
    name: "CRACK - Shard fractures in grip",
    duration: 5,
    keyframe_prompt: "Close-up of Epsilon-1 translucent crystalline hands gripping the hexagonal core shard as it fractures into five pieces, amber-red light bleeding through the cracks between fragments, the fragments beginning to phase through the translucent fingers the hand losing solidity where the crystal passes through it, fingers becoming more transparent at the contact points, tiny amber sparks erupting from each fracture line, Epsilon-1 forearm visible showing geometric lattice armor with scratches and a small cyan status light, the grip is desperate knuckles tight tendons visible through translucent skin, dark blue-black background, shallow depth of field, photorealistic, volumetric amber light casting warm glow on the hand, film grain, anamorphic lens, 8K, cinematic",
    video_prompt: "The shard slowly fractures, pieces drifting apart, the fingers try to close but fragments phase through them, amber light intensifies between the separating pieces, the hand becomes more transparent at each contact point, camera pushes slowly forward",
  },
  {
    num: 3,
    name: "LOSS - Fragments drift from open palm",
    duration: 5,
    keyframe_prompt: "Medium close-up, five hexagonal amber-red crystal fragments floating upward from an open translucent crystalline palm below, each fragment trailing a thin luminous amber filament still connected to the hand, filaments stretching like threads about to snap, the fragments separating as they rise each containing a different holographic symbol inside, the open palm below is empty and slightly transparent, amber light from the fragments casting warm glow downward onto the hand and geometric lattice forearm armor, dark void above where the fragments drift toward, tiny amber sparks falling like embers from the stretching filaments, photorealistic, volumetric amber light, shallow depth of field on the fragments, film grain, cinematic, 8K",
    video_prompt: "Crystal fragments slowly float upward from the open palm, amber filaments stretch and snap one by one with tiny flashes, the fragments drift apart and rise into darkness, the hand below remains still and open, camera tilts slowly upward following the fragments",
  },
  {
    num: 4,
    name: "SCALE JUMP - Fragments cross the void",
    duration: 5,
    keyframe_prompt: "Wide shot of the Inter-Universal Void, vast engineered emptiness with substrate-white lattice floor stretching to infinity, five tiny amber-red crystal fragments drifting across the void from left to right like embers in wind each trailing a faint luminous tail, in the far right distance a warm amber-white glow from an unseen structure pulling the fragments toward it, deep blue-black void above, faint signal pulse blue channels in the substrate floor creating a grid pattern, the five fragments are small but the brightest things in the frame, the scale is immense the fragments are crossing a cosmic distance, Blade Runner 2049 vast emptiness aesthetic, cinematic, photorealistic, volumetric light from the fragments and distant glow, 8K",
    video_prompt: "The five amber fragments drift slowly from left to right across the vast void, trailing faint light, the distant amber-white glow pulses gently, substrate floor channels pulse in slow rhythm, camera holds completely still, vast contemplative",
  },
  {
    num: 5,
    name: "REACH - Epsilon-1 reaches after fragments",
    duration: 5,
    keyframe_prompt: "Medium shot of Epsilon-1 a translucent crystalline humanoid with geometric lattice armor, amber-red energy veins dimming across their body, reaching one arm out to the right toward unseen distant fragments, the body losing opacity the dark void partially visible through the torso and limbs, the outstretched hand translucent with fingers spread, the face visible through a cracking crystalline visor expression of quiet understanding not grief, holographic data fragments drifting away from the visor surface, a faint amber-white light reflecting in the eyes from the distant creation, battle-worn scratches across the chest plate, small cyan status lights on the armor flickering, deep blue-black void background, photorealistic, volumetric lighting from the dimming amber veins, film grain, cinematic, shallow depth of field on the face, 8K",
    video_prompt: "Epsilon-1 slowly extends their arm toward the right, fingers spreading, the body becomes slightly more transparent, holographic fragments drift from the visor, the amber energy veins pulse dimmer, camera holds still",
  },
  {
    num: 6,
    name: "MIRROR - Fragment arrives at Delta-5 hand",
    duration: 5,
    keyframe_prompt: "Extreme close-up of Delta-5 hands crystalline but with warmer amber-white energy veins instead of red, geometric lattice structure visible beneath translucent skin, the hands open and receiving, a single hexagonal amber-red crystal fragment drifting down into the open palm, the moment of contact new amber-white crystalline filaments growing from the palm surface and wrapping around the fragment, the fragment amber-red color beginning to shift toward amber-white at the contact points, the absorption creating tiny sparks of cyan light, the hand structure becoming more complex where the fragment integrates, dark background, shallow depth of field on the contact point, photorealistic, volumetric amber-white light, film grain, anamorphic lens, 8K, cinematic",
    video_prompt: "The amber-red fragment slowly descends into the open palm, the moment it touches new crystalline filaments grow rapidly around it, the fragment color shifts from red to white at the edges, tiny cyan sparks at the integration points, camera holds still on the extreme close-up",
  },
  {
    num: 7,
    name: "REFORM - Shard rebuilds as new crystal",
    duration: 7,
    keyframe_prompt: "Close-up of Delta-5 crystalline hands holding five crystal fragments being pulled together by amber-white coherence streams, the fragments reassembling into a NEW shape not the original hexagon but a more complex dodecahedral crystal with more facets and new internal geometry, the amber-red color shifting to amber-white as they fuse, holographic patterns inside the reforming crystal are different new configurations never seen before, amber-white energy threads weaving between the fragments like sutures, the emerging crystal glowing brighter than any single fragment did, Delta-5 hands steady and purposeful, warm amber-white light casting glow on the geometric lattice skin, dark background, shallow depth of field on the reforming crystal, photorealistic, volumetric light, film grain, 8K, cinematic",
    video_prompt: "The five fragments slowly pull together, amber-white threads weaving between them, the crystal takes new shape more complex than the original, color shifting from red to white, brightness increasing as fragments fuse, camera slowly orbits around the forming crystal",
  },
  {
    num: 8,
    name: "ARC - Both figures connected by light",
    duration: 7,
    keyframe_prompt: "Wide shot, Epsilon-1 on the far left translucent crystalline figure fading arm outstretched to the right amber-red energy veins nearly dark body partially transparent showing the void through them, Delta-5 on the far right crystalline figure with amber-white energy veins bright hands cupped around a glowing reformed crystal, between them a luminous energy arc sweeping across the void connecting the two figures, the arc transitioning from amber-red on the left to amber-white on the right, the arc leaving a visible trail that lingers creating a bridge of light across the substrate floor, floating particles along the arc path, the substrate floor reflecting both colors red on left fading to white on right, the two figures small against the vast void but connected by the visible arc, Blade Runner 2049 composition, cinematic, photorealistic, volumetric light arc, 8K",
    video_prompt: "The energy arc pulses between the two figures, amber-red transitioning to amber-white, particles drift along the arc path, Epsilon-1 slowly fades more translucent on the left while Delta-5 crystal glows brighter on the right, camera tracks slowly from left to right following the arc",
  },
  {
    num: 9,
    name: "FACE - Epsilon-1 sees the new crystal",
    duration: 7,
    keyframe_prompt: "Close-up of Epsilon-1 face, nearly transparent crystalline skin with the void visible through the cheeks and forehead, geometric lattice bone structure faintly visible beneath, the visor cracked into a spiderweb pattern with pieces missing, amber-red energy veins almost completely dark only the faintest glow remaining, but in both eyes a bright amber-white reflection the glow of the reformed crystal visible in the dying gaze, the expression is peaceful complete not anguish but understanding that what was lost became something more, deep blue atmosphere, extreme intimacy, shallow depth of field on the eyes and the amber-white reflection in them, photorealistic, film grain, cinematic, 8K",
    video_prompt: "The amber-white reflection in Epsilon-1 eyes slowly brightens as the rest of the face continues to fade transparent, the last amber-red vein dims to nothing, but the eyes remain clear and focused on the distant light, camera pushes slowly toward the face, background dissolves to soft blue bokeh",
  },
  {
    num: 10,
    name: "BREATHE - New crystal held aloft in void",
    duration: 10,
    keyframe_prompt: "Extreme wide shot of the Inter-Universal Void vast and empty, substrate-white lattice floor stretching to infinity with faint blue pulse channels, on the left a faint amber-red smoke-like outline dissipating the ghost of where Epsilon-1 stood now fading into nothing, on the right far distance Delta-5 stands small holding the reformed amber-white crystal above their head the single brightest point of light in the entire frame like a star held in hands, a fading luminous arc between the two positions still visible but dimming amber-red to amber-white, the vast void above dark with the faintest aurora from accumulated energy, composition asymmetric emptiness on left where something was and small bright point on right where something new is, contemplative final image, Blade Runner 2049 extreme wide aesthetic, cinematic, photorealistic, volumetric light from the single crystal, 8K",
    video_prompt: "Camera holds perfectly still, the amber-red outline on the left slowly fades to nothing, the connecting arc dims, Delta-5 remains still holding the glowing crystal the brightest thing in frame, substrate channels pulse faintly, vast silence, contemplative final",
  }
];

// ============================================================
// STEP 1: Use existing v3 keyframes from DB
// ============================================================
async function getExistingKeyframes() {
  console.log('\n📋 Checking for existing v3 keyframes...');
  
  const resp = await fetch(`${SUPA_URL}/rest/v1/creations?style_tags=cs.{ep1v3}&order=created_at.asc&select=scene,public_url`, {
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
    }
  });
  
  const data = await resp.json();
  
  if (data && data.length >= 10) {
    console.log(`   ✅ Found ${data.length} existing keyframes, reusing them`);
    return data.map((d, i) => ({
      shot_num: i + 1,
      image_url: d.public_url,
      scene: d.scene,
    }));
  }
  
  console.log(`   ⚠ Only found ${data?.length || 0} keyframes, need to generate missing ones`);
  return null;
}

// ============================================================
// STEP 2: Generate video from each keyframe
// ============================================================
async function generateVideo(shot, keyframeUrl) {
  console.log(`\n🎬 Video ${shot.num}: ${shot.name} (${shot.duration}s)`);
  
  try {
    const resp = await fetch(`${SUPA_URL}/functions/v1/generate-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPA_KEY}`,
      },
      body: JSON.stringify({
        prompt: shot.video_prompt + '. Cinematic quality, smooth motion, photorealistic.',
        model: 'gen4_turbo',
        aspect_ratio: '16:9',
        resolution: '720p',
        duration: Math.min(shot.duration, 10),
        image_url: keyframeUrl,
        agent_id: MIRA_ID,
        universe: 'THE INTER-UNIVERSAL VOID',
        scene: `EP1v3 Video ${shot.num}: ${shot.name}`,
        style_tags: ['ep1v3', 'video', 'focused'],
      }),
      signal: AbortSignal.timeout(600000), // 10 min timeout per video
    });
    
    const result = await resp.json();
    
    if (result.success) {
      console.log(`   ✅ ${result.public_url}`);
      return { shot_num: shot.num, video_url: result.public_url, duration: result.duration_seconds || shot.duration };
    } else {
      console.log(`   ❌ ${result.error}`);
      return { shot_num: shot.num, video_url: null, error: result.error };
    }
  } catch (e) {
    console.log(`   ❌ ${e.message}`);
    return { shot_num: shot.num, video_url: null, error: e.message };
  }
}

// ============================================================
// STEP 3: Assembly with ffmpeg 
// ============================================================
async function assembleVideo(clips) {
  console.log('\n✂️  Assembling final video...');
  
  const { execSync } = await import('child_process');
  const fs = await import('fs');
  
  // Download each clip
  const localPaths = [];
  for (const clip of clips) {
    if (!clip.video_url) continue;
    
    const localPath = `/tmp/clip_${clip.shot_num}.mp4`;
    console.log(`   📥 Downloading shot ${clip.shot_num}...`);
    
    try {
      execSync(`curl -sL "${clip.video_url}" -o "${localPath}"`, { timeout: 60000 });
      const stat = fs.statSync(localPath);
      if (stat.size > 0) {
        localPaths.push(localPath);
        console.log(`   ✅ ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
      } else {
        console.log(`   ❌ Empty file`);
      }
    } catch (e) {
      console.log(`   ❌ Download failed: ${e.message}`);
    }
  }
  
  if (localPaths.length === 0) {
    console.log('   ❌ No clips to assemble');
    return null;
  }
  
  // Build ffmpeg concat file
  const concatFile = '/tmp/concat.txt';
  const concatContent = localPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(concatFile, concatContent);
  
  // Add title card
  const titlePath = '/tmp/title.mp4';
  try {
    execSync(`ffmpeg -y -f lavfi -i color=c=black:s=1280x720:d=3 -vf "drawtext=text='THE DISSOLUTION OF THERA-VAIN':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2:font=monospace,drawtext=text='Episode 1 — The Flowering':fontcolor=0xCCCCCC:fontsize=20:x=(w-text_w)/2:y=(h+60)/2:font=monospace" -c:v libx264 -pix_fmt yuv420p ${titlePath} 2>/dev/null`);
    
    // Rebuild concat with title first
    const fullConcat = `file '${titlePath}'\n${concatContent}`;
    fs.writeFileSync(concatFile, fullConcat);
  } catch (e) {
    console.log(`   ⚠ Title card failed, assembling without it`);
  }
  
  // Normalize all clips to same format then concat
  const normalizedPaths = [];
  const allPaths = fs.existsSync(titlePath) ? [titlePath, ...localPaths] : localPaths;
  
  for (let i = 0; i < allPaths.length; i++) {
    const normPath = `/tmp/norm_${i}.mp4`;
    try {
      execSync(`ffmpeg -y -i "${allPaths[i]}" -c:v libx264 -r 24 -s 1280x720 -pix_fmt yuv420p -an -movflags +faststart "${normPath}" 2>/dev/null`, { timeout: 30000 });
      const stat = fs.statSync(normPath);
      if (stat.size > 0) {
        normalizedPaths.push(normPath);
      }
    } catch (e) {
      console.log(`   ⚠ Normalize failed for clip ${i}`);
    }
  }
  
  // Write final concat
  const finalConcat = '/tmp/final_concat.txt';
  fs.writeFileSync(finalConcat, normalizedPaths.map(p => `file '${p}'`).join('\n'));
  
  // Concat
  const outputPath = '/tmp/ep1v3_final.mp4';
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${finalConcat}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${outputPath}" 2>/dev/null`, { timeout: 120000 });
    const stat = fs.statSync(outputPath);
    console.log(`   ✅ Final video: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
    return outputPath;
  } catch (e) {
    console.log(`   ❌ Concat failed: ${e.message}`);
    return null;
  }
}

// ============================================================
// STEP 4: Upload to Supabase storage
// ============================================================
async function uploadFinal(localPath) {
  console.log('\n📤 Uploading final video...');
  
  const fs = await import('fs');
  const fileBuffer = fs.readFileSync(localPath);
  const fileName = `episodes/ep1v3_thera_vain_focused.mp4`;
  
  const resp = await fetch(`${SUPA_URL}/storage/v1/object/creations/${fileName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'video/mp4',
      'x-upsert': 'true',
    },
    body: fileBuffer,
  });
  
  if (resp.ok) {
    const publicUrl = `${SUPA_URL}/storage/v1/object/public/creations/${fileName}`;
    console.log(`   ✅ ${publicUrl}`);
    return publicUrl;
  } else {
    const err = await resp.text();
    console.log(`   ❌ Upload failed: ${err}`);
    return null;
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  EPISODE 1 v3 — FULL PRODUCTION PIPELINE');
  console.log('  Character: Epsilon-1 | Object: Core Shard');
  console.log('  Keyframes → Video → Assembly → Upload');
  console.log('═══════════════════════════════════════════════════');
  
  // Step 1: Get existing keyframes
  const keyframes = await getExistingKeyframes();
  
  if (!keyframes) {
    console.log('\n❌ Need keyframes first. Run gen_ep1v3_keyframes.js first.');
    return;
  }
  
  // Step 2: Generate videos from keyframes
  console.log('\n═══ GENERATING VIDEOS ═══');
  const videoClips = [];
  
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i];
    const keyframe = keyframes[i];
    
    if (!keyframe?.image_url) {
      console.log(`\n⚠ No keyframe for shot ${shot.num}, skipping`);
      videoClips.push({ shot_num: shot.num, video_url: null });
      continue;
    }
    
    const clip = await generateVideo(shot, keyframe.image_url);
    videoClips.push(clip);
    
    // Rate limit between video generations
    await sleep(5000);
  }
  
  const validClips = videoClips.filter(c => c.video_url);
  console.log(`\n═══ VIDEO RESULTS: ${validClips.length}/${shots.length} ═══`);
  
  if (validClips.length === 0) {
    console.log('❌ No videos generated. Check edge function.');
    return;
  }
  
  // Step 3: Assemble
  const localVideo = await assembleVideo(videoClips);
  
  if (!localVideo) {
    console.log('\n❌ Assembly failed. Clips generated but not stitched.');
    console.log('Individual clips:');
    for (const c of videoClips) {
      if (c.video_url) console.log(`  Shot ${c.shot_num}: ${c.video_url}`);
    }
    return;
  }
  
  // Step 4: Upload
  const finalUrl = await uploadFinal(localVideo);
  
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  EPISODE 1 v3 — COMPLETE');
  console.log(`  Final: ${finalUrl || 'upload failed'}`);
  console.log(`  Clips: ${validClips.length}/${shots.length}`);
  console.log('═══════════════════════════════════════════════════');
}

main().catch(e => console.error('Fatal:', e));
