import assert from "node:assert/strict";
import { bindExternalRuntimeCueReceipt, createRuntimeCueRequests } from "../src/runtime-cues.mjs";

const ability = {
  id: "arc-slash",
  duration: 0.7,
  phases: [
    { id: "startup", start: 0, end: 0.2 },
    { id: "active", start: 0.2, end: 0.32 },
    { id: "recovery", start: 0.32, end: 0.7 }
  ],
  tracks: [
    { id: "audio", type: "audio", events: [
      { id: "windup-whoosh", time: 0, cue: "slash-windup" },
      { id: "impact-crack", time: 0.22, cue: "blade-impact" },
      { id: "recovery-rattle", time: 0.4, cue: "armor-rattle" }
    ]},
    { id: "camera", type: "camera", events: [
      { id: "impact-kick", time: 0.22, impulse: { amplitude: 0.35, duration: 0.08 } }
    ]},
    { id: "physics", type: "physics", events: [
      { id: "impact-push", time: 0.22, request: { kind: "impulse", strength: 4 } }
    ]},
    { id: "fx", type: "vfx", events: [
      { id: "spark", time: 0.22, effect: "blade-spark" }
    ]}
  ]
};

const initialA = createRuntimeCueRequests(ability, {
  actionInstanceId: "attack-17",
  afterTime: null,
  throughTime: 0.22,
  context: { actorId: "player-1" }
});
const initialB = createRuntimeCueRequests(ability, {
  actionInstanceId: "attack-17",
  afterTime: null,
  throughTime: 0.22,
  context: { actorId: "player-1" }
});

assert.equal(initialA.receipt.sha256, initialB.receipt.sha256);
assert.deepEqual(initialA.cueTypes, ["audio", "camera", "physics"]);
assert.deepEqual(initialA.requests.map(request => request.eventId), [
  "windup-whoosh",
  "impact-crack",
  "impact-kick",
  "impact-push"
]);
assert.deepEqual(initialA.requests.map(request => request.type), [
  "audio-cue-request",
  "audio-cue-request",
  "camera-cue-request",
  "physics-cue-request"
]);
assert.equal(initialA.requests.some(request => request.eventId === "spark"), false);
assert.equal(initialA.authority.externalRuntimeTruthOwner, false);
assert.equal(initialA.authority.consumerOwnsDispatchLedger, true);

const continued = createRuntimeCueRequests(ability, {
  actionInstanceId: "attack-17",
  afterTime: 0.22,
  throughTime: 0.5
});
assert.deepEqual(continued.requests.map(request => request.eventId), ["recovery-rattle"]);

const earlyCancel = createRuntimeCueRequests(ability, {
  actionInstanceId: "attack-17",
  afterTime: null,
  throughTime: 0.19
});
assert.deepEqual(earlyCancel.requests.map(request => request.eventId), ["windup-whoosh"]);

const subsetA = createRuntimeCueRequests(ability, {
  actionInstanceId: "attack-17",
  throughTime: 0.22,
  types: ["physics", "audio"]
});
const subsetB = createRuntimeCueRequests(ability, {
  actionInstanceId: "attack-17",
  throughTime: 0.22,
  types: ["audio", "physics"]
});
assert.deepEqual(subsetA.cueTypes, ["audio", "physics"]);
assert.equal(subsetA.receipt.sha256, subsetB.receipt.sha256);
assert.deepEqual(subsetA.requests.map(request => request.eventId), [
  "windup-whoosh",
  "impact-crack",
  "impact-push"
]);

const overlap = createRuntimeCueRequests(ability, {
  actionInstanceId: "attack-17",
  afterTime: 0.1,
  throughTime: 0.3,
  types: "audio"
});
const firstImpactAudio = initialA.requests.find(request => request.eventId === "impact-crack");
assert.equal(overlap.requests[0].dispatchKey, firstImpactAudio.dispatchKey);
assert.equal(overlap.requests[0].receipt.sha256, firstImpactAudio.receipt.sha256);

const newAction = createRuntimeCueRequests(ability, {
  actionInstanceId: "attack-18",
  throughTime: 0.22,
  types: "audio"
});
assert.notEqual(newAction.requests.find(request => request.eventId === "impact-crack").dispatchKey, firstImpactAudio.dispatchKey);

const externalExecuted = {
  requestSha256: firstImpactAudio.receipt.sha256,
  dispatchKey: firstImpactAudio.dispatchKey,
  status: "executed",
  source: { system: "example-audio-runtime", receipt: "audio-frame-882:impact-3" },
  details: { voiceId: "blade-impact-voice-2" }
};
const boundA = bindExternalRuntimeCueReceipt(firstImpactAudio, externalExecuted);
const boundB = bindExternalRuntimeCueReceipt(firstImpactAudio, externalExecuted);
assert.equal(boundA.receipt.sha256, boundB.receipt.sha256);
assert.equal(boundA.external.status, "executed");
assert.equal(boundA.external.source.system, "example-audio-runtime");
assert.equal(boundA.authority.externalRuntimeTruthOwner, false);
assert.equal(boundA.authority.consumesExternalRuntimeReceipt, true);

const cameraRequest = initialA.requests.find(request => request.cueType === "camera");
const cameraAccepted = bindExternalRuntimeCueReceipt(cameraRequest, {
  requestSha256: cameraRequest.receipt.sha256,
  dispatchKey: cameraRequest.dispatchKey,
  status: "accepted",
  source: { system: "example-camera-runtime" }
});
assert.equal(cameraAccepted.external.status, "accepted");
assert.equal(cameraAccepted.external.source.receipt, null);

assert.throws(() => createRuntimeCueRequests(ability, { actionInstanceId: "", throughTime: 0.2 }), /non-empty string/);
assert.throws(() => createRuntimeCueRequests(ability, { actionInstanceId: "attack", throughTime: 0.8 }), /inside ability/);
assert.throws(() => createRuntimeCueRequests(ability, { actionInstanceId: "attack", afterTime: 0.3, throughTime: 0.2 }), /<= throughTime/);
assert.throws(() => createRuntimeCueRequests(ability, { actionInstanceId: "attack", throughTime: 0.2, types: [] }), /at least one/);
assert.throws(() => createRuntimeCueRequests(ability, { actionInstanceId: "attack", throughTime: 0.2, types: "vfx" }), /unknown runtime cue type/);
assert.throws(() => createRuntimeCueRequests(ability, { actionInstanceId: "attack", throughTime: 0.2, context: [] }), /context/);
assert.throws(() => bindExternalRuntimeCueReceipt({ ...firstImpactAudio, eventTime: 0.23 }, externalExecuted), /receipt mismatch/);
assert.throws(() => bindExternalRuntimeCueReceipt(firstImpactAudio, { ...externalExecuted, requestSha256: "wrong" }), /does not bind/);
assert.throws(() => bindExternalRuntimeCueReceipt(firstImpactAudio, { ...externalExecuted, dispatchKey: "wrong" }), /dispatch key mismatch/);
assert.throws(() => bindExternalRuntimeCueReceipt(firstImpactAudio, { ...externalExecuted, status: "probably" }), /invalid status/);
assert.throws(() => bindExternalRuntimeCueReceipt(firstImpactAudio, { ...externalExecuted, source: { system: "" } }), /non-empty string/);

console.log("PASS gameplay-ability-fabric runtime cues", initialA.receipt.sha256, boundA.receipt.sha256);
