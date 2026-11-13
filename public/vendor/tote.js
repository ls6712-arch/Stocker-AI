// Tote: Stocker's 3D helper. A grocery bag that keeps an eye on the house.
// One renderer and one canvas; the page moves the canvas to wherever the character should appear.
import * as THREE from './three.module.min.js';

const C = { bag: 0xfbe9c8, bagDark: 0xf0d6a4, trim: 0x0f6b5c, ink: 0x10231d, white: 0xffffff, blush: 0xf59a8b, bread: 0xe2a45c, crust: 0xc98338, apple: 0xe8604c, leaf: 0x2f9e6b, leaf2: 0x3cb37a };
const mat = (color, o) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.62, metalness: 0 }, o || {}));
const mesh = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); return o; };

function build() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // the bag: a soft trapezoid, wider at the top
  const s = new THREE.Shape();
  const tw = 1.06, bw = 0.84, h = 1.5, r = 0.2;
  s.moveTo(-bw + r, 0);
  s.lineTo(bw - r, 0); s.quadraticCurveTo(bw, 0, bw + 0.02, r);
  s.lineTo(tw, h); s.lineTo(-tw, h);
  s.lineTo(-bw - 0.02, r); s.quadraticCurveTo(-bw, 0, -bw + r, 0);
  const bagGeo = new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.14, bevelSegments: 8, curveSegments: 16 });
  bagGeo.translate(0, 0, -0.35);
  const bag = mesh(bagGeo, mat(C.bag), 0, -0.75, 0);
  body.add(bag);

  // green rim around the opening
  const rimShape = new THREE.Shape();
  rimShape.moveTo(-tw - 0.13, 0); rimShape.lineTo(tw + 0.13, 0); rimShape.lineTo(tw + 0.13, 0.12); rimShape.lineTo(-tw - 0.13, 0.12); rimShape.closePath();
  const rimGeo = new THREE.ExtrudeGeometry(rimShape, { depth: 0.98, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 4 });
  rimGeo.translate(0, 0, -0.49);
  body.add(mesh(rimGeo, mat(C.trim, { roughness: 0.5 }), 0, 0.72, 0));
  // the dark inside of the bag
  body.add(mesh(new THREE.BoxGeometry(2.0, 0.05, 0.8), mat(0x0a3d34), 0, 0.83, 0));

  // handles, front and back
  const handleGeo = new THREE.TorusGeometry(0.46, 0.06, 12, 32, Math.PI);
  const handleMat = mat(C.trim, { roughness: 0.5 });
  [0.47, -0.47].forEach((z) => { const hnd = mesh(handleGeo, handleMat, 0, 0.8, z); hnd.rotation.x = z > 0 ? 0.5 : -0.3; hnd.scale.set(1, 1.2, 1); body.add(hnd); });

  // what it carries: a baguette, an apple and some greens
  const goods = new THREE.Group(); goods.position.set(0, 0.8, -0.05); body.add(goods);
  const bread = mesh(new THREE.CapsuleGeometry(0.15, 0.95, 8, 16), mat(C.bread), -0.48, 0.42, 0); bread.rotation.z = 0.24; goods.add(bread);
  [0.12, 0.38, 0.64].forEach((y) => { const cut = mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 12, Math.PI), mat(C.crust), -0.48 - (y - 0.4) * 0.24, 0.16 + y, 0.115); cut.rotation.set(0.2, 0, 0.24 + 1.2); goods.add(cut); });
  goods.add(mesh(new THREE.SphereGeometry(0.27, 24, 24), mat(C.apple, { roughness: 0.4 }), 0.02, 0.16, 0.08));
  const stem = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14), mat(C.crust), 0.02, 0.45, 0.08); goods.add(stem);
  const leafGeo = new THREE.SphereGeometry(0.3, 16, 16);
  [[0.5, 0.5, -0.5, C.leaf], [0.72, 0.36, -0.9, C.leaf2], [0.36, 0.3, -0.15, C.leaf2]].forEach((l) => { const lf = mesh(leafGeo, mat(l[3]), l[0], l[1], -0.02); lf.scale.set(0.48, 1, 0.16); lf.rotation.z = l[2]; goods.add(lf); });

  // face
  const face = new THREE.Group(); face.position.set(0, 0.02, 0.52); body.add(face);
  const eyes = [], pupils = [];
  [-0.36, 0.36].forEach((x) => {
    const eye = new THREE.Group(); eye.position.set(x, 0.12, 0);
    const white = mesh(new THREE.SphereGeometry(0.235, 24, 24), mat(C.white, { roughness: 0.3 })); white.scale.set(1, 1.08, 0.5); eye.add(white);
    const pupil = new THREE.Group(); pupil.position.z = 0.1;
    const dot = mesh(new THREE.SphereGeometry(0.135, 20, 20), mat(C.ink, { roughness: 0.25 })); dot.scale.set(1, 1, 0.45); pupil.add(dot);
    const glint = mesh(new THREE.SphereGeometry(0.036, 10, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0.04, 0.045, 0.05); pupil.add(glint);
    eye.add(pupil); face.add(eye); eyes.push(eye); pupils.push(pupil);
  });
  const smile = mesh(new THREE.TorusGeometry(0.13, 0.028, 8, 20, Math.PI), mat(C.ink, { roughness: 0.4 }), 0, -0.2, 0.02); smile.rotation.z = Math.PI; face.add(smile);
  const mouth = mesh(new THREE.SphereGeometry(0.09, 16, 16), mat(0x7a2e2a), 0, -0.25, 0.0); mouth.scale.set(1, 0.1, 0.4); mouth.visible = false; face.add(mouth);
  [-0.62, 0.62].forEach((x) => { const b = mesh(new THREE.SphereGeometry(0.11, 16, 16), mat(C.blush, { transparent: true, opacity: 0.7 }), x, -0.14, -0.02); b.scale.set(1, 0.7, 0.25); face.add(b); });

  // arms and feet
  const arms = [-1, 1].map((sgn) => {
    const pivot = new THREE.Group(); pivot.position.set(sgn * 0.98, 0.0, 0.1);
    const arm = mesh(new THREE.CapsuleGeometry(0.085, 0.3, 6, 12), mat(C.bagDark), sgn * 0.14, -0.16, 0); arm.rotation.z = sgn * 0.5; pivot.add(arm);
    body.add(pivot); return pivot;
  });
  [-0.42, 0.42].forEach((x) => { const f = mesh(new THREE.SphereGeometry(0.2, 16, 16), mat(C.trim), x, -0.92, 0.12); f.scale.set(1, 0.5, 1.25); root.add(f); });

  // soft contact shadow
  const shadow = mesh(new THREE.CircleGeometry(1.05, 40), new THREE.MeshBasicMaterial({ color: 0x10231d, transparent: true, opacity: 0.13 }), 0, -1.02, 0);
  shadow.rotation.x = -Math.PI / 2; shadow.scale.set(1, 0.5, 1); root.add(shadow);

  return { root, body, eyes, pupils, smile, mouth, arms, goods, shadow };
}

