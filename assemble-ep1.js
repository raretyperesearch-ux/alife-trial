// assemble-ep1.js — Final cut assembly with ffmpeg
// Downloads all video + audio assets, overlays narration, concatenates with transitions
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const SUPA_URL = process.env.SUPABASE_URL;

// Shot order with all asset URLs
const SHOTS = [
  {
    number: 1, name: 'The Radiance',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/d722b717-e5e3-4d74-877e-c02ddc9dcb8c.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/4d4773cb-52ab-4b39-98e4-61a64411ad1e.mp3',
  },
  {
    number: 2, name: 'The Threshold',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/886c023d-55d5-491c-a6c2-dea062ea5960.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/c030ecef-f2ce-4b39-a180-92723a4dee72.mp3',
  },
  {
    number: 3, name: 'The Scream',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/01859893-f8bc-41e6-b62f-4ba35de8eeb5.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/9694f5d2-d728-451d-bc01-ab05de418cf6.mp3',
  },
  {
    number: 4, name: 'The Opposition',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/6a600d90-a831-4762-9f1f-7c6b13d029f0.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/8dc574af-f770-475c-96d4-04422b6caa25.wav',
  },
  {
    number: 5, name: 'The Pause',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/c7c621b2-7ecf-45c5-a5d0-50781ba75df7.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/a502f009-bb1c-4573-ad15-70ff28103ec6.mp3',
  },
  {
    number: 6, name: 'The Negotiation',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/432cd47d-7fdc-4e09-91be-8f6cffba7082.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/cbec3524-9f29-48ae-98c0-52ff98c2275c.mp3',
  },
  {
    number: 7, name: 'The Cost',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/0d6af774-0872-4342-aab2-863ce201b5d2.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/7d9f7a7d-1085-40ab-b3f0-f89259b4b246.mp3',
  },
  {
    number: 8, name: 'The Taste',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/66b00030-524c-44af-879b-90183dc44e25.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/955096ab-fa8c-4e6e-9fd8-142596da90c1.wav',
  },
];

