"""
Audio Playground  -  Interactive Audio Effects Toy
==================================================
Load an MP3/WAV file and interact with 5 visual objects
to manipulate the sound in real-time.

Objects
-------
  1. Elastic String   -  pull to bend the pitch
  2. Gravity Orb      -  throw it; X position = filter cutoff
  3. Ripple Pond      -  click to spawn echo ripples
  4. Particle Cloud   -  drag to scatter = distortion
  5. Volume Thread    -  pull down to raise volume

Keys
----
  SPACE   play / pause
  R       reset all effects
  ESC     quit

Usage
-----
  python audio_playground.py [audio_file]
  If no file is given a file-picker dialog opens.

Requires ffmpeg on PATH for MP3 decoding (used by pydub).
"""

import sys
import os
import math
import random
import colorsys

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
    """Streams audio via sounddevice and applies real-time effects."""

    def __init__(self, path: str):
        seg = AudioSegment.from_file(path)
        seg = seg.set_frame_rate(SR).set_channels(2).set_sample_width(2)
        raw = np.array(seg.get_array_of_samples(), dtype=np.float32)
        self.data = raw.reshape(-1, 2) / 32768.0
        self.n = len(self.data)
        self.pos = 0.0
        self.playing = True

        # effect parameters (written by UI thread, read by audio thread)
        self.volume = 0.7
        self.pitch = 1.0       # 1 = normal
        self.cutoff = 1.0      # 0..1  (1 = filter wide open)
        self.echo_mix = 0.0    # 0..1
        self.dist = 0.0        # 0..1

        # echo ring-buffer  (350 ms delay)
        self._echo_len = int(SR * 0.35)
        self._echo_buf = np.zeros((self._echo_len, 2), np.float32)
        self._echo_wp = 0

        # filter state
        self._sos = None
        self._zi_l = None
        self._zi_r = None
        self._last_norm = -1.0

        # waveform snapshot for the UI visualiser
        self.vis = np.zeros((BLOCK, 2), np.float32)

        self.filename = os.path.basename(path)
        self.duration = self.n / SR
        self._stream = None

    # ── lifecycle ──

    def start(self):
        self._stream = sd.OutputStream(
            samplerate=SR, channels=2, dtype="float32",
            blocksize=BLOCK, callback=self._cb, latency="low",
        )
        self._stream.start()

    def stop(self):
        if self._stream:
            self._stream.stop()
            self._stream.close()

    # ── audio callback (real-time thread) ──

    def _cb(self, out, frames, _ti, _st):
        if not self.playing:
            out[:] = 0
            return

        # snapshot parameters
        p = float(np.clip(self.pitch, 0.25, 4.0))
        v = float(self.volume)
        fc = float(self.cutoff)
        em = float(self.echo_mix)
        di = float(self.dist)

        # ── pitch-shift via resampled read ──
        t = np.arange(frames, dtype=np.float64) * p + self.pos
        t %= self.n
        i0 = t.astype(np.intp) % self.n
        i1 = (i0 + 1) % self.n
        frac = (t - np.floor(t)).astype(np.float32)[:, None]
        c = self.data[i0] * (1 - frac) + self.data[i1] * frac
        self.pos = float((self.pos + frames * p) % self.n)

        # ── low-pass filter ──
        if fc < 0.97:
            hz = max(60.0, fc * 20000.0)
            norm = min(hz / (SR / 2), 0.99)
            if abs(norm - self._last_norm) > 0.003 or self._sos is None:
                self._sos = butter(2, norm, btype="low", output="sos")
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
            # filter fully open  →  reset state so it's fresh next time
            self._last_norm = -1.0
            self._zi_l = self._zi_r = None

        # ── distortion (soft-clip tanh) ──
        if di > 0.01:
            g = 1.0 + di * 25.0
            c = np.tanh(c * g).astype(np.float32)

        # ── echo / delay ──
        if em > 0.005:
            c = self._echo(c, em)

        # ── volume + clamp ──
        c *= v
        np.clip(c, -1.0, 1.0, out=c)

        out[:frames] = c
        self.vis = c.copy()

    # ── vectorised echo with circular buffer ──

    def _echo(self, c, mix, fb=0.45):
        n = len(c)
        ep = self._echo_wp
        el = self._echo_len

        if ep + n <= el:
            delayed = self._echo_buf[ep:ep + n].copy()
            c = c + delayed * mix
            self._echo_buf[ep:ep + n] = c * fb
            self._echo_wp = (ep + n) % el
        else:
            f = el - ep       # samples before wrap
            s = n - f         # samples after wrap
            delayed = np.empty_like(c)
            delayed[:f] = self._echo_buf[ep:el]
            delayed[f:] = self._echo_buf[:s]
            c = c + delayed * mix
            self._echo_buf[ep:el] = c[:f] * fb
            self._echo_buf[:s] = c[f:] * fb
            self._echo_wp = s
        return c

    @property
    def progress(self):
        return self.pos / self.n if self.n else 0


