// MinoxPak: the mist. One canvas behind the page; the scroll directs it.
import * as THREE from '../lib/three.module.js';
import * as S from './shaders.js';

const qs = new URLSearchParams(location.search);
const FROZEN = qs.has('t');
const T_FIXED = parseFloat(qs.get('t') || '0');
const S_PARAM = qs.has('s') ? Math.min(1, Math.max(0, parseFloat(qs.get('s')))) : null;
const VIEW = qs.get('view');
const FIXED_Q = FROZEN || qs.has('q');

const canvas = document.getElementById('gl');
const scroller = document.getElementById('scroll');
const root = document.documentElement;

let W = innerWidth, H = innerHeight;
let lite = W < 760 || (navigator.deviceMemory && navigator.deviceMemory <= 4 && W < 1100);
const mobile = () => W < 760;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.autoClear = false;
renderer.setClearColor(0xe6e8e4, 1);

const FOV = 30, TAN = Math.tan(FOV * Math.PI / 360), CAMZ = 10, EDGE_Z = 1.5, FAR_Z = -9;
const cam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 60);
cam.position.set(0, 0, CAMZ);

let quality = 1, dpr = 1, BW = 1, BH = 1;
let rtMain, rtBg;

// ------------------------------------------------------------ shared uniforms
const U = {
  uTime: { value: 0 }, uAspect: { value: 1 }, uRes: { value: new THREE.Vector2() }, uPx: { value: 1 }, uDpr: { value: 1 },
  uVP: { value: new THREE.Matrix4() }, uCam: { value: cam.position },
  uField: { value: new THREE.Vector4(EDGE_Z, FAR_Z, -1.5, TAN) }, uShift: { value: 0 },
  uPtr: { value: new THREE.Vector3(0, 0, 0) }, uPtrVel: { value: new THREE.Vector2() },
  uGrow: { value: 1 }, uReveal: { value: 0 }, uSeep: { value: 0 },
  uGY: { value: 0.1 }, uU: { value: 0.2 }, uBottle: { value: new THREE.Vector4(.5, .5, .1, 1) },
  uHalf: { value: new THREE.Vector2() },
  uNoz: { value: new THREE.Vector3() }, uNozDir: { value: new THREE.Vector3(-1, 0, 0) },
  uSprayAge: { value: 0 }, uSprayAmt: { value: 1 }, uSettle: { value: 0 }, uStrandN: { value: 1 },
  uAmb: { value: 1 }, uBeads: { value: 1 }, uFocus: { value: CAMZ }, uDof: { value: 1.1 }, uLen: { value: 1 }, uSprayK: { value: 1 }, uLand: { value: new THREE.Vector2(0, 100) }, uBeadY: { value: -1 },
  uScene: { value: null }, uBg: { value: null },
  uLedge: { value: 0 }, uFadeH: { value: 40 }, uView: { value: new THREE.Vector2(W, H) },
};
const pick = (...k) => Object.fromEntries(k.map(n => [n, U[n]]));

// ------------------------------------------------------------ scenes
const world = new THREE.Scene();
const post = new THREE.Scene();
const quadGeo = new THREE.PlaneGeometry(2, 2);

const bg = new THREE.Mesh(quadGeo, new THREE.ShaderMaterial({
  vertexShader: S.QUAD_VS, fragmentShader: S.BG_FS, depthTest: false, depthWrite: false,
  uniforms: pick('uTime', 'uAspect', 'uGY', 'uU', 'uReveal', 'uGrow', 'uSeep', 'uBottle'),
}));
bg.frustumCulled = false; bg.renderOrder = -10; bg.layers.enable(1);
world.add(bg);

// ground
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), new THREE.ShaderMaterial({
  vertexShader: S.GROUND_VS, fragmentShader: S.GROUND_FS, transparent: true, depthWrite: false, depthTest: false,
  uniforms: pick('uField', 'uVP', 'uShift', 'uTime'),
}));
ground.frustumCulled = false; ground.renderOrder = -5;
world.add(ground);

// strands
const SEG = lite ? 7 : 9;
const N_STR = lite ? 1500 : 3400;
const FOLL = 40;
{
  const pos = [], idx = [];
  for (let i = 0; i <= SEG; i++) { const s = i / SEG; pos.push(s, -1, 0, s, 1, 0); }
  for (let i = 0; i < SEG; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const n = N_STR + FOLL;
  const ids = new Float32Array(n), cells = new Float32Array(n);
  for (let i = 0; i < n; i++) { ids[i] = i; cells[i] = i < N_STR ? -999 : (i - N_STR) - FOLL / 2; }
  g.setAttribute('aId', new THREE.InstancedBufferAttribute(ids, 1));
  g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    vertexShader: S.STRAND_VS, fragmentShader: S.STRAND_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: pick('uTime', 'uGrow', 'uShift', 'uAspect', 'uField', 'uPtr', 'uPtrVel', 'uVP', 'uRes', 'uPx', 'uDpr', 'uCam', 'uReveal', 'uLen'),
  });
  const strands = new THREE.Mesh(g, m);
  strands.frustumCulled = false; strands.renderOrder = 2;
  world.add(strands);
  U.uStrandN.value = N_STR;
}

// ------------------------------------------------------------ bottle
const bottle = new THREE.Group(); bottle.rotation.order = 'ZXY';
const inner = new THREE.Group(); inner.position.y = -1.42; bottle.add(inner);
world.add(bottle);
const LEVEL = 1.56;

