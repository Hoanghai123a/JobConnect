/**
 * Audio Manager - Phase 14
 * Web Audio API synth for 8-bit/retro sound effects (no mp3 files)
 */

type SoundEffect = "plant" | "harvest" | "coin" | "click" | "levelup";

class AudioManager {
  private audioContext: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;

  constructor() {
    // Lazy init AudioContext (chỉ tạo khi cần)
    this.loadMuteState();
  }

  /**
   * Initialize AudioContext (gọi sau user interaction đầu tiên)
   */
  private initAudioContext() {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.connect(this.audioContext.destination);
      this.updateMasterVolume();
      console.log("🔊 AudioContext initialized");
    } catch (err) {
      console.warn("⚠️ Web Audio API not supported:", err);
    }
  }

  /**
   * Load mute state from localStorage
   */
  private loadMuteState() {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("farm-game-mute");
    this.isMuted = saved === "true";
  }

  /**
   * Save mute state to localStorage
   */
  private saveMuteState() {
    if (typeof window === "undefined") return;
    localStorage.setItem("farm-game-mute", String(this.isMuted));
  }

  /**
   * Update master volume based on mute state
   */
  private updateMasterVolume() {
    if (!this.masterGain) return;
    this.masterGain.gain.value = this.isMuted ? 0 : 1;
  }

  /**
   * Toggle mute on/off
   */
  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.saveMuteState();
    this.updateMasterVolume();
    console.log(this.isMuted ? "🔇 Audio muted" : "🔊 Audio unmuted");
    return this.isMuted;
  }

  /**
   * Get current mute state
   */
  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Play a sound effect
   */
  public play(effect: SoundEffect) {
    if (this.isMuted) return;

    // Init audio context on first play (must be after user gesture)
    this.initAudioContext();

    if (!this.audioContext || !this.masterGain) {
      console.warn("⚠️ AudioContext not available");
      return;
    }

    switch (effect) {
      case "plant":
        this.playPlantSound();
        break;
      case "harvest":
        this.playHarvestSound();
        break;
      case "coin":
        this.playCoinSound();
        break;
      case "click":
        this.playClickSound();
        break;
      case "levelup":
        this.playLevelUpSound();
        break;
    }
  }

  /**
   * Plant seed sound: Short 'pop' (200Hz → 100Hz, 80ms)
   */
  private playPlantSound() {
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = "square"; // 8-bit retro sound
    osc.frequency.setValueAtTime(200, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.08);

    gain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioContext.currentTime + 0.08);
  }

  /**
   * Harvest sound: Bright 'ting' (800Hz → 1200Hz, 150ms)
   */
  private playHarvestSound() {
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = "sine"; // Smooth tone
    osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.05);
    osc.frequency.exponentialRampToValueAtTime(900, this.audioContext.currentTime + 0.15);

    gain.gain.setValueAtTime(0.4, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioContext.currentTime + 0.15);
  }

  /**
   * Coin sound: 'Kaching' (523Hz → 1046Hz, 200ms)
   */
  private playCoinSound() {
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(523, this.audioContext.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(1046, this.audioContext.currentTime + 0.1); // C6

    gain.gain.setValueAtTime(0.35, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioContext.currentTime + 0.2);
  }

  /**
   * Click sound: Soft 'blip' (600Hz, 40ms)
   */
  private playClickSound() {
    if (!this.audioContext || !this.masterGain) return;

    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(600, this.audioContext.currentTime);

    gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.audioContext.currentTime + 0.04);
  }

  /**
   * Level up sound: Ascending arpeggio (C-E-G-C, 600ms)
   */
  private playLevelUpSound() {
    if (!this.audioContext || !this.masterGain) return;

    const notes = [523, 659, 784, 1046]; // C5-E5-G5-C6
    const noteDuration = 0.15;

    notes.forEach((freq, i) => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(freq, this.audioContext!.currentTime + i * noteDuration);

      gain.gain.setValueAtTime(0.3, this.audioContext!.currentTime + i * noteDuration);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext!.currentTime + (i + 1) * noteDuration,
      );

      osc.connect(gain);
      gain.connect(this.masterGain!);

      osc.start(this.audioContext!.currentTime + i * noteDuration);
      osc.stop(this.audioContext!.currentTime + (i + 1) * noteDuration);
    });
  }
}

// Singleton instance
export const audioManager = new AudioManager();