let renderer = null, scene, camera, parts, canvas, raf = 0, failed = false;
const state = { mood: 'happy', talk: false, hop: 0, wave: 0, look: { x: 0, y: 0 }, target: { x: 0, y: 0 }, nextBlink: 2, blink: 0, nextGlance: 3, glance: 0, glanceX: 0, lastPointer: -10, t0: performance.now() };
const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function init() {
  if (renderer || failed) return;
  try {
    canvas = document.createElement('canvas');
    canvas.className = 'tote3d';
    canvas.setAttribute('role', 'img');
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) { failed = true; renderer = null; return; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.9, 6.9); camera.lookAt(0, 0.42, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfe6dc, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e0, 1.9); key.position.set(2.5, 4, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfe8dc, 0.6); fill.position.set(-4, 1, 2); scene.add(fill);
  parts = build(); scene.add(parts.root);
  canvas.addEventListener('pointerdown', () => { api.hop(); if (api.onTap) api.onTap(); });
  window.addEventListener('pointermove', (e) => {
    if (!canvas.isConnected) return;
    const r = canvas.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    state.target.x = Math.max(-1, Math.min(1, (e.clientX - cx) / 220)); state.target.y = Math.max(-1, Math.min(1, (e.clientY - cy) / 220));
    state.lastPointer = performance.now() / 1000;
  }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });
}

