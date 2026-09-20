import assert from "node:assert/strict";
import { activeCancelWindowsAt, activeWindowEventsAt, bindExternalHitResult, compileTimeline, compileWindowEdges, createAbilityPackage, createCancelDecision, createHitQueryRequest, eventsBetween, phaseAt } from "../src/index.mjs";

const ability = {
  id: "dash-strike",
  duration: 0.8,
  cooldown: 2,
  phases: [
    { id: "startup", start: 0, end: 0.18 },
    { id: "active", start: 0.18, end: 0.31 },
    { id: "recovery", start: 0.31, end: 0.8 }
  ],
  cancelWindows: [
    { id: "recovery-cancel", start: 0.55, end: 0.8, into: ["dash-away", "heavy-finisher"] }
  ],
  tracks: [
    { id: "anim", type: "animation", events: [
      { id: "play", time: 0, ref: { fabric: "axm-animation-fabric", clip: "dash-strike" } }
    ]},
    { id: "move", type: "movement", events: [
      { id: "dash", time: 0.18, distance: 4 }
    ]},
    { id: "hit", type: "hitbox", events: [
      { id: "blade", time: 0.22, endTime: 0.29, damage: 25, socket: "weapon-tip", shape: { type: "capsule", radius: 0.4, halfHeight: 0.7 } }
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

assert.deepEqual(activeCancelWindowsAt(ability, 0.6).map(window => window.id), ["recovery-cancel"]);
assert.deepEqual(activeCancelWindowsAt(ability, 0.8), []);

const cancelA = createCancelDecision(ability, 0.6, { targetAbilityId: "dash-away" });
const cancelB = createCancelDecision(ability, 0.6, { targetAbilityId: "dash-away" });
assert.equal(cancelA.allowed, true);
assert.equal(cancelA.reason, "cancel-window-open");
assert.equal(cancelA.windowId, "recovery-cancel");
assert.deepEqual(cancelA.request, {
  type: "ability-interrupt",
  abilityId: "dash-strike",
  interruptAt: 0.6,
  nextAbilityId: "dash-away"
});
assert.equal(cancelA.authority.durableWorldStateOwner, false);
assert.equal(cancelA.receipt.sha256, cancelB.receipt.sha256);

const targetRequired = createCancelDecision(ability, 0.6);
assert.equal(targetRequired.allowed, false);
assert.equal(targetRequired.reason, "target-required");
assert.equal(targetRequired.request, null);

const wrongTarget = createCancelDecision(ability, 0.6, { targetAbilityId: "heal" });
assert.equal(wrongTarget.allowed, false);
assert.equal(wrongTarget.reason, "target-not-allowed");

const tooEarly = createCancelDecision(ability, 0.4, { targetAbilityId: "dash-away" });
assert.equal(tooEarly.allowed, false);
assert.equal(tooEarly.reason, "outside-cancel-window");

const closeBoundary = createCancelDecision(ability, 0.8, { targetAbilityId: "dash-away" });
assert.equal(closeBoundary.allowed, false);
assert.equal(closeBoundary.reason, "outside-cancel-window");

const outsideAbility = createCancelDecision(ability, 0.9, { targetAbilityId: "dash-away" });
assert.equal(outsideAbility.allowed, false);
assert.equal(outsideAbility.reason, "outside-ability");

const hitQueryA = createHitQueryRequest(ability, 0.24, {
  hitboxEventId: "blade",
  queryId: "dash-strike-hit-001",
  context: { attackerId: "player-1", candidateSet: "nearby-enemies-frame-42" }
});
const hitQueryB = createHitQueryRequest(ability, 0.24, {
  hitboxEventId: "blade",
  queryId: "dash-strike-hit-001",
  context: { attackerId: "player-1", candidateSet: "nearby-enemies-frame-42" }
});
assert.equal(hitQueryA.receipt.sha256, hitQueryB.receipt.sha256);
assert.equal(hitQueryA.request.type, "collision-hit-query");
assert.equal(hitQueryA.request.hitboxEvent.id, "blade");
assert.deepEqual(hitQueryA.request.hitboxEvent.shape, { type: "capsule", radius: 0.4, halfHeight: 0.7 });
assert.equal(hitQueryA.authority.collisionTruthOwner, false);
assert.equal(hitQueryA.authority.durableWorldStateOwner, false);

const externalHit = {
  requestSha256: hitQueryA.receipt.sha256,
  hit: true,
  contacts: [{ targetId: "enemy-7", contactId: "contact-17", point: [1.2, 0.5, -0.2] }],
  source: { system: "example-collision-runtime", receipt: "collision-frame-42:17" }
};
const boundHitA = bindExternalHitResult(hitQueryA, externalHit);
const boundHitB = bindExternalHitResult(hitQueryA, externalHit);
assert.equal(boundHitA.hit, true);
assert.equal(boundHitA.contacts[0].targetId, "enemy-7");
assert.equal(boundHitA.external.source.system, "example-collision-runtime");
assert.equal(boundHitA.authority.collisionTruthOwner, false);
assert.equal(boundHitA.authority.durableWorldStateOwner, false);
assert.equal(boundHitA.authority.consumesExternalCollisionReceipt, true);
assert.equal(boundHitA.receipt.sha256, boundHitB.receipt.sha256);

const boundMiss = bindExternalHitResult(hitQueryA, {
  requestSha256: hitQueryA.receipt.sha256,
  hit: false,
  contacts: [],
  source: { system: "example-collision-runtime", receipt: "collision-frame-42:18" }
});
assert.equal(boundMiss.hit, false);
assert.deepEqual(boundMiss.contacts, []);

assert.throws(() => createHitQueryRequest(ability, 0.3, { hitboxEventId: "blade" }), /not active/);
assert.throws(() => createHitQueryRequest(ability, 0.24, { hitboxEventId: "missing" }), /not active/);
assert.throws(() => createHitQueryRequest(ability, 0.24, { hitboxEventId: "blade", context: [] }), /context/);
assert.throws(() => bindExternalHitResult(hitQueryA, { ...externalHit, requestSha256: "wrong-query" }), /does not bind/);
assert.throws(() => bindExternalHitResult({ ...hitQueryA, request: { ...hitQueryA.request, sampleTime: 0.25 } }, externalHit), /receipt mismatch/);
assert.throws(() => bindExternalHitResult(hitQueryA, { ...externalHit, hit: "yes" }), /must be boolean/);
assert.throws(() => bindExternalHitResult(hitQueryA, { ...externalHit, contacts: {} }), /contacts must be an array/);
assert.throws(() => bindExternalHitResult(hitQueryA, { ...externalHit, source: { system: "" } }), /non-empty string/);

assert.throws(() => createAbilityPackage({...ability, tracks:[{id:"bad",type:"magic",events:[]}]}));
assert.throws(() => createAbilityPackage({...ability, tracks:[{id:"bad-window",type:"hitbox",events:[{id:"bad",time:0.3,endTime:0.2}]}]}));
assert.throws(() => createAbilityPackage({...ability, cancelWindows:[{id:"bad-cancel",start:0.4,end:0.6,into:[]}]}));
assert.throws(() => createCancelDecision(ability, 0.6, { targetAbilityId: "" }));
console.log("PASS gameplay-ability-fabric selftest", a.receipt.sha256, cancelA.receipt.sha256, boundHitA.receipt.sha256);