# ═════════════════════════════════════════════════════════════
#  FONT HELPER
# ═════════════════════════════════════════════════════════════

_font_cache: dict = {}


def font(size: int, bold: bool = False):
    key = (size, bold)
    if key not in _font_cache:
        _font_cache[key] = pygame.font.SysFont("consolas", size, bold=bold)
    return _font_cache[key]


# ═════════════════════════════════════════════════════════════
#  INTERACTIVE OBJECTS
# ═════════════════════════════════════════════════════════════

# 1 ─── Elastic String  (pitch) ──────────────────────────────

class ElasticString:
    """A vibrating string — pull it to bend the pitch up / down."""
    NAME = "PITCH STRING"

    def __init__(self, x, y, length, engine: AudioEngine):
        self.eng = engine
        self.x, self.y, self.length = x, y, length
        self.N = 32
        self.pts = [0.0] * self.N
        self.vels = [0.0] * self.N
        self.grab = -1
        self.hue = 0.0
        self.glow = 0.0
        self._sp = length / (self.N - 1)

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

        # wave equation on a string
        tension, damp = 0.35, 0.96
        nw = list(self.pts)
        for i in range(1, self.N - 1):
            if i == self.grab:
                continue
            force = tension * (self.pts[i - 1] + self.pts[i + 1] - 2 * self.pts[i])
            self.vels[i] = (self.vels[i] + force) * damp
            nw[i] = self.pts[i] + self.vels[i]
        nw[0] *= 0.92
        nw[-1] *= 0.92
        self.pts = nw

        avg_d = sum(self.pts) / self.N
        max_d = max(abs(p) for p in self.pts)
        self.glow = min(1.0, max_d / 80)
        target = 1.0 + avg_d / 200.0 * 0.7
        self.eng.pitch += (target - self.eng.pitch) * 0.12
        self.hue = (self.hue + dt * 0.08) % 1.0

    def draw(self, surf):
        sp = self._sp
        pts = [(int(self.x + i * sp), int(self.y + self.pts[i]))
               for i in range(self.N)]

        # glow layers
        if self.glow > 0.04:
            gs = pygame.Surface((int(self.length + 40), 340), pygame.SRCALPHA)
            for w, a in ((14, 30), (8, 55), (4, 85)):
                rgb = [int(c * 255) for c in colorsys.hsv_to_rgb(self.hue, 0.6, 1)]
                rgba = (*rgb, int(self.glow * a))
                sh = [(p[0] - self.x + 20, p[1] - self.y + 170) for p in pts]
                if len(sh) > 1:
                    pygame.draw.lines(gs, rgba, False, sh, w)
            surf.blit(gs, (self.x - 20, self.y - 170))

        # main line
        rgb = [int(c * 255) for c in colorsys.hsv_to_rgb(self.hue, 0.45, 1)]
        if len(pts) > 1:
            pygame.draw.lines(surf, rgb, False, pts, 3)

        # nodes
        for i in range(0, self.N, 4):
            pygame.draw.circle(surf, (210, 210, 255), pts[i], 5)

        # labels
        f = font(14)
        surf.blit(f.render(self.NAME, True, (160, 160, 210)),
                  (self.x, self.y - 35))
        surf.blit(f.render(f"x{self.eng.pitch:.2f}", True, (200, 200, 255)),
                  (self.x + self.length - 50, self.y - 35))


# 2 ─── Gravity Orb  (filter cutoff) ────────────────────────

