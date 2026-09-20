import assert from "node:assert/strict";
import { emitGameVfxRequests } from "../integration/visual-effect-fabric.mjs";

const ability={
  id:"slam",
  duration:1,
  phases:[{id:"active",start:0,end:1}],
  tracks:[{
    id:"effects",
    type:"vfx",
    events:[{
      id:"impact",
      time:0.3,
      ref:{fabric:"axm-visual-effect-fabric",effect:"ground-impact"},
      vfx:{
        kind:"particle-burst",
        duration:0.5,
        anchor:{event:"hit"},
        parameters:{count:40,speed:6}
      }
    },{
      id:"recovery-dust",
      time:0.7,
      ref:{fabric:"axm-visual-effect-fabric",effect:"recovery-dust"},
      vfx:{
        kind:"particle-emitter",
        duration:0.4,
        anchor:{event:"feet"},
        parameters:{rate:12,speed:1.5}
      }
    }]
  }]
};

const requests=emitGameVfxRequests(ability);
assert.equal(requests.length,2);
assert.equal(requests[0].schema,"axm.game-vfx-request/v1");
assert.equal(requests[0].effectRef,"ground-impact");
assert.equal(requests[0].kind,"particle-burst");
assert.equal(requests[0].parameters.count,40);

const cancelledBeforeImpact=emitGameVfxRequests(ability,{throughTime:0.2});
assert.deepEqual(cancelledBeforeImpact,[]);

const cancelledOnImpactBoundary=emitGameVfxRequests(ability,{throughTime:0.3});
assert.equal(cancelledOnImpactBoundary.length,1);
assert.equal(cancelledOnImpactBoundary[0].id,"slam:impact");

const cancelledBeforeRecoveryDust=emitGameVfxRequests(ability,{throughTime:0.6});
assert.equal(cancelledBeforeRecoveryDust.length,1);
assert.equal(cancelledBeforeRecoveryDust[0].id,"slam:impact");

assert.throws(() => emitGameVfxRequests(ability,{throughTime:Number.POSITIVE_INFINITY}),/throughTime must be finite/);

console.log("PASS ability -> visual-effect-fabric contract with cancellation cutoff");
