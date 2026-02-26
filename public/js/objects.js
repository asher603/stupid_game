// ═══════════════════════════════════════════════════════════
//  Interactive objects – faithful port from Python / Pygame
// ═══════════════════════════════════════════════════════════

import {
  WIDTH, HEIGHT, TAU,
  hsvToRgb, hsv, rgb, clamp, dist as hypot, gauss,
  drawLines, fillCircle, strokeCircle,
  fillRect, strokeRect, drawText, drawPolygon,
} from './utils.js';

// ═════════════════════════════════════════════════════════════
//  1. ELASTIC STRING  (pitch)
// ═════════════════════════════════════════════════════════════

export class ElasticString {
  constructor(x, y, length, engine) {
    this.eng = engine;
    this.x = x; this.y = y; this.length = length;
    this.N = 32;
    this.pts  = new Float64Array(this.N);
    this.vels = new Float64Array(this.N);
    this.grab = -1;
    this.hue  = 0;
    this.glow = 0;
    this._sp  = length / (this.N - 1);
  }

  reset() {
    this.pts.fill(0); this.vels.fill(0);
    this.grab = -1;
    this.eng.pitch = 1.0;
  }

  handle(type, mx, my, ev) {
    if (type === 'mousedown' && ev.button === 0) {
      for (let i = 0; i < this.N; i++) {
        const px = this.x + i * this._sp;
        const py = this.y + this.pts[i];
        if (Math.abs(mx - px) < 18 && Math.abs(my - py) < 50) {
          this.grab = i; return true;
        }
      }
    }
    if (type === 'mouseup' && ev.button === 0) this.grab = -1;
    return false;
  }

  update(mx, my, dt) {
    if (this.grab >= 0) {
      this.pts[this.grab] = clamp(my - this.y, -160, 160);
      this.vels[this.grab] = 0;
    }
    const tension = 0.35, damp = 0.96;
    const nw = Float64Array.from(this.pts);
    for (let i = 1; i < this.N - 1; i++) {
      if (i === this.grab) continue;
      const force = tension * (this.pts[i - 1] + this.pts[i + 1] - 2 * this.pts[i]);
      this.vels[i] = (this.vels[i] + force) * damp;
      nw[i] = this.pts[i] + this.vels[i];
    }
    nw[0] *= 0.92;
    nw[this.N - 1] *= 0.92;
    this.pts = nw;

    let sum = 0, maxAbs = 0;
    for (let i = 0; i < this.N; i++) { sum += this.pts[i]; maxAbs = Math.max(maxAbs, Math.abs(this.pts[i])); }
    const avg = sum / this.N;
    this.glow = Math.min(1, maxAbs / 80);
    const target = 1.0 + avg / 200 * 0.7;
    this.eng.pitch += (target - this.eng.pitch) * 0.12;
    this.hue = (this.hue + dt * 0.08) % 1;
  }

  draw(c) {
    const sp = this._sp;
    const pts = [];
    for (let i = 0; i < this.N; i++) pts.push([this.x + i * sp, this.y + this.pts[i]]);

    // Glow
    if (this.glow > 0.04) {
      for (const [w, a] of [[14, 30], [8, 55], [4, 85]]) {
        const [r, g, b] = hsvToRgb(this.hue, 0.6, 1);
        drawLines(c, pts, `rgba(${r},${g},${b},${(this.glow * a / 255).toFixed(3)})`, w);
      }
    }
    // Main line
    drawLines(c, pts, hsv(this.hue, 0.45, 1), 3);
    // Dots
    for (let i = 0; i < this.N; i += 4) fillCircle(c, pts[i][0], pts[i][1], 5, rgb(210, 210, 255));
    // Labels
    drawText(c, 'PITCH STRING', this.x, this.y - 35, rgb(160, 160, 210), 14);
    drawText(c, `x${this.eng.pitch.toFixed(2)}`, this.x + this.length - 50, this.y - 35, rgb(200, 200, 255), 14);
  }
}

// ═════════════════════════════════════════════════════════════
//  2. GRAVITY ORB  (filter cutoff)
// ═════════════════════════════════════════════════════════════

export class GravityOrb {
  constructor(rect, engine) {
    this.eng = engine;
    // rect = [x, y, w, h]
    this.rx = rect[0]; this.ry = rect[1]; this.rw = rect[2]; this.rh = rect[3];
    this.ox = this.rx + this.rw - 30;
    this.oy = this.ry + this.rh / 2;
    this.vx = 0; this.vy = 0;
    this.R = 22;
    this.grabbed = false;
    this.prev = [this.ox, this.oy];
    this.trail = [];
    this.hue = 0.55;
  }

  reset() {
    this.ox = this.rx + this.rw - 30;
    this.oy = this.ry + this.rh / 2;
    this.vx = 0; this.vy = 0;
    this.grabbed = false;
    this.trail = [];
    this.eng.cutoff = 1.0;
  }

  handle(type, mx, my, ev) {
    if (type === 'mousedown' && ev.button === 0) {
      if (hypot(mx, my, this.ox, this.oy) < this.R + 14) {
        this.grabbed = true;
        this.prev = [this.ox, this.oy];
        return true;
      }
    }
    if (type === 'mouseup' && ev.button === 0 && this.grabbed) {
      this.vx = (mx - this.prev[0]) * 3;
      this.vy = (my - this.prev[1]) * 3;
      this.grabbed = false;
    }
    return false;
  }

