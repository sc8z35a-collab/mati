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

  const plugin = {
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
    },
    update(dt, api) {
      if (!this.uniforms) return;
      const u = this.uniforms;
      u.uClock.value += dt;
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
      };
    },
    snapshot() {
      return { ...this.stats, hide: this.uniforms?.uHide.value.toArray() };
    },
  };
  (window.EvercityDetails ||= []).push(plugin);
})();
