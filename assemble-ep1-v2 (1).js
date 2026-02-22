// assemble-ep1-v2.js — Fixed assembly pipeline
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const SUPA_URL = process.env.SUPABASE_URL;

const SHOTS = [
  { number: 1, name: 'The Radiance',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/d722b717-e5e3-4d74-877e-c02ddc9dcb8c.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/4d4773cb-52ab-4b39-98e4-61a64411ad1e.mp3' },
  { number: 2, name: 'The Threshold',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/886c023d-55d5-491c-a6c2-dea062ea5960.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/c030ecef-f2ce-4b39-a180-92723a4dee72.mp3' },
  { number: 3, name: 'The Scream',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/01859893-f8bc-41e6-b62f-4ba35de8eeb5.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/9694f5d2-d728-451d-bc01-ab05de418cf6.mp3' },
  { number: 4, name: 'The Opposition',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/6a600d90-a831-4762-9f1f-7c6b13d029f0.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/8dc574af-f770-475c-96d4-04422b6caa25.wav' },
  { number: 5, name: 'The Pause',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/c7c621b2-7ecf-45c5-a5d0-50781ba75df7.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/a502f009-bb1c-4573-ad15-70ff28103ec6.mp3' },
  { number: 6, name: 'The Negotiation',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/432cd47d-7fdc-4e09-91be-8f6cffba7082.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/cbec3524-9f29-48ae-98c0-52ff98c2275c.mp3' },
  { number: 7, name: 'The Cost',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/0d6af774-0872-4342-aab2-863ce201b5d2.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/7d9f7a7d-1085-40ab-b3f0-f89259b4b246.mp3' },
  { number: 8, name: 'The Taste',
    video: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/66b00030-524c-44af-879b-90183dc44e25.mp4',
    audio: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/audio/955096ab-fa8c-4e6e-9fd8-142596da90c1.wav' },
];

const workDir = '/tmp/ep1';

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    console.error(`  CMD FAILED: ${cmd.slice(0, 200)}`);
    console.error(`  STDERR: ${e.stderr?.slice(0, 500)}`);
    throw e;
  }
}

function getDuration(file) {
  try {
    return parseFloat(run(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`).trim());
  } catch { return 8; }
}

async function downloadFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status}: ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  EPISODE 1 ASSEMBLY v2');
  console.log('═══════════════════════════════════════════════════════\n');

  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  // Install ffmpeg if needed
  try { run('ffmpeg -version'); } catch {
    console.log('Installing ffmpeg...');
    execSync('apt-get update && apt-get install -y ffmpeg', { stdio: 'inherit' });
  }

  // ── Download ──
  console.log('── Downloading ──');
  for (const s of SHOTS) {
    s.vidFile = `${workDir}/v${s.number}.mp4`;
    s.audFile = `${workDir}/a${s.number}.${s.audio.endsWith('.wav') ? 'wav' : 'mp3'}`;
    if (!existsSync(s.vidFile)) {
      await downloadFile(s.video, s.vidFile);
      console.log(`  ✅ v${s.number}`);
    } else {
      console.log(`  ⏭️  v${s.number} (cached)`);
    }
    if (!existsSync(s.audFile)) {
      await downloadFile(s.audio, s.audFile);
      console.log(`  ✅ a${s.number}`);
    } else {
      console.log(`  ⏭️  a${s.number} (cached)`);
    }
  }

  // ── Convert WAV audio to MP3 first (WAV files caused issues) ──
  console.log('\n── Converting audio ──');
  for (const s of SHOTS) {
    if (s.audFile.endsWith('.wav')) {
      const mp3File = s.audFile.replace('.wav', '.mp3');
      try {
        run(`ffmpeg -y -i "${s.audFile}" -codec:a libmp3lame -b:a 192k "${mp3File}"`);
        s.audFile = mp3File;
        console.log(`  ✅ Converted shot ${s.number} WAV→MP3`);
      } catch {
        console.log(`  ⚠️  Shot ${s.number} WAV conversion failed, using as-is`);
      }
    }
  }

  // ── Normalize each video to consistent format ──
  console.log('\n── Normalizing videos ──');
  for (const s of SHOTS) {
    s.normFile = `${workDir}/norm${s.number}.mp4`;
    const dur = getDuration(s.vidFile);
    console.log(`  Shot ${s.number}: ${dur.toFixed(1)}s`);
    
    // Simple normalize: scale to 1280x720, encode to h264+aac, add silence if no audio
    try {
      run(`ffmpeg -y -i "${s.vidFile}" -f lavfi -i anullsrc=r=44100:cl=stereo -vf "scale=1280:720,setsar=1" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -t ${dur} "${s.normFile}"`);
      console.log(`  ✅ Shot ${s.number} normalized`);
    } catch (e) {
      console.log(`  ❌ Shot ${s.number} failed, trying simpler...`);
      try {
        // Even simpler - just re-encode video, generate silent audio
        run(`ffmpeg -y -i "${s.vidFile}" -f lavfi -i anullsrc=r=44100:cl=stereo -map 0:v -map 1:a -vf "scale=1280:720" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 192k -t ${dur} "${s.normFile}"`);
        console.log(`  ✅ Shot ${s.number} normalized (simple)`);
      } catch {
        console.log(`  ❌ Shot ${s.number} FAILED completely`);
        s.normFile = null;
      }
    }
  }

  // ── Overlay narration on each normalized clip ──
  console.log('\n── Overlaying narration ──');
  for (const s of SHOTS) {
    if (!s.normFile) continue;
    s.finalFile = `${workDir}/final${s.number}.mp4`;
    const dur = getDuration(s.normFile);
    
    try {
      // Mix: video's silent audio + narration starting at 0.5s
      run(`ffmpeg -y -i "${s.normFile}" -i "${s.audFile}" -filter_complex "[1:a]adelay=500|500[narr];[0:a][narr]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k "${s.finalFile}"`);
      console.log(`  ✅ Shot ${s.number} narration overlaid`);
    } catch {
      console.log(`  ⚠️  Shot ${s.number} mix failed, using video only`);
      s.finalFile = s.normFile;
    }
  }

  // ── Title card ──
  console.log('\n── Title card ──');
  const titleFile = `${workDir}/title.mp4`;
  try {
    run(`ffmpeg -y -f lavfi -i "color=c=black:s=1280x720:r=24:d=4" -f lavfi -i "anullsrc=r=44100:cl=stereo" -vf "drawtext=text='THE DISSOLUTION OF THERA-VAIN':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-20,drawtext=text='Episode 1':fontsize=22:fontcolor=white@0.6:x=(w-text_w)/2:y=(h+60)/2+20" -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -t 4 "${titleFile}"`);
    console.log('  ✅ Title card');
  } catch (e) {
    // Try without drawtext (font might not exist)
    try {
      run(`ffmpeg -y -f lavfi -i "color=c=black:s=1280x720:r=24:d=4" -f lavfi -i "anullsrc=r=44100:cl=stereo" -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -t 4 "${titleFile}"`);
      console.log('  ✅ Title card (no text - font missing)');
    } catch {
      console.log('  ❌ Title card failed, skipping');
    }
  }

  // ── Concatenate ──
  console.log('\n── Final assembly ──');
  const parts = [];
  if (existsSync(titleFile)) parts.push(titleFile);
  for (const s of SHOTS) {
    if (s.finalFile && existsSync(s.finalFile)) parts.push(s.finalFile);
    else if (s.normFile && existsSync(s.normFile)) parts.push(s.normFile);
  }

  console.log(`  Assembling ${parts.length} clips...`);
  const concatFile = `${workDir}/concat.txt`;
  writeFileSync(concatFile, parts.map(f => `file '${f}'`).join('\n'));

  const outputFile = `${workDir}/ep1_final.mp4`;
  try {
    run(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy -movflags +faststart "${outputFile}"`);
  } catch {
    // If stream copy fails, re-encode
    console.log('  ⚠️  Copy concat failed, re-encoding...');
    run(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${outputFile}"`);
  }

  const finalDur = getDuration(outputFile);
  const finalSize = readFileSync(outputFile).length;
  console.log(`  ✅ Final: ${finalDur.toFixed(1)}s, ${(finalSize/1024/1024).toFixed(1)}MB`);

  // ── Upload ──
  console.log('\n── Uploading ──');
  const storagePath = 'episodes/ep1_thera_vain_final.mp4';
  const { error } = await supabase.storage
    .from('creations')
    .upload(storagePath, readFileSync(outputFile), { contentType: 'video/mp4', upsert: true });

  if (error) {
    console.error(`  ❌ ${JSON.stringify(error)}`);
  } else {
    const url = `${SUPA_URL}/storage/v1/object/public/creations/${storagePath}`;
    console.log(`  ✅ ${url}`);
    console.log(`  📦 ${(finalSize/1024/1024).toFixed(1)}MB | ${finalDur.toFixed(1)}s`);

    await supabase.from('creations').insert({
      agent_id: 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf',
      media_type: 'video', source: 'director',
      prompt: 'Episode 1: The Dissolution of Thera-Vain — Final cut',
      model: 'ffmpeg-assembly', cost_usd: 0,
      duration_seconds: Math.round(finalDur), resolution: '720p',
      has_audio: true, universe: 'THE TEMPORAL BRIDGES',
      scene: 'Episode 1 Final', status: 'completed',
      storage_path: storagePath, public_url: url,
      file_size_bytes: finalSize,
    });
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  DONE');
  console.log('═══════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