function frame(now) {
  const t = (now - state.t0) / 1000, p = parts, s = state;
  // glance around when nobody is pointing: it is always looking out for things
  if (t - (s.lastPointer - s.t0 / 1000) > 2.5 && !still) {
    if (t > s.nextGlance) { s.glanceX = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5); s.glance = t + 0.9 + Math.random() * 0.8; s.nextGlance = s.glance + 1.5 + Math.random() * 3; }
    s.target.x = t < s.glance ? s.glanceX : 0; s.target.y = t < s.glance ? -0.15 : 0;
  }
  s.look.x += (s.target.x - s.look.x) * 0.12; s.look.y += (s.target.y - s.look.y) * 0.12;
  p.pupils.forEach((pu) => { pu.position.x = s.look.x * 0.075; pu.position.y = -s.look.y * 0.06; });
  p.body.rotation.y = s.look.x * 0.32; p.body.rotation.x = s.look.y * 0.1;
  // blink
  if (t > s.nextBlink) { s.blink = t; s.nextBlink = t + 2.2 + Math.random() * 3.5; }
  const bl = Math.max(0, 1 - Math.abs((t - s.blink) / 0.09 - 1));
  const lid = s.mood === 'sleepy' ? 0.42 : s.mood === 'alert' ? 1.14 : 1;
  p.eyes.forEach((e) => { e.scale.y = Math.max(0.08, lid * (1 - bl * 0.92)); e.scale.x = s.mood === 'alert' ? 1.08 : 1; });
  // breathing, hopping
  const speed = s.mood === 'sleepy' ? 1.1 : s.mood === 'alert' ? 3.4 : 1.9, amp = still ? 0 : s.mood === 'alert' ? 0.05 : 0.035;
  let y = Math.sin(t * speed) * amp, squash = 1 + Math.sin(t * speed + 1.2) * (still ? 0 : 0.012);
  if (s.hop) { const k = (t - s.hop) / 0.55; if (k >= 1) s.hop = 0; else { y += Math.sin(k * Math.PI) * 0.42; squash = 1 + Math.sin(k * Math.PI * 2) * 0.06; } }
  p.body.position.y = y; p.body.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
  p.shadow.scale.set(1 - y * 0.5, 0.5 - y * 0.25, 1); p.shadow.material.opacity = 0.13 - y * 0.12;
  p.goods.rotation.z = Math.sin(t * speed * 0.7) * 0.03;
  // arms: a wave on hello, a little flutter when alert
  const wv = s.wave ? Math.max(0, 1 - (t - s.wave) / 1.3) : 0; if (s.wave && !wv) s.wave = 0;
  p.arms[1].rotation.z = wv ? 1.5 + Math.sin(t * 16) * 0.35 : s.mood === 'alert' ? 0.5 + Math.sin(t * 9) * 0.18 : Math.sin(t * speed) * 0.06;
  p.arms[0].rotation.z = s.mood === 'alert' ? -0.5 - Math.sin(t * 9) * 0.18 : -Math.sin(t * speed) * 0.06;
  // mouth
  const open = s.talk ? 0.35 + Math.abs(Math.sin(t * 11)) * 0.9 : 0;
  p.mouth.visible = s.talk; p.smile.visible = !s.talk; p.mouth.scale.y = Math.max(0.1, open);
  renderer.render(scene, camera);
}

function loop() {
  cancelAnimationFrame(raf);
  const step = (now) => {
    if (!renderer || !canvas.isConnected || document.hidden) return; // stop drawing when off screen
    frame(now); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}

const api = {
  onTap: null,
  ok() { init(); return !failed; },
  // put the character inside a host element, at a size in CSS pixels
  mount(host, size, label) {
    init(); if (failed || !host) return false;
    const px = size || 120;
    canvas.style.width = px + 'px'; canvas.style.height = px + 'px';
    renderer.setSize(px, px, false);
    canvas.setAttribute('aria-label', label || 'Tote, your helper');
    if (canvas.parentNode !== host) host.appendChild(canvas);
    loop(); return true;
  },
  mood(m) { state.mood = m === 'alert' || m === 'sleepy' ? m : 'happy'; },
  talk(on) { state.talk = !!on; },
  hop() { if (!still) state.hop = (performance.now() - state.t0) / 1000; },
  wave() { if (!still) state.wave = (performance.now() - state.t0) / 1000; },
  // a still picture, for places that cannot run the live character
  snapshot() { if (!renderer) return ''; frame(performance.now()); return canvas.toDataURL('image/png'); },
};
window.Tote = api;
window.dispatchEvent(new Event('tote-ready'));