const labelCanvas = document.createElement('canvas'); labelCanvas.width = 2048; labelCanvas.height = 1024;
const labelTex = new THREE.CanvasTexture(labelCanvas);
labelTex.anisotropy = 8; labelTex.generateMipmaps = true; labelTex.minFilter = THREE.LinearMipmapLinearFilter;
function drawLabel() {
  const c = labelCanvas.getContext('2d'), w = 2048, h = 1024;
  c.fillStyle = '#f3f2ec'; c.fillRect(0, 0, w, h);
  const ink = '#10201b', acc = '#0e5444';
  c.fillStyle = acc; c.fillRect(0, h - 74, w, 74);
  c.fillStyle = ink; c.textBaseline = 'alphabetic'; c.textAlign = 'center';
  const cx = w / 2;
  c.font = '400 232px "Instrument Serif", serif';
  c.fillText('MinoxPak', cx, 300);
  c.fillRect(cx - 330, 356, 660, 3);
  c.font = '500 46px "Geist", sans-serif';
  try { c.letterSpacing = '9px'; } catch (e) {}
  c.fillText('MINOXIDIL TOPICAL SOLUTION', cx, 440);
  try { c.letterSpacing = '-4px'; } catch (e) {}
  c.font = '400 300px "Instrument Serif", serif';
  c.fillStyle = acc; c.fillText('5%', cx - 40, 760);
  try { c.letterSpacing = '2px'; } catch (e) {}
  c.font = '500 44px "Geist", sans-serif'; c.fillStyle = ink; c.textAlign = 'left';
  c.fillText('w/v', cx + 150, 760);
  c.textAlign = 'center'; try { c.letterSpacing = '7px'; } catch (e) {}
  c.font = '500 38px "Geist", sans-serif';
  c.fillText('SPRAY  ·  60 ML', cx, 870);
  c.fillStyle = '#f3f2ec'; c.font = '500 30px "Geist", sans-serif';
  c.fillText('FOR EXTERNAL USE ON THE SCALP ONLY', cx, h - 27);
  // side panels
  try { c.letterSpacing = '1px'; } catch (e) {}
  c.fillStyle = ink; c.textAlign = 'left'; c.font = '400 27px "Geist", sans-serif';
  const left = ['For pattern hair loss.', 'Apply to a dry scalp.', 'Read the leaflet', 'before use.', '', 'Keep away from eyes.', 'Keep out of the reach', 'of children.'];
  left.forEach((t, i) => c.fillText(t, 110, 250 + i * 44));
  const right = ['Each ml contains', 'minoxidil 50 mg.', '', 'Reg. no.', 'Batch', 'Mfg.', 'Exp.'];
  right.forEach((t, i) => c.fillText(t, w - 470, 250 + i * 44));
  c.fillRect(110, 190, 360, 2); c.fillRect(w - 470, 190, 360, 2);
  c.font = '500 24px "Geist", sans-serif'; try { c.letterSpacing = '5px'; } catch (e) {}
  c.fillText('DIRECTIONS', 110, 170); c.fillText('CONTENTS', w - 470, 170);
  labelTex.needsUpdate = true;
}
drawLabel();

const lathe = (pts, seg = 72) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
const smoothPts = (pts, n = 6) => {
  const v = pts.map(p => new THREE.Vector2(p[0], p[1]));
  return new THREE.SplineCurve(v).getPoints(pts.length * n).map(p => [Math.max(p.x, 0), p.y]);
};
const bodyMat = new THREE.ShaderMaterial({
  vertexShader: S.BODY_VS, fragmentShader: S.BODY_FS, side: THREE.DoubleSide,
  uniforms: { ...pick('uBg', 'uRes', 'uTime'), uLabel: { value: labelTex }, uCamL: { value: new THREE.Vector3() }, uLiqN: { value: new THREE.Vector3(0, 1, 0) }, uLevel: { value: LEVEL }, uScale: { value: 1 } },
});
const bodyPts = [[0, 0], [.30, 0], [.385, .012], [.414, .05], [.42, .11], [.42, 1.0], [.42, 1.60], [.416, 1.69], [.392, 1.775], [.335, 1.855], [.255, 1.915], [.195, 1.955], [.172, 2.0], [.17, 2.14]];
const body = new THREE.Mesh(lathe(smoothPts(bodyPts, 5)), bodyMat);
inner.add(body);

const plastic = (col, ribs = 0) => new THREE.ShaderMaterial({ vertexShader: S.BODY_VS, fragmentShader: S.PLASTIC_FS, side: THREE.DoubleSide, uniforms: { uCol: { value: new THREE.Color(col) }, uRibs: { value: ribs } } });
const white = 0xf2f3f0;
const collar = new THREE.Mesh(lathe([[.172, 2.045], [.205, 2.05], [.214, 2.065], [.214, 2.255], [.205, 2.285], [.16, 2.295], [.082, 2.297], [.078, 2.31], [.078, 2.46]]), plastic(white, 1));
inner.add(collar);
const head = new THREE.Group(); inner.add(head);
const headMesh = new THREE.Mesh(lathe([[.085, 2.385], [.155, 2.39], [.168, 2.405], [.170, 2.44], [.170, 2.60], [.162, 2.628], [.135, 2.64], [.06, 2.632], [0, 2.628]]), plastic(white));
head.add(headMesh);
const NOZ_ANG = -1.02;                                   // nozzle sits to the left of the label face
const nozDirL = new THREE.Vector3(Math.sin(NOZ_ANG), 0, Math.cos(NOZ_ANG));
const noz = new THREE.Mesh(new THREE.CylinderGeometry(.036, .046, .10, 24), plastic(white));
noz.rotation.set(Math.PI / 2, 0, 0); noz.rotation.order = 'YXZ'; noz.rotation.y = NOZ_ANG;
noz.position.copy(nozDirL).multiplyScalar(.19).setY(2.535);
head.add(noz);
const hole = new THREE.Mesh(new THREE.CircleGeometry(.013, 16), new THREE.MeshBasicMaterial({ color: 0x2a302e }));
hole.position.copy(nozDirL).multiplyScalar(.2405).setY(2.535); hole.rotation.y = NOZ_ANG;
head.add(hole);
const nozTip = new THREE.Object3D(); nozTip.position.copy(nozDirL).multiplyScalar(.25).setY(2.535); head.add(nozTip);

