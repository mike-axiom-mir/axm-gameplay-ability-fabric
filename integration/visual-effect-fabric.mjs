import { compileTimeline } from "../src/index.mjs";

export const GAME_VFX_REQUEST_SCHEMA = "axm.game-vfx-request/v1";

export function emitGameVfxRequests(ability) {
  return compileTimeline(ability)
    .filter(event => event.type === "vfx")
    .map(event => {
      const spec = event.vfx ?? {};
      if (!spec.kind) throw new Error("VFX event " + event.id + " requires vfx.kind");
      return {
        schema: GAME_VFX_REQUEST_SCHEMA,
        id: ability.id + ":" + event.id,
        effectRef: spec.effectRef ?? event.ref?.effect ?? event.id,
        kind: spec.kind,
        time: event.time,
        duration: spec.duration ?? 0.25,
        seed: spec.seed ?? (ability.id + ":" + event.id),
        anchor: structuredClone(spec.anchor ?? { event: event.id }),
        parameters: structuredClone(spec.parameters ?? {})
      };
    });
}
