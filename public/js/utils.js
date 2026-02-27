// ═══════════════════════════════════════════════════════════
//  DJ Studio Pro – Utility Functions
//  Formatters, canvas drawing helpers for waveforms & meters
// ═══════════════════════════════════════════════════════════

// ── Time formatting ──

export function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Waveform Overview Drawing ──

export function drawWaveformOverview(ctx, canvas, data, progress, accentColor, dimColor, cuePos, hotCues, loopStart, loopEnd) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!data || data.length === 0) {
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, w, h);
    return;
  }

  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, w, h);

  // Loop region highlight
  if (loopStart !== null && loopEnd !== null) {
    ctx.fillStyle = 'rgba(255, 136, 0, 0.08)';
    const lx = loopStart * w;
    const lw = (loopEnd - loopStart) * w;
    ctx.fillRect(lx, 0, lw, h);

    ctx.strokeStyle = 'rgba(255, 136, 0, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(lx, 0); ctx.lineTo(lx, h);
    ctx.moveTo(lx + lw, 0); ctx.lineTo(lx + lw, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const mid = h / 2;
  const step = Math.max(1, Math.floor(data.length / w));
  const playX = progress * w;

  // Draw waveform bars
  for (let i = 0; i < w; i++) {
    const idx = Math.floor((i / w) * data.length);
    const val = Math.min(1, data[idx] * 3); // Amplify for visibility
    const barH = val * mid * 0.9;

    if (i < playX) {
      ctx.fillStyle = accentColor;
    } else {
      ctx.fillStyle = dimColor;
    }

    // Mirrored waveform
    ctx.fillRect(i, mid - barH, 1, barH * 2);
  }

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  // Playhead
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(playX, 0);
  ctx.lineTo(playX, h);
  ctx.stroke();

  // Cue point marker
  if (cuePos > 0 && cuePos < 1) {
    const cx = cuePos * w;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx + 6, 0);
    ctx.lineTo(cx, 10);
    ctx.closePath();
    ctx.fill();
  }

  // Hot cue markers
  const hotColors = ['#00ff88', '#00aaff', '#ff44ff', '#ffaa00'];
  if (hotCues) {
    for (let i = 0; i < hotCues.length; i++) {
      if (hotCues[i] !== null) {
        const hx = hotCues[i] * w;
        ctx.fillStyle = hotColors[i % hotColors.length];
        ctx.beginPath();
        ctx.moveTo(hx, h);
        ctx.lineTo(hx + 5, h);
        ctx.lineTo(hx, h - 8);
        ctx.closePath();
        ctx.fill();

        // Small number
        ctx.font = 'bold 7px sans-serif';
        ctx.fillText(String(i + 1), hx + 1, h - 1);
      }
    }
  }
}

// ── VU Meter Drawing ──

export function drawVUMeter(ctx, canvas, level) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, w, h);

  const barH = level * h;
  const segments = 20;
  const segH = h / segments;
  const gap = 1;

  for (let i = 0; i < segments; i++) {
    const y = h - (i + 1) * segH;
    const segLevel = (i + 1) / segments;

    if (segLevel <= level) {
      // Color gradient: green → yellow → red
      if (segLevel < 0.6) {
        ctx.fillStyle = '#00cc44';
      } else if (segLevel < 0.85) {
        ctx.fillStyle = '#cccc00';
      } else {
        ctx.fillStyle = '#ff2244';
      }
    } else {
      ctx.fillStyle = '#1a1a24';
    }

    ctx.fillRect(1, y + gap, w - 2, segH - gap * 2);
  }

  // Border
  ctx.strokeStyle = '#2a2a3a';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w, h);
}

// ── Spectrum Analyser Drawing ──

export function drawSpectrum(ctx, canvas, freqData) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, w, h);

  if (!freqData || freqData.length === 0) return;

  const bars = 64;
  const barW = w / bars;
  const gap = 1;

  for (let i = 0; i < bars; i++) {
    // Map to frequency data (logarithmic distribution)
    const idx = Math.floor(Math.pow(i / bars, 1.5) * freqData.length);
    const val = (freqData[idx] || 0) / 255;
    const barH = val * h * 0.9;

    // Gradient color based on frequency
    const hue = (i / bars) * 0.7; // Blue to red
    const r = Math.round(lerp(0, 255, i / bars));
    const g = Math.round(lerp(180, 40, i / bars));
    const b = Math.round(lerp(255, 80, i / bars));

    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(i * barW + gap, h - barH, barW - gap * 2, barH);

    // Reflection
    ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
    ctx.fillRect(i * barW + gap, h - barH - 2, barW - gap * 2, 2);
  }

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

// ── Mini Master Spectrum (for top bar) ──

export function drawMasterSpectrum(ctx, canvas, freqData) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!freqData || freqData.length === 0) return;

  const bars = 40;
  const barW = w / bars;

  for (let i = 0; i < bars; i++) {
    const idx = Math.floor(Math.pow(i / bars, 1.5) * freqData.length);
    const val = (freqData[idx] || 0) / 255;
    const barH = val * h * 0.85;

    const intensity = Math.round(100 + val * 155);
    ctx.fillStyle = `rgba(0, ${intensity}, ${Math.round(intensity * 0.8)}, 0.8)`;
    ctx.fillRect(i * barW, h - barH, barW - 1, barH);
  }
}

// ── Math helpers ──

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
