# AXM Gameplay Ability Fabric

Standalone deterministic gameplay-ability authoring specialist for AXM.

## Purpose

Ability Fabric owns **what a game action does through time**. A single ability can coordinate animation, movement, hit volumes, projectiles, gameplay events, VFX, audio, camera impulses, physics requests, resources, interruption/cancel windows, and cooldowns without owning durable world truth.

Canonical outputs:

- `axm.game-ability-package/v1`
- `axm.game-ability-cancel-decision/v1`
- `axm.game-ability-hit-query/v1`
- `axm.game-ability-hit-result-binding/v1`
- `axm.game-ability-hit-consequence-batch/v1`
- `axm.game-ability-runtime-cue-request/v1`
- `axm.game-ability-runtime-cue-batch/v1`
- `axm.game-ability-runtime-cue-receipt-binding/v1`
- `axm.game-ability-retimed-timeline/v1`

The earlier donor contract `axm.ability-rules/v1` remains a provenance/input compatibility target.

## First executable body

- startup / active / recovery phases
- synchronized typed timeline tracks
- deterministic event ordering
- animation references
- hitbox/hurtbox requests
- VFX references
- audio cues
- camera impulses
- physics/world-change requests
- resource/cooldown declarations
- interval-based active hit/hurt windows
- target-aware interruption/cancel windows
- deterministic cancel decisions that emit bounded interruption requests
- active-hitbox collision query requests with deterministic receipts
- external collision hit/miss receipt binding without taking collision authority
- target-specific damage/status/world-change request batches from verified hits
- caller-owned application keys for duplicate-contact suppression across repeated samples
- deterministic audio/camera/physics runtime-cue requests over an explicit advancement interval
- stable per-action dispatch keys for replay/deduplication by external consumers
- external runtime receipt binding that preserves accepted/executed/rejected/cancelled status without claiming execution truth
- animation-transform-bound derivation of synchronized retimed phases, hit windows, cancel windows, and timeline cues
- explicit cooldown retiming policy (`preserve` by default, `scale` only when requested)
- exact replay receipts

Cancel windows use half-open timing (`start <= t < end`). A window may optionally declare `into: [abilityId, ...]` to restrict which follow-up abilities it authorizes. `createCancelDecision()` turns that authored policy into an inspectable deterministic decision and, when allowed, emits an `ability-interrupt` request containing the exact interruption time. Animation/VFX/audio runtimes remain responsible for realizing that request; Ability Fabric does not directly mutate them.

`createHitQueryRequest()` is only valid while the named authored hitbox is active. It emits the exact authored hitbox event plus caller context as a `collision-hit-query` request and marks Ability Fabric as **not** owning collision truth. An external collision/runtime system can return a hit or miss tied to the query receipt hash. `bindExternalHitResult()` verifies that binding, preserves the external source/receipt and contacts, and creates deterministic evidence without promoting the result into Ability-owned world truth. A mismatched or tampered query/result is rejected.

`createHitConsequenceRequests()` consumes only a verified hit-result binding. The caller supplies an explicit `actionInstanceId`, structured consequence specs (`damage`, `status`, or `world-change`), and optionally application keys it has already persisted. Each verified target/contact becomes a target-specific request tied to the hit-result receipt and collision-query hash. Duplicate contact+consequence pairs are suppressed within the batch, and repeated collision samples for the same action can be suppressed when the caller feeds prior application keys back in. Ability Fabric remains stateless here: it emits requests and application keys but does not persist the ledger or apply damage/status/world mutations.

`createRuntimeCueRequests()` turns authored `audio`, `camera`, and `physics` timeline events into explicit external runtime requests for one action instance. The advancement boundary is `(afterTime, throughTime]`; use `afterTime: null` for the initial slice so time-zero cues are included. This makes cancel cutoffs and incremental action advancement explicit without replaying the boundary event on the next slice. Each emitted cue receives a stable dispatch key derived from the action instance, authored ability/event identity, and authored payload, so an external consumer can own its own dispatch ledger during replay or rollback.

`bindExternalRuntimeCueReceipt()` verifies that an external receipt binds to the exact cue request receipt and dispatch key, then preserves the external system identity and its reported `accepted`, `executed`, `rejected`, or `cancelled` status. The binding is evidence plumbing only: Ability Fabric does not independently prove that an audio, camera, or physics runtime actually performed the effect it reported.

`deriveRetimedAbilityTimeline()` consumes an external `axm.animation-time-transform/v1` receipt and requires its source duration to match the authored ability duration. It derives a new ability identity whose in-action timing is uniformly mapped onto the retimed animation: phase edges, event times, event end-times, and cancel windows move together. The derivation carries the exact animation transform, source/derived ability hashes, and an inspectable timing map. Cooldown is deliberately not silently coupled to animation speed: `cooldownPolicy: "preserve"` is the default, while `"scale"` is an explicit gameplay decision. Ability Fabric validates the Animation timing evidence structurally but does not become the animation timing authority.

The package root resolves through `src/api.mjs`, which re-exports the original ability API, hit-consequence request builder, runtime-cue boundary, and retimed-gameplay timeline derivation.

## Donor provenance

The genesis implementation is informed by the experimental `gameplay-ability-rules-graph` in `mike-axiom-mir/axm-collaboration-platform`, observed at commit `c335244e9005df26c0edb99114164765addf6ed0`.

The donor proved bounded event/condition/action/cooldown/effect graphs. This repository extends that into a complete synchronized gameplay-action package. It has no runtime dependency on the Collaboration Platform.

## Run

```sh
npm test
node examples/ground-slam.mjs
```

## Truth boundary

Ability Fabric emits deterministic requests and evidence. It does not own durable world state, collision truth, collision-engine correctness, application-ledger persistence, damage application, status application, animation timing authority, audio/camera/physics runtime execution truth, runtime dispatch-ledger persistence, visual taste, balance, or game feel. A bound external hit result proves only that the supplied external receipt was structurally tied to the exact emitted query; it does not independently prove the external collision system was correct. A consequence batch proves only which requests and suppression keys were deterministically derived from supplied verified hit evidence and supplied consequence specs; the consuming game/world system still owns durable application and must decide/persist what was actually applied. A runtime-cue receipt binding proves only that supplied external evidence was structurally tied to the exact emitted cue request and dispatch key; it does not independently prove the external runtime performed the reported effect correctly or with acceptable quality. A retimed ability artifact proves only that authored in-action timings were deterministically derived from the supplied, receipt-valid Animation time transform under an explicit cooldown policy; it does not prove that the Animation transform came from a visually correct clip, that the resulting action is balanced, or that it feels good in a real game.
