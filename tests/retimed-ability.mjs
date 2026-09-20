import assert from "node:assert/strict";
import { digest } from "../src/index.mjs";
import {
  ANIMATION_TIME_TRANSFORM_SCHEMA,
  RETIMED_ABILITY_SCHEMA,
  deriveRetimedAbilityTimeline,
  validateAnimationTimeTransform,
  validateRetimedAbilityTimeline
} from "../src/retimed-ability.mjs";

const ability = {
  id: "arc-slash",
  duration: 1.2,
  cooldown: 2.5,
  phases: [
    { id: "startup", start: 0, end: 0.24 },
    { id: "active", start: 0.24, end: 0.4 },
    { id: "recovery", start: 0.4, end: 1.2 }
  ],
  cancelWindows: [
    { id: "late-cancel", start: 0.62, end: 1.0, into: ["roll", "guard"] }
  ],
  tracks: [
    { id: "hit", type: "hitbox", events: [
      { id: "blade", time: 0.24, endTime: 0.4, shape: { type: "capsule", radius: 0.35 } }
    ]},
    { id: "impact-audio", type: "audio", events: [
      { id: "impact-audio", time: 0.29, cue: "sword-impact" }
    ]},
    { id: "impact-camera", type: "camera", events: [
      { id: "impact-camera", time: 0.29, impulse: 0.65 }
    ]},
    { id: "impact-physics", type: "physics", events: [
      { id: "impact-physics", time: 0.29, request: { type: "knockback", distance: 1.1 } }
    ]},
    { id: "trail", type: "vfx", events: [
      { id: "slash-trail", time: 0.2, endTime: 0.62, effect: "arc-trail" }
    ]}
  ]
};

function animationTransform({ rate = 2, timeScale = 0.5, outputDuration = 0.6 } = {}) {
  const body = {
    schema: ANIMATION_TIME_TRANSFORM_SCHEMA,
    sourceClip: "arc-slash",
    sourceSha256: "source-animation-sha256",
    outputClip: "arc-slash-fast",
    outputSha256: "output-animation-sha256",
    sourceDuration: 1.2,
    outputDuration,
    rate,
    timeScale
  };
  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      uniform: true,
      sourceBound: true,
      outputBound: true
    }
  };
}

const transform = animationTransform();
assert.equal(validateAnimationTimeTransform(transform), true);

const fast = deriveRetimedAbilityTimeline(ability, transform, { id: "arc-slash-fast" });
const fastReplay = deriveRetimedAbilityTimeline(ability, transform, { id: "arc-slash-fast" });

assert.equal(fast.schema, RETIMED_ABILITY_SCHEMA);
assert.equal(fast.receipt.sha256, fastReplay.receipt.sha256);
assert.deepEqual(fast.ability, fastReplay.ability);
assert.equal(fast.sourceAbilitySha256, digest(ability));
assert.equal(fast.animationTransform.receipt.sha256, transform.receipt.sha256);
assert.equal(fast.authority.animationTimingOwner, false);
assert.equal(fast.authority.durableWorldStateOwner, false);
assert.equal(fast.authority.balanceAuthority, false);
assert.equal(fast.policy.inActionTiming, "scale-uniformly");
assert.equal(fast.policy.cooldown, "preserve");
assert.equal(fast.ability.duration, 0.6);
assert.equal(fast.ability.cooldown, 2.5, "cooldown is gameplay policy and is preserved by default");

assert.deepEqual(fast.ability.phases, [
  { id: "startup", start: 0, end: 0.12 },
  { id: "active", start: 0.12, end: 0.2 },
  { id: "recovery", start: 0.2, end: 0.6 }
]);
assert.deepEqual(fast.ability.cancelWindows, [
  { id: "late-cancel", start: 0.31, end: 0.5, into: ["roll", "guard"] }
]);

const hitbox = fast.ability.tracks.find(track => track.id === "hit").events[0];
assert.equal(hitbox.time, 0.12);
assert.equal(hitbox.endTime, 0.2);

for (const trackId of ["impact-audio", "impact-camera", "impact-physics"]) {
  const event = fast.ability.tracks.find(track => track.id === trackId).events[0];
  assert.equal(event.time, 0.145, `${trackId} must move with the animation impact`);
}
const trail = fast.ability.tracks.find(track => track.id === "trail").events[0];
assert.equal(trail.time, 0.1);
assert.equal(trail.endTime, 0.31);

const mappedHitbox = fast.timingMap.events.find(event => event.eventId === "blade");
assert.equal(mappedHitbox.sourceTime, 0.24);
assert.equal(mappedHitbox.sourceEndTime, 0.4);
assert.equal(mappedHitbox.outputTime, 0.12);
assert.equal(mappedHitbox.outputEndTime, 0.2);
const mappedImpact = fast.timingMap.events.find(event => event.eventId === "impact-audio");
assert.equal(mappedImpact.sourceTime, 0.29);
assert.equal(mappedImpact.outputTime, 0.145);

assert.equal(validateRetimedAbilityTimeline(fast, { sourceAbility: ability }), true);

const scaledCooldown = deriveRetimedAbilityTimeline(ability, transform, {
  id: "arc-slash-fast-short-cooldown",
  cooldownPolicy: "scale"
});
assert.equal(scaledCooldown.ability.cooldown, 1.25);
assert.equal(scaledCooldown.policy.cooldown, "scale");

const tamperedTransform = structuredClone(transform);
tamperedTransform.outputDuration = 0.7;
assert.throws(() => validateAnimationTimeTransform(tamperedTransform), /duration mismatch|receipt mismatch/);

const wrongDurationAbility = structuredClone(ability);
wrongDurationAbility.duration = 1.0;
wrongDurationAbility.phases.at(-1).end = 1.0;
assert.throws(
  () => deriveRetimedAbilityTimeline(wrongDurationAbility, transform, { id: "bad-duration" }),
  /ability duration must match/
);
assert.throws(() => deriveRetimedAbilityTimeline(ability, transform, { id: "arc-slash" }), /must differ/);
assert.throws(
  () => deriveRetimedAbilityTimeline(ability, transform, { id: "bad-policy", cooldownPolicy: "guess" }),
  /cooldownPolicy/
);

const tamperedArtifact = structuredClone(fast);
tamperedArtifact.ability.tracks.find(track => track.id === "impact-audio").events[0].time = 0.29;
assert.throws(() => validateRetimedAbilityTimeline(tamperedArtifact), /derived ability hash mismatch/);

const modifiedSource = structuredClone(ability);
modifiedSource.tracks.find(track => track.id === "impact-audio").events[0].cue = "different-impact";
assert.throws(() => validateRetimedAbilityTimeline(fast, { sourceAbility: modifiedSource }), /source ability hash mismatch/);

console.log("PASS retimed ability timeline", fast.receipt.sha256);
