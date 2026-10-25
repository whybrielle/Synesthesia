import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  AudioWaveform,
  Check,
  ChevronDown,
  Headphones,
  ImagePlus,
  Library,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import "./AccessibleExperience.css";

type View = "studio" | "gallery";
type Direction = "sound-to-photo" | "photo-to-sound";
type Memory = {
  id: string;
  title: string;
  image: string;
  notes: number[];
  instrument: string;
  date: number;
  sample?: boolean;
};

const sceneData = [
  { sky: "#dce8dd", hill: "#718d76", foreground: "#405e4d", sun: "#e7ad71", accent: "#8caa9a" },
  { sky: "#e9dfd5", hill: "#a96f5c", foreground: "#744d50", sun: "#e5b868", accent: "#d7a88b" },
  { sky: "#d9e4e9", hill: "#6d8791", foreground: "#425e68", sun: "#f0c783", accent: "#9bb6bd" },
  { sky: "#e7e0cf", hill: "#a28c61", foreground: "#6d6d4d", sun: "#d78b66", accent: "#c1ad79" },
];

function localIllustration(index: number) {
  const c = sceneData[index % sceneData.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480">
    <rect width="720" height="480" fill="${c.sky}"/>
    <circle cx="${index % 2 ? 540 : 150}" cy="112" r="48" fill="${c.sun}"/>
    <path d="M0 296 Q125 190 258 292 T520 268 T720 270 V480 H0Z" fill="${c.accent}"/>
    <path d="M0 350 Q150 258 303 340 T590 326 T720 320 V480 H0Z" fill="${c.hill}"/>
    <path d="M0 400 Q150 328 310 390 T720 366 V480 H0Z" fill="${c.foreground}"/>
    <path d="M80 480 Q110 400 160 372 Q205 405 225 480M510 480 Q536 412 585 380 Q635 420 654 480" fill="${c.foreground}" opacity=".7"/>
    <path d="M360 480 Q348 390 370 320 Q394 385 390 480" fill="${c.accent}" opacity=".8"/>
    <g fill="${c.sun}" opacity=".88"><circle cx="118" cy="347" r="7"/><circle cx="206" cy="390" r="5"/><circle cx="478" cy="355" r="6"/><circle cx="560" cy="402" r="7"/><circle cx="414" cy="372" r="4"/></g>
    <path d="M66 92 Q109 54 150 92M85 110 Q112 86 138 110" fill="none" stroke="#fffaf0" stroke-width="5" stroke-linecap="round" opacity=".75"/>
    <rect x="20" y="20" width="680" height="440" rx="22" fill="none" stroke="#fffaf0" stroke-opacity=".42" stroke-width="2"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function notesFromSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: 12 }, (_, i) => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return [60, 62, 64, 67, 69, 72][(hash + i * 3) % 6] + (i % 5 === 0 ? 12 : 0);
  });
}

const SAMPLE_MEMORIES: Memory[] = [
  { id: "sample-garden", title: "The garden after rain", image: localIllustration(0), notes: notesFromSeed("garden rain"), instrument: "Piano", date: 1718900000000, sample: true },
  { id: "sample-kite", title: "A red kite afternoon", image: localIllustration(1), notes: notesFromSeed("red kite"), instrument: "Music box", date: 1718800000000, sample: true },
  { id: "sample-lake", title: "Still water at the lake", image: localIllustration(2), notes: notesFromSeed("still lake"), instrument: "Soft synth", date: 1718700000000, sample: true },
  { id: "sample-harvest", title: "Late light in the meadow", image: localIllustration(3), notes: notesFromSeed("late meadow"), instrument: "Piano", date: 1718600000000, sample: true },
];

