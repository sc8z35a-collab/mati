"use strict";
// EVERCITY detail plugin: 建物ファサード・看板・屋上 (owner: agent C). Contract: .collab/ASSIGNMENTS.md
//
// 1. Interior-mapped windows: every upper-floor bay of every building gets a parallax "room"
//    (floor / ceiling / side walls / back wall + furniture silhouettes + curtains / blinds)
//    rendered by ONE instanced draw call just behind the existing transparent glazing.
//    Rooms vary per cell by deterministic hash: wall colour, colour temperature (2700K-5000K),
//    occupancy by time of day, slow night-time light switching, TV flicker, blind height.
//    The floor the player is standing on is discarded so the real interior stays visible.
(() => {
  const FLOOR = 5.6,
    BASE = 0.32;
  const TYPE = { office: 0, hotel: 1, residential: 2, shop: 3, cafe: 4, gallery: 5 };

  const VERT = /* glsl */ `
    attribute vec4 aInfo;
    varying vec3 vWorld;
    varying vec3 vT;
    varying vec3 vN;
    varying vec2 vUV;
    varying vec4 vInfo;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      mat4 im = modelMatrix * instanceMatrix;
      vec4 wp = im * vec4(position, 1.0);
      vT = normalize(im[0].xyz);
      vN = normalize(im[2].xyz);
      vUV = vec2(uv.x * length(instanceMatrix[0].xyz), uv.y * length(instanceMatrix[1].xyz));
      vWorld = wp.xyz;
      vInfo = aInfo;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`;

  const FRAG = /* glsl */ `
    uniform float uNight;
    uniform float uGolden;
    uniform float uDay;
    uniform float uClock;
    uniform vec3 uSkyTop;
    uniform vec3 uSkyBottom;
    uniform vec4 uHide;
    uniform float uDebug;
    varying vec3 vWorld;
    varying vec3 vT;
    varying vec3 vN;
    varying vec2 vUV;
    varying vec4 vInfo;
    #include <common>
    #include <fog_pars_fragment>

    float h2(vec2 p) {
      vec3 q = fract(vec3(p.xyx) * 0.1031);
      q += dot(q, q.yzx + 33.33);
      return fract((q.x + q.y) * q.z);
    }
    vec3 lin(vec3 c) { return c * c; }
    // Pixel footprint (metres) at the current sample; set per surface. All masks are
    // box-filtered with it, so no glittering stripes / moire at any distance.
    float FW = 0.01;
    float rect(vec2 q, vec2 lo, vec2 hi) {
      vec2 a = smoothstep(lo - FW, lo + FW, q) * (1.0 - smoothstep(hi - FW, hi + FW, q));
      return a.x * a.y;
    }
    float disc(vec2 q, vec2 c, float r) { return 1.0 - smoothstep(r - FW, r + FW, length(q - c)); }
    // Coverage of a periodic gap (duty = fraction that is "on"); fades to its mean when too fine.
    float stripes(float x, float period, float duty) {
      float f = fract(x / period);
      float w = FW / period;
      float v = smoothstep(1.0 - duty - w, 1.0 - duty + w, f);
      return mix(v, duty, smoothstep(0.18, 0.5, w));
    }

    void main() {
      // The floor the player is on shows its real, loaded interior instead.
      if (uHide.w > 0.5 && abs(vInfo.x - uHide.x) < 0.5 && abs(vInfo.y - uHide.y) < 0.5) discard;
      float type = floor(vInfo.z + 0.5);
      bool office = type < 0.5;
      bool hotel = abs(type - 1.0) < 0.5;
      bool resi = abs(type - 2.0) < 0.5;
      bool gallery = type > 4.5;
      bool studio = abs(type - 3.0) < 0.5 || abs(type - 4.0) < 0.5; // upper floors of shops / cafes = apartments & studios

      float W = office || gallery ? 10.8 : 5.4;
      float H = 5.36;
      float D = office ? 11.0 : hotel ? 6.5 : gallery ? 10.0 : 7.0;
      float ux = vUV.x - 1.7;
      float cx = floor(ux / W);
      // Varyings are interpolated: snap the per-instance ids to exact integers before hashing.
      vec4 id = floor(vInfo + 0.5);
      vec2 cell = mod(vec2(cx + id.w * 13.0 + id.x * 7.0, id.y * 5.0 + id.x * 3.0), 289.0);
      float r1 = h2(cell), r2 = h2(cell + 17.3), r3 = h2(cell + 41.9), r4 = h2(cell + 3.1), r5 = h2(cell + 77.7);

      vec3 V = normalize(vWorld - cameraPosition);
      float camDist = max(length(vWorld - cameraPosition), 0.5);
      float pix = max(length(fwidth(vUV)), 1e-4);
      FW = pix;
      vec3 dir = vec3(dot(V, vT), V.y, -dot(V, vN));
      dir.x = abs(dir.x) < 1e-4 ? 1e-4 : dir.x;
      dir.y = abs(dir.y) < 1e-4 ? 1e-4 : dir.y;
      dir.z = max(dir.z, 1e-3);
      vec3 p = vec3(ux - cx * W, vUV.y, 0.0);

      // ---- occupancy & light schedule (slowly changes at night: people come home, go to bed) ----
      float slot = floor(uClock / 41.0 + r5 * 9.0);
      float roll = h2(cell + slot * 1.37);
      float pLit = office ? mix(0.86, 0.3, uNight) : hotel ? mix(0.12, 0.58, uNight) : gallery ? mix(0.9, 0.12, uNight) : mix(0.1, 0.66, uNight);
      pLit += uGolden * 0.16;
      float lit = step(roll, pLit);
      vec3 lamp = r2 < 0.32 ? vec3(1.0, 0.66, 0.36) : r2 < 0.62 ? vec3(1.0, 0.8, 0.56) : r2 < 0.86 ? vec3(1.0, 0.9, 0.78) : vec3(0.82, 0.9, 1.0);
      if (office) lamp = r2 < 0.72 ? vec3(0.9, 0.95, 1.0) : vec3(1.0, 0.9, 0.78);
      if (gallery) lamp = vec3(1.0, 0.93, 0.84);
      float lampI = lit * (0.32 + 0.18 * uGolden + 1.5 * uNight);
      vec3 daylight = uSkyBottom * (0.5 * uDay + 0.36 * uGolden + 0.015 * uNight);

      // ---- curtain / blind layer right behind the glass ----
      float cA = 0.06 + r3 * 0.36, cB = 0.06 + r4 * 0.34;          // curtain panel widths (fraction)
      bool curtains = resi || studio || (hotel && r4 > 0.25);
      bool blinds = !curtains && !gallery && r4 < 0.62;
      float drop = blinds ? H * (0.12 + 0.7 * r3 * r3) : 0.0;     // blind lowered from top
      vec3 cloth = r1 < 0.3 ? vec3(0.86, 0.82, 0.74) : r1 < 0.55 ? vec3(0.72, 0.7, 0.62) : r1 < 0.75 ? vec3(0.58, 0.66, 0.62) : r1 < 0.9 ? vec3(0.78, 0.62, 0.5) : vec3(0.42, 0.47, 0.56);
      cloth = lin(cloth);
      float px = p.x / W;
      float fwx = FW / W;
      float curtainMask = curtains ? max(1.0 - smoothstep(cA - fwx, cA + fwx, px), smoothstep(1.0 - cB - fwx, 1.0 - cB + fwx, px)) : 0.0;
      if (curtains) curtainMask = max(curtainMask, smoothstep(H - 0.42 - FW, H - 0.42 + FW, p.y)); // pelmet / curtain track
      float blindMask = blinds && p.y > H - drop ? 0.25 + 0.75 * stripes(p.y, 0.085, 0.86) : 0.0;
      if (resi && curtainMask < 0.5) discard;
      curtainMask = step(0.5, curtainMask); // keep the real residence previews visible behind
      vec3 col;
      if (curtainMask > 0.5 || blindMask > 0.2) {
        float foldA = 0.5 + 0.5 * sin(p.x * 7.0 + r1 * 6.0 + sin(p.x * 2.3) * 1.5);
        float fold = curtainMask > 0.5 ? 0.74 + 0.26 * mix(foldA, 0.5, smoothstep(0.05, 0.25, FW)) : blindMask;
        vec3 c = curtainMask > 0.5 ? cloth : lin(vec3(0.84, 0.84, 0.8));
        // Lit from the front by daylight, back-lit (translucent) by the room lamp at night.
        col = c * fold * (daylight * 0.9 + lamp * lampI * 0.55);
        if (p.y > H - 0.42 && curtainMask > 0.5) col *= 0.7;
      } else {
        // ---- room box intersection ----
        vec3 tt = vec3(((dir.x > 0.0 ? W : 0.0) - p.x) / dir.x, ((dir.y > 0.0 ? H : 0.0) - p.y) / dir.y, D / dir.z);
        float t = min(min(tt.x, tt.y), tt.z);
        vec3 h = p + dir * t;
        FW = pix * (1.0 + t / camDist) / max(0.25, abs(t == tt.z ? dir.z : t == tt.x ? dir.x : dir.y) / length(dir)) * 0.7;
        FW = min(FW, 0.6);
        vec3 wall = mix(vec3(0.88, 0.86, 0.81), vec3(0.8, 0.76, 0.68), r3);
        if (r4 > 0.78 && !office) wall = r5 < 0.33 ? vec3(0.56, 0.63, 0.54) : r5 < 0.66 ? vec3(0.72, 0.52, 0.42) : vec3(0.34, 0.4, 0.5);
        if (gallery) wall = vec3(0.93, 0.92, 0.9);
        wall = lin(wall);
        vec3 alb;
        float emit = 0.0;
        vec3 emitC = lamp;
        float e;
        if (t == tt.z) {                // back wall
          alb = wall;
          e = min(min(h.x, W - h.x), min(h.y, H - h.y));
          vec2 q = h.xy;
          if (office) {
            // glazed corridor partition with frames and a brighter corridor beyond
            float frame = stripes(q.x, 1.35, 0.06) + rect(q, vec2(-1.0, -1.0), vec2(99.0, 0.12)) + rect(q, vec2(-1.0, 2.75), vec2(99.0, 2.85));
            alb = mix(lin(vec3(0.42, 0.47, 0.5)), lin(vec3(0.2, 0.22, 0.24)), clamp(frame, 0.0, 1.0));
            if (q.y > 2.85) alb = wall;
            float door = rect(q, vec2(W * 0.5 - 0.5, 0.0), vec2(W * 0.5 + 0.5, 2.2));
            alb = mix(alb, lin(vec3(0.3, 0.33, 0.35)), door);
            if (r5 > 0.5) { // whiteboard
              alb = mix(alb, lin(vec3(0.95)), rect(q, vec2(1.0, 1.0), vec2(3.4, 2.2)));
              alb = mix(alb, lin(vec3(0.2, 0.35, 0.6)), rect(q, vec2(1.3, 1.6), vec2(2.6, 1.64)) + rect(q, vec2(1.3, 1.4), vec2(2.1, 1.44)));
            }
          } else if (hotel) {
            alb = mix(alb, lin(vec3(0.42, 0.33, 0.27)), rect(q, vec2(W * 0.5 - 1.2, 0.0), vec2(W * 0.5 + 1.2, 1.35))); // headboard
            alb = mix(alb, lin(vec3(0.26, 0.24, 0.22)), rect(q, vec2(W * 0.5 - 0.62, 1.68), vec2(W * 0.5 + 0.62, 2.45)));
            alb = mix(alb, lin(mix(vec3(0.7, 0.5, 0.35), vec3(0.4, 0.55, 0.6), r1)), rect(q, vec2(W * 0.5 - 0.55, 1.75), vec2(W * 0.5 + 0.55, 2.38)));
            float sconce = disc(q, vec2(W * 0.5 - 1.55, 1.5), 0.13) + disc(q, vec2(W * 0.5 + 1.55, 1.5), 0.13);
            emit += sconce * lit * 3.0;
          } else if (gallery) {
            for (int k = 0; k < 3; k++) {
              float fx = 1.4 + float(k) * 3.3;
              float hk = h2(cell + float(k) * 9.1);
              vec2 lo = vec2(fx, 1.25 + hk * 0.3), hi = vec2(fx + 1.4 + hk, 2.6 + hk * 0.4);
              alb = mix(alb, lin(vec3(0.15)), rect(q, lo - 0.05, hi + 0.05));
              alb = mix(alb, lin(mix(vec3(0.75, 0.32, 0.22), vec3(0.2, 0.42, 0.6), hk) * (0.7 + 0.3 * sin(q.x * 7.0 + q.y * 5.0))), rect(q, lo, hi));
            }
          } else {
            // apartment / studio: bookshelf or TV wall
            if (r5 > 0.45) {
              float shelf = rect(q, vec2(0.6, 0.0), vec2(2.4, 2.3));
              float books = stripes(q.y, 0.42, 0.82) * mix(step(0.1, fract(q.x / 0.09 + h2(floor(q.yy / 0.42)))), 0.9, smoothstep(0.02, 0.06, FW));
              vec3 bookC = lin(mix(vec3(0.6, 0.3, 0.25), vec3(0.3, 0.45, 0.55), h2(floor(q / vec2(0.09, 0.42)))));
              alb = mix(alb, mix(lin(vec3(0.45, 0.33, 0.22)), bookC, books), shelf);
            }
            float tv = rect(q, vec2(W * 0.5 - 0.1, 0.95), vec2(W * 0.5 + 1.5, 1.85));
            float tvOn = step(0.55, r2) * lit * uNight;
            alb = mix(alb, lin(vec3(0.05)), tv);
            emitC = mix(lamp, vec3(0.45, 0.62, 1.0), tv);
            emit += tv * tvOn * (1.4 + 0.9 * sin(uClock * 7.0 + r1 * 40.0) * sin(uClock * 2.3));
          }
        } else if (t == tt.x) {         // side walls
          alb = wall * 0.92;
          e = min(min(h.y, H - h.y), D - h.z);
          if (!office && !gallery) { // door frame on one side wall
            float df = rect(h.zy, vec2(D * 0.62, 0.0), vec2(D * 0.62 + 0.95, 2.15));
            alb = mix(alb, lin(vec3(0.62, 0.55, 0.46)), df);
          }
        } else if (dir.y < 0.0) {        // floor
          e = min(min(h.x, W - h.x), D - h.z);
          if (office) alb = lin(vec3(0.36, 0.37, 0.38)) * (0.94 + 0.06 * mix(h2(floor(h.xz / 0.5)), 0.5, smoothstep(0.1, 0.3, FW)));
          else if (gallery) alb = lin(vec3(0.62, 0.61, 0.58));
          else {
            float plank = floor(h.x / 0.19);
            alb = lin(mix(vec3(0.52, 0.37, 0.24), vec3(0.62, 0.48, 0.33), r1)) * (0.84 + 0.22 * h2(vec2(plank, floor(h.z / 1.6 + plank * 0.37))));
            alb *= 0.9 + 0.1 * stripes(h.x, 0.19, 0.96);
            float rug = rect(h.xz, vec2(W * 0.25, D * 0.3), vec2(W * 0.75, D * 0.75));
            alb = mix(alb, lin(mix(vec3(0.6, 0.5, 0.42), vec3(0.32, 0.38, 0.42), r5)), rug * step(0.4, r3));
          }
        } else {                         // ceiling
          alb = lin(vec3(0.9, 0.9, 0.88));
          e = min(min(h.x, W - h.x), D - h.z);
          if (office || gallery) {
            float panel = stripes(h.x + 0.675, 2.7, 0.5) * stripes(h.z + 0.48, 2.4, 0.4);
            emit += panel * lit * mix(1.2, 3.2, uNight);
            alb *= 1.0 - 0.12 * stripes(h.x, 0.6, 0.04) - 0.12 * stripes(h.z, 0.6, 0.04);
          } else {
            float pend = disc(h.xz, vec2(W * 0.5, D * 0.5), 0.32);
            emit += pend * lit * mix(2.0, 6.0, uNight);
          }
        }
        // light: lamp falloff from the ceiling centre + daylight decaying with depth + corner AO
        vec3 h3 = vec3(h.x, h.y, h.z);
        float dist = length(h3 - vec3(W * 0.5, H - 0.2, D * 0.5));
        float lampTerm = office || gallery ? 0.75 : 1.6 / (1.0 + 0.07 * dist * dist);
        float dayTerm = (0.3 + 0.7 * exp(-h.z * 0.3)) * (dir.y < 0.0 && t != tt.z && t != tt.x ? 1.25 : 1.0);
        float ao = 0.45 + 0.55 * smoothstep(0.0, 1.1, e);
        col = alb * (lamp * lampI * lampTerm + daylight * dayTerm * 0.42 + vec3(0.004, 0.005, 0.008)) * ao + emitC * emit * mix(0.5, 1.0, uNight);

        // ---- furniture silhouettes on a parallax plane inside the room ----
        float zf = office ? 3.1 : hotel ? 3.6 : gallery ? 5.0 : 4.2;
        float tf = zf / dir.z;
        if (tf < t) {
          vec2 q = (p + dir * tf).xy;
          FW = min(pix * (1.0 + tf / camDist) * 0.8, 0.5);
          if (q.x > 0.0 && q.x < W && q.y > 0.0 && q.y < H) {
            float m = 0.0;
            vec3 fc = lin(vec3(0.32, 0.3, 0.28));
            float fe = 0.0;
            vec3 fec = lamp;
            if (office) {
              float qx = mod(q.x, 3.6);
              float seat = h2(cell + floor(q.x / 3.6) * 3.3);
              float desk = rect(vec2(qx, q.y), vec2(0.2, 0.72), vec2(3.4, 0.8)) + rect(vec2(qx, q.y), vec2(0.3, 0.0), vec2(0.38, 0.72)) + rect(vec2(qx, q.y), vec2(3.2, 0.0), vec2(3.28, 0.72));
              float mon = rect(vec2(qx, q.y), vec2(1.05, 0.9), vec2(1.85, 1.38)) + rect(vec2(qx, q.y), vec2(1.4, 0.8), vec2(1.5, 0.9));
              float chair = rect(vec2(qx, q.y), vec2(2.2, 0.48), vec2(2.75, 1.12)) + rect(vec2(qx, q.y), vec2(2.44, 0.05), vec2(2.5, 0.48));
              float person = seat > 0.55 ? disc(vec2(qx, q.y), vec2(2.47, 1.47), 0.13) + rect(vec2(qx, q.y), vec2(2.22, 0.95), vec2(2.72, 1.33)) : 0.0;
              m = clamp(desk + mon + chair + person, 0.0, 1.0);
              fc = person > 0.5 ? lin(mix(vec3(0.3, 0.33, 0.4), vec3(0.55, 0.45, 0.4), seat)) : desk > 0.5 ? lin(vec3(0.62, 0.58, 0.52)) : lin(vec3(0.12, 0.13, 0.14));
              float screen = rect(vec2(qx, q.y), vec2(1.1, 0.95), vec2(1.8, 1.33));
              fe = screen * step(0.25, seat) * (lit > 0.5 ? 1.0 : step(0.8, seat)) * 1.1;
              fec = mix(vec3(0.55, 0.72, 1.0), vec3(0.9, 0.95, 1.0), seat);
            } else if (hotel) {
              float bed = rect(q, vec2(W * 0.5 - 1.05, 0.0), vec2(W * 0.5 + 1.05, 0.62));
              float duvet = rect(q, vec2(W * 0.5 - 1.1, 0.42), vec2(W * 0.5 + 1.1, 0.66));
              float table = rect(q, vec2(W * 0.5 + 1.35, 0.0), vec2(W * 0.5 + 1.85, 0.6));
              float shade = rect(q, vec2(W * 0.5 + 1.42, 0.82), vec2(W * 0.5 + 1.78, 1.12));
              float stem = rect(q, vec2(W * 0.5 + 1.58, 0.6), vec2(W * 0.5 + 1.62, 0.82));
              float lug = r5 > 0.6 ? rect(q, vec2(0.5, 0.0), vec2(0.95, 0.68)) : 0.0;
              m = clamp(bed + duvet + table + shade + stem + lug, 0.0, 1.0);
              fc = duvet > 0.5 ? lin(vec3(0.92, 0.9, 0.86)) : bed > 0.5 ? lin(vec3(0.55, 0.5, 0.45)) : lug > 0.5 ? lin(mix(vec3(0.15, 0.2, 0.3), vec3(0.6, 0.25, 0.2), r3)) : lin(vec3(0.38, 0.28, 0.2));
              fe = shade * lit * 2.4;
            } else if (gallery) {
              float plinth = rect(q, vec2(W * 0.45, 0.0), vec2(W * 0.45 + 0.9, 1.0));
              float sculpt = disc(q, vec2(W * 0.45 + 0.45, 1.45), 0.42) * step(0.35, r2);
              float bench = rect(q, vec2(W * 0.15, 0.38), vec2(W * 0.15 + 2.2, 0.48)) + rect(q, vec2(W * 0.15 + 0.1, 0.0), vec2(W * 0.15 + 0.18, 0.38)) + rect(q, vec2(W * 0.15 + 2.02, 0.0), vec2(W * 0.15 + 2.1, 0.38));
              float visitor = r4 > 0.5 ? disc(q, vec2(W * 0.72, 1.56), 0.12) + rect(q, vec2(W * 0.72 - 0.22, 0.0), vec2(W * 0.72 + 0.22, 1.42)) : 0.0;
              m = clamp(plinth + sculpt + bench + visitor, 0.0, 1.0);
              fc = plinth > 0.5 ? lin(vec3(0.9)) : sculpt > 0.5 ? lin(vec3(0.72, 0.55, 0.32)) : visitor > 0.5 ? lin(vec3(0.25, 0.27, 0.3)) : lin(vec3(0.3, 0.24, 0.18));
            } else {
              // apartment: sofa, plant, floor lamp, dining table
              float sofa = rect(q, vec2(0.7, 0.0), vec2(2.9, 0.48)) + rect(q, vec2(0.7, 0.48), vec2(2.9, 0.92)) * step(0.5, r1);
              float arm = rect(q, vec2(0.55, 0.0), vec2(0.78, 0.68)) + rect(q, vec2(2.82, 0.0), vec2(3.05, 0.68));
              float pot = rect(q, vec2(W - 1.25, 0.0), vec2(W - 0.75, 0.5));
              float leaves = disc(q, vec2(W - 1.0, 1.05), 0.48) + disc(q, vec2(W - 1.3, 1.5), 0.3) + disc(q, vec2(W - 0.75, 1.42), 0.28);
              float lampPole = rect(q, vec2(3.4, 0.0), vec2(3.44, 1.6)) * step(0.4, r5);
              float lampShade = rect(q, vec2(3.22, 1.6), vec2(3.62, 1.92)) * step(0.4, r5);
              m = clamp(sofa + arm + pot + leaves + lampPole + lampShade, 0.0, 1.0);
              vec3 sofaC = lin(mix(vec3(0.42, 0.5, 0.48), vec3(0.62, 0.45, 0.36), r2));
              fc = leaves > 0.5 ? lin(vec3(0.22, 0.38, 0.2)) * (0.8 + 0.4 * h2(floor(q * 9.0))) : pot > 0.5 ? lin(vec3(0.6, 0.42, 0.32)) : lampShade > 0.5 ? lin(vec3(0.9, 0.86, 0.76)) : sofaC;
              fe = lampShade * lit * 2.2;
            }
            if (m > 0.02) {
              float fdist = length(vec3(q, zf) - vec3(W * 0.5, H - 0.2, D * 0.5));
              float fl = office || gallery ? 0.7 : 1.5 / (1.0 + 0.07 * fdist * fdist);
              float rim = 0.85 + 0.15 * smoothstep(0.0, 0.6, q.y);
              col = mix(col, fc * (lamp * lampI * fl + daylight * 0.4 * (0.3 + 0.7 * exp(-zf * 0.3))) * rim + fec * fe * mix(0.6, 1.0, uNight), m);
            }
          }
        }
      }
      // ---- exterior glass: sky fresnel reflection on top of the interior ----
      vec3 R = reflect(V, vN);
      vec3 sky = mix(uSkyBottom, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.55));
      if (R.y < 0.0) sky *= 0.45; // street / opposite buildings reflect darker
      float F = 0.04 + 0.96 * pow(1.0 - clamp(dir.z, 0.0, 1.0), 5.0);
      col = mix(col, sky * mix(1.0, 0.35, uNight), clamp(F * 0.85 + mix(0.2, 0.05, uNight), 0.0, 0.92));
      if (uDebug > 0.5 && uDebug < 1.5) col = vec3(r1, r2, r3);
      if (uDebug > 1.5 && uDebug < 2.5) col = vec3(fract(vUV * 0.1), 0.0);
      if (uDebug > 2.5) col = vec3(FW * 20.0, pix * 50.0, 0.0);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`;

  // ---------------------------------------------------------------------------
  // 2. Static dressing: rooftop plant (water tanks, condensers, cubicles, masts,
  //    dishes), rooftop & projecting signs with Japanese lettering, neon, aviation
  //    beacons, lived-in balconies, rain streaks and street grime on the shells.
  //    Everything rides existing exterior batches (no new draw calls) except five
  //    small shared meshes created here.
  // ---------------------------------------------------------------------------
  const hash = (a, b = 0, c = 0) => {
    let h = Math.imul(a * 73856093 ^ b * 19349663 ^ c * 83492791, 2654435761) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 2246822519) >>> 0;
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  const FACES = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  function frame(b, face) {
    const [nx, nz] = FACES[face],
      half = nz ? b.d / 2 : b.w / 2,
      len = nz ? b.w : b.d,
      tx = nz,
      tz = -nx;
    return {
      nx,
      nz,
      tx,
      tz,
      len,
      ry: Math.atan2(nx, nz),
      at: (u, y, out) => [b.x + nx * (half + out) + tx * u, y, b.z + nz * (half + out) + tz * u],
    };
  }
  const BRANDS = {
    office: [["MERIDIAN", "メリディアン保険"], ["TOKAI", "東海証券"], ["AOBA", "青葉電機"], ["SORA NET", "そら通信"], ["NAKANO", "中野建設"], ["KASUMI", "霞ホールディングス"]],
    shop: [["CITY MARKET", "シティマーケット"], ["MIDORI", "ドラッグ ミドリ"], ["SAKURA", "家電のサクラ"], ["AKARI BOOKS", "書店 灯"], ["MACHI", "まちの百貨店"]],
    hotel: [["NORTHLINE", "ノースライン ホテル"], ["HOTEL KOU", "ホテル 煌"], ["STAY 72", "ステイ セブンツー"]],
    cafe: [["COMMON GROUNDS", "珈琲 こもれび"], ["KISSA", "喫茶 ひだまり"]],
    gallery: [["FORM", "フォーム現代美術館"], ["ATELIER", "アトリエ 白"]],
    residential: [["RESIDENCE", "レジデンス"]],
  };
  const VERTICAL = {
    office: ["歯科", "税理士", "英会話", "整骨院"],
    shop: ["薬", "書店", "眼鏡", "質"],
    hotel: ["ホテル", "旅館"],
    cafe: ["珈琲", "喫茶"],
    gallery: ["画廊", "美術"],
    residential: ["美容室", "ラーメン", "居酒屋", "そば"],
  };
  const NEON = ["#ff4f7a", "#46e0ff", "#ffd24a", "#7dff8a", "#ff7a3c", "#c77dff", "#ff5a4a"];
  const FONT = "'Noto Sans JP','Noto Sans CJK JP','Hiragino Sans','Yu Gothic',sans-serif";

  function makeStreakMaterial(T) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const g = c.getContext("2d");
    // Several thin runs of dirt, densest at the top (where water leaves the ledge).
    let s = 91;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 64,
        w = 1 + rnd() * 4,
        h = 60 + rnd() * 196,
        a = 0.15 + rnd() * 0.45;
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(0.6, `rgba(255,255,255,${a * 0.45})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(x, 0, w, h);
    }
    const top = g.createLinearGradient(0, 0, 0, 30);
    top.addColorStop(0, "rgba(255,255,255,.55)");
    top.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = top;
    g.fillRect(0, 0, 64, 30);
    const tex = new T.CanvasTexture(c);
    return new T.MeshBasicMaterial({
      map: tex,
      color: "#222a27",
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }
  function makeGrimeMaterial(T) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 64;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 64, 0, 0);
    grad.addColorStop(0, "rgba(255,255,255,.85)");
    grad.addColorStop(0.35, "rgba(255,255,255,.35)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 64);
    // Splash speckles from rain and passing feet.
    let s = 7;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let i = 0; i < 900; i++) {
      const y = 64 - Math.pow(rnd(), 2.2) * 60;
      g.fillStyle = `rgba(255,255,255,${0.1 + rnd() * 0.35})`;
      g.fillRect(rnd() * 256, y, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = T.RepeatWrapping;
    return new T.MeshBasicMaterial({
      map: tex,
      color: "#2b2a24",
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  }

  // Sign atlas: rooftop boards (512x128 slots) and vertical blade signs (128x512 slots).
  function drawRoofSign(g, x, y, w, h, brand, i) {
    const dark = i % 3 !== 1;
    g.fillStyle = dark ? ["#16302f", "#1d2433", "#2b1d1d", "#1d2b22"][i % 4] : "#f1ece0";
    g.fillRect(x, y, w, h);
    g.strokeStyle = dark ? "rgba(255,255,255,.35)" : "rgba(30,40,40,.5)";
    g.lineWidth = 4;
    g.strokeRect(x + 6, y + 6, w - 12, h - 12);
    g.fillStyle = dark ? "#fff5dc" : "#1d3a38";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 52px ${FONT}`;
    g.fillText(brand[1], x + w / 2, y + h * 0.42, w - 40);
    g.font = `600 22px ${FONT}`;
    g.fillStyle = dark ? "#9fd8c8" : "#7a5a32";
    g.fillText(brand[0].split("").join(" "), x + w / 2, y + h * 0.8, w - 60);
  }
  function drawBlade(g, x, y, w, h, text, i) {
    const bg = ["#b8262b", "#f2eadb", "#173a5c", "#1f4d36", "#f4c430", "#2a2a2a"][i % 6];
    const light = bg === "#f2eadb" || bg === "#f4c430";
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    g.strokeStyle = light ? "#2a2a2a" : "#ffffff";
    g.lineWidth = 5;
    g.strokeRect(x + 8, y + 8, w - 16, h - 16);
    g.fillStyle = light ? "#1d1d1d" : "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const chars = [...text],
      size = Math.min(92, (h - 60) / chars.length);
    g.font = `900 ${size}px ${FONT}`;
    chars.forEach((ch, k) => g.fillText(ch, x + w / 2, y + 30 + size * (k + 0.5) + ((h - 60) - size * chars.length) / 2));
  }

  const plugin = {
    buildDressing(api) {
      const T = api.THREE,
        ex = api.exterior;
      const streaks = [],
        grime = [],
        neon = [],
        beacons = [],
        quads = [];
      this.balconySolids = new Map();
      const roofAtlas = document.createElement("canvas");
      roofAtlas.width = 2048;
      roofAtlas.height = 2048;
      const bladeAtlas = document.createElement("canvas");
      bladeAtlas.width = 2048;
      bladeAtlas.height = 2048;
      const rg = roofAtlas.getContext("2d"),
        bg = bladeAtlas.getContext("2d");
      let roofSlot = 0,
        bladeSlot = 0;
      const S = this.stats;
      Object.assign(S, { waterTanks: 0, condensers: 0, masts: 0, roofSigns: 0, bladeSigns: 0, neonTubes: 0, beacons: 0, balconyAC: 0, laundry: 0, streaks: 0, cubicles: 0 });

      api.buildings.forEach((b, bi) => {
        const { x, z, w, d, floors, type } = b;
        const roof = BASE + floors * FLOOR,
          rs = (b.solids[floors] ||= []);
        const r = (k) => hash(bi + 11, k, floors);
        const tall = floors >= 12;
        const commercial = type === "office" || type === "shop" || type === "hotel" || type === "cafe";

        // --- rooftop condensers in a row on a steel skid, with refrigerant lines to the core
        {
          const n = 3 + Math.floor(r(1) * 3),
            cx0 = x + 5.5,
            cz = z - d / 2 + 2.3;
          ex.box("trim", cx0 + (n - 1) * 0.65, roof + 0.29, cz, n * 1.3 + 0.4, 0.14, 1.1, "#5d6764", 0, "roof");
          for (let k = 0; k < n; k++) {
            const ux = cx0 + k * 1.3,
              tone = hash(bi, k, 3) < 0.5 ? "#d9dbd3" : "#c9ccc4";
            ex.box("trim", ux, roof + 0.74, cz, 1.1, 0.78, 0.82, tone, 0, "roof");
            ex.add("cylinder", "dark", ux - 0.14, roof + 0.74, cz + 0.415, 0.3, 0.02, 0.3, "#3a4442", Math.PI / 2, 0, 0, "roof");
            for (let g = -2; g <= 2; g++)
              ex.box("trim", ux - 0.14, roof + 0.74 + g * 0.11, cz + 0.43, 0.6, 0.012, 0.012, "#8b938f", 0, "roof");
            ex.box("dark", ux + 0.38, roof + 0.74, cz + 0.415, 0.22, 0.6, 0.01, "#6e7774", 0, "roof");
            ex.cylinder("trim", ux + 0.35, roof + 0.55, cz - 0.6, 0.03, 0.5, "#b08a5a", "roof");
          }
          ex.box("trim", cx0 + (n - 1) * 0.65 - 0.4, roof + 0.32, cz - 0.62, n * 1.3, 0.08, 0.2, "#7c8582", 0, "roof");
          ex.box("trim", x + 3.6, roof + 0.32, (cz - 0.62 + z - d / 2 + 3.2) / 2, 0.2, 0.08, Math.abs(cz - 0.62 - (z - d / 2 + 3.2)) + 0.4, "#7c8582", 0, "roof");
          rs.push({ x: cx0 + (n - 1) * 0.65, z: cz, w: (n * 1.3 + 0.4) / 2, d: 0.6, height: 1.2 });
          S.condensers += n;
        }

        // --- elevated water tank (residential / hotel / shop and some offices)
        if (type !== "gallery" && type !== "cafe" && (type !== "office" || r(2) < 0.4)) {
          const tx = x + w / 2 - 4.6,
            tz = z + 1.5,
            legH = 2.2,
            R = 1.25,
            H = 2.5;
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            ex.box("trim", tx + dx * 0.95, roof + legH / 2 + 0.2, tz + dz * 0.95, 0.12, legH, 0.12, "#59625f", 0, "roof");
            ex.beam("trim", [tx + dx * 0.95, roof + 0.35, tz + dz * 0.95], [tx - dx * 0.95, roof + legH, tz + dz * 0.95], 0.025, "#6a736f", "roof");
          }
          ex.box("trim", tx, roof + legH + 0.25, tz, 2.4, 0.1, 2.4, "#4f5755", 0, "roof");
          ex.cylinder("render", tx, roof + legH + 0.3 + H / 2, tz, R, H, r(3) < 0.5 ? "#dfe2dc" : "#cfd8d6", "roof");
          for (const yy of [0.5, 1.25, 2.0])
            ex.cylinder("trim", tx, roof + legH + 0.3 + yy, tz, R + 0.03, 0.05, "#9aa39f", "roof");
          ex.cylinder("render", tx, roof + legH + 0.3 + H + 0.12, tz, R * 0.75, 0.24, "#d6d9d3", "roof");
          ex.cylinder("trim", tx, roof + legH + 0.3 + H + 0.3, tz, 0.28, 0.14, "#7c8582", "roof");
          // ladder on the street side
          for (const s2 of [-0.22, 0.22])
            ex.box("trim", tx + s2, roof + (legH + H) / 2 + 0.2, tz + R + 0.12, 0.04, legH + H + 0.2, 0.04, "#aab2ae", 0, "roof");
          for (let k = 0; k < 15; k++)
            ex.box("trim", tx, roof + 0.45 + k * 0.32, tz + R + 0.12, 0.44, 0.025, 0.025, "#aab2ae", 0, "roof");
          for (let k = 0; k < 6; k++)
            ex.add("ring", "trim", tx, roof + legH + 1.2 + k * 0.33, tz + R + 0.3, 0.3, 0.3, 0.3, "#aab2ae", Math.PI / 2, 0, 0, "roof");
          ex.cylinder("trim", tx - R - 0.1, roof + (legH + H) / 2, tz, 0.05, legH + H, "#8a9390", "roof");
          ex.add("leaf", "contact", tx, roof + 0.215, tz, 3.6, 3.6, 1, "#ffffff", -Math.PI / 2, 0, 0, "roof");
          rs.push({ x: tx, z: tz, w: 1.45, d: 1.45, height: 6 });
          S.waterTanks++;
        }

        // --- electrical cubicle (キュービクル) with louvres and a warning plate
        {
          const cx = x - w / 2 + 3.4,
            cz = z + 2.5;
          ex.box("trim", cx, roof + 0.27, cz, 2.0, 0.12, 2.8, "#545c5a", 0, "roof");
          ex.box("trim", cx, roof + 1.25, cz, 1.7, 1.85, 2.5, "#c8ccc2", 0, "roof");
          ex.box("trim", cx, roof + 2.22, cz, 1.85, 0.08, 2.65, "#aeb3aa", 0, "roof");
          for (let k = 0; k < 6; k++)
            ex.box("dark", cx + 0.86, roof + 1.55 + k * 0.08, cz - 0.6, 0.01, 0.03, 0.9, "#59605e", 0, "roof");
          ex.box("dark", cx + 0.86, roof + 1.25, cz + 0.45, 0.01, 1.5, 0.01, "#59605e", 0, "roof");
          ex.box("sign", cx + 0.865, roof + 1.05, cz - 0.6, 0.005, 0.22, 0.32, "#f4c430", 0, "roof");
          rs.push({ x: cx, z: cz, w: 1.0, d: 1.45, height: 2.4 });
          S.cubicles++;
        }

        // --- masts, yagi antennas, dish and lightning rod on top of the lift core
        {
          // Base heights follow the lift-core cap of each roof type (office = stepped crown,
          // gallery = tilted slab) so nothing floats or sinks.
          const top = (dx) => roof + (type === "office" ? 4.825 : type === "gallery" ? 5.0 + 0.151 * dx : 4.4);
          const mx = x + 2.4,
            mz = z - d / 2 + 0.55,
            coreTop = top(2.4),
            mh = tall ? 9 : 5;
          ex.cylinder("trim", mx, coreTop + mh / 2, mz, 0.06, mh, "#9aa3a0", "roof");
          for (let k = 0; k < 3; k++) {
            const yy = coreTop + mh * (0.45 + k * 0.18);
            ex.box("trim", mx, yy, mz, 1.6 - k * 0.3, 0.025, 0.025, "#b8bfbc", r(10 + k) * Math.PI, "roof");
            for (let e = -3; e <= 3; e++)
              ex.box("trim", mx, yy, mz, 0.018, 0.018, 0.5 - Math.abs(e) * 0.05, "#b8bfbc", r(10 + k) * Math.PI, "roof");
          }
          ex.cylinder("trim", x - 1.5, top(-1.5) + 1.4, z - d / 2 + 0.55, 0.03, 2.8, "#c9b27c", "roof");
          ex.add("sphere", "trim", x - 3.0, top(-3.0) + 0.75, z - d / 2 + 2.0, 0.55, 0.12, 0.55, "#e4e6e1", -0.9, 0.4 + r(4), 0, "roof");
          ex.cylinder("trim", x - 3.0, top(-3.0) + 0.35, z - d / 2 + 2.0, 0.04, 0.7, "#8a9390", "roof");
          S.masts++;
          if (tall) {
            beacons.push([mx, coreTop + mh + 0.15, mz, 0.16]);
            for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
              ex.cylinder("trim", x + dx * (w / 2 - 0.4), roof + 1.6, z + dz * (d / 2 - 0.4), 0.04, 0.75, "#8a9390", "roof");
              beacons.push([x + dx * (w / 2 - 0.4), roof + 2.05, z + dz * (d / 2 - 0.4), 0.13]);
            }
          }
        }

        // --- rooftop billboard on a steel truss (commercial blocks)
        if (commercial && !(tall && type === "office" && r(5) < 0.5)) {
          const list = BRANDS[type],
            brand = b.name.startsWith("THE ") || b.special ? [b.name.replace(/\s\d+$/, ""), b.jp] : list[Math.floor(r(6) * list.length)];
          const sw = Math.min(16, w * 0.42),
            sh = sw / 4,
            sx = x + w * 0.16,
            sz = z + d / 2 - 0.35,
            y0 = roof + 1.9;
          const slot = roofSlot++ % 64,
            ax = (slot % 4) * 512,
            ay = Math.floor(slot / 4) * 128;
          if (roofSlot <= 64) drawRoofSign(rg, ax, ay, 512, 128, brand, bi);
          quads.push({ atlas: 0, c: [sx, y0 + sh / 2, sz + 0.09], t: [1, 0, 0], u: [0, 1, 0], n: [0, 0, 1], w: sw, h: sh, uv: [ax / 2048, 1 - (ay + 128) / 2048, (ax + 512) / 2048, 1 - ay / 2048] });
          ex.box("dark", sx, y0 + sh / 2, sz, sw + 0.2, sh + 0.2, 0.16, "#2a3230", 0, "roof");
          const posts = Math.max(3, Math.round(sw / 3.2));
          for (let k = 0; k < posts; k++) {
            const px = sx - sw / 2 + 0.4 + (k * (sw - 0.8)) / (posts - 1);
            ex.box("trim", px, (roof + 0.2 + y0) / 2 + sh / 2, sz - 0.14, 0.12, y0 - roof + sh - 0.2, 0.12, "#5c6562", 0, "roof");
            ex.beam("trim", [px, roof + 0.25, sz - 0.85], [px, y0 + sh * 0.6, sz - 0.18], 0.04, "#5c6562", "roof");
            ex.box("trim", px, roof + 0.25, sz - 0.5, 0.14, 0.08, 0.8, "#4d5553", 0, "roof");
            rs.push({ x: px, z: sz - 0.5, w: 0.12, d: 0.4, height: 1.2 });
          }
          for (const yy of [roof + 0.9, y0 - 0.08])
            ex.box("trim", sx, yy, sz - 0.14, sw, 0.08, 0.08, "#5c6562", 0, "roof");
          // gooseneck flood lights over the board
          for (let k = 0; k < 4; k++) {
            const lx = sx - sw * 0.375 + (k * sw) / 4;
            ex.beam("trim", [lx, y0 + sh + 0.05, sz - 0.05], [lx, y0 + sh + 0.45, sz + 0.75], 0.025, "#3a4240", "roof");
            ex.box("dark", lx, y0 + sh + 0.45, sz + 0.8, 0.32, 0.12, 0.22, "#3a4240", 0, "roof");
            ex.box("glow", lx, y0 + sh + 0.385, sz + 0.82, 0.26, 0.012, 0.16, "#ffffff", 0, "roof");
          }
          const nc = NEON[bi % NEON.length];
          const o = sz + 0.2;
          neon.push([sx, y0 - 0.05, o, sw + 0.1, 0.05, 0.05, nc], [sx, y0 + sh + 0.05, o, sw + 0.1, 0.05, 0.05, nc], [sx - sw / 2 - 0.05, y0 + sh / 2, o, 0.05, sh + 0.1, 0.05, nc], [sx + sw / 2 + 0.05, y0 + sh / 2, o, 0.05, sh + 0.1, 0.05, nc]);
          S.roofSigns++;
        }

        // --- projecting blade sign (袖看板) at the street corner of the entrance facade
        if (type !== "residential" || r(7) < 0.45) {
          const words = VERTICAL[type],
            text = words[Math.floor(r(8) * words.length)];
          const bx = x + w / 2 - 1.3,
            by = BASE + FLOOR + 0.8,
            bh = Math.min(7.5, FLOOR * 1.35),
            bwid = 1.15,
            bz = z + d / 2 + 0.35 + bwid / 2;
          const slot = bladeSlot++ % 64,
            ax = (slot % 16) * 128,
            ay = Math.floor(slot / 16) * 512;
          if (bladeSlot <= 64) drawBlade(bg, ax, ay, 128, 512, text, bi);
          const uv = [ax / 2048, 1 - (ay + 512) / 2048, (ax + 128) / 2048, 1 - ay / 2048];
          ex.box("trim", bx, by + bh / 2, bz, 0.22, bh + 0.16, bwid + 0.12, "#3b4442", 0, "facade");
          quads.push({ atlas: 1, c: [bx + 0.115, by + bh / 2, bz], t: [0, 0, -1], u: [0, 1, 0], n: [1, 0, 0], w: bwid, h: bh, uv });
          quads.push({ atlas: 1, c: [bx - 0.115, by + bh / 2, bz], t: [0, 0, 1], u: [0, 1, 0], n: [-1, 0, 0], w: bwid, h: bh, uv });
          for (const yy of [by + 0.4, by + bh - 0.4])
            ex.box("trim", bx, yy, z + d / 2 + 0.2, 0.08, 0.08, 0.5, "#59625f", 0, "facade");
          const nc = NEON[(bi + 3) % NEON.length];
          for (const s2 of [-1, 1]) {
            neon.push([bx + s2 * 0.13, by - 0.04, bz, 0.03, 0.04, bwid + 0.06, nc]);
            neon.push([bx + s2 * 0.13, by + bh + 0.04, bz, 0.03, 0.04, bwid + 0.06, nc]);
            neon.push([bx + s2 * 0.13, by + bh / 2, bz - bwid / 2 - 0.04, 0.03, bh + 0.1, 0.04, nc]);
            neon.push([bx + s2 * 0.13, by + bh / 2, bz + bwid / 2 + 0.04, 0.03, bh + 0.1, 0.04, nc]);
          }
          S.bladeSigns++;
        }

        // --- lived-in balconies: condenser units, drying racks with laundry, stools
        if (type === "residential" || type === "hotel")
          for (let f = 2; f < floors; f += 2)
            for (const side of [-1, 1]) {
              const u = side * w * 0.27,
                bw = w * 0.32,
                y = BASE + f * FLOOR + 0.11,
                zz = z + d / 2,
                list = [];
              const hb = (k) => hash(bi * 7 + f, side + 5, k);
              if (hb(1) < 0.78) {
                const ax = x + u - bw / 2 + 0.75;
                ex.box("trim", ax, y + 0.36, zz + 0.42, 0.82, 0.62, 0.3, "#dcded7", 0, "facade");
                ex.add("cylinder", "dark", ax - 0.1, y + 0.36, zz + 0.575, 0.22, 0.012, 0.22, "#3e4644", Math.PI / 2, 0, 0, "near");
                for (let g = -2; g <= 2; g++) ex.box("trim", ax - 0.1, y + 0.36 + g * 0.08, zz + 0.585, 0.44, 0.01, 0.01, "#9aa29e", 0, "near");
                ex.box("trim", ax + 0.2, y + 0.82, zz + 0.32, 0.05, 0.3, 0.05, "#d7d3c7", 0, "near");
                ex.box("trim", ax, y + 0.03, zz + 0.42, 0.7, 0.06, 0.26, "#6b7370", 0, "near");
                list.push({ x: ax, z: zz + 0.42, w: 0.45, d: 0.2, height: 0.8 });
                S.balconyAC++;
              }
              if (type === "residential" && hb(2) < 0.5) {
                const r0 = x + u - bw / 2 + 1.9,
                  r1 = r0 + 2.3,
                  rz = zz + 1.75;
                for (const px of [r0, r1]) {
                  ex.box("trim", px, y + 0.8, rz, 0.04, 1.6, 0.04, "#c9cfcc", 0, "near");
                  ex.box("trim", px, y + 0.02, rz, 0.06, 0.04, 0.55, "#c9cfcc", 0, "near");
                }
                ex.box("trim", (r0 + r1) / 2, y + 1.56, rz, r1 - r0, 0.03, 0.03, "#c9cfcc", 0, "near");
                const n = 2 + Math.floor(hb(3) * 4);
                for (let k = 0; k < n; k++) {
                  const lw = 0.38 + hb(10 + k) * 0.3,
                    lh = 0.45 + hb(20 + k) * 0.45,
                    lx = r0 + 0.3 + (k + 0.5) * ((r1 - r0 - 0.6) / n);
                  ex.add("box", "fabric", lx, y + 1.55 - lh / 2, rz, lw, lh, 0.02, ["#f1efe8", "#9cc0d6", "#e7b6a5", "#c9d7a8", "#f3d27a", "#d8d2e6", "#ffffff"][Math.floor(hb(30 + k) * 7)], 0, (hb(40 + k) - 0.5) * 0.25, 0, "near");
                }
                list.push({ x: (r0 + r1) / 2, z: rz, w: 1.2, d: 0.12, height: 1.7 });
                S.laundry++;
              }
              if (hb(4) < 0.35) {
                const sx = x + u + bw / 2 - 2.4,
                  sz = zz + 1.5;
                ex.cylinder("timber", sx, y + 0.45, sz, 0.2, 0.04, "#a77d52", "near");
                for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
                  ex.box("trim", sx + dx * 0.12, y + 0.22, sz + dz * 0.12, 0.025, 0.44, 0.025, "#3d4543", 0, "near");
                list.push({ x: sx, z: sz, w: 0.22, d: 0.22, height: 0.5 });
              }
              if (list.length) {
                const key = b.id + ":" + f;
                this.balconySolids.set(key, (this.balconySolids.get(key) || []).concat(list));
              }
            }

        // --- weathering: dirt washed down the floor bands (only the opaque masonry, never
        //     the glass), long runs down the corner columns and brick piers, and splash grime
        //     on the three solid plinths.  The glazed entrance front stays clean.
        const balconyFace = type === "residential" || type === "hotel";
        for (let face = 0; face < 4; face++) {
          const F = frame(b, face);
          for (let f = 1; f < floors; f++) {
            const bandTop = BASE + f * FLOOR + 0.85;
            const k = 1 + Math.floor(hash(bi, face * 97 + f, 5) * 4);
            for (let n = 0; n < k; n++) {
              const u = (hash(bi, face * 131 + f, 10 + n) - 0.5) * (F.len - 3),
                sw = 0.3 + hash(bi, f, 20 + n) * 1.1,
                sh = 0.25 + hash(bi, f, 30 + n) * 0.53;
              if (face === 0 && balconyFace && f % 2 === 0 && Math.min(Math.abs(u - w * 0.27), Math.abs(u + w * 0.27)) < 1.05 + sw / 2) continue;
              streaks.push([...F.at(u, bandTop - sh / 2, 0.218), sw, sh, F.ry]);
            }
            // brick piers on residential side / back faces (same rule as exterior.building)
            if (type === "residential" && face !== 0)
              for (let u = -F.len / 2 + 2; u < F.len / 2 - 1; u += 5.4)
                if (Math.round((u + F.len / 2) / 3.6) % 2 === 0 && hash(bi, face * 53 + f, Math.round(u * 10)) < 0.45) {
                  const sh = 0.8 + hash(bi, f, Math.round(u * 7)) * 3.4;
                  streaks.push([...F.at(u, BASE + f * FLOOR + 5.07 - sh / 2, 0.445), 0.5, sh, F.ry]);
                }
          }
          for (const e of [-1, 1]) {
            const sh = 3 + hash(bi, face, 40 + e) * 9;
            streaks.push([...F.at(e * (F.len / 2), roof - sh / 2 + 0.7, 0.285), 0.5, sh, F.ry]);
          }
          if (face !== 0) grime.push([...F.at(0, 0.62, 0.512), F.len - 0.3, 0.6, F.ry]);
        }
      });
      S.streaks = streaks.length;
      S.neonTubes = neon.length;
      S.beacons = beacons.length;

      // ---- shared meshes ----
      const dummy = new T.Object3D();
      const instanced = (geo, material, rows, name, write) => {
        const mesh = new T.InstancedMesh(geo, material, Math.max(1, rows.length));
        rows.forEach((row, i) => {
          write(row);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.count = rows.length;
        mesh.frustumCulled = false;
        mesh.raycast = () => {};
        mesh.name = name;
        mesh.userData.detailFacade = true;
        api.scene.add(mesh);
        return mesh;
      };
      const plane = new T.PlaneGeometry(1, 1);
      this.streakMesh = instanced(plane, makeStreakMaterial(T), streaks, "detail-facade-streaks", (s2) => {
        dummy.position.set(s2[0], s2[1], s2[2]);
        dummy.rotation.set(0, s2[5], 0);
        dummy.scale.set(s2[3], s2[4], 1);
      });
      this.streakMesh.renderOrder = 2;
      const grimeMat = makeGrimeMaterial(T);
      this.grimeMesh = instanced(plane, grimeMat, grime, "detail-facade-grime", (s2) => {
        dummy.position.set(s2[0], s2[1], s2[2]);
        dummy.rotation.set(0, s2[5], 0);
        dummy.scale.set(s2[3], s2[4], 1);
      });
      this.grimeMesh.renderOrder = 2;
      this.neonMaterial = new T.MeshBasicMaterial({ color: "#ffffff" });
      this.neonMesh = instanced(new T.BoxGeometry(1, 1, 1), this.neonMaterial, neon, "detail-facade-neon", (s2) => {
        dummy.position.set(s2[0], s2[1], s2[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(s2[3], s2[4], s2[5]);
      });
      const color = new T.Color();
      neon.forEach((s2, i) => this.neonMesh.setColorAt(i, color.set(s2[6])));
      if (this.neonMesh.instanceColor) this.neonMesh.instanceColor.needsUpdate = true;
      this.beaconMaterial = new T.MeshBasicMaterial({ color: "#ff2a1a" });
      this.beaconMesh = instanced(new T.IcosahedronGeometry(1, 1), this.beaconMaterial, beacons, "detail-facade-beacons", (s2) => {
        dummy.position.set(s2[0], s2[1], s2[2]);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(s2[3]);
      });
      // Sign faces: two merged meshes (one per atlas), emissive at night.
      this.signMaterials = [];
      [roofAtlas, bladeAtlas].forEach((canvas, a) => {
        const list = quads.filter((q) => q.atlas === a);
        if (!list.length) return;
        const pos = [],
          nor = [],
          uvs = [],
          idx = [];
        list.forEach((q, i) => {
          const corner = (sx, sy) => [0, 1, 2].map((k) => q.c[k] + q.t[k] * sx * q.w * 0.5 + q.u[k] * sy * q.h * 0.5);
          pos.push(...corner(-1, -1), ...corner(1, -1), ...corner(1, 1), ...corner(-1, 1));
          for (let k = 0; k < 4; k++) nor.push(...q.n);
          const [u0, v0, u1, v1] = q.uv;
          uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
          idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
        });
        const geo = new T.BufferGeometry();
        geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
        geo.setAttribute("normal", new T.Float32BufferAttribute(nor, 3));
        geo.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
        geo.setIndex(idx);
        const tex = new T.CanvasTexture(canvas);
        tex.colorSpace = T.SRGBColorSpace;
        tex.anisotropy = Math.min(8, api.renderer.capabilities.getMaxAnisotropy());
        const m = new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: "#ffffff", emissiveIntensity: 0.12, roughness: 0.55, metalness: 0 });
        const mesh = new T.Mesh(geo, m);
        mesh.raycast = () => {};
        mesh.name = "detail-facade-signs-" + a;
        mesh.userData.detailFacade = true;
        mesh.frustumCulled = false;
        api.scene.add(mesh);
        this.signMaterials.push(m);
      });
      this.applyLights(api.getTime(), true);
    },
    applyLights(mode, snap) {
      const night = mode === "night",
        golden = mode === "golden";
      this.lightTarget = { sign: night ? 1.15 : golden ? 0.3 : 0.08, neon: night ? 3.2 : golden ? 1.3 : 0.75 };
      if (snap || !this.light) this.light = { ...this.lightTarget };
    },
    updateLights(dt, clock) {
      if (!this.neonMaterial) return;
      const k = Math.min(1, dt * 0.8);
      for (const key in this.lightTarget) this.light[key] += (this.lightTarget[key] - this.light[key]) * k;
      for (const m of this.signMaterials) m.emissiveIntensity = this.light.sign;
      // A neon transformer buzz: very slight flicker, plus a rare stutter.
      const flick = 1 - 0.04 * Math.sin(clock * 61) * Math.sin(clock * 17) - (Math.sin(clock * 0.7) > 0.995 ? 0.5 : 0);
      this.neonMaterial.color.setScalar(this.light.neon * flick);
      const night = this.light.neon > 2;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 2.1);
      this.beaconMaterial.color.setRGB(1, 0.16, 0.1).multiplyScalar(night ? 0.6 + 3.4 * pulse * pulse : 1.2);
    },

    name: "facade",
    owner: "C",
    stats: { windowBays: 0, buildings: 0 },
    city(api) {
      this.api = api;
      this.buildWindows(api);
      this.buildDressing(api);
    },
    buildWindows(api) {
      const T = api.THREE;
      const items = [];
      api.buildings.forEach((b, index) => {
        const typeCode = TYPE[b.type] ?? 0;
        for (let f = 1; f < b.floors; f++) {
          const y0 = BASE + f * FLOOR - 0.04,
            H = 5.36,
            cy = y0 + H / 2;
          // Four faces: +z (south, entrance side), -z, +x, -x.  Plane sits 0.12 m inside the glass.
          for (let face = 0; face < 4; face++) {
            const alongX = face < 2,
              side = face % 2 === 0 ? 1 : -1,
              len = (alongX ? b.w : b.d) - 0.6;
            const inset = (alongX ? b.d : b.w) / 2 - 0.12;
            const px = alongX ? b.x : b.x + side * inset,
              pz = alongX ? b.z + side * inset : b.z;
            // Plane +Z must point outwards.
            const ry = alongX ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
            items.push({ px, py: cy, pz, ry, len, H, info: [index, f, typeCode, face] });
          }
        }
      });
      const geo = new T.PlaneGeometry(1, 1);
      const uniforms = T.UniformsUtils.merge([
        T.UniformsLib.fog,
        {
          uNight: { value: 0 },
          uGolden: { value: 1 },
          uDay: { value: 0 },
          uClock: { value: 0 },
          uHide: { value: new T.Vector4(-1, -1, 0, 0) },
          uDebug: { value: 0 },
        },
      ]);
      // Share the live sky colours (setTime() mutates these objects).
      uniforms.uSkyTop = api.skyUniforms.top;
      uniforms.uSkyBottom = api.skyUniforms.bottom;
      const material = new T.ShaderMaterial({
        uniforms,
        vertexShader: VERT,
        fragmentShader: FRAG,
        fog: true,
        extensions: { derivatives: true },
      });
      const mesh = new T.InstancedMesh(geo, material, items.length);
      const info = new Float32Array(items.length * 4);
      const dummy = new T.Object3D();
      items.forEach((it, i) => {
        dummy.position.set(it.px, it.py, it.pz);
        dummy.rotation.set(0, it.ry, 0);
        dummy.scale.set(it.len, it.H, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        info.set(it.info, i * 4);
      });
      geo.setAttribute("aInfo", new T.InstancedBufferAttribute(info, 4));
      mesh.frustumCulled = false; // instances span the whole city; vertex cost is trivial
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.raycast = () => {}; // never blocks photo line-of-sight or interaction rays
      mesh.name = "detail-facade-windows";
      mesh.userData.detailFacade = true;
      api.scene.add(mesh);
      this.windows = mesh;
      this.uniforms = uniforms;
      this.stats.windowBays = items.length;
      this.stats.buildings = api.buildings.length;
      this.applyTime(api.getTime(), true);
    },
    applyTime(mode, snap) {
      this.target = {
        uNight: mode === "night" ? 1 : 0,
        uGolden: mode === "golden" ? 1 : 0,
        uDay: mode === "day" ? 1 : 0,
      };
      if (snap) for (const k in this.target) this.uniforms[k].value = this.target[k];
    },
    timeChanged(api, mode) {
      this.applyTime(mode, false);
      this.applyLights(mode, false);
    },
    floorLoaded(api, b, f) {
      // interior() rebuilds b.solids[f] on every load; re-add the balcony furniture.
      const list = this.balconySolids?.get(b.id + ":" + f);
      if (list && b.solids[f]) b.solids[f].push(...list.map((s) => ({ ...s })));
    },
    update(dt, api) {
      if (!this.uniforms) return;
      const u = this.uniforms;
      u.uClock.value += dt;
      this.updateLights(dt, u.uClock.value);
      const k = Math.min(1, dt * 0.8);
      for (const key in this.target) u[key].value += (this.target[key] - u[key].value) * k;
      const p = api.player,
        b = p.building,
        inside = b && p.floor > 0 && p.floor < b.floors;
      u.uHide.value.set(inside ? api.buildings.indexOf(b) : -1, inside ? p.floor : -1, 0, inside ? 1 : 0);
    },
    selfTest(api) {
      const m = this.windows;
      return {
        registered: true,
        windowsBuilt: !!m && m.count === this.stats.windowBays && m.count > 1000,
        windowsInScene: !!m && m.parent === api.scene,
        windowsDoNotRaycast: !!m && (() => {
          const hits = [];
          m.raycast(new api.THREE.Raycaster(), hits);
          return hits.length === 0;
        })(),
        windowsNoShadow: !!m && !m.castShadow,
        rooftopPlant: this.stats.waterTanks > 10 && this.stats.condensers > 150 && this.stats.cubicles === api.buildings.length,
        signsBuilt: this.stats.roofSigns > 15 && this.stats.bladeSigns > 30 && this.signMaterials.length === 2,
        neonAndBeacons: this.neonMesh.count === this.stats.neonTubes && this.beaconMesh.count === this.stats.beacons && this.stats.beacons > 20,
        weathering: this.streakMesh.count > 3000 && this.grimeMesh.count === api.buildings.length * 3,
        balconiesLivedIn: this.stats.balconyAC > 100 && this.balconySolids.size > 50,
        roofSolidsRegistered: api.buildings.every((b) => (b.solids[b.floors] || []).length >= 20),
      };
    },
    snapshot() {
      return { ...this.stats, hide: this.uniforms?.uHide.value.toArray() };
    },
  };
  (window.EvercityDetails ||= []).push(plugin);
})();
