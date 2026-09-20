# AXM Gameplay Ability Fabric

Standalone deterministic gameplay-ability authoring specialist for AXM.

## Purpose

Ability Fabric owns **what a game action does through time**. A single ability can coordinate animation, movement, hit volumes, projectiles, gameplay events, VFX, audio, camera impulses, physics requests, resources, interruption/cancel windows, and cooldowns without owning durable world truth.

Canonical outputs:

- `axm.game-ability-package/v1`
- `axm.game-ability-cancel-decision/v1`
- `axm.game-ability-hit-query/v1`
- `axm.game-ability-hit-result-binding/v1`

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
- exact replay receipts

Cancel windows use half-open timing (`start <= t < end`). A window may optionally declare `into: [abilityId, ...]` to restrict which follow-up abilities it authorizes. `createCancelDecision()` turns that authored policy into an inspectable deterministic decision and, when allowed, emits an `ability-interrupt` request containing the exact interruption time. Animation/VFX/audio runtimes remain responsible for realizing that request; Ability Fabric does not directly mutate them.

`createHitQueryRequest()` is only valid while the named authored hitbox is active. It emits the exact authored hitbox event plus caller context as a `collision-hit-query` request and marks Ability Fabric as **not** owning collision truth. An external collision/runtime system can return a hit or miss tied to the query receipt hash. `bindExternalHitResult()` verifies that binding, preserves the external source/receipt and contacts, and creates deterministic evidence without promoting the result into Ability-owned world truth. A mismatched or tampered query/result is rejected.

## Donor provenance

The genesis implementation is informed by the experimental `gameplay-ability-rules-graph` in `mike-axiom-mir/axm-collaboration-platform`, observed at commit `c335244e9005df26c0edb99114164765addf6ed0`.

The donor proved bounded event/condition/action/cooldown/effect graphs. This repository extends that into a complete synchronized gameplay-action package. It has no runtime dependency on the Collaboration Platform.

## Run

```sh
npm test
node examples/ground-slam.mjs
```

## Truth boundary

Ability Fabric emits deterministic requests and evidence. It does not own durable world state, collision truth, collision-engine correctness, damage application, visual taste, balance, or game feel. A bound external hit result proves only that the supplied external receipt was structurally tied to the exact emitted query; it does not independently prove the external collision system was correct.