const capG = new THREE.Group(); inner.add(capG);
const cap = new THREE.Mesh(lathe(smoothPts([[.228, 2.10], [.228, 2.5], [.228, 2.82], [.218, 2.87], [.18, 2.895], [.09, 2.90], [0, 2.90]], 5)), new THREE.ShaderMaterial({
  vertexShader: S.BODY_VS, fragmentShader: S.CAP_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: {},
}));
cap.renderOrder = 6; capG.add(cap);

const bubbleMat = new THREE.ShaderMaterial({ vertexShader: S.BODY_VS, fragmentShader: S.BUBBLE_FS, transparent: true, depthTest: false, depthWrite: false, uniforms: { uAlpha: { value: 1 } } });
const bubble = new THREE.Mesh(new THREE.SphereGeometry(.03, 20, 14), bubbleMat);
bubble.renderOrder = 5; inner.add(bubble);
const bubble2 = new THREE.Mesh(new THREE.SphereGeometry(.014, 14, 10), bubbleMat);
bubble2.renderOrder = 5; inner.add(bubble2);

// ------------------------------------------------------------ type in GL
const typeItems = [];
function makeType() {
  document.querySelectorAll('.gl').forEach(el => {
    const cv = document.createElement('canvas');
    const tex = new THREE.CanvasTexture(cv); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.ShaderMaterial({
      vertexShader: S.TYPE_VS, fragmentShader: S.TYPE_FS, transparent: true, depthWrite: false, depthTest: true,
      uniforms: { map: { value: tex }, uInk: { value: new THREE.Color(0x10201b) }, uRect: { value: new THREE.Vector4() }, uMask: { value: 0 }, uOpacity: { value: 1 }, ...pick('uView', 'uLedge', 'uFadeH') },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.layers.enable(1);
    world.add(mesh);
    typeItems.push({ el, cv, tex, mat, mesh, pad: 0, hero: el.hasAttribute('data-hero') });
  });
}
function rasterType() {
  const k = Math.min(devicePixelRatio || 1, 2);
  for (const it of typeItems) {
    const cs = getComputedStyle(it.el), r = it.el.getBoundingClientRect(), fs = parseFloat(cs.fontSize);
    const pad = Math.ceil(fs * .32); it.pad = pad; it.w = r.width; it.h = r.height;
    it.cv.width = Math.ceil((r.width + pad * 2) * k); it.cv.height = Math.ceil((r.height + pad * 2) * k);
    const c = it.cv.getContext('2d'); c.setTransform(k, 0, 0, k, 0, 0);
    c.clearRect(0, 0, it.cv.width, it.cv.height);
    c.textBaseline = 'alphabetic'; c.fillStyle = '#fff';
    try { c.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing; } catch (e) {}
    try { c.fontKerning = 'normal'; } catch (e) {}
    // draw each text node with its own style, so that the italics inside a line keep their face
    let x = pad; let base = null;
    const walk = (node, style) => {
      for (const ch of node.childNodes) {
        if (ch.nodeType === 3) {
          c.font = `${style.fontStyle} ${style.fontWeight} ${fs}px ${style.fontFamily}`;
          if (base === null) { const m = c.measureText('Hg'); const a = m.fontBoundingBoxAscent, d = m.fontBoundingBoxDescent; base = pad + (r.height - (a + d)) / 2 + a; }
          const rg = document.createRange(); rg.selectNodeContents(ch); const rr = rg.getBoundingClientRect();
          c.fillText(ch.textContent, pad + (rr.left - r.left), base);
        } else if (ch.nodeType === 1) walk(ch, getComputedStyle(ch));
      }
    };
    walk(it.el, cs);
    it.tex.needsUpdate = true;
    it.mat.uniforms.uMask.value = (mobile() && !it.hero) ? 1 : 0;
  }
  root.classList.add('gl-on');
}

// ------------------------------------------------------------ droplets
{
  const k = lite ? .55 : 1;
  const counts = [Math.round(520 * k), Math.round(2600 * k), Math.round(900 * k), Math.round(150 * k), lite ? 9 : 16];
  const n = counts.reduce((a, b) => a + b, 0);
  const seed = new Float32Array(n * 4); let o = 0;
  counts.forEach((cnt, kind) => { for (let i = 0; i < cnt; i++) { seed[o++] = i + kind * 7919; seed[o++] = kind; seed[o++] = Math.random(); seed[o++] = Math.random(); } });
  // deterministic seeds, so that a frozen frame is the same frame every time
  let sd = 1234567; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { seed[i * 4 + 2] = rnd(); seed[i * 4 + 3] = rnd(); }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    vertexShader: S.DROP_VS, fragmentShader: S.DROP_FS, transparent: true, depthTest: false, depthWrite: false,
    uniforms: pick('uTime', 'uGrow', 'uShift', 'uAspect', 'uField', 'uPtr', 'uPtrVel', 'uVP', 'uRes', 'uPx', 'uDpr', 'uHalf', 'uNoz', 'uNozDir', 'uSprayAge', 'uSprayAmt', 'uSettle', 'uStrandN', 'uAmb', 'uBeads', 'uFocus', 'uDof', 'uScene', 'uLen', 'uSprayK', 'uLand', 'uBeadY'),
  });
  const drops = new THREE.Mesh(g, m); drops.frustumCulled = false; drops.renderOrder = 2;
  post.add(drops);
  const blit = new THREE.Mesh(quadGeo, new THREE.ShaderMaterial({ vertexShader: S.QUAD_VS, fragmentShader: S.POST_FS, depthTest: false, depthWrite: false, uniforms: pick('uScene', 'uTime', 'uRes') }));
  blit.frustumCulled = false; blit.renderOrder = -10; post.add(blit);
}

