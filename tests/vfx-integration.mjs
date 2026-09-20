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
    }]
  }]
};

const requests=emitGameVfxRequests(ability);
assert.equal(requests.length,1);
assert.equal(requests[0].schema,"axm.game-vfx-request/v1");
assert.equal(requests[0].effectRef,"ground-impact");
assert.equal(requests[0].kind,"particle-burst");
assert.equal(requests[0].parameters.count,40);
console.log("PASS ability -> visual-effect-fabric contract");
