import { createAbilityPackage, eventsBetween, phaseAt } from "../src/index.mjs";

const groundSlam = {
  id: "ground-slam",
  duration: 1.1,
  cooldown: 6,
  resourceCost: { stamina: 24 },
  phases: [
    { id: "startup", start: 0, end: 0.31 },
    { id: "active", start: 0.31, end: 0.36 },
    { id: "recovery", start: 0.36, end: 1.1 }
  ],
  cancelWindows: [
    { id: "late-recovery", start: 0.75, end: 1.1, into: ["dodge", "movement"] }
  ],
  tracks: [
    { id: "body", type: "animation", events: [
      { id: "play-ground-slam", time: 0, ref: { fabric: "axm-animation-fabric", clip: "ground-slam" } }
    ]},
    { id: "damage", type: "hitbox", events: [
      { id: "slam-hit", time: 0.32, shape: "sphere", radius: 2.2, damage: 38, knockback: 7.5 }
    ]},
    { id: "effects", type: "vfx", events: [
      { id: "ground-burst", time: 0.32, ref: { fabric: "axm-visual-effect-fabric", effect: "ground-impact-burst" } }
    ]},
    { id: "sound", type: "audio", events: [
      { id: "impact-sound", time: 0.32, cue: "ground-slam-impact" }
    ]},
    { id: "camera", type: "camera", events: [
      { id: "impact-kick", time: 0.32, impulse: 0.65, duration: 0.12 }
    ]},
    { id: "world", type: "physics", events: [
      { id: "radial-impulse", time: 0.32, request: { radius: 2.6, impulse: 4.0 } }
    ]}
  ]
};

const pack = createAbilityPackage(groundSlam, { purpose: "first synchronized attack proof" });
console.log(JSON.stringify({
  package: pack,
  activePhase: phaseAt(groundSlam, 0.32),
  impactEvents: eventsBetween(groundSlam, 0.31, 0.33)
}, null, 2));
