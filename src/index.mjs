import { createHash } from "node:crypto";

export const SCHEMA = "axm.game-ability-package/v1";

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
  }

  return true;
}

export function compileTimeline(ability) {
  validateAbility(ability);
  return (ability.tracks || [])
    .flatMap(track => (track.events || []).map(event => ({
      ...structuredClone(event),
      track: track.id,
      type: track.type
    })))
    .sort((a, b) => a.time - b.time || a.track.localeCompare(b.track) || a.id.localeCompare(b.id));
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