// ------------------------------------------------------------ poses
const TAU = Math.PI * 2;
const POSE_D = {
  hero:      { bx: .37, by: .06, bs: 1.0, yaw: -.42, roll: -.045, cap: .8, gy: -.87, gh: -1.0, grow: 1, settle: .55, reveal: 0, beads: 1, amb: 1 },
  what:      { bx: -.47, by: -.02, bs: 1.14, yaw: .28, roll: .03, cap: 0, gy: -1.5, gh: -1.3, grow: 1, settle: .3, reveal: 0, beads: 0, amb: .8 },
  use:       { bx: .46, by: .49, bs: .58, yaw: TAU - .50, roll: .66, cap: 0, gy: -.08, gh: -.5, grow: 1, settle: 0, reveal: 0, beads: 0, amb: .5 },
  expect:    { bx: .80, by: .50, bs: .40, yaw: TAU + .45, roll: .22, cap: 0, gy: -.32, gh: -.16, grow: .1, settle: .5, reveal: 1, beads: 0, amb: .35 },
  safety:    { bx: -.56, by: -.02, bs: 1.06, yaw: 2 * TAU - .22, roll: -.03, cap: 0, gy: -1.5, gh: -1.2, grow: 1, settle: 0, reveal: 0, beads: 0, amb: .7 },
  buy:       { bx: .60, by: -.02, bs: 1.0, yaw: 2 * TAU + .42, roll: .05, cap: 0, gy: -1.5, gh: -1.2, grow: 1, settle: 0, reveal: 0, beads: 0, amb: .8 },
  questions: { bx: -.60, by: -.02, bs: .92, yaw: 2 * TAU + 2.5, roll: -.06, cap: 0, gy: -1.5, gh: -1.2, grow: 1, settle: 0, reveal: 0, beads: 0, amb: .8 },
  footer:    { bx: .58, by: .16, bs: .92, yaw: 3 * TAU - .42, roll: -.03, cap: 1, gy: -.70, gh: -1.0, grow: 1, settle: .9, reveal: 0, beads: 0, amb: 1 },
};
const POSE_M = {
  hero:      { bx: .30, by: .17, bs: .60, yaw: -.42, roll: -.05, cap: 1, gy: -.24, gh: -.75, grow: 1, settle: .6, reveal: 0, beads: 1, amb: 1 },
  what:      { bx: .0, by: .57, bs: .42, yaw: .28, roll: .03, cap: 0, gy: .17, gh: -.5, grow: 1, settle: .4, reveal: 0, beads: 0, amb: .8 },
  use:       { bx: .40, by: .60, bs: .38, yaw: TAU - .50, roll: .5, cap: 1.1, gy: .17, gh: -.5, grow: 1, settle: .8, reveal: 0, beads: 0, amb: .6 },
  expect:    { bx: .52, by: .80, bs: .23, yaw: TAU + .5, roll: 1.0, cap: 1.2, gy: .60, gh: -.14, grow: .1, settle: .5, reveal: 1, beads: 0, amb: .4 },
  safety:    { bx: -.05, by: .57, bs: .42, yaw: 2 * TAU - .22, roll: -.03, cap: 0, gy: .17, gh: -.5, grow: 1, settle: .2, reveal: 0, beads: 0, amb: .7 },
  buy:       { bx: .1, by: .57, bs: .42, yaw: 2 * TAU + .42, roll: .05, cap: 0, gy: .17, gh: -.5, grow: 1, settle: .2, reveal: 0, beads: 0, amb: .8 },
  questions: { bx: -.1, by: .57, bs: .40, yaw: 2 * TAU + 2.5, roll: -.06, cap: 0, gy: .17, gh: -.5, grow: 1, settle: .2, reveal: 0, beads: 0, amb: .8 },
  footer:    { bx: .28, by: .50, bs: .46, yaw: 3 * TAU - .42, roll: -.03, cap: 1, gy: .12, gh: -.7, grow: 1, settle: .9, reveal: 0, beads: 0, amb: 1 },
};
const KEYS = Object.keys(POSE_D.hero);
const secs = [...document.querySelectorAll('[data-pose]')].map(el => ({ el, name: el.dataset.pose, a: 0, b: 0 }));
const byName = Object.fromEntries(secs.map(s => [s.name, s]));
let maxScroll = 1;