  update(mx, my, dt) {
    const lx = this.rx + this.R, hx = this.rx + this.rw - this.R;
    const ly = this.ry + this.R, hy = this.ry + this.rh - this.R;

    if (this.grabbed) {
      this.prev = [this.ox, this.oy];
      this.ox = clamp(mx, lx, hx);
      this.oy = clamp(my, ly, hy);
      this.vx = this.vy = 0;
    } else {
      this.vy += 300 * dt;
      this.vx *= 0.998; this.vy *= 0.998;
      this.ox += this.vx * dt;
      this.oy += this.vy * dt;
      if (this.ox < lx) { this.ox = lx; this.vx = Math.abs(this.vx) * 0.8; }
      if (this.ox > hx) { this.ox = hx; this.vx = -Math.abs(this.vx) * 0.8; }
      if (this.oy < ly) { this.oy = ly; this.vy = Math.abs(this.vy) * 0.8; }
      if (this.oy > hy) { this.oy = hy; this.vy = -Math.abs(this.vy) * 0.8; }
    }
    this.trail.push([this.ox, this.oy]);
    if (this.trail.length > 50) this.trail.shift();

    const nx = clamp((this.ox - this.rx) / this.rw, 0, 1);
    this.eng.cutoff = nx * nx;
    this.hue = (0.55 + nx * 0.3) % 1;
  }

  draw(c) {
    strokeRect(c, this.rx, this.ry, this.rw, this.rh, rgb(28, 28, 45), 1, 8);
    // Trail
    for (let i = 0; i < this.trail.length; i++) {
      const a = i / Math.max(1, this.trail.length);
      fillCircle(c, this.trail[i][0], this.trail[i][1], 3 + a * 7, hsv(this.hue, 0.5, a));
    }
    // Glow rings
    fillCircle(c, this.ox, this.oy, 36, hsv(this.hue, 0.4, 0.28));
    fillCircle(c, this.ox, this.oy, 28, hsv(this.hue, 0.4, 0.28));
    // Main orb
    fillCircle(c, this.ox, this.oy, this.R, hsv(this.hue, 0.65, 1));
    fillCircle(c, this.ox - 5, this.oy - 5, 5, rgb(255, 255, 255));
    // Labels
    drawText(c, 'FILTER ORB', this.rx, this.ry - 20, rgb(100, 180, 210), 14);
    const hzEst = Math.max(40, Math.round(40 * Math.pow(500, this.eng.cutoff)));
    const hzLbl = hzEst < 1000 ? `${hzEst} Hz` : `${(hzEst / 1000).toFixed(1)} kHz`;
    drawText(c, `Filter: ${hzLbl}`, this.rx + this.rw - 130, this.ry - 20, rgb(160, 160, 200), 14);
  }
}

// ═════════════════════════════════════════════════════════════
//  3. RIPPLE POND  (echo)
// ═════════════════════════════════════════════════════════════

export class RipplePond {
  constructor(cx, cy, radius, engine) {
    this.eng = engine;
    this.cx = cx; this.cy = cy; this.rad = radius;
    this.ripples = [];
  }

  reset() { this.ripples = []; this.eng.echoMix = 0; }

  handle(type, mx, my, ev) {
    if (type === 'mousedown' && ev.button === 0) {
      if (hypot(mx, my, this.cx, this.cy) < this.rad) {
        this.ripples.push({ x: mx, y: my, r: 0, mx: 120 + Math.random() * 100, hue: Math.random() });
        return true;
      }
    }
    return false;
  }

  update(mx, my, dt) {
    this.ripples = this.ripples.filter(rp => { rp.r += 35 * dt; return rp.r < rp.mx; });
    const target = Math.min(0.95, this.ripples.length * 0.40);
    this.eng.echoMix += (target - this.eng.echoMix) * 0.3;
  }

  draw(c) {
    // Background circle
    c.save(); c.globalAlpha = 0.55;
    fillCircle(c, this.cx, this.cy, this.rad, rgb(18, 28, 55));
    c.restore();
    strokeCircle(c, this.cx, this.cy, this.rad, rgb(35, 55, 95), 2);
    // Ripples
    for (const rp of this.ripples) {
      const a = 1 - rp.r / rp.mx;
      strokeCircle(c, rp.x, rp.y, rp.r, hsv(rp.hue, 0.35, 0.85, a), Math.max(1, 3 * a));
    }
    drawText(c, 'ECHO POND', this.cx - 45, this.cy - this.rad - 22, rgb(100, 150, 210), 14);
    drawText(c, `Echo ${Math.round(this.eng.echoMix * 100)}%`, this.cx - 45, this.cy + this.rad + 6, rgb(150, 150, 200), 14);
  }
}

// ═════════════════════════════════════════════════════════════
//  4. PARTICLE CLOUD  (distortion)
// ═════════════════════════════════════════════════════════════

export class ParticleCloud {
  constructor(cx, cy, engine) {
    this.eng = engine;
    this.cx = cx; this.cy = cy;
    this.tx = cx; this.ty = cy;
    this.NP = 70;
    this.ps = [];
    for (let i = 0; i < this.NP; i++) {
      this.ps.push({ x: cx + gauss(0, 25), y: cy + gauss(0, 25), vx: 0, vy: 0, hue: Math.random(), sz: 2.5 + Math.random() * 3.5 });
    }
    this.active = false;
    this.spread = 25;
    this.bx = cx - 130; this.by = cy - 130; this.bw = 260; this.bh = 260;
  }

  reset() { this.active = false; this.tx = this.cx; this.ty = this.cy; this.spread = 25; this.eng.dist = 0; }

