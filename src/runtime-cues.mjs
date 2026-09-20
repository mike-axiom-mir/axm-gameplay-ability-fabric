import { compileTimeline, digest, validateAbility } from "./index.mjs";

export const RUNTIME_CUE_REQUEST_SCHEMA = "axm.game-ability-runtime-cue-request/v1";
export const RUNTIME_CUE_BATCH_SCHEMA = "axm.game-ability-runtime-cue-batch/v1";
export const RUNTIME_CUE_RECEIPT_BINDING_SCHEMA = "axm.game-ability-runtime-cue-receipt-binding/v1";
export const RUNTIME_CUE_DISPATCH_KEY_SCHEMA = "axm.game-ability-runtime-cue-dispatch-key/v1";

export const RUNTIME_CUE_TYPES = Object.freeze([
  "audio",
  "camera",
  "physics"
]);

const REQUEST_TYPE_BY_CUE = Object.freeze({
  audio: "audio-cue-request",
  camera: "camera-cue-request",
  physics: "physics-cue-request"
});

const EXTERNAL_STATUSES = Object.freeze([
  "accepted",
  "executed",
  "rejected",
  "cancelled"
]);

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(label + " must be finite");
}

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

function normalizeCueTypes(types) {
  const requested = types == null ? RUNTIME_CUE_TYPES : (Array.isArray(types) ? types : [types]);
  if (requested.length === 0) throw new Error("types must include at least one runtime cue type");
  for (const type of requested) {
    if (!RUNTIME_CUE_TYPES.includes(type)) throw new Error("unknown runtime cue type: " + type);
  }
  const selected = new Set(requested);
  return RUNTIME_CUE_TYPES.filter(type => selected.has(type));
}

function validateRuntimeCueRequest(request) {
  if (!request || request.schema !== RUNTIME_CUE_REQUEST_SCHEMA) {
    throw new Error("valid runtime cue request required");
  }
  if (!request.receipt || typeof request.receipt.sha256 !== "string") {
    throw new Error("runtime cue request receipt required");
  }
  const { receipt, ...body } = request;
  if (digest(body) !== receipt.sha256) {
    throw new Error("runtime cue request receipt mismatch");
  }
  if (!RUNTIME_CUE_TYPES.includes(request.cueType)) {
    throw new Error("runtime cue request has unknown cue type");
  }
  nonEmptyString(request.dispatchKey, "request.dispatchKey");
  nonEmptyString(request.actionInstanceId, "request.actionInstanceId");
  nonEmptyString(request.abilityId, "request.abilityId");
  nonEmptyString(request.trackId, "request.trackId");
  nonEmptyString(request.eventId, "request.eventId");
  finite(request.eventTime, "request.eventTime");
}

function createDispatchKey(ability, actionInstanceId, event) {
  return digest({
    schema: RUNTIME_CUE_DISPATCH_KEY_SCHEMA,
    actionInstanceId,
    abilityId: ability.id,
    abilitySha256: digest(ability),
    cueType: event.type,
    trackId: event.track,
    eventId: event.id,
    eventTime: event.time,
    eventSha256: digest(event)
  });
}

export function createRuntimeCueRequests(ability, {
  actionInstanceId,
  afterTime = null,
  throughTime,
  types = null,
  context = {}
} = {}) {
  validateAbility(ability);
  nonEmptyString(actionInstanceId, "actionInstanceId");
  finite(throughTime, "throughTime");
  if (throughTime < 0 || throughTime > ability.duration) {
    throw new Error("throughTime must be inside ability");
  }
  if (afterTime != null) {
    finite(afterTime, "afterTime");
    if (afterTime < 0 || afterTime > ability.duration) throw new Error("afterTime must be inside ability");
    if (afterTime > throughTime) throw new Error("afterTime must be <= throughTime");
  }
  plainObject(context, "context");

  const cueTypes = normalizeCueTypes(types);
  const allowed = new Set(cueTypes);
  const timelineEvents = compileTimeline(ability).filter(event =>
    allowed.has(event.type) &&
    event.time <= throughTime &&
    (afterTime == null || event.time > afterTime)
  );

  const requests = timelineEvents.map(event => {
    const dispatchKey = createDispatchKey(ability, actionInstanceId, event);
    const body = {
      schema: RUNTIME_CUE_REQUEST_SCHEMA,
      type: REQUEST_TYPE_BY_CUE[event.type],
      cueType: event.type,
      dispatchKey,
      actionInstanceId,
      abilityId: ability.id,
      trackId: event.track,
      eventId: event.id,
      eventTime: event.time,
      event: structuredClone(event),
      context: structuredClone(context),
      authority: {
        externalRuntimeTruthOwner: false,
        durableWorldStateOwner: false,
        emitsRequestOnly: true
      }
    };
    return {
      ...body,
      receipt: {
        sha256: digest(body),
        deterministic: true
      }
    };
  });

  const body = {
    schema: RUNTIME_CUE_BATCH_SCHEMA,
    actionInstanceId,
    abilityId: ability.id,
    abilitySha256: digest(ability),
    afterTime,
    throughTime,
    cueTypes,
    context: structuredClone(context),
    requests,
    authority: {
      externalRuntimeTruthOwner: false,
      durableWorldStateOwner: false,
      emitsRequestsOnly: true,
      consumerOwnsDispatchLedger: true
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

export function bindExternalRuntimeCueReceipt(request, externalReceipt) {
  validateRuntimeCueRequest(request);
  plainObject(externalReceipt, "externalReceipt");
  nonEmptyString(externalReceipt.requestSha256, "externalReceipt.requestSha256");
  if (externalReceipt.requestSha256 !== request.receipt.sha256) {
    throw new Error("external runtime receipt does not bind to cue request");
  }
  nonEmptyString(externalReceipt.dispatchKey, "externalReceipt.dispatchKey");
  if (externalReceipt.dispatchKey !== request.dispatchKey) {
    throw new Error("external runtime receipt dispatch key mismatch");
  }
  if (!EXTERNAL_STATUSES.includes(externalReceipt.status)) {
    throw new Error("external runtime receipt has invalid status");
  }
  plainObject(externalReceipt.source, "externalReceipt.source");
  nonEmptyString(externalReceipt.source.system, "externalReceipt.source.system");
  if (externalReceipt.source.receipt != null && typeof externalReceipt.source.receipt !== "string") {
    throw new Error("externalReceipt.source.receipt must be a string when present");
  }
  if (externalReceipt.details != null) plainObject(externalReceipt.details, "externalReceipt.details");

  const external = {
    requestSha256: externalReceipt.requestSha256,
    dispatchKey: externalReceipt.dispatchKey,
    status: externalReceipt.status,
    source: {
      system: externalReceipt.source.system,
      receipt: externalReceipt.source.receipt ?? null
    },
    details: structuredClone(externalReceipt.details ?? {})
  };

  const body = {
    schema: RUNTIME_CUE_RECEIPT_BINDING_SCHEMA,
    cueType: request.cueType,
    actionInstanceId: request.actionInstanceId,
    abilityId: request.abilityId,
    trackId: request.trackId,
    eventId: request.eventId,
    eventTime: request.eventTime,
    dispatchKey: request.dispatchKey,
    requestSha256: request.receipt.sha256,
    external,
    authority: {
      externalRuntimeTruthOwner: false,
      durableWorldStateOwner: false,
      consumesExternalRuntimeReceipt: true
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