function layout() {
  const st = scroller.scrollTop;
  const sr = scroller.getBoundingClientRect();
  maxScroll = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
  const m = mobile();
  secs.forEach((s, i) => {
    const r = s.el.getBoundingClientRect(); const top = r.top - sr.top + st;
    if (i === 0) { s.a = -1; s.b = H * .10; return; }
    if (!m && s.el.classList.contains('tall')) { s.a = top; s.b = top + r.height - H; return; }
    const c = s.el.querySelector('.col') || s.el.firstElementChild;
    const cr = c.getBoundingClientRect(); const ct = cr.top - sr.top + st;
    if (m) { s.a = ct - H * .47; s.b = Math.max(s.a + 1, ct + cr.height - H * .80); }
    else { const mid = ct + cr.height / 2 - H / 2; s.a = mid - H * .10; s.b = mid + H * .10; if (s.name === 'footer') { s.a = Math.min(s.a, maxScroll - H * .2); s.b = maxScroll + 1; } }
    s.a = Math.min(s.a, maxScroll - 2);
  });
  for (let i = 1; i < secs.length; i++) if (secs[i].a < secs[i - 1].b + 40) { const mid = (secs[i].a + secs[i - 1].b) / 2; secs[i - 1].b = mid - 20; secs[i].a = mid + 20; }
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const sstep5 = t => t * t * t * (t * (t * 6 - 15) + 10);
const P = {}, Wt = {};
function evalPose(y) {
  const tbl = mobile() ? POSE_M : POSE_D;
  let i = 0; while (i < secs.length - 1 && y >= secs[i + 1].a) i++;
  let e = 0;
  if (i < secs.length - 1 && y > secs[i].b) e = sstep5(Math.min(1, (y - secs[i].b) / (secs[i + 1].a - secs[i].b)));
  const A = tbl[secs[i].name], B = tbl[secs[Math.min(i + 1, secs.length - 1)].name];
  for (const k of KEYS) P[k] = A[k] + (B[k] - A[k]) * e;
  // the ground leaves early and arrives late, so that incoming copy never has to cross the strands
  const eg = B.gy < A.gy ? sstep5(Math.min(1, e * 1.9)) : sstep5(Math.max(0, (e - .4) / .6));
  if (!mobile()) P.gy = A.gy + (B.gy - A.gy) * eg;
  for (const s of secs) Wt[s.name] = 0;
  Wt[secs[i].name] = 1 - e; if (e > 0) Wt[secs[i + 1].name] = e;
  for (const s of secs) s.p = Math.min(1, Math.max(0, (y - s.a) / Math.max(1, s.b - s.a)));
}

// ------------------------------------------------------------ input
const ptr = { x: .2, y: -.5, tx: .2, ty: -.5, lx: .2, ly: -.5, vx: 0, vy: 0, k: 0, last: -10, seen: false };
addEventListener('pointermove', e => { ptr.tx = e.clientX / W * 2 - 1; ptr.ty = -(e.clientY / H * 2 - 1); ptr.last = now(); ptr.seen = true; }, { passive: true });
addEventListener('pointerdown', e => {
  ptr.tx = e.clientX / W * 2 - 1; ptr.ty = -(e.clientY / H * 2 - 1); ptr.last = now(); ptr.seen = true;
  if (!e.target.closest('a,button')) puffT0 = now() + .14;
}, { passive: true });
addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { if (document.activeElement === scroller || document.activeElement === document.body) puffT0 = now() + .14; } });

// smooth scroll: wheel is eased, touch stays native
let sTarget = 0, sCur = 0, sSet = -1;
scroller.addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  e.preventDefault();
  const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * H : e.deltaY;
  sTarget = Math.min(maxScroll, Math.max(0, sTarget + d));
}, { passive: false });
scroller.addEventListener('scroll', () => { if (Math.abs(scroller.scrollTop - sSet) > 2) { sTarget = sCur = scroller.scrollTop; } }, { passive: true });
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const t = document.querySelector(a.getAttribute('href')); if (!t) return;
  e.preventDefault();
  const s = secs.find(s => s.el === t);
  const y = s ? (s.name === 'hero' ? 0 : s.a + Math.min(H * .1, (s.b - s.a) * .2)) : 0;
  if (mobile()) scroller.scrollTo({ top: y, behavior: 'smooth' }); else sTarget = Math.min(maxScroll, Math.max(0, y));
});

// ------------------------------------------------------------ sound (made in code, silent until asked)
let actx = null, master = null, soundOn = false;
const sbtn = document.getElementById('sound');
function noiseBuf(sec) { const b = actx.createBuffer(1, actx.sampleRate * sec, actx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
let nbuf;
sbtn.addEventListener('click', () => {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0; master.connect(actx.destination);
    nbuf = noiseBuf(3);
    const src = actx.createBufferSource(); src.buffer = nbuf; src.loop = true;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = .2;
    const g = actx.createGain(); g.gain.value = .05;
    const lfo = actx.createOscillator(); lfo.frequency.value = .07; const lg = actx.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    src.connect(lp); lp.connect(g); g.connect(master); src.start();
  }
  soundOn = !soundOn;
  actx.resume();
  master.gain.cancelScheduledValues(actx.currentTime);
  master.gain.linearRampToValueAtTime(soundOn ? 1 : 0, actx.currentTime + .5);
  sbtn.setAttribute('aria-pressed', soundOn);
  sbtn.querySelector('.lbl').textContent = soundOn ? 'Sound on' : 'Enable sound';
});
function hiss() {
  if (!soundOn || !actx) return;
  const t = actx.currentTime;
  const src = actx.createBufferSource(); src.buffer = nbuf;
  const bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(5200, t); bp.frequency.exponentialRampToValueAtTime(2600, t + .5); bp.Q.value = .7;
  const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
  const g = actx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .03); g.gain.exponentialRampToValueAtTime(.03, t + .28); g.gain.exponentialRampToValueAtTime(.0008, t + .9);
  src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(master); src.start(t); src.stop(t + 1);
  const o = actx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(70, t + .08);
  const og = actx.createGain(); og.gain.setValueAtTime(.12, t); og.gain.exponentialRampToValueAtTime(.001, t + .1);
  o.connect(og); og.connect(master); o.start(t); o.stop(t + .12);
}

