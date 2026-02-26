// ═══════════════════════════════════════════════
//  Main – ties everything together
// ═══════════════════════════════════════════════

import { WIDTH, HEIGHT, rgb, drawLines, drawText, fillRect, strokeRect } from './utils.js';
import { AudioEngine } from './audio-engine.js';
import {
  ElasticString, GravityOrb, RipplePond, ParticleCloud,
  VolumeThread, ReverseVortex, TimeSpiral, DraggableSpeaker,
  SpaceShooter, ChaosBurst, SecretWobble,
} from './objects.js';

// ── State ──
let canvas, ctx;
let engine = null;
let objects = [];
let mouseX = 0, mouseY = 0;
let lastTime = 0;

// Seek bar rect (matches Python layout)
const seekBar = { x: 30, y: HEIGHT - 60, w: WIDTH - 60, h: 45 };

// ═══════════════════════════════════════════════
//  Initialisation & file loading
// ═══════════════════════════════════════════════

function init() {
  canvas = document.getElementById('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  ctx = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // File-upload wiring
  const overlay  = document.getElementById('upload-overlay');
  const area     = document.getElementById('upload-area');
  const fileBtn  = document.getElementById('file-btn');
  const fileInput = document.getElementById('file-input');

  fileBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadFile(fileInput.files[0]); });

  // Drag-and-drop
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', e => {
    e.preventDefault();
    area.classList.remove('dragover');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });

  // Start render loop (draws dark bg until audio is loaded)
  requestAnimationFrame(loop);
}

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT);
  canvas.style.width  = (WIDTH * scale) + 'px';
  canvas.style.height = (HEIGHT * scale) + 'px';
}

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return [
    (e.clientX - rect.left) * (WIDTH / rect.width),
    (e.clientY - rect.top)  * (HEIGHT / rect.height),
  ];
}

// ── Load audio file ──

async function loadFile(file) {
  const overlay = document.getElementById('upload-overlay');
  const area    = document.getElementById('upload-area');

  // Show loading state
  area.innerHTML = '<div class="upload-icon">♫</div><h1>Audio Playground</h1><p class="loading-text">Loading audio…</p>';

  try {
    const audioCtx = new AudioContext();
    const arrayBuf = await file.arrayBuffer();
    const audioBuf = await audioCtx.decodeAudioData(arrayBuf);

    engine = new AudioEngine(audioCtx, audioBuf);
    engine.filename = file.name;

    // Create objects (same layout as the Python version)
    objects = [
      new ElasticString(60, 150, 470, engine),
      new GravityOrb([570, 70, 290, 240], engine),
      new RipplePond(170, 510, 115, engine),
      new ParticleCloud(570, 530, engine),
      new VolumeThread(1200, 100, 380, engine),
      new ReverseVortex(1030, 195, engine),
      new TimeSpiral(890, 530, engine),
      new DraggableSpeaker(engine),
      new SpaceShooter(1060, 500, engine),
      new ChaosBurst(engine),
      new SecretWobble(engine),
    ];

    // Wire up canvas events
    bindCanvasEvents();

    // Hide overlay & start playback
    overlay.classList.add('hidden');
    engine.start();

  } catch (err) {
    area.innerHTML = `<div class="upload-icon">⚠</div><h1>Error</h1><p style="color:#f66">${err.message}</p><p style="margin-top:12px"><button id="file-btn" onclick="location.reload()">Try again</button></p>`;
    console.error(err);
  }
}

// ═══════════════════════════════════════════════
//  Event handling
// ═══════════════════════════════════════════════

function bindCanvasEvents() {
  canvas.addEventListener('mousedown', e => {
    e.preventDefault();
    [mouseX, mouseY] = getCanvasCoords(e);
    dispatch('mousedown', mouseX, mouseY, e);
  });

  canvas.addEventListener('mousemove', e => {
    [mouseX, mouseY] = getCanvasCoords(e);
  });

  // Global mouseup (catches releases outside canvas)
  document.addEventListener('mouseup', e => {
    [mouseX, mouseY] = getCanvasCoords(e);
    dispatch('mouseup', mouseX, mouseY, e);
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    [mouseX, mouseY] = getCanvasCoords(e);
    dispatch('wheel', mouseX, mouseY, e);
  }, { passive: false });

  // Prevent context menu for right-click chaos trigger
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', e => dispatch('keydown', mouseX, mouseY, e));
  document.addEventListener('keyup',   e => dispatch('keyup',   mouseX, mouseY, e));
}

