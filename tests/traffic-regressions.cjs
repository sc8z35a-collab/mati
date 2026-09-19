"use strict";
// Pure simulation checks. Run only after approval: node tests/traffic-regressions.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const sandbox = { window: {} };
vm.runInNewContext(
  fs.readFileSync(
    require("node:path").join(__dirname, "../js/traffic.js"),
    "utf8",
  ),
  sandbox,
);
const Traffic = sandbox.window.EvercityTraffic;
const player = { x: 900, z: 900, floor: 0 };
const mesh = () => ({
  position: {
    set(x, y, z) {
      Object.assign(this, { x, y, z });
    },
  },
  rotation: { y: 0 },
});
const car = (extra = {}) => ({
  g: mesh(),
  axis: 0,
  dir: 1,
  lane: 39.9,
  pos: 23.9,
  speed: 8,
  ...extra,
});
const old = Traffic.selfTest();
assert(Object.values(old).every(Boolean), JSON.stringify(old));
for (const axis of [0, 1])
  for (const dir of [-1, 1])
    for (const turnId of [0, 1]) {
      const v = car({ axis, dir, lane: 36 + dir * 3.9, pos: 36 - dir * 12 });
      const sim = new Traffic({ vehicles: [v], people: [], player });
      const c = sim.intersections.find((c) => c.x === 36 && c.z === 36);
      c.offset = 0;
      sim.time = axis ? 20 : 1;
      v.id = turnId;
      assert(
        sim.beginTurn(v),
        "turn should start on green in an empty junction",
      );
      const other = car({ axis: 1 - axis, dir: 1, lane: 39.9, pos: 12 });
      sim.vehicles.push(other);
      assert(
        sim.signalGap(other) < Infinity,
        "reserved junction stops cross traffic",
      );
      sim.vehicles.pop();
      for (let i = 0; i < 250; i++) sim.advanceCar(v, 1 / 60);
      assert.equal(v.turn, null);
      assert.equal(c.owner, null);
      assert.equal(v.axis, 1 - axis);
      const p = sim.position(v);
      assert.equal(v.g.position.x, p.x);
      assert.equal(v.g.position.z, p.z);
    }
for (const dir of [-1, 1]) {
  const v = car({ dir, pos: dir * 319.999, speed: 12 });
  const sim = new Traffic({ vehicles: [v], people: [], player });
  v.speed = 12;
  sim.advanceCar(v, 0.1);
  const p = sim.position(v);
  assert(Math.abs(v.pos) < 319);
  assert.equal(v.g.position.x, p.x);
  assert.equal(v.g.position.z, p.z);
}
const a = new Traffic({ vehicles: [], people: [], player });
const b = new Traffic({ vehicles: [], people: [], player });
for (let i = 0; i < 60; i++) a.update(1 / 60);
for (let i = 0; i < 10; i++) b.update(0.1);
assert(
  Math.abs(a.time - b.time) < 1 / 60 + 0.00001,
  "low frame rates preserve simulation time",
);
console.log(
  "PASS legacy safety, eight turns, reservations, wrap/mesh synchronization, low-FPS clock",
);
