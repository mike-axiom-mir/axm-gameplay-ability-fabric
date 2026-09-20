# AXM Gameplay Ability Fabric

Standalone deterministic gameplay-ability authoring specialist for AXM.

## Purpose

Ability Fabric owns **what a game action does through time**. A single ability can coordinate animation, movement, hit volumes, projectiles, gameplay events, VFX, audio, camera impulses, physics requests, resources, interruption/cancel windows, and cooldowns without owning durable world truth.

Canonical output:

- `axm.game-ability-package/v1`

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
- interrupt and cancel windows
- exact replay receipts

## Donor provenance

The genesis implementation is informed by the experimental `gameplay-ability-rules-graph` in `mike-axiom-mir/axm-collaboration-platform`, observed at commit `c335244e9005df26c0edb99114164765addf6ed0`.

The donor proved bounded event/condition/action/cooldown/effect graphs. This repository extends that into a complete synchronized gameplay-action package. It has no runtime dependency on the Collaboration Platform.

## Run

```sh
npm test
node examples/ground-slam.mjs
```

## Truth boundary

Ability Fabric emits deterministic requests and evidence. It does not own durable world state, decide visual taste, prove balance, or claim that an ability feels good merely because the event graph is valid.