function dispatch(type, mx, my, ev) {
  if (!engine) return;

  // Click-to-seek on waveform bar
  if (type === 'mousedown' && ev.button === 0 &&
      mx >= seekBar.x && mx <= seekBar.x + seekBar.w &&
      my >= seekBar.y && my <= seekBar.y + seekBar.h) {
    const frac = (mx - seekBar.x) / seekBar.w;
    engine.seek(frac);
    return;
  }

  // Dispatch to objects (first to consume wins)
  for (const obj of objects) {
    if (obj.handle(type, mx, my, ev)) {
      if (type !== 'keyup') return;   // keyup passes through
    }
  }

  // Global hotkeys
  if (type === 'keydown') {
    if (ev.code === 'Space')    { engine.togglePlay(); ev.preventDefault(); }
    else if (ev.key.toLowerCase() === 'r') { for (const o of objects) o.reset(); }
  }
}

// ═══════════════════════════════════════════════
//  Game loop
// ═══════════════════════════════════════════════

function loop(time) {
  requestAnimationFrame(loop);
  if (!engine) return;

  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  // Update reverse state
  engine.setReverse(engine.reverse);

  // Update objects
  for (const obj of objects) obj.update(mouseX, mouseY, dt);

  // Sync audio params
  engine.applyParams();

  // Draw
  draw(dt);
}

// ═══════════════════════════════════════════════
//  Rendering
// ═══════════════════════════════════════════════

function draw(dt) {
  const c = ctx;
  c.fillStyle = rgb(12, 12, 22);
  c.fillRect(0, 0, WIDTH, HEIGHT);

  // Draw all objects
  for (const obj of objects) {
    if (obj.draw.length >= 3) obj.draw(c, mouseX, mouseY);   // SecretWobble wants mx/my
    else obj.draw(c);
  }

  // Waveform / seek bar
  drawWaveform(c);

  // HUD
  drawHUD(c);
}

function drawWaveform(c) {
  const data = engine.getWaveform();
  const { x, y, w, h } = seekBar;

  strokeRect(c, x, y, w, h, rgb(40, 40, 55), 1, 4);

  // Waveform line
  const step = Math.max(1, (data.length / w) | 0);
  const pts = [];
  for (let i = 0; i < data.length - step; i += step) {
    const px = x + (i / data.length) * w;
    const py = y + h / 2 - data[i] * (h / 2);
    pts.push([px, py]);
  }
  if (pts.length > 1) drawLines(c, pts, rgb(60, 180, 120), 1);

  // Progress bar
  const pw = engine.progress * w;
  fillRect(c, x, y + h - 4, pw, 4, rgb(35, 85, 60));
}

function drawHUD(c) {
  const tSec = engine.displayPosition;
  const dur  = engine.duration;
  const sym  = engine.playing ? '▶' : '❚❚';
  const rev  = engine.reverse ? ' ◀◀' : '';
  const mm1 = String(tSec / 60 | 0).padStart(2, '0');
  const ss1 = String(tSec % 60 | 0).padStart(2, '0');
  const mm2 = String(dur / 60 | 0).padStart(2, '0');
  const ss2 = String(dur % 60 | 0).padStart(2, '0');
  const title = `${sym}${rev}  ${engine.filename}    ${mm1}:${ss1} / ${mm2}:${ss2}`;
  drawText(c, title, 30, HEIGHT - 78, rgb(180, 180, 200), 16, true);

  const hint = 'SPACE play/pause   R reset   |   Click waveform to seek   |   Interact with everything!';
  drawText(c, hint, 30, 12, rgb(80, 80, 100), 13);
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', init);
