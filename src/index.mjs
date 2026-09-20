import { createHash } from "node:crypto";

export const SCHEMA = "axm.game-ability-package/v1";
export const CANCEL_DECISION_SCHEMA = "axm.game-ability-cancel-decision/v1";
export const HIT_QUERY_SCHEMA = "axm.game-ability-hit-query/v1";
export const HIT_RESULT_BINDING_SCHEMA = "axm.game-ability-hit-result-binding/v1";

export const TRACK_TYPES = Object.freeze([
  "animation",
  "movement",
  "hitbox",
  "hurtbox",
  "projectile",
  "gameplay",
  "status",
  "vfx",
  "audio",
  "camera",
  "physics"
]);

function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function finite(n, label) {
  if (!Number.isFinite(n)) throw new Error(label + " must be finite");
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(label + " must be a non-empty string");
}

function normalizeTypes(types) {
  if (types == null) return null;
  const list = Array.isArray(types) ? types : [types];
  for (const type of list) {
    if (!TRACK_TYPES.includes(type)) throw new Error("unknown track type: " + type);
  }
  return new Set(list);
}

export function validateAbility(ability) {
  if (!ability?.id) throw new Error("ability.id required");
  finite(ability.duration, "ability.duration");
  if (ability.duration <= 0) throw new Error("ability.duration must be > 0");

  let phaseEnd = 0;
  for (const phase of ability.phases || []) {
    finite(phase.start, "phase.start");
    finite(phase.end, "phase.end");
    if (phase.start < phaseEnd || phase.end <= phase.start || phase.end > ability.duration) {
      throw new Error("invalid or overlapping phase: " + phase.id);
    }
    phaseEnd = phase.end;
  }

  for (const track of ability.tracks || []) {
    if (!track.id) throw new Error("track.id required");
    if (!TRACK_TYPES.includes(track.type)) throw new Error("unknown track type: " + track.type);
    let previous = -Infinity;
    for (const event of track.events || []) {
      finite(event.time, "event.time");
      if (!event.id) throw new Error("event.id required");
      if (event.time < 0 || event.time > ability.duration || event.time < previous) {
        throw new Error("events must be ordered and inside ability");
      }
      if (event.endTime != null) {
        finite(event.endTime, "event.endTime");
        if (event.endTime <= event.time || event.endTime > ability.duration) {
          throw new Error("event.endTime must be after event.time and inside ability");
        }
      }
      previous = event.time;
    }
  }

  if (ability.cooldown != null) {
    finite(ability.cooldown, "ability.cooldown");
    if (ability.cooldown < 0) throw new Error("ability.cooldown cannot be negative");
  }

  for (const window of ability.cancelWindows || []) {
    finite(window.start, "cancel.start");
    finite(window.end, "cancel.end");
    if (window.start < 0 || window.end <= window.start || window.end > ability.duration) {
      throw new Error("invalid cancel window");
    }
    if (window.into != null) {
      if (!Array.isArray(window.into) || window.into.length === 0 || window.into.some(id => typeof id !== "string" || id.length === 0)) {
        throw new Error("cancel.into must be a non-empty array of ability ids");
      }
    }
  }

  return true;
}

export function compileTimeline(ability) {
  validateAbility(ability);
  return (ability.tracks || [])
    .flatMap((track, trackIndex) => (track.events || []).map((event, eventIndex) => ({
      ...structuredClone(event),
      track: track.id,
      type: track.type,
      __trackIndex: trackIndex,
      __eventIndex: eventIndex
    })))
    .sort((a, b) => a.time - b.time || a.__trackIndex - b.__trackIndex || a.__eventIndex - b.__eventIndex)
    .map(({ __trackIndex, __eventIndex, ...event }) => event);
}

export function compileWindowEdges(ability, { types = null } = {}) {
  const allowed = normalizeTypes(types);
  const edges = compileTimeline(ability)
    .filter(event => event.endTime != null && (!allowed || allowed.has(event.type)))
    .flatMap((event, eventOrder) => [
      { time: event.time, edge: "open", id: event.id, track: event.track, type: event.type, __eventOrder: eventOrder },
      { time: event.endTime, edge: "close", id: event.id, track: event.track, type: event.type, __eventOrder: eventOrder }
    ]);
  const rank = { close: 0, open: 1 };
  return edges
    .sort((a, b) => a.time - b.time || rank[a.edge] - rank[b.edge] || a.__eventOrder - b.__eventOrder)
    .map(({ __eventOrder, ...edge }) => edge);
}

export function activeWindowEventsAt(ability, time, { types = null } = {}) {
  validateAbility(ability);
  finite(time, "time");
  const allowed = normalizeTypes(types);
  const t = Math.max(0, Math.min(ability.duration, time));
  return compileTimeline(ability).filter(event =>
    event.endTime != null &&
    event.time <= t &&
    t < event.endTime &&
    (!allowed || allowed.has(event.type))
  );
}

export function activeCancelWindowsAt(ability, time) {
  validateAbility(ability);
  finite(time, "time");
  if (time < 0 || time > ability.duration) return [];
  return (ability.cancelWindows || [])
    .filter(window => window.start <= time && time < window.end)
    .map(window => structuredClone(window));
}