// ------------------------------------------------------------ size
function resize() {
  W = innerWidth; H = innerHeight;
  const base = Math.min(devicePixelRatio || 1, 2);
  const budget = lite ? 1.7e6 : 3.2e6;                    // internal pixels
  let pr = Math.min(base, Math.sqrt(budget / (W * H)));
  pr = Math.max(.6, pr * quality);
  dpr = pr;
  renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
  BW = renderer.domElement.width; BH = renderer.domElement.height;
  cam.aspect = W / H; cam.updateProjectionMatrix();
  if (rtMain) { rtMain.dispose(); rtBg.dispose(); }
  rtMain = new THREE.WebGLRenderTarget(BW, BH, { samples: lite ? 2 : 4, depthBuffer: true });
  rtMain.texture.minFilter = rtMain.texture.magFilter = THREE.LinearFilter;
  rtBg = new THREE.WebGLRenderTarget(Math.ceil(BW / 2), Math.ceil(BH / 2), { depthBuffer: true });
  rtBg.texture.generateMipmaps = true; rtBg.texture.minFilter = THREE.LinearMipmapLinearFilter;
  U.uRes.value.set(BW, BH); U.uAspect.value = W / H; U.uPx.value = BH / (2 * TAN); U.uDpr.value = pr;
  U.uField.value.w = TAN * W / H; U.uHalf.value.set(TAN * CAMZ * W / H, TAN * CAMZ);
  U.uU.value = 1 / (2 * TAN * (CAMZ - EDGE_Z)); U.uView.value.set(W, H); U.uFadeH.value = H * .05;
  U.uLen.value = mobile() ? .5 : .9; U.uScene.value = rtMain.texture; U.uBg.value = rtBg.texture;
}

// ------------------------------------------------------------ frame
const t0 = performance.now();
const now = () => FROZEN ? T_FIXED : (performance.now() - t0) / 1000;
let puffT0 = -.7, lastAge = 0, lastT = 0, yawPrev = 0, slosh = { x: 0, v: 0, z: 0, vz: 0 }, bubAng = .9;
let ftAvg = 16, ftN = 0;
const v3 = new THREE.Vector3(), q4 = new THREE.Quaternion(), m4 = new THREE.Matrix4();
const steps = [...document.querySelectorAll('#use ol.steps li')];
const tls = [...document.querySelectorAll('#expect .tl .t')], tlEl = document.querySelector('#expect .tl');
const caps = [...document.querySelectorAll('#expect .cap')];
const pinE = document.querySelector('#expect .pin');

