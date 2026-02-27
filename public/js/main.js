// ═══════════════════════════════════════════════════════════
//  DJ Studio Pro – Main Controller
//  Wires up UI, events, visualisation, and audio engine
// ═══════════════════════════════════════════════════════════

import { DJMixer } from './audio-engine.js';
import { formatTime, drawWaveformOverview, drawVUMeter, drawSpectrum, drawMasterSpectrum } from './utils.js';

// ── Global state ──
let mixer = null;
const decks = {};  // { A: { engine, els, ... }, B: { ... } }
let rafId = null;

// ═══════════════════════════════════════════════
//  Initialisation
// ═══════════════════════════════════════════════

function init() {
  mixer = new DJMixer();

  // Set up both decks
  for (const id of ['A', 'B']) {
    const section = document.getElementById(`deck-${id.toLowerCase()}`);
    decks[id] = {
      engine: id === 'A' ? mixer.deckA : mixer.deckB,
      section,
      els: collectDeckElements(section),
      fxActive: { echo: false, reverb: false, distortion: false },
    };
    bindDeckEvents(id);
  }

  // Center / global controls
  bindGlobalEvents();
  startClock();

  // Start render loop
  rafId = requestAnimationFrame(loop);
}

function collectDeckElements(section) {
  const q = (sel) => section.querySelector(sel);
  const qa = (sel) => section.querySelectorAll(sel);
  return {
    trackName: q('[data-el="trackName"]'),
    bpm: q('[data-el="bpm"]'),
    waveform: q('[data-el="waveform"]'),
    timeDisplay: q('[data-el="timeDisplay"]'),
    dropZone: q('[data-el="dropZone"]'),
    fileInput: q('[data-el="fileInput"]'),
    tempoSlider: q('[data-el="tempoSlider"]'),
    tempoDisplay: q('[data-el="tempoDisplay"]'),
    eqHighVal: q('[data-el="eqHighVal"]'),
    eqMidVal: q('[data-el="eqMidVal"]'),
    eqLowVal: q('[data-el="eqLowVal"]'),
    filterVal: q('[data-el="filterVal"]'),
    vuMeter: q('[data-el="vuMeter"]'),
    volDisplay: q('[data-el="volDisplay"]'),
    btnPlay: q('[data-action="play"]'),
    btnCue: q('[data-action="cue"]'),
    btnSync: q('[data-action="sync"]'),
    btnLoop: q('[data-action="loop"]'),
    knobs: qa('.knob'),
    fxButtons: qa('.btn-fx'),
    fxAmounts: qa('.fx-amount'),
    volumeFader: q('.volume-fader'),
  };
}

// ═══════════════════════════════════════════════
//  Deck Events
// ═══════════════════════════════════════════════

