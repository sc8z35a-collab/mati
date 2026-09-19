"use strict";
// Shared, fixed-step traffic simulation. Signal lamps, HUD and road users read this same clock.
window.EvercityTraffic = class EvercityTraffic {
  constructor({
    THREE: T,
    scene,
    vehicles,
    people,
    player,
    staticBlocked,
    buildings = [],
  }) {
    Object.assign(this, {
      T,
      scene,
      vehicles,
      people,
      player,
      staticBlocked,
      buildings,
    });
    this.time = 0;
    this.accumulator = 0;
    this.stats = { redStops: 0, carYields: 0, pedestrianWaits: 0 };
    this.intersections = [];
    this.bulbs = [];
    for (let ix = -4; ix < 4; ix++)
      for (let iz = -4; iz < 4; iz++) {
        this.intersections.push({
          x: ix * 72 + 36,
          z: iz * 72 + 36,
          offset: ((ix + 4) * 7 + (iz + 4) * 11) % 19,
        });
      }
    // The starting crossing has a reproducible cycle.
    this.intersections.find((c) => c.x === 36 && c.z === 108).offset = 0;
    for (const [id, v] of vehicles.entries()) {
      v.id = id;
      v.routeCount = 0;
      v.cruise = v.speed;
      v.speed = 0;
      v.reason = "";
    }
    for (const [id, p] of people.entries()) {
      p.id = id;
      p.homeLane = p.lane;
      p.cruise = p.speed;
      p.waiting = false;
    }
    if (scene) this.buildSignals();
  }
  phase(c, time = this.time) {
    const t = (((time + c.offset) % 80) + 80) % 80;
    const ns = t < 12 ? "green" : t < 15 ? "yellow" : "red";
    const ew =
      t >= 18 && t < 30 ? "green" : t >= 30 && t < 33 ? "yellow" : "red";
    return {
      ns,
      ew,
      walk: t >= 36 && t < 56,
      clearance: t >= 56 && t < 78,
      t,
      remaining: Math.ceil(
        (t < 12
          ? 12
          : t < 15
            ? 15
            : t < 18
              ? 18
              : t < 30
                ? 30
                : t < 33
                  ? 33
                  : t < 36
                    ? 36
                    : t < 56
                      ? 56
                      : t < 78
                        ? 78
                        : 80) - t,
      ),
    };
  }
  position(a, pos = a.pos) {
    if (a.turn) return a.turn.at;
    if (a.errand) return a.errand.at;
    return { x: a.axis ? pos : a.lane, z: a.axis ? a.lane : pos };
  }
  carRect(v, pos = v.pos) {
    const p = this.position(v, pos);
    return {
      ...p,
      w: v.turn
        ? Math.abs(Math.sin(v.turn.yaw)) * 2.15 +
          Math.abs(Math.cos(v.turn.yaw)) * 1.02
        : v.axis
          ? 2.15
          : 1.02,
      d: v.turn
        ? Math.abs(Math.cos(v.turn.yaw)) * 2.15 +
          Math.abs(Math.sin(v.turn.yaw)) * 1.02
        : v.axis
          ? 1.02
          : 2.15,
    };
  }
  overlap(a, b, margin = 0) {
    return (
      Math.abs(a.x - b.x) < a.w + b.w + margin &&
      Math.abs(a.z - b.z) < a.d + b.d + margin
    );
  }
  rebuildIndex() {
    this.buckets = new Map();
    this.actorCells = new Map();
    for (const actor of [...this.vehicles, ...this.people])
      this.indexActor(actor);
  }
  indexActor(actor) {
    const at = this.position(actor),
      key = Math.floor(at.x / 16) + ":" + Math.floor(at.z / 16),
      old = this.actorCells.get(actor);
    if (old === key) return;
    if (old) this.buckets.get(old)?.delete(actor);
    if (!this.buckets.has(key)) this.buckets.set(key, new Set());
    this.buckets.get(key).add(actor);
    this.actorCells.set(actor, key);
  }
  nearby(at, radius, kind) {
    if (!this.inTick) return kind === "car" ? this.vehicles : this.people;
    const result = [];
    for (
      let x = Math.floor((at.x - radius) / 16);
      x <= Math.floor((at.x + radius) / 16);
      x++
    )
      for (
        let z = Math.floor((at.z - radius) / 16);
        z <= Math.floor((at.z + radius) / 16);
        z++
      )
        for (const a of this.buckets.get(x + ":" + z) || [])
          if (a.cruise > 3 === (kind === "car")) result.push(a);
    return result;
  }
  dynamicBlocked(x, z, r = 0.32) {
    if (this.player.floor > 0) return false;
    const body = { x, z, w: r, d: r };
    if (this.vehicles.some((v) => this.overlap(body, this.carRect(v), 0.08)))
      return true;
    return this.people.some((p) => {
      const at = this.position(p);
      return Math.hypot(at.x - x, at.z - z) < r + 0.29;
    });
  }
  intersectionFor(a, c) {
    return Math.abs((a.axis ? c.z : c.x) - a.lane) < 14;
  }
  signalGap(v) {
    let gap = Infinity;
    for (const c of this.intersections) {
      if (!this.intersectionFor(v, c)) continue;
      const center = v.axis ? c.x : c.z,
        stop = center - v.dir * 16.6,
        dist = (stop - v.pos) * v.dir;
      // A vehicle already across its stop line clears the junction, even after amber.
      if (dist < -0.03 || dist > 45) continue;
      const light = this.phase(c)[v.axis ? "ew" : "ns"];
      const conflicting = this.vehicles.some(
        (o) =>
          o !== v &&
          o.axis !== v.axis &&
          Math.abs(this.position(o).x - c.x) < 13 &&
          Math.abs(this.position(o).z - c.z) < 13,
      );
      if (light !== "green" || conflicting || (c.owner && c.owner !== v))
        gap = Math.min(gap, Math.max(0, dist));
    }
    return gap;
  }
  carMoveSafe(v, position) {
    const rect = this.carRect(v, position);
    if (
      this.player.floor === 0 &&
      this.overlap(
        rect,
        { x: this.player.x, z: this.player.z, w: 0.36, d: 0.36 },
        0.5,
      )
    )
      return false;
    for (const other of this.nearby(rect, 8, "car")) {
      if (other !== v && this.overlap(rect, this.carRect(other), 0.65))
        return false;
    }
    for (const p of this.nearby(rect, 6, "person")) {
      const at = this.position(p);
      if (this.overlap(rect, { ...at, w: 0.28, d: 0.28 }, 0.48)) return false;
    }
    return true;
  }
  carGap(v) {
    let gap = this.signalGap(v),
      reason = Number.isFinite(gap) ? "signal" : "";
    for (const other of this.nearby(this.position(v), 50, "car")) {
      if (
        other === v ||
        other.axis !== v.axis ||
        Math.abs(other.lane - v.lane) > 2
      )
        continue;
      const dist = (other.pos - v.pos) * v.dir - 5.4;
      if (dist >= -0.1 && dist < gap) {
        gap = Math.max(0, dist);
        reason = "queue";
      }
    }
    const p = this.position(v),
      ahead = (at, r) => {
        const lateral = v.axis ? Math.abs(at.z - p.z) : Math.abs(at.x - p.x);
        const dist = ((v.axis ? at.x : at.z) - v.pos) * v.dir - 2.15 - r - 0.75;
        if (lateral < 1.05 + r && dist >= -0.8 && dist < gap) {
          gap = Math.max(0, dist);
          reason = "yield";
        }
      };
    if (this.player.floor === 0) ahead(this.player, 0.36);
    for (const person of this.nearby(p, 45, "person"))
      ahead(this.position(person), 0.3);
    return { gap, reason };
  }
  advanceCar(v, dt) {
    if (v.turn) {
      this.advanceTurn(v, dt);
      this.syncCar(v);
      return;
    }
    if (this.beginTurn(v)) {
      this.advanceTurn(v, dt);
      this.syncCar(v);
      return;
    }
    const oldSpeed = v.speed;
    const { gap, reason } = this.carGap(v);
    const target = Math.min(v.cruise, Math.sqrt(Math.max(0, gap) * 8));
    v.speed = Math.max(
      0,
      v.speed + Math.max(-9 * dt, Math.min(2.8 * dt, target - v.speed)),
    );
    let amount = Math.min(v.speed * dt, Math.max(0, gap));
    let next = v.pos + v.dir * amount;
    if (next > 320 || next < -320) {
      const wrapped = -v.dir * 318;
      if (this.carMoveSafe(v, wrapped)) {
        v.pos = wrapped;
        v.speed = 0;
      } else v.speed = 0;
      this.syncCar(v);
      return;
    }
    if (!this.carMoveSafe(v, next)) {
      amount = 0;
      v.speed = 0;
      v.reason = "yield";
      this.stats.carYields++;
    } else v.reason = target < 0.1 ? reason : "";
    v.pos += v.dir * amount;
    if (v.reason === "signal") this.stats.redStops++;
    v.braking = v.speed < oldSpeed - 0.005 || v.speed < 0.2;
    this.syncCar(v);
    for (const wheel of v.wheels || []) wheel.rotation.x -= amount / 0.38;
  }
  syncCar(v) {
    if (!v.g) return;
    const at = this.position(v);
    v.g.position.set(at.x, 0, at.z);
    v.g.rotation.y = v.turn
      ? v.turn.yaw
      : (v.axis ? Math.PI / 2 : 0) + (v.dir > 0 ? Math.PI : 0);
    for (const brake of v.brakes || [])
      brake.material = v.braking ? this.brakeOn : this.brakeOff;
  }
  beginTurn(v) {
    const c = this.intersections.find(
      (c) =>
        this.intersectionFor(v, c) &&
        Math.abs((v.axis ? c.x : c.z) - v.dir * 12 - v.pos) < 0.22,
    );
    if (
      !c ||
      c.owner ||
      v.lastJunction === c ||
      this.phase(c)[v.axis ? "ew" : "ns"] !== "green"
    )
      return false;
    v.lastJunction = c;
    v.routeCount++;
    if ((v.id + v.routeCount) % 3 === 0) return false;
    const axis = 1 - v.axis,
      dir = (v.id + v.routeCount) % 2 ? 1 : -1;
    const start = this.position(v),
      end = axis
        ? { x: c.x + dir * 12, z: c.z + dir * 3.9 }
        : { x: c.x + dir * 3.9, z: c.z + dir * 12 };
    const control = v.axis
      ? { x: end.x, z: start.z }
      : { x: start.x, z: end.z };
    const occupied = this.vehicles.some(
      (o) =>
        o !== v &&
        Math.abs(this.position(o).x - c.x) < 14 &&
        Math.abs(this.position(o).z - c.z) < 14,
    );
    if (occupied) return false;
    c.owner = v;
    v.turn = {
      c,
      start,
      end,
      control,
      at: { ...start },
      t: 0,
      axis,
      dir,
      yaw: (v.axis ? Math.PI / 2 : 0) + (v.dir > 0 ? Math.PI : 0),
    };
    return true;
  }
  advanceTurn(v, dt) {
    const turn = v.turn,
      next = Math.min(1, turn.t + dt / 3.5),
      q = 1 - next;
    const at = {
      x:
        q * q * turn.start.x +
        2 * q * next * turn.control.x +
        next * next * turn.end.x,
      z:
        q * q * turn.start.z +
        2 * q * next * turn.control.z +
        next * next * turn.end.z,
    };
    const dx =
        2 * q * (turn.control.x - turn.start.x) +
        2 * next * (turn.end.x - turn.control.x),
      dz =
        2 * q * (turn.control.z - turn.start.z) +
        2 * next * (turn.end.z - turn.control.z);
    const oldAt = turn.at,
      oldYaw = turn.yaw;
    turn.at = at;
    turn.yaw = Math.atan2(-dx, -dz);
    if (!this.carMoveSafe(v, v.pos)) {
      turn.at = oldAt;
      turn.yaw = oldYaw;
      v.speed = 0;
      v.braking = true;
      return;
    }
    const distance = Math.hypot(at.x - oldAt.x, at.z - oldAt.z);
    v.speed = distance / dt;
    v.braking = false;
    turn.t = next;
    for (const wheel of v.wheels || []) wheel.rotation.x -= distance / 0.38;
    if (next === 1) {
      v.axis = turn.axis;
      v.dir = turn.dir;
      v.lane = v.axis ? at.z : at.x;
      v.pos = v.axis ? at.x : at.z;
      turn.c.owner = null;
      v.turn = null;
    }
  }
  pedestrianSignalGap(p) {
    let gap = Infinity;
    for (const c of this.intersections) {
      if (!this.intersectionFor(p, c)) continue;
      const center = p.axis ? c.x : c.z,
        stop = center - p.dir * 12.4,
        dist = (stop - p.pos) * p.dir;
      // Once on a crossing, continue to the far pavement during the clearance phase.
      if (dist >= -0.015 && dist < 5 && !this.phase(c).walk)
        gap = Math.min(gap, Math.max(0, dist));
    }
    return gap;
  }
  pedestrianMoveSafe(p, next) {
    const at = this.position(p, next);
    if (this.staticBlocked && this.staticBlocked(at.x, at.z)) return false;
    if (
      this.player.floor === 0 &&
      Math.hypot(at.x - this.player.x, at.z - this.player.z) < 0.7
    )
      return false;
    for (const v of this.nearby(at, 7, "car"))
      if (this.overlap({ ...at, w: 0.29, d: 0.29 }, this.carRect(v), 0.18))
        return false;
    for (const other of this.nearby(at, 2, "person")) {
      if (other === p) continue;
      const op = this.position(other);
      if (Math.hypot(at.x - op.x, at.z - op.z) < 0.57) return false;
    }
    return true;
  }
  errand(p, dt) {
    if (!p.errand) {
      // Only south-side pedestrians use the clear front entrance approach.
      if (
        p.axis !== 1 ||
        p.id % 3 !== 0 ||
        this.time < (p.nextVisit || 20 + p.id)
      )
        return false;
      const b = this.buildings.find(
        (b) =>
          Math.abs(p.lane - (b.z + 29)) < 1.5 && Math.abs(p.pos - b.x) < 0.3,
      );
      if (!b) return false;
      p.errand = {
        b,
        at: this.position(p),
        origin: this.position(p),
        phase: "enter",
        wait: 8 + (p.id % 5) * 3,
      };
    }
    const e = p.errand,
      target =
        e.phase === "enter" ? { x: e.b.x, z: e.b.z + e.b.d / 2 - 2 } : e.origin;
    if (e.phase === "visit") {
      e.wait -= dt;
      p.waiting = true;
      if (e.wait <= 0) e.phase = "leave";
    } else {
      const dx = target.x - e.at.x,
        dz = target.z - e.at.z,
        d = Math.hypot(dx, dz),
        step = Math.min(d, p.cruise * dt);
      const old = e.at;
      e.at =
        d > 0.01
          ? { x: old.x + (dx / d) * step, z: old.z + (dz / d) * step }
          : old;
      const safe = this.pedestrianMoveSafe(p, p.pos);
      if (!safe) {
        e.at = old;
        e.blocked = (e.blocked || 0) + dt;
        if (e.blocked > 3 && e.phase === "enter") e.phase = "leave";
      } else {
        e.blocked = 0;
        p.waiting = false;
      }
      if (d < 0.15) {
        if (e.phase === "enter") e.phase = "visit";
        else {
          p.errand = null;
          p.nextVisit = this.time + 75 + p.id;
        }
      }
      if (p.g && d > 0.01) p.g.rotation.y = Math.atan2(dx, dz);
    }
    if (p.g) {
      p.g.position.set(e.at.x, 0.31, e.at.z);
      if (!p.waiting) p.phase += dt * 6;
      p.legs[0].rotation.x = p.waiting ? 0 : Math.sin(p.phase) * 0.3;
      p.legs[1].rotation.x = -p.legs[0].rotation.x;
    }
    return true;
  }
  advancePerson(p, dt) {
    if (this.errand(p, dt)) return;
    const gap = this.pedestrianSignalGap(p),
      step = Math.min(p.cruise * dt, gap);
    let next = p.pos + p.dir * step;
    if (next > 313 || next < -313) {
      p.dir *= -1;
      next = p.pos;
    }
    const safe = this.pedestrianMoveSafe(p, next);
    p.waiting = step < 0.002 || !safe;
    if (safe) p.pos = next;
    else if (!Number.isFinite(gap)) {
      // Deterministic sidewalk courtesy: pause, then turn back instead of clipping through an obstacle.
      p.blockedFor = (p.blockedFor || 0) + dt;
      if (p.blockedFor > 1) {
        const original = p.lane,
          sign = p.id % 2 ? 1 : -1;
        for (const side of [sign, -sign]) {
          const trial = original + side * 0.7;
          if (Math.abs(trial - p.homeLane) > 1.5) continue;
          p.lane = trial;
          if (this.pedestrianMoveSafe(p, next)) {
            p.pos = next;
            p.blockedFor = 0;
            break;
          }
          p.lane = original;
        }
        if (p.blockedFor > 4) {
          p.dir *= -1;
          p.blockedFor = 0;
        }
      }
    }
    if (!p.waiting) p.blockedFor = 0;
    else this.stats.pedestrianWaits++;
    if (p.g) {
      const at = this.position(p);
      p.g.position.set(at.x, 0.31, at.z);
      p.g.rotation.y = (p.axis ? Math.PI / 2 : 0) + (p.dir < 0 ? Math.PI : 0);
      if (!p.waiting) p.phase += dt * 6;
      const swing = p.waiting ? 0 : Math.sin(p.phase) * 0.3;
      p.legs[0].rotation.x = swing;
      p.legs[1].rotation.x = -swing;
    }
  }
  tick(dt) {
    this.time += dt;
    this.rebuildIndex();
    this.inTick = true;
    try {
      for (const p of this.people) {
        this.advancePerson(p, dt);
        this.indexActor(p);
      }
      for (const v of this.vehicles) {
        this.advanceCar(v, dt);
        this.indexActor(v);
      }
    } finally {
      this.inTick = false;
    }
  }
  update(dt) {
    this.accumulator += Math.min(dt, 0.25);
    while (this.accumulator >= 1 / 60) {
      this.tick(1 / 60);
      this.accumulator -= 1 / 60;
    }
    this.updateLamps();
  }
  buildSignals() {
    const T = this.T,
      group = new T.Group();
    group.name = "Functional traffic lights";
    this.scene.add(group);
    const poleMat = new T.MeshStandardMaterial({
      color: "#485858",
      metalness: 0.65,
      roughness: 0.32,
    });
    const housingMat = new T.MeshStandardMaterial({
      color: "#17282c",
      roughness: 0.55,
    });
    const geo = new T.BoxGeometry(1, 1, 1),
      sphere = new T.SphereGeometry(1, 10, 8);
    const housings = [],
      arms = [];
    const housing = (...values) => housings.push(values);
    const arm = (...values) => arms.push(values);
    const bulbData = [];
    for (const c of this.intersections)
      for (const axis of [0, 1])
        for (const dir of [-1, 1]) {
          const x = c.x + (axis ? -dir * 14 : dir * 10.9),
            z = c.z + (axis ? dir * 10.9 : -dir * 14);
          arm(x, 3.3, z, 0.13, 6.6, 0.13);
          const hx = axis ? x : c.x + dir * 3.9,
            hz = axis ? c.z + dir * 3.9 : z;
          arm(
            (x + hx) / 2,
            6.55,
            (z + hz) / 2,
            axis ? 0.15 : 7.2,
            0.15,
            axis ? 7.2 : 0.15,
          );
          housing(hx, 5.98, hz, axis ? 0.42 : 0.7, 1.73, axis ? 0.7 : 0.42);
          for (let k = 0; k < 3; k++)
            bulbData.push({
              x: hx + (axis ? -dir * 0.25 : 0),
              y: 6.5 - k * 0.5,
              z: hz + (axis ? 0 : -dir * 0.25),
              c,
              axis,
              k,
              walk: false,
            });
          housing(x, 2.65, z, axis ? 0.3 : 0.65, 1.04, axis ? 0.65 : 0.3);
          for (let k = 0; k < 2; k++)
            bulbData.push({
              x: x + (axis ? -dir * 0.2 : 0),
              y: 2.92 - k * 0.5,
              z: z + (axis ? 0 : -dir * 0.2),
              c,
              axis,
              k,
              walk: true,
            });
        }
    for (const [items, material] of [
      [housings, housingMat],
      [arms, poleMat],
    ]) {
      const mesh = new T.InstancedMesh(geo, material, items.length),
        object = new T.Object3D();
      items.forEach(([x, y, z, w, h, d], i) => {
        object.position.set(x, y, z);
        object.scale.set(w, h, d);
        object.updateMatrix();
        mesh.setMatrixAt(i, object.matrix);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.lampMesh = new T.InstancedMesh(
      sphere,
      new T.MeshBasicMaterial({ toneMapped: false }),
      bulbData.length,
    );
    const dummy = new T.Object3D();
    bulbData.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.scale.set(
        b.walk ? 0.15 : 0.19,
        b.walk ? 0.17 : 0.19,
        b.walk ? 0.15 : 0.19,
      );
      dummy.updateMatrix();
      this.lampMesh.setMatrixAt(i, dummy.matrix);
    });
    this.bulbs = bulbData;
    group.add(this.lampMesh);
    this.lastLampKey = "";
    this.brakeOn = new T.MeshStandardMaterial({
      color: "#ff5a35",
      emissive: "#ff290e",
      emissiveIntensity: 2.8,
    });
    this.brakeOff = new T.MeshStandardMaterial({
      color: "#6a201b",
      emissive: "#b92b20",
      emissiveIntensity: 0.35,
    });
    for (const v of this.vehicles) {
      v.brakes = [];
      for (const s of [-1, 1]) {
        const m = new T.Mesh(
          new T.BoxGeometry(0.45, 0.16, 0.05),
          this.brakeOff,
        );
        m.position.set(s * 0.68, 0.84, 2.19);
        v.g?.add(m);
        v.brakes.push(m);
      }
    }
    this.updateLamps();
  }
  updateLamps() {
    if (!this.lampMesh) return;
    const key = Math.floor(this.time * 3);
    if (key === this.lastLampKey) return;
    this.lastLampKey = key;
    const color = new this.T.Color();
    this.bulbs.forEach((b, i) => {
      const phase = this.phase(b.c);
      let hex = "#122b2d";
      if (b.walk) {
        if (b.k === 0 && !phase.walk && !phase.clearance) hex = "#ff4935";
        if (
          b.k === 1 &&
          (phase.walk || (phase.clearance && Math.floor(this.time * 2) % 2))
        )
          hex = "#74ffc1";
      } else {
        const state = phase[b.axis ? "ew" : "ns"];
        if (b.k === 0 && state === "red") hex = "#ff4935";
        if (b.k === 1 && state === "yellow") hex = "#ffd451";
        if (b.k === 2 && state === "green") hex = "#53ffb6";
      }
      this.lampMesh.setColorAt(i, color.set(hex));
    });
    this.lampMesh.instanceColor.needsUpdate = true;
  }
  nearest() {
    return this.intersections.reduce(
      (best, c) =>
        Math.hypot(c.x - this.player.x, c.z - this.player.z) <
        Math.hypot(best.x - this.player.x, best.z - this.player.z)
          ? c
          : best,
      this.intersections[0],
    );
  }
  snapshot() {
    const c = this.nearest();
    return {
      ...this.phase(c),
      x: c.x,
      z: c.z,
      time: this.time,
      carsStopped: this.vehicles.filter((v) => v.speed < 0.1).length,
      walkersWaiting: this.people.filter((p) => p.waiting).length,
    };
  }
  static selfTest() {
    const result = {},
      player = { x: 900, z: 900, floor: 0 };
    const makeCar = (pos = 12) => ({
      axis: 0,
      dir: 1,
      lane: 39.9,
      pos,
      speed: 8,
    });
    const v = makeCar(),
      s = new this({ vehicles: [v], people: [], player });
    const c = s.intersections.find((c) => c.x === 36 && c.z === 36);
    c.offset = 0;
    result.signalMutualExclusion = Array.from({ length: 800 }, (_, i) =>
      s.phase(c, i / 10),
    ).every((p) => !(p.ns !== "red" && p.ew !== "red"));
    result.pedestrianExclusive = Array.from({ length: 800 }, (_, i) =>
      s.phase(c, i / 10),
    ).every((p) => !p.walk || (p.ns === "red" && p.ew === "red"));
    s.time = 20;
    for (let n = 0; n < 120; n++) s.advanceCar(v, 1 / 60);
    result.redStopsAtLine = v.pos <= 19.401;
    const stopped = v.pos;
    s.time = 1;
    for (let n = 0; n < 90; n++) s.advanceCar(v, 1 / 60);
    result.greenRestarts = v.pos > stopped + 1;
    result.playerBlockedByCar = s.dynamicBlocked(
      s.position(v).x,
      s.position(v).z,
    );
    v.pos = 5;
    v.speed = 7;
    player.x = 39.9;
    player.z = 15;
    for (let n = 0; n < 120; n++) s.advanceCar(v, 1 / 60);
    result.carYieldsToPlayer = v.pos < 12;
    player.x = 900;
    player.z = 900;
    const lead = makeCar(18);
    s.vehicles.push(lead);
    v.pos = 9;
    v.speed = 8;
    for (let n = 0; n < 120; n++) s.advanceCar(v, 1 / 60);
    result.vehicleQueue = !s.overlap(s.carRect(v), s.carRect(lead));
    s.vehicles.length = 0;
    const p = { axis: 0, dir: 1, lane: 25, pos: 22, speed: 1.3, cruise: 1.3 };
    s.people.push(p);
    s.time = 1;
    for (let n = 0; n < 120; n++) s.advancePerson(p, 1 / 60);
    result.walkerWaits = p.pos <= 23.601;
    const held = p.pos;
    s.time = 40;
    for (let n = 0; n < 120; n++) s.advancePerson(p, 1 / 60);
    result.walkerCrossesOnGreen = p.pos > held + 1;
    result.playerBlockedByWalker = s.dynamicBlocked(
      s.position(p).x,
      s.position(p).z,
    );
    p.pos = 34;
    s.time = 65;
    const before = p.pos;
    s.advancePerson(p, 0.1);
    result.crossingClearsAfterSignal = p.pos > before;
    s.people.length = 0;
    s.vehicles.push(v);
    v.pos = 12;
    v.speed = 8;
    player.x = 39.9;
    player.z = 16;
    s.advanceCar(v, 0.05);
    result.noTunneling = !s.overlap(s.carRect(v), {
      x: player.x,
      z: player.z,
      w: 0.32,
      d: 0.32,
    });
    return result;
  }
};
