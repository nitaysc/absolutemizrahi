// Sound effects using Web Audio API for task completion and unlock animations

class SoundEffectsManager {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  // Task completion sound - pleasant ascending chime
  playTaskComplete() {
    if (!this.enabled) return;
    
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Main tone
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(783.99, now + 0.1); // G5
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.3);

      // Harmonic
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(880, now + 0.05); // A5
      osc2.frequency.setValueAtTime(1046.5, now + 0.15); // C6
      gain2.gain.setValueAtTime(0.15, now + 0.05);
      gain2.gain.setValueAtTime(0.01, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.05);
      osc2.stop(now + 0.35);
    } catch (e) {
      console.warn("Sound effect failed:", e);
    }
  }

  // Task uncomplete sound - descending tone
  playTaskUncomplete() {
    if (!this.enabled) return;
    
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(392, now + 0.15); // G4
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.setValueAtTime(0.01, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (e) {
      console.warn("Sound effect failed:", e);
    }
  }

  // Lock break sound - dramatic shatter effect
  playLockBreak() {
    if (!this.enabled) return;
    
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Impact bass
      const bass = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bass.type = "sine";
      bass.frequency.setValueAtTime(80, now);
      bass.frequency.setValueAtTime(40, now + 0.2);
      bassGain.gain.setValueAtTime(0.4, now);
      bassGain.gain.setValueAtTime(0.01, now + 0.3);
      bass.connect(bassGain);
      bassGain.connect(ctx.destination);
      bass.start(now);
      bass.stop(now + 0.3);

      // Shatter noise burst
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.15));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = "highpass";
      noiseFilter.frequency.setValueAtTime(2000, now);
      noiseFilter.frequency.setValueAtTime(8000, now + 0.2);
      
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, now);
      noiseGain.gain.setValueAtTime(0.01, now + 0.4);
      
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);

      // Victory chime after break
      setTimeout(() => {
        const chime = ctx.createOscillator();
        const chimeGain = ctx.createGain();
        chime.type = "sine";
        chime.frequency.setValueAtTime(698.46, ctx.currentTime); // F5
        chime.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
        chime.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.2); // C6
        chimeGain.gain.setValueAtTime(0.25, ctx.currentTime);
        chimeGain.gain.setValueAtTime(0.01, ctx.currentTime + 0.5);
        chime.connect(chimeGain);
        chimeGain.connect(ctx.destination);
        chime.start(ctx.currentTime);
        chime.stop(ctx.currentTime + 0.5);
      }, 300);
    } catch (e) {
      console.warn("Sound effect failed:", e);
    }
  }
}

export const soundEffects = new SoundEffectsManager();

export function useSoundEffects() {
  return soundEffects;
}