function frame() {
  const T = now(); const dt = Math.min(.05, Math.max(.001, T - lastT)) || .016; lastT = T;
  // scroll
  if (!mobile() && S_PARAM === null && !VIEW) {
    if (Math.abs(sTarget - sCur) > .3) { sCur += (sTarget - sCur) * (1 - Math.exp(-dt * 7.5)); sSet = Math.round(sCur * 2) / 2; scroller.scrollTop = sSet; }
  }
  const y = scroller.scrollTop;
  evalPose(y);
  const m = mobile();

  // pointer, with an idle breath when nobody is there
  const idle = T - ptr.last > 3.5 || !ptr.seen;
  if (idle) { ptr.tx = Math.sin(T * .31) * .75 + Math.sin(T * .13) * .2; ptr.ty = U.uGY.value * 2 - 1 + .22 + Math.sin(T * .47) * .1; }
  const kf = FROZEN ? 1 : 1 - Math.exp(-dt * 9);
  ptr.x += (ptr.tx - ptr.x) * kf; ptr.y += (ptr.ty - ptr.y) * kf;
  if (FROZEN) { ptr.lx = ptr.x - Math.cos(T * .31) * .12; ptr.ly = ptr.y; }
  else { // a soft spring: the strands follow late and overshoot a little
    ptr.vx += ((ptr.x - ptr.lx) * 26 - ptr.vx * 6.5) * dt; ptr.vy += ((ptr.y - ptr.ly) * 26 - ptr.vy * 6.5) * dt;
    ptr.lx += ptr.vx * dt; ptr.ly += ptr.vy * dt;
  }
  U.uPtr.value.set(ptr.x, ptr.y, idle ? .55 : 1);
  U.uPtrVel.value.set(Math.max(-.9, Math.min(.9, (ptr.lx - ptr.x) * -3.2)), Math.max(-.6, Math.min(.6, (ptr.ly - ptr.y) * -2)));

  // spray clock
  const pu = byName.use.p, wHero = Wt.hero, wUse = Wt.use, wFoot = Wt.footer;
  let cyc = ((T - puffT0) % 5.6 + 5.6) % 5.6; let ageT = cyc > 5.2 ? cyc - 5.6 : cyc;
  let age = ageT, amt = sstep(.45, .95, wHero) + sstep(.5, 1, wFoot);
  let capUse = 0, settleUse = 0;
  if (wUse > .001) {
    if (m) { amt = Math.max(amt, sstep(.6, 1, wUse)); settleUse = 0; }
    else if (wUse >= wHero) {
      age = (pu - .30) * 10.5; amt = sstep(.5, 1, wUse);
      capUse = sstep(.03, .24, pu) * 1.25; settleUse = sstep(.48, .92, pu) * .95;
    }
  }
  if (age >= 0 && lastAge < 0 && age < .5) hiss();
  lastAge = age;
  U.uSprayAge.value = age; U.uSprayAmt.value = Math.min(1, amt);
  const press = sstep(-.30, -.06, age) * (1 - sstep(.22, .65, age)) * Math.min(1, amt * 2);

  // growth
  const intro = FROZEN ? 1 : .45 + .55 * sstep(0, 3.2, T);
  const pe = byName.expect.p;
  let grow = P.grow;
  if (Wt.expect > 0) grow = P.grow + Wt.expect * (m ? .95 : sstep(.02, .98, pe) * 1.05);
  U.uGrow.value = grow * intro;
  U.uReveal.value = P.reveal; U.uSeep.value = P.reveal * (m ? .8 : sstep(0, .5, pe));
  U.uSettle.value = Math.min(1, P.settle + settleUse * wUse);
  U.uAmb.value = P.amb; U.uBeads.value = P.beads;

  // ground
  const nearNdc = P.gh / ((CAMZ - EDGE_Z) * TAN);
  U.uField.value.z = P.gh; U.uShift.value = P.gy - nearNdc; U.uGY.value = P.gy * .5 + .5;
  const ledgePx = (1 - U.uGY.value) * H + P.reveal * 1.5 * U.uU.value * H;
  U.uLedge.value = ledgePx;
  if (m) root.style.setProperty('--ledge', ledgePx.toFixed(1) + 'px');

  // bottle
  const hw = U.uHalf.value.x, hh = U.uHalf.value.y;
  const bob = Math.sin(T * .8) * .018;
  bottle.position.set(P.bx * hw, P.by * hh + bob * P.bs, 0);
  bottle.scale.setScalar(P.bs);
  const yaw = P.yaw + ptr.x * .20 + Math.sin(T * .37) * .05;
  bottle.rotation.set(.05 - ptr.y * .07, yaw, P.roll + Math.sin(T * .5) * .012);
  const capLift = Math.max(P.cap, capUse * (1 - sstep(.5, 1, 1 - wUse)));
  capG.position.set(-capLift * .22, capLift * .78 + Math.sin(T * .9 + 1) * .02 * Math.min(1, capLift), capLift * .05);
  capG.rotation.z = capLift * .34; capG.rotation.x = -capLift * .10;
  head.position.y = -press * .075;
  // liquid: it lags the turn and settles
  const yr = FROZEN ? Math.cos(T * .37) * .3 : (yaw - yawPrev) / dt; yawPrev = yaw;
  if (FROZEN) { slosh.x = .06 * Math.sin(T * 1.1) + .05; slosh.z = .03; }
  else {
    const tx = Math.max(-.3, Math.min(.3, -yr * .09)) + Math.sin(T * 1.3) * .012;
    slosh.v += ((tx - slosh.x) * 40 - slosh.v * 3.2) * dt; slosh.x += slosh.v * dt;
    slosh.vz += ((-slosh.z) * 30 - slosh.vz * 2.6 + slosh.v * 2) * dt; slosh.z += slosh.vz * dt;
    bubAng += ((-.5 - yaw * .0) - bubAng) * 0 + (-yr) * dt * .82; // the bubble keeps most of its place while the glass turns
  }
  bottle.updateMatrixWorld(true);
  q4.copy(bottle.quaternion).invert();
  bodyMat.uniforms.uLiqN.value.set(slosh.x, 1, slosh.z).normalize().applyQuaternion(q4);
  bodyMat.uniforms.uCamL.value.copy(cam.position); body.worldToLocal(bodyMat.uniforms.uCamL.value);
  bodyMat.uniforms.uScale.value = P.bs;
  const bc = ((T + 5) / 15) % 1; const by = .22 + (LEVEL - .30) * sstep(0, .9, bc);
  const ba = FROZEN ? .9 : bubAng;
  bubble.position.set(Math.sin(ba) * .33 + Math.sin(T * 2.1) * .012, by, Math.cos(ba) * .33);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const hid = (a, yy) => (Math.abs(wrap(a)) < 1.62 && yy > .33 && yy < 1.31) ? 0 : 1;
  bubble.scale.setScalar((.75 + .5 * bc) * (1 - sstep(.93, 1, bc)) * hid(ba, by));
  const bc2 = ((T + 11) / 9) % 1;
  bubble2.position.set(Math.sin(ba + 1.3) * .30, .2 + (LEVEL - .26) * bc2, Math.cos(ba + 1.3) * .30);
  bubble2.scale.setScalar((1 - sstep(.9, 1, bc2)) * hid(ba + 1.3, .2 + (LEVEL - .26) * bc2));
  nozTip.getWorldPosition(U.uNoz.value);
  v3.copy(nozDirL).setY(.10).normalize().transformDirection(inner.matrixWorld); U.uNozDir.value.copy(v3);

  U.uBeadY.value = P.gy + (m ? .12 : -.2);
  U.uSprayK.value = Math.sqrt(P.bs) * (m ? 1.25 : 1);
  U.uLand.value.set(U.uNoz.value.x + U.uNozDir.value.x * 2.3 * U.uSprayK.value, 100 + (1.9 - 100) * sstep(.3, .9, wUse));
  cam.updateMatrixWorld(); U.uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  v3.set(bottle.position.x, bottle.position.y, 0).project(cam);
  U.uBottle.value.set(v3.x * .5 + .5, v3.y * .5 + .5, P.bs * .30, sstep(1.25, .6, Math.abs(P.by)) * (m ? .6 : 1));
  U.uTime.value = T;

  // type follows the DOM
  for (const it of typeItems) {
    const r = it.el.getBoundingClientRect();
    const vis = r.bottom > -it.pad && r.top < H + it.pad && it.w > 0;
    it.mesh.visible = vis;
    if (vis) it.mat.uniforms.uRect.value.set(r.left - it.pad, r.top - it.pad, it.w + it.pad * 2, it.h + it.pad * 2);
  }
  // steps and timeline follow the scroll
  if (!m) {
    const si = Math.min(3, Math.floor(sstep(.04, .96, pu) * 4 - .001));
    const act = wUse > .5 ? [pu > .02, pu > .28, pu > .55, pu > .78] : [true, true, true, true];
    steps.forEach((li, i) => li.classList.toggle('on', act[i]));
    const tp = sstep(.0, .92, pe);
    tls.forEach((d, i) => d.classList.toggle('on', Wt.expect < .5 || tp * 4.2 >= i + .15));
    tlEl.style.setProperty('--p', Math.min(1, tp * 1.02).toFixed(3));
    // captions pinned to one follicle
    if (Wt.expect > .9) {
      const pr = pinE.getBoundingClientRect(); const upx = U.uU.value * H;
      const cell = Math.round(W * .2 / upx / .62);
      const h11 = p => { p = (p * .1031) % 1; if (p < 0) p += 1; p *= p + 33.33; p *= p + p; return p % 1; };
      const fx = (cell + .5 + (h11(cell + 40) - .5) * .45) * .62; const depth = .9 + .35 * h11(cell + 3);
      const sx = W / 2 + fx * upx, sy = ledgePx - P.reveal * 1.5 * upx;
      const posn = [[sx + 46, sy - 6], [sx + 30, sy + depth * .5 * upx], [sx + 34, sy + (depth + .02) * upx]];
      caps.forEach((c, i) => { c.style.left = posn[i][0] + 'px'; c.style.top = (posn[i][1] - pr.top - 8) + 'px'; c.classList.toggle('in', pe > .12 + i * .16); });
    } else caps.forEach(c => c.classList.remove('in'));
  }

  // render: backdrop and type at half size for the glass to look through, then the full picture, then the mist
  cam.layers.set(1);
  renderer.setRenderTarget(rtBg); renderer.clear(); renderer.render(world, cam);
  cam.layers.set(0);
  renderer.setRenderTarget(rtMain); renderer.clear(); renderer.render(world, cam);
  renderer.setRenderTarget(null); renderer.render(post, cam);

  // keep the frame rate: drop internal resolution when frames run long
  if (!FIXED_Q) {
    ftAvg += (dt * 1000 - ftAvg) * .06; ftN++;
    if (ftN > 50) {
      if (ftAvg > 21 && quality > .5) { quality = Math.max(.5, quality * .86); ftN = 0; resize(); }
      else if (ftAvg < 14.5 && quality < 1 && ftN > 240) { quality = Math.min(1, quality * 1.1); ftN = 0; resize(); }
    }
  }
  window.__frames = (window.__frames || 0) + 1;
  if (!FROZEN) requestAnimationFrame(frame); else window.__ready = true;
}

