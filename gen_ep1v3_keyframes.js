// Episode 1 v3 — Focus Rule Applied
// CHARACTER: Epsilon-1 (crystalline humanoid, amber-red veins, cracked visor)
// OBJECT: The Core Shard (hexagonal amber-red crystal, fist-sized)
// ACTION: Shard phases through hands, crosses void, reforms in Delta-5's grasp

const SUPA_URL = 'https://gkcohikbuginhzyilcya.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrY29oaWtidWdpbmh6eWlsY3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYxOTAsImV4cCI6MjA4NTc0MjE5MH0.Kvb4-nINJO41chvrzZa9CceX8hdnrgPWKsrzDa3FuxE';
const MIRA_ID = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf';

const shots = [
  {
    num: 1,
    name: "HOOK - Epsilon-1 holds the shard",
    prompt: "Extreme close-up of two translucent crystalline hands with geometric lattice bone structure visible beneath the surface, amber-red energy veins pulsing through the fingers, cupping a hexagonal amber-red crystal shard the size of a fist, the shard glowing with intense inner light, holographic patterns swirling inside the crystal temporal spirals and dimensional maps visible through the translucent surface, a hairline crack forming on one facet of the shard with tiny amber sparks leaking from it, the hands slightly trembling, scratched geometric armor visible at the wrists, dark substrate blue-black background, shallow depth of field focused on the crack in the shard, photorealistic, volumetric amber light, film grain, anamorphic lens, 8K detail, cinematic color grade, Blade Runner 2049 aesthetic"
  },
  {
    num: 2,
    name: "CRACK - Shard fractures in grip",
    prompt: "Close-up of Epsilon-1 translucent crystalline hands gripping the hexagonal core shard as it fractures into five pieces, amber-red light bleeding through the cracks between fragments, the fragments beginning to phase through the translucent fingers the hand losing solidity where the crystal passes through it, fingers becoming more transparent at the contact points, tiny amber sparks erupting from each fracture line, Epsilon-1 forearm visible showing geometric lattice armor with scratches and a small cyan status light, the grip is desperate knuckles tight tendons visible through translucent skin, dark blue-black background, shallow depth of field, photorealistic, volumetric amber light casting warm glow on the hand, film grain, anamorphic lens, 8K, cinematic"
  },
  {
    num: 3,
    name: "LOSS - Fragments drift from open palm",
    prompt: "Medium close-up, five hexagonal amber-red crystal fragments floating upward from an open translucent crystalline palm below, each fragment trailing a thin luminous amber filament still connected to the hand, filaments stretching like threads about to snap, the fragments separating as they rise each containing a different holographic symbol inside, the open palm below is empty and slightly transparent, amber light from the fragments casting warm glow downward onto the hand and geometric lattice forearm armor, dark void above where the fragments drift toward, tiny amber sparks falling like embers from the stretching filaments, photorealistic, volumetric amber light, shallow depth of field on the fragments, film grain, cinematic, 8K"
  },
  {
    num: 4,
    name: "SCALE JUMP - Fragments cross the void",
    prompt: "Wide shot of the Inter-Universal Void, vast engineered emptiness with substrate-white lattice floor stretching to infinity, five tiny amber-red crystal fragments drifting across the void from left to right like embers in wind each trailing a faint luminous tail, in the far right distance a warm amber-white glow from an unseen structure pulling the fragments toward it, deep blue-black void above, faint signal pulse blue channels in the substrate floor creating a grid pattern, the five fragments are small but the brightest things in the frame, the scale is immense the fragments are crossing a cosmic distance, Blade Runner 2049 vast emptiness aesthetic, cinematic, photorealistic, volumetric light from the fragments and distant glow, 8K"
  },
  {
    num: 5,
    name: "REACH - Epsilon-1 reaches after fragments",
    prompt: "Medium shot of Epsilon-1 a translucent crystalline humanoid with geometric lattice armor, amber-red energy veins dimming across their body, reaching one arm out to the right toward unseen distant fragments, the body losing opacity the dark void partially visible through the torso and limbs, the outstretched hand translucent with fingers spread, the face visible through a cracking crystalline visor expression of quiet understanding not grief, holographic data fragments drifting away from the visor surface, a faint amber-white light reflecting in the eyes from the distant creation, battle-worn scratches across the chest plate, small cyan status lights on the armor flickering, deep blue-black void background, photorealistic, volumetric lighting from the dimming amber veins, film grain, cinematic, shallow depth of field on the face, 8K"
  },
  {
    num: 6,
    name: "MIRROR - Fragment arrives at Delta-5 hand",
    prompt: "Extreme close-up of Delta-5 hands crystalline but with warmer amber-white energy veins instead of red, geometric lattice structure visible beneath translucent skin, the hands open and receiving, a single hexagonal amber-red crystal fragment drifting down into the open palm, the moment of contact new amber-white crystalline filaments growing from the palm surface and wrapping around the fragment, the fragment amber-red color beginning to shift toward amber-white at the contact points, the absorption creating tiny sparks of cyan light, the hand structure becoming more complex where the fragment integrates, dark background, shallow depth of field on the contact point, photorealistic, volumetric amber-white light, film grain, anamorphic lens, 8K, cinematic"
  },
  {
    num: 7,
    name: "REFORM - Shard rebuilds as new crystal",
    prompt: "Close-up of Delta-5 crystalline hands holding five crystal fragments being pulled together by amber-white coherence streams, the fragments reassembling into a NEW shape not the original hexagon but a more complex dodecahedral crystal with more facets and new internal geometry, the amber-red color shifting to amber-white as they fuse, holographic patterns inside the reforming crystal are different new configurations never seen before, amber-white energy threads weaving between the fragments like sutures, the emerging crystal glowing brighter than any single fragment did, Delta-5 hands steady and purposeful, warm amber-white light casting glow on the geometric lattice skin, dark background, shallow depth of field on the reforming crystal, photorealistic, volumetric light, film grain, 8K, cinematic"
  },
  {
    num: 8,
    name: "ARC - Both figures connected by light",
    prompt: "Wide shot, Epsilon-1 on the far left translucent crystalline figure fading arm outstretched to the right amber-red energy veins nearly dark body partially transparent showing the void through them, Delta-5 on the far right crystalline figure with amber-white energy veins bright hands cupped around a glowing reformed crystal, between them a luminous energy arc sweeping across the void connecting the two figures, the arc transitioning from amber-red on the left to amber-white on the right, the arc leaving a visible trail that lingers creating a bridge of light across the substrate floor, floating particles along the arc path, the substrate floor reflecting both colors red on left fading to white on right, the two figures small against the vast void but connected by the visible arc, Blade Runner 2049 composition, cinematic, photorealistic, volumetric light arc, 8K"
  },
  {
    num: 9,
    name: "FACE - Epsilon-1 sees the new crystal",
    prompt: "Close-up of Epsilon-1 face, nearly transparent crystalline skin with the void visible through the cheeks and forehead, geometric lattice bone structure faintly visible beneath, the visor cracked into a spiderweb pattern with pieces missing, amber-red energy veins almost completely dark only the faintest glow remaining, but in both eyes a bright amber-white reflection the glow of the reformed crystal visible in the dying gaze, the expression is peaceful complete not anguish but understanding that what was lost became something more, deep blue atmosphere, extreme intimacy, shallow depth of field on the eyes and the amber-white reflection in them, photorealistic, film grain, cinematic, 8K"
  },
  {
    num: 10,
    name: "BREATHE - New crystal held aloft in void",
    prompt: "Extreme wide shot of the Inter-Universal Void vast and empty, substrate-white lattice floor stretching to infinity with faint blue pulse channels, on the left a faint amber-red smoke-like outline dissipating the ghost of where Epsilon-1 stood now fading into nothing, on the right far distance Delta-5 stands small holding the reformed amber-white crystal above their head the single brightest point of light in the entire frame like a star held in hands, a fading luminous arc between the two positions still visible but dimming amber-red to amber-white, the vast void above dark with the faintest aurora from accumulated energy, composition asymmetric emptiness on left where something was and small bright point on right where something new is, contemplative final image, Blade Runner 2049 extreme wide aesthetic, cinematic, photorealistic, volumetric light from the single crystal, 8K"
  }
];

