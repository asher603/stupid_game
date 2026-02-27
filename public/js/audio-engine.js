// ═══════════════════════════════════════════════════════════
//  DJ Studio Pro – Audio Engine
//  Dual-deck Web Audio processing with EQ, FX, crossfader
// ═══════════════════════════════════════════════════════════

/**
 * Single deck audio processing chain:
 *   source → trim → eqHigh → eqMid → eqLow → filter → [dry + echo] → distortion → channelGain → analyser → output
 */
export class DeckEngine {
  constructor(audioCtx, masterGain) {
    this.ctx = audioCtx;
    this.masterGain = masterGain;
    this.buffer = null;
    this.duration = 0;
    this.filename = '';
    this.loaded = false;

    // ── Build processing chain ──

    // Trim / input gain
    this.trimNode = this.ctx.createGain();
    this.trimNode.gain.value = 1.0;

    // 3-Band EQ (peaking filters)
    this.eqHigh = this.ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 3200;
    this.eqHigh.gain.value = 0;

    this.eqMid = this.ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 0.7;
    this.eqMid.gain.value = 0;

    this.eqLow = this.ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 320;
    this.eqLow.gain.value = 0;

    // Filter sweep (LP/HP)
    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000;
    this.filterNode.Q.value = 1;

    // Echo / Delay
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 1.0;

    this.delayNode = this.ctx.createDelay(2.0);
    this.delayNode.delayTime.value = 0.375; // ~1/2 beat at 120 BPM
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0;
    this.feedbackGain = this.ctx.createGain();
    this.feedbackGain.gain.value = 0;

    // Reverb (convolver simulated with delay network)
    this.reverbDry = this.ctx.createGain();
    this.reverbDry.gain.value = 1.0;
    this.reverbWet = this.ctx.createGain();
    this.reverbWet.gain.value = 0;
    this.reverbDelay1 = this.ctx.createDelay(0.1);
    this.reverbDelay1.delayTime.value = 0.03;
    this.reverbDelay2 = this.ctx.createDelay(0.1);
    this.reverbDelay2.delayTime.value = 0.06;
    this.reverbDelay3 = this.ctx.createDelay(0.15);
    this.reverbDelay3.delayTime.value = 0.09;
    this.reverbFb = this.ctx.createGain();
    this.reverbFb.gain.value = 0.4;

    // Distortion
    this.distNode = this.ctx.createWaveShaper();
    this.distNode.oversample = '4x';
    this._distAmount = 0;
    this._lastDistCurve = -1;

    // Channel volume
    this.channelGain = this.ctx.createGain();
    this.channelGain.gain.value = 0.8;

    // Analyser for waveform/VU
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.85;

    // Frequency analyser
    this.freqAnalyser = this.ctx.createAnalyser();
    this.freqAnalyser.fftSize = 512;
    this.freqAnalyser.smoothingTimeConstant = 0.8;

    // ── Connect chain ──
    // trim → eqHigh → eqMid → eqLow → filter
    this.trimNode.connect(this.eqHigh);
    this.eqHigh.connect(this.eqMid);
    this.eqMid.connect(this.eqLow);
    this.eqLow.connect(this.filterNode);

    // filter → dry path + echo path
    this.filterNode.connect(this.dryGain);
    this.filterNode.connect(this.delayNode);
    this.delayNode.connect(this.wetGain);
    this.wetGain.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);

    // dry + wet → reverb stage
    this.dryGain.connect(this.reverbDry);
    this.wetGain.connect(this.reverbDry);

    this.dryGain.connect(this.reverbDelay1);
    this.dryGain.connect(this.reverbDelay2);
    this.dryGain.connect(this.reverbDelay3);
    this.reverbDelay1.connect(this.reverbWet);
    this.reverbDelay2.connect(this.reverbWet);
    this.reverbDelay3.connect(this.reverbWet);
    this.reverbWet.connect(this.reverbFb);
    this.reverbFb.connect(this.reverbDelay1);

    // reverb → distortion → channel gain → analyser
    this.reverbDry.connect(this.distNode);
    this.reverbWet.connect(this.distNode);
    this.distNode.connect(this.channelGain);
    this.channelGain.connect(this.analyser);
    this.channelGain.connect(this.freqAnalyser);
    this.analyser.connect(this.masterGain);

    // ── Source management ──
    this._source = null;
    this.playing = false;
    this._position = 0;
    this._startCtxTime = 0;
    this._startOffset = 0;
    this._rate = 1.0;