// ------------------------------------------------------------ start
makeType();
resize(); layout();
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { root: scroller, rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.rv').forEach(el => io.observe(el));

function applyStart() {
  layout();
  if (VIEW) {
    const s = byName[VIEW === 'press' ? 'use' : VIEW === 'follicle' ? 'expect' : VIEW];
    if (s) scroller.scrollTop = VIEW === 'press' ? s.a + (s.b - s.a) * .52 : s.name === 'hero' ? 0 : s.a + (s.b - s.a) * (s.el.classList.contains('tall') ? .75 : .5);
  } else if (S_PARAM !== null) scroller.scrollTop = S_PARAM * maxScroll;
  sTarget = sCur = scroller.scrollTop;
}
let rzT;
addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { resize(); rasterType(); layout(); if (FROZEN) frame(); }, 120); });

const fontsReady = document.fonts ? Promise.race([
  Promise.all([document.fonts.load('400 100px "Instrument Serif"'), document.fonts.load('italic 400 100px "Instrument Serif"'), document.fonts.load('500 40px "Geist"'), document.fonts.load('400 40px "Geist"')]).then(() => document.fonts.ready),
  new Promise(r => setTimeout(r, 3500)),
]) : Promise.resolve();

if (FROZEN) {
  fontsReady.then(() => { drawLabel(); rasterType(); applyStart(); document.querySelectorAll('.rv').forEach(el => { el.style.transition = 'none'; el.classList.add('in'); }); requestAnimationFrame(() => { frame(); frame(); }); });
} else {
  applyStart();
  requestAnimationFrame(frame);
  fontsReady.then(() => { drawLabel(); rasterType(); applyStart(); });
}