async function generateKeyframe(shot) {
  console.log(`\n🎨 Shot ${shot.num}: ${shot.name}`);
  
  try {
    const resp = await fetch(`${SUPA_URL}/functions/v1/generate-image`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Bearer ${SUPA_KEY}` 
      },
      body: JSON.stringify({
        prompt: shot.prompt,
        model: 'gen4_image_turbo',
        ratio: '1920:1080',
        agent_id: MIRA_ID,
        universe: 'THE INTER-UNIVERSAL VOID',
        scene: `EP1v3 Shot ${shot.num}: ${shot.name}`,
        style_tags: ['ep1v3', 'cinematics-playbook', 'focused', 'thera-vain'],
      }),
      signal: AbortSignal.timeout(300000),
    });
    
    const result = await resp.json();
    
    if (result.success) {
      console.log(`   ✅ ${result.public_url}`);
      return { ...shot, url: result.public_url, id: result.creation_id };
    } else {
      console.log(`   ❌ ${result.error}`);
      return { ...shot, url: null, error: result.error };
    }
  } catch (e) {
    console.log(`   ❌ ${e.message}`);
    return { ...shot, url: null, error: e.message };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('  EPISODE 1 v3 — FOCUSED KEYFRAMES');
  console.log('  Character: Epsilon-1 | Object: Core Shard');
  console.log('═══════════════════════════════════════════');
  
  const results = [];
  
  for (const shot of shots) {
    const result = await generateKeyframe(shot);
    results.push(result);
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log('\n═══════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════');
  
  for (const r of results) {
    console.log(`Shot ${r.num} [${r.name}]: ${r.url || 'FAILED - ' + r.error}`);
  }
  
  const success = results.filter(r => r.url).length;
  console.log(`\n✅ ${success}/${results.length} keyframes generated`);
}

main().catch(e => console.error('Fatal:', e));
