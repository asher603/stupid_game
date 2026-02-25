"""
Audio Playground – Interactive Audio Effects Toy
================================================
Load an MP3/WAV file and interact with visual objects to
manipulate the sound in real-time.

Keys:  SPACE play/pause  |  R reset  |  ESC quit

Usage:  python audio_playground.py [audio_file]
Requires ffmpeg on PATH for MP3 decoding (used by pydub).
"""

import sys, os, math, random, colorsys, time

import numpy as np
import pygame
import sounddevice as sd
from pydub import AudioSegment
from scipy.signal import butter, sosfilt

# ── constants ────────────────────────────────────────────────
WIDTH, HEIGHT = 1280, 800
FPS = 60
BG = (12, 12, 22)
SR = 44100
BLOCK = 1024


# ═════════════════════════════════════════════════════════════
#  AUDIO ENGINE
# ═════════════════════════════════════════════════════════════

class AudioEngine:
    def __init__(self, path: str):
        seg = AudioSegment.from_file(path)
        seg = seg.set_frame_rate(SR).set_channels(2).set_sample_width(2)
        raw = np.array(seg.get_array_of_samples(), dtype=np.float32)
        self.data = raw.reshape(-1, 2) / 32768.0
        self.n = len(self.data)
        self.pos = 0.0
        self.playing = True

        # effect params (UI thread writes, audio thread reads)
        self.volume = 0.7
        self.pitch = 1.0
        self.cutoff = 1.0       # 0..1 (1 = wide open)
        self.echo_mix = 0.0     # 0..1
        self.dist = 0.0         # 0..1
        self.reverse = False
        self.pan = 0.0          # -1..+1
        self.speed_mult = 1.0

        # echo: two taps for richer delay
        self._d1_len = int(SR * 0.35)
        self._d2_len = int(SR * 0.65)
        # buffer must be much larger than the longest delay
        buf_len = self._d2_len * 3 + BLOCK
        self._echo_buf = np.zeros((buf_len, 2), np.float32)
        self._echo_blen = buf_len
        self._echo_wp = 0

        # filter state
        self._sos = None
        self._zi_l = self._zi_r = None
        self._last_norm = -1.0

        self.vis = np.zeros((BLOCK, 2), np.float32)
        self.filename = os.path.basename(path)
        self.duration = self.n / SR
        self._stream = None

    def start(self):
        self._stream = sd.OutputStream(
            samplerate=SR, channels=2, dtype="float32",
            blocksize=BLOCK, callback=self._cb, latency="low")
        self._stream.start()

    def stop(self):
        if self._stream:
            self._stream.stop()
            self._stream.close()

    # ── audio callback ──

    def _cb(self, out, frames, _ti, _st):
        if not self.playing:
            out[:] = 0
            return

        p   = float(np.clip(self.pitch, 0.25, 4.0))
        spd = float(np.clip(self.speed_mult, 0.25, 3.0))
        v   = float(self.volume)
        fc  = float(self.cutoff)
        em  = float(self.echo_mix)
        di  = float(self.dist)
        rev = bool(self.reverse)
        pan = float(np.clip(self.pan, -1, 1))

        rate = p * spd * (-1 if rev else 1)

        # pitch/speed via resampled read
        t = np.arange(frames, dtype=np.float64) * rate + self.pos
        t %= self.n
        i0 = t.astype(np.intp) % self.n
        i1 = (i0 + 1) % self.n
        frac = (t - np.floor(t)).astype(np.float32)[:, None]
        c = self.data[i0] * (1 - frac) + self.data[i1] * frac
        self.pos = float((self.pos + frames * rate) % self.n)

        # low-pass filter (4th order for steeper roll-off)
        if fc < 0.97:
            # exponential mapping: left side is much darker
            hz = max(40.0, 40.0 * (500.0 ** fc))   # 40 Hz .. 20 kHz
            norm = min(hz / (SR / 2), 0.99)
            if abs(norm - self._last_norm) > 0.002 or self._sos is None:
                self._sos = butter(4, norm, btype="low", output="sos")
                ns = self._sos.shape[0]
                if self._zi_l is None or self._zi_l.shape[0] != ns:
                    self._zi_l = np.zeros((ns, 2))
                    self._zi_r = np.zeros((ns, 2))
                self._last_norm = norm
            c0, self._zi_l = sosfilt(self._sos, c[:, 0], zi=self._zi_l)
            c1, self._zi_r = sosfilt(self._sos, c[:, 1], zi=self._zi_r)
            c = np.column_stack((c0.astype(np.float32),
                                 c1.astype(np.float32)))
        else:
            self._last_norm = -1.0
            self._zi_l = self._zi_r = None

        # distortion
        if di > 0.01:
            c = np.tanh(c * (1 + di * 25)).astype(np.float32)

        # echo (ALWAYS writes to buffer; mixes delayed taps when active)
        c = self._echo_process(c, em)

        # stereo pan
        if abs(pan) > 0.01:
            l_g = min(1.0, 1.0 - pan)
            r_g = min(1.0, 1.0 + pan)
            c[:, 0] *= l_g
            c[:, 1] *= r_g

        c *= v
        np.clip(c, -1.0, 1.0, out=c)
        out[:frames] = c
        self.vis = c.copy()

    def _echo_process(self, c, mix):
        """Read delayed taps FIRST, then write. This prevents the write
        from overwriting delayed data we still need to read."""
        n = len(c)
        bl = self._echo_blen
        wp = self._echo_wp

        # ── READ delayed taps BEFORE writing ──
        rp1 = (wp - self._d1_len) % bl
        rp2 = (wp - self._d2_len) % bl
        d1 = self._ring_read(rp1, n)
        d2 = self._ring_read(rp2, n)

        if mix > 0.005:
            # mix in echoes — louder mix for obvious effect
            wet = c + d1 * mix + d2 * (mix * 0.7)
            # write wet signal with feedback so echoes cascade
            self._ring_write(wp, wet * 0.55)
            c = wet
        else:
            # no echo active — still write dry signal so buffer stays filled
            self._ring_write(wp, c)

        self._echo_wp = (wp + n) % bl
        return c

    def _ring_write(self, wp, data):
        n = len(data)
        bl = self._echo_blen
        if wp + n <= bl:
            self._echo_buf[wp:wp + n] = data
        else:
            f = bl - wp
            self._echo_buf[wp:bl] = data[:f]
            self._echo_buf[:n - f] = data[f:]

    def _ring_read(self, start, n):
        bl = self._echo_blen
        start = start % bl
        if start + n <= bl:
            return self._echo_buf[start:start + n].copy()
        f = bl - start
        out = np.empty((n, 2), np.float32)
        out[:f] = self._echo_buf[start:bl]
        out[f:] = self._echo_buf[:n - f]
        return out

    @property
    def progress(self):
        return self.pos / self.n if self.n else 0


# ═════════════════════════════════════════════════════════════
#  FONT HELPER
# ═════════════════════════════════════════════════════════════

_fc: dict = {}

def font(size, bold=False):
    k = (size, bold)
    if k not in _fc:
        _fc[k] = pygame.font.SysFont("consolas", size, bold=bold)
    return _fc[k]


# ═════════════════════════════════════════════════════════════
#  1. ELASTIC STRING  (pitch)
# ═════════════════════════════════════════════════════════════

