import assert from "node:assert/strict";
import { createAbilityPackage, compileTimeline, eventsBetween, phaseAt } from "../src/index.mjs";

const ability = {
  id: "dash-strike",
  duration: 0.8,
  cooldown: 2,
  phases: [
    { id: "startup", start: 0, end: 0.18 },
    { id: "active", start: 0.18, end: 0.31 },
    { id: "recovery", start: 0.31, end: 0.8 }
  ],
  cancelWindows: [{ id: "recovery-cancel", start: 0.55, end: 0.8 }],
  tracks: [
    { id: "anim", type: "animation", events: [
      { id: "play", time: 0, ref: { fabric: "axm-animation-fabric", clip: "dash-strike" } }
    ]},
    { id: "move", type: "movement", events: [
      { id: "dash", time: 0.18, distance: 4 }
    ]},
    { id: "hit", type: "hitbox", events: [
      { id: "blade", time: 0.22, damage: 25 }
    ]},
    { id: "fx", type: "vfx", events: [
      { id: "trail", time: 0.18, ref: { fabric: "axm-visual-effect-fabric", effect: "dash-trail" } }
    ]}
  ]
};

const a = createAbilityPackage(ability);
const b = createAbilityPackage(ability);
assert.equal(a.receipt.sha256, b.receipt.sha256);
assert.equal(a.authority.durableWorldStateOwner, false);
assert.deepEqual(phaseAt(ability, 0.22), ["active"]);
assert.equal(eventsBetween(ability, 0.17, 0.23).length, 3);
assert.deepEqual(compileTimeline(ability).map(e => e.id), ["play", "dash", "trail", "blade"]);
assert.throws(() => createAbilityPackage({...ability, tracks:[{id:"bad",type:"magic",events:[]}]}));
console.log("PASS gameplay-ability-fabric selftest", a.receipt.sha256);