    // ── Parameters ──
    this.volume = 0.8;
    this.tempo = 0;          // -50 to +50 percent
    this.eqHighDb = 0;
    this.eqMidDb = 0;
    this.eqLowDb = 0;
    this.filterPos = 50;     // 0..100 (50 = off, <50 = LP, >50 = HP)
    this.echoAmount = 0;     // 0..100
    this.reverbAmount = 0;   // 0..100
    this.distAmount = 0;     // 0..100

    // Cue / Loop
    this.cuePoint = 0;
    this.hotCues = [null, null, null, null];
    this.looping = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.loopLength = 4;     // bars (estimate)

    // BPM detection result
    this.bpm = 0;

    // Precomputed waveform overview for static display
    this.waveformOverview = null;

    // Buffers for real-time data
    this._timeData = new Float32Array(this.analyser.fftSize);
    this._freqData = new Uint8Array(this.freqAnalyser.frequencyBinCount);
  }

  // ── Load audio buffer ──

  async loadBuffer(audioBuffer, filename) {
    this.buffer = audioBuffer;
    this.duration = audioBuffer.duration;
    this.filename = filename;
    this.loaded = true;
    this._position = 0;
    this.cuePoint = 0;
    this.hotCues = [null, null, null, null];
    this.looping = false;

    // Precompute waveform overview (downsampled)
    this._computeWaveformOverview();

    // Detect BPM
    this.bpm = this._detectBPM(audioBuffer);
  }

  _computeWaveformOverview() {
    if (!this.buffer) return;
    const raw = this.buffer.getChannelData(0);
    const targetSamples = 800;
    const blockSize = Math.floor(raw.length / targetSamples);
    this.waveformOverview = new Float32Array(targetSamples);
    for (let i = 0; i < targetSamples; i++) {
      let sum = 0;
      const start = i * blockSize;
      for (let j = start; j < start + blockSize && j < raw.length; j++) {
        sum += Math.abs(raw[j]);
      }
      this.waveformOverview[i] = sum / blockSize;
    }
  }

  _detectBPM(buffer) {
    // Simple peak-interval BPM detection
    const data = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const len = Math.min(data.length, sr * 30); // Analyse first 30 seconds

    // Low-pass filter & downsample
    const ds = 4;
    const filtered = [];
    for (let i = 0; i < len - ds; i += ds) {
      let sum = 0;
      for (let j = 0; j < ds; j++) sum += Math.abs(data[i + j]);
      filtered.push(sum / ds);
    }

    // Find peaks
    const threshold = 0.3;
    let maxVal = 0;
    for (const v of filtered) if (v > maxVal) maxVal = v;
    const thresh = maxVal * threshold;

    const peaks = [];
    let lastPeak = -1000;
    const minGap = (sr / ds) * 0.3; // Min 0.3s between peaks

    for (let i = 1; i < filtered.length - 1; i++) {
      if (filtered[i] > thresh && filtered[i] > filtered[i - 1] && filtered[i] > filtered[i + 1] && (i - lastPeak) > minGap) {
        peaks.push(i);
        lastPeak = i;
      }
    }

    if (peaks.length < 4) return 120; // Default

    // Calculate intervals
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push((peaks[i] - peaks[i - 1]) * ds / sr);
    }

    // Find most common interval range (60-180 BPM)
    const bpmCounts = {};
    for (const interval of intervals) {
      const bpm = Math.round(60 / interval);
      if (bpm >= 60 && bpm <= 180) {
        const key = Math.round(bpm / 2) * 2; // Round to nearest 2 BPM
        bpmCounts[key] = (bpmCounts[key] || 0) + 1;
      }
    }

    let bestBPM = 120, bestCount = 0;
    for (const [bpm, count] of Object.entries(bpmCounts)) {
      if (count > bestCount) {
        bestCount = count;
        bestBPM = parseInt(bpm);
      }
    }

    return bestBPM;
  }

  // ── Source lifecycle ──

  _createSource(offset) {
    if (this._source) {
      // Detach onended BEFORE stopping to prevent false "track ended" triggers
      this._source.onended = null;
      try { this._source.stop(); } catch (_) {}
      this._source.disconnect();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = false;
    src.playbackRate.value = this._rate;
    src.connect(this.trimNode);

    this._startCtxTime = this.ctx.currentTime;
    this._startOffset = Math.max(0, Math.min(offset, this.duration - 0.001));
    src.start(0, this._startOffset);

    // Track end – only fires on natural buffer exhaustion
    src.onended = () => {
      if (this.playing && !this.looping) {
        this.playing = false;
        this._position = 0;
        // Notify UI via callback
        if (this.onTrackEnd) this.onTrackEnd();
      }
    };

    this._source = src;
  }

  play() {
    if (!this.loaded) return;
    if (this.playing) return;
    this.playing = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this._createSource(this._position);
  }

  pause() {
    if (!this.playing) return;
    this._syncPos();
    this.playing = false;
    if (this._source) {
      this._source.onended = null; // Detach to prevent false triggers
      try { this._source.stop(); } catch (_) {}
      this._source.disconnect();
      this._source = null;
    }
  }

  togglePlay() {
    this.playing ? this.pause() : this.play();
  }

  stop() {
    this.pause();
    this._position = this.cuePoint;
  }

  seek(frac) {
    frac = Math.max(0, Math.min(1, frac));
    this._position = frac * this.duration;
    if (this.playing) {
      this._createSource(this._position);
    }
  }

  seekTo(time) {
    this._position = Math.max(0, Math.min(this.duration - 0.001, time));
    if (this.playing) {
      this._createSource(this._position);
    }
  }

  setCuePoint() {
    this._syncPos();
    this.cuePoint = this._position;
  }

  goToCue() {
    this.seekTo(this.cuePoint);
    if (!this.playing) this.play();
  }

  setHotCue(index) {
    this._syncPos();
    if (this.hotCues[index] !== null) {
      // Jump to existing hot cue
      this.seekTo(this.hotCues[index]);
      if (!this.playing) this.play();
    } else {
      // Set new hot cue
      this.hotCues[index] = this._position;
    }
  }

  toggleLoop() {
    if (this.looping) {
      this.looping = false;
      return;
    }
    this._syncPos();
    const beatsPerBar = 4;
    const beatDuration = 60 / (this.bpm || 120);
    this.loopStart = this._position;
    this.loopEnd = this._position + beatsPerBar * this.loopLength * beatDuration;
    if (this.loopEnd > this.duration) this.loopEnd = this.duration;
    this.looping = true;
  }

  // ── Position ──

  _syncPos() {
    if (this.playing && this._source) {
      const elapsed = (this.ctx.currentTime - this._startCtxTime) * this._rate;
      this._position = this._startOffset + elapsed;

      // Clamp to valid range
      if (this._position < 0) this._position = 0;
      if (this._position >= this.duration) {
        this._position = this._position % this.duration;
      }

      // Loop handling
      if (this.looping && this._position >= this.loopEnd) {
        this._position = this.loopStart;
        this._createSource(this._position);
      }
    }
  }

  get position() {
    this._syncPos();
    return this._position;
  }

  get progress() {
    return this.duration > 0 ? this.position / this.duration : 0;
  }

  // ── Apply parameters (called each frame) ──

  applyParams() {
    const now = this.ctx.currentTime;
    const T = 0.016;

    // Playback rate from tempo
    const rate = Math.max(0.5, Math.min(2.0, 1 + this.tempo / 100));
    if (Math.abs(rate - this._rate) > 0.001) {
      this._syncPos();
      this._startCtxTime = now;
      this._startOffset = this._position;
      this._rate = rate;
      if (this._source) this._source.playbackRate.setValueAtTime(rate, now);
    }

    // NOTE: channelGain is set by DJMixer.update() with crossfader applied
    // Do NOT set channelGain here or it will override the crossfader.

    // EQ
    this.eqHigh.gain.setTargetAtTime(this.eqHighDb, now, T);
    this.eqMid.gain.setTargetAtTime(this.eqMidDb, now, T);
    this.eqLow.gain.setTargetAtTime(this.eqLowDb, now, T);

    // Filter sweep
    const fp = this.filterPos;
    if (fp < 48) {
      // Low-pass: sweep from 200 Hz to 20000 Hz
      this.filterNode.type = 'lowpass';
      const norm = fp / 48;
      const hz = 200 * Math.pow(100, norm);
      this.filterNode.frequency.setTargetAtTime(Math.min(hz, 20000), now, T);
      this.filterNode.Q.setTargetAtTime(1 + (1 - norm) * 6, now, T);
    } else if (fp > 52) {
      // High-pass: sweep from 20 Hz to 5000 Hz
      this.filterNode.type = 'highpass';
      const norm = (fp - 52) / 48;
      const hz = 20 + norm * norm * 4980;
      this.filterNode.frequency.setTargetAtTime(hz, now, T);
      this.filterNode.Q.setTargetAtTime(1 + norm * 6, now, T);
    } else {
      // Center = off
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.setTargetAtTime(20000, now, T);
      this.filterNode.Q.setTargetAtTime(0.7, now, T);
    }

    // Echo
    const echo = this.echoAmount / 100;
    this.wetGain.gain.setTargetAtTime(echo * 0.7, now, T);
    this.feedbackGain.gain.setTargetAtTime(echo * 0.5, now, T);

    // Reverb
    const rev = this.reverbAmount / 100;
    this.reverbWet.gain.setTargetAtTime(rev * 0.5, now, T);
    this.reverbFb.gain.setTargetAtTime(rev * 0.35, now, T);

    // Distortion
    const d = this.distAmount / 100;
    if (Math.abs(d - this._lastDistCurve) > 0.005 || this._lastDistCurve < 0) {
      this._lastDistCurve = d;
      this.distNode.curve = d > 0.01 ? this._makeDistCurve(d) : null;
    }
  }

  _makeDistCurve(amount) {
    const k = 1 + amount * 30;
    const n = 4096;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * k);
    }
    return curve;
  }

  // ── Visualisation data ──

  getTimeDomainData() {
    this.analyser.getFloatTimeDomainData(this._timeData);
    return this._timeData;
  }

  getFrequencyData() {
    this.freqAnalyser.getByteFrequencyData(this._freqData);
    return this._freqData;
  }

  getLevel() {
    this.analyser.getFloatTimeDomainData(this._timeData);
    let rms = 0;
    for (let i = 0; i < this._timeData.length; i++) {
      rms += this._timeData[i] * this._timeData[i];
    }
    rms = Math.sqrt(rms / this._timeData.length);
    return Math.min(1, rms * 3); // Scale for visibility
  }
}