class ElasticString:
    NAME = "PITCH STRING"

    def __init__(self, x, y, length, engine):
        self.eng = engine
        self.x, self.y, self.length = x, y, length
        self.N = 32
        self.pts = [0.0] * self.N
        self.vels = [0.0] * self.N
        self.grab = -1
        self.hue = 0.0
        self.glow = 0.0
        self._sp = length / (self.N - 1)

    def reset(self):
        self.pts = [0.0] * self.N
        self.vels = [0.0] * self.N
        self.grab = -1
        self.eng.pitch = 1.0

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            for i in range(self.N):
                px = self.x + i * self._sp
                py = self.y + self.pts[i]
                if abs(mx - px) < 18 and abs(my - py) < 50:
                    self.grab = i
                    return True
        if ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
            self.grab = -1
        return False

    def update(self, mx, my, dt):
        if self.grab >= 0:
            self.pts[self.grab] = float(np.clip(my - self.y, -160, 160))
            self.vels[self.grab] = 0
        tension, damp = 0.35, 0.96
        nw = list(self.pts)
        for i in range(1, self.N - 1):
            if i == self.grab:
                continue
            force = tension * (self.pts[i-1] + self.pts[i+1] - 2*self.pts[i])
            self.vels[i] = (self.vels[i] + force) * damp
            nw[i] = self.pts[i] + self.vels[i]
        nw[0] *= 0.92
        nw[-1] *= 0.92
        self.pts = nw
        avg = sum(self.pts) / self.N
        self.glow = min(1.0, max(abs(p) for p in self.pts) / 80)
        target = 1.0 + avg / 200 * 0.7
        self.eng.pitch += (target - self.eng.pitch) * 0.12
        self.hue = (self.hue + dt * 0.08) % 1.0

    def draw(self, surf):
        sp = self._sp
        pts = [(int(self.x + i*sp), int(self.y + self.pts[i]))
               for i in range(self.N)]
        if self.glow > 0.04:
            gs = pygame.Surface((int(self.length + 40), 340), pygame.SRCALPHA)
            for w, a in ((14, 30), (8, 55), (4, 85)):
                rgb = [int(c * 255) for c in colorsys.hsv_to_rgb(self.hue, 0.6, 1)]
                rgba = (*rgb, int(self.glow * a))
                sh = [(p[0] - self.x + 20, p[1] - self.y + 170) for p in pts]
                if len(sh) > 1:
                    pygame.draw.lines(gs, rgba, False, sh, w)
            surf.blit(gs, (self.x - 20, self.y - 170))
        rgb = [int(c * 255) for c in colorsys.hsv_to_rgb(self.hue, 0.45, 1)]
        if len(pts) > 1:
            pygame.draw.lines(surf, rgb, False, pts, 3)
        for i in range(0, self.N, 4):
            pygame.draw.circle(surf, (210, 210, 255), pts[i], 5)
        f = font(14)
        surf.blit(f.render(self.NAME, True, (160, 160, 210)),
                  (self.x, self.y - 35))
        surf.blit(f.render(f"x{self.eng.pitch:.2f}", True, (200, 200, 255)),
                  (self.x + self.length - 50, self.y - 35))


# ═════════════════════════════════════════════════════════════
#  2. GRAVITY ORB  (filter cutoff)
# ═════════════════════════════════════════════════════════════

class GravityOrb:
    NAME = "FILTER ORB"

    def __init__(self, rect, engine):
        self.eng = engine
        self.r = pygame.Rect(rect)
        self.ox = float(self.r.right - 30)
        self.oy = float(self.r.centery)
        self.vx = self.vy = 0.0
        self.R = 22
        self.grabbed = False
        self.prev = (self.ox, self.oy)
        self.trail: list = []
        self.hue = 0.55

    def reset(self):
        self.ox = float(self.r.right - 30)
        self.oy = float(self.r.centery)
        self.vx = self.vy = 0.0
        self.grabbed = False
        self.trail.clear()
        self.eng.cutoff = 1.0

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if math.hypot(mx - self.ox, my - self.oy) < self.R + 14:
                self.grabbed = True
                self.prev = (self.ox, self.oy)
                return True
        if ev.type == pygame.MOUSEBUTTONUP and ev.button == 1 and self.grabbed:
            self.vx = (mx - self.prev[0]) * 3
            self.vy = (my - self.prev[1]) * 3
            self.grabbed = False
        return False

    def update(self, mx, my, dt):
        lx, hx = self.r.left + self.R, self.r.right - self.R
        ly, hy = self.r.top + self.R, self.r.bottom - self.R
        if self.grabbed:
            self.prev = (self.ox, self.oy)
            self.ox = float(max(lx, min(hx, mx)))
            self.oy = float(max(ly, min(hy, my)))
            self.vx = self.vy = 0
        else:
            self.vy += 300 * dt
            self.vx *= 0.998
            self.vy *= 0.998
            self.ox += self.vx * dt
            self.oy += self.vy * dt
            if self.ox < lx: self.ox = lx; self.vx = abs(self.vx) * 0.8
            if self.ox > hx: self.ox = hx; self.vx = -abs(self.vx) * 0.8
            if self.oy < ly: self.oy = ly; self.vy = abs(self.vy) * 0.8
            if self.oy > hy: self.oy = hy; self.vy = -abs(self.vy) * 0.8
        self.trail.append((self.ox, self.oy))
        if len(self.trail) > 50:
            self.trail.pop(0)
        nx = float(np.clip((self.ox - self.r.left) / self.r.width, 0, 1))
        # exponential: left side cuts HARD, right side opens fully
        self.eng.cutoff = nx * nx   # 0..1 but quadratic = more extreme at low end
        self.hue = (0.55 + nx * 0.3) % 1.0

    def draw(self, surf):
        pygame.draw.rect(surf, (28, 28, 45), self.r, 1, border_radius=8)
        for i, (tx, ty) in enumerate(self.trail):
            a = i / max(1, len(self.trail))
            rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(self.hue, 0.5, a)]
            pygame.draw.circle(surf, rgb, (int(tx), int(ty)), int(3 + a * 7))
        for gr in (36, 28):
            rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(self.hue, 0.4, 0.28)]
            pygame.draw.circle(surf, rgb, (int(self.ox), int(self.oy)), gr)
        rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(self.hue, 0.65, 1)]
        pygame.draw.circle(surf, rgb, (int(self.ox), int(self.oy)), self.R)
        pygame.draw.circle(surf, (255, 255, 255),
                           (int(self.ox - 5), int(self.oy - 5)), 5)
        f = font(14)
        surf.blit(f.render(self.NAME, True, (100, 180, 210)),
                  (self.r.x, self.r.y - 20))
        hz_est = max(40, int(40 * (500 ** self.eng.cutoff)))
        hz_lbl = f"{hz_est} Hz" if hz_est < 1000 else f"{hz_est/1000:.1f} kHz"
        surf.blit(f.render(f"Filter: {hz_lbl}", True, (160, 160, 200)),
                  (self.r.right - 130, self.r.y - 20))


# ═════════════════════════════════════════════════════════════
#  3. RIPPLE POND  (echo)
# ═════════════════════════════════════════════════════════════

