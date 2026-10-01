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
    varying vec3 vWorld;
    varying vec3 vT;
    varying vec3 vN;
    varying vec2 vUV;
    varying vec4 vInfo;
    #include <common>
    #include <fog_pars_fragment>

    float h2(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
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
    // Analytically box-filtered pulse train (integral of the pulse over the pixel footprint):
    // no aliasing, converges to the duty cycle when the pattern is finer than a pixel.
    float pulseInt(float x, float duty) { return floor(x) * duty + clamp(fract(x) - (1.0 - duty), 0.0, duty); }
    float stripes(float x, float period, float duty) {
      float w = max(FW / period, 1e-3);
      float u = x / period;
      return (pulseInt(u + w, duty) - pulseInt(u - w, duty)) / (2.0 * w);
    }

    void main() {
      // The floor the player is on shows its real, loaded interior instead.
      if (uHide.w > 0.5 && abs(vInfo.x - uHide.x) < 0.5 && abs(vInfo.y - uHide.y) < 0.5) discard;
      vec4 info = floor(vInfo + 0.5);
      float type = info.z;
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
      vec2 cell = vec2(cx, info.y) + info.x * vec2(7.13, 3.71) + info.w * 31.7;
      float r1 = h2(cell), r2 = h2(cell + 17.3), r3 = h2(cell + 41.9), r4 = h2(cell + 3.1), r5 = h2(cell + 77.7);

      vec3 V = normalize(vWorld - cameraPosition);
      float camDist = max(length(vWorld - cameraPosition), 0.5);
      float pix = max(length(fwidth(vUV)), 1e-4);
      FW = pix * 1.5;
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
      float lampI = lit * (0.22 + 0.16 * uGolden + 0.95 * uNight);
      vec3 daylight = uSkyBottom * (0.34 * uDay + 0.26 * uGolden) + vec3(0.09, 0.1, 0.14) * uNight;

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
        FW = min(FW * 1.6, 0.8);
        float far = smoothstep(0.02, 0.07, FW); // 1 = too far for fine pattern detail
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
              float books = stripes(q.y, 0.42, 0.82) * mix(step(0.1, fract(q.x / 0.09 + h2(floor(q.yy / 0.42)))), 0.9, far);
              vec3 bookC = lin(mix(vec3(0.6, 0.3, 0.25), vec3(0.3, 0.45, 0.55), mix(h2(floor(q / vec2(0.09, 0.42))), 0.5, far)));
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
          if (office) alb = lin(vec3(0.36, 0.37, 0.38)) * (0.97 + 0.06 * mix(h2(floor(h.xz / 0.5)) - 0.5, 0.0, far));
          else if (gallery) alb = lin(vec3(0.62, 0.61, 0.58));
          else {
            float plank = floor(h.x / 0.19);
            alb = lin(mix(vec3(0.52, 0.37, 0.24), vec3(0.62, 0.48, 0.33), r1)) * (0.95 + mix(0.22 * h2(vec2(plank, floor(h.z / 1.6 + plank * 0.37))) - 0.11, 0.0, far));
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
          FW = min(pix * (1.0 + tf / camDist) * 1.4, 0.5);
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
              fc = leaves > 0.5 ? lin(vec3(0.22, 0.38, 0.2)) * (0.9 + 0.2 * sin(q.x * 11.0) * sin(q.y * 13.0)) : pot > 0.5 ? lin(vec3(0.6, 0.42, 0.32)) : lampShade > 0.5 ? lin(vec3(0.9, 0.86, 0.76)) : sofaC;
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
      this.rng = 90127;
      this.signs = [];
      this.beacons = [];
      api.buildings.forEach((b, i) => {
        this.rooftop(api, b, i);
        this.signage(api, b, i);
        this.weathering(api, b, i);
      });
      this.buildSignMeshes(api);
      this.buildBeacons(api);
    },
    rand() {
      this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
      return this.rng / 4294967296;
    },
    // ---- 2. rooftops: water tanks, antenna masts, dishes, condensers, cubicle, railings ----
    rooftop(api, b, i) {
      const E = api.exterior,
        roof = BASE + b.floors * FLOOR,
        { x, z, w, d } = b,
        r = () => this.rand();
      const steel = "#8d989a", paint = ["#c9c3b4", "#a9b3ae", "#b9a68b"][i % 3];
      const solids = (b.solids[b.floors] ||= []);
      const roofBox = (mat, xx, y, zz, sw, sh, sd, c, ry = 0) => E.box(mat, xx, roof + y, zz, sw, sh, sd, c, ry, "roof");
      // Elevated water tank on a steel frame (NW quadrant, clear of the lift core and seating).
      if (b.floors >= 8 || i % 3 === 0) {
        const tx = x - w / 2 + 6.4, tz = z - d / 2 + 4.2, legH = 2.6;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          roofBox("trim", tx + sx * 1.25, legH / 2 + 0.2, tz + sz * 1.25, 0.14, legH, 0.14, steel);
          roofBox("trim", tx + sx * 1.25, 0.24, tz + sz * 1.25, 0.4, 0.08, 0.4, "#6d7676");
        }
        for (const yy of [0.9, 1.9]) {
          roofBox("trim", tx, yy, tz - 1.25, 2.5, 0.07, 0.07, steel);
          roofBox("trim", tx, yy, tz + 1.25, 2.5, 0.07, 0.07, steel);
          roofBox("trim", tx - 1.25, yy, tz, 0.07, 0.07, 2.5, steel);
          roofBox("trim", tx + 1.25, yy, tz, 0.07, 0.07, 2.5, steel);
        }
        roofBox("trim", tx, legH + 0.25, tz, 3.0, 0.12, 3.0, "#727c7c");
        if (i % 2) {
          // Cylindrical FRP tank with hoops
          E.cylinder("render", tx, roof + legH + 1.45, tz, 1.3, 2.3, paint, "roof");
          for (const yy of [0.55, 1.2, 1.85]) E.cylinder("trim", tx, roof + legH + 0.3 + yy, tz, 1.33, 0.06, "#7f8786", "roof");
          E.cylinder("trim", tx, roof + legH + 2.66, tz, 1.1, 0.12, "#9aa3a0", "roof");
          E.cylinder("trim", tx, roof + legH + 2.8, tz, 0.3, 0.18, "#7f8786", "roof");
        } else {
          // Panel tank (Japanese FRP sectional tank): 1 m grid embossing
          roofBox("render", tx, legH + 1.4, tz, 2.6, 2.2, 2.6, paint);
          for (let n = -1; n <= 1; n++) {
            roofBox("render", tx + n * 0.86, legH + 1.4, tz + 1.31, 0.05, 2.2, 0.04, "#d8d3c5");
            roofBox("render", tx + 1.31, legH + 1.4, tz + n * 0.86, 0.04, 2.2, 0.05, "#d8d3c5");
          }
          for (const yy of [0.75, 1.5]) {
            roofBox("render", tx, legH + 0.3 + yy, tz + 1.31, 2.6, 0.05, 0.04, "#d8d3c5");
            roofBox("render", tx + 1.31, legH + 0.3 + yy, tz, 0.04, 0.05, 2.6, "#d8d3c5");
          }
          roofBox("trim", tx + 0.6, legH + 2.56, tz + 0.6, 0.6, 0.1, 0.6, "#7f8786"); // manhole
        }
        // Caged access ladder
        for (const sx of [-0.22, 0.22]) roofBox("trim", tx + 1.42 + 0.02, 1.9, tz + sx, 0.05, 3.4, 0.05, steel);
        for (let n = 0; n < 10; n++) roofBox("trim", tx + 1.44, 0.45 + n * 0.32, tz, 0.035, 0.035, 0.44, steel);
        for (let n = 0; n < 5; n++) E.add("ring", "trim", tx + 1.75, roof + 1.6 + n * 0.45, tz, 0.36, 0.36, 0.36, steel, Math.PI / 2, 0, 0, "roof");
        // Supply pipe down to the roof
        E.cylinder("trim", tx - 0.6, roof + legH / 2 + 0.2, tz + 0.6, 0.07, legH, "#9a8f7c", "roof");
        roofBox("trim", tx - 0.6, 0.35, tz + 2.2, 0.14, 0.14, 3.2, "#9a8f7c");
        solids.push({ x: tx, z: tz, w: 1.6, d: 1.6, height: 6 });
      }
      // Antenna mast with guy wires, lightning rod, and (tall buildings) an aviation obstruction light.
      {
        const ax = x + w / 2 - 3.2, az = z + d / 2 - 9.5, h = b.floors >= 14 ? 9 : 5.5;
        E.cylinder("trim", ax, roof + h / 2, az, 0.06, h, "#a7aeac", "roof");
        E.cylinder("trim", ax, roof + 0.18, az, 0.28, 0.12, "#6d7676", "roof");
        for (const k of [0.45, 0.72]) {
          const y = roof + h * k;
          E.box("trim", ax, y, az, 1.6 - k, 0.03, 0.03, "#b0b6b4", 0, "roof");
          for (let n = -2; n <= 2; n++) E.box("trim", ax + n * 0.3, y - 0.2, az, 0.015, 0.4, 0.015, "#b0b6b4", 0, "roof");
        }
        for (let n = 0; n < 3; n++) {
          const a = n * 2.094 + 0.4;
          E.beam("trim", [ax, roof + h * 0.8, az], [ax + Math.cos(a) * 2.6, roof + 0.25, az + Math.sin(a) * 2.6], 0.008, "#c9cdca", "roof");
        }
        E.cylinder("trim", ax, roof + h + 0.6, az, 0.015, 1.2, "#c0b080", "roof");
        if (b.floors >= 14) this.beacons.push([ax, roof + h + 0.25, az]);
        solids.push({ x: ax, z: az, w: 0.35, d: 0.35, height: h });
      }
      // Satellite dishes (2-4), pointing roughly south-west.
      const dishes = 2 + (i % 3);
      for (let n = 0; n < dishes; n++) {
        const dx = x + w / 2 - 2.0, dz = z - d / 2 + 16 + n * 1.6, s = 0.38 + r() * 0.22;
        E.cylinder("trim", dx, roof + 0.55, dz, 0.035, 0.7, "#8c9496", "roof");
        E.add("sphere", "render", dx - 0.12, roof + 1.0, dz, s, s, s * 0.22, "#e3e2dc", -0.6, -0.7 + r() * 0.3, 0, "roof");
        E.beam("trim", [dx - 0.12, roof + 1.0, dz], [dx - 0.55, roof + 1.32, dz + 0.1], 0.012, "#9a9f9c", "roof");
      }
      // Condenser units with fan grilles, on anti-vibration rails, connected by insulated pipes.
      const units = 3 + (i % 4);
      for (let n = 0; n < units; n++) {
        const cx = x - w / 2 + 3.5 + n * 1.25, cz = z + d / 2 - 6.5;
        roofBox("trim", cx, 0.27, cz, 1.1, 0.1, 0.9, "#5e6767");
        roofBox("render", cx, 0.7, cz, 0.95, 0.76, 0.42, "#e4e3dc");
        E.cylinder("dark", cx - 0.12, roof + 0.72, cz + 0.215, 0.27, 0.01, "#ffffff", "roof");
        E.add("cylinder", "dark", cx - 0.12, roof + 0.72, cz + 0.218, 0.27, 0.012, 0.27, "#333a3c", Math.PI / 2, 0, 0, "roof");
        for (let k = -2; k <= 2; k++) roofBox("trim", cx - 0.12 + k * 0.1, 0.72, cz + 0.225, 0.012, 0.5, 0.012, "#c6c9c5");
        roofBox("trim", cx + 0.32, 0.72, cz + 0.215, 0.18, 0.6, 0.01, "#c9cac4");
        roofBox("render", cx + 0.38, 0.62, cz - 0.4, 0.1, 0.1, 0.5, "#f0eee6"); // insulated pipe
      }
      roofBox("render", x - w / 2 + 3.5 + (units - 1) * 0.625, 0.62, z + d / 2 - 7.2, units * 1.25, 0.12, 0.12, "#f0eee6");
      solids.push({ x: x - w / 2 + 3.5 + (units - 1) * 0.625, z: z + d / 2 - 6.5, w: units * 0.63, d: 0.5, height: 1.2 });
      // Parapet top flashing + inner guard rail along the parapet (1.1 m), every building.
      for (const side of [-1, 1]) {
        roofBox("trim", x + (side * w) / 2, 1.27, z, 0.48, 0.04, d + 0.08, "#9ea6a3");
        roofBox("trim", x, 1.27, z + (side * d) / 2, w + 0.08, 0.04, 0.48, "#9ea6a3");
      }
      // Roof drains & a few cracked-membrane patches.
      for (let n = 0; n < 4; n++) {
        const px = x + (n % 2 ? 1 : -1) * (w / 2 - 1.2), pz = z + (n < 2 ? -1 : 1) * (d / 2 - 1.2);
        E.cylinder("dark", px, roof + 0.205, pz, 0.18, 0.02, "#3a4243", "roof");
        E.cylinder("trim", px, roof + 0.23, pz, 0.12, 0.05, "#59605f", "roof");
      }
      for (let n = 0; n < 5; n++)
        E.add("leaf", "contact", x + (r() - 0.5) * w * 0.7, roof + 0.207, z + (r() - 0.5) * d * 0.5, 1.5 + r() * 2.5, 1 + r() * 2, 1, "#ffffff", -Math.PI / 2, 0, r() * 3, "roof");
      // Rooftop billboard frame for shops / hotels (sign face drawn by buildSignMeshes).
      if (b.type === "shop" || b.type === "hotel" || (b.type === "office" && b.floors < 14)) {
        const bx = x - w * 0.22, bz = z - d / 2 + 1.0, bw = 10, bh = 3.2;
        for (const sx of [-0.42, 0, 0.42]) {
          roofBox("trim", bx + sx * bw, 1.6, bz, 0.12, 3.2, 0.12, "#59625f");
          E.beam("trim", [bx + sx * bw, roof + 0.2, bz + 1.4], [bx + sx * bw, roof + 2.9, bz], 0.05, "#59625f", "roof");
        }
        roofBox("trim", bx, 3.25 + bh / 2, bz - 0.1, bw + 0.3, bh + 0.3, 0.12, "#3b4444");
        roofBox("trim", bx, 3.0, bz + 0.45, bw, 0.05, 0.6, "#7b8584"); // catwalk
        for (let n = 0; n < 4; n++) E.add("cylinder", "glow", bx - bw * 0.38 + n * bw * 0.25, roof + 3.15, bz + 0.75, 0.07, 0.4, 0.07, "#ffffff", 1.2, 0, 0, "roof"); // flood lamps
        this.signs.push({ kind: "billboard", b, x: bx, y: roof + 3.25 + bh / 2, z: bz + 0.0, w: bw, h: bh, ry: 0 });
        solids.push({ x: bx, z: bz + 0.6, w: bw / 2, d: 0.9, height: 3 });
      }
    },
    // ---- 3. signage: projecting blade signs, neon, awnings, wall AC units with pipes ----
    signage(api, b, i) {
      const E = api.exterior,
        { x, z, w, d, type } = b,
        front = z + d / 2;
      // Projecting vertical blade sign at the east corner of the street face (2nd-4th floor).
      if (type !== "residential" || i % 3 === 0) {
        const sx = x + w / 2 - 1.4, h = 7.5, y = BASE + FLOOR + 1 + h / 2;
        for (const yy of [y - h / 2 + 0.6, y + h / 2 - 0.6]) E.box("trim", sx, yy, front + 0.55, 0.08, 0.08, 1.1, "#4b5555", 0, "facade");
        this.signs.push({ kind: "blade", b, x: sx, y, z: front + 1.25, w: 1.25, h, ry: Math.PI / 2 });
      }
      // Fabric awnings over the ground-floor glazing for shops & cafes, gallery gets a steel canopy.
      if (type === "shop") {
        const col = [["#9f4c3c", "#e7dfcc"], ["#2f5d74", "#e9e4d6"], ["#d8a53c", "#f3ecd8"]][i % 3];
        for (const side of [-1, 1]) {
          const ax = x + side * (w / 4 + 1.5), aw = (w - 9) / 2 - 1;
          for (let n = 0; n < Math.floor(aw / 0.6); n++)
            E.add("box", "fabric", ax - aw / 2 + 0.3 + n * 0.6, 4.55, front + 0.85, 0.6, 0.04, 1.7, col[n % 2], -0.42, 0, 0, "facade");
          for (let n = 0; n < Math.floor(aw / 0.6); n++)
            E.box("fabric", ax - aw / 2 + 0.3 + n * 0.6, 4.02, front + 1.66, 0.6, 0.3, 0.03, col[n % 2], 0, "facade"); // valance
          E.box("trim", ax, 4.9, front + 0.12, aw + 0.2, 0.1, 0.12, "#4d5654", 0, "facade");
        }
      }
      // Neon tubes (emissive glow material) on cafes/shops/hotels: outline + word strokes.
      if (type === "cafe" || type === "shop" || type === "hotel" || type === "gallery") {
        this.signs.push({ kind: "neon", b, x: x + w / 4 + 1.5, y: BASE + FLOOR + 0.6, z: front + 0.46, w: 5.2, h: 1.1, ry: 0 });
      }
      // Wall-mounted split AC units on side walls of residential/hotel floors (with pipe ducts).
      if (type === "residential" || type === "hotel") {
        for (let f = 2; f < b.floors; f++) {
          for (const side of [-1, 1]) {
            if ((f + i + (side > 0 ? 1 : 0)) % 3 === 0) continue;
            const wx = x + side * (w / 2 + 0.62), wz = z + ((f * 7 + i * 3) % 5 - 2) * 5.4 + 1.2, y = BASE + f * FLOOR + 0.55;
            E.box("render", wx, y, wz, 0.42, 0.62, 0.86, "#e6e4dd", 0, "facade");
            E.add("cylinder", "dark", wx + side * 0.215, y, wz - 0.12, 0.22, 0.01, 0.22, "#3a4143", 0, 0, Math.PI / 2, "near");
            E.box("trim", wx - side * 0.05, y - 0.38, wz, 0.5, 0.05, 0.9, "#8f9895", 0, "near");
            E.box("render", wx - side * 0.12, y + 1.4, wz + 0.5, 0.12, 2.3, 0.12, "#ecebe5", 0, "near"); // pipe duct
            for (const dz of [-0.3, 0.3]) E.box("trim", wx - side * 0.33, y - 0.33, wz + dz, 0.5, 0.05, 0.05, "#6f7774", 0, "near"); // brackets
          }
        }
      }
    },
    // ---- 4. weathering: rain streaks under sills / parapet, plinth splash band ----
    weathering(api, b, i) {
      const E = api.exterior,
        { x, z, w, d } = b,
        roof = BASE + b.floors * FLOOR,
        r = () => this.rand();
      for (let face = 0; face < 4; face++) {
        const alongX = face < 2, side = face % 2 ? -1 : 1, len = alongX ? w : d;
        const at = (u, out) => (alongX ? [x + u, z + side * (d / 2 + out)] : [x + side * (w / 2 + out), z + u]);
        const ry = alongX ? (side > 0 ? 0 : Math.PI) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
        // Splash band at the plinth (0-0.4 m above pavement) — agreed boundary with B.
        if (face !== 0) {
          for (let k = 0; k < Math.floor(len / 3); k++) {
            const [px, pz] = at(-len / 2 + 1.5 + k * 3, 0.52);
            E.add("leaf", "contact", px, 0.5, pz, 3.2, 0.42 + r() * 0.2, 1, "#ffffff", 0, ry, 0, "near");
          }
        }
      }
    },
    // Canvas-drawn sign faces. All blade / billboard faces share one atlas texture = 1 material.
    buildSignMeshes(api) {
      const T = api.THREE;
      const N = this.signs.filter((s) => s.kind !== "neon");
      const cols = 10, rows = Math.ceil(N.length / cols), cw = 192, ch = 384;
      const c = document.createElement("canvas");
      c.width = cols * cw;
      c.height = rows * ch;
      const g = c.getContext("2d");
      const JP = { office: ["オフィス", "テナント募集"], hotel: ["ホテル", "空室あり"], residential: ["レジデンス", "入居者募集"], shop: ["マーケット", "毎日新鮮"], cafe: ["喫茶", "珈琲"], gallery: ["画廊", "企画展"] };
      const palettes = [["#1f3b3f", "#f3e6c8", "#e9a95b"], ["#7d2f28", "#fbefd9", "#ffd27a"], ["#f2ede0", "#1f3436", "#c4553f"], ["#24324a", "#e8eef8", "#7fd0d6"], ["#2f4a35", "#f5ecd2", "#e7c06a"], ["#111417", "#f6d9a4", "#ff7a5a"]];
      const WORDS = { office: ["設計事務所", "法律事務所", "オフィス", "税理士"], hotel: ["ホテル", "旅館", "宿"], residential: ["歯科", "学習塾", "整骨院", "不動産"], shop: ["青果", "雑貨", "薬局", "書店", "酒"], cafe: ["喫茶", "珈琲", "甘味処"], gallery: ["画廊", "美術", "写真館"] };
      const brands = ["SAKURA", "HIKARI", "MIDORI", "TSUKI", "KAZE", "SORA", "UMI", "YAMA", "HANA", "KOMOREBI"];
      const blades = [], boards = [];
      N.forEach((s, k) => {
        const ox = (k % cols) * cw, oy = Math.floor(k / cols) * ch, pal = palettes[(((k * 7 + Math.round(s.b.x / 72) * 3) % palettes.length) + palettes.length) % palettes.length];
        s.uv = [ox / c.width, 1 - (oy + ch) / c.height, cw / c.width, ch / c.height];
        const jp = JP[s.b.type] || JP.office;
        g.save();
        g.translate(ox, oy);
        g.scale(cw / 256, ch / 512);
        g.fillStyle = pal[0];
        g.fillRect(0, 0, 256, 512);
        if (s.kind === "blade") {
          g.strokeStyle = pal[2]; g.lineWidth = 10; g.strokeRect(12, 12, 232, 488);
          g.fillStyle = pal[1]; g.textAlign = "center"; g.textBaseline = "middle";
          const pool = WORDS[s.b.type] || WORDS.office;
          let word = (s.b.jp || "").replace(/[・ ]/g, "");
          if (word.length > 6 || k % 2) word = pool[k % pool.length];
          const step = Math.min(84, 392 / word.length);
          g.font = `bold ${Math.floor(step * 0.92)}px "Noto Sans CJK JP", "Noto Sans JP", sans-serif`;
          [...word].forEach((chr, n) => g.fillText(chr, 128, 50 + (392 - step * word.length) / 2 + step / 2 + n * step));
          g.fillStyle = pal[2]; g.font = 'bold 26px sans-serif';
          g.fillText(String((k % 4) + 2) + "F", 128, 466);
          blades.push(s);
        } else {
          // billboard: drawn into a 256x512 cell rotated (wide face) -> draw sideways
          g.translate(256, 0); g.rotate(Math.PI / 2);
          const W = 512, H = 256;
          const grd = g.createLinearGradient(0, 0, W, H);
          grd.addColorStop(0, pal[0]); grd.addColorStop(1, pal[2]);
          g.fillStyle = grd; g.fillRect(0, 0, W, H);
          g.fillStyle = "rgba(255,255,255,.12)";
          for (let n = 0; n < 6; n++) { g.beginPath(); g.arc(W * (0.6 + n * 0.08), H * 0.5, 40 + n * 22, 0, 7); g.fill(); }
          g.fillStyle = pal[1]; g.textAlign = "left"; g.textBaseline = "alphabetic";
          g.font = 'bold 64px "Noto Sans CJK JP", sans-serif';
          g.fillText(brands[k % brands.length], 26, 110);
          g.font = 'bold 40px "Noto Sans CJK JP", sans-serif';
          g.fillText(jp[1], 28, 172);
          g.font = '22px sans-serif';
          g.fillText("EVERCITY · " + s.b.name.slice(0, 22), 30, 226);
          boards.push(s);
        }
        g.restore();
      });
      const tex = new T.CanvasTexture(c);
      tex.colorSpace = T.SRGBColorSpace;
      tex.anisotropy = Math.min(8, api.renderer.capabilities.getMaxAnisotropy());
      // Internally lit sign faces: emissive map = the same artwork, strength driven by time of day.
      const mat = new T.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new T.Color("#ffffff"), emissiveIntensity: 0.15, roughness: 0.55 });
      const geo = new T.PlaneGeometry(1, 1);
            const list = [...blades, ...boards];
      const mesh = new T.InstancedMesh(geo, mat, list.length * 2);
      const dummy = new T.Object3D();
      list.forEach((s, k) => {
        for (let face = 0; face < 2; face++) {
          const idx = k * 2 + face;
          const off = s.kind === "blade" ? (face ? -0.07 : 0.07) : face ? -0.07 : 0.07;
          if (s.kind === "blade") dummy.position.set(s.x + off, s.y, s.z);
          else dummy.position.set(s.x, s.y, s.z + off - 0.1);
          dummy.rotation.set(0, (s.kind === "blade" ? s.ry : 0) + (face ? Math.PI : 0), 0);
          dummy.scale.set(s.w, s.h, 1);
          dummy.updateMatrix();
          mesh.setMatrixAt(idx, dummy.matrix);
        }
      });
      const uvs = new Float32Array(list.length * 2 * 4);
      list.forEach((s, k) => {
        const uv = s.kind === "billboard" ? [s.uv[0], s.uv[1], -s.uv[2], s.uv[3]] : s.uv;
        uvs.set(uv, k * 8);
        uvs.set(uv, k * 8 + 4);
      });
      geo.setAttribute("aSignUV", new T.InstancedBufferAttribute(uvs, 4));
      mat.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute vec4 aSignUV;")
          .replace("#include <uv_vertex>", "#include <uv_vertex>\nvec2 signUv = aSignUV.z < 0.0 ? vec2(uv.y, 1.0 - uv.x) : uv;\nvec2 signAt = aSignUV.xy + signUv * abs(aSignUV.zw);\n#ifdef USE_MAP\n vMapUv = signAt;\n#endif\n#ifdef USE_EMISSIVEMAP\n vEmissiveMapUv = signAt;\n#endif");
      };
      mat.customProgramCacheKey = () => "detail-facade-sign-atlas";
      mesh.raycast = () => {};
      mesh.name = "detail-facade-signs";
      mesh.castShadow = false;
      api.scene.add(mesh);
      this.signMesh = mesh;
      this.signMat = mat;
      // Blade sign boxes (thickness / frame) ride on the exterior batches.
      for (const s of blades) {
        api.exterior.box("trim", s.x, s.y, s.z, 0.13, s.h + 0.12, s.w + 0.12, "#3a4243", 0, "facade");
        api.exterior.box("trim", s.x, s.y + s.h / 2 + 0.12, s.z, 0.22, 0.1, s.w + 0.2, "#59625f", 0, "facade");
      }
      this.stats.blades = blades.length;
      this.stats.billboards = boards.length;
      this.buildNeon(api);
    },
    buildNeon(api) {
      // Neon: thin glowing tubes drawn as short boxes along a path. Shared emissive material so
      // HDR bloom catches them at night; one InstancedMesh for every neon in the city.
      const T = api.THREE;
      const segs = [];
      const neons = this.signs.filter((s) => s.kind === "neon");
      const palette = ["#ff4f7b", "#5ff4ff", "#ffd34f", "#9dff6a", "#ff8f3f", "#c08bff"];
      neons.forEach((s, k) => {
        const col = new T.Color(palette[(k * 5) % palette.length]);
        const col2 = new T.Color(palette[(k * 5 + 2) % palette.length]);
        const x0 = s.x - s.w / 2, y0 = s.y, x1 = s.x + s.w / 2, y1 = s.y + s.h;
        const line = (ax, ay, bx, by, c) => segs.push({ ax, ay, bx, by, z: s.z, c });
        // rounded outline
        line(x0 + 0.15, y0, x1 - 0.15, y0, col); line(x0 + 0.15, y1, x1 - 0.15, y1, col);
        line(x0, y0 + 0.15, x0, y1 - 0.15, col); line(x1, y0 + 0.15, x1, y1 - 0.15, col);
        // stroke "letters": a coffee cup / star / wave / bed glyph by type, plus a word bar
        const t = s.b.type, cx = x0 + 0.75, cy = y0 + s.h / 2;
        if (t === "cafe") {
          line(cx - 0.3, cy + 0.25, cx + 0.3, cy + 0.25, col2); line(cx - 0.3, cy + 0.25, cx - 0.22, cy - 0.3, col2);
          line(cx + 0.3, cy + 0.25, cx + 0.22, cy - 0.3, col2); line(cx - 0.22, cy - 0.3, cx + 0.22, cy - 0.3, col2);
          line(cx + 0.3, cy + 0.12, cx + 0.45, cy, col2); line(cx + 0.45, cy, cx + 0.27, cy - 0.12, col2);
        } else {
          for (let n = 0; n < 5; n++) {
            const a = (n * 4 * Math.PI) / 5 - Math.PI / 2, b2 = ((n + 1) * 4 * Math.PI) / 5 - Math.PI / 2;
            line(cx + Math.cos(a) * 0.36, cy - Math.sin(a) * 0.36, cx + Math.cos(b2) * 0.36, cy - Math.sin(b2) * 0.36, col2);
          }
        }
        // cursive-ish word: zig-zag strokes across the remaining width
        let px = x0 + 1.5, py = cy;
        for (let n = 0; n < 14; n++) {
          const nx = px + 0.24, ny = cy + (n % 2 ? -0.22 : 0.22) * (n % 3 === 0 ? 0.6 : 1);
          line(px, py, nx, ny, col);
          px = nx; py = ny;
        }
      });
      const geo = new T.BoxGeometry(1, 1, 1);
      const mat = new T.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
      const mesh = new T.InstancedMesh(geo, mat, Math.max(1, segs.length));
      const dummy = new T.Object3D();
      const tmp = new T.Color();
      segs.forEach((g, n) => {
        const dx = g.bx - g.ax, dy = g.by - g.ay, L = Math.hypot(dx, dy);
        dummy.position.set((g.ax + g.bx) / 2, (g.ay + g.by) / 2, g.z);
        dummy.rotation.set(0, 0, Math.atan2(dy, dx));
        dummy.scale.set(L + 0.04, 0.045, 0.045);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.setColorAt(n, tmp.copy(g.c));
      });
      this.neonBase = segs.map((g) => g.c.clone());
      mesh.raycast = () => {};
      mesh.castShadow = false;
      mesh.name = "detail-facade-neon";
      api.scene.add(mesh);
      this.neonMesh = mesh;
      this.stats.neonSegments = segs.length;
      // Neon backing plates (dark acrylic) on the exterior batches.
      for (const s of neons) api.exterior.box("dark", s.x, s.y + s.h / 2, s.z - 0.06, s.w + 0.3, s.h + 0.3, 0.04, "#1d2426", 0, "facade");
    },
    buildBeacons(api) {
      const T = api.THREE;
      const geo = new T.SphereGeometry(1, 10, 6);
      const mat = new T.MeshBasicMaterial({ color: "#ff2a1a", toneMapped: false });
      const mesh = new T.InstancedMesh(geo, mat, Math.max(1, this.beacons.length));
      const dummy = new T.Object3D();
      this.beacons.forEach((p, n) => {
        dummy.position.set(...p);
        dummy.scale.setScalar(0.16);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
      });
      mesh.raycast = () => {};
      mesh.name = "detail-facade-beacons";
      api.scene.add(mesh);
      this.beaconMesh = mesh;
      this.stats.beacons = this.beacons.length;
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
      this.animateLights(u.uClock.value, u.uNight.value + u.uGolden.value * 0.35);
      const k = Math.min(1, dt * 0.8);
      for (const key in this.target) u[key].value += (this.target[key] - u[key].value) * k;
      const p = api.player,
        b = p.building,
        inside = b && p.floor > 0 && p.floor < b.floors;
      u.uHide.value.set(inside ? api.buildings.indexOf(b) : -1, inside ? p.floor : -1, 0, inside ? 1 : 0);
    },
    animateLights(t, dark) {
      if (this.signMat) this.signMat.emissiveIntensity = 0.12 + dark * 1.25;
      if (this.beaconMesh) {
        // Aviation obstruction light: 1 s flash every 1.5 s (low-intensity type B style).
        const on = (t % 1.5) < 0.75 ? 1 : 0.08;
        this.beaconMesh.material.color.setRGB(1.0 * (0.25 + on * (1 + dark * 3)), 0.12 * on, 0.06 * on);
      }
      if (this.neonMesh && (this.neonClock = (this.neonClock || 0) + 1) % 3 === 0) {
        // Neon: soft hum + one tube in each sign occasionally sputtering. By day it reads as unlit glass tube.
        const m = this.neonMesh, c = this.tmpColor || (this.tmpColor = new this.api.THREE.Color());
        const level = 0.35 + dark * 2.6;
        for (let n = 0; n < this.neonBase.length; n++) {
          let k = level * (0.94 + 0.06 * Math.sin(t * 50 + n));
          if (n % 23 === 7 && Math.sin(t * 1.7 + n) > 0.93) k *= Math.sin(t * 90) > 0 ? 0.15 : 1;
          c.copy(this.neonBase[n]).multiplyScalar(k);
          if (dark < 0.2) c.lerp(this.neonOff || (this.neonOff = new this.api.THREE.Color("#c9d3d2")), 0.55);
          m.setColorAt(n, c);
        }
        m.instanceColor.needsUpdate = true;
      }
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
        signsBuilt: !!this.signMesh && this.signMesh.count >= 20,
        neonBuilt: !!this.neonMesh && this.stats.neonSegments > 100,
        beaconsBuilt: !!this.beaconMesh && this.stats.beacons > 0,
      };
    },
    snapshot() {
      return { ...this.stats, hide: this.uniforms?.uHide.value.toArray() };
    },
  };
  (window.EvercityDetails ||= []).push(plugin);
})();
