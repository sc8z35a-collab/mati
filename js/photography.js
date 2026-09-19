"use strict";
// The guide, mission framing and export share exactly one projection.
window.EvercityPhotography = class EvercityPhotography {
  static options() {
    const $ = (id) => document.getElementById(id);
    const aspect = Number($("photo-aspect").value);
    const long = Number($("photo-resolution").value);
    return {
      aspect,
      width: Math.round(aspect >= 1 ? long : long * aspect),
      height: Math.round(aspect >= 1 ? long / aspect : long),
      quality: $("photo-quality").value,
      exposure: Number($("photo-exposure").value),
      roll: (Number($("photo-roll").value) * Math.PI) / 180,
    };
  }
  static camera(camera, aspect) {
    const clone = camera.clone();
    clone.fov =
      (2 *
        Math.atan(
          Math.tan((camera.fov * Math.PI) / 360) *
            Math.min(1, camera.aspect / aspect),
        ) *
        180) /
      Math.PI;
    clone.aspect = aspect;
    clone.clearViewOffset();
    clone.updateProjectionMatrix();
    clone.updateMatrixWorld(true);
    return clone;
  }
  static framed(
    T,
    camera,
    target,
    scene,
    tolerance = 1.25,
    occluderRange = Infinity,
  ) {
    camera.updateMatrixWorld(true);
    const point = new T.Vector3(target.x, target.y, target.z);
    const ndc = point.clone().project(camera);
    if (
      ndc.z <= -1 ||
      ndc.z >= 1 ||
      Math.abs(ndc.x) > 0.9 ||
      Math.abs(ndc.y) > 0.9
    )
      return false;
    // Skip labels and transparent glazing; opaque architecture must not hide the target.
    const delta = point.clone().sub(camera.position),
      distance = delta.length();
    const ray = new T.Raycaster(
      camera.position,
      delta.normalize(),
      0.08,
      Math.min(occluderRange, Math.max(0.08, distance - tolerance)),
    );
    scene.updateMatrixWorld(true);
    return !ray.intersectObjects(scene.children, true).some((hit) => {
      let object = hit.object;
      for (let node = object; node; node = node.parent)
        if (!node.visible || node.userData.photoMarker) return false;
      if (!object.isMesh) return false;
      const material = Array.isArray(object.material)
        ? object.material[hit.face?.materialIndex || 0]
        : object.material;
      return (
        material &&
        !material.transparent &&
        !material.alphaTest &&
        !object.userData.worldSign
      );
    });
  }
  static async thumbnail(blob) {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8),
      );
    } finally {
      bitmap.close();
    }
  }
  static async direct(T, renderer, scene, camera, options) {
    const { width, height, signal, progress = () => {} } = options;
    const size = renderer.getSize(new T.Vector2()),
      ratio = renderer.getPixelRatio();
    const photo = this.camera(camera, width / height),
      output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const ctx = output.getContext("2d");
    if (!ctx) throw Error("画像の保存領域を確保できません。");
    const tile = Math.min(1024, renderer.capabilities.maxTextureSize);
    const count = Math.ceil(width / tile) * Math.ceil(height / tile);
    let index = 0;
    const check = () => {
      if (signal?.aborted)
        throw new DOMException("撮影を中止しました。", "AbortError");
      if (renderer.getContext().isContextLost())
        throw Error("描画が中断されました。");
    };
    try {
      renderer.setPixelRatio(1);
      for (let y = 0; y < height; y += tile)
        for (let x = 0; x < width; x += tile) {
          check();
          const w = Math.min(tile, width - x),
            h = Math.min(tile, height - y);
          renderer.setSize(w, h, false);
          photo.setViewOffset(width, height, x, y, w, h);
          renderer.setRenderTarget(null);
          renderer.render(scene, photo);
          ctx.drawImage(renderer.domElement, x, y); // copy before yielding the non-preserved buffer
          progress(`写真を描画中 ${++index} / ${count}`, (index / count) * 0.9);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      check();
      const blob = await new Promise((resolve, reject) =>
        output.toBlob(
          (b) =>
            b ? resolve(b) : reject(Error("PNGを書き出せませんでした。")),
          "image/png",
        ),
      );
      check();
      return {
        blob,
        width,
        height,
        format: "png",
        quality: "BALANCED",
        samples: 1,
        tiles: count,
        colorSpace: "sRGB / SDR",
      };
    } finally {
      output.width = output.height = 1;
      renderer.setPixelRatio(ratio);
      renderer.setSize(size.x, size.y, false);
    }
  }
};