export function createCancelDecision(ability, time, { targetAbilityId = null } = {}) {
  validateAbility(ability);
  finite(time, "time");
  if (targetAbilityId != null && (typeof targetAbilityId !== "string" || targetAbilityId.length === 0)) {
    throw new Error("targetAbilityId must be a non-empty string or null");
  }

  const activeWindows = activeCancelWindowsAt(ability, time);
  const eligibleWindows = activeWindows.filter(window =>
    window.into == null || (targetAbilityId != null && window.into.includes(targetAbilityId))
  );

  let reason = "cancel-window-open";
  if (time < 0 || time > ability.duration) reason = "outside-ability";
  else if (activeWindows.length === 0) reason = "outside-cancel-window";
  else if (eligibleWindows.length === 0 && targetAbilityId == null && activeWindows.some(window => window.into != null)) reason = "target-required";
  else if (eligibleWindows.length === 0) reason = "target-not-allowed";

  const selected = eligibleWindows[0] || null;
  const allowed = selected != null;
  const body = {
    schema: CANCEL_DECISION_SCHEMA,
    abilityId: ability.id,
    time,
    targetAbilityId,
    allowed,
    reason: allowed ? "cancel-window-open" : reason,
    windowId: selected?.id ?? null,
    activeWindowIds: activeWindows.map(window => window.id ?? null),
    request: allowed ? {
      type: "ability-interrupt",
      abilityId: ability.id,
      interruptAt: time,
      nextAbilityId: targetAbilityId
    } : null,
    authority: {
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
}

export function createHitQueryRequest(ability, time, { hitboxEventId, queryId = null, context = {} } = {}) {
  validateAbility(ability);
  finite(time, "time");
  nonEmptyString(hitboxEventId, "hitboxEventId");
  if (queryId != null) nonEmptyString(queryId, "queryId");
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("context must be an object");
  if (time < 0 || time > ability.duration) throw new Error("query time must be inside ability");

  const activeHitbox = activeWindowEventsAt(ability, time, { types: "hitbox" })
    .find(event => event.id === hitboxEventId);
  if (!activeHitbox) throw new Error("hitbox is not active at query time: " + hitboxEventId);

  const resolvedQueryId = queryId ?? `${ability.id}:${hitboxEventId}:${time}`;
  const body = {
    schema: HIT_QUERY_SCHEMA,
    queryId: resolvedQueryId,
    abilityId: ability.id,
    time,
    hitboxEventId,
    request: {
      type: "collision-hit-query",
      queryId: resolvedQueryId,
      abilityId: ability.id,
      sampleTime: time,
      hitboxEvent: structuredClone(activeHitbox),
      context: structuredClone(context)
    },
    authority: {
      collisionTruthOwner: false,
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
}

export function bindExternalHitResult(query, externalResult) {
  if (!query || query.schema !== HIT_QUERY_SCHEMA) throw new Error("valid hit query required");
  if (!query.receipt || typeof query.receipt.sha256 !== "string") throw new Error("hit query receipt required");
  const { receipt: queryReceipt, ...queryBody } = query;
  if (digest(queryBody) !== queryReceipt.sha256) throw new Error("hit query receipt mismatch");

  if (!externalResult || typeof externalResult !== "object" || Array.isArray(externalResult)) {
    throw new Error("externalResult must be an object");
  }
  nonEmptyString(externalResult.requestSha256, "externalResult.requestSha256");
  if (externalResult.requestSha256 !== queryReceipt.sha256) throw new Error("external result does not bind to hit query");
  if (typeof externalResult.hit !== "boolean") throw new Error("externalResult.hit must be boolean");
  if (externalResult.contacts != null && !Array.isArray(externalResult.contacts)) throw new Error("externalResult.contacts must be an array when present");
  if (!externalResult.source || typeof externalResult.source !== "object" || Array.isArray(externalResult.source)) {
    throw new Error("externalResult.source must be an object");
  }
  nonEmptyString(externalResult.source.system, "externalResult.source.system");
  if (externalResult.source.receipt != null && typeof externalResult.source.receipt !== "string") {
    throw new Error("externalResult.source.receipt must be a string when present");
  }

  const external = {
    requestSha256: externalResult.requestSha256,
    hit: externalResult.hit,
    contacts: structuredClone(externalResult.contacts ?? []),
    source: {
      system: externalResult.source.system,
      receipt: externalResult.source.receipt ?? null
    }
  };
  const body = {
    schema: HIT_RESULT_BINDING_SCHEMA,
    queryId: query.queryId,
    abilityId: query.abilityId,
    hitboxEventId: query.hitboxEventId,
    sampleTime: query.time,
    querySha256: queryReceipt.sha256,
    hit: external.hit,
    contacts: structuredClone(external.contacts),
    external,
    authority: {
      collisionTruthOwner: false,
      durableWorldStateOwner: false,
      consumesExternalCollisionReceipt: true
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

export function phaseAt(ability, time) {
  validateAbility(ability);
  finite(time, "time");
  const t = Math.max(0, Math.min(ability.duration, time));
  return (ability.phases || []).filter(p => t >= p.start && t < p.end).map(p => p.id);
}

export function eventsBetween(ability, from, to) {
  finite(from, "from");
  finite(to, "to");
  if (to < from) throw new Error("to must be >= from");
  return compileTimeline(ability).filter(event => event.time > from && event.time <= to);
}

export function createAbilityPackage(ability, metadata = {}) {
  validateAbility(ability);
  const body = {
    schema: SCHEMA,
    ability: structuredClone(ability),
    timeline: compileTimeline(ability),
    metadata: structuredClone(metadata),
    authority: {
      durableWorldStateOwner: false,
      emitsRequestsOnly: true
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