  handle(type, mx, my, ev) {
    if (type === 'mousedown' && ev.button === 0 && mx >= this.bx && mx <= this.bx + this.bw && my >= this.by && my <= this.by + this.bh) {
      this.active = true; return true;
    }
    if (type === 'mouseup' && ev.button === 0) this.active = false;
    return false;
  }

  update(mx, my, dt) {
    if (this.active) {
      this.tx = mx; this.ty = my;
      this.spread = 25 + hypot(mx, my, this.cx, this.cy) * 0.9;
    } else {
      this.tx += (this.cx - this.tx) * 0.03;
      this.ty += (this.cy - this.ty) * 0.03;
      this.spread += (25 - this.spread) * 0.04;
    }
    for (const p of this.ps) {
      const dx = this.tx - p.x, dy = this.ty - p.y;
      p.vx += dx * 0.025 + gauss(0, this.spread * 0.25);
      p.vy += dy * 0.025 + gauss(0, this.spread * 0.25);
      p.vx *= 0.88; p.vy *= 0.88;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.hue = (p.hue + dt * 0.12) % 1;
    }
    this.eng.dist = Math.min(1, Math.max(0, (this.spread - 25) / 110));
  }

  draw(c) {
    strokeRect(c, this.bx, this.by, this.bw, this.bh, rgb(28, 22, 30), 1, 6);
    for (const p of this.ps) fillCircle(c, p.x, p.y, p.sz, hsv(p.hue, 0.75, 0.92));
    drawText(c, 'DISTORTION CLOUD', this.bx, this.by - 20, rgb(200, 150, 180), 14);
    drawText(c, `Dist ${Math.round(this.eng.dist * 100)}%`, this.bx + this.bw - 85, this.by - 20, rgb(200, 150, 200), 14);
  }
}

// ═════════════════════════════════════════════════════════════
//  5. VOLUME THREAD
// ═════════════════════════════════════════════════════════════

export class VolumeThread {
  constructor(x, y, length, engine) {
    this.eng = engine;
    this.x = x; this.y0 = y; this.length = length;
    this.pull = 0.7;
    this.hy = y + length * this.pull;
    this.grabbed = false;
  }

  reset() { this.pull = 0.7; this.hy = this.y0 + this.length * this.pull; this.grabbed = false; this.eng.volume = 0.7; }

  handle(type, mx, my, ev) {
    if (type === 'mousedown' && ev.button === 0 && Math.abs(mx - this.x) < 22 && Math.abs(my - this.hy) < 22) {
      this.grabbed = true; return true;
    }
    if (type === 'mouseup' && ev.button === 0) this.grabbed = false;
    return false;
  }

  update(mx, my, dt) {
    if (this.grabbed) {
      this.hy = clamp(my, this.y0, this.y0 + this.length);
      this.pull = (this.hy - this.y0) / this.length;
    }
    this.eng.volume = this.pull;
  }

  draw(c) {
    const x = this.x, y0 = this.y0, ln = this.length;
    // Track
    drawLines(c, [[x, y0], [x, y0 + ln]], rgb(50, 50, 65), 2);
    // Filled portion
    if (this.pull > 0) {
      const h = (0.3 - this.pull * 0.3 + 1) % 1;
      drawLines(c, [[x, y0], [x, this.hy]], hsv(h, 0.65, 0.9), 4);
    }
    // Handle
    fillCircle(c, x, this.hy, 13, rgb(225, 225, 245));
    strokeCircle(c, x, this.hy, 13, rgb(180, 180, 200), 2);
    drawText(c, 'VOLUME', x - 32, y0 - 28, rgb(150, 200, 150), 14);
    drawText(c, `${Math.round(this.pull * 100)}%`, x - 18, y0 + ln + 12, rgb(200, 200, 200), 14);
  }
}

// ═════════════════════════════════════════════════════════════
//  6. REVERSE VORTEX
// ═════════════════════════════════════════════════════════════

export class ReverseVortex {
  constructor(cx, cy, engine) {
    this.eng = engine;
    this.cx = cx; this.cy = cy; this.R = 55;
    this.active = false; this.angle = 0;
    this.particles = [];
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        a: Math.random() * TAU, r: 10 + Math.random() * 40,
        s: 0.5 + Math.random() * 1.5, hue: Math.random(),
        base_r: 10 + Math.random() * 40,
      });
    }
  }

  reset() { this.active = false; this.eng.reverse = false; }

  handle(type, mx, my, ev) {
    if (type === 'mousedown' && ev.button === 0 && hypot(mx, my, this.cx, this.cy) < this.R) {
      this.active = true; return true;
    }
    if (type === 'mouseup' && ev.button === 0) this.active = false;
    return false;
  }

  update(mx, my, dt) {
    const spin = this.active ? 5 : 0.6;
    this.angle += spin * dt;
    for (const p of this.particles) {
      p.a += p.s * dt * (this.active ? -spin : spin * 0.3);
      if (this.active) p.r = Math.max(3, p.r - 40 * dt);
      else p.r += (p.base_r - p.r) * 0.03;
      p.hue = (p.hue + dt * 0.15) % 1;
    }
    this.eng.reverse = this.active;
  }

  draw(c) {
    // Glow when active
    if (this.active) {
      fillCircle(c, this.cx, this.cy, this.R * 2, `rgba(80,30,120,0.2)`);
      fillCircle(c, this.cx, this.cy, this.R, `rgba(120,40,160,0.14)`);
    }
    // Spiral arms
    for (let arm = 0; arm < 3; arm++) {
      const base = this.angle + arm * TAU / 3;
      const pts = [];
      for (let j = 0; j < 20; j++) {
        const t = j / 20;
        const r = 5 + t * this.R;
        const a = base + t * 3.5;
        pts.push([this.cx + Math.cos(a) * r, this.cy + Math.sin(a) * r]);
      }
      drawLines(c, pts, this.active ? rgb(140, 60, 200) : rgb(45, 25, 65), 2);
    }
    // Particles
    for (const p of this.particles) {
      const px = this.cx + Math.cos(p.a) * p.r;
      const py = this.cy + Math.sin(p.a) * p.r;
      fillCircle(c, px, py, 3, hsv(p.hue, 0.6, this.active ? 0.9 : 0.45));
    }
    // Centre
    fillCircle(c, this.cx, this.cy, 8, this.active ? rgb(200, 100, 255) : rgb(55, 35, 75));
    strokeCircle(c, this.cx, this.cy, this.R, rgb(30, 15, 45), 2);
    const lbl = this.active ? '<<< REVERSE' : 'REVERSE VORTEX';
    drawText(c, lbl, this.cx - 55, this.cy - this.R - 22, this.active ? rgb(200, 120, 255) : rgb(110, 70, 150), 14);
  }
}

