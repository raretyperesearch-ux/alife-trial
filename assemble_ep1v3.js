// Episode 1 v3 — ASSEMBLY ONLY
// All 10 clips already generated, just need to stitch them
// Uses fetch instead of curl (not available on Railway)

import { writeFileSync, statSync, readFileSync } from 'fs';
import { execSync } from 'child_process';

const SUPA_URL = 'https://gkcohikbuginhzyilcya.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrY29oaWtidWdpbmh6eWlsY3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYxOTAsImV4cCI6MjA4NTc0MjE5MH0.Kvb4-nINJO41chvrzZa9CceX8hdnrgPWKsrzDa3FuxE';

const clips = [
  { num: 1, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/36ff9b02-d6e9-4d4b-9853-f5cac48aeedb.mp4' },
  { num: 2, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/dc16bdbe-91f9-4a12-b8c8-35ea6f5e5eff.mp4' },
  { num: 3, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/d7ce0907-a0d2-42ed-a5b2-fd6be5476a19.mp4' },
  { num: 4, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/f3fcfcce-16e6-4f6f-b0e9-a0582f67ccfc.mp4' },
  { num: 5, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/8eefead2-6e7d-49ae-a19d-ea77ff838398.mp4' },
  { num: 6, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/1c9a08eb-2674-4fa0-8bef-e36da4a588dd.mp4' },
  { num: 7, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/9c0a1b9c-5557-4b61-80de-7395d95dca03.mp4' },
  { num: 8, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/47ce9870-bf36-473e-9140-a09f35a7bc95.mp4' },
  { num: 9, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/cb4dca9f-9e8d-4855-9060-e1be249387ad.mp4' },
  { num: 10, url: 'https://gkcohikbuginhzyilcya.supabase.co/storage/v1/object/public/creations/videos/b53bcc83-481c-4aea-9275-998919429fdd.mp4' },
];

async function downloadClip(clip) {
  console.log(`   📥 Shot ${clip.num}...`);
  const resp = await fetch(clip.url);
  if (!resp.ok) {
    console.log(`   ❌ HTTP ${resp.status}`);
    return null;
  }
  const buffer = Buffer.from(await resp.arrayBuffer());
  const path = `/tmp/clip_${clip.num}.mp4`;
  writeFileSync(path, buffer);
  const size = statSync(path).size;
  console.log(`   ✅ ${(size / 1024 / 1024).toFixed(1)}MB`);
  return size > 0 ? path : null;
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  EP1 v3 — ASSEMBLY');
  console.log('═══════════════════════════════════════════');

  // Check ffmpeg
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    console.log('✅ ffmpeg found');
  } catch {
    console.log('❌ ffmpeg not found, installing...');
    try {
      execSync('apt-get update -qq && apt-get install -y -qq ffmpeg', { stdio: 'pipe', timeout: 120000 });
      console.log('✅ ffmpeg installed');
    } catch (e) {
      console.log('❌ Cannot install ffmpeg. Trying npx...');
      try {
        execSync('npm install -g @ffmpeg-installer/ffmpeg', { stdio: 'pipe', timeout: 60000 });
      } catch {
        console.log('❌ No ffmpeg available. Cannot assemble.');
        console.log('Individual clips are all available at their URLs.');
        return;
      }
    }
  }

  // Download all clips
  console.log('\n📥 Downloading clips...');
  const localPaths = [];
  for (const clip of clips) {
    const path = await downloadClip(clip);
    if (path) localPaths.push({ num: clip.num, path });
  }

  console.log(`\n✅ Downloaded ${localPaths.length}/${clips.length} clips`);

  if (localPaths.length === 0) {
    console.log('❌ No clips downloaded');
    return;
  }

  // Create title card
  console.log('\n🎬 Creating title card...');
  const titlePath = '/tmp/title.mp4';
  try {
    execSync(`ffmpeg -y -f lavfi -i color=c=black:s=1280x720:d=3 -vf "drawtext=text='THE DISSOLUTION OF THERA-VAIN':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2,drawtext=text='Episode 1':fontcolor=0xAAAAAA:fontsize=22:x=(w-text_w)/2:y=(h+80)/2" -c:v libx264 -t 3 -pix_fmt yuv420p -r 24 ${titlePath} 2>&1 | tail -2`);
    console.log('   ✅ Title card created');
  } catch (e) {
    console.log(`   ⚠ Title card failed: ${e.message}`);
  }

  // Normalize all clips to same format
  console.log('\n🔧 Normalizing clips...');
  const normalizedPaths = [];
  
  // Add title first if it exists
  try {
    if (statSync(titlePath).size > 0) {
      const normTitle = '/tmp/norm_title.mp4';
      execSync(`ffmpeg -y -i ${titlePath} -c:v libx264 -r 24 -s 1280x720 -pix_fmt yuv420p -an -movflags +faststart ${normTitle} 2>&1 | tail -1`);
      normalizedPaths.push(normTitle);
      console.log('   ✅ Title normalized');
    }
  } catch {}

  for (const { num, path } of localPaths) {
    const normPath = `/tmp/norm_${num}.mp4`;
    try {
      execSync(`ffmpeg -y -i "${path}" -c:v libx264 -r 24 -s 1280x720 -pix_fmt yuv420p -an -movflags +faststart "${normPath}" 2>&1 | tail -1`, { timeout: 60000 });
      const size = statSync(normPath).size;
      if (size > 0) {
        normalizedPaths.push(normPath);
        console.log(`   ✅ Shot ${num}: ${(size / 1024 / 1024).toFixed(1)}MB`);
      } else {
        console.log(`   ❌ Shot ${num}: empty after normalize`);
      }
    } catch (e) {
      console.log(`   ❌ Shot ${num}: ${e.message}`);
    }
  }

  // Concat
  console.log(`\n✂️ Concatenating ${normalizedPaths.length} clips...`);
  const concatFile = '/tmp/concat.txt';
  writeFileSync(concatFile, normalizedPaths.map(p => `file '${p}'`).join('\n'));

  const outputPath = '/tmp/ep1v3_final.mp4';
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${outputPath}" 2>&1 | tail -3`, { timeout: 120000 });
    const size = statSync(outputPath).size;
    console.log(`✅ Final video: ${(size / 1024 / 1024).toFixed(1)}MB`);
  } catch (e) {
    console.log(`❌ Concat failed: ${e.message}`);
    return;
  }

  // Upload to Supabase
  console.log('\n📤 Uploading...');
  const fileBuffer = readFileSync(outputPath);
  const fileName = 'episodes/ep1v3_thera_vain_focused.mp4';

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
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`  ✅ EPISODE 1 v3 COMPLETE`);
    console.log(`  ${publicUrl}`);
    console.log(`═══════════════════════════════════════════`);
  } else {
    const err = await resp.text();
    console.log(`❌ Upload failed: ${err}`);
    console.log('Local file at /tmp/ep1v3_final.mp4');
  }
}

main().catch(e => console.error('Fatal:', e));
