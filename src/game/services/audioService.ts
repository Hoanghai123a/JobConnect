/**
 * Audio Service - Centralized sound effect management
 * Handles volume, muting, and audio playback
 */

export type SoundType =
  | "plant"
  | "harvest"
  | "coin"
  | "buy"
  | "levelUp"
  | "questComplete"
  | "click";

interface AudioState {
  enabled: boolean;
  volume: number;
  audioElements: Map<SoundType, HTMLAudioElement>;
}

class AudioServiceClass {
  private state: AudioState = {
    enabled: true,
    volume: 0.5,
    audioElements: new Map(),
  };

  /**
   * Initialize audio elements
   */
  init() {
    // Audio elements will be created on-demand
    // to avoid preloading all sounds at once
  }

  /**
   * Play sound effect
   */
  play(soundType: SoundType) {
    if (!this.state.enabled) return;

    try {
      let audio = this.state.audioElements.get(soundType);

      if (!audio) {
        // Create audio element on first use
        audio = new Audio(`/game-assets/sounds/${soundType}.mp3`);
        audio.volume = this.state.volume;
        this.state.audioElements.set(soundType, audio);
      }

      // Reset and play
      audio.currentTime = 0;
      audio.volume = this.state.volume;
      audio.play().catch((err) => {
        console.warn(`Failed to play sound: ${soundType}`, err);
      });
    } catch (err) {
      console.warn(`Audio error for ${soundType}:`, err);
    }
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number) {
    this.state.volume = Math.max(0, Math.min(1, volume));

    // Update all existing audio elements
    this.state.audioElements.forEach((audio) => {
      audio.volume = this.state.volume;
    });
  }

  /**
   * Toggle audio on/off
   */
  toggle() {
    this.state.enabled = !this.state.enabled;
    return this.state.enabled;
  }

  /**
   * Enable audio
   */
  enable() {
    this.state.enabled = true;
  }

  /**
   * Disable audio
   */
  disable() {
    this.state.enabled = false;

    // Stop all currently playing audio
    this.state.audioElements.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
  }

  /**
   * Get current enabled state
   */
  isEnabled() {
    return this.state.enabled;
  }

  /**
   * Get current volume
   */
  getVolume() {
    return this.state.volume;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.state.audioElements.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    this.state.audioElements.clear();
  }
}

export const AudioService = new AudioServiceClass();
