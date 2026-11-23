// Falling snow over the hero, as heavy as the forecast says it's snowing right
// now (cm in the current/next 6h block at the summits). Nothing when it isn't
// snowing, and nothing at all for people who prefer reduced motion.

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let canvas, ctx, flakes = [], target = 0, running = false;

function resize() {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = r.width * dpr;
  canvas.height = r.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function flake(w, h, top) {
  const z = Math.random(); // depth: far flakes are small, slow and faint
  return { x: Math.random() * w, y: top ? -10 : Math.random() * h, r: 0.6 + z * 2.2, v: 0.25 + z * 1.1, drift: Math.random() * Math.PI * 2, a: 0.35 + z * 0.55 };
}

function frame() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);
  // New flakes appear anywhere (so a snowstorm starts full-screen); ones that land respawn at the top.
  while (flakes.length < target) flakes.push(flake(w, h, false));
  if (flakes.length > target) flakes.length = target;
  ctx.fillStyle = '#fff';
  for (const f of flakes) {
    f.y += f.v;
    f.drift += 0.01;
    f.x += Math.sin(f.drift) * 0.35;
    if (f.y > h + 5) Object.assign(f, flake(w, h, true));
    ctx.globalAlpha = f.a;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (target || flakes.length) requestAnimationFrame(frame);
  else running = false;
}

/** cmPer6h: the heaviest snowfall right now across the resorts. */
export function setSnowfall(el, cmPer6h) {
  if (reduceMotion) return;
  if (!canvas) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resize();
    addEventListener('resize', resize);
  }
  target = cmPer6h < 0.3 ? 0 : Math.round(Math.min(260, 30 + cmPer6h * 22));
  if (target && !running) { running = true; requestAnimationFrame(frame); }
}