function bindDeckEvents(id) {
  const deck = decks[id];
  const { els, engine } = deck;

  // ── File loading ──
  els.dropZone.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', () => {
    if (els.fileInput.files[0]) loadFileToDeck(id, els.fileInput.files[0]);
  });
  els.dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    els.dropZone.classList.add('dragover');
  });
  els.dropZone.addEventListener('dragleave', () => {
    els.dropZone.classList.remove('dragover');
  });
  els.dropZone.addEventListener('drop', e => {
    e.preventDefault();
    els.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) loadFileToDeck(id, e.dataTransfer.files[0]);
  });

  // ── Transport buttons ──
  els.btnPlay.addEventListener('click', () => {
    engine.togglePlay();
    updatePlayButton(id);
  });

  els.btnCue.addEventListener('click', e => {
    if (e.shiftKey) {
      engine.setCuePoint();
    } else {
      engine.goToCue();
    }
  });

  els.btnSync.addEventListener('click', () => {
    syncBPM(id);
  });

  els.btnLoop.addEventListener('click', () => {
    engine.toggleLoop();
    els.btnLoop.classList.toggle('active', engine.looping);
  });

  // ── Tempo slider ──
  els.tempoSlider.addEventListener('input', () => {
    const val = parseFloat(els.tempoSlider.value);
    engine.tempo = val;
    els.tempoDisplay.textContent = `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
  });

  // Double-click to reset tempo
  els.tempoSlider.addEventListener('dblclick', () => {
    els.tempoSlider.value = 0;
    engine.tempo = 0;
    els.tempoDisplay.textContent = '0.0%';
  });

  // ── EQ knobs ──
  els.knobs.forEach(knob => {
    const param = knob.dataset.param;
    knob.addEventListener('input', () => {
      const val = parseFloat(knob.value);
      switch (param) {
        case 'eqHigh':
          engine.eqHighDb = val;
          els.eqHighVal.textContent = `${val > 0 ? '+' : ''}${val.toFixed(0)} dB`;
          break;
        case 'eqMid':
          engine.eqMidDb = val;
          els.eqMidVal.textContent = `${val > 0 ? '+' : ''}${val.toFixed(0)} dB`;
          break;
        case 'eqLow':
          engine.eqLowDb = val;
          els.eqLowVal.textContent = `${val > 0 ? '+' : ''}${val.toFixed(0)} dB`;
          break;
        case 'filter':
          engine.filterPos = val;
          if (val < 48) els.filterVal.textContent = `LP ${Math.round((48 - val) / 48 * 100)}%`;
          else if (val > 52) els.filterVal.textContent = `HP ${Math.round((val - 52) / 48 * 100)}%`;
          else els.filterVal.textContent = 'OFF';
          break;
      }
    });

    // Double-click to reset
    knob.addEventListener('dblclick', () => {
      switch (param) {
        case 'eqHigh': knob.value = 0; engine.eqHighDb = 0; els.eqHighVal.textContent = '0 dB'; break;
        case 'eqMid': knob.value = 0; engine.eqMidDb = 0; els.eqMidVal.textContent = '0 dB'; break;
        case 'eqLow': knob.value = 0; engine.eqLowDb = 0; els.eqLowVal.textContent = '0 dB'; break;
        case 'filter': knob.value = 50; engine.filterPos = 50; els.filterVal.textContent = 'OFF'; break;
      }
    });
  });

  // ── FX buttons & amounts ──
  els.fxButtons.forEach(btn => {
    const fx = btn.dataset.fx;
    btn.addEventListener('click', () => {
      deck.fxActive[fx] = !deck.fxActive[fx];
      btn.classList.toggle('active', deck.fxActive[fx]);
      if (!deck.fxActive[fx]) {
        // Reset effect amount
        switch (fx) {
          case 'echo': engine.echoAmount = 0; break;
          case 'reverb': engine.reverbAmount = 0; break;
          case 'distortion': engine.distAmount = 0; break;
        }
        // Reset slider
        const slot = btn.closest('.fx-slot');
        const slider = slot.querySelector('.fx-amount');
        if (slider) slider.value = 0;
      }
    });
  });

  els.fxAmounts.forEach(slider => {
    const param = slider.dataset.param;
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      switch (param) {
        case 'echoAmount':
          if (deck.fxActive.echo) engine.echoAmount = val;
          break;
        case 'reverbAmount':
          if (deck.fxActive.reverb) engine.reverbAmount = val;
          break;
        case 'distAmount':
          if (deck.fxActive.distortion) engine.distAmount = val;
          break;
      }
    });
  });

  // ── Volume fader ──
  els.volumeFader.addEventListener('input', () => {
    const val = parseFloat(els.volumeFader.value) / 100;
    engine.volume = val;
    els.volDisplay.textContent = `${Math.round(val * 100)}%`;
  });

  // ── Waveform click to seek ──
  const waveformSeek = (e) => {
    if (!engine.loaded) return;
    const rect = els.waveform.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    engine.seek(frac);
  };

  let waveformDragging = false;
  els.waveform.addEventListener('mousedown', e => {
    waveformDragging = true;
    waveformSeek(e);
  });
  document.addEventListener('mousemove', e => {
    if (waveformDragging) waveformSeek(e);
  });
  document.addEventListener('mouseup', () => {
    waveformDragging = false;
  });
}

// ═══════════════════════════════════════════════
//  Global Events
// ═══════════════════════════════════════════════

function bindGlobalEvents() {
  // Crossfader
  const crossfader = document.getElementById('crossfader');
  crossfader.addEventListener('input', () => {
    mixer.crossfader = parseFloat(crossfader.value);
  });
  crossfader.addEventListener('dblclick', () => {
    crossfader.value = 0;
    mixer.crossfader = 0;
  });

  // Master volume
  const masterVol = document.getElementById('master-volume');
  const masterDisplay = document.getElementById('master-vol-display');
  masterVol.addEventListener('input', () => {
    const val = parseFloat(masterVol.value) / 100;
    mixer.masterVolume = val;
    masterDisplay.textContent = `${Math.round(val * 100)}%`;
  });

  // Hot cues
  document.querySelectorAll('.hot-cue-row').forEach(row => {
    const deckId = row.dataset.deck;
    row.querySelectorAll('.btn-hotcue').forEach(btn => {
      const cueIdx = parseInt(btn.dataset.cue) - 1;
      btn.addEventListener('click', () => {
        const engine = deckId === 'A' ? mixer.deckA : mixer.deckB;
        if (!engine.loaded) return;
        engine.setHotCue(cueIdx);
        if (engine.hotCues[cueIdx] !== null) {
          btn.classList.add('set');
        }
      });
      // Right-click to clear
      btn.addEventListener('contextmenu', e => {
        e.preventDefault();
        const engine = deckId === 'A' ? mixer.deckA : mixer.deckB;
        engine.hotCues[cueIdx] = null;
        btn.classList.remove('set');
      });
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    // Prevent browser default for Space
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.shiftKey) {
        mixer.deckB.togglePlay();
        updatePlayButton('B');
      } else {
        mixer.deckA.togglePlay();
        updatePlayButton('A');
      }
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'q': mixer.deckA.goToCue(); break;
      case 'w': mixer.deckB.goToCue(); break;
      case '1': if (mixer.deckA.loaded) hotCueKey('A', 0); break;
      case '2': if (mixer.deckA.loaded) hotCueKey('A', 1); break;
      case '3': if (mixer.deckA.loaded) hotCueKey('A', 2); break;
      case '4': if (mixer.deckA.loaded) hotCueKey('A', 3); break;
      case '5': if (mixer.deckB.loaded) hotCueKey('B', 0); break;
      case '6': if (mixer.deckB.loaded) hotCueKey('B', 1); break;
      case '7': if (mixer.deckB.loaded) hotCueKey('B', 2); break;
      case '8': if (mixer.deckB.loaded) hotCueKey('B', 3); break;
    }
  });
}

function hotCueKey(deckId, idx) {
  const engine = deckId === 'A' ? mixer.deckA : mixer.deckB;
  engine.setHotCue(idx);
  // Update button state
  const row = document.querySelector(`.hot-cue-row[data-deck="${deckId}"]`);
  const btn = row.querySelectorAll('.btn-hotcue')[idx];
  if (engine.hotCues[idx] !== null) btn.classList.add('set');
}

function syncBPM(deckId) {
  const other = deckId === 'A' ? 'B' : 'A';
  const thisDeck = decks[deckId].engine;
  const otherDeck = decks[other].engine;

  if (!otherDeck.loaded || !thisDeck.loaded) return;
  if (otherDeck.bpm === 0) return;

  // Calculate needed tempo adjustment
  const ratio = otherDeck.bpm / thisDeck.bpm;
  const tempoChange = (ratio - 1) * 100;
  thisDeck.tempo = Math.max(-50, Math.min(50, tempoChange));

  // Update slider
  decks[deckId].els.tempoSlider.value = thisDeck.tempo;
  decks[deckId].els.tempoDisplay.textContent = `${thisDeck.tempo >= 0 ? '+' : ''}${thisDeck.tempo.toFixed(1)}%`;
}

// ═══════════════════════════════════════════════
//  File Loading
// ═══════════════════════════════════════════════

async function loadFileToDeck(deckId, file) {
  const deck = decks[deckId];
  const { els } = deck;

  els.dropZone.querySelector('span').textContent = 'Loading...';

  try {
    await mixer.loadToDeck(deckId, file);
    els.dropZone.classList.add('hidden');
    els.trackName.textContent = file.name.replace(/\.[^.]+$/, '');
    els.bpm.textContent = `${deck.engine.bpm} BPM`;

    // Register track-end callback to auto-update play button
    deck.engine.onTrackEnd = () => updatePlayButton(deckId);

    updatePlayButton(deckId);
  } catch (err) {
    els.dropZone.querySelector('span').textContent = `Error: ${err.message}. Click to retry.`;
    console.error(`Deck ${deckId} load error:`, err);
  }
}

// ═══════════════════════════════════════════════
//  UI Updates
// ═══════════════════════════════════════════════

function updatePlayButton(deckId) {
  const deck = decks[deckId];
  const { engine, els, section } = deck;
  els.btnPlay.textContent = engine.playing ? '❚❚' : '▶';
  els.btnPlay.classList.toggle('active', engine.playing);
  section.classList.toggle('playing', engine.playing);
}

function startClock() {
  const clockEl = document.getElementById('clock');
  const tick = () => {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
  };
  tick();
  setInterval(tick, 1000);
}

// ═══════════════════════════════════════════════
//  Render Loop
// ═══════════════════════════════════════════════

function loop() {
  rafId = requestAnimationFrame(loop);
  if (!mixer) return;

  mixer.update();

  for (const id of ['A', 'B']) {
    const deck = decks[id];
    const { engine, els } = deck;
    if (!engine.loaded) continue;

    // Auto-sync play button state (catches natural track end)
    const isPlaying = engine.playing;
    const btnShows = els.btnPlay.classList.contains('active');
    if (isPlaying !== btnShows) updatePlayButton(id);

    // Update time display
    const pos = engine.position;
    const dur = engine.duration;
    els.timeDisplay.textContent = `${formatTime(pos)} / ${formatTime(dur)}`;

    // Sync canvas resolution to display size for crisp rendering
    syncCanvasSize(els.waveform);
    syncCanvasSize(els.vuMeter);

    // Draw waveform
    const wCtx = els.waveform.getContext('2d');
    const accent = id === 'A' ? '#00d4ff' : '#ff4488';
    const accentDim = id === 'A' ? '#004466' : '#661133';
    drawWaveformOverview(
      wCtx, els.waveform, engine.waveformOverview, engine.progress,
      accent, accentDim,
      engine.cuePoint / engine.duration,
      engine.hotCues.map(c => c !== null ? c / engine.duration : null),
      engine.looping ? engine.loopStart / engine.duration : null,
      engine.looping ? engine.loopEnd / engine.duration : null
    );

    // Draw VU meter
    const vuCtx = els.vuMeter.getContext('2d');
    drawVUMeter(vuCtx, els.vuMeter, engine.getLevel());
  }

  // Master spectrum
  const specCanvas = document.getElementById('spectrum-canvas');
  syncCanvasSize(specCanvas);
  const specCtx = specCanvas.getContext('2d');
  drawSpectrum(specCtx, specCanvas, mixer.getMasterFrequencyData());

  // Top bar mini spectrum
  const miniCanvas = document.getElementById('master-spectrum');
  syncCanvasSize(miniCanvas);
  const miniCtx = miniCanvas.getContext('2d');
  drawMasterSpectrum(miniCtx, miniCanvas, mixer.getMasterFrequencyData());
}

/** Sync canvas internal resolution to its CSS display size */
function syncCanvasSize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const displayW = Math.round(rect.width * dpr);
  const displayH = Math.round(rect.height * dpr);
  if (displayW > 0 && displayH > 0 && (canvas.width !== displayW || canvas.height !== displayH)) {
    canvas.width = displayW;
    canvas.height = displayH;
  }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', init);
