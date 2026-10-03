"use strict";
// EVERCITY plugin bus. Feature modules register before game.js boots the city.
// game.js calls init(ctx) once the city is built, then every frame:
//   drive(dt, input)   -> a plugin may take over locomotion (returns true when it did)
//   camera(dt, camera) -> a plugin may reposition the camera (third-person etc.)
//   update(dt, paused, now)
// Plugins never throw into the game loop: a failing plugin is disabled and logged.
window.EvercityPlugins = (() => {
  const list = [];
  const listeners = {};
  let ctx = null;
  const safe = (p, name, fn) => {
    if (p.disabled) return undefined;
    try {
      return fn();
    } catch (error) {
      p.disabled = true;
      console.error(`EVERCITY plugin "${p.name}" failed in ${name}; disabled.`, error);
      return undefined;
    }
  };
  return {
    list,
    get ctx() {
      return ctx;
    },
    register(plugin) {
      list.push(plugin);
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
      if (ctx) safe(plugin, "init", () => plugin.init?.(ctx));
      return plugin;
    },
    get(name) {
      return list.find((p) => p.name === name);
    },
    init(c) {
      ctx = c;
      for (const p of list) safe(p, "init", () => p.init?.(ctx));
      this.emit("ready", ctx);
    },
    drive(dt, input) {
      if (!ctx) return false;
      for (const p of list)
        if (p.drive && safe(p, "drive", () => p.drive(dt, input))) return true;
      return false;
    },
    camera(dt, camera) {
      if (!ctx) return;
      for (const p of list) if (p.camera) safe(p, "camera", () => p.camera(dt, camera));
    },
    update(dt, paused, now) {
      if (!ctx) return;
      for (const p of list) if (p.update) safe(p, "update", () => p.update(dt, paused, now));
    },
    on(event, fn) {
      (listeners[event] ||= []).push(fn);
    },
    emit(event, ...args) {
      for (const fn of listeners[event] || [])
        try {
          fn(...args);
        } catch (error) {
          console.error("EVERCITY plugin event", event, error);
        }
    },
    snapshot() {
      return list.map((p) => ({
        name: p.name,
        disabled: !!p.disabled,
        ...(p.snapshot ? safe(p, "snapshot", () => p.snapshot()) || {} : {}),
      }));
    },
  };
})();