// ═══════════════════════════════════════════════════════════
//  Master audio context & crossfader
// ═══════════════════════════════════════════════════════════

export class DJMixer {
  constructor() {
    this.ctx = new AudioContext();

    // Master output
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    // Master analyser
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 256;
    this.masterAnalyser.smoothingTimeConstant = 0.8;

    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    // Create two deck engines
    this.deckA = new DeckEngine(this.ctx, this.masterGain);
    this.deckB = new DeckEngine(this.ctx, this.masterGain);

    // Crossfader parameters
    this.crossfader = 0; // -100 to +100  (-100 = A, 0 = center, +100 = B)
    this.masterVolume = 0.8;

    // Master frequency data
    this._masterFreqData = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this._masterTimeData = new Float32Array(this.masterAnalyser.fftSize);
  }

  async loadToDeck(deck, file) {
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const arrayBuf = await file.arrayBuffer();
    const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
    const engine = deck === 'A' ? this.deckA : this.deckB;
    await engine.loadBuffer(audioBuf, file.name);
    return engine;
  }

  // Apply crossfader and master volume each frame
  update() {
    const cf = this.crossfader / 100; // -1 to +1

    // Equal-power crossfade
    let gainA, gainB;
    if (cf <= 0) {
      gainA = 1.0;
      gainB = Math.max(0, 1 + cf);
    } else {
      gainA = Math.max(0, 1 - cf);
      gainB = 1.0;
    }

    // Apply crossfader to channel gains (multiplicative)
    if (this.deckA.loaded) {
      this.deckA.channelGain.gain.setTargetAtTime(this.deckA.volume * gainA, this.ctx.currentTime, 0.016);
      this.deckA.applyParams();
    }
    if (this.deckB.loaded) {
      this.deckB.channelGain.gain.setTargetAtTime(this.deckB.volume * gainB, this.ctx.currentTime, 0.016);
      this.deckB.applyParams();
    }

    // Master volume
    this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, this.masterVolume)), this.ctx.currentTime, 0.016);
  }

  getMasterFrequencyData() {
    this.masterAnalyser.getByteFrequencyData(this._masterFreqData);
    return this._masterFreqData;
  }

  getMasterTimeData() {
    this.masterAnalyser.getFloatTimeDomainData(this._masterTimeData);
    return this._masterTimeData;
  }

  getMasterLevel() {
    this.masterAnalyser.getFloatTimeDomainData(this._masterTimeData);
    let rms = 0;
    for (let i = 0; i < this._masterTimeData.length; i++) {
      rms += this._masterTimeData[i] * this._masterTimeData[i];
    }
    return Math.min(1, Math.sqrt(rms / this._masterTimeData.length) * 3);
  }
}

