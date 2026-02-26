// ═══════════════════════════════════════════════
//  Web Audio Engine – mirrors Python AudioEngine
// ═══════════════════════════════════════════════

export class AudioEngine {
  constructor(audioCtx, audioBuffer) {
    this.ctx = audioCtx;
    this.buffer = audioBuffer;
    this.reversedBuffer = this._reverseBuffer(audioBuffer);
    this.duration = audioBuffer.duration;
    this.filename = '';

    // ── Build processing graph ──
    // source → distortion → filter → [dry + delay] → gain → pan → analyser → dest

    this.distNode = this.ctx.createWaveShaper();
    this.distNode.oversample = '4x';

    this.filterNode = this.ctx.createBiquadFilter();
    this.filterNode.type = 'lowpass';
    this.filterNode.frequency.value = 20000;
    this.filterNode.Q.value = 0.7071;

    // Dry path
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 1.0;

    // Echo: two delay taps (0.35 s, 0.65 s) with feedback
    this.delay1 = this.ctx.createDelay(1.0);
    this.delay1.delayTime.value = 0.35;
    this.delay2 = this.ctx.createDelay(1.0);
    this.delay2.delayTime.value = 0.65;

    this.wet1 = this.ctx.createGain();
    this.wet1.gain.value = 0;
    this.wet2 = this.ctx.createGain();
    this.wet2.gain.value = 0;
    this.fbGain = this.ctx.createGain();
    this.fbGain.gain.value = 0;

    // Main output
    this.mainGain = this.ctx.createGain();
    this.mainGain.gain.value = 0.7;

    this.panNode = this.ctx.createStereoPanner();
    this.panNode.pan.value = 0;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // ── Connect ──
    this.distNode.connect(this.filterNode);

    this.filterNode.connect(this.dryGain);
    this.filterNode.connect(this.delay1);
    this.filterNode.connect(this.delay2);

    this.dryGain.connect(this.mainGain);
    this.delay1.connect(this.wet1);
    this.delay2.connect(this.wet2);
    this.wet1.connect(this.mainGain);
    this.wet2.connect(this.mainGain);

    // Feedback → delay 1
    this.wet1.connect(this.fbGain);
    this.fbGain.connect(this.delay1);

    this.mainGain.connect(this.panNode);
    this.panNode.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // ── Source management ──
    this._source = null;
    this.playing = false;
    this._position = 0;       // seconds
    this._startCtxTime = 0;
    this._startOffset = 0;
    this._rate = 1.0;

    // ── Effect parameters (objects write these) ──
    this.volume = 0.7;
    this.pitch = 1.0;
    this.cutoff = 1.0;        // 0..1  (1 = open)
    this.echoMix = 0.0;       // 0..1
    this.dist = 0.0;          // 0..1
    this.reverse = false;
    this.pan = 0.0;           // -1..+1
    this.speedMult = 1.0;

    // Distortion curve cache
    this._lastDist = -1;

    // Visualisation buffer
    this._waveData = new Float32Array(this.analyser.fftSize);
  }

  // ── Buffer helpers ──

  _reverseBuffer(buf) {
    const nCh = buf.numberOfChannels;
    const len = buf.length;
    const rev = this.ctx.createBuffer(nCh, len, buf.sampleRate);
    for (let ch = 0; ch < nCh; ch++) {
      const src = buf.getChannelData(ch);
      const dst = rev.getChannelData(ch);
      for (let i = 0; i < len; i++) dst[i] = src[len - 1 - i];
    }
    return rev;
  }

  // ── Source lifecycle ──

  _createSource(offset) {
    if (this._source) {
      try { this._source.stop(); } catch (_) { /* ok */ }
      this._source.disconnect();
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.reverse ? this.reversedBuffer : this.buffer;
    src.loop = true;
    src.playbackRate.value = this._rate;
    src.connect(this.distNode);
    this._startCtxTime = this.ctx.currentTime;
    this._startOffset = offset % this.duration;
    src.start(0, this._startOffset);
    this._source = src;
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this._createSource(this._position);
  }

  stop() {
    if (!this.playing) return;
    this._syncPos();
    this.playing = false;
    if (this._source) {
      try { this._source.stop(); } catch (_) { /* ok */ }
      this._source.disconnect();
      this._source = null;
    }
  }

  togglePlay() { this.playing ? this.stop() : this.start(); }

  seek(frac) {
    frac = Math.max(0, Math.min(1, frac));
    this._position = frac * this.duration;
    if (this.playing) this._createSource(this._position);
  }

  setReverse(rev) {
    if (this.reverse === rev) return;
    this._syncPos();
    this.reverse = rev;
    this._position = this.duration - this._position;
    if (this._position < 0) this._position += this.duration;
    if (this.playing) this._createSource(this._position);
  }

  // ── Position tracking ──

  _syncPos() {
    if (this.playing && this._source) {
      const elapsed = (this.ctx.currentTime - this._startCtxTime) * this._rate;
      this._position = (this._startOffset + elapsed) % this.duration;
      if (this._position < 0) this._position += this.duration;
    }
  }

  get position() { this._syncPos(); return this._position; }
  get progress() { return this.position / this.duration; }

  get displayPosition() {
    const pos = this.position;
    return this.reverse ? this.duration - pos : pos;
  }

  // ── Apply params to Web Audio nodes (call each frame) ──

  applyParams() {
    const now = this.ctx.currentTime;
    const T = 0.016;

    // Playback rate
    const rate = Math.max(0.25, Math.min(4, Math.abs(this.pitch * this.speedMult)));
    if (Math.abs(rate - this._rate) > 0.001) {
      this._syncPos();
      this._startCtxTime = now;
      this._startOffset = this._position;
      this._rate = rate;
      if (this._source) this._source.playbackRate.setValueAtTime(rate, now);
    }

    // Volume
    this.mainGain.gain.setTargetAtTime(Math.max(0, Math.min(1, this.volume)), now, T);

    // Filter cutoff
    if (this.cutoff < 0.97) {
      const hz = Math.max(40, 40 * Math.pow(500, this.cutoff));
      this.filterNode.frequency.setTargetAtTime(Math.min(hz, 20000), now, T);
    } else {
      this.filterNode.frequency.setTargetAtTime(20000, now, T);
    }

    // Echo
    const em = Math.max(0, Math.min(1, this.echoMix));
    this.wet1.gain.setTargetAtTime(em, now, T);
    this.wet2.gain.setTargetAtTime(em * 0.7, now, T);
    this.fbGain.gain.setTargetAtTime(em * 0.55, now, T);

    // Distortion curve (cached)
    const d = Math.max(0, Math.min(1, this.dist));
    if (Math.abs(d - this._lastDist) > 0.005 || this._lastDist < 0) {
      this._lastDist = d;
      this.distNode.curve = d > 0.01 ? this._makeCurve(d) : null;
    }

    // Pan
    this.panNode.pan.setTargetAtTime(Math.max(-1, Math.min(1, this.pan)), now, T);
  }

  _makeCurve(amount) {
    const k = 1 + amount * 25;
    const n = 4096;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * k);
    }
    return curve;
  }

  // ── Visualisation ──

  getWaveform() {
    this.analyser.getFloatTimeDomainData(this._waveData);
    return this._waveData;
  }
}
