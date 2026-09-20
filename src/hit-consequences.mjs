import { digest, HIT_RESULT_BINDING_SCHEMA } from "./index.mjs";

export const HIT_CONSEQUENCE_BATCH_SCHEMA = "axm.game-ability-hit-consequence-batch/v1";
export const HIT_CONSEQUENCE_APPLICATION_KEY_SCHEMA = "axm.game-ability-hit-consequence-application-key/v1";

export const HIT_CONSEQUENCE_TYPES = Object.freeze([
  "damage",
  "status",
  "world-change"
]);

const REQUEST_TYPE_BY_CONSEQUENCE = Object.freeze({
  damage: "world-damage-request",
  status: "world-status-request",
  "world-change": "world-change-request"
});

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(label + " must be a non-empty string");
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
}

function validateHitBinding(binding) {
  if (!binding || binding.schema !== HIT_RESULT_BINDING_SCHEMA) {
    throw new Error("valid hit-result binding required");
  }
  if (!binding.receipt || typeof binding.receipt.sha256 !== "string") {
    throw new Error("hit-result binding receipt required");
  }

  const { receipt, ...body } = binding;
  if (digest(body) !== receipt.sha256) {
    throw new Error("hit-result binding receipt mismatch");
  }
  if (typeof binding.hit !== "boolean") {
    throw new Error("hit-result binding hit flag must be boolean");
  }
  if (!Array.isArray(binding.contacts)) {
    throw new Error("hit-result binding contacts must be an array");
  }
}

function normalizeConsequence(spec, index) {
  plainObject(spec, `consequences[${index}]`);
  nonEmptyString(spec.id, `consequences[${index}].id`);
  if (!HIT_CONSEQUENCE_TYPES.includes(spec.type)) {
    throw new Error(`unknown hit consequence type: ${spec.type}`);
  }
  plainObject(spec.payload, `consequences[${index}].payload`);
  return {
    id: spec.id,
    type: spec.type,
    payload: structuredClone(spec.payload)
  };
}

function validateUniqueConsequenceIds(consequences) {
  const ids = new Set();
  for (const consequence of consequences) {
    if (ids.has(consequence.id)) {
      throw new Error("consequence ids must be unique: " + consequence.id);
    }
    ids.add(consequence.id);
  }
}

function normalizeAlreadyAppliedKeys(keys) {
  if (!Array.isArray(keys)) throw new Error("alreadyAppliedKeys must be an array");
  return keys.map((key, index) => {
    nonEmptyString(key, `alreadyAppliedKeys[${index}]`);
    return key;
  });
}

function normalizeContact(contact, index) {
  plainObject(contact, `contacts[${index}]`);
  nonEmptyString(contact.targetId, `contacts[${index}].targetId`);
  nonEmptyString(contact.contactId, `contacts[${index}].contactId`);
  return structuredClone(contact);
}

function createApplicationKey(binding, actionInstanceId, contact, consequence) {
  const keyBody = {
    schema: HIT_CONSEQUENCE_APPLICATION_KEY_SCHEMA,
    actionInstanceId,
    abilityId: binding.abilityId,
    hitboxEventId: binding.hitboxEventId,
    targetId: contact.targetId,
    contactId: contact.contactId,
    consequenceId: consequence.id
  };
  return digest(keyBody);
}

export function createHitConsequenceRequests(binding, {
  actionInstanceId,
  consequences,
  alreadyAppliedKeys = []
} = {}) {
  validateHitBinding(binding);
  nonEmptyString(actionInstanceId, "actionInstanceId");
  if (!Array.isArray(consequences) || consequences.length === 0) {
    throw new Error("consequences must be a non-empty array");
  }

  const normalizedConsequences = consequences.map(normalizeConsequence);
  validateUniqueConsequenceIds(normalizedConsequences);
  const priorKeys = new Set(normalizeAlreadyAppliedKeys(alreadyAppliedKeys));
  const seenKeys = new Set(priorKeys);
  const requests = [];
  const suppressed = [];

  if (binding.hit) {
    for (let contactIndex = 0; contactIndex < binding.contacts.length; contactIndex += 1) {
      const contact = normalizeContact(binding.contacts[contactIndex], contactIndex);
      for (const consequence of normalizedConsequences) {
        const applicationKey = createApplicationKey(binding, actionInstanceId, contact, consequence);
        if (seenKeys.has(applicationKey)) {
          suppressed.push({
            applicationKey,
            targetId: contact.targetId,
            contactId: contact.contactId,
            consequenceId: consequence.id,
            reason: priorKeys.has(applicationKey) ? "already-applied" : "duplicate-contact-consequence"
          });
          continue;
        }

        seenKeys.add(applicationKey);
        requests.push({
          type: REQUEST_TYPE_BY_CONSEQUENCE[consequence.type],
          applicationKey,
          actionInstanceId,
          abilityId: binding.abilityId,
          hitboxEventId: binding.hitboxEventId,
          targetId: contact.targetId,
          contactId: contact.contactId,
          contact,
          consequence: structuredClone(consequence),
          source: {
            hitResultBindingSha256: binding.receipt.sha256,
            collisionQuerySha256: binding.querySha256,
            externalCollisionSource: structuredClone(binding.external?.source ?? null)
          }
        });
      }
    }
  }

  const body = {
    schema: HIT_CONSEQUENCE_BATCH_SCHEMA,
    actionInstanceId,
    abilityId: binding.abilityId,
    hitboxEventId: binding.hitboxEventId,
    hitResultBindingSha256: binding.receipt.sha256,
    collisionQuerySha256: binding.querySha256,
    consequences: normalizedConsequences,
    alreadyAppliedKeys: [...priorKeys].sort(),
    requests,
    suppressed,
    authority: {
      durableWorldStateOwner: false,
      collisionTruthOwner: false,
      applicationLedgerOwner: false,
      emitsRequestsOnly: true,
      callerMustPersistAppliedKeys: true
    }
  };

  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true
    }
  };
}
