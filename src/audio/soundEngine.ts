export type BgmTheme = 'plaza' | 'race' | 'tower' | 'none';

export interface AudioSettingsState {
  bgmEnabled: boolean;
  bgmVolume: number; // 0 to 100
  sfxEnabled: boolean;
  sfxVolume: number; // 0 to 100
  muted: boolean;
}

const STORAGE_KEY = 'mathblox_audio_settings';

const DEFAULT_SETTINGS: AudioSettingsState = {
  bgmEnabled: true,
  bgmVolume: 55,
  sfxEnabled: true,
  sfxVolume: 80,
  muted: false,
};

function loadInitialSettings(): AudioSettingsState {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      bgmEnabled: typeof parsed.bgmEnabled === 'boolean' ? parsed.bgmEnabled : DEFAULT_SETTINGS.bgmEnabled,
      bgmVolume: typeof parsed.bgmVolume === 'number' ? Math.max(0, Math.min(100, parsed.bgmVolume)) : DEFAULT_SETTINGS.bgmVolume,
      sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : DEFAULT_SETTINGS.sfxEnabled,
      sfxVolume: typeof parsed.sfxVolume === 'number' ? Math.max(0, Math.min(100, parsed.sfxVolume)) : DEFAULT_SETTINGS.sfxVolume,
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_SETTINGS.muted,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private settings: AudioSettingsState = loadInitialSettings();
  private listeners = new Set<(state: AudioSettingsState) => void>();

  private currentTheme: BgmTheme = 'none';
  private bgmTimer: number | null = null;
  private bgmStep = 0;
  private bgmSpeedMultiplier = 1.0;
  private towerHighIntensity = false;

  private lastEngineTick = 0;
  private lastStepTick = 0;
  private unlockBound = false;

  constructor() {
    if (typeof window !== 'undefined') {
      this.bindMobileUnlock();
    }
  }

  private bindMobileUnlock(): void {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const unlock = () => {
      const ctx = this.ensureContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      if (this.currentTheme !== 'none' && this.bgmTimer === null) {
        this.scheduleBgmLoop();
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public get muted(): boolean {
    return this.settings.muted;
  }

  public set muted(val: boolean) {
    this.updateSettings({ muted: val });
  }

  public getSettings(): AudioSettingsState {
    return { ...this.settings };
  }

  public subscribe(listener: (state: AudioSettingsState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public updateSettings(partial: Partial<AudioSettingsState>): void {
    this.settings = {
      ...this.settings,
      ...partial,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // Ignore storage quota errors
    }
    this.syncGainNodes();
    const snapshot = this.getSettings();
    this.listeners.forEach((fn) => fn(snapshot));
  }

  public toggleMuteAll(): boolean {
    const nextMuted = !this.settings.muted;
    this.updateSettings({ muted: nextMuted });
    return nextMuted;
  }

  private syncGainNodes(): void {
    if (!this.ctx || !this.bgmGain || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const effectiveBgm =
      this.settings.muted || !this.settings.bgmEnabled
        ? 0.0001
        : Math.max(0.0001, (this.settings.bgmVolume / 100) * 0.35);
    const effectiveSfx =
      this.settings.muted || !this.settings.sfxEnabled
        ? 0.0001
        : Math.max(0.0001, (this.settings.sfxVolume / 100) * 0.95);

    this.bgmGain.gain.setTargetAtTime(effectiveBgm, now, 0.03);
    this.sfxGain.gain.setTargetAtTime(effectiveSfx, now, 0.02);
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.bgmGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      this.syncGainNodes();

      // Create reusable 1-second white noise buffer for percussion & wind sweep effects
      const sampleRate = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, sampleRate, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < sampleRate; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // ============================================================================
  // DYNAMIC PROCEDURAL BGM ENGINE (Praça Bragantina, Corrida 132 BPM, Torre)
  // ============================================================================

  public startBgm(theme: BgmTheme): void {
    if (this.currentTheme === theme && this.bgmTimer !== null) return;
    this.currentTheme = theme;
    this.bgmStep = 0;
    this.bgmSpeedMultiplier = 1.0;
    this.towerHighIntensity = false;

    if (this.bgmTimer !== null) {
      window.clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (theme === 'none') return;
    this.scheduleBgmLoop();
  }

  public stopBgm(): void {
    this.currentTheme = 'none';
    if (this.bgmTimer !== null) {
      window.clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  public setBgmSpeedMultiplier(mult: number): void {
    this.bgmSpeedMultiplier = Math.max(0.75, Math.min(1.35, mult));
  }

  public setTowerIntensity(high: boolean): void {
    this.towerHighIntensity = high;
  }

  private scheduleBgmLoop(): void {
    if (this.currentTheme === 'none') return;

    // Base 16th-note step duration in ms
    let stepMs = 150;
    if (this.currentTheme === 'plaza') {
      // 108 BPM light regional marimba / Marujada rhythm
      stepMs = 138;
    } else if (this.currentTheme === 'race') {
      // 132 BPM arcade synth rhythm, accelerated by bgmSpeedMultiplier (e.g. 1.12x on Turbo)
      stepMs = Math.round(113 / this.bgmSpeedMultiplier);
    } else if (this.currentTheme === 'tower') {
      // 118 BPM adventure rhythm, faster on high intensity stages (8/10 to 10/10)
      stepMs = this.towerHighIntensity ? 112 : 128;
    }

    this.playBgmStep(this.currentTheme, this.bgmStep);
    this.bgmStep = (this.bgmStep + 1) % 32;

    this.bgmTimer = window.setTimeout(() => {
      this.scheduleBgmLoop();
    }, stepMs);
  }

  private playBgmStep(theme: BgmTheme, step: number): void {
    if (this.settings.muted || !this.settings.bgmEnabled) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.bgmGain || ctx.state !== 'running') return;

    if (theme === 'plaza') {
      // "Ritmo Bragantino / Marujada Light": joyful marimba/xylophone & light shaker
      const marimbaScale = [
        523.25, 659.25, 783.99, 880.0, 1046.5, 880.0, 783.99, 659.25,
        587.33, 739.99, 880.0, 987.77, 1174.66, 987.77, 880.0, 739.99,
      ];
      const bassNotes = [130.81, 130.81, 196.0, 196.0, 146.83, 146.83, 196.0, 246.94];

      // Marimba melody on syncopated steps
      if (step % 2 === 0 || step % 8 === 3) {
        const note = marimbaScale[(step >> 1) % marimbaScale.length];
        this.playBgmOsc(note, note, 0.14, 'sine', 0.22);
        this.playBgmOsc(note * 2, note * 2, 0.06, 'triangle', 0.07);
      }
      // Warm acoustic bass on quarter beats
      if (step % 4 === 0) {
        const bNote = bassNotes[(step >> 2) % bassNotes.length];
        this.playBgmOsc(bNote, bNote, 0.22, 'triangle', 0.24);
      }
      // Light Marujada drum / shaker pulse
      if (step % 4 === 2) {
        this.playBgmNoise(0.035, 3200, 0.08);
      }
    } else if (theme === 'race') {
      // "Adrenalina Arcade" (132 BPM): driving bass + energetic synth lead
      const pitchShift = this.bgmSpeedMultiplier > 1.05 ? 1.06 : 1.0;
      const bassPattern = [
        110.0, 110.0, 220.0, 110.0, 130.81, 130.81, 261.63, 130.81,
        146.83, 146.83, 293.66, 146.83, 164.81, 164.81, 329.63, 196.0,
      ];
      const leadArp = [
        440.0, 523.25, 659.25, 880.0, 659.25, 523.25, 587.33, 659.25,
        523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 587.33, 783.99,
      ];

      // Driving 8th-note synth bass
      if (step % 2 === 0) {
        const bFreq = bassPattern[(step >> 1) % bassPattern.length] * pitchShift;
        this.playBgmOsc(bFreq, bFreq * 0.98, 0.11, 'sawtooth', 0.16);
      }
      // Synth lead melody
      if (step % 2 === 1 || step % 4 === 0) {
        const lFreq = leadArp[step % leadArp.length] * pitchShift;
        this.playBgmOsc(lFreq, lFreq, 0.09, 'square', 0.11);
      }
      // Electronic kick on 4/4 beats
      if (step % 4 === 0) {
        this.playBgmOsc(135, 38, 0.09, 'sine', 0.28);
      }
      // Crisp hi-hat on off-beats
      if (step % 4 === 2) {
        this.playBgmNoise(0.03, 5200, 0.09);
      }
    } else if (theme === 'tower') {
      // "Desafio na Torre": rhythmic adventure synth that intensifies on final stages
      const transpose = this.towerHighIntensity ? 1.122 : 1.0; // +2 semitones in final stages
      const arpNotes = [
        392.0, 493.88, 587.33, 783.99, 587.33, 493.88, 659.25, 587.33,
        349.23, 440.0, 523.25, 698.46, 523.25, 440.0, 587.33, 523.25,
      ];
      if (step % 2 === 0) {
        const freq = arpNotes[(step >> 1) % arpNotes.length] * transpose;
        this.playBgmOsc(freq, freq, 0.13, 'triangle', 0.19);
      }
      if (step % 4 === 0) {
        const root = (step < 16 ? 196.0 : 174.61) * transpose;
        this.playBgmOsc(root, root, 0.22, 'sine', 0.22);
      }
      if (this.towerHighIntensity && step % 2 === 1) {
        this.playBgmNoise(0.025, 4500, 0.06);
      }
    }
  }

  private playBgmOsc(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    gainVal: number
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(25, freqEnd), now + duration);
    }

    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(gainVal, now + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(env);
    env.connect(this.bgmGain);
    osc.start(now);
    osc.stop(now + duration + 0.015);
  }

  private playBgmNoise(duration: number, filterFreq: number, gainVal: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bgmGain || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(filterFreq, now);

    const env = ctx.createGain();
    env.gain.setValueAtTime(gainVal, now);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.bgmGain);
    src.start(now);
    src.stop(now + duration);
  }

  // ============================================================================
  // SOUND EFFECTS (SFX) ENGINE
  // ============================================================================

  private canPlaySfx(): boolean {
    return !this.settings.muted && this.settings.sfxEnabled && this.settings.sfxVolume > 0;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'triangle',
    gainVal = 0.14,
    delay = 0
  ): void {
    if (!this.canPlaySfx()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private playFilteredNoiseSweep(
    duration: number,
    freqStart: number,
    freqEnd: number,
    gainVal = 0.16
  ): void {
    if (!this.canPlaySfx()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain || !this.noiseBuffer) return;

    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(2.5, now);
    filter.frequency.setValueAtTime(freqStart, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freqEnd), now + duration);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(gainVal, now + 0.03);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxGain);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  // --- Classic Gameplay SFX ---

  playJump(): void {
    this.playTone(230, 520, 0.14, 'triangle', 0.14);
  }

  playCoin(): void {
    this.playTone(987.77, 987.77, 0.07, 'sine', 0.12, 0);
    this.playTone(1318.51, 1318.51, 0.18, 'sine', 0.13, 0.065);
  }

  playCheckpoint(): void {
    this.playTone(523.25, 523.25, 0.1, 'triangle', 0.12, 0);
    this.playTone(659.25, 659.25, 0.15, 'triangle', 0.12, 0.08);
  }

  playCorrect(): void {
    this.playTone(523.25, 523.25, 0.1, 'triangle', 0.15, 0);
    this.playTone(659.25, 659.25, 0.1, 'triangle', 0.15, 0.08);
    this.playTone(783.99, 783.99, 0.12, 'triangle', 0.15, 0.16);
    this.playTone(1046.5, 1046.5, 0.25, 'sine', 0.16, 0.24);
  }

  playJumpPad(): void {
    this.playTone(220, 880, 0.28, 'sine', 0.16);
  }

  playTrapFall(): void {
    this.playTone(340, 110, 0.32, 'sawtooth', 0.11, 0);
    this.playTone(180, 75, 0.28, 'square', 0.08, 0.18);
  }

  playVictory(): void {
    this.playFinishFanfare();
  }

  // --- New v7.0 Race & Rally Dedicated SFX ---

  /** Musical beeps on pre-race countdown (3... 2... 1... JÁ!) */
  playCountdown(isGo = false): void {
    if (isGo) {
      this.playTone(880, 1046.5, 0.28, 'triangle', 0.18, 0);
      this.playTone(1318.51, 1318.51, 0.26, 'sine', 0.14, 0.04);
    } else {
      this.playTone(440, 440, 0.14, 'sine', 0.15, 0);
    }
  }

  /** Subtle rhythmic footsteps synced with running in TurboRaceGame */
  playStepPulse(isTurbo = false): void {
    const nowMs = performance.now();
    const minInterval = isTurbo ? 145 : 220;
    if (nowMs - this.lastStepTick < minInterval) return;
    this.lastStepTick = nowMs;

    const pitch = isTurbo ? 175 : 130;
    this.playTone(pitch, 58, 0.045, 'triangle', 0.055, 0);
  }

  /** Smooth procedural engine purr that rises in pitch with kart speed */
  playKartEngine(speedRatio: number, isNitro = false): void {
    const nowMs = performance.now();
    if (nowMs - this.lastEngineTick < 95) return;
    this.lastEngineTick = nowMs;

    const clamped = Math.max(0.1, Math.min(1.6, speedRatio));
    const baseFreq = (isNitro ? 92 : 64) + clamped * 68;
    this.playTone(baseFreq, baseFreq * 1.04, 0.09, 'sawtooth', isNitro ? 0.05 : 0.035, 0);
  }

  /** Crystalline chime when runner enters within 30 units of a question gate */
  playGateProximity(): void {
    this.playTone(1046.5, 1318.51, 0.12, 'sine', 0.11, 0);
    this.playTone(1567.98, 1567.98, 0.16, 'sine', 0.1, 0.07);
  }

  /** Wind propulsion sweep + bright ascending chord on crossing the right gate */
  playTurboBoost(): void {
    this.playFilteredNoiseSweep(0.42, 420, 2800, 0.18);
    this.playTone(523.25, 659.25, 0.12, 'triangle', 0.15, 0);
    this.playTone(659.25, 783.99, 0.12, 'triangle', 0.15, 0.07);
    this.playTone(783.99, 1046.5, 0.14, 'triangle', 0.16, 0.14);
    this.playTone(1046.5, 1318.51, 0.28, 'sine', 0.18, 0.21);
  }

  /** Deep descending brake/impact sound on crossing the wrong gate */
  playSlowdownHit(): void {
    this.playFilteredNoiseSweep(0.28, 900, 180, 0.15);
    this.playTone(280, 82, 0.34, 'sawtooth', 0.14, 0);
    this.playTone(155, 62, 0.3, 'square', 0.1, 0.12);
  }

  /** Full victorious fanfare when crossing the finish line */
  playFinishFanfare(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.51];
    const times = [0, 0.09, 0.18, 0.28, 0.42, 0.54, 0.68];
    const durs = [0.1, 0.1, 0.1, 0.14, 0.1, 0.14, 0.42];
    notes.forEach((n, idx) => {
      this.playTone(n, n, durs[idx], 'triangle', 0.16, times[idx]);
      if (idx >= 3) {
        this.playTone(n * 0.5, n * 0.5, durs[idx], 'sine', 0.1, times[idx]);
      }
    });
  }

  /**
   * Efeito Sonoro Procedural do Meme "Fá!" (v10.0):
   * Impacto dramático de trompa/brass na nota musical Fá (F3 = 174.61 Hz + F4 = 349.23 Hz + quinta C4 = 261.63 Hz + sub F2 = 87.31 Hz)
   * com osciladores sawtooth passando por filtro passa-baixa ressonante, ataque instantâneo e queda dramática de pitch de 1.2s.
   */
  playMemeFaSound(): void {
    if (!this.canPlaySfx()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;

    const now = ctx.currentTime;
    const duration = 1.2;

    // Filtro passa-baixa ressonante de trompa/brass dramática
    const brassFilter = ctx.createBiquadFilter();
    brassFilter.type = 'lowpass';
    brassFilter.Q.setValueAtTime(5.5, now);
    brassFilter.frequency.setValueAtTime(2400, now);
    brassFilter.frequency.exponentialRampToValueAtTime(280, now + duration);

    const masterEnv = ctx.createGain();
    masterEnv.gain.setValueAtTime(0.0001, now);
    masterEnv.gain.linearRampToValueAtTime(0.38, now + 0.015); // Ataque instantâneo de impacto
    masterEnv.gain.setValueAtTime(0.34, now + 0.22);
    masterEnv.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    brassFilter.connect(masterEnv);
    masterEnv.connect(this.sfxGain);

    // Vozes da nota Fá: F3 (174.61 Hz), F4 (349.23 Hz), quinta C4 (261.63 Hz) e sub-impacto F2 (87.31 Hz)
    const voices: { freq: number; type: OscillatorType; detune: number; dropRatio: number }[] = [
      { freq: 174.61, type: 'sawtooth', detune: -8, dropRatio: 0.72 },
      { freq: 349.23, type: 'sawtooth', detune: 8, dropRatio: 0.72 },
      { freq: 261.63, type: 'sawtooth', detune: 0, dropRatio: 0.72 },
      { freq: 87.31, type: 'triangle', detune: 0, dropRatio: 0.65 },
    ];

    for (const v of voices) {
      const osc = ctx.createOscillator();
      osc.type = v.type;
      osc.detune.setValueAtTime(v.detune, now);
      osc.frequency.setValueAtTime(v.freq, now);
      // Sustenta a nota Fá no ataque e aplica queda dramática de pitch até 1.2s
      osc.frequency.setValueAtTime(v.freq, now + 0.25);
      osc.frequency.exponentialRampToValueAtTime(v.freq * v.dropRatio, now + duration);
      osc.connect(brassFilter);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }

    // Impacto percussivo inicial (boom curto)
    this.playFilteredNoiseSweep(0.22, 1200, 140, 0.22);
  }

  /** Acorde curto festivo para a frase "Obrigado, meu prefeito! 🫡🏛️" */
  playMayorChime(): void {
    // Acorde maior brilhante em Fá Maior (F4 - A4 - C5 - F5)
    this.playTone(349.23, 349.23, 0.16, 'triangle', 0.15, 0);
    this.playTone(440.0, 440.0, 0.16, 'triangle', 0.15, 0.06);
    this.playTone(523.25, 523.25, 0.18, 'triangle', 0.16, 0.12);
    this.playTone(698.46, 698.46, 0.34, 'sine', 0.18, 0.18);
  }
}

export const soundEngine = new SoundEngine();