// ═════════════════════════════════════════════════════════════
//  7. TIME SPIRAL  (speed)
// ═════════════════════════════════════════════════════════════

export class TimeSpiral {
  constructor(cx, cy, engine) {
    this.eng = engine;
    this.cx = cx; this.cy = cy; this.R = 50;
    this.speed = 1; this.angle = 0;
    this.grabbed = false;
    this._startAngle = 0; this._startSpeed = 1;
  }

  reset() { this.speed = 1; this.grabbed = false; this.eng.speedMult = 1; }

  handle(type, mx, my, ev) {
    if (type === 'mousedown' && ev.button === 0 && hypot(mx, my, this.cx, this.cy) < this.R + 10) {
      this.grabbed = true;
      this._startAngle = Math.atan2(my - this.cy, mx - this.cx);
      this._startSpeed = this.speed;
      return true;
    }
    if (type === 'mouseup' && ev.button === 0) this.grabbed = false;
    if (type === 'wheel' && hypot(mx, my, this.cx, this.cy) < this.R + 30) {
      const d = ev.deltaY > 0 ? -1 : ev.deltaY < 0 ? 1 : 0;
      this.speed = clamp(this.speed + d * 0.1, 0.25, 3);
      return true;
    }
    return false;
  }

  update(mx, my, dt) {
    if (this.grabbed) {
      let cur = Math.atan2(my - this.cy, mx - this.cx);
      let delta = cur - this._startAngle;
      if (delta > Math.PI) delta -= TAU;
      if (delta < -Math.PI) delta += TAU;
      this.speed = clamp(this._startSpeed + delta * 0.5, 0.25, 3);
    }
    this.angle += dt * this.speed * 2;
    this.eng.speedMult = this.speed;
  }

  draw(c) {
    for (let i = 0; i < 5; i++) {
      const r = 12 + i * 9;
      const a = this.angle * (1 + i * 0.3);
      const col_v = 0.25 + i * 0.12;
      const col = hsv(0.55 + this.speed * 0.1, 0.4, col_v);
      for (let seg = 0; seg < 3; seg++) {
        const sa = a + seg * TAU / 3;
        const pts = [];
        for (let j = 0; j < 8; j++) {
          const t = sa + j * 0.25;
          pts.push([this.cx + Math.cos(t) * r, this.cy + Math.sin(t) * r]);
        }
        drawLines(c, pts, col, 2);
      }
    }
    // Speed label
    drawText(c, `${this.speed.toFixed(1)}x`, this.cx - 18, this.cy - 9, rgb(200, 200, 240), 18, true);
    const hue = (0.5 + (this.speed - 1) * 0.2 + 1) % 1;
    strokeCircle(c, this.cx, this.cy, this.R, hsv(hue, 0.5, 0.7), 2);
    drawText(c, 'TIME WARP', this.cx - 38, this.cy - this.R - 22, rgb(140, 160, 200), 14);
    drawText(c, 'scroll / drag', this.cx - 48, this.cy + this.R + 6, rgb(80, 80, 110), 14);
  }
}

// ═════════════════════════════════════════════════════════════
//  8. DRAGGABLE SPEAKER  (3-D pan / distance)
// ═════════════════════════════════════════════════════════════

export class DraggableSpeaker {
  constructor(engine) {
    this.eng = engine;
    this.sx = (WIDTH / 2 | 0) + 60;
    this.sy = (HEIGHT / 2 | 0) - 40;
    this.sz = 0;
    this.Z_MIN = -1; this.Z_MAX = 1;
    this.grabbed = false; this.grabOff = [0, 0];
    this.pulse = 0;
    this.bassOn = false; this.muted = false; this.mono = false;
    this._btnSize = 22;
  }

  reset() {
    this.sx = (WIDTH / 2 | 0) + 60; this.sy = (HEIGHT / 2 | 0) - 40; this.sz = 0;
    this.grabbed = false; this.bassOn = false; this.muted = false; this.mono = false;
    this.eng.pan = 0;
  }

  _scale() { return 1 + this.sz * 0.6; }

  _btnRects() {
    const sc = this._scale(), sz = (this._btnSize * sc) | 0;
    const bx = this.sx - (sz * 1.6) | 0, by = this.sy + (34 * sc) | 0;
    return [
      { x: bx, y: by, w: sz, h: sz },
      { x: bx + sz + 4, y: by, w: sz, h: sz },
      { x: bx + (sz + 4) * 2, y: by, w: sz, h: sz },
    ];
  }

