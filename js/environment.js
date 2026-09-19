"use strict";
window.EvercityEnvironment = class EvercityEnvironment {
  constructor(api) {
    this.a = api;
    this.weather = "clear";
    this.autoTime = false;
    this.cycle = 0;
    this.time = 0;
    this.makeRain();
    this.makeClouds();
    this.visual = this.lightState();
    document.getElementById("weather-select").onchange = (e) =>
      this.setWeather(e.target.value);
    document.getElementById("auto-time").onchange = (e) => {
      this.autoTime = e.target.checked;
      this.cycle = 0;
    };
  }
  makeRain() {
    const T = this.a.THREE,
      count = 2300,
      data = new Float32Array(count * 6);
    this.drops = [];
    for (let n = 0; n < count; n++)
      this.drops.push({
        x: (Math.random() - 0.5) * 75,
        z: (Math.random() - 0.5) * 75,
        y: Math.random() * 38,
        speed: 18 + Math.random() * 10,
      });
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.BufferAttribute(data, 3));
    this.rain = new T.LineSegments(
      geometry,
      new T.LineBasicMaterial({
        color: "#c1d9e1",
        transparent: true,
        opacity: 0.43,
        depthWrite: false,
      }),
    );
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.a.scene.add(this.rain);
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d"),
      gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, "rgba(145,171,177,.3)");
    gradient.addColorStop(1, "rgba(100,135,145,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new T.CanvasTexture(c);
    this.puddles = new T.Group();
    const mat = new T.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      color: "#93aeb6",
    });
    for (let i = -4; i <= 4; i++)
      for (let j = -4; j <= 4; j++) {
        const mesh = new T.Mesh(new T.PlaneGeometry(11, 5), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(i * 72 + 33, 0.049, j * 72 + 12);
        this.puddles.add(mesh);
      }
    this.a.scene.add(this.puddles);
    this.puddles.visible = false;
  }
  makeClouds() {
    const T = this.a.THREE,
      canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    for (let n = 0; n < 10; n++) {
      const x = 40 + n * 19,
        y = 60 + Math.sin(n * 2) * 10,
        r = 35;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(240,241,232,.32)");
      g.addColorStop(1, "rgba(240,241,232,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    this.cloudMaterial = new T.SpriteMaterial({
      map: new T.CanvasTexture(canvas),
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: true,
    });
    this.clouds = [];
    for (let n = 0; n < 18; n++) {
      const cloud = new T.Sprite(this.cloudMaterial);
      cloud.position.set(
        ((n % 6) - 2.5) * 180,
        190 + (n % 3) * 26,
        (Math.floor(n / 6) - 1) * 270,
      );
      cloud.scale.set(230, 75, 1);
      this.a.scene.add(cloud);
      this.clouds.push(cloud);
    }
  }
  setWeather(value) {
    this.weather = ["clear", "cloudy", "rain"].includes(value)
      ? value
      : "clear";
    document.getElementById("weather-select").value = this.weather;
    this.apply();
  }
  apply() {
    const previous = this.visual;
    const { sun, ambient, scene, skyUniforms, materials, renderer } = this.a,
      mode = this.a.getTime(),
      night = mode === "night",
      day = mode === "day",
      wet = this.weather === "rain",
      cloudy = this.weather !== "clear";
    sun.intensity =
      (night ? 0.1 : day ? 4.6 : 4.0) * (wet ? 0.28 : cloudy ? 0.5 : 1);
    ambient.intensity =
      (night ? 0.16 : day ? 0.68 : 0.44) * (cloudy ? 1.04 : 1);
    skyUniforms.top.value.set(
      night
        ? "#08172d"
        : wet
          ? "#637b87"
          : cloudy
            ? "#91a7ac"
            : day
              ? "#71b0d3"
              : "#78a8bf",
    );
    skyUniforms.bottom.value.set(
      night
        ? "#303e59"
        : wet
          ? "#a7b4b5"
          : cloudy
            ? "#c8cebf"
            : day
              ? "#d3e6e9"
              : "#f1d1a6",
    );
    scene.fog.color.set(
      night
        ? "#1c2c43"
        : wet
          ? "#9faeb4"
          : cloudy
            ? "#bac7c8"
            : day
              ? "#c7dfe5"
              : "#b4c6c6",
    );
    scene.fog.density = wet ? 0.0034 : night ? 0.0022 : 0.00165;
    materials.road.roughness = wet ? 0.22 : 0.8;
    materials.road.metalness = wet ? 0.24 : 0;
    materials.paving.roughness = wet ? 0.45 : 0.8;
    this.puddles.visible = wet;
    this.cloudMaterial.opacity = night ? 0.17 : wet ? 0.8 : cloudy ? 0.7 : 0.4;
    this.cloudMaterial.color.set(wet ? "#94a5ad" : "#ffffff");
    document.getElementById("weather-icon").textContent = wet
      ? "☂"
      : cloudy
        ? "☁"
        : night
          ? "☾"
          : "☀";
    document.getElementById("weather-label").textContent = wet
      ? "雨 / 18°C"
      : cloudy
        ? "曇り / 21°C"
        : night
          ? "晴れ / 19°C"
          : "晴れ / 24°C";
    renderer.shadowMap.needsUpdate = true;
    this.target = this.lightState();
    this.visual = previous;
    this.writeLight(previous);
  }
  lightState() {
    const a = this.a;
    return {
      sun: a.sun.intensity,
      ambient: a.ambient.intensity,
      fog: a.scene.fog.density,
      top: a.skyUniforms.top.value.clone(),
      bottom: a.skyUniforms.bottom.value.clone(),
      fogColor: a.scene.fog.color.clone(),
      sunColor: a.sun.color.clone(),
      ambientColor: a.ambient.color.clone(),
      glow: a.skyUniforms.sunColor.value.clone(),
      direction: new a.THREE.Vector3(
        a.getTime() === "day" ? 90 : -130,
        a.getTime() === "day" ? 300 : 200,
        95,
      ).normalize(),
    };
  }
  writeLight(v) {
    if (!v) return;
    const a = this.a;
    a.sun.intensity = v.sun;
    a.ambient.intensity = v.ambient;
    a.scene.fog.density = v.fog;
    a.skyUniforms.top.value.copy(v.top);
    a.skyUniforms.bottom.value.copy(v.bottom);
    a.scene.fog.color.copy(v.fogColor);
    a.sun.color.copy(v.sunColor);
    a.ambient.color.copy(v.ambientColor);
    a.skyUniforms.sunColor.value.copy(v.glow);
    a.sun.userData.solarDirection = v.direction;
  }
  blend(dt) {
    if (!this.target) return;
    const t = 1 - Math.exp(-dt * 0.6);
    for (const key of ["sun", "ambient", "fog"])
      this.visual[key] += (this.target[key] - this.visual[key]) * t;
    for (const key of [
      "top",
      "bottom",
      "fogColor",
      "sunColor",
      "ambientColor",
      "glow",
      "direction",
    ])
      this.visual[key].lerp(this.target[key], t);
    this.writeLight(this.visual);
  }
  update(dt, indoor) {
    this.blend(dt);
    this.time += dt;
    this.cycle += dt;
    if (this.autoTime && this.cycle >= 120) {
      this.cycle = 0;
      const next = { day: "golden", golden: "night", night: "day" }[
        this.a.getTime()
      ];
      this.a.setTime(next);
      document.getElementById("time-select").value = next;
      this.a.toast(
        {
          day: "朝の光が、街に戻ってきました",
          golden: "街が夕方の色に染まります",
          night: "街の灯りがともりました",
        }[next],
      );
    }
    const { player: p } = this.a;
    this.rain.visible = this.weather === "rain";
    if (this.rain.visible) {
      this.rain.position.set(p.x, p.y - 3, p.z);
      const data = this.rain.geometry.attributes.position.array;
      this.drops.forEach((drop, i) => {
        drop.y -= dt * drop.speed;
        drop.x += dt * 1.1;
        if (drop.y < 0) drop.y = 38;
        if (drop.x > 37.5) drop.x = -37.5;
        const a = i * 6;
        data[a] = drop.x;
        data[a + 1] = drop.y;
        data[a + 2] = drop.z;
        data[a + 3] = drop.x - 0.09;
        data[a + 4] = drop.y + 0.75;
        data[a + 5] = drop.z;
        const wx = p.x + drop.x,
          wz = p.z + drop.z,
          building = this.a.buildingAt?.(wx, wz),
          wy = p.y - 3 + drop.y;
        if (building && wy < 0.32 + building.height + 0.3) {
          data[a + 1] = data[a + 4] = -1000;
        }
      });
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    for (const cloud of this.clouds) {
      cloud.position.x += dt * 1.15;
      if (cloud.position.x > 570) cloud.position.x = -570;
    }
  }
  selfTest() {
    const old = this.weather;
    this.setWeather("rain");
    const wet = this.a.materials.road.roughness < 0.3;
    this.update(0, true);
    const outsideSeenFromInside = this.rain.visible;
    this.update(0, false);
    const outsideVisible = this.rain.visible;
    this.setWeather("invalid");
    const invalidFallback = this.weather === "clear";
    this.setWeather(old);
    return {
      wetRoad: wet,
      outsideRainSeenFromInside: outsideSeenFromInside,
      rainVisibleOutdoors: outsideVisible,
      invalidWeatherFallback: invalidFallback,
    };
  }
};