class RipplePond:
    NAME = "ECHO POND"

    def __init__(self, cx, cy, radius, engine):
        self.eng = engine
        self.cx, self.cy, self.rad = cx, cy, radius
        self.ripples: list = []

    def reset(self):
        self.ripples.clear()
        self.eng.echo_mix = 0.0

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if math.hypot(mx - self.cx, my - self.cy) < self.rad:
                self.ripples.append(dict(
                    x=mx, y=my, r=0.0,
                    mx=120 + random.random() * 100,
                    hue=random.random()))
                return True
        return False

    def update(self, mx, my, dt):
        alive = []
        for rp in self.ripples:
            rp['r'] += 35 * dt
            if rp['r'] < rp['mx']:
                alive.append(rp)
        self.ripples = alive
        target = min(0.95, len(self.ripples) * 0.40)
        self.eng.echo_mix += (target - self.eng.echo_mix) * 0.3

    def draw(self, surf):
        bg = pygame.Surface((self.rad * 2, self.rad * 2), pygame.SRCALPHA)
        pygame.draw.circle(bg, (18, 28, 55, 140),
                           (self.rad, self.rad), self.rad)
        surf.blit(bg, (self.cx - self.rad, self.cy - self.rad))
        pygame.draw.circle(surf, (35, 55, 95),
                           (self.cx, self.cy), self.rad, 2)
        for rp in self.ripples:
            a = 1 - rp['r'] / rp['mx']
            rgb = [int(v * 255) for v in
                   colorsys.hsv_to_rgb(rp['hue'], 0.35, 0.85)]
            w = max(1, int(3 * a))
            pygame.draw.circle(surf, rgb,
                               (int(rp['x']), int(rp['y'])),
                               int(rp['r']), w)
        f = font(14)
        surf.blit(f.render(self.NAME, True, (100, 150, 210)),
                  (self.cx - 45, self.cy - self.rad - 22))
        surf.blit(f.render(f"Echo {self.eng.echo_mix:.0%}", True, (150, 150, 200)),
                  (self.cx - 45, self.cy + self.rad + 6))


# ═════════════════════════════════════════════════════════════
#  4. PARTICLE CLOUD  (distortion)
# ═════════════════════════════════════════════════════════════

class ParticleCloud:
    NAME = "DISTORTION CLOUD"

    def __init__(self, cx, cy, engine):
        self.eng = engine
        self.cx, self.cy = cx, cy
        self.tx, self.ty = float(cx), float(cy)
        self.NP = 70
        self.ps = [
            dict(x=cx + random.gauss(0, 25), y=cy + random.gauss(0, 25),
                 vx=0.0, vy=0.0, hue=random.random(),
                 sz=2.5 + random.random() * 3.5)
            for _ in range(self.NP)
        ]
        self.active = False
        self.spread = 25.0
        self.bounds = pygame.Rect(cx - 130, cy - 130, 260, 260)

    def reset(self):
        self.active = False
        self.tx, self.ty = float(self.cx), float(self.cy)
        self.spread = 25.0
        self.eng.dist = 0.0

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if self.bounds.collidepoint(mx, my):
                self.active = True
                return True
        if ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
            self.active = False
        return False

    def update(self, mx, my, dt):
        if self.active:
            self.tx, self.ty = float(mx), float(my)
            self.spread = 25 + math.hypot(mx - self.cx, my - self.cy) * 0.9
        else:
            self.tx += (self.cx - self.tx) * 0.03
            self.ty += (self.cy - self.ty) * 0.03
            self.spread += (25 - self.spread) * 0.04
        for p in self.ps:
            dx, dy = self.tx - p['x'], self.ty - p['y']
            p['vx'] += dx * 0.025 + random.gauss(0, self.spread * 0.25)
            p['vy'] += dy * 0.025 + random.gauss(0, self.spread * 0.25)
            p['vx'] *= 0.88
            p['vy'] *= 0.88
            p['x'] += p['vx'] * dt
            p['y'] += p['vy'] * dt
            p['hue'] = (p['hue'] + dt * 0.12) % 1.0
        self.eng.dist = min(1.0, max(0, (self.spread - 25) / 110))

    def draw(self, surf):
        pygame.draw.rect(surf, (28, 22, 30), self.bounds, 1, border_radius=6)
        for p in self.ps:
            rgb = [int(v * 255) for v in
                   colorsys.hsv_to_rgb(p['hue'], 0.75, 0.92)]
            pygame.draw.circle(surf, rgb,
                               (int(p['x']), int(p['y'])), int(p['sz']))
        f = font(14)
        surf.blit(f.render(self.NAME, True, (200, 150, 180)),
                  (self.bounds.x, self.bounds.y - 20))
        surf.blit(f.render(f"Dist {self.eng.dist:.0%}", True, (200, 150, 200)),
                  (self.bounds.right - 85, self.bounds.y - 20))


# ═════════════════════════════════════════════════════════════
#  5. VOLUME THREAD
# ═════════════════════════════════════════════════════════════

class VolumeThread:
    NAME = "VOLUME"

    def __init__(self, x, y, length, engine):
        self.eng = engine
        self.x, self.y0, self.length = x, y, length
        self.pull = 0.7
        self.hy = y + length * self.pull
        self.grabbed = False

    def reset(self):
        self.pull = 0.7
        self.hy = self.y0 + self.length * self.pull
        self.grabbed = False
        self.eng.volume = 0.7

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if abs(mx - self.x) < 22 and abs(my - self.hy) < 22:
                self.grabbed = True
                return True
        if ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
            self.grabbed = False
        return False

    def update(self, mx, my, dt):
        if self.grabbed:
            self.hy = float(np.clip(my, self.y0, self.y0 + self.length))
            self.pull = (self.hy - self.y0) / self.length
        self.eng.volume = self.pull

    def draw(self, surf):
        x, y0, ln = self.x, self.y0, self.length
        pygame.draw.line(surf, (50, 50, 65), (x, y0), (x, y0 + ln), 2)
        if self.pull > 0:
            h = (0.3 - self.pull * 0.3) % 1.0
            rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(h, 0.65, 0.9)]
            pygame.draw.line(surf, rgb, (x, y0), (x, int(self.hy)), 4)
        pygame.draw.circle(surf, (225, 225, 245), (x, int(self.hy)), 13)
        pygame.draw.circle(surf, (180, 180, 200), (x, int(self.hy)), 13, 2)
        f = font(14)
        surf.blit(f.render(self.NAME, True, (150, 200, 150)),
                  (x - 32, y0 - 28))
        surf.blit(f.render(f"{self.pull:.0%}", True, (200, 200, 200)),
                  (x - 18, y0 + ln + 12))


# ═════════════════════════════════════════════════════════════
#  6. REVERSE VORTEX
# ═════════════════════════════════════════════════════════════