  _inRect(mx, my, r) { return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h; }

  handle(type, mx, my, ev) {
    const [bass, mute, mono] = this._btnRects();
    if (type === 'mousedown' && ev.button === 0) {
      if (this._inRect(mx, my, bass)) { this.bassOn = !this.bassOn; return true; }
      if (this._inRect(mx, my, mute)) { this.muted = !this.muted; return true; }
      if (this._inRect(mx, my, mono)) { this.mono = !this.mono; return true; }
      if (hypot(mx, my, this.sx, this.sy) < 28 * this._scale()) {
        this.grabbed = true; this.grabOff = [this.sx - mx, this.sy - my]; return true;
      }
    }
    if (type === 'mouseup' && ev.button === 0) this.grabbed = false;
    if (type === 'wheel') {
      const d = ev.deltaY > 0 ? -1 : ev.deltaY < 0 ? 1 : 0;
      this.sz = clamp(this.sz + d * 0.08, this.Z_MIN, this.Z_MAX);
      return true;
    }
    return false;
  }

  update(mx, my, dt) {
    if (this.grabbed) {
      this.sx = clamp(mx + this.grabOff[0], 40, WIDTH - 40) | 0;
      this.sy = clamp(my + this.grabOff[1], 40, HEIGHT - 100) | 0;
    }
    this.pulse = (this.pulse + dt * 4) % TAU;

    const lcx = WIDTH / 2, lcy = HEIGHT / 2;
    const dx = (this.sx - lcx) / (WIDTH / 2);
    const dy = (this.sy - lcy) / (HEIGHT / 2);
    const dist3d = Math.min(1, Math.sqrt(dx * dx + dy * dy + this.sz * this.sz));

    this.eng.pan = clamp(dx * 1.4, -1, 1);
    const proximity = 1 - dist3d;
    const spkCutoff = 0.08 + proximity * 0.92;
    this.eng.cutoff = Math.min(this.eng.cutoff, spkCutoff);
    let spkVol = 0.3 + proximity * 0.7;
    if (this.muted) spkVol = 0;
    this.eng.volume = Math.min(this.eng.volume, spkVol);
    if (this.bassOn) this.eng.cutoff = Math.min(this.eng.cutoff, 0.35);
    if (this.mono) this.eng.pan = 0;
  }

  draw(c) {
    const sx = this.sx, sy = this.sy, sc = this._scale();
    const lcx = WIDTH / 2 | 0, lcy = HEIGHT / 2 | 0;

    // Listener
    strokeCircle(c, lcx, lcy, 14, rgb(35, 35, 55), 1);
    fillCircle(c, lcx, lcy, 3, rgb(30, 30, 50));
    drawText(c, 'YOU', lcx - 10, lcy + 16, rgb(50, 50, 75), 9);

    // Dashed line
    const dPx = hypot(sx, sy, lcx, lcy);
    if (dPx > 20) {
      const zBright = 40 + Math.max(0, this.sz + 1) * 20 | 0;
      c.save(); c.setLineDash([8, 6]);
      c.beginPath(); c.moveTo(lcx, lcy); c.lineTo(sx, sy);
      c.strokeStyle = rgb(zBright, zBright + 10, zBright + 30);
      c.lineWidth = 1; c.stroke(); c.setLineDash([]); c.restore();
    }

    // Shadow
    const shadR = 20 * sc | 0;
    c.save(); c.globalAlpha = Math.max(0.04, 0.2 * sc);
    c.beginPath(); c.ellipse(sx, sy + 28 * sc, shadR, shadR / 2, 0, 0, TAU);
    c.fillStyle = 'black'; c.fill(); c.restore();

    // Speaker body
    const bw = 42 * sc | 0, bh = 50 * sc | 0;
    const bx = sx - bw / 2, by = sy - bh / 2;
    const zVal = (this.sz - this.Z_MIN) / (this.Z_MAX - this.Z_MIN);
    const baseBr = 40 + zVal * 30 | 0;
    const bodyCol = this.muted ? rgb(70, 30, 30) : rgb(baseBr, baseBr, baseBr + 20);
    fillRect(c, bx, by, bw, bh, bodyCol, 6 * sc);
    const edgeB = 70 + zVal * 50 | 0;
    strokeRect(c, bx, by, bw, bh, rgb(edgeB, edgeB, edgeB + 30), 2, 6 * sc);

    // Cone
    const coneR = (14 + Math.sin(this.pulse) * 2) * sc | 0;
    const coneCol = this.muted ? rgb(100, 50, 50) : rgb(70 + zVal * 30 | 0, 70 + zVal * 30 | 0, 100 + zVal * 40 | 0);
    fillCircle(c, sx, sy - 2 * sc, coneR, coneCol);
    strokeCircle(c, sx, sy - 2 * sc, coneR, rgb(110, 110, 150), 2);
    fillCircle(c, sx, sy - 2 * sc, Math.max(2, 6 * sc), rgb(60, 60, 85));

    // Sound waves
    if (!this.muted) {
      for (let i = 0; i < 3; i++) {
        const wr = coneR + 8 + i * 10 + Math.sin(this.pulse + i * 0.8) * 3;
        const wa = Math.max(0, (90 - i * 30) * sc) / 255;
        strokeCircle(c, sx, sy - 2 * sc, wr, rgb(130, 130, 200, wa), 2);
      }
    }

    drawText(c, 'SPEAKER', sx - 22 * sc, sy - bh / 2 - 14 * sc, rgb(100, 100, 140), Math.max(8, 10 * sc | 0), true);

    // Z depth bar
    const barX = sx + bw / 2 + 12, barY = sy - 40, barH = 80;
    drawLines(c, [[barX, barY], [barX, barY + barH]], rgb(40, 40, 60), 2);
    const zNorm = (this.sz - this.Z_MIN) / (this.Z_MAX - this.Z_MIN);
    const mkY = barY + (1 - zNorm) * barH;
    fillCircle(c, barX, mkY, 5, rgb(120, 180, 255));
    drawText(c, 'NEAR', barX + 8, barY - 4, rgb(60, 80, 120), 8);
    drawText(c, 'FAR', barX + 8, barY + barH - 4, rgb(60, 80, 120), 8);
    drawText(c, `Z ${this.sz >= 0 ? '+' : ''}${this.sz.toFixed(2)}`, barX - 6, mkY - 14, rgb(100, 140, 200), 8);

    // Info
    const dist3d = Math.min(1, Math.sqrt(((sx - lcx) / (WIDTH / 2)) ** 2 + ((sy - lcy) / (HEIGHT / 2)) ** 2 + this.sz ** 2));
    drawText(c, `Pan ${this.eng.pan >= 0 ? '+' : ''}${this.eng.pan.toFixed(2)}  3D-Dist ${Math.round(dist3d * 100)}%`, sx - 40 * sc, sy + bh / 2 + 60 * sc, rgb(80, 80, 110), 9);
    drawText(c, 'Scroll = depth', sx - 35 * sc, sy + bh / 2 + 72 * sc, rgb(55, 55, 80), 8);

    // Mini buttons
    const [bassR, muteR, monoR] = this._btnRects();
    const btns = [
      [bassR, 'B', this.bassOn, rgb(200, 130, 60), rgb(50, 50, 65), 'BASS'],
      [muteR, 'M', this.muted, rgb(200, 60, 60), rgb(50, 50, 65), 'MUTE'],
      [monoR, '1', this.mono, rgb(60, 160, 200), rgb(50, 50, 65), 'MONO'],
    ];
    for (const [r, lbl, on, onCol, offCol, txt] of btns) {
      fillRect(c, r.x, r.y, r.w, r.h, on ? onCol : offCol, 4);
      strokeRect(c, r.x, r.y, r.w, r.h, on ? rgb(255, 200, 120) : rgb(80, 80, 100), 1, 4);
      drawText(c, lbl, r.x + r.w / 2 - 4, r.y + r.h / 2 - 6, rgb(220, 220, 240), Math.max(8, 11 * sc | 0), true);
      drawText(c, txt, r.x, r.y + r.h + 2, rgb(70, 70, 90), Math.max(7, 8 * sc | 0));
    }
  }
}