function loadMemories(): Memory[] {
  if (typeof window === "undefined") return SAMPLE_MEMORIES;
  try {
    const saved = window.localStorage.getItem("synesthesia-accessible-memories");
    if (saved) {
      const parsed = JSON.parse(saved) as Memory[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // The experience remains usable for this visit if local storage is unavailable.
  }
  return SAMPLE_MEMORIES;
}

function playLocalMelody(notes: number[], instrument: string, onFinish?: () => void) {
  let stopped = false;
  let context: AudioContext | null = null;
  let timer = 0;
  try {
    context = new AudioContext();
    const audio = context;
    void audio.resume().catch(() => onFinish?.());
    const duration = instrument === "Music box" ? 0.31 : 0.25;
    const startAt = audio.currentTime + 0.04;
    notes.forEach((midi, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = instrument === "Soft synth" ? "sine" : "triangle";
      oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const at = startAt + index * duration;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration * 0.82);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(at);
      oscillator.stop(at + duration);
    });
    timer = window.setTimeout(() => {
      if (!stopped) onFinish?.();
      void audio.close();
    }, notes.length * duration * 1000 + 100);
  } catch {
    onFinish?.();
  }
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    if (context && context.state !== "closed") void context.close();
    onFinish?.();
  };
}

function makeWav(notes: number[], instrument: string) {
  const sampleRate = 22050;
  const beat = instrument === "Music box" ? 0.34 : 0.28;
  const samples = Math.floor(notes.length * beat * sampleRate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i += 1) {
    const note = notes[Math.min(notes.length - 1, Math.floor(i / (beat * sampleRate)))];
    const hz = 440 * Math.pow(2, (note - 69) / 12);
    const within = (i % Math.floor(beat * sampleRate)) / (beat * sampleRate);
    const envelope = Math.min(1, within * 14) * Math.max(0, 1 - within * 1.7);
    view.setInt16(44 + i * 2, Math.sin((2 * Math.PI * hz * i) / sampleRate) * envelope * 8000, true);
  }
  return new Blob([buffer], { type: "audio/wav" });
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en", { month: "long", day: "numeric" }).format(new Date(value));
}