class ReverseVortex:
    NAME = "REVERSE VORTEX"

    def __init__(self, cx, cy, engine):
        self.eng = engine
        self.cx, self.cy = cx, cy
        self.R = 55
        self.active = False
        self.angle = 0.0
        self.particles = [
            dict(a=random.random() * math.tau,
                 r=10 + random.random() * 40,
                 s=0.5 + random.random() * 1.5,
                 hue=random.random(),
                 base_r=10 + random.random() * 40)
            for _ in range(40)
        ]

    def reset(self):
        self.active = False
        self.eng.reverse = False

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if math.hypot(mx - self.cx, my - self.cy) < self.R:
                self.active = True
                return True
        if ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
            self.active = False
        return False

    def update(self, mx, my, dt):
        spin = 5.0 if self.active else 0.6
        self.angle += spin * dt
        for p in self.particles:
            p['a'] += p['s'] * dt * (-spin if self.active else spin * 0.3)
            if self.active:
                p['r'] = max(3, p['r'] - 40 * dt)
            else:
                p['r'] += (p['base_r'] - p['r']) * 0.03
            p['hue'] = (p['hue'] + dt * 0.15) % 1.0
        self.eng.reverse = self.active

    def draw(self, surf):
        if self.active:
            gs = pygame.Surface((self.R * 4, self.R * 4), pygame.SRCALPHA)
            pygame.draw.circle(gs, (80, 30, 120, 50),
                               (self.R * 2, self.R * 2), self.R * 2)
            pygame.draw.circle(gs, (120, 40, 160, 35),
                               (self.R * 2, self.R * 2), self.R)
            surf.blit(gs, (self.cx - self.R * 2, self.cy - self.R * 2))
        for arm in range(3):
            base = self.angle + arm * math.tau / 3
            pts = []
            for j in range(20):
                t = j / 20
                r = 5 + t * self.R
                a = base + t * 3.5
                pts.append((int(self.cx + math.cos(a) * r),
                            int(self.cy + math.sin(a) * r)))
            col = (140, 60, 200) if self.active else (45, 25, 65)
            if len(pts) > 1:
                pygame.draw.lines(surf, col, False, pts, 2)
        for p in self.particles:
            px = self.cx + math.cos(p['a']) * p['r']
            py = self.cy + math.sin(p['a']) * p['r']
            v = 0.9 if self.active else 0.45
            rgb = [int(x * 255) for x in colorsys.hsv_to_rgb(p['hue'], 0.6, v)]
            pygame.draw.circle(surf, rgb, (int(px), int(py)), 3)
        ec = (200, 100, 255) if self.active else (55, 35, 75)
        pygame.draw.circle(surf, ec, (self.cx, self.cy), 8)
        pygame.draw.circle(surf, (30, 15, 45), (self.cx, self.cy), self.R, 2)
        f = font(14)
        lbl = "<<< REVERSE" if self.active else self.NAME
        col = (200, 120, 255) if self.active else (110, 70, 150)
        surf.blit(f.render(lbl, True, col), (self.cx - 55, self.cy - self.R - 22))


# ═════════════════════════════════════════════════════════════
#  7. STEREO PENDULUM  (pan)
# ═════════════════════════════════════════════════════════════

