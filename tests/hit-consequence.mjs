import assert from "node:assert/strict";
import {
  bindExternalHitResult,
  createHitConsequenceRequests,
  createHitQueryRequest,
  HIT_CONSEQUENCE_BATCH_SCHEMA
} from "../src/api.mjs";

const ability = {
  id: "arc-slash",
  duration: 0.7,
  phases: [
    { id: "startup", start: 0, end: 0.2 },
    { id: "active", start: 0.2, end: 0.32 },
    { id: "recovery", start: 0.32, end: 0.7 }
  ],
  tracks: [
    {
      id: "blade-hitbox",
      type: "hitbox",
      events: [
        {
          id: "blade",
          time: 0.2,
          endTime: 0.32,
          socket: "weapon-tip",
          shape: { type: "capsule", radius: 0.35, halfHeight: 0.8 }
        }
      ]
    }
  ]
};

const query = createHitQueryRequest(ability, 0.24, {
  hitboxEventId: "blade",
  queryId: "arc-slash:frame-24",
  context: { attackerId: "player-1" }
});

const externalHit = {
  requestSha256: query.receipt.sha256,
  hit: true,
  contacts: [
    {
      targetId: "enemy-7",
      contactId: "enemy-7:blade:contact-1",
      point: [1.25, 0.8, -0.1],
      normal: [0, 1, 0]
    },
    {
      targetId: "enemy-7",
      contactId: "enemy-7:blade:contact-1",
      point: [1.25, 0.8, -0.1],
      normal: [0, 1, 0]
    }
  ],
  source: {
    system: "example-collision-runtime",
    receipt: "collision-frame-24"
  }
};

const binding = bindExternalHitResult(query, externalHit);
const consequences = [
  {
    id: "slash-damage",
    type: "damage",
    payload: { amount: 25, damageType: "slash" }
  },
  {
    id: "bleed-on-hit",
    type: "status",
    payload: { statusId: "bleed", stacks: 1, durationSeconds: 4 }
  }
];

const batchA = createHitConsequenceRequests(binding, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences
});
const batchB = createHitConsequenceRequests(binding, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences
});

assert.equal(batchA.schema, HIT_CONSEQUENCE_BATCH_SCHEMA);
assert.equal(batchA.receipt.sha256, batchB.receipt.sha256);
assert.equal(batchA.requests.length, 2);
assert.equal(batchA.suppressed.length, 2);
assert.deepEqual(batchA.requests.map(request => request.type), [
  "world-damage-request",
  "world-status-request"
]);
assert.deepEqual(batchA.requests.map(request => request.targetId), ["enemy-7", "enemy-7"]);
assert.equal(batchA.requests[0].source.hitResultBindingSha256, binding.receipt.sha256);
assert.equal(batchA.requests[0].source.collisionQuerySha256, binding.querySha256);
assert.equal(batchA.requests[0].source.externalCollisionSource.receipt, "collision-frame-24");
assert.equal(batchA.suppressed[0].reason, "duplicate-contact-consequence");
assert.equal(batchA.authority.durableWorldStateOwner, false);
assert.equal(batchA.authority.collisionTruthOwner, false);
assert.equal(batchA.authority.applicationLedgerOwner, false);
assert.equal(batchA.authority.callerMustPersistAppliedKeys, true);

const alreadyAppliedKeys = batchA.requests.map(request => request.applicationKey);
const laterQuery = createHitQueryRequest(ability, 0.28, {
  hitboxEventId: "blade",
  queryId: "arc-slash:frame-28",
  context: { attackerId: "player-1" }
});
const laterBinding = bindExternalHitResult(laterQuery, {
  requestSha256: laterQuery.receipt.sha256,
  hit: true,
  contacts: [externalHit.contacts[0]],
  source: {
    system: "example-collision-runtime",
    receipt: "collision-frame-28"
  }
});
const repeatedSample = createHitConsequenceRequests(laterBinding, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences,
  alreadyAppliedKeys
});
assert.equal(repeatedSample.requests.length, 0);
assert.equal(repeatedSample.suppressed.length, 2);
assert.ok(repeatedSample.suppressed.every(entry => entry.reason === "already-applied"));

const newAttackInstance = createHitConsequenceRequests(laterBinding, {
  actionInstanceId: "player-1:arc-slash:00043",
  consequences,
  alreadyAppliedKeys
});
assert.equal(newAttackInstance.requests.length, 2);

const missBinding = bindExternalHitResult(query, {
  requestSha256: query.receipt.sha256,
  hit: false,
  contacts: [],
  source: {
    system: "example-collision-runtime",
    receipt: "collision-frame-24-miss"
  }
});
const missBatch = createHitConsequenceRequests(missBinding, {
  actionInstanceId: "player-1:arc-slash:00044",
  consequences
});
assert.deepEqual(missBatch.requests, []);
assert.deepEqual(missBatch.suppressed, []);

const reorderedLedger = createHitConsequenceRequests(laterBinding, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences,
  alreadyAppliedKeys: [...alreadyAppliedKeys].reverse()
});
assert.equal(repeatedSample.receipt.sha256, reorderedLedger.receipt.sha256);

assert.throws(() => createHitConsequenceRequests({ ...binding, hit: false }, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences
}), /receipt mismatch/);
assert.throws(() => createHitConsequenceRequests(binding, {
  actionInstanceId: "",
  consequences
}), /actionInstanceId/);
assert.throws(() => createHitConsequenceRequests(binding, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences: []
}), /non-empty array/);
assert.throws(() => createHitConsequenceRequests(binding, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences: [{ id: "heal", type: "healing", payload: { amount: 10 } }]
}), /unknown hit consequence type/);
assert.throws(() => createHitConsequenceRequests(binding, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences: [
    { id: "same", type: "damage", payload: { amount: 1 } },
    { id: "same", type: "status", payload: { statusId: "x" } }
  ]
}), /must be unique/);
assert.throws(() => createHitConsequenceRequests(binding, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences,
  alreadyAppliedKeys: "not-an-array"
}), /alreadyAppliedKeys/);

const badContactBindingBody = {
  ...binding,
  contacts: [{ targetId: "enemy-7", contactId: "" }]
};
delete badContactBindingBody.receipt;
const badContactBinding = {
  ...badContactBindingBody,
  receipt: {
    sha256: (await import("../src/index.mjs")).digest(badContactBindingBody),
    deterministic: true
  }
};
assert.throws(() => createHitConsequenceRequests(badContactBinding, {
  actionInstanceId: "player-1:arc-slash:00042",
  consequences
}), /contactId/);

console.log("PASS hit consequence requests", batchA.receipt.sha256, repeatedSample.receipt.sha256);