export function AccessibleExperience() {
  const [view, setView] = useState<View>("studio");
  const [memories, setMemories] = useState<Memory[]>(loadMemories);
  const [selectedImage, setSelectedImage] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [title, setTitle] = useState("");
  const [instrument, setInstrument] = useState("Piano");
  const [pace, setPace] = useState(76);
  const [notes, setNotes] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [oldestFirst, setOldestFirst] = useState(false);
  const [direction, setDirection] = useState<Direction | null>(null);
  const [rounds, setRounds] = useState<{ target: Memory; choices: Memory[] }[]>([]);
  const [round, setRound] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [quizDone, setQuizDone] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Memory | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const confirmDeleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem("synesthesia-accessible-memories", JSON.stringify(memories));
    } catch {
      setStatus("Your browser could not save this collection. You can still explore it during this visit.");
    }
  }, [memories]);

  useEffect(() => () => stopAudioRef.current?.(), []);
  useEffect(() => { if (deleteTarget) cancelDeleteRef.current?.focus(); }, [deleteTarget]);

  const filteredMemories = useMemo(() => memories
    .filter((memory) => memory.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
    .sort((a, b) => oldestFirst ? a.date - b.date : b.date - a.date), [memories, search, oldestFirst]);

  const stopAudio = () => {
    stopAudioRef.current?.();
    stopAudioRef.current = null;
    setPlayingId(null);
  };

  const playNotes = (id: string, soundNotes: number[], soundInstrument: string) => {
    stopAudio();
    setPlayingId(id);
    stopAudioRef.current = playLocalMelody(soundNotes, soundInstrument, () => {
      setPlayingId(null);
      stopAudioRef.current = null;
    });
  };

  const selectSample = (memory: Memory) => {
    setSelectedImage(memory.image);
    setSelectedName(memory.title);
    setTitle(memory.title);
    setNotes([]);
    setSaved(false);
    setStatus(`Sample selected: ${memory.title}.`);
  };

  const chooseFile = (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setStatus("Please choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setStatus("Please choose an image smaller than 12 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result);
      setSelectedImage(data);
      const fileTitle = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
      setSelectedName(file.name);
      setTitle(fileTitle || "A small memory");
      setNotes([]);
      setSaved(false);
      setStatus("Photo ready. It stays on this device.");
    };
    reader.onerror = () => setStatus("We could not read that photo. Please try another one.");
    reader.readAsDataURL(file);
  };

  const createMelody = () => {
    if (!selectedImage) {
      setStatus("First, choose a sample photo or a photo from this device.");
      return;
    }
    setNotes(notesFromSeed(`${selectedImage.slice(0, 180)}-${title}-${instrument}-${pace}`));
    setSaved(false);
    setStatus("Your melody is ready. Play it, adjust it, or save it.");
  };

  const saveMemory = () => {
    if (!selectedImage || notes.length === 0) return;
    const memory: Memory = {
      id: `memory-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      title: title.trim() || "A small memory",
      image: selectedImage,
      notes,
      instrument,
      date: Date.now(),
    };
    setMemories((current) => [memory, ...current]);
    setSaved(true);
    setStatus("Saved in your Gallery on this device only.");
  };

  const downloadMelody = () => {
    if (!notes.length) return;
    const blob = makeWav(notes, instrument);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(title || "photo-melody").trim().replace(/[^\w-]+/g, "-").toLowerCase()}.wav`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    setStatus("Melody downloaded to this device.");
  };

  const beginQuiz = (nextDirection: Direction) => {
    stopAudio();
    const shuffled = [...memories].sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, Math.min(5, shuffled.length));
    setRounds(targets.map((target) => ({
      target,
      choices: [target, ...shuffled.filter((item) => item.id !== target.id).slice(0, Math.min(3, shuffled.length - 1))]
        .sort(() => Math.random() - 0.5),
    })));
    setDirection(nextDirection);
    setRound(0);
    setAnswer(null);
    setScore(0);
    setQuizDone(false);
  };

  const answerQuestion = (id: string) => {
    if (answer || !rounds[round]) return;
    setAnswer(id);
    if (id === rounds[round].target.id) setScore((value) => value + 1);
    stopAudio();
  };

  const advanceQuestion = () => {
    if (round + 1 >= rounds.length) setQuizDone(true);
    else {
      setRound((value) => value + 1);
      setAnswer(null);
    }
  };

  const saveRename = (memory: Memory) => {
    const next = editTitle.trim();
    if (!next) {
      setStatus("Please give this memory a name.");
      return;
    }
    setMemories((current) => current.map((item) => item.id === memory.id ? { ...item, title: next } : item));
    setEditingId(null);
    setStatus("Memory name updated.");
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setMemories((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    setStatus("Memory removed from this device.");
  };

  const currentRound = rounds[round];

  return (
    <div className="syn-a11y">
      <header className="sa-header">
        <div className="sa-brand" aria-label="Synesthesia">
          <span className="sa-brand-mark"><AudioWaveform size={25} aria-hidden="true" /></span>
          <span>synesthesia</span>
        </div>
        <p className="sa-header-note">A photo becomes a little melody.</p>
        <nav className="sa-nav" aria-label="Main navigation">
          <button type="button" aria-current={view === "studio" ? "page" : undefined} onClick={() => { setView("studio"); setDirection(null); }}>
            <Plus aria-hidden="true" /> Studio
          </button>
          <button type="button" aria-current={view === "gallery" ? "page" : undefined} onClick={() => { setView("gallery"); setDirection(null); stopAudio(); }}>
            <Library aria-hidden="true" /> Gallery <span className="sa-nav-count">{memories.length}</span>
          </button>
        </nav>
      </header>

      {view === "studio" ? (
        <main className="sa-main">
          <section className="sa-intro">
            <p className="sa-kicker">MAKE SOMETHING, AT YOUR OWN PACE</p>
            <h1>A photo<br /><em>can become a melody.</em></h1>
            <p className="sa-intro-text">Choose a photo and make a short melody from its colors and light. It stays on this device.</p>
            <div className="sa-local-note"><ShieldCheck size={21} aria-hidden="true" /><span><strong>Your photos stay yours.</strong> Nothing is sent anywhere.</span></div>
          </section>

          <ol className="sa-steps" aria-label="Studio steps">
            <li aria-current={!selectedImage ? "step" : undefined}><span>1</span><div><strong>Choose a photo</strong><small>From a sample or this device</small></div></li>
            <li aria-current={selectedImage && !notes.length ? "step" : undefined}><span>2</span><div><strong>Make a melody</strong><small>Adjust the sound if you like</small></div></li>
            <li aria-current={notes.length ? "step" : undefined}><span>3</span><div><strong>Listen and keep</strong><small>Your choice, every step</small></div></li>
          </ol>

          <div className="sa-studio-grid">
            <section className="sa-panel sa-photo-panel" aria-labelledby="sa-photo-title">
              <div className="sa-panel-heading">
                <span className="sa-step-badge">01</span>
                <div><h2 id="sa-photo-title">Choose a photo</h2><p>Use one of these fictional samples, or choose a photo of your own.</p></div>
              </div>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sa-file-input" aria-label="Choose a photo from this device" tabIndex={-1} onChange={(event) => chooseFile(event.target.files?.[0])} />
              <button type="button" className="sa-button sa-button-outline sa-device-button" onClick={() => inputRef.current?.click()}>
                <ImagePlus aria-hidden="true" /> {selectedImage ? "Choose a different photo" : "Choose a photo from this device"}
              </button>
              <p className="sa-help-text">JPG, PNG or WebP · under 12 MB · stays on this device</p>
              <div className={`sa-photo-preview ${selectedImage ? "has-photo" : ""}`}>
                {selectedImage ? <img src={selectedImage} alt={selectedName ? `Selected photo: ${selectedName}` : "Selected photo"} /> : (
                  <div className="sa-photo-empty">
                    <ImagePlus size={35} aria-hidden="true" />
                    <strong>Your photo will appear here</strong>
                    <span>Choose a sample below or from this device.</span>
                  </div>
                )}
              </div>
              <div className="sa-samples">
                <p className="sa-mini-heading">Or try a sample photo</p>
                <div className="sa-sample-list">
                  {SAMPLE_MEMORIES.slice(0, 3).map((sample) => (
                    <button key={sample.id} type="button" className={`sa-sample ${selectedImage === sample.image ? "is-selected" : ""}`} onClick={() => selectSample(sample)}>
                      <img src={sample.image} alt="" />
                      <span>{sample.title}</span>
                      {selectedImage === sample.image && <span className="sa-sample-selected"><Check size={17} aria-hidden="true" /> Selected</span>}
                    </button>
                  ))}
                </div>
                <p className="sa-fiction-note">Sample illustrations are fictional and stored locally in this mockup.</p>
              </div>
            </section>

            <section className="sa-panel sa-melody-panel" aria-labelledby="sa-melody-title">
              <div className="sa-panel-heading">
                <span className="sa-step-badge">02</span>
                <div><h2 id="sa-melody-title">Shape the sound</h2><p>Start with the gentle default, or try a different sound.</p></div>
              </div>
              <div className="sa-control-group">
                <label htmlFor="sa-instrument">Instrument</label>
                <div className="sa-select-wrap"><select id="sa-instrument" value={instrument} onChange={(event) => { setInstrument(event.target.value); if (notes.length) setNotes(notesFromSeed(`${selectedImage}-${title}-${event.target.value}-${pace}`)); setSaved(false); }}><option>Piano</option><option>Music box</option><option>Soft synth</option></select><ChevronDown aria-hidden="true" /></div>
              </div>
              <div className="sa-control-group sa-pace-control">
                <label htmlFor="sa-pace">Pace <strong>{pace} beats per minute</strong></label>
                <input id="sa-pace" type="range" min="54" max="108" step="1" value={pace} onChange={(event) => { const value = Number(event.target.value); setPace(value); if (notes.length) setNotes(notesFromSeed(`${selectedImage}-${title}-${instrument}-${value}`)); setSaved(false); }} />
                <div className="sa-range-ends"><span>Slower</span><span>Quicker</span></div>
              </div>
              <button type="button" className="sa-button sa-button-primary sa-make-button" onClick={createMelody} disabled={!selectedImage}>
                <Sparkles aria-hidden="true" /> {notes.length ? "Make another version" : "Make my melody"}
              </button>
              {!selectedImage && <p className="sa-inline-hint">Choose a photo first. The button will be ready when you are.</p>}
              <div className={`sa-result ${notes.length ? "is-ready" : ""}`} aria-live="polite">
                {notes.length ? (
                  <>
                    <div className="sa-result-heading"><span className="sa-step-badge">03</span><div><h3>Your melody is ready</h3><p>Listen as often as you like.</p></div></div>
                    <label className="sa-control-group sa-title-control" htmlFor="sa-title">Name this memory<input id="sa-title" value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} /></label>
                    <div className="sa-player">
                      <div className="sa-player-top"><span><AudioLines aria-hidden="true" /> {instrument} melody</span><span>{notes.length} notes</span></div>
                      <div className="sa-wave" aria-label="Visual pattern of the melody" role="img">{notes.map((note, index) => <i key={`${note}-${index}`} style={{ height: `${24 + ((note * 7 + index * 19) % 52)}%` }} />)}</div>
                      <div className="sa-player-actions">
                        <button type="button" className="sa-button sa-button-dark" onClick={() => playingId === "studio" ? stopAudio() : playNotes("studio", notes, instrument)}>
                          {playingId === "studio" ? <><Pause aria-hidden="true" /> Stop melody</> : <><Play aria-hidden="true" /> Play melody</>}
                        </button>
                        <span className="sa-play-hint"><Volume2 aria-hidden="true" /> Sound plays only when you press play.</span>
                      </div>
                    </div>
                    <div className="sa-save-row">
                      <button type="button" className="sa-button sa-button-primary" onClick={saveMemory} disabled={saved}>
                        {saved ? <Check aria-hidden="true" /> : <Library aria-hidden="true" />}{saved ? "Saved in your Gallery" : "Save to my Gallery"}
                      </button>
                      <button type="button" className="sa-button sa-button-outline sa-download" onClick={downloadMelody}>Download audio</button>
                    </div>
                    <p className="sa-privacy-caption"><ShieldCheck size={18} aria-hidden="true" /> Photo and melody are saved only in this browser on this device.</p>
                  </>
                ) : (
                  <div className="sa-waiting">
                    <span className="sa-waiting-art"><i /><i /><i /><i /><i /></span>
                    <div><strong>Your melody will appear here.</strong><span>Nothing starts until you choose to make it.</span></div>
                  </div>
                )}
              </div>
            </section>
          </div>
          <footer className="sa-footer"><ShieldCheck aria-hidden="true" /><span>Private by design: this mockup uses local sample data and does not send photos anywhere.</span></footer>
        </main>
      ) : (
        <main className="sa-main sa-gallery-main">
          <div className="sa-gallery-heading">
            <div><p className="sa-kicker">YOUR OWN LITTLE COLLECTION</p><h1>The Gallery</h1><p className="sa-intro-text">Saved photos and melodies stay together on this device. The sample illustrations are fictional.</p></div>
            <button type="button" className="sa-button sa-button-primary" onClick={() => { setView("studio"); setDirection(null); }}><Plus aria-hidden="true" /> Make a photo melody</button>
          </div>

          <section className="sa-quiz-card" aria-labelledby="sa-quiz-title">
            {direction === null ? (
              <>
                <div className="sa-quiz-intro"><span className="sa-quiz-symbol"><Headphones aria-hidden="true" /></span><div><p className="sa-kicker">A SHARED LISTENING GAME</p><h2 id="sa-quiz-title">Match the sound and the picture</h2><p>Take turns, talk about what you notice, or simply explore together.</p></div></div>
                <div className="sa-quiz-buttons">
                  <button type="button" className="sa-button sa-button-dark" onClick={() => beginQuiz("sound-to-photo")} disabled={memories.length < 2}><AudioLines aria-hidden="true" /> Hear a melody, choose a photo</button>
                  <button type="button" className="sa-button sa-button-outline" onClick={() => beginQuiz("photo-to-sound")} disabled={memories.length < 2}><ImagePlus aria-hidden="true" /> See a photo, choose a melody</button>
                </div>
                {memories.length < 2 && <p className="sa-inline-hint">Save at least two memories to play a matching game.</p>}
              </>
            ) : quizDone ? (
              <div className="sa-quiz-result">
                <span className="sa-quiz-symbol"><Check aria-hidden="true" /></span>
                <div><p className="sa-kicker">THAT WAS THE LAST ROUND</p><h2>Thank you for listening.</h2><p>You matched {score} of {rounds.length} melodies. There is no timer and no score to beat.</p></div>
                <div className="sa-quiz-result-actions">
                  <button type="button" className="sa-button sa-button-dark" onClick={() => beginQuiz(direction)}>Play again</button>
                  <button type="button" className="sa-button sa-button-outline" onClick={() => { setDirection(null); setQuizDone(false); }}>Back to the Gallery</button>
                </div>
              </div>
            ) : currentRound ? (
              <div className="sa-quiz-session">
                <div className="sa-quiz-topline">
                  <div><p className="sa-kicker">{direction === "sound-to-photo" ? "LISTEN, THEN LOOK" : "LOOK, THEN LISTEN"}</p><h2 id="sa-quiz-title">{direction === "sound-to-photo" ? "Which photo belongs with this melody?" : "Which melody came from this photo?"}</h2></div>
                  <button type="button" className="sa-button sa-button-outline sa-end-game" onClick={() => { stopAudio(); setDirection(null); }}>End game</button>
                </div>
                <div className="sa-round-status"><span>Round {round + 1} of {rounds.length}</span><span className="sa-round-track" aria-label={`${round + 1} of ${rounds.length} rounds`}><i style={{ width: `${((round + (answer ? 1 : 0)) / rounds.length) * 100}%` }} /></span><span>Matches: {score}</span></div>
                <div className="sa-question">
                  {direction === "sound-to-photo" ? (
                    <button type="button" className="sa-question-audio" onClick={() => playingId === "quiz-prompt" ? stopAudio() : playNotes("quiz-prompt", currentRound.target.notes, currentRound.target.instrument)}>
                      <span className="sa-question-play">{playingId === "quiz-prompt" ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</span>
                      <span><strong>{playingId === "quiz-prompt" ? "Stop the melody" : "Play the melody"}</strong><small>Listen again whenever you like.</small></span>
                      <AudioLines aria-hidden="true" />
                    </button>
                  ) : <img className="sa-question-photo" src={currentRound.target.image} alt="The photo to match with a melody" />}
                </div>
                <div className={`sa-quiz-choices ${direction === "sound-to-photo" ? "photo-choices" : ""}`} role="group" aria-label={direction === "sound-to-photo" ? "Choose the matching photo" : "Choose the matching melody"}>
                  {currentRound.choices.map((choice, index) => {
                    const correct = choice.id === currentRound.target.id;
                    const chosen = choice.id === answer;
                    const stateLabel = answer ? correct ? " — correct answer" : chosen ? " — your choice" : "" : "";
                    return direction === "sound-to-photo" ? (
                      <button key={choice.id} type="button" className={`sa-photo-choice ${answer && correct ? "is-correct" : ""} ${chosen && !correct ? "is-wrong" : ""}`} onClick={() => answerQuestion(choice.id)} disabled={Boolean(answer)} aria-label={`Photo option ${index + 1}${stateLabel}`}>
                        <img src={choice.image} alt="" /><span>Photo {index + 1}</span>{answer && correct && <b><Check aria-hidden="true" /> Correct answer</b>}
                      </button>
                    ) : (
                      <div key={choice.id} className={`sa-sound-choice ${answer && correct ? "is-correct" : ""} ${chosen && !correct ? "is-wrong" : ""}`}>
                        <span className="sa-choice-letter">Melody {String.fromCharCode(65 + index)}</span>
                        <button type="button" className="sa-button sa-button-outline" onClick={() => playingId === `choice-${choice.id}` ? stopAudio() : playNotes(`choice-${choice.id}`, choice.notes, choice.instrument)} disabled={Boolean(answer)}>
                          {playingId === `choice-${choice.id}` ? <><Pause aria-hidden="true" /> Stop</> : <><Play aria-hidden="true" /> Play melody</>}
                        </button>
                        <button type="button" className="sa-button sa-button-dark" onClick={() => answerQuestion(choice.id)} disabled={Boolean(answer)}>Choose this melody</button>
                        {answer && correct && <span className="sa-answer-label"><Check aria-hidden="true" /> Correct answer</span>}
                      </div>
                    );
                  })}
                </div>
                {answer && <div className="sa-feedback" role="status" aria-live="polite">
                  <p><strong>{answer === currentRound.target.id ? "That is a match." : "A good try."}</strong> The pair was “{currentRound.target.title}”.</p>
                  <button type="button" className="sa-button sa-button-primary" onClick={advanceQuestion}>{round + 1 === rounds.length ? "See the last note" : "Next round"} <RotateCcw aria-hidden="true" /></button>
                </div>}
              </div>
            ) : null}
          </section>

          {direction === null && <>
            <div className="sa-gallery-tools">
              <label className="sa-search"><Search aria-hidden="true" /><span className="sa-sr-only">Search Gallery</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search your memories" /></label>
              <button type="button" className="sa-button sa-button-outline sa-sort" onClick={() => setOldestFirst((value) => !value)}><span>{oldestFirst ? "Oldest first" : "Newest first"}</span><ChevronDown aria-hidden="true" /></button>
            </div>
            <div className="sa-gallery-count" aria-live="polite">{filteredMemories.length} {filteredMemories.length === 1 ? "memory" : "memories"}</div>
            {filteredMemories.length ? <div className="sa-memory-grid">
              {filteredMemories.map((memory) => (
                <article className="sa-memory-card" key={memory.id}>
                  <img className="sa-memory-image" src={memory.image} alt={`${memory.title}${memory.sample ? ", fictional sample illustration" : ""}`} />
                  <div className="sa-memory-body">
                    {editingId === memory.id ? (
                      <div className="sa-edit-title"><label htmlFor={`edit-${memory.id}`}>Memory name</label><input id={`edit-${memory.id}`} value={editTitle} onChange={(event) => setEditTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveRename(memory); if (event.key === "Escape") setEditingId(null); }} /><div><button type="button" className="sa-button sa-button-dark" onClick={() => saveRename(memory)}>Save name</button><button type="button" className="sa-button sa-button-outline" onClick={() => setEditingId(null)}>Cancel</button></div></div>
                    ) : <div className="sa-memory-title-row"><div><h3>{memory.title}</h3><p>{memory.sample ? "Fictional sample · " : ""}{formatDate(memory.date)}</p></div><button type="button" className="sa-button sa-button-outline sa-card-play" onClick={() => playingId === memory.id ? stopAudio() : playNotes(memory.id, memory.notes, memory.instrument)}>{playingId === memory.id ? <><Pause aria-hidden="true" /> Stop</> : <><Play aria-hidden="true" /> Play</>}</button></div>}
                    <div className="sa-memory-meta"><span>{memory.instrument}</span><span>{memory.notes.length} notes</span></div>
                    <div className="sa-card-actions">
                      <button type="button" onClick={() => { setEditingId(memory.id); setEditTitle(memory.title); }}>Rename memory</button>
                      <button type="button" onClick={() => setDeleteTarget(memory)}><Trash2 aria-hidden="true" /> Remove</button>
                    </div>
                  </div>
                </article>
              ))}
            </div> : <div className="sa-empty-gallery"><Library aria-hidden="true" /><h2>No memories found</h2><p>Try another search, or make a new photo melody in Studio.</p><button type="button" className="sa-button sa-button-primary" onClick={() => { setSearch(""); setView("studio"); }}>Go to Studio</button></div>}
            <p className="sa-gallery-privacy"><ShieldCheck aria-hidden="true" /> Your Gallery is saved only in this browser on this device.</p>
          </>}
        </main>
      )}

      {status && <div className="sa-status" role="status" aria-live="polite"><span>{status}</span><button type="button" onClick={() => setStatus("")} aria-label="Dismiss message"><X aria-hidden="true" /></button></div>}

      {deleteTarget && <div className="sa-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
        <section className="sa-confirm" role="alertdialog" aria-modal="true" aria-labelledby="sa-delete-title" aria-describedby="sa-delete-copy" onKeyDown={(event) => {
          if (event.key === "Escape") { setDeleteTarget(null); return; }
          if (event.key === "Tab" && event.shiftKey && document.activeElement === cancelDeleteRef.current) { event.preventDefault(); confirmDeleteRef.current?.focus(); }
          else if (event.key === "Tab" && !event.shiftKey && document.activeElement === confirmDeleteRef.current) { event.preventDefault(); cancelDeleteRef.current?.focus(); }
        }}>
          <p className="sa-kicker">REMOVE FROM THIS DEVICE</p>
          <h2 id="sa-delete-title">Remove “{deleteTarget.title}”?</h2>
          <p id="sa-delete-copy">Its saved photo and melody will be removed from this Gallery. This cannot be undone.</p>
          <div><button ref={cancelDeleteRef} type="button" className="sa-button sa-button-outline" onClick={() => setDeleteTarget(null)}>Keep memory</button><button ref={confirmDeleteRef} type="button" className="sa-button sa-button-danger" onClick={confirmDelete}>Remove memory</button></div>
        </section>
      </div>}
    </div>
  );
}