class StereoPendulum:
    NAME = "STEREO SWING"

    def __init__(self, cx, cy, engine):
        self.eng = engine
        self.cx, self.cy = cx, cy
        self.arm_len = 90
        self.angle = 0.4
        self.vel = 0.0
        self.amp = 0.6
        self.grabbed = False
        self.bob_r = 14

    def reset(self):
        self.angle = 0.0
        self.vel = 0.0
        self.amp = 0.5
        self.grabbed = False
        self.eng.pan = 0.0

    def _bob(self):
        bx = self.cx + math.sin(self.angle) * self.arm_len
        by = self.cy + math.cos(self.angle) * self.arm_len
        return bx, by

    def handle(self, ev, mx, my):
        bx, by = self._bob()
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if math.hypot(mx - bx, my - by) < self.bob_r + 14:
                self.grabbed = True
                return True
        if ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
            self.grabbed = False
        return False

    def update(self, mx, my, dt):
        if self.grabbed:
            dx = mx - self.cx
            self.angle = math.atan2(dx, self.arm_len)
            self.angle = max(-1.2, min(1.2, self.angle))
            self.vel = 0
            self.amp = min(1.0, abs(self.angle) / 0.7)
        else:
            gravity = -9.8 * math.sin(self.angle) / (self.arm_len * 0.012)
            self.vel += gravity * dt
            self.vel *= 0.998
            self.angle += self.vel * dt
            if abs(self.angle) < 0.01 and abs(self.vel) < 0.3:
                self.vel += random.choice([-1, 1]) * self.amp * 1.5
        self.eng.pan = math.sin(self.angle) * self.amp

    def draw(self, surf):
        bx, by = self._bob()
        pygame.draw.circle(surf, (80, 80, 100), (self.cx, self.cy), 5)
        pygame.draw.line(surf, (70, 70, 90),
                         (self.cx, self.cy), (int(bx), int(by)), 2)
        bar_y = self.cy - 20
        bar_w = 120
        pygame.draw.line(surf, (40, 40, 55),
                         (self.cx - bar_w // 2, bar_y),
                         (self.cx + bar_w // 2, bar_y), 1)
        f12 = font(12)
        surf.blit(f12.render("L", True, (100, 100, 180)),
                  (self.cx - bar_w // 2 - 12, bar_y - 6))
        surf.blit(f12.render("R", True, (180, 100, 100)),
                  (self.cx + bar_w // 2 + 4, bar_y - 6))
        pan_x = self.cx + int(self.eng.pan * bar_w // 2)
        col = (100, 150, 255) if self.eng.pan < 0 else (255, 150, 100)
        pygame.draw.circle(surf, col, (pan_x, bar_y), 6)
        hue = (0.6 + self.eng.pan * 0.15) % 1
        rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(hue, 0.6, 0.9)]
        if abs(self.vel) > 0.8:
            gs = pygame.Surface((60, 60), pygame.SRCALPHA)
            pygame.draw.circle(gs, (*rgb, min(120, int(abs(self.vel) * 18))),
                               (30, 30), 25)
            surf.blit(gs, (int(bx) - 30, int(by) - 30))
        pygame.draw.circle(surf, rgb, (int(bx), int(by)), self.bob_r)
        f = font(14)
        surf.blit(f.render(self.NAME, True, (140, 140, 200)),
                  (self.cx - 50, self.cy - 40))


# ═════════════════════════════════════════════════════════════
#  8. TIME SPIRAL  (speed)
# ═════════════════════════════════════════════════════════════

class TimeSpiral:
    NAME = "TIME WARP"

    def __init__(self, cx, cy, engine):
        self.eng = engine
        self.cx, self.cy = cx, cy
        self.R = 50
        self.speed = 1.0
        self.angle = 0.0
        self.grabbed = False
        self._start_angle = 0.0
        self._start_speed = 1.0

    def reset(self):
        self.speed = 1.0
        self.grabbed = False
        self.eng.speed_mult = 1.0

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if math.hypot(mx - self.cx, my - self.cy) < self.R + 10:
                self.grabbed = True
                self._start_angle = math.atan2(my - self.cy, mx - self.cx)
                self._start_speed = self.speed
                return True
        if ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
            self.grabbed = False
        if ev.type == pygame.MOUSEWHEEL:
            if math.hypot(mx - self.cx, my - self.cy) < self.R + 30:
                self.speed = max(0.25, min(3.0, self.speed + ev.y * 0.1))
                return True
        return False

    def update(self, mx, my, dt):
        if self.grabbed:
            cur = math.atan2(my - self.cy, mx - self.cx)
            delta = cur - self._start_angle
            if delta > math.pi:
                delta -= math.tau
            if delta < -math.pi:
                delta += math.tau
            self.speed = max(0.25, min(3.0, self._start_speed + delta * 0.5))
        self.angle += dt * self.speed * 2
        self.eng.speed_mult = self.speed

    def draw(self, surf):
        for i in range(5):
            r = 12 + i * 9
            a = self.angle * (1 + i * 0.3)
            col_v = 0.25 + i * 0.12
            rgb = [int(v * 255) for v in
                   colorsys.hsv_to_rgb(0.55 + self.speed * 0.1, 0.4, col_v)]
            for seg in range(3):
                sa = a + seg * math.tau / 3
                pts = []
                for j in range(8):
                    t = sa + j * 0.25
                    pts.append((int(self.cx + math.cos(t) * r),
                                int(self.cy + math.sin(t) * r)))
                if len(pts) > 1:
                    pygame.draw.lines(surf, rgb, False, pts, 2)
        txt = font(18, True).render(f"{self.speed:.1f}x", True, (200, 200, 240))
        surf.blit(txt, (self.cx - txt.get_width() // 2,
                        self.cy - txt.get_height() // 2))
        hue = (0.5 + (self.speed - 1) * 0.2) % 1
        rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(hue, 0.5, 0.7)]
        pygame.draw.circle(surf, rgb, (self.cx, self.cy), self.R, 2)
        f = font(14)
        surf.blit(f.render(self.NAME, True, (140, 160, 200)),
                  (self.cx - 38, self.cy - self.R - 22))
        surf.blit(f.render("scroll / drag", True, (80, 80, 110)),
                  (self.cx - 48, self.cy + self.R + 6))


# ═════════════════════════════════════════════════════════════
#  HIDDEN: CHAOS BURST  (right-click 5 times rapidly)
# ═════════════════════════════════════════════════════════════

class ChaosBurst:
    def __init__(self, engine):
        self.eng = engine
        self.clicks: list = []
        self.active = False
        self.timer = 0.0
        self.DURATION = 3.0
        self.sparks: list = []
        self._saved: dict = {}

    def reset(self):
        self.active = False
        self.timer = 0

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 3:
            now = time.time()
            self.clicks.append(now)
            self.clicks = [t for t in self.clicks if now - t < 1.5]
            if len(self.clicks) >= 5 and not self.active:
                self._trigger()
                self.clicks.clear()
                return True
        return False

    def _trigger(self):
        self.active = True
        self.timer = self.DURATION
        self._saved = dict(pitch=self.eng.pitch, cutoff=self.eng.cutoff,
                           echo=self.eng.echo_mix, dist=self.eng.dist,
                           speed=self.eng.speed_mult)
        self.eng.pitch = random.uniform(0.5, 2.0)
        self.eng.cutoff = random.uniform(0.05, 0.5)
        self.eng.echo_mix = random.uniform(0.6, 0.95)
        self.eng.dist = random.uniform(0.3, 0.9)
        self.eng.speed_mult = random.uniform(0.4, 2.2)
        self.sparks = [
            dict(x=random.randint(0, WIDTH), y=random.randint(0, HEIGHT),
                 vx=random.gauss(0, 200), vy=random.gauss(0, 200),
                 hue=random.random(), life=1.5 + random.random())
            for _ in range(80)
        ]

    def update(self, mx, my, dt):
        if not self.active:
            return
        self.timer -= dt
        if self.timer <= 0:
            self.active = False
            self.eng.pitch = self._saved.get('pitch', 1.0)
            self.eng.cutoff = self._saved.get('cutoff', 1.0)
            self.eng.echo_mix = self._saved.get('echo', 0.0)
            self.eng.dist = self._saved.get('dist', 0.0)
            self.eng.speed_mult = self._saved.get('speed', 1.0)
            return
        alive = []
        for s in self.sparks:
            s['x'] += s['vx'] * dt
            s['y'] += s['vy'] * dt
            s['vy'] += 100 * dt
            s['life'] -= dt
            s['hue'] = (s['hue'] + dt * 0.5) % 1.0
            if s['life'] > 0:
                alive.append(s)
        self.sparks = alive

    def draw(self, surf):
        if not self.active:
            return
        flash = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        a = int(min(40, self.timer * 25))
        flash.fill((255, 255, 255, a))
        surf.blit(flash, (0, 0))
        for s in self.sparks:
            al = min(1.0, s['life'])
            rgb = [int(v * 255) for v in
                   colorsys.hsv_to_rgb(s['hue'], 0.7, al)]
            sz = max(1, int(4 * al))
            pygame.draw.circle(surf, rgb, (int(s['x']), int(s['y'])), sz)
        hue = (time.time() * 2) % 1
        rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(hue, 0.8, 1)]
        txt = font(28, True).render("C H A O S", True, rgb)
        surf.blit(txt, (WIDTH // 2 - txt.get_width() // 2, 40))


# ═════════════════════════════════════════════════════════════
#  HIDDEN: SECRET "?"  (wobble mode)
# ═════════════════════════════════════════════════════════════

class SecretWobble:
    def __init__(self, engine):
        self.eng = engine
        self.active = False
        self.x, self.y = WIDTH - 18, HEIGHT - 18
        self.t = 0.0
        self.discovered = False

    def reset(self):
        self.active = False

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if abs(mx - self.x) < 14 and abs(my - self.y) < 14:
                self.active = not self.active
                self.discovered = True
                return True
        return False

    def update(self, mx, my, dt):
        if not self.active:
            return
        self.t += dt
        self.eng.pitch += math.sin(self.t * 1.7) * 0.004
        self.eng.cutoff = max(0.03, min(1.0,
                              self.eng.cutoff + math.sin(self.t * 0.9) * 0.005))
        self.eng.pan += math.sin(self.t * 1.3) * 0.01

    def draw(self, surf):
        mx, my = pygame.mouse.get_pos()
        near = abs(mx - self.x) < 30 and abs(my - self.y) < 30
        if self.active:
            c = (180, 100, 255)
        elif near:
            c = (80, 80, 100)
        else:
            c = (20, 20, 28)
        f = font(16, True)
        surf.blit(f.render("?", True, c), (self.x - 5, self.y - 8))
        if self.active:
            f2 = font(11)
            surf.blit(f2.render("~wobble~", True, (120, 80, 200)),
                      (self.x - 65, self.y - 8))


# ═════════════════════════════════════════════════════════════
#  9. SPATIAL AUDIO ROOM
# ═════════════════════════════════════════════════════════════

class SpatialRoom:
    """2D room with a speaker in the center. Drag the listener
    around to control pan (X-axis) and volume/muffling (distance)."""

    def __init__(self, x, y, size, engine):
        self.eng = engine
        self.r = pygame.Rect(x, y, size, size)
        self.cx = x + size // 2
        self.cy = y + size // 2
        self.size = size
        # listener position (starts bottom-center)
        self.lx = float(self.cx)
        self.ly = float(self.cy + size * 0.35)
        self.grabbed = False
        self.trail: list = []  # recent positions for trail effect
        self.pulse = 0.0       # speaker pulse animation

    def reset(self):
        self.lx = float(self.cx)
        self.ly = float(self.cy + self.size * 0.35)
        self.grabbed = False
        self.eng.pan = 0.0
        self.trail.clear()

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if math.hypot(mx - self.lx, my - self.ly) < 18:
                self.grabbed = True
                return True
        if ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
            self.grabbed = False
        return False

    def update(self, mx, my, dt):
        if self.grabbed:
            # clamp to room bounds with small margin
            margin = 10
            self.lx = float(np.clip(mx, self.r.left + margin, self.r.right - margin))
            self.ly = float(np.clip(my, self.r.top + margin, self.r.bottom - margin))

        # trail
        self.trail.append((self.lx, self.ly))
        if len(self.trail) > 30:
            self.trail.pop(0)

        # speaker pulse
        self.pulse = (self.pulse + dt * 3.5) % (2 * math.pi)

        # compute relative position of listener to speaker
        half = self.size / 2.0
        # dx: -1 (left) to +1 (right)
        dx = (self.lx - self.cx) / half
        # dy: -1 (near/above speaker) to +1 (far below)
        dy = (self.ly - self.cy) / half
        # distance 0..1
        dist = min(1.0, math.sqrt(dx * dx + dy * dy))

        # PAN  ─  X axis maps directly to stereo pan
        self.eng.pan = float(np.clip(dx * 1.3, -1.0, 1.0))

        # DISTANCE  ─  farther away = lower cutoff (muffled) + slight volume drop
        # close = bright and full, far = dull and quieter
        proximity = 1.0 - dist  # 1 = on speaker, 0 = edge
        # nudge cutoff (don't fully override other widgets)
        room_cutoff = 0.15 + proximity * 0.85   # 0.15 .. 1.0
        self.eng.cutoff = min(self.eng.cutoff, room_cutoff)

        # slight volume attenuation at distance
        room_vol_factor = 0.55 + proximity * 0.45   # 0.55 .. 1.0
        self.eng.volume = min(self.eng.volume, room_vol_factor)

    def draw(self, surf):
        r = self.r
        # room background
        room_surf = pygame.Surface((r.width, r.height), pygame.SRCALPHA)
        room_surf.fill((12, 12, 28, 200))
        surf.blit(room_surf, (r.x, r.y))
        pygame.draw.rect(surf, (50, 50, 80), r, 2, border_radius=4)

        # grid lines for depth feel
        for i in range(1, 4):
            frac = i / 4.0
            gx = r.x + int(frac * r.width)
            gy = r.y + int(frac * r.height)
            pygame.draw.line(surf, (25, 25, 45), (gx, r.y), (gx, r.bottom), 1)
            pygame.draw.line(surf, (25, 25, 45), (r.x, gy), (r.right, gy), 1)

        # distance rings from speaker
        for ring_r in (30, 65, 100):
            pygame.draw.circle(surf, (30, 30, 55),
                               (self.cx, self.cy), ring_r, 1)

        # trail
        if len(self.trail) > 2:
            for i in range(1, len(self.trail)):
                alpha = int(40 * i / len(self.trail))
                col = (60, 200, 140, alpha)
                ts = pygame.Surface((4, 4), pygame.SRCALPHA)
                pygame.draw.circle(ts, col, (2, 2), 2)
                surf.blit(ts, (int(self.trail[i][0]) - 2,
                               int(self.trail[i][1]) - 2))

        # speaker icon  (pulsing circles)
        pulse_r = int(12 + math.sin(self.pulse) * 4)
        pygame.draw.circle(surf, (200, 80, 80), (self.cx, self.cy), pulse_r)
        pygame.draw.circle(surf, (255, 120, 100), (self.cx, self.cy),
                           pulse_r - 3)
        # sound waves emanating
        for i in range(3):
            wave_r = pulse_r + 8 + i * 12
            wave_alpha = max(0, 120 - i * 40 - int(math.sin(self.pulse + i) * 30))
            ws = pygame.Surface((wave_r * 2 + 2, wave_r * 2 + 2), pygame.SRCALPHA)
            pygame.draw.circle(ws, (255, 100, 80, wave_alpha),
                               (wave_r + 1, wave_r + 1), wave_r, 2)
            surf.blit(ws, (self.cx - wave_r - 1, self.cy - wave_r - 1))

        # listener character (little person icon)
        lx, ly = int(self.lx), int(self.ly)
        # head
        head_col = (80, 220, 160) if self.grabbed else (60, 180, 130)
        pygame.draw.circle(surf, head_col, (lx, ly - 8), 7)
        # body
        pygame.draw.line(surf, head_col, (lx, ly - 1), (lx, ly + 10), 2)
        # arms
        pygame.draw.line(surf, head_col, (lx - 6, ly + 3), (lx + 6, ly + 3), 2)
        # legs
        pygame.draw.line(surf, head_col, (lx, ly + 10), (lx - 5, ly + 18), 2)
        pygame.draw.line(surf, head_col, (lx, ly + 10), (lx + 5, ly + 18), 2)
        # ear indicators (L/R)
        ear_l_col = (100, 100, 255) if self.eng.pan < -0.1 else (60, 60, 90)
        ear_r_col = (255, 100, 100) if self.eng.pan > 0.1 else (60, 60, 90)
        pygame.draw.circle(surf, ear_l_col, (lx - 9, ly - 8), 3)
        pygame.draw.circle(surf, ear_r_col, (lx + 9, ly - 8), 3)

        # label
        f = font(13, True)
        surf.blit(f.render("SPATIAL ROOM", True, (140, 140, 200)),
                  (r.x + 4, r.y - 18))
        # info
        dist_val = min(1.0, math.hypot(self.lx - self.cx, self.ly - self.cy)
                       / (self.size / 2))
        f12 = font(11)
        surf.blit(f12.render(f"Pan {self.eng.pan:+.2f}  Dist {dist_val:.0%}",
                             True, (100, 100, 140)),
                  (r.x + 4, r.bottom + 4))


# ═════════════════════════════════════════════════════════════
#  10. SPACE SHOOTER MINI-GAME
# ═════════════════════════════════════════════════════════════

class SpaceShooter:
    """A mini pixel space-shooter.  Performance affects the music:
    - combo streak   → pitch rises slightly
    - taking damage  → distortion spike
    - enemy killed   → echo splash
    - score level    → filter opens/closes
    """
    BTN_RECT = pygame.Rect(0, 0, 0, 0)  # set in __init__

    def __init__(self, btn_x, btn_y, engine):
        self.eng = engine
        self.BTN_RECT = pygame.Rect(btn_x, btn_y, 110, 32)
        self.open = False
        # game viewport  (centered pop-up)
        self.GW, self.GH = 400, 340
        self.gx = (WIDTH - self.GW) // 2
        self.gy = (HEIGHT - self.GH) // 2
        self.viewport = pygame.Rect(self.gx, self.gy, self.GW, self.GH)
        self._reset_game()

    def _reset_game(self):
        self.px = self.GW // 2
        self.py = self.GH - 30
        self.bullets: list = []
        self.enemies: list = []
        self.particles: list = []
        self.score = 0
        self.combo = 0
        self.hp = 5
        self.spawn_cd = 0.0
        self.shoot_cd = 0.0
        self.hit_flash = 0.0
        self.game_over = False
        self._keys_held = set()

    def reset(self):
        self.open = False
        self._reset_game()

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if self.BTN_RECT.collidepoint(mx, my):
                self.open = not self.open
                if self.open:
                    self._reset_game()
                return True
            if self.open and not self.viewport.collidepoint(mx, my):
                self.open = False
                return True

        if not self.open:
            return False

        # keyboard for the mini-game
        if ev.type == pygame.KEYDOWN:
            if ev.key in (pygame.K_LEFT, pygame.K_a):
                self._keys_held.add('left')
                return True
            if ev.key in (pygame.K_RIGHT, pygame.K_d):
                self._keys_held.add('right')
                return True
            if ev.key in (pygame.K_UP, pygame.K_w):
                self._keys_held.add('shoot')
                return True
        if ev.type == pygame.KEYUP:
            if ev.key in (pygame.K_LEFT, pygame.K_a):
                self._keys_held.discard('left')
            if ev.key in (pygame.K_RIGHT, pygame.K_d):
                self._keys_held.discard('right')
            if ev.key in (pygame.K_UP, pygame.K_w):
                self._keys_held.discard('shoot')
            # restart on game-over
            if ev.key == pygame.K_RETURN and self.game_over:
                self._reset_game()
                return True
        return False

    def update(self, mx, my, dt):
        if not self.open or self.game_over:
            # slowly reset audio influence
            return

        # ── player movement ──
        spd = 220
        if 'left' in self._keys_held:
            self.px = max(10, self.px - int(spd * dt))
        if 'right' in self._keys_held:
            self.px = min(self.GW - 10, self.px + int(spd * dt))

        # ── shooting ──
        self.shoot_cd -= dt
        if 'shoot' in self._keys_held and self.shoot_cd <= 0:
            self.bullets.append(dict(x=self.px, y=self.py - 8, vy=-350))
            self.shoot_cd = 0.15

        # ── move bullets ──
        alive_b = []
        for b in self.bullets:
            b['y'] += b['vy'] * dt
            if b['y'] > 0:
                alive_b.append(b)
        self.bullets = alive_b

        # ── spawn enemies ──
        self.spawn_cd -= dt
        if self.spawn_cd <= 0:
            etype = random.choice(['normal', 'normal', 'fast', 'big'])
            w = 20 if etype != 'big' else 30
            ex = random.randint(w, self.GW - w)
            sp = {'normal': 80, 'fast': 160, 'big': 50}[etype]
            ehp = 1 if etype != 'big' else 3
            self.enemies.append(dict(
                x=ex, y=-10, vy=sp, w=w, h=14,
                hp=ehp, type=etype, hue=random.random()))
            # faster spawns as score rises
            base = max(0.3, 1.2 - self.score * 0.015)
            self.spawn_cd = base + random.random() * 0.4

        # ── move enemies ──
        alive_e = []
        for e in self.enemies:
            e['y'] += e['vy'] * dt
            e['hue'] = (e['hue'] + dt * 0.3) % 1.0
            if e['y'] > self.GH + 20:
                # passed through! damage + reset combo
                self.hp -= 1
                self.combo = 0
                self.hit_flash = 0.3
                self._on_damage()
                if self.hp <= 0:
                    self.game_over = True
            else:
                alive_e.append(e)
        self.enemies = alive_e

        # ── collision: bullets vs enemies ──
        new_bullets = []
        for b in self.bullets:
            hit = False
            for e in self.enemies:
                if (abs(b['x'] - e['x']) < e['w'] and
                        abs(b['y'] - e['y']) < e['h'] + 4):
                    e['hp'] -= 1
                    hit = True
                    # spark particles
                    for _ in range(6):
                        self.particles.append(dict(
                            x=b['x'], y=b['y'],
                            vx=random.gauss(0, 80), vy=random.gauss(-40, 60),
                            life=0.4 + random.random() * 0.3,
                            hue=e['hue']))
                    break
            if not hit:
                new_bullets.append(b)
        self.bullets = new_bullets

        # remove dead enemies
        still_alive = []
        for e in self.enemies:
            if e['hp'] <= 0:
                self.score += 1
                self.combo += 1
                self._on_kill()
                # explosion
                for _ in range(12):
                    self.particles.append(dict(
                        x=e['x'], y=e['y'],
                        vx=random.gauss(0, 120), vy=random.gauss(0, 120),
                        life=0.5 + random.random() * 0.4,
                        hue=e['hue']))
            else:
                still_alive.append(e)
        self.enemies = still_alive

        # ── particles ──
        ap = []
        for p in self.particles:
            p['x'] += p['vx'] * dt
            p['y'] += p['vy'] * dt
            p['life'] -= dt
            if p['life'] > 0:
                ap.append(p)
        self.particles = ap

        # ── hit flash decay ──
        self.hit_flash = max(0, self.hit_flash - dt)

        # ── audio influence ──
        # combo → slight pitch rise
        target_pitch_mod = 1.0 + min(self.combo, 20) * 0.015
        self.eng.pitch += (target_pitch_mod - self.eng.pitch) * 0.05
        # score level → filter opens
        level_frac = min(1.0, self.score / 40)
        # don't override orb if shooter is subtle
        # we nudge cutoff toward open as score rises
        self.eng.cutoff = max(self.eng.cutoff, level_frac * 0.8)

    def _on_kill(self):
        """Enemy killed → echo splash."""
        self.eng.echo_mix = min(1.0, self.eng.echo_mix + 0.15)

    def _on_damage(self):
        """Player hit → distortion spike."""
        self.eng.dist = min(1.0, self.eng.dist + 0.3)

    def draw(self, surf):
        # button (always visible)
        bc = (80, 200, 120) if self.open else (50, 90, 60)
        pygame.draw.rect(surf, bc, self.BTN_RECT, border_radius=6)
        pygame.draw.rect(surf, (100, 255, 140) if self.open else (70, 130, 80),
                         self.BTN_RECT, 2, border_radius=6)
        f12 = font(13, True)
        lbl = "CLOSE GAME" if self.open else "SPACE GAME"
        surf.blit(f12.render(lbl, True, (200, 255, 210)),
                  (self.BTN_RECT.x + 10, self.BTN_RECT.y + 8))

        if not self.open:
            return

        # ── game viewport ──
        gx, gy = self.gx, self.gy
        gs = pygame.Surface((self.GW, self.GH), pygame.SRCALPHA)
        gs.fill((6, 6, 18, 230))

        # stars background
        rng = random.Random(42)
        for _ in range(60):
            sx = rng.randint(0, self.GW)
            sy = rng.randint(0, self.GH)
            gs.set_at((sx, sy), (100, 100, 130))

        # player ship (little triangle)
        px, py = self.px, self.py
        ship_col = (100, 255, 160)
        if self.hit_flash > 0 and int(self.hit_flash * 20) % 2:
            ship_col = (255, 80, 80)
        pygame.draw.polygon(gs, ship_col, [
            (px, py - 10), (px - 8, py + 6), (px + 8, py + 6)])
        # engine glow
        pygame.draw.circle(gs, (80, 180, 255),
                           (px, py + 8), 3 + random.randint(0, 2))

        # bullets
        for b in self.bullets:
            pygame.draw.rect(gs, (255, 255, 100),
                             (int(b['x']) - 1, int(b['y']) - 4, 2, 8))

        # enemies
        for e in self.enemies:
            rgb = [int(v * 255) for v in
                   colorsys.hsv_to_rgb(e['hue'], 0.7, 0.9)]
            ex, ey, ew = int(e['x']), int(e['y']), e['w']
            if e['type'] == 'big':
                # diamond shape
                pygame.draw.polygon(gs, rgb, [
                    (ex, ey - 12), (ex + ew, ey),
                    (ex, ey + 12), (ex - ew, ey)])
            elif e['type'] == 'fast':
                # thin V
                pygame.draw.lines(gs, rgb, False, [
                    (ex - 10, ey - 6), (ex, ey + 6), (ex + 10, ey - 6)], 2)
            else:
                # rectangle
                pygame.draw.rect(gs, rgb,
                                 (ex - ew // 2, ey - 6, ew, 12))

        # particles
        for p in self.particles:
            a = min(1.0, p['life'] * 2)
            rgb = [int(v * 255) for v in
                   colorsys.hsv_to_rgb(p['hue'], 0.6, a)]
            sz = max(1, int(3 * a))
            pygame.draw.circle(gs, rgb, (int(p['x']), int(p['y'])), sz)

        # HUD
        f14 = font(14, True)
        gs.blit(f14.render(f"Score: {self.score}", True, (200, 255, 200)),
                (8, 6))
        gs.blit(f14.render(f"Combo: {self.combo}", True, (255, 220, 100)),
                (8, 24))
        # HP hearts
        for i in range(self.hp):
            pygame.draw.circle(gs, (255, 60, 80),
                               (self.GW - 16 - i * 18, 14), 6)

        if self.game_over:
            ov = font(24, True).render("GAME OVER", True, (255, 80, 80))
            gs.blit(ov, (self.GW // 2 - ov.get_width() // 2,
                         self.GH // 2 - 20))
            re = font(14).render("Press ENTER to retry", True, (180, 180, 200))
            gs.blit(re, (self.GW // 2 - re.get_width() // 2,
                         self.GH // 2 + 12))

        # controls hint
        h = font(11)
        gs.blit(h.render("A/D or Arrows = move   W or Up = shoot",
                         True, (80, 80, 110)), (8, self.GH - 18))

        # border
        pygame.draw.rect(gs, (80, 200, 130), (0, 0, self.GW, self.GH), 2)

        surf.blit(gs, (gx, gy))


# ═════════════════════════════════════════════════════════════
#  WAVEFORM VISUALISER
# ═════════════════════════════════════════════════════════════

def draw_waveform(surf, engine, rect):
    chunk = engine.vis
    if chunk is None or len(chunk) == 0:
        return
    mono = (chunk[:, 0] + chunk[:, 1]) * 0.5
    n = len(mono)
    step = max(1, n // rect.width)
    pts = []
    for i in range(0, n - step, step):
        px = rect.x + i * rect.width // n
        py = rect.centery - int(float(mono[i]) * (rect.height // 2))
        pts.append((px, py))
    if len(pts) > 1:
        pygame.draw.lines(surf, (60, 180, 120), False, pts, 1)
    pw = int(engine.progress * rect.width)
    pygame.draw.rect(surf, (40, 40, 55), rect, 1, border_radius=4)
    pygame.draw.rect(surf, (35, 85, 60),
                     pygame.Rect(rect.x, rect.bottom - 4, pw, 4))


# ═════════════════════════════════════════════════════════════
#  FILE PICKER
# ═════════════════════════════════════════════════════════════

def pick_file():
    if len(sys.argv) > 1 and os.path.isfile(sys.argv[1]):
        return sys.argv[1]
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        path = filedialog.askopenfilename(
            title="Choose an audio file",
            filetypes=[("Audio", "*.mp3 *.wav *.ogg *.flac *.m4a"),
                       ("All files", "*.*")])
        root.destroy()
        return path if path else None
    except Exception:
        print("Usage:  python audio_playground.py <audio_file>")
        return None


# ═════════════════════════════════════════════════════════════
#  MAIN
# ═════════════════════════════════════════════════════════════

def main():
    filepath = pick_file()
    if not filepath:
        sys.exit("No file selected.")

    print(f"Loading {filepath} ...")
    engine = AudioEngine(filepath)
    print(f"Loaded {engine.duration:.1f}s of audio.")

    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption(f"Audio Playground  -  {engine.filename}")
    clock = pygame.time.Clock()

    objects = [
        ElasticString(60, 150, 470, engine),
        GravityOrb((570, 70, 290, 240), engine),
        RipplePond(170, 510, 115, engine),
        ParticleCloud(570, 530, engine),
        VolumeThread(1200, 100, 380, engine),
        ReverseVortex(1030, 195, engine),
        StereoPendulum(370, 440, engine),
        TimeSpiral(890, 530, engine),
        SpatialRoom(880, 330, 160, engine),
        SpaceShooter(1060, 500, engine),
        ChaosBurst(engine),          # hidden
        SecretWobble(engine),         # hidden
    ]

    seek_bar_rect = pygame.Rect(30, HEIGHT - 60, WIDTH - 60, 45)

    engine.start()
    running = True

    while running:
        dt = min(clock.tick(FPS) / 1000.0, 0.05)
        mx, my = pygame.mouse.get_pos()

        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                running = False
                continue

            # click-to-seek on the waveform bar
            if (ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1
                    and seek_bar_rect.collidepoint(mx, my)):
                frac = (mx - seek_bar_rect.x) / seek_bar_rect.width
                frac = max(0.0, min(1.0, frac))
                engine.pos = frac * engine.n
                continue

            # let objects handle the event first (space shooter needs keys)
            consumed = False
            for obj in objects:
                if obj.handle(ev, mx, my):
                    consumed = True
                    break

            if consumed:
                continue

            # global hotkeys (only if no object consumed the event)
            if ev.type == pygame.KEYDOWN:
                if ev.key == pygame.K_SPACE:
                    engine.playing = not engine.playing
                elif ev.key == pygame.K_ESCAPE:
                    running = False
                elif ev.key == pygame.K_r:
                    for obj in objects:
                        obj.reset()

        for obj in objects:
            obj.update(mx, my, dt)

        # ── draw ──
        screen.fill(BG)
        for obj in objects:
            obj.draw(screen)

        draw_waveform(screen, engine, seek_bar_rect)

        t_sec = engine.pos / SR
        dur = engine.duration
        sym = ">" if engine.playing else "||"
        rev = " <<" if engine.reverse else ""
        title = (f"{sym}{rev}  {engine.filename}    "
                 f"{int(t_sec // 60):02d}:{int(t_sec % 60):02d} / "
                 f"{int(dur // 60):02d}:{int(dur % 60):02d}")
        screen.blit(font(16, True).render(title, True, (180, 180, 200)),
                    (30, HEIGHT - 78))

        hint = "SPACE play/pause   R reset   ESC quit   |   Click waveform to seek   |   Interact with everything!"
        screen.blit(font(13).render(hint, True, (80, 80, 100)), (30, 12))

        pygame.display.flip()

    engine.stop()
    pygame.quit()


if __name__ == "__main__":
    main()