class GravityOrb:
    """Throw the orb around — its X position controls the low-pass filter."""
    NAME = "FILTER ORB"

    def __init__(self, rect, engine: AudioEngine):
        self.eng = engine
        self.r = pygame.Rect(rect)
        # start near the right so filter is open
        self.ox = float(self.r.right - 30)
        self.oy = float(self.r.centery)
        self.vx = self.vy = 0.0
        self.R = 22
        self.grabbed = False
        self.prev = (self.ox, self.oy)
        self.trail: list = []
        self.hue = 0.55

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
        if self.grabbed:
            self.prev = (self.ox, self.oy)
            self.ox, self.oy = float(mx), float(my)
            self.vx = self.vy = 0
        else:
            self.vy += 300 * dt           # gravity
            self.vx *= 0.998
            self.vy *= 0.998
            self.ox += self.vx * dt
            self.oy += self.vy * dt
            # bounce
            lo_x, hi_x = self.r.left + self.R, self.r.right - self.R
            lo_y, hi_y = self.r.top + self.R, self.r.bottom - self.R
            if self.ox < lo_x:
                self.ox = lo_x; self.vx = abs(self.vx) * 0.8
            if self.ox > hi_x:
                self.ox = hi_x; self.vx = -abs(self.vx) * 0.8
            if self.oy < lo_y:
                self.oy = lo_y; self.vy = abs(self.vy) * 0.8
            if self.oy > hi_y:
                self.oy = hi_y; self.vy = -abs(self.vy) * 0.8

        self.trail.append((self.ox, self.oy))
        if len(self.trail) > 50:
            self.trail.pop(0)

        nx = float(np.clip((self.ox - self.r.left) / self.r.width, 0, 1))
        self.eng.cutoff = 0.03 + nx * 0.97
        self.hue = (0.55 + nx * 0.3) % 1.0

    def draw(self, surf):
        pygame.draw.rect(surf, (28, 28, 45), self.r, 1, border_radius=8)
        # trail
        for i, (tx, ty) in enumerate(self.trail):
            a = i / max(1, len(self.trail))
            rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(self.hue, 0.5, a)]
            pygame.draw.circle(surf, rgb, (int(tx), int(ty)), int(3 + a * 7))
        # glow
        for gr in (36, 28):
            rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(self.hue, 0.4, 0.28)]
            pygame.draw.circle(surf, rgb, (int(self.ox), int(self.oy)), gr)
        # orb
        rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(self.hue, 0.65, 1)]
        pygame.draw.circle(surf, rgb, (int(self.ox), int(self.oy)), self.R)
        # highlight
        pygame.draw.circle(surf, (255, 255, 255),
                           (int(self.ox - 5), int(self.oy - 5)), 5)
        # labels
        f = font(14)
        surf.blit(f.render(self.NAME, True, (100, 180, 210)),
                  (self.r.x, self.r.y - 20))
        surf.blit(f.render(f"Cutoff {self.eng.cutoff:.0%}", True, (160, 160, 200)),
                  (self.r.right - 120, self.r.y - 20))


# 3 ─── Ripple Pond  (echo) ─────────────────────────────────

class RipplePond:
    """Click inside to spawn ripples — more ripples = more echo."""
    NAME = "ECHO POND"

    def __init__(self, cx, cy, radius, engine: AudioEngine):
        self.eng = engine
        self.cx, self.cy, self.rad = cx, cy, radius
        self.ripples: list = []

    def handle(self, ev, mx, my):
        if ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
            if math.hypot(mx - self.cx, my - self.cy) < self.rad:
                self.ripples.append(dict(
                    x=mx, y=my, r=0.0,
                    mx=55 + random.random() * 45,
                    hue=random.random()))
                return True
        return False

    def update(self, mx, my, dt):
        alive = []
        for rp in self.ripples:
            rp['r'] += 75 * dt
            if rp['r'] < rp['mx']:
                alive.append(rp)
        self.ripples = alive
        target = min(0.85, len(self.ripples) * 0.18)
        self.eng.echo_mix += (target - self.eng.echo_mix) * 0.08

    def draw(self, surf):
        # pond background
        bg = pygame.Surface((self.rad * 2, self.rad * 2), pygame.SRCALPHA)
        pygame.draw.circle(bg, (18, 28, 55, 140),
                           (self.rad, self.rad), self.rad)
        surf.blit(bg, (self.cx - self.rad, self.cy - self.rad))
        pygame.draw.circle(surf, (35, 55, 95),
                           (self.cx, self.cy), self.rad, 2)
        # expanding ripples
        for rp in self.ripples:
            a = 1 - rp['r'] / rp['mx']
            rgb = [int(v * 255) for v in
                   colorsys.hsv_to_rgb(rp['hue'], 0.35, 0.85)]
            w = max(1, int(3 * a))
            pygame.draw.circle(surf, rgb,
                               (int(rp['x']), int(rp['y'])),
                               int(rp['r']), w)
        # labels
        f = font(14)
        surf.blit(f.render(self.NAME, True, (100, 150, 210)),
                  (self.cx - 45, self.cy - self.rad - 22))
        surf.blit(f.render(f"Echo {self.eng.echo_mix:.0%}", True, (150, 150, 200)),
                  (self.cx - 45, self.cy + self.rad + 6))


# 4 ─── Particle Cloud  (distortion) ────────────────────────

