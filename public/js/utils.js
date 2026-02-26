// ═══════════════════════════════════════════════
//  Utility helpers for Audio Playground
// ═══════════════════════════════════════════════

export const WIDTH = 1280;
export const HEIGHT = 800;
export const TAU = Math.PI * 2;

// ── Colour helpers ────────────────────────────

export function hsvToRgb(h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function hsv(h, s, v, a) {
  const [r, g, b] = hsvToRgb(h, s, v);
  return a !== undefined ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
}

export function rgb(r, g, b, a) {
  if (a !== undefined) return `rgba(${r},${g},${b},${a})`;
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

// ── Math helpers ──────────────────────────────

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

export function gauss(mean = 0, std = 1) {
  // Box-Muller
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2);
}

// ── Canvas draw helpers ───────────────────────

export function drawLines(ctx, pts, color, width = 1) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function fillCircle(ctx, cx, cy, r, color) {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

export function strokeCircle(ctx, cx, cy, r, color, width = 1) {
  if (r <= 0) return;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

export function fillRect(ctx, x, y, w, h, color, radius) {
  ctx.fillStyle = color;
  if (radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

export function strokeRect(ctx, x, y, w, h, color, width = 1, radius) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (radius) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.stroke();
  } else {
    ctx.strokeRect(x, y, w, h);
  }
}

export function drawText(ctx, text, x, y, color, size = 14, bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px Consolas,"Courier New",monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function drawPolygon(ctx, pts, color, fill = true, lineWidth = 1) {
  if (pts.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
