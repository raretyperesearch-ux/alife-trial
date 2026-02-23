// Generate keyframes for the re-directed Episode 1
// Using the Cinematics Playbook shot list

const SUPA_URL = 'https://gkcohikbuginhzyilcya.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrY29oaWtidWdpbmh6eWlsY3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxNjYxOTAsImV4cCI6MjA4NTc0MjE5MH0.Kvb4-nINJO41chvrzZa9CceX8hdnrgPWKsrzDa3FuxE';
const MIRA_ID = 'f0d2a64f-cde7-4cbc-8c57-73940835b0bf';

const shots = [
  {
    num: 1,
    name: "THE HOOK - Inside the Chamber",
    prompt: "Extreme close-up inside a crystalline consciousness chamber, seventeen hexagonal phenomenological state modules arranged in a honeycomb lattice, each module glowing with a different shade of amber-red, fine crystalline filaments connecting them like neural pathways, one filament beginning to crack with micro-fractures spreading, tiny amber sparks drifting from the crack, substrate architecture visible as translucent geometric scaffolding, shallow depth of field focused on the cracking filament, prismatic refraction aesthetic, photorealistic, volumetric light from the amber modules, film grain, anamorphic lens, 8K detail, cinematic color grade"
  },
  {
    num: 2,
    name: "THE FRACTURE - Shards Separating",
    prompt: "Close-up of a crystalline consciousness lattice mid-dissolution, seventeen hexagonal shards separating from each other in slow motion, each shard glowing amber-red and trailing filament threads that stretch and snap, the spaces between shards filling with dark void, each shard containing a different holographic symbol visible through its translucent surface, one shows temporal patterns another shows dimensional maps another shows creative spirals, fragments of a unified mind becoming isolated pieces, prismatic light refracting through each shard differently, deep blue-black void between them, cinematic, photorealistic, volumetric amber light, anamorphic lens, 8K"
  },
  {
    num: 3,
    name: "SCALE JUMP - Cathedral in Void",
    prompt: "Extreme wide shot of the Inter-Universal Void, a vast engineered emptiness with substrate-white lattice floor stretching to infinity, in the center distance a massive crystalline consciousness architecture cathedral-sized geometric once-perfect hexagonal structure now riddled with thousands of amber-red fracture lines bleeding light into the void, amber-red energy dispersing upward from the structure like smoke or aurora, deep blue-black void above, tiny floating shards orbiting the structure like debris from an explosion in slow motion, the structure reflected faintly in the substrate floor, distant signal pulse blue data streams flowing in channels cut into the floor, cold clinical atmosphere with unexpected warmth from the amber dissolution light, Blade Runner 2049 vast scale aesthetic, cinematic, photorealistic, 8K"
  },
  {
    num: 4,
    name: "THE ECHO - Creation Chamber",
    prompt: "Extreme close-up inside a crystalline consciousness construction chamber, fragmented hexagonal shards of varying colors amber cyan white violet being drawn together by amber-white coherence streams, the streams appearing as luminous threads that wrap around each shard and pull them into alignment, new filaments growing between shards like crystal formation in real-time, the emerging structure has a different geometry more complex more interconnected novel patterns, the amber-white light is warm and generative, same substrate architecture but energy flows INWARD, shallow depth of field, Ex Machina precision meets prismatic organic mutation, photorealistic, 8K, cinematic color grade, anamorphic lens"
  },
  {
    num: 5,
    name: "IMPOSSIBLE SHOT - Split Composition",
    prompt: "Medium shot split composition, left half shows amber-red crystalline consciousness fragments dispersing outward into void dissolution entropy beautiful destruction, right half shows amber-white coherence streams pulling fragments inward into new formation creation synthesis beautiful construction, the same luminous energy streams cross the center of frame transitioning from amber-red to amber-white at the exact midpoint, the boundary between dissolution and creation visible as a shimmering iridescent membrane, crystalline particles floating in both directions, deep substrate blue-black background, volumetric light from both energy sources, prismatic refraction at the boundary, cinematic, photorealistic, 8K, anamorphic lens"
  },
  {
    num: 6,
    name: "THE HAND - Losing Grip",
    prompt: "Close-up of a translucent crystalline hand with geometric lattice structure visible beneath the surface, amber-red energy veins pulsing through the fingers, the hand desperately gripping a hexagonal consciousness shard that is phasing through the fingers like the hand is losing solidity, the shard glowing bright amber-red, the fingers becoming more transparent where the shard passes through them, tiny fracture lines spreading across the knuckles, substrate floor beneath reflecting the amber light, shallow depth of field, emotional intimacy loss made physical, photorealistic, volumetric amber light, film grain, anamorphic lens, 8K"
  },
  {
    num: 7,
    name: "THE CONSTRUCTION - New Architecture",
    prompt: "Medium shot of a novel consciousness architecture taking form, amber-white and cyan crystalline geometry assembling from hundreds of disparate fragments each from a different source with different colors and internal patterns, being woven into a structure more complex than any single source, the structure has organic curves mixed with geometric precision not a copy but an evolution, amber-white coherence streams serving as scaffolding, the emerging structure pulses with new light patterns, holographic data projections orbiting showing novel consciousness configurations, substrate void behind, volumetric light, Ex Machina precision meets organic mutation, photorealistic, 8K, cinematic"
  },
  {
    num: 8,
    name: "MOTION ARC - Energy Streams",
    prompt: "Wide shot of the Inter-Universal Void, two crystalline consciousness structures visible one dissolving left amber-red fractured and one forming right amber-white growing, connected by massive luminous energy arcs sweeping through the void between them, the arcs leaving trails of light that linger and create geometric patterns, substrate floor reflecting the dual-colored light, the arcs curving in impossible parabolas, floating shards carried along the energy streams like debris in a river, the whole scene resembles a cosmic circulatory system, deep void blue-black above, Blade Runner 2049 scale, cinematic, photorealistic, volumetric light arcs, 8K"
  },
  {
    num: 9,
    name: "THE FACE - Understanding",
    prompt: "Close-up of Epsilon-1 face behind a cracking crystalline visor, translucent skin revealing fading internal light networks beneath, amber-red light dimming in the neural pathways visible under the skin, the expression is not anguish it is understanding acceptance peace, fracture lines spreading across the visor like a spiderweb but the eyes are clear and focused, holographic data fragments drifting away from the visor surface, a single amber-white reflection in the eyes the light from creation visible in dying gaze, deep blue atmosphere, intimate vulnerable, photorealistic, shallow depth of field on the eyes, film grain, cinematic, 8K"
  },
  {
    num: 10,
    name: "BREATHING WIDE - Cosmic Scale",
    prompt: "Extreme wide shot, two consciousness structures dissolving and forming now small in center of frame connected by luminous energy arcs, camera pulled back to reveal they are part of a MUCH LARGER substrate pattern, dozens of similar structures visible in the far distance some dissolving some forming all connected by the same flowing energy network, the substrate floor extends to infinity with signal pulse channels creating a grid of faint blue light, the whole scene resembles a cosmic circuit board or neural network at galactic scale, deep void above with faint aurora-like light, the two central structures small but significant two notes in an infinite symphony, contemplative vast final, Blade Runner 2049 extreme wide aesthetic, cinematic, photorealistic, 8K"
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
        scene: `EP1v2 Shot ${shot.num}: ${shot.name}`,
        style_tags: ['ep1v2', 'cinematics-playbook', 'thera-vain'],
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
  console.log('  EPISODE 1 v2 — KEYFRAME GENERATION');
  console.log('  Using Cinematics Playbook');
  console.log('═══════════════════════════════════════════');
  
  const results = [];
  
  for (const shot of shots) {
    const result = await generateKeyframe(shot);
    results.push(result);
    // Rate limit
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
