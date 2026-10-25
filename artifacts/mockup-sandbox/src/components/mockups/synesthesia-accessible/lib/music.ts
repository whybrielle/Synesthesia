export type Preset = 'Piano' | 'Music box' | 'Soft synth';
export type Note = { frequency: number; start: number; duration: number; midi: number; strength: number };
export type Analysis = { average: string; dominant: string; brightness: number; variation: number; texture: number; samples: string[] };
export type Settings = { preset: Preset; key: string; scale: string; tempo: number; interpretation: number };
export type Creation = { id: string; title: string; date: number; image: string; notes: Note[]; settings: Settings; analysis: Analysis };

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
function hue(r: number, g: number, b: number) {
  const [red, green, blue] = [r, g, b].map(value => value / 255);
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
  if (delta === 0) return 0;
  const value = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  return ((value * 60) + 360) % 360;
}

export function analyzeImage(image: HTMLImageElement): Analysis {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Your browser could not read this image. Try another file.');
  canvas.width = 96; canvas.height = 72;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let r = 0, g = 0, b = 0, light = 0, satTotal = 0, edge = 0, edgeCount = 0, count = 0;
  const bins = new Map<string, number>();
  for (let y = 0; y < 72; y += 2) for (let x = 0; x < 96; x += 2) {
    const i = (y * 96 + x) * 4, rr = data[i], gg = data[i + 1], bb = data[i + 2];
    r += rr; g += gg; b += bb; light += (rr * .2126 + gg * .7152 + bb * .0722);
    satTotal += Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
    const bucket = [rr, gg, bb].map(v => Math.round(v / 32) * 32).join(',');
    bins.set(bucket, (bins.get(bucket) || 0) + 1);
    if (x > 0) { const prev = (y * 96 + x - 2) * 4; edge += Math.abs(rr - data[prev]) + Math.abs(gg - data[prev + 1]) + Math.abs(bb - data[prev + 2]); edgeCount++; }
    if (y > 0) { const prev = ((y - 2) * 96 + x) * 4; edge += Math.abs(rr - data[prev]) + Math.abs(gg - data[prev + 1]) + Math.abs(bb - data[prev + 2]); edgeCount++; }
    count++;
  }
  const dominant = [...bins.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
  const samples = Array.from({ length: 8 }, (_, n) => {
    const x = Math.floor((n + .5) * 96 / 8), yy = Math.floor(36), i = (yy * 96 + x) * 4;
    return hex(data[i], data[i + 1], data[i + 2]);
  });
  const entropy = [...bins.values()].reduce((total, amount) => {
    const probability = amount / count;
    return total - probability * Math.log2(probability);
  }, 0);
  const colorDiversity = entropy / Math.log2(729);
  const saturation = satTotal / count / 255;
  return {
    average: hex(r / count, g / count, b / count), dominant: hex(dominant[0], dominant[1], dominant[2]),
    brightness: Math.round(light / count), variation: Math.round(Math.min(1, colorDiversity * .75 + saturation * .25) * 100),
    texture: edgeCount ? Math.round(edge / (edgeCount * 3) / 2.55) : 0, samples
  };
}

const scales: Record<string, number[]> = {
  'C major pentatonic': [0, 2, 4, 7, 9], 'A minor pentatonic': [0, 3, 5, 7, 10], 'C major': [0, 2, 4, 5, 7, 9, 11]
};
const keyMidi: Record<string, number> = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, Bb: 70 };

export function mapMelody(a: Analysis, settings: Settings): Note[] {
  const seedString = `${a.average}${a.dominant}${a.brightness}${a.variation}${a.texture}${settings.key}${settings.scale}${settings.tempo}${settings.interpretation}`;
  let seed = 2166136261;
  for (const c of seedString) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967295; };
  const scale = scales[settings.scale] || scales['C major pentatonic'];
  const complexity = (a.variation * .45 + a.texture * .55) / 100;
  const count = 8 + Math.round(complexity * 8);
  const beat = 60 / settings.tempo;
  const average = a.average.slice(1).match(/../g)?.map(value => parseInt(value, 16)) || [128, 128, 128];
  let last = Math.floor(hue(average[0], average[1], average[2]) / 360 * scale.length);
  const texture = a.texture / 100;
  return Array.from({ length: count }, (_, i) => {
    const color = a.samples[i % a.samples.length].slice(1).match(/../g)?.map(value => parseInt(value, 16)) || [128, 128, 128];
    const light = a.brightness / 255;
    const colorDegree = Math.floor(hue(color[0], color[1], color[2]) / 360 * scale.length);
    const wandering = (random() - .5) * settings.interpretation * (1 + a.variation / 50);
    const colorPull = (colorDegree - Math.floor(scale.length / 2)) * .24;
    const degree = ((Math.round(last + wandering + colorPull) % scale.length) + scale.length) % scale.length;
    last = degree;
    const octave = light > .68 && i % 4 === 0 ? 1 : 0;
    const midi = (keyMidi[settings.key] || 60) + scale[degree] + octave * 12;
    const rhythmicVariation = texture * .18 * (i % 2);
    const duration = beat * [1.12, .82, 1, .94][Math.floor(random() * 4)] * (1.25 - texture * .55);
    return { midi, frequency: 440 * Math.pow(2, (midi - 69) / 12), start: i * beat + rhythmicVariation * beat, duration, strength: .35 + random() * .3 };
  });
}

export const melodyDuration = (notes: Note[]) => notes.length ? notes[notes.length - 1].start + notes[notes.length - 1].duration : 0;
