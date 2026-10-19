/**
 * Cinemanik 2026 - Audio Notification Engine for QR Scanners
 * Guaranteed audio playback across normal, fullscreen, and mobile views.
 */

let globalAudioCtx: AudioContext | null = null;
let cachedSuccessAudio: HTMLAudioElement | null = null;
let cachedErrorAudio: HTMLAudioElement | null = null;

function generateWavDataUri(freqs: number[], durationMs: number, waveType: 'sine' | 'sawtooth' = 'sine'): string {
  if (typeof window === 'undefined') return '';
  const sampleRate = 22050;
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // Helper to write ASCII strings
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const durSec = durationMs / 1000;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-3.8 * (t / durSec));
    let sample = 0;
    for (const f of freqs) {
      if (waveType === 'sawtooth') {
        sample += 2 * (t * f - Math.floor(t * f + 0.5));
      } else {
        sample += Math.sin(2 * Math.PI * f * t);
      }
    }
    sample = (sample / freqs.length) * env;
    const val = Math.max(-32768, Math.min(32767, Math.floor(sample * 30000)));
    view.setInt16(44 + i * 2, val, true);
  }

  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:audio/wav;base64,' + btoa(binary);
}

/**
 * Pre-warm and unlock the AudioContext on any user gesture (click, tap, keydown).
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
      globalAudioCtx = new AudioContextClass();
    }
    if (globalAudioCtx.state === 'suspended') {
      globalAudioCtx.resume().catch(() => {});
    }

    // Pre-cache HTMLAudioElements as reliable fallback
    if (!cachedSuccessAudio) {
      const uri = generateWavDataUri([659.25, 880, 1318.51], 350, 'sine');
      cachedSuccessAudio = new Audio(uri);
      cachedSuccessAudio.volume = 0.9;
    }
    if (!cachedErrorAudio) {
      const uri = generateWavDataUri([220, 160], 350, 'sawtooth');
      cachedErrorAudio = new Audio(uri);
      cachedErrorAudio.volume = 0.9;
    }
  } catch (err) {
    console.warn('Audio unlock warning:', err);
  }
}

/**
 * Play cinema scanner chime with automatic WebAudio + HTML5 fallback.
 */
export function playScanSound(isSuccess: boolean = true) {
  if (typeof window === 'undefined') return;

  unlockAudio();

  // Layer 1: Web Audio API Oscillator
  try {
    if (globalAudioCtx && globalAudioCtx.state === 'running') {
      const ctx = globalAudioCtx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (isSuccess) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.setValueAtTime(880.0, now + 0.07);
        osc.frequency.setValueAtTime(1318.51, now + 0.15);
        gain.gain.setValueAtTime(0.75, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        osc.start(now);
        osc.stop(now + 0.42);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(160, now + 0.1);
        gain.gain.setValueAtTime(0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc.start(now);
        osc.stop(now + 0.38);
      }
    } else {
      // Layer 2: Fallback to HTMLAudioElement
      const audioToPlay = isSuccess ? cachedSuccessAudio : cachedErrorAudio;
      if (audioToPlay) {
        audioToPlay.currentTime = 0;
        audioToPlay.play().catch(() => {});
      }
    }
  } catch {
    // If WebAudio throws, fallback to audio element
    const audioToPlay = isSuccess ? cachedSuccessAudio : cachedErrorAudio;
    if (audioToPlay) {
      audioToPlay.currentTime = 0;
      audioToPlay.play().catch(() => {});
    }
  }

  // Layer 3: Haptic feedback on mobile devices
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(isSuccess ? [120, 60, 120] : [260, 80, 260]);
    } catch {}
  }
}
