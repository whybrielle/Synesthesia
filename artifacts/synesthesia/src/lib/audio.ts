import type { Note, Preset } from './music';

const contexts = () => window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
function voice(ctx: BaseAudioContext, destination: AudioNode, note: Note, startAt: number, preset: Preset, volume: number) {
  const gain = ctx.createGain();
  gain.connect(destination);
  const peak = note.strength * volume;
  gain.gain.setValueAtTime(.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(Math.max(.001, peak), startAt + (preset === 'Piano' ? .012 : .035));
  gain.gain.exponentialRampToValueAtTime(.0001, startAt + note.duration * (preset === 'Music box' ? 1.65 : 1));
  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(note.frequency, startAt);
  if (preset === 'Music box') {
    osc.type = 'sine'; osc.connect(gain); osc.start(startAt); osc.stop(startAt + note.duration * 1.7);
    const overtone = ctx.createOscillator(), og = ctx.createGain();
    overtone.type = 'sine'; overtone.frequency.value = note.frequency * 2.76; og.gain.value = .13; overtone.connect(og); og.connect(gain);
    overtone.start(startAt); overtone.stop(startAt + note.duration * 1.4);
  } else {
    osc.type = preset === 'Soft synth' ? 'triangle' : 'triangle';
    osc.connect(gain); osc.start(startAt); osc.stop(startAt + note.duration + .02);
    if (preset === 'Piano') {
      const overtone = ctx.createOscillator(), og = ctx.createGain();
      overtone.type = 'sine'; overtone.frequency.value = note.frequency * 2; og.gain.value = .11;
      overtone.connect(og); og.connect(gain); overtone.start(startAt); overtone.stop(startAt + note.duration);
    }
  }
}

export async function playMelody(notes: Note[], preset: Preset, volume: number, onProgress: (time: number, noteIndex: number) => void) {
  const Constructor = contexts();
  if (!Constructor) throw new Error('Web Audio is not available in this browser.');
  const ctx = new Constructor();
  try { await ctx.resume(); } catch { throw new Error('Audio could not start. Please check your browser audio permissions.'); }
  const masterGain = ctx.createGain();
  masterGain.gain.value = Math.max(0, Math.min(1, volume));
  masterGain.connect(ctx.destination);
  const start = ctx.currentTime + .08;
  notes.forEach((note) => voice(ctx, masterGain, note, start + note.start, preset, 1));
  let raf = 0, stopped = false;
  const sequenceEnd = notes.length ? notes[notes.length - 1].start + notes[notes.length - 1].duration : 0;
  const playbackEnd = notes.length
    ? notes[notes.length - 1].start + notes[notes.length - 1].duration * (preset === 'Music box' ? 1.7 : 1) + .06
    : 0;
  const tick = () => {
    if (stopped) return;
    const time = Math.max(0, ctx.currentTime - start);
    const active = notes.findIndex((n, i) => time >= n.start && time <= n.start + n.duration);
    onProgress(Math.min(time, sequenceEnd), active);
    if (time >= playbackEnd) { onProgress(0, -1); stopped = true; void ctx.close(); return; }
    raf = requestAnimationFrame(tick);
  };
  tick();
  return {
    pause: async () => { await ctx.suspend(); },
    resume: async () => { await ctx.resume(); },
    setVolume: (next: number) => masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, next)), ctx.currentTime, .02),
    stop: () => { stopped = true; cancelAnimationFrame(raf); void ctx.close(); onProgress(0, -1); }
  };
}

export async function exportWav(notes: Note[], preset: Preset, volume: number): Promise<Blob> {
  const Offline = window.OfflineAudioContext || (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error('WAV export is not supported in this browser.');
  const duration = (notes.at(-1)?.start || 0) + (notes.at(-1)?.duration || 0) * 1.8 + .35;
  const sampleRate = 44100;
  const ctx = new Offline(1, Math.ceil(duration * sampleRate), sampleRate);
  notes.forEach(n => voice(ctx, ctx.destination, n, n.start, preset, volume));
  const buffer = await ctx.startRendering();
  const samples = buffer.getChannelData(0);
  const out = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(out);
  const write = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); write(8, 'WAVE'); write(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  return new Blob([out], { type: 'audio/wav' });
}
