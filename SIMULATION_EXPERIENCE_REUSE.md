# Explore gameplay sequences before world execution

Status: proposed applications of an existing method; documentation only.
Inspected source: `a75843f907e57656e8893349b9f01a2631122a08`.

[Shared method and measured neural example](https://github.com/mike-axiom-mir/axm-state-research/blob/main/docs/SIMULATION_AS_REUSABLE_EXPERIENCE.md).

The [public API](src/api.mjs), [retiming](src/retimed-ability.mjs),
[hit consequences](src/hit-consequences.mjs) and
[runtime cue requests](src/runtime-cues.mjs) already form deterministic
boundaries suitable for repeatable trials.

## First useful experiment

Generate seeded action/timing sequences around startup, active and recovery
phases. Include exact cancellation endpoints, empty/large advance intervals,
cooldown/resource limits, replay, duplicate delivery and retimed abilities.
Compare with declared interval semantics: cancellation windows are half-open
and advance intervals are `(after, through]`.

Preserve a shortest failing sequence with ability identity, retiming parameters,
inputs, external receipts and dispatch keys. Compare the ordinary evaluator
with a simple independent boundary oracle where possible. Replay minimized
failures through the existing tests before retaining a repair.

## Keep world truth external

A simulated collision fixture can test receipt binding and consequence requests;
it cannot prove a hit in a real world. Actual collision results, cue execution
receipts and the caller-owned application ledger keep their existing owners.
Repeated evaluation must not silently apply damage or replay a cue.

Useful retained knowledge may be timing regressions, valid reusable ability
recipes or a separately tested policy. A future neural player is optional.
This note implements no simulator, player, collision engine or automatic
world-state mutation.
