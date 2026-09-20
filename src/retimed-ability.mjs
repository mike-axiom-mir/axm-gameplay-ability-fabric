import { digest, validateAbility } from "./index.mjs";

export const ANIMATION_TIME_TRANSFORM_SCHEMA = "axm.animation-time-transform/v1";
export const RETIMED_ABILITY_SCHEMA = "axm.game-ability-retimed-timeline/v1";

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(label + " must be finite");
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(label + " must be a non-empty string");
}

function animationTransformBody(transform) {
  return {
    schema: transform.schema,
    sourceClip: transform.sourceClip,
    sourceSha256: transform.sourceSha256,
    outputClip: transform.outputClip,
    outputSha256: transform.outputSha256,
    sourceDuration: transform.sourceDuration,
    outputDuration: transform.outputDuration,
    rate: transform.rate,
    timeScale: transform.timeScale
  };
}

export function validateAnimationTimeTransform(transform) {
  if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
    throw new Error("animation time transform required");
  }
  if (transform.schema !== ANIMATION_TIME_TRANSFORM_SCHEMA) {
    throw new Error("unsupported animation time transform schema");
  }
  nonEmptyString(transform.sourceClip, "animation transform sourceClip");
  nonEmptyString(transform.sourceSha256, "animation transform sourceSha256");
  nonEmptyString(transform.outputClip, "animation transform outputClip");
  nonEmptyString(transform.outputSha256, "animation transform outputSha256");
  finite(transform.sourceDuration, "animation transform sourceDuration");
  finite(transform.outputDuration, "animation transform outputDuration");
  finite(transform.rate, "animation transform rate");
  finite(transform.timeScale, "animation transform timeScale");
  if (transform.sourceDuration <= 0 || transform.outputDuration <= 0) {
    throw new Error("animation transform durations must be > 0");
  }
  if (transform.rate <= 0 || transform.timeScale <= 0) {
    throw new Error("animation transform rate and timeScale must be > 0");
  }
  if (transform.timeScale !== 1 / transform.rate) {
    throw new Error("animation transform rate/scale mismatch");
  }
  if (transform.outputDuration !== transform.sourceDuration * transform.timeScale) {
    throw new Error("animation transform duration mismatch");
  }
  if (!transform.receipt || typeof transform.receipt.sha256 !== "string") {
    throw new Error("animation transform receipt required");
  }
  if (digest(animationTransformBody(transform)) !== transform.receipt.sha256) {
    throw new Error("animation transform receipt mismatch");
  }
  return true;
}

function scaleTime(value, transform) {
  return value * transform.timeScale;
}

function mapAbilityTiming(ability, transform) {
  return {
    phases: (ability.phases || []).map(phase => ({
      id: phase.id ?? null,
      sourceStart: phase.start,
      sourceEnd: phase.end,
      outputStart: scaleTime(phase.start, transform),
      outputEnd: scaleTime(phase.end, transform)
    })),
    cancelWindows: (ability.cancelWindows || []).map(window => ({
      id: window.id ?? null,
      sourceStart: window.start,
      sourceEnd: window.end,
      outputStart: scaleTime(window.start, transform),
      outputEnd: scaleTime(window.end, transform)
    })),
    events: (ability.tracks || []).flatMap(track => (track.events || []).map(event => ({
      trackId: track.id,
      trackType: track.type,
      eventId: event.id,
      sourceTime: event.time,
      outputTime: scaleTime(event.time, transform),
      ...(event.endTime == null ? {} : {
        sourceEndTime: event.endTime,
        outputEndTime: scaleTime(event.endTime, transform)
      })
    })))
  };
}

function deriveAbility(ability, transform, { id, cooldownPolicy }) {
  const derived = structuredClone(ability);
  derived.id = id;
  derived.duration = transform.outputDuration;
  derived.phases = (ability.phases || []).map(phase => ({
    ...structuredClone(phase),
    start: scaleTime(phase.start, transform),
    end: scaleTime(phase.end, transform)
  }));
  derived.cancelWindows = (ability.cancelWindows || []).map(window => ({
    ...structuredClone(window),
    start: scaleTime(window.start, transform),
    end: scaleTime(window.end, transform)
  }));
  derived.tracks = (ability.tracks || []).map(track => ({
    ...structuredClone(track),
    events: (track.events || []).map(event => ({
      ...structuredClone(event),
      time: scaleTime(event.time, transform),
      ...(event.endTime == null ? {} : { endTime: scaleTime(event.endTime, transform) })
    }))
  }));
  if (ability.cooldown != null && cooldownPolicy === "scale") {
    derived.cooldown = scaleTime(ability.cooldown, transform);
  }
  validateAbility(derived);
  return derived;
}

export function deriveRetimedAbilityTimeline(ability, animationTransform, {
  id,
  cooldownPolicy = "preserve"
} = {}) {
  validateAbility(ability);
  validateAnimationTimeTransform(animationTransform);
  nonEmptyString(id, "derived ability id");
  if (id === ability.id) throw new Error("derived ability id must differ from source ability id");
  if (!new Set(["preserve", "scale"]).has(cooldownPolicy)) {
    throw new Error("cooldownPolicy must be preserve or scale");
  }
  if (ability.duration !== animationTransform.sourceDuration) {
    throw new Error("ability duration must match animation transform source duration");
  }

  const derivedAbility = deriveAbility(ability, animationTransform, { id, cooldownPolicy });
  const body = {
    schema: RETIMED_ABILITY_SCHEMA,
    sourceAbilityId: ability.id,
    sourceAbilitySha256: digest(ability),
    derivedAbilityId: derivedAbility.id,
    derivedAbilitySha256: digest(derivedAbility),
    animationTransform: structuredClone(animationTransform),
    policy: {
      inActionTiming: "scale-uniformly",
      cooldown: cooldownPolicy
    },
    timingMap: mapAbilityTiming(ability, animationTransform),
    ability: derivedAbility,
    authority: {
      consumesExternalAnimationTimingEvidence: true,
      animationTimingOwner: false,
      durableWorldStateOwner: false,
      balanceAuthority: false
    }
  };

  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      sourceAbilityBound: true,
      animationTransformBound: true,
      derivedAbilityBound: true
    }
  };
}

export function validateRetimedAbilityTimeline(artifact, { sourceAbility = null } = {}) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("retimed ability artifact required");
  }
  if (artifact.schema !== RETIMED_ABILITY_SCHEMA) throw new Error("unsupported retimed ability schema");
  validateAnimationTimeTransform(artifact.animationTransform);
  validateAbility(artifact.ability);
  if (artifact.derivedAbilityId !== artifact.ability.id) throw new Error("derived ability id mismatch");
  if (artifact.derivedAbilitySha256 !== digest(artifact.ability)) throw new Error("derived ability hash mismatch");
  if (!artifact.receipt || typeof artifact.receipt.sha256 !== "string") throw new Error("retimed ability receipt required");
  const { receipt, ...body } = artifact;
  if (digest(body) !== receipt.sha256) throw new Error("retimed ability receipt mismatch");

  if (sourceAbility != null) {
    validateAbility(sourceAbility);
    if (sourceAbility.id !== artifact.sourceAbilityId) throw new Error("source ability id mismatch");
    if (digest(sourceAbility) !== artifact.sourceAbilitySha256) throw new Error("source ability hash mismatch");
    if (sourceAbility.duration !== artifact.animationTransform.sourceDuration) {
      throw new Error("source ability duration mismatch");
    }
  }
  return true;
}
