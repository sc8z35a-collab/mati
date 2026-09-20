"use strict";
// Conservative CPU visibility for immutable, world-space instance batches.
// Never substitutes lower-detail geometry, changes materials, or drops shadow casters.
window.EvercityVisibility = class EvercityVisibility {
  constructor(T) {
    this.T = T;
    this.records = [];
    this.frustum = new T.Frustum();
    this.projection = new T.Matrix4();
    this.previousProjection = new T.Matrix4();
    this.eye = new T.Vector3();
    this.selectionEye = new T.Vector3(Infinity, Infinity, Infinity);
    this.occluders = [];
    this.selected = [];
    this.active = false;
    this.enabled = true;
    this.stats = {
      batches: 0,
      eligible: 0,
      submitted: 0,
      frustumRejected: 0,
      occlusionRejected: 0,
      uploads: 0,
    };
  }
  register(mesh) {
    if (!mesh.isInstancedMesh || mesh.count < 16) return;
    const T = this.T,
      matrix = new T.Matrix4(),
      box = new T.Box3();
    mesh.geometry.computeBoundingBox();
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    const chunks = [];
    // Keep source order (including transparent surfaces). Splitting contiguous runs
    // does not multiply draw calls or require a second instance buffer on the GPU.
    for (let start = 0; start < mesh.count; start += 16) {
      const bounds = new T.Box3(),
        end = Math.min(start + 16, mesh.count);
      for (let i = start; i < end; i++) {
        mesh.getMatrixAt(i, matrix);
        box.copy(mesh.geometry.boundingBox).applyMatrix4(matrix);
        bounds.union(box);
      }
      bounds.expandByScalar(0.05); // Conservative margin at silhouettes/near plane.
      chunks.push({ start, end, bounds, visible: true });
    }
    const record = {
      mesh,
      count: mesh.count,
      matrices: mesh.instanceMatrix.array.slice(),
      colors: mesh.instanceColor?.array.slice(),
      chunks,
      compacted: false,
      lastVisible: null,
    };
    this.records.push(record);
    // Rendering must not alter gameplay/photo line-of-sight queries, including
    // queries issued after a fast camera turn and before the next render.
    const raycast = mesh.raycast,
      source = new T.InstancedBufferAttribute(record.matrices, 16);
    mesh.raycast = function (raycaster, intersections) {
      if (!record.compacted)
        return raycast.call(this, raycaster, intersections);
      const attribute = this.instanceMatrix,
        count = this.count;
      try {
        this.instanceMatrix = source;
        this.count = record.count;
        return raycast.call(this, raycaster, intersections);
      } finally {
        this.instanceMatrix = attribute;
        this.count = count;
      }
    };
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.instanceColor?.setUsage(T.DynamicDrawUsage);
  }
  setBuildings(buildings, base, floorHeight) {
    const add = (axis, value, u, u0, u1, v, v0, v1) => {
      const bounds = new this.T.Box3();
      bounds.min.set(0, 0, 0);
      bounds.max.set(0, 0, 0);
      bounds.min[axis] = bounds.max[axis] = value;
      bounds.min[u] = u0;
      bounds.max[u] = u1;
      bounds.min[v] = v0;
      bounds.max[v] = v1;
      this.occluders.push({
        axis,
        value,
        u,
        u0,
        u1,
        v,
        v0,
        v1,
        bounds,
        distance: 0,
      });
    };
    this.occluders.length = 0;
    for (const b of buildings) {
      // Only actual solid ground-floor walls and structural slabs, NEVER the
      // building's enclosing box: upper windows and the entrance are transparent/open.
      for (const side of [-1, 1])
        add(
          "x",
          b.x + (side * b.w) / 2,
          "z",
          b.z - b.d / 2 + 0.1,
          b.z + b.d / 2 - 0.1,
          "y",
          base + 0.1,
          base + floorHeight - 0.1,
        );
      add(
        "z",
        b.z - b.d / 2,
        "x",
        b.x - b.w / 2 + 0.1,
        b.x + b.w / 2 - 0.1,
        "y",
        base + 0.1,
        base + floorHeight - 0.1,
      );
      for (let f = 1; f <= b.floors; f++)
        add(
          "y",
          base + f * floorHeight - 0.16,
          "x",
          b.x - b.w / 2 + 0.1,
          b.x + b.w / 2 - 0.1,
          "z",
          b.z - b.d / 2 + 0.1,
          b.z + b.d / 2 - 0.1,
        );
    }
    this.selectionEye.set(Infinity, Infinity, Infinity);
  }
  selectOccluders() {
    if (this.eye.distanceToSquared(this.selectionEye) < 0.25 ** 2) return;
    this.selectionEye.copy(this.eye);
    this.selected.length = 0;
    for (const o of this.occluders) {
      const b = o.bounds,
        p = this.eye;
      const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x),
        dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y),
        dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z);
      o.distance = dx * dx + dy * dy + dz * dz;
      if (o.distance > 48 * 48 || Math.abs(o.value - p[o.axis]) < 0.1) continue;
      let i = 0;
      while (
        i < this.selected.length &&
        this.selected[i].distance <= o.distance
      )
        i++;
      if (i < 8) {
        this.selected.splice(i, 0, o);
        if (this.selected.length > 8) this.selected.pop();
      }
    }
  }
  occluded(b) {
    const p = this.eye;
    for (const o of this.selected) {
      const delta = o.value - p[o.axis];
      if (
        delta > 0
          ? b.min[o.axis] <= o.value + 0.05
          : b.max[o.axis] >= o.value - 0.05
      )
        continue;
      let hidden = true;
      // A rectangle's occlusion volume is convex: ALL eight AABB corners must
      // lie strictly behind the SAME opaque rectangle. Never use a center ray.
      for (let i = 0; i < 8; i++) {
        const a = (i & 1 ? b.max : b.min)[o.axis],
          u = (i & 2 ? b.max : b.min)[o.u],
          v = (i & 4 ? b.max : b.min)[o.v],
          t = delta / (a - p[o.axis]),
          hitU = p[o.u] + (u - p[o.u]) * t,
          hitV = p[o.v] + (v - p[o.v]) * t;
        if (
          t <= 0 ||
          t >= 1 ||
          hitU <= o.u0 ||
          hitU >= o.u1 ||
          hitV <= o.v0 ||
          hitV >= o.v1
        ) {
          hidden = false;
          break;
        }
      }
      if (hidden) return true;
    }
    return false;
  }
  upload(attribute, count) {
    if (!attribute || count === 0) return;
    // Three.js r158 exposes one contiguous updateRange.
    attribute.updateRange.offset = 0;
    attribute.updateRange.count = count * attribute.itemSize;
    attribute.needsUpdate = true;
  }
  restoreRecord(r) {
    if (!r.compacted) return;
    r.mesh.instanceMatrix.array.set(r.matrices);
    if (r.colors) r.mesh.instanceColor.array.set(r.colors);
    r.mesh.count = r.count;
    this.upload(r.mesh.instanceMatrix, r.count);
    this.upload(r.mesh.instanceColor, r.count);
    r.compacted = false;
    for (const c of r.chunks) c.visible = true;
  }
  restore() {
    for (const r of this.records) this.restoreRecord(r);
    this.active = false;
  }
  prepare(camera, low) {
    if (!low || !this.enabled) {
      this.restore();
      return;
    }
    camera.updateMatrixWorld();
    this.eye.setFromMatrixPosition(camera.matrixWorld);
    this.projection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    const moved =
      !this.active || !this.projection.equals(this.previousProjection);
    this.previousProjection.copy(this.projection);
    this.frustum.setFromProjectionMatrix(this.projection);
    this.selectOccluders();
    const s = this.stats;
    s.batches =
      s.eligible =
      s.submitted =
      s.frustumRejected =
      s.occlusionRejected =
      s.uploads =
        0;
    for (const r of this.records) {
      const m = r.mesh;
      // Camera visibility cannot decide visibility from the sun/local lights.
      if (m.castShadow) {
        this.restoreRecord(r);
        r.lastVisible = null;
        continue;
      }
      if (!m.visible) {
        r.lastVisible = false;
        continue;
      }
      s.batches++;
      s.eligible += r.count;
      if (!moved && r.lastVisible === true) {
        s.submitted += m.count;
        s.frustumRejected += r.frustumRejected || 0;
        s.occlusionRejected += r.occlusionRejected || 0;
        continue;
      }
      r.lastVisible = true;
      let count = 0,
        changed = false,
        frustumRejected = 0,
        occlusionRejected = 0;
      const inView = this.frustum.intersectsBox(m.boundingBox);
      for (const c of r.chunks) {
        const n = c.end - c.start;
        let visible = inView && this.frustum.intersectsBox(c.bounds);
        if (!visible) frustumRejected += n;
        else if (this.occluded(c.bounds)) {
          visible = false;
          occlusionRejected += n;
        }
        if (visible) count += n;
        if (c.visible !== visible) changed = true;
        c.visible = visible;
      }
      r.frustumRejected = frustumRejected;
      r.occlusionRejected = occlusionRejected;
      s.frustumRejected += frustumRejected;
      s.occlusionRejected += occlusionRejected;
      s.submitted += count;
      if (!changed) continue;
      let target = 0;
      for (const c of r.chunks) {
        if (!c.visible) continue;
        // Copy only when membership changes; never allocate typed subarrays per frame.
        for (let i = c.start; i < c.end; i++, target++) {
          for (let j = 0; j < 16; j++)
            m.instanceMatrix.array[target * 16 + j] = r.matrices[i * 16 + j];
          if (r.colors)
            for (let j = 0; j < 3; j++)
              m.instanceColor.array[target * 3 + j] = r.colors[i * 3 + j];
        }
      }
      m.count = count;
      r.compacted = true;
      this.upload(m.instanceMatrix, count);
      this.upload(m.instanceColor, count);
      if (count) s.uploads++;
    }
    this.active = true;
  }
  snapshot() {
    return {
      active: this.active,
      ...this.stats,
      occluders: this.selected.length,
      registeredBatches: this.records.length,
      clusterSize: 16,
    };
  }
};