// ═════════════════════════════════════════════════════════════
//  9. SPACE SHOOTER MINI-GAME
// ═════════════════════════════════════════════════════════════

export class SpaceShooter {
  constructor(btnX, btnY, engine) {
    this.eng = engine;
    this.btnRect = { x: btnX, y: btnY, w: 110, h: 32 };
    this.open = false;
    this.GW = 400; this.GH = 340;
    this.gx = ((WIDTH - this.GW) / 2) | 0;
    this.gy = ((HEIGHT - this.GH) / 2) | 0;
    this._resetGame();
  }

  _resetGame() {
    this.px = this.GW / 2; this.py = this.GH - 30;
    this.bullets = []; this.enemies = []; this.particles = [];
    this.score = 0; this.combo = 0; this.hp = 5;
    this.spawnCd = 0; this.shootCd = 0; this.hitFlash = 0;
    this.gameOver = false;
    this._keys = new Set();
    this._stars = [];
    const rng = mulberry32(42);
    for (let i = 0; i < 60; i++) this._stars.push([rng() * this.GW | 0, rng() * this.GH | 0]);
  }

  reset() { this.open = false; this._resetGame(); }

  handle(type, mx, my, ev) {
    const br = this.btnRect;
    if (type === 'mousedown' && ev.button === 0) {
      if (mx >= br.x && mx <= br.x + br.w && my >= br.y && my <= br.y + br.h) {
        this.open = !this.open;
        if (this.open) this._resetGame();
        return true;
      }
      if (this.open && !(mx >= this.gx && mx <= this.gx + this.GW && my >= this.gy && my <= this.gy + this.GH)) {
        this.open = false; return true;
      }
    }
    if (!this.open) return false;

    if (type === 'keydown') {
      if (ev.key === 'ArrowLeft' || ev.key === 'a') { this._keys.add('left'); return true; }
      if (ev.key === 'ArrowRight' || ev.key === 'd') { this._keys.add('right'); return true; }
      if (ev.key === 'ArrowUp' || ev.key === 'w') { this._keys.add('shoot'); return true; }
    }
    if (type === 'keyup') {
      if (ev.key === 'ArrowLeft' || ev.key === 'a') this._keys.delete('left');
      if (ev.key === 'ArrowRight' || ev.key === 'd') this._keys.delete('right');
      if (ev.key === 'ArrowUp' || ev.key === 'w') this._keys.delete('shoot');
      if (ev.key === 'Enter' && this.gameOver) { this._resetGame(); return true; }
    }
    return false;
  }

