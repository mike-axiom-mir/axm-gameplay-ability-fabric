import assert from "node:assert/strict";
import { activeWindowEventsAt, compileTimeline, compileWindowEdges, createAbilityPackage, eventsBetween, phaseAt } from "../src/index.mjs";

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
      { id: "blade", time: 0.22, endTime: 0.29, damage: 25 }
    ]},
    { id: "hurt", type: "hurtbox", events: [
      { id: "arm-vulnerable", time: 0.18, endTime: 0.31, region: "arm" }
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
assert.equal(eventsBetween(ability, 0.17, 0.23).length, 4);
assert.deepEqual(compileTimeline(ability).map(e => e.id), ["play", "dash", "arm-vulnerable", "trail", "blade"]);
assert.deepEqual(activeWindowEventsAt(ability, 0.22, { types: "hitbox" }).map(e => e.id), ["blade"]);
assert.deepEqual(activeWindowEventsAt(ability, 0.289, { types: ["hitbox", "hurtbox"] }).map(e => e.id), ["arm-vulnerable", "blade"]);
assert.deepEqual(activeWindowEventsAt(ability, 0.29, { types: "hitbox" }), []);
assert.deepEqual(compileWindowEdges(ability, { types: "hitbox" }), [
  { time: 0.22, edge: "open", id: "blade", track: "hit", type: "hitbox" },
  { time: 0.29, edge: "close", id: "blade", track: "hit", type: "hitbox" }
]);
assert.throws(() => createAbilityPackage({...ability, tracks:[{id:"bad",type:"magic",events:[]}]}));
assert.throws(() => createAbilityPackage({...ability, tracks:[{id:"bad-window",type:"hitbox",events:[{id:"bad",time:0.3,endTime:0.2}]}]}));
console.log("PASS gameplay-ability-fabric selftest", a.receipt.sha256);