class ParticleCloud:
    """Drag to scatter particles — spread controls distortion."""
    NAME = "DISTORTION CLOUD"

    def __init__(self, cx, cy, engine: AudioEngine):
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
            d = math.hypot(mx - self.cx, my - self.cy)
            self.spread = 25 + d * 0.9
        else:
            self.tx += (self.cx - self.tx) * 0.03
            self.ty += (self.cy - self.ty) * 0.03
            self.spread += (25 - self.spread) * 0.04

        for p in self.ps:
            dx = self.tx - p['x']
            dy = self.ty - p['y']
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


# 5 ─── Volume Thread ────────────────────────────────────────

class VolumeThread:
    """Pull the handle down to increase volume."""
    NAME = "VOLUME"

    def __init__(self, x, y, length, engine: AudioEngine):
        self.eng = engine
        self.x, self.y0, self.length = x, y, length
        self.pull = 0.7
        self.hy = y + length * self.pull
        self.grabbed = False

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
        # track
        pygame.draw.line(surf, (50, 50, 65), (x, y0), (x, y0 + ln), 2)
        # filled section
        if self.pull > 0:
            h = (0.3 - self.pull * 0.3) % 1.0
            rgb = [int(v * 255) for v in colorsys.hsv_to_rgb(h, 0.65, 0.9)]
            pygame.draw.line(surf, rgb, (x, y0), (x, int(self.hy)), 4)
        # handle
        pygame.draw.circle(surf, (225, 225, 245), (x, int(self.hy)), 13)
        pygame.draw.circle(surf, (180, 180, 200), (x, int(self.hy)), 13, 2)
        # labels
        f = font(14)
        surf.blit(f.render(self.NAME, True, (150, 200, 150)),
                  (x - 32, y0 - 28))
        surf.blit(f.render(f"{self.pull:.0%}", True, (200, 200, 200)),
                  (x - 18, y0 + ln + 12))


# ═════════════════════════════════════════════════════════════
#  WAVEFORM VISUALISER  (bottom bar)
# ═════════════════════════════════════════════════════════════

def draw_waveform(surf, engine: AudioEngine, rect: pygame.Rect):
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

    # progress bar
    pw = int(engine.progress * rect.width)
    pygame.draw.rect(surf, (40, 40, 55), rect, 1, border_radius=4)
    pygame.draw.rect(surf, (35, 85, 60),
                     pygame.Rect(rect.x, rect.bottom - 4, pw, 4))


# ═════════════════════════════════════════════════════════════
#  FILE PICKER
# ═════════════════════════════════════════════════════════════

def pick_file() -> str | None:
    """Return file path from CLI arg or from a tk file dialog."""
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

    # ── create the 5 interactive objects ──
    objects = [
        ElasticString(80, 160, 500, engine),
        GravityOrb((630, 80, 340, 280), engine),
        RipplePond(220, 520, 125, engine),
        ParticleCloud(780, 540, engine),
        VolumeThread(1130, 130, 380, engine),
    ]

    engine.start()

    running = True
    while running:
        dt = min(clock.tick(FPS) / 1000.0, 0.05)
        mx, my = pygame.mouse.get_pos()

        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                running = False
            elif ev.type == pygame.KEYDOWN:
                if ev.key == pygame.K_SPACE:
                    engine.playing = not engine.playing
                elif ev.key == pygame.K_ESCAPE:
                    running = False
                elif ev.key == pygame.K_r:
                    engine.pitch = 1.0
                    engine.cutoff = 1.0
                    engine.echo_mix = 0.0
                    engine.dist = 0.0
            else:
                for obj in objects:
                    if obj.handle(ev, mx, my):
                        break

        for obj in objects:
            obj.update(mx, my, dt)

        # ── draw ──
        screen.fill(BG)
        for obj in objects:
            obj.draw(screen)

        draw_waveform(screen, engine,
                      pygame.Rect(30, HEIGHT - 60, WIDTH - 60, 45))

        # now-playing bar
        t_sec = engine.pos / SR
        dur = engine.duration
        sym = ">" if engine.playing else "||"
        title = (f"{sym}  {engine.filename}    "
                 f"{int(t_sec // 60):02d}:{int(t_sec % 60):02d} / "
                 f"{int(dur // 60):02d}:{int(dur % 60):02d}")
        screen.blit(font(16, bold=True).render(title, True, (180, 180, 200)),
                    (30, HEIGHT - 78))

        # hint
        hint = ("SPACE = play/pause   R = reset effects   ESC = quit"
                "   |   Drag objects to change the sound!")
        screen.blit(font(13).render(hint, True, (80, 80, 100)), (30, 12))

        pygame.display.flip()

    engine.stop()
    pygame.quit()


if __name__ == "__main__":
    main()