  update(mx, my, dt) {
    if (!this.open || this.gameOver) return;

    // Player movement
    const spd = 220;
    if (this._keys.has('left'))  this.px = Math.max(10, this.px - spd * dt);
    if (this._keys.has('right')) this.px = Math.min(this.GW - 10, this.px + spd * dt);

    // Shooting
    this.shootCd -= dt;
    if (this._keys.has('shoot') && this.shootCd <= 0) {
      this.bullets.push({ x: this.px, y: this.py - 8, vy: -350 });
      this.shootCd = 0.15;
    }

    // Move bullets
    this.bullets = this.bullets.filter(b => { b.y += b.vy * dt; return b.y > 0; });

    // Spawn enemies
    this.spawnCd -= dt;
    if (this.spawnCd <= 0) {
      const types = ['normal', 'normal', 'fast', 'big'];
      const etype = types[Math.random() * types.length | 0];
      const w = etype === 'big' ? 30 : 20;
      const sp = { normal: 80, fast: 160, big: 50 }[etype];
      this.enemies.push({ x: w + Math.random() * (this.GW - 2 * w), y: -10, vy: sp, w, h: 14, hp: etype === 'big' ? 3 : 1, type: etype, hue: Math.random() });
      this.spawnCd = Math.max(0.3, 1.2 - this.score * 0.015) + Math.random() * 0.4;
    }

    // Move enemies
    this.enemies = this.enemies.filter(e => {
      e.y += e.vy * dt;
      e.hue = (e.hue + dt * 0.3) % 1;
      if (e.y > this.GH + 20) {
        this.hp--; this.combo = 0; this.hitFlash = 0.3;
        this.eng.dist = Math.min(1, this.eng.dist + 0.3);
        if (this.hp <= 0) this.gameOver = true;
        return false;
      }
      return true;
    });

    // Collision
    const newBullets = [];
    for (const b of this.bullets) {
      let hit = false;
      for (const e of this.enemies) {
        if (Math.abs(b.x - e.x) < e.w && Math.abs(b.y - e.y) < e.h + 4) {
          e.hp--;
          hit = true;
          for (let i = 0; i < 6; i++) {
            this.particles.push({ x: b.x, y: b.y, vx: gauss(0, 80), vy: gauss(-40, 60), life: 0.4 + Math.random() * 0.3, hue: e.hue });
          }
          break;
        }
      }
      if (!hit) newBullets.push(b);
    }
    this.bullets = newBullets;

    // Remove dead enemies
    this.enemies = this.enemies.filter(e => {
      if (e.hp <= 0) {
        this.score++; this.combo++;
        this.eng.echoMix = Math.min(1, this.eng.echoMix + 0.15);
        for (let i = 0; i < 12; i++) {
          this.particles.push({ x: e.x, y: e.y, vx: gauss(0, 120), vy: gauss(0, 120), life: 0.5 + Math.random() * 0.4, hue: e.hue });
        }
        return false;
      }
      return true;
    });

    // Particles
    this.particles = this.particles.filter(p => { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; return p.life > 0; });

    this.hitFlash = Math.max(0, this.hitFlash - dt);

    // Audio influence
    const tgt = 1 + Math.min(this.combo, 20) * 0.015;
    this.eng.pitch += (tgt - this.eng.pitch) * 0.05;
    this.eng.cutoff = Math.max(this.eng.cutoff, Math.min(1, this.score / 40) * 0.8);
  }

  draw(c) {
    // Button (always visible)
    const br = this.btnRect;
    fillRect(c, br.x, br.y, br.w, br.h, this.open ? rgb(80, 200, 120) : rgb(50, 90, 60), 6);
    strokeRect(c, br.x, br.y, br.w, br.h, this.open ? rgb(100, 255, 140) : rgb(70, 130, 80), 2, 6);
    drawText(c, this.open ? 'CLOSE GAME' : 'SPACE GAME', br.x + 10, br.y + 8, rgb(200, 255, 210), 13, true);

    if (!this.open) return;

    // Game viewport
    const gx = this.gx, gy = this.gy;
    c.save();
    c.translate(gx, gy);

    // Background
    fillRect(c, 0, 0, this.GW, this.GH, `rgba(6,6,18,0.9)`);
    for (const [sx, sy] of this._stars) fillCircle(c, sx, sy, 0.8, rgb(100, 100, 130));

    // Player
    const px = this.px | 0, py = this.py | 0;
    const shipCol = (this.hitFlash > 0 && (this.hitFlash * 20 | 0) % 2) ? rgb(255, 80, 80) : rgb(100, 255, 160);
    drawPolygon(c, [[px, py - 10], [px - 8, py + 6], [px + 8, py + 6]], shipCol);
    fillCircle(c, px, py + 8, 3 + (Math.random() * 2 | 0), rgb(80, 180, 255));

    // Bullets
    for (const b of this.bullets) fillRect(c, b.x - 1, b.y - 4, 2, 8, rgb(255, 255, 100));

    // Enemies
    for (const e of this.enemies) {
      const col = hsv(e.hue, 0.7, 0.9);
      const ex = e.x | 0, ey = e.y | 0;
      if (e.type === 'big') {
        drawPolygon(c, [[ex, ey - 12], [ex + e.w, ey], [ex, ey + 12], [ex - e.w, ey]], col);
      } else if (e.type === 'fast') {
        drawLines(c, [[ex - 10, ey - 6], [ex, ey + 6], [ex + 10, ey - 6]], col, 2);
      } else {
        fillRect(c, ex - e.w / 2, ey - 6, e.w, 12, col);
      }
    }

    // Particles
    for (const p of this.particles) {
      const a = Math.min(1, p.life * 2);
      fillCircle(c, p.x, p.y, Math.max(1, 3 * a), hsv(p.hue, 0.6, a));
    }

    // HUD
    drawText(c, `Score: ${this.score}`, 8, 6, rgb(200, 255, 200), 14, true);
    drawText(c, `Combo: ${this.combo}`, 8, 24, rgb(255, 220, 100), 14, true);
    for (let i = 0; i < this.hp; i++) fillCircle(c, this.GW - 16 - i * 18, 14, 6, rgb(255, 60, 80));

    if (this.gameOver) {
      drawText(c, 'GAME OVER', this.GW / 2 - 70, this.GH / 2 - 20, rgb(255, 80, 80), 24, true);
      drawText(c, 'Press ENTER to retry', this.GW / 2 - 80, this.GH / 2 + 12, rgb(180, 180, 200), 14);
    }

    drawText(c, 'A/D or Arrows = move   W or Up = shoot', 8, this.GH - 18, rgb(80, 80, 110), 11);
    strokeRect(c, 0, 0, this.GW, this.GH, rgb(80, 200, 130), 2);

    c.restore();
  }
}

