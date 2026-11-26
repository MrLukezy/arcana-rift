/* 撕卡包：从桌面版 main.js 移植的顶点撕裂 + 卷曲封条 */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const polyFromPoints = (pts) => `polygon(${pts.map(([x, y]) => `${(+x).toFixed(2)}% ${(+y).toFixed(2)}%`).join(",")})`;
const mirrorPointsX = (pts) => pts.map(([x, y]) => [100 - x, y]);
const inlineSvg = (inner) =>
  `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>${inner}</svg>")`;

const TEAR_BASE_Y = 10.6;
const TEAR_SEGMENTS = 96;
const TEAR_MIN_Y = 8.0;
const TEAR_MAX_Y = 19.5;
const STRIP_SLICES = matchMedia("(pointer: coarse)").matches ? 8 : 10;

export function mountPack(host, opts = {}) {
  const { onOpen } = opts;

  host.innerHTML = `
    <div class="packstage">
      <div class="scene">
        <div class="jet-anchor"><svg class="light-jet" id="lightJet" viewBox="0 0 100 76"></svg></div>
        <div class="pack" id="pk">
          <div class="pouch-face front">
            <span class="tear-label">◀ 撕开封条 ⟶</span>
            <i class="tear-guide"></i>
            <span class="lip-shadow"><i class="foil-lip" id="bodyLip"></i></span>
            <div class="pouch-foil-frame">
              <div class="pouch-header">
                <b class="brand-mark">星界</b>
                <span class="edition-tag">ARCHIVE · S01</span>
              </div>
            </div>
            <div class="pack-crest">✦</div>
            <div class="pouch-footer">
              <div class="pouch-foot-row">
                <span class="pack-foot left">SERIES 01 // ARCANE</span>
                <span class="pack-foot right">5 FOIL CARDS</span>
              </div>
              <span class="pack-micro-spec">STELLAR EDITION · HOLO GUARANTEED</span>
            </div>
          </div>
          <div class="pouch-face back">
            <div class="back-print-box" style="position:absolute;inset:0;display:grid;place-items:center;opacity:.5">
              <b class="brand-mark">星界盟约</b>
            </div>
          </div>
          <div class="tear-flap" id="tearFlap"></div>
          <button class="grab-zone" id="grabZone" type="button" aria-label="撕开卡包"></button>
        </div>
      </div>
    </div>`;

  const pk = host.querySelector("#pk");
  const tearFlap = host.querySelector("#tearFlap");
  const bodyLip = host.querySelector("#bodyLip");
  const grabZone = host.querySelector("#grabZone");
  const lightJet = host.querySelector("#lightJet");
  const faces = [host.querySelector(".pouch-face.front"), host.querySelector(".pouch-face.back")];

  /* ── 金属反光微结构 ── */
  function randomizeFoilShading(target) {
    const fmt = (n) => n.toFixed(2);
    let streaks = "";
    for (let x = 0; x < 100;) {
      const w = rand(0.5, 2.5);
      streaks += `<rect x='${fmt(x)}' y='6.8' width='${fmt(w)}' height='${fmt(rand(3.2, 8.4))}' fill='url(%23g)' fill-opacity='${fmt(rand(0.08, 0.42))}'/>`;
      x += w + rand(0, 1.4);
    }
    let foldPath = "M0 93.2V91.6";
    for (let x = 0; x < 100;) {
      const w = rand(2.5, 6.8);
      const peak = x + w * rand(0.35, 0.65);
      x = Math.min(100, x + w);
      foldPath += `Q${fmt(peak)} ${fmt(rand(86.6, 90.0))} ${fmt(x)} ${fmt(rand(91.1, 91.7))}`;
    }
    target.setProperty("--foil-shine", inlineSvg(
      `<linearGradient id='g' x2='0' y2='1'><stop stop-color='%23fff' stop-opacity='.72'/><stop offset='1' stop-color='%23fff' stop-opacity='0'/></linearGradient>` +
      `<filter id='b'><feGaussianBlur stdDeviation='.28 .5'/></filter><g filter='url(%23b)'>${streaks}</g>`));
    target.setProperty("--foil-shade", inlineSvg(
      `<filter id='b'><feGaussianBlur stdDeviation='.35 .24'/></filter><path d='${foldPath}V93.2Z' fill-opacity='.11' filter='url(%23b)'/></svg>`));
  }

  /* ── 96 段撕裂几何 ── */
  let tearVertices = [];
  let curlTightness = 1;

  function applyVertexBend(vert, bendOffset) {
    vert[5] = bendOffset;
    vert[1] = clamp(vert[2] + bendOffset, TEAR_MIN_Y, TEAR_MAX_Y) + vert[3];
  }

  function generateTearLine() {
    curlTightness = rand(0.7, 1.38);
    const slope = rand(-7, 7);
    const arch = rand(-2.8, 2.8);
    const waveFreq = rand(1.6, 3.4);
    const wavePhase = rand(0, Math.PI * 2);
    const waveAmp = rand(0.3, 1.05);
    const startY = rand(10.6, 13.8);
    let drift = 0;
    tearVertices = Array.from({ length: TEAR_SEGMENTS + 1 }, (_, i) => {
      const x = (i / TEAR_SEGMENTS) * 100;
      const normX = x / 50 - 1;
      drift = clamp(drift + rand(-0.24, 0.24) + (Math.random() < 0.05 ? rand(-1.4, 1.4) : 0), -2.1, 2.1);
      const px = i > 0 && i < TEAR_SEGMENTS ? x + rand(-0.28, 0.28) : x;
      const baseY = startY + slope * normX + arch * (1 - normX * normX) +
        waveAmp * Math.sin(normX * waveFreq * Math.PI + wavePhase) + drift;
      const microTooth = rand(-0.4, 0.4) + (Math.random() < 0.14 ? rand(-1.15, 1.15) : 0);
      const lipWidth = Math.random() < 0.12 ? rand(1.2, 2.05) : rand(0.36, 1.08);
      const v = [px, 0, baseY, microTooth, lipWidth, 0];
      applyVertexBend(v, 0);
      return v;
    });
  }

  function tearYAt(xPercent) {
    const f = (clamp(xPercent, 0, 100) / 100) * TEAR_SEGMENTS;
    const idx = Math.min(TEAR_SEGMENTS - 1, Math.floor(f));
    return tearVertices[idx][1] + (tearVertices[idx + 1][1] - tearVertices[idx][1]) * (f - idx);
  }

  function steerRemainingTear(steerSlope, progress, dir) {
    const pivotIdx = clamp(Math.round((dir > 0 ? progress : 1 - progress) * TEAR_SEGMENTS), 0, TEAR_SEGMENTS);
    for (let i = pivotIdx + dir; i >= 0 && i <= TEAR_SEGMENTS; i += dir) {
      const dist = (Math.abs(i - pivotIdx) * 100) / TEAR_SEGMENTS;
      applyVertexBend(tearVertices[i], tearVertices[pivotIdx][5] + steerSlope * dist);
    }
  }

  const buildLipBand = (pts, sign) => [...pts, ...pts.slice().reverse().map((q) => [q[0], q[1] + sign * q[4]])];

  /* ── 卷曲封条 ── */
  const strips = Array.from({ length: STRIP_SLICES }, () => {
    const el = document.createElement("div");
    el.className = "strip-segment";
    el.hidden = true;
    el.innerHTML =
      `<div class="pouch-face front"><i class="foil-lip"></i><i class="curl-shade"></i></div>` +
      `<div class="pouch-face foil-lining"><i class="curl-shade"></i></div>`;
    tearFlap.appendChild(el);
    const [f, l] = el.children;
    return {
      el, frontEl: f, liningEl: l,
      lipEl: f.querySelector(".foil-lip"),
      frontShade: f.querySelector(".curl-shade"),
      backShade: l.querySelector(".curl-shade"),
      locked: false,
    };
  });

  const st = { p: 0, target: 0, dir: 1, clock: 0 };
  let packWidth = 280, packHeight = 406;

  function updateTearClips(p) {
    const d = st.dir;
    const tipX = d > 0 ? p * 100 : 100 - p * 100;
    const tipY = tearYAt(tipX);
    const tipVert = [tipX, tipY, 0, 0, 0];
    const tornPart = tearVertices.filter(([x]) => (d > 0 ? x < tipX : x > tipX));

    const bodyPoly = d > 0
      ? [[tipX, 0], [100, 0], [100, 100], [0, 100], ...tornPart, [tipX, tipY]]
      : [[0, 0], [tipX, 0], [tipX, tipY], ...tornPart, [100, 100], [0, 100]];
    faces[0].style.clipPath = polyFromPoints(bodyPoly);
    faces[1].style.clipPath = polyFromPoints(mirrorPointsX(bodyPoly));
    bodyLip.style.clipPath = polyFromPoints(buildLipBand(d > 0 ? [...tornPart, tipVert] : [tipVert, ...tornPart], 1));

    tearFlap.style.transformOrigin = `${tipX}% ${tipY}%`;
    const sliceW = 100 / STRIP_SLICES;
    const seamOverlap = 0.25;

    strips.forEach((seg, idx) => {
      const lo = d > 0 ? idx * sliceW : Math.max(idx * sliceW, tipX);
      const hi = d > 0 ? Math.min((idx + 1) * sliceW, tipX) : (idx + 1) * sliceW;
      if (hi <= lo) { seg.el.hidden = true; return; }
      seg.el.hidden = false;
      if (!seg.locked) {
        const leftEdge = d < 0 && lo === tipX ? lo : Math.max(0, lo - seamOverlap);
        const rightEdge = d > 0 && hi === tipX ? hi : Math.min(100, hi + seamOverlap);
        const span = [
          [leftEdge, tearYAt(leftEdge), 0, 0, 0.8],
          ...tearVertices.filter((q) => q[0] > leftEdge && q[0] < rightEdge),
          [rightEdge, tearYAt(rightEdge), 0, 0, 0.8],
        ];
        const flapPoly = [[leftEdge, 0], [rightEdge, 0], ...span.slice().reverse()];
        seg.frontEl.style.clipPath = polyFromPoints(flapPoly);
        seg.liningEl.style.clipPath = polyFromPoints(mirrorPointsX(flapPoly));
        seg.lipEl.style.clipPath = polyFromPoints(buildLipBand(span, -1));
        seg.locked = d > 0 ? hi < tipX || tipX >= 100 : lo > tipX || tipX <= 0;
      }
    });

    const activeSlice = clamp(Math.floor((d > 0 ? tipX - 1e-6 : tipX) / sliceW), 0, STRIP_SLICES - 1);
    const curlBase = (2.6 + 2.6 * p) * curlTightness;
    const flutter = Math.min(1, Math.abs(st.target - p) * 8) * 1.6;
    let chain = "", totalAngle = 0;

    for (let n = 0, k = activeSlice; k >= 0 && k < STRIP_SLICES; n++, k -= d) {
      const hingePx = (((n ? (d > 0 ? k + 1 : k) * sliceW : tipX) / 100) * packWidth).toFixed(2);
      const degY = d * (curlBase * (0.4 + 0.3 * n) + Math.sin(st.clock * 16 + n * 0.9) * flutter);
      const degZ = (d * 0.9 * n) / 4;
      totalAngle += degY;
      chain += `translateX(${hingePx}px) rotateY(${degY.toFixed(2)}deg) rotateZ(${degZ.toFixed(2)}deg) translateX(-${hingePx}px) `;
      const seg = strips[k];
      seg.el.style.transform = chain;
      seg.frontShade.style.opacity = Math.min(0.5, Math.abs(totalAngle) / 200).toFixed(2);
      seg.backShade.style.opacity = Math.max(0, 0.34 - Math.abs(totalAngle) / 420).toFixed(2);
    }
  }


  /* ── 袋口彩虹光流（移植自桌面版：32 道矢量缎带） ── */
  const PALETTE = ["#fff6e0", "#ffe9a8", "#ffd98a", "#ffe4f2", "#e9f5ff", "#f2e8ff", "#fff0c8"];
  const IRIS = ["#ffeecc", "#cbefff", "#ffd6f4", "#dfd4ff", "#c6f7e8", "#fff6dd", "#ffe4f8"];
  const RIBBONS = 32;

  function buildJet() {
    const off = Math.floor(rand(0, 7));
    let defs = `<radialGradient id="jGlow"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff8e0" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    let paths = "";
    for (let j = 0; j < RIBBONS; j++) {
      const t0 = j / RIBBONS, t1 = (j + 1) / RIBBONS;
      const c = PALETTE[(j + off) % PALETTE.length];
      const iris = IRIS[(j + off) % IRIS.length];
      defs += `<linearGradient id="jg${j}" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#ffffff" stop-opacity="1"/>
        <stop offset=".14" stop-color="#fffdf2" stop-opacity="1"/>
        <stop offset=".36" stop-color="${c}" stop-opacity=".96"/>
        <stop offset=".7" stop-color="${iris}" stop-opacity=".62"/>
        <stop offset="1" stop-color="${iris}" stop-opacity="0"/></linearGradient>`;
      // 底部收窄、顶部张开的一道
      const bx0 = 12 + 76 * t0, bx1 = 12 + 76 * t1;
      const tx0 = -34 + 168 * t0, tx1 = -34 + 168 * t1;
      const wob = rand(-3, 3);
      paths += `<path class="jet-rib" style="--d:${(j * 0.008).toFixed(3)}s" fill="url(#jg${j})"
        d="M${bx0.toFixed(1)} 76 C${(bx0 + wob).toFixed(1)} 58 ${(tx0 * 0.6 + 20).toFixed(1)} 40 ${tx0.toFixed(1)} 2 L${tx1.toFixed(1)} 2 C${(tx1 * 0.6 + 20).toFixed(1)} 40 ${(bx1 + wob).toFixed(1)} 58 ${bx1.toFixed(1)} 76 Z"/>`;
    }
    lightJet.innerHTML = `<defs>${defs}</defs><g id="jetGroup">${paths}</g>
      <ellipse cx="50" cy="74" rx="40" ry="12" fill="url(#jGlow)"/>
      <ellipse cx="50" cy="72" rx="26" ry="7" fill="#fff" opacity=".9"/>`;
  }

  function playJet() {
    lightJet.classList.add("on");
    setTimeout(() => lightJet.classList.remove("on"), 1800);
  }

  /* ── 帧循环 ── */
  let raf = 0, last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    st.clock += dt;
    const k = 1 - Math.pow(0.001, dt);
    st.p += (st.target - st.p) * Math.min(1, k * 1.5);
    if (Math.abs(st.target - st.p) < 0.0004) st.p = st.target;
    updateTearClips(st.p);
    pk.style.transform = `rotateX(${(-st.p * 16).toFixed(2)}deg) rotateZ(${(st.p * 3).toFixed(2)}deg)`;
    raf = requestAnimationFrame(loop);
  }

  /* ── 拖拽 ── */
  let drag = null;

  grabZone.addEventListener("pointerdown", (e) => {
    if (drag) return;
    grabZone.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: st.target, moved: false, locked: false };
  });

  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
    }
    // 第一次横向扯动时锁定方向（之后 x0 不再变，位移是累计的）
    if (!drag.locked) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 0.5) return;
      st.dir = dx < 0 ? -1 : 1;
      drag.locked = true;
    }
    const deltaP = (drag.p0 ? Math.abs(dx) : dx * st.dir) / (packWidth * 0.85);
    st.target = clamp(drag.p0 + deltaP, st.target, 1);
    const steer = clamp(dy / Math.max(60, Math.abs(dx)), -0.7, 0.7) * (packWidth / packHeight);
    steerRemainingTear(steer, st.p, st.dir);
    if (st.target >= 0.995) finishTear();
  };
  grabZone.addEventListener("pointermove", onMove);
  window.addEventListener("pointermove", (e) => { if (e.target !== grabZone) onMove(e); }, { passive: true });

  const endDrag = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return;
    if (st.target > 0.54) finishTear();
  };
  grabZone.addEventListener("pointerup", endDrag);
  grabZone.addEventListener("pointercancel", endDrag);
  window.addEventListener("pointerup", endDrag);

  let opened = false;
  function finishTear() {
    if (opened) return;
    opened = true;
    st.target = 1;
    drag = null;
    setTimeout(() => {
      tearFlap.classList.add("visible");
      tearFlap.style.transition = "transform .5s cubic-bezier(.3,.8,.3,1), opacity .5s";
      tearFlap.style.transform = `translateY(-38%) rotateZ(${st.dir * 14}deg) rotateX(-28deg)`;
      tearFlap.style.opacity = "0";
      playJet();
      pk.classList.add("opened");
      setTimeout(() => onOpen && onOpen(), 1150);
    }, 130);
  }

  /* ── 初始化 ── */
  function measure() {
    const r = host.getBoundingClientRect();
    packWidth = r.width * 0.69 || 280;
    packHeight = r.width * 1.0 || 406;
  }
  measure();
  window.addEventListener("resize", measure);
  randomizeFoilShading(pk.style);
  generateTearLine();
  buildJet();
  updateTearClips(0);
  last = performance.now();
  raf = requestAnimationFrame(loop);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      host.innerHTML = "";
    },
  };
}