async function downloadFile(url, dest) {
  console.log(`  ⬇️  ${dest}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${url} → ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EPISODE 1: THE DISSOLUTION OF THERA-VAIN');
  console.log('  Assembly Pipeline');
  console.log('═══════════════════════════════════════════════════════\n');

  // Setup workspace
  const workDir = '/tmp/ep1';
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  // Check ffmpeg
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    console.log('✅ ffmpeg available\n');
  } catch {
    console.log('❌ ffmpeg not found. Installing...');
    try {
      execSync('apt-get update && apt-get install -y ffmpeg', { stdio: 'inherit' });
    } catch {
      console.error('Failed to install ffmpeg. Make sure the Dockerfile includes it.');
      process.exit(1);
    }
  }

  // ── PHASE 1: Download all assets ──
  console.log('── PHASE 1: Downloading assets ──\n');
  for (const shot of SHOTS) {
    const vidExt = shot.video.endsWith('.mp4') ? 'mp4' : 'mp4';
    const audExt = shot.audio.endsWith('.wav') ? 'wav' : 'mp3';
    shot.vidFile = `${workDir}/shot${shot.number}_video.${vidExt}`;
    shot.audFile = `${workDir}/shot${shot.number}_audio.${audExt}`;
    shot.compositeFile = `${workDir}/shot${shot.number}_composite.mp4`;

    await downloadFile(shot.video, shot.vidFile);
    await downloadFile(shot.audio, shot.audFile);
  }
  console.log('\n✅ All 16 files downloaded\n');

  // ── PHASE 2: Composite each shot (video + narration overlay) ──
  console.log('── PHASE 2: Compositing shots (video + narration) ──\n');
  
  for (const shot of SHOTS) {
    console.log(`  🎬 Shot ${shot.number}: ${shot.name}`);
    
    // Get video duration
    let vidDuration;
    try {
      const probe = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${shot.vidFile}"`,
        { encoding: 'utf8' }
      ).trim();
      vidDuration = parseFloat(probe);
      console.log(`     Video duration: ${vidDuration.toFixed(1)}s`);
    } catch {
      vidDuration = 8;
      console.log(`     Could not probe duration, assuming ${vidDuration}s`);
    }

    // Composite: overlay narration on video with slight delay
    // Narration starts 0.5s in, video audio (if any) plays underneath at lower volume
    try {
      execSync(`ffmpeg -y \
        -i "${shot.vidFile}" \
        -i "${shot.audFile}" \
        -filter_complex " \
          [0:a]volume=0.15[bg]; \
          [1:a]adelay=500|500,volume=1.0[narr]; \
          [bg][narr]amix=inputs=2:duration=longest:dropout_transition=2[aout] \
        " \
        -map 0:v -map "[aout]" \
        -c:v copy \
        -c:a aac -b:a 192k \
        -t ${vidDuration} \
        "${shot.compositeFile}"`,
        { stdio: 'pipe' }
      );
      console.log(`     ✅ Composite done`);
    } catch (e) {
      // If video has no audio track, simpler merge
      console.log(`     ⚠️ Retrying without video audio...`);
      try {
        execSync(`ffmpeg -y \
          -i "${shot.vidFile}" \
          -i "${shot.audFile}" \
          -filter_complex "[1:a]adelay=500|500,volume=1.0[narr]" \
          -map 0:v -map "[narr]" \
          -c:v copy \
          -c:a aac -b:a 192k \
          -t ${vidDuration} \
          -shortest \
          "${shot.compositeFile}"`,
          { stdio: 'pipe' }
        );
        console.log(`     ✅ Composite done (no video audio)`);
      } catch (e2) {
        console.error(`     ❌ Composite failed: ${e2.message?.slice(0, 200)}`);
        // Fallback: just use video without narration
        execSync(`cp "${shot.vidFile}" "${shot.compositeFile}"`);
        console.log(`     ⚠️ Using raw video as fallback`);
      }
    }
  }

  // ── PHASE 3: Create title card ──
  console.log('\n── PHASE 3: Creating title card ──\n');
  const titleFile = `${workDir}/title.mp4`;
  try {
    execSync(`ffmpeg -y \
      -f lavfi -i color=c=black:s=1280x720:r=24:d=4 \
      -f lavfi -i anullsrc=r=44100:cl=stereo:d=4 \
      -vf "drawtext=text='THE DISSOLUTION OF THERA-VAIN':fontsize=36:fontcolor=white@0.9:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0.5,3.5)':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf, \
           drawtext=text='Episode 1 · The Flowering':fontsize=20:fontcolor=white@0.6:x=(w-text_w)/2:y=(h+text_h)/2+20:enable='between(t,1,3.5)':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf, \
           fade=t=in:st=0:d=1,fade=t=out:st=3:d=1" \
      -c:v libx264 -preset fast -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -t 4 "${titleFile}"`,
      { stdio: 'pipe' }
    );
    console.log('  ✅ Title card created\n');
  } catch (e) {
    console.log(`  ⚠️ Title card failed, skipping: ${e.message?.slice(0, 100)}\n`);
  }

  // ── PHASE 4: Normalize all clips to same format ──
  console.log('── PHASE 4: Normalizing clips ──\n');
  const normalizedFiles = [];

  // Add title if it exists
  if (existsSync(titleFile)) {
    normalizedFiles.push(titleFile);
  }

  for (const shot of SHOTS) {
    const normFile = `${workDir}/shot${shot.number}_norm.mp4`;
    try {
      execSync(`ffmpeg -y \
        -i "${shot.compositeFile}" \
        -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,fade=t=in:st=0:d=0.5,fade=t=out:st=eof-0.5:d=0.5" \
        -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p \
        -c:a aac -ar 44100 -ac 2 -b:a 192k \
        "${normFile}"`,
        { stdio: 'pipe' }
      );
      normalizedFiles.push(normFile);
      console.log(`  ✅ Shot ${shot.number} normalized`);
    } catch (e) {
      console.error(`  ❌ Shot ${shot.number} normalize failed: ${e.message?.slice(0, 200)}`);
    }
  }

  // ── PHASE 5: Concatenate ──
  console.log('\n── PHASE 5: Final concatenation ──\n');
  const concatList = normalizedFiles.map(f => `file '${f}'`).join('\n');
  const concatFile = `${workDir}/concat.txt`;
  writeFileSync(concatFile, concatList);

  const outputFile = `${workDir}/ep1_thera_vain_final.mp4`;
  try {
    execSync(`ffmpeg -y \
      -f concat -safe 0 -i "${concatFile}" \
      -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p \
      -c:a aac -b:a 192k \
      -movflags +faststart \
      "${outputFile}"`,
      { stdio: 'pipe' }
    );
    
    const stats = execSync(`ls -la "${outputFile}"`, { encoding: 'utf8' });
    console.log(`  ✅ Final video: ${stats.trim()}`);
    
    const duration = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputFile}"`,
      { encoding: 'utf8' }
    ).trim();
    console.log(`  📏 Duration: ${parseFloat(duration).toFixed(1)} seconds`);
  } catch (e) {
    console.error(`  ❌ Concat failed: ${e.message?.slice(0, 300)}`);
    process.exit(1);
  }

  // ── PHASE 6: Upload to Supabase ──
  console.log('\n── PHASE 6: Uploading final cut ──\n');
  const finalBuffer = readFileSync(outputFile);
  const storagePath = `episodes/ep1_thera_vain_final.mp4`;

  const { error: uploadErr } = await supabase.storage
    .from('creations')
    .upload(storagePath, finalBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    });

  if (uploadErr) {
    console.error(`  ❌ Upload failed: ${JSON.stringify(uploadErr)}`);
  } else {
    const publicUrl = `${SUPA_URL}/storage/v1/object/public/creations/${storagePath}`;
    console.log(`  ✅ UPLOADED: ${publicUrl}`);
    console.log(`  📦 Size: ${(finalBuffer.length / 1024 / 1024).toFixed(1)} MB`);

    // Save to DB
    await supabase.from('creations').insert({
      agent_id: 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf',
      media_type: 'video',
      source: 'director',
      prompt: 'Episode 1: The Dissolution of Thera-Vain — Final assembled cut',
      model: 'ffmpeg-assembly',
      cost_usd: 0,
      duration_seconds: parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outputFile}"`, { encoding: 'utf8' }).trim()),
      resolution: '720p',
      has_audio: true,
      universe: 'THE TEMPORAL BRIDGES',
      scene: 'Episode 1 Final',
      status: 'completed',
      storage_path: storagePath,
      public_url: publicUrl,
      file_size_bytes: finalBuffer.length,
    });
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  EPISODE 1 ASSEMBLY COMPLETE');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