// ═════════════════════════════════════════════════════════════
//  HIDDEN: CHAOS BURST  (right-click 5× rapidly)
// ═════════════════════════════════════════════════════════════

export class ChaosBurst {
  constructor(engine) {
    this.eng = engine;
    this.clicks = [];
    this.active = false;
    this.timer = 0;
    this.DURATION = 3;
    this.sparks = [];
    this._saved = {};
  }

  reset() { this.active = false; this.timer = 0; }

  handle(type, mx, my, ev) {
    if (type === 'mousedown' && ev.button === 2) {
      const now = performance.now() / 1000;
      this.clicks.push(now);
      this.clicks = this.clicks.filter(t => now - t < 1.5);
      if (this.clicks.length >= 5 && !this.active) {
        this._trigger(); this.clicks = []; return true;
      }
    }
    return false;
  }

  _trigger() {
    this.active = true; this.timer = this.DURATION;
    this._saved = { pitch: this.eng.pitch, cutoff: this.eng.cutoff, echo: this.eng.echoMix, dist: this.eng.dist, speed: this.eng.speedMult };
    this.eng.pitch = 0.5 + Math.random() * 1.5;
    this.eng.cutoff = 0.05 + Math.random() * 0.45;
    this.eng.echoMix = 0.6 + Math.random() * 0.35;
    this.eng.dist = 0.3 + Math.random() * 0.6;
    this.eng.speedMult = 0.4 + Math.random() * 1.8;
    this.sparks = [];
    for (let i = 0; i < 80; i++) {
      this.sparks.push({ x: Math.random() * WIDTH, y: Math.random() * HEIGHT, vx: gauss(0, 200), vy: gauss(0, 200), hue: Math.random(), life: 1.5 + Math.random() });
    }
  }

  update(mx, my, dt) {
    if (!this.active) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.active = false;
      this.eng.pitch = this._saved.pitch ?? 1;
      this.eng.cutoff = this._saved.cutoff ?? 1;
      this.eng.echoMix = this._saved.echo ?? 0;
      this.eng.dist = this._saved.dist ?? 0;
      this.eng.speedMult = this._saved.speed ?? 1;
      return;
    }
    this.sparks = this.sparks.filter(s => {
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 100 * dt;
      s.life -= dt; s.hue = (s.hue + dt * 0.5) % 1;
      return s.life > 0;
    });
  }

  draw(c) {
    if (!this.active) return;
    // Flash
    c.save(); c.globalAlpha = Math.min(0.16, this.timer * 0.1);
    fillRect(c, 0, 0, WIDTH, HEIGHT, 'white'); c.restore();
    // Sparks
    for (const s of this.sparks) {
      const al = Math.min(1, s.life);
      fillCircle(c, s.x, s.y, Math.max(1, 4 * al), hsv(s.hue, 0.7, al));
    }
    const hue = (performance.now() / 500) % 1;
    drawText(c, 'C H A O S', WIDTH / 2 - 80, 40, hsv(hue, 0.8, 1), 28, true);
  }
}

// ═════════════════════════════════════════════════════════════
//  HIDDEN: SECRET "?"  (wobble mode)
// ═════════════════════════════════════════════════════════════

export class SecretWobble {
  constructor(engine) {
    this.eng = engine;
    this.active = false;
    this.x = WIDTH - 18; this.y = HEIGHT - 18;
    this.t = 0;
    this.discovered = false;
  }

  reset() { this.active = false; }

  handle(type, mx, my, ev) {
    if (type === 'mousedown' && ev.button === 0 && Math.abs(mx - this.x) < 14 && Math.abs(my - this.y) < 14) {
      this.active = !this.active;
      this.discovered = true;
      return true;
    }
    return false;
  }

  update(mx, my, dt) {
    if (!this.active) return;
    this.t += dt;
    this.eng.pitch += Math.sin(this.t * 1.7) * 0.004;
    this.eng.cutoff = Math.max(0.03, Math.min(1, this.eng.cutoff + Math.sin(this.t * 0.9) * 0.005));
    this.eng.pan += Math.sin(this.t * 1.3) * 0.01;
  }

  draw(c, mx, my) {
    const near = Math.abs(mx - this.x) < 30 && Math.abs(my - this.y) < 30;
    const col = this.active ? rgb(180, 100, 255) : near ? rgb(80, 80, 100) : rgb(20, 20, 28);
    drawText(c, '?', this.x - 5, this.y - 8, col, 16, true);
    if (this.active) drawText(c, '~wobble~', this.x - 65, this.y - 8, rgb(120, 80, 200), 11);
  }
}

// ═══════════════════════════════════════════════
//  Helper: seeded PRNG (for deterministic stars)
// ═══════════════════════════════════════════════

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
