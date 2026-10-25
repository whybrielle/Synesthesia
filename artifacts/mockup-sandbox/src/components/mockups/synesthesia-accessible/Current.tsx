import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { AnchorHTMLAttributes } from 'react';
import { AudioLines, ArrowLeft, ArrowRight, AudioWaveform, Check, ChevronDown, CircleHelp, Clock3, Disc3, Download, FileAudio2, Headphones, ImagePlus, Library, LoaderCircle, Music2, Pause, Play, Plus, RotateCcw, Search, SlidersHorizontal, Sparkles, Trash2, Trophy, Upload, Volume2, X } from 'lucide-react';
import { analyzeImage, mapMelody, melodyDuration, type Analysis, type Creation, type Note, type Preset, type Settings } from './lib/music';
import { allCreations, deleteCreation, getCreation, saveCreation } from './lib/storage';
import { exportWav, playMelody } from './lib/audio';
import './_group.css';

const initialSettings: Settings = { preset: 'Piano', key: 'C', scale: 'C major pentatonic', tempo: 76, interpretation: 1 };
const MAX_IMAGE = 12 * 1024 * 1024;
const prettyTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const localId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const NavigationContext = createContext<[string, (to: string) => void] | null>(null);
function useLocation() {
  const location = useContext(NavigationContext);
  if (!location) throw new Error('Navigation is unavailable in this preview.');
  return location;
}
function useRoute(pattern: string): [boolean, Record<string, string> | null] {
  const [path] = useLocation();
  const matcher = new RegExp(`^${pattern.replace(':id', '([^/]+)')}$`);
  const match = path.match(matcher);
  return [Boolean(match), match ? { id: decodeURIComponent(match[1]) } : null];
}
function Link({ href, children, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [, navigate] = useLocation();
  return <a href={href} {...props} onClick={event => { onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); navigate(href); } }}>{children}</a>;
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadImage(data: string, title: string) {
  const ext = data.slice(0, 30).includes('image/png') ? 'png' : data.slice(0, 30).includes('image/webp') ? 'webp' : 'jpg';
  const a = document.createElement('a'); a.href = data; a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase()}-photo.${ext}`; a.click();
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please try again.'; }

function Header() {
  const [path] = useLocation();
  return <header className="topbar">
    <Link href="/" className="brand" data-testid="link-home"><span className="brand-mark"><AudioWaveform size={19} strokeWidth={1.8}/></span><span>synesthesia</span><span className="brand-dot">.</span></Link>
    <div className="top-note"><span className="privacy-dot"/>A little music, made from your memories</div>
    <nav className="top-nav" aria-label="Main navigation">
      <Link href="/" className={`nav-link ${path === '/' ? 'selected' : ''}`} data-testid="link-studio"><Plus size={15}/> Studio</Link>
      <Link href="/gallery" className={`nav-link ${path === '/gallery' || path.startsWith('/creation') ? 'selected' : ''}`} data-testid="link-gallery"><Library size={15}/> Gallery</Link>
    </nav>
  </header>;
}

function Notice({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return <div className="notice" role="alert" data-testid="status-message"><span>{message}</span><button onClick={onClose} aria-label="Dismiss message" data-testid="button-dismiss-message"><X size={16}/></button></div>;
}

function useMelodyPlayer() {
  const [playing, setPlaying] = useState(false), [paused, setPaused] = useState(false), [progress, setProgress] = useState(0), [active, setActive] = useState(-1);
  const [volume, setVolume] = useState(.55);
  const controlRef = useRef<null | Awaited<ReturnType<typeof playMelody>>>(null);
  const stop = useCallback(() => { controlRef.current?.stop(); controlRef.current = null; setPlaying(false); setPaused(false); setProgress(0); setActive(-1); }, []);
  useEffect(() => () => { controlRef.current?.stop(); }, []);
  useEffect(() => { controlRef.current?.setVolume(volume); }, [volume]);
  const play = useCallback(async (notes: Note[], preset: Preset) => {
    controlRef.current?.stop(); controlRef.current = null; setPaused(false); setPlaying(true);
    try {
      const cancel = await playMelody(notes, preset, volume, (time, index) => {
        setProgress(time); setActive(index);
        if (time === 0 && index === -1) { controlRef.current = null; setPlaying(false); setPaused(false); }
      });
      controlRef.current = cancel;
    } catch (e) { setPlaying(false); setPaused(false); throw e; }
  }, [volume]);
  const toggle = useCallback(async (notes: Note[], preset: Preset) => {
    if (playing && controlRef.current) { await controlRef.current.pause(); setPlaying(false); setPaused(true); return; }
    if (paused && controlRef.current) { await controlRef.current.resume(); setPaused(false); setPlaying(true); return; }
    await play(notes, preset);
  }, [playing, paused, play]);
  const replay = useCallback(async (notes: Note[], preset: Preset) => {
    controlRef.current?.stop();
    controlRef.current = null;
    setPaused(false);
    await play(notes, preset);
  }, [play]);
  return { playing, paused, progress, active, volume, setVolume, toggle, replay, stop };
}

function Waveform({ notes, active, playing }: { notes: Note[]; active: number; playing: boolean }) {
  return <div className={`sound-wave ${playing ? 'is-playing' : ''}`} aria-label="Melody note visualization" role="img" data-testid="visualizer-melody">
    {notes.map((note, i) => <span key={i} className={active === i ? 'note-active' : ''} style={{ height: `${20 + ((note.midi * 17 + i * 13) % 70)}%`, opacity: active === i ? 1 : .38 + note.strength * .55 }} />)}
  </div>;
}

function Player({ notes, preset, onPreset, title, autoPlay = false }: { notes: Note[]; preset: Preset; onPreset?: (p: Preset) => void; title: string; autoPlay?: boolean }) {
  const player = useMelodyPlayer();
  const duration = melodyDuration(notes);
  const clickPlay = async () => {
    try { await player.toggle(notes, preset); } catch (e) { window.alert(errorMessage(e)); }
  };
  const clickReplay = async () => {
    try { await player.replay(notes, preset); } catch (e) { window.alert(errorMessage(e)); }
  };
  useEffect(() => { if (autoPlay) void clickPlay(); }, [autoPlay]);
  return <section className="player" aria-label="Melody player">
    <div className="player-top"><div className="player-title"><span className="mini-disc"><Disc3 size={17}/></span><div><small>YOUR MEMORY, IN NOTES</small><strong data-testid="text-melody-title">{title || 'An untitled memory'}</strong></div></div>
      {onPreset ? <label className="preset-select">Sound<select aria-label="Choose instrument preset" data-testid="select-preset" value={preset} onChange={e => { player.stop(); onPreset(e.target.value as Preset); }}><option>Piano</option><option>Music box</option><option>Soft synth</option></select><ChevronDown size={14}/></label> : <span className="preset-tag">{preset}</span>}
    </div>
    <Waveform notes={notes} active={player.active} playing={player.playing}/>
    <div className="player-controls">
      <button className="play-button" onClick={clickPlay} aria-label={player.playing ? 'Pause melody' : player.paused ? 'Resume melody' : 'Play melody'} data-testid="button-play-melody">{player.playing ? <Pause size={18} fill="currentColor"/> : <Play size={18} fill="currentColor"/>}</button>
      <button className="replay-button" onClick={clickReplay} aria-label="Replay melody from the beginning" title="Replay from the beginning" data-testid="button-replay-melody"><RotateCcw size={15}/></button>
      <div className="timeline"><div className="time-label"><span>{prettyTime(player.progress)}</span><span>{prettyTime(duration)}</span></div><div className="progress-track"><div style={{ width: `${duration ? Math.min(100, player.progress / duration * 100) : 0}%` }}/></div></div>
      <label className="volume-control" aria-label="Playback volume"><Volume2 size={17}/><input className="range" type="range" min="0" max="1" step=".01" value={player.volume} onChange={e => player.setVolume(Number(e.target.value))} aria-label="Volume" data-testid="input-volume"/></label>
    </div>
  </section>;
}

function SelectField({ label, value, values, onChange, testid }: { label: string; value: string; values: string[]; onChange: (v: string) => void; testid: string }) {
  return <label className="field-label">{label}<span className="select-wrap"><select value={value} onChange={e => onChange(e.target.value)} data-testid={testid}>{values.map(v => <option key={v}>{v}</option>)}</select><ChevronDown size={14}/></span></label>;
}

function Studio() {
  const [file, setFile] = useState<File | null>(null), [imageData, setImageData] = useState(''), [preview, setPreview] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null), [notes, setNotes] = useState<Note[]>([]);
  const [settings, setSettings] = useState<Settings>(initialSettings), [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false), [drag, setDrag] = useState(false), [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateSettings = (partial: Partial<Settings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    if (analysis && notes.length) { setNotes(mapMelody(analysis, next)); setSaved(false); }
  };

  const load = (f?: File) => {
    if (!f) return;
    setNotice('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { setNotice('Choose a JPG, PNG or WebP image.'); return; }
    if (f.size > MAX_IMAGE) { setNotice('That image is a little large. Please choose a file under 12 MB.'); return; }
    setBusy(true); setFile(f); setAnalysis(null); setNotes([]); setSaved(false);
    const reader = new FileReader();
    reader.onerror = () => { setBusy(false); setNotice('We couldn’t read that file. Please try another image.'); };
    reader.onload = () => {
      const data = String(reader.result), img = new Image();
      img.onload = () => {
        try {
          const result = analyzeImage(img);
          setImageData(data); setPreview(data); setAnalysis(result); setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')); setBusy(false);
        } catch (e) { setBusy(false); setNotice(errorMessage(e)); }
      };
      img.onerror = () => { setBusy(false); setNotice('This image could not be decoded. Try a different JPG, PNG or WebP.'); };
      img.src = data;
    };
    reader.readAsDataURL(f);
  };
  const generate = () => {
    if (!analysis) return;
    setBusy(true); window.setTimeout(() => { setNotes(mapMelody(analysis, settings)); setBusy(false); }, 420);
  };
  const save = async () => {
    if (!notes.length || !imageData || !analysis) return;
    const creation: Creation = { id: localId(), title: title.trim() || 'A small memory', date: Date.now(), image: imageData, notes, settings, analysis };
    setBusy(true);
    try { await saveCreation(creation); setSaved(true); setNotice('Saved privately on this device.'); }
    catch (e) { setNotice(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const downloadMelody = async () => {
    if (!notes.length) return;
    try { downloadBlob(await exportWav(notes, settings.preset, .55), `${title.trim() || 'memory-melody'}.wav`); }
    catch (e) { setNotice(errorMessage(e)); }
  };
  const canRegenerate = Boolean(analysis);
  return <main className="studio-page page-width">
     <div className="hero-copy fade-up"><div className="eyebrow"><span className="eyebrow-line"/>A SMALL INSTRUMENT FOR REMEMBERING</div><h1>Every picture<br/>has <em>a sound.</em></h1><p>Bring a photograph. We’ll listen to its colors, its light, its little details — and turn them into a melody only you can hear.</p></div>
    <div className="studio-layout fade-up">
      <section className="photo-column">
        <div className="section-heading"><span className="step-number">01</span><div><h2>Choose a memory</h2><p>One image, kept entirely on this device.</p></div></div>
        <div className={`upload-card ${drag ? 'dragging' : ''} ${preview ? 'has-image' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); load(e.dataTransfer.files[0]); }} data-testid="drop-image">
          {preview ? <><img src={preview} alt="Selected memory preview" className="photo-preview" data-testid="img-preview"/><div className="photo-overlay"><button onClick={() => inputRef.current?.click()} className="replace-photo" data-testid="button-replace-image"><ImagePlus size={15}/> Replace image</button><span>{file?.name}</span></div></> :
            <button className="upload-prompt" onClick={() => inputRef.current?.click()} data-testid="button-upload-image"><span className="upload-glyph"><Upload size={23}/></span><strong>Drop a photo here</strong><span>or <u>choose from your device</u></span><small>JPG, PNG or WebP · up to 12 MB</small></button>}
          {busy && !analysis && <div className="image-loading"><LoaderCircle className="spin" size={22}/> Reading the light...</div>}
        </div>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose an image" data-testid="input-image" onChange={e => load(e.target.files?.[0])}/>
        {analysis && <div className="analysis-card fade-up" data-testid="panel-image-analysis">
          <div className="analysis-title"><span className="analysis-orb"><Sparkles size={14}/></span><div><strong>First impressions</strong><small>A little color study of your photo</small></div></div>
          <div className="color-strip">{analysis.samples.map((color, i) => <span key={i} title={color} style={{ backgroundColor: color }}/>)}</div>
          <div className="analysis-stats"><div><small>AVERAGE COLOR</small><strong><i style={{ background: analysis.average }}/>{analysis.average}</strong></div><div><small>LIGHT</small><strong>{analysis.brightness < 90 ? 'Dusky' : analysis.brightness > 180 ? 'Sunlit' : 'Soft'} <b>{analysis.brightness}/255</b></strong></div><div><small>DETAIL</small><strong>{analysis.texture > 48 ? 'Textured' : 'Gentle'} <b>{analysis.texture}%</b></strong></div></div>
        </div>}
      </section>
      <section className="music-column">
        <div className="section-heading"><span className="step-number">02</span><div><h2>Find its melody</h2><p>Shape the feeling, then listen.</p></div></div>
        <div className="settings-card">
          <div className="setting-intro"><span className="setting-mark"><Music2 size={17}/></span><div><strong>Set the feeling</strong><small>The same photo and settings always make the same notes.</small></div></div>
          <div className="form-row"><SelectField label="Scale" value={settings.scale} values={['C major pentatonic', 'A minor pentatonic', 'C major']} onChange={v => updateSettings({ scale: v })} testid="select-scale"/><SelectField label="Home note" value={settings.key} values={['C', 'D', 'E', 'F', 'G', 'A', 'Bb']} onChange={v => updateSettings({ key: v })} testid="select-key"/></div>
          <div className="instrument-row"><SelectField label="Instrument" value={settings.preset} values={['Piano', 'Music box', 'Soft synth']} onChange={v => updateSettings({ preset: v as Preset })} testid="select-instrument"/></div>
          <label className="field-label tempo-field">Pace <span className="tempo-value">{settings.tempo} <small>BPM</small></span><input type="range" className="range pace-range" min="54" max="108" step="1" value={settings.tempo} onChange={e => updateSettings({ tempo: Number(e.target.value) })} aria-label="Melody pace" data-testid="input-tempo"/></label>
          <label className="field-label interpretation-field">Interpretation <span className="interpret-hint">More wandering</span><input type="range" className="range pace-range" min="0" max="3" step="1" value={settings.interpretation} onChange={e => updateSettings({ interpretation: Number(e.target.value) })} aria-label="Melody interpretation" data-testid="input-interpretation"/></label>
          <button className="generate-button" disabled={!canRegenerate || busy} onClick={generate} data-testid="button-generate"><Sparkles size={16}/>{busy ? 'Listening closely…' : notes.length ? 'Find another interpretation' : 'Make a melody'}<ArrowRight size={16}/></button>
        </div>
        {notes.length > 0 ? <div className="result-area fade-up">
          <div className="result-name"><span className="step-number">03</span><label><span>Give it a name</span><input value={title} onChange={e => { setTitle(e.target.value); setSaved(false); }} placeholder="A small memory" aria-label="Melody title" data-testid="input-title"/></label><span className="note-count">{notes.length} NOTES</span></div>
          <Player notes={notes} preset={settings.preset} title={title}/>
           <div className="creation-actions">
              <button className={`save-button ${saved ? 'is-saved' : ''}`} onClick={save} disabled={busy || saved} data-testid="button-save"><span>{saved ? <Check size={17}/> : <Library size={17}/>}</span>{saved ? 'Saved to your Gallery' : 'Keep this memory'}<ArrowRight size={16}/></button>
             <button className="download-button" onClick={() => void downloadMelody()} aria-label="Download melody as WAV" data-testid="button-download-wav"><Download size={16}/><span>WAV</span></button>
           </div>
          <p className="save-caption"><Disc3 size={13}/> Stored only in this browser, never uploaded.</p>
        </div> : <div className="waiting-card"><span className="waiting-art"><span/><span/><span/><span/><span/></span><p>Your melody will appear here<br/>when you’re ready.</p></div>}
      </section>
    </div>
    <div className="studio-foot"><span><CircleHelp size={14}/> Nothing leaves your device.</span><span>Made for the moments you want to keep.</span></div>
    <Notice message={notice} onClose={() => setNotice('')}/>
  </main>;
}

type QuizDirection = 'melody-photo' | 'photo-melody';
type QuizRound = { target: Creation; choices: Creation[] };

function GalleryPage() {
  const [items, setItems] = useState<Creation[]>([]), [query, setQuery] = useState(''), [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [notice, setNotice] = useState(''), [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<Creation | null>(null);
  const [direction, setDirection] = useState<QuizDirection | null>(null);
  const [rounds, setRounds] = useState<QuizRound[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [answerId, setAnswerId] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [quizState, setQuizState] = useState<'idle' | 'playing' | 'complete'>('idle');
  const [quizPlaying, setQuizPlaying] = useState<string | null>(null);
  const [quizPaused, setQuizPaused] = useState<string | null>(null);
  const quizControl = useRef<null | Awaited<ReturnType<typeof playMelody>>>(null);
  const quizToken = useRef(0);
  const loadItems = useCallback(async () => { setLoading(true); try { setItems(await allCreations()); } catch (e) { setNotice(errorMessage(e)); } finally { setLoading(false); } }, []);
  useEffect(() => { void loadItems(); }, [loadItems]);
  const stopQuizAudio = useCallback(() => {
    quizToken.current += 1;
    quizControl.current?.stop();
    quizControl.current = null;
    setQuizPlaying(null);
    setQuizPaused(null);
  }, []);
  useEffect(() => () => { quizToken.current += 1; quizControl.current?.stop(); }, []);
  const filtered = useMemo(() => items.filter(i => i.title.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'newest' ? b.date - a.date : a.date - b.date), [items, query, sort]);
  const rename = async (item: Creation) => {
    const value = window.prompt('Give this memory a name', item.title);
    if (value === null) return;
    if (!value.trim()) { setNotice('A memory needs a name.'); return; }
    try { const updated = { ...item, title: value.trim() }; await saveCreation(updated); setItems(await allCreations()); if (player?.id === item.id) setPlayer(updated); }
    catch (e) { setNotice(errorMessage(e)); }
  };
  const remove = async (item: Creation) => {
    if (!window.confirm(`Delete “${item.title}” and its saved photo? This cannot be undone.`)) return;
    try { await deleteCreation(item.id); setItems(list => list.filter(x => x.id !== item.id)); if (player?.id === item.id) setPlayer(null); }
    catch (e) { setNotice(errorMessage(e)); }
  };
  const play = (item: Creation) => { stopQuizAudio(); setPlayer(item); };
  const sortedToggle = () => setSort(s => s === 'newest' ? 'oldest' : 'newest');
  const shuffle = <T,>(values: T[]) => [...values].sort(() => Math.random() - .5);
  const beginQuiz = (nextDirection: QuizDirection) => {
    stopQuizAudio();
    setDirection(nextDirection);
    setAnswerId(null);
    setScore(0);
    setRoundIndex(0);
    setPlayer(null);
    if (items.length < 2) { setQuizState('idle'); return; }
    const targets = shuffle(items).slice(0, Math.min(5, items.length));
    setRounds(targets.map(target => ({ target, choices: shuffle([target, ...shuffle(items.filter(item => item.id !== target.id)).slice(0, Math.min(3, items.length - 1))]) })));
    setQuizState('playing');
  };
  const playQuizMelody = async (item: Creation, key: string) => {
    stopQuizAudio();
    const token = quizToken.current;
    setQuizPlaying(key);
    try {
      const control = await playMelody(item.notes, item.settings.preset, .55, (time, index) => {
        if (time === 0 && index === -1 && quizToken.current === token) {
          quizControl.current = null;
          setQuizPlaying(null);
          setQuizPaused(null);
        }
      });
      if (quizToken.current === token) quizControl.current = control;
      else control.stop();
    } catch (error) {
      if (quizToken.current === token) { setQuizPlaying(null); setQuizPaused(null); setNotice(errorMessage(error)); }
    }
  };
  const toggleQuizMelody = async (item: Creation, key: string) => {
    try {
      if (quizPlaying === key && quizControl.current) {
        await quizControl.current.pause();
        setQuizPlaying(null);
        setQuizPaused(key);
        return;
      }
      if (quizPaused === key && quizControl.current) {
        await quizControl.current.resume();
        setQuizPaused(null);
        setQuizPlaying(key);
        return;
      }
      await playQuizMelody(item, key);
    } catch (error) {
      stopQuizAudio();
      setNotice(errorMessage(error));
    }
  };
  const answerQuiz = (id: string) => {
    if (answerId || !rounds[roundIndex]) return;
    stopQuizAudio();
    setAnswerId(id);
    if (id === rounds[roundIndex].target.id) setScore(value => value + 1);
  };
  const nextQuizRound = () => {
    stopQuizAudio();
    setAnswerId(null);
    if (roundIndex + 1 >= rounds.length) setQuizState('complete');
    else setRoundIndex(index => index + 1);
  };
  const currentRound = rounds[roundIndex];
  return <main className="library-page page-width fade-up">
    <div className="library-heading"><div><div className="eyebrow"><span className="eyebrow-line"/>YOUR PRIVATE COLLECTION</div><h1>The <em>Gallery.</em></h1><p>A collection of images, each with a melody held in its colors.</p></div><Link href="/" className="new-memory" data-testid="button-new-memory"><Plus size={17}/> Make a new memory</Link></div>
    <section className="quiz-entry" aria-label="Memory quiz">
      <div className="quiz-entry-copy"><span className="quiz-entry-icon"><Headphones size={18}/></span><div><span className="catalog-label">A LITTLE GAME OF RECOGNITION</span><h2>Can you find the memory in the music?</h2><p>Play a private matching game with the photographs and melodies you’ve kept here.</p></div></div>
      {quizState === 'idle' ? <div className="quiz-directions">
        <button className="quiz-start-button" onClick={() => beginQuiz('melody-photo')} disabled={items.length < 2} data-testid="button-quiz-melody-to-photo"><Play size={15} fill="currentColor"/> Hear a melody <ArrowRight size={15}/><span>choose its photo</span></button>
        <button className="quiz-start-button secondary" onClick={() => beginQuiz('photo-melody')} disabled={items.length < 2} data-testid="button-quiz-photo-to-melody"><ImagePlus size={15}/><span>See a photo</span><ArrowRight size={15}/> choose its melody</button>
        {items.length < 2 && !loading && <p className="quiz-requirement" data-testid="text-quiz-requirement">Save at least two photo melodies to play. <Link href="/" data-testid="link-quiz-create">Make a photo melody <ArrowRight size={13}/></Link></p>}
      </div> : quizState === 'playing' && currentRound && direction ? <div className="quiz-session" data-testid="panel-quiz-session">
        <div className="quiz-session-top"><span className="catalog-label">{direction === 'melody-photo' ? 'LISTEN, THEN LOOK' : 'LOOK, THEN LISTEN'}</span><span className="quiz-progress" data-testid="text-quiz-progress">ROUND {String(roundIndex + 1).padStart(2, '0')} <i/> {String(rounds.length).padStart(2, '0')}</span><button className="quiz-exit" onClick={() => { stopQuizAudio(); setQuizState('idle'); setDirection(null); }} data-testid="button-quiz-exit">End game <X size={14}/></button></div>
        <div className="quiz-scoreline"><span>Score <strong data-testid="text-quiz-score">{score}</strong></span><div className="quiz-progress-track"><span style={{ width: `${((roundIndex + (answerId ? 1 : 0)) / rounds.length) * 100}%` }}/></div></div>
        <div className="quiz-prompt">
          {direction === 'melody-photo' ? <><span className="quiz-prompt-kicker">WHICH PHOTOGRAPH HOLDS THIS SOUND?</span><button className={`quiz-listen ${quizPlaying === 'prompt' ? 'is-playing' : ''}`} onClick={() => void toggleQuizMelody(currentRound.target, 'prompt')} aria-label={quizPlaying === 'prompt' ? 'Pause melody' : quizPaused === 'prompt' ? 'Resume melody' : 'Play the melody'} data-testid="button-quiz-play-prompt"><span className="quiz-listen-mark">{quizPlaying === 'prompt' ? <Pause size={20} fill="currentColor"/> : <Play size={20} fill="currentColor"/>}</span><span><strong>{quizPlaying === 'prompt' ? 'Listening…' : quizPaused === 'prompt' ? 'Paused' : 'Play the melody'}</strong><small>One of your saved photo melodies</small></span><AudioLines size={21}/></button></> :
          <><span className="quiz-prompt-kicker">WHICH MELODY WAS MADE FROM THIS PHOTO?</span><img className="quiz-question-image" src={currentRound.target.image} alt="Mystery photograph for this round" data-testid="img-quiz-question"/></>}
        </div>
        <div className={`quiz-choices ${direction === 'melody-photo' ? 'image-choices' : 'sound-choices'}`} role="group" aria-label={direction === 'melody-photo' ? 'Choose the matching photograph' : 'Choose the matching melody'} data-testid="quiz-choices">
          {currentRound.choices.map((choice, index) => {
            const isCorrect = choice.id === currentRound.target.id;
            const selected = answerId === choice.id;
            const revealed = Boolean(answerId);
            return direction === 'melody-photo' ?
              <button key={choice.id} className={`quiz-image-choice ${revealed && isCorrect ? 'correct' : ''} ${selected && !isCorrect ? 'incorrect' : ''}`} onClick={() => answerQuiz(choice.id)} disabled={revealed} aria-label={`Photograph option ${index + 1}${revealed && isCorrect ? ', correct answer' : ''}`} data-testid={`button-quiz-image-choice-${index + 1}`}>
                <img src={choice.image} alt={`Photograph option ${index + 1}`} />{revealed && isCorrect && <span className="quiz-correct-mark"><Check size={15}/></span>}<span className="quiz-choice-index">{String(index + 1).padStart(2, '0')}</span>
              </button> :
              <div className={`quiz-sound-choice ${revealed && isCorrect ? 'correct' : ''} ${selected && !isCorrect ? 'incorrect' : ''}`} key={choice.id} data-testid={`item-quiz-sound-choice-${index + 1}`}>
                <button className="quiz-sound-play" onClick={() => void toggleQuizMelody(choice, `choice-${choice.id}`)} disabled={revealed} aria-label={`${quizPlaying === `choice-${choice.id}` ? 'Pause' : quizPaused === `choice-${choice.id}` ? 'Resume' : 'Play'} sound option ${index + 1}`} data-testid={`button-quiz-play-choice-${index + 1}`}>{quizPlaying === `choice-${choice.id}` ? <Pause size={16} fill="currentColor"/> : <Play size={16} fill="currentColor"/>}</button>
                <span className="quiz-choice-index">{String(index + 1).padStart(2, '0')}</span><span className="quiz-sound-label">Sound {String.fromCharCode(65 + index)}</span>
                {revealed && isCorrect && <Check className="quiz-sound-check" size={16}/>}
                <button className="quiz-choose-sound" onClick={() => answerQuiz(choice.id)} disabled={revealed} aria-label={`Choose sound option ${index + 1}`} data-testid={`button-quiz-answer-choice-${index + 1}`}>Choose</button>
              </div>;
          })}
        </div>
        <div className="quiz-feedback" aria-live="polite" role="status" data-testid="status-quiz-feedback">
          {answerId && <><span className={answerId === currentRound.target.id ? 'feedback-right' : 'feedback-wrong'}>{answerId === currentRound.target.id ? 'A lovely match.' : 'Not this one.'}</span><span>The memory was <strong>{currentRound.target.title}</strong>.</span><button className="quiz-next" onClick={nextQuizRound} data-testid="button-quiz-next">{roundIndex + 1 === rounds.length ? 'See your result' : 'Next round'} <ArrowRight size={15}/></button></>}
        </div>
      </div> : <div className="quiz-complete" data-testid="panel-quiz-complete"><span className="quiz-trophy"><Trophy size={21}/></span><div><span className="catalog-label">THE LAST NOTE HAS LANDED</span><h3>{score === rounds.length ? 'A perfect memory.' : 'A lovely little listening.'}</h3><p>You matched <strong>{score}</strong> of {rounds.length} {rounds.length === 1 ? 'memory' : 'memories'}.</p></div><button className="quiz-start-button" onClick={() => direction && beginQuiz(direction)} data-testid="button-quiz-restart"><RotateCcw size={15}/> Play again</button><button className="quiz-quiet-button" onClick={() => { setQuizState('idle'); setDirection(null); }} data-testid="button-quiz-close-result">Back to the gallery</button></div>}
    </section>
      {quizState === 'idle' && player && <div className="library-player"><button className="close-player" aria-label="Close player" onClick={() => setPlayer(null)} data-testid="button-close-player"><X size={17}/></button><Player key={player.id} notes={player.notes} preset={player.settings.preset} title={player.title} autoPlay/></div>}
     {quizState === 'idle' && <div className="library-tools"><label className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a memory…" aria-label="Search your Gallery" data-testid="input-search"/>{query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14}/></button>}</label><button className="sort-button" onClick={sortedToggle} data-testid="button-sort"><SlidersHorizontal size={15}/>{sort === 'newest' ? 'Newest first' : 'Oldest first'}<ChevronDown size={14}/></button></div>}
     {quizState === 'idle' && (loading ? <div className="loading-skeleton"><span/><span/><span/></div> :
       filtered.length ? <div className="memory-grid" data-testid="gallery-grid">{filtered.map((item, index) => <article className="memory-card" key={item.id} data-testid={`card-memory-${item.id}`}>
         <Link href={`/creation/${item.id}`} className="memory-image-link" data-testid={`link-memory-${item.id}`}><img src={item.image} alt={`Photo for ${item.title}`} /><span className="image-open"><ArrowRight size={16}/></span><span className="art-number">PLATE {String(index + 1).padStart(2, '0')}</span></Link>
        <div className="memory-content"><div className="memory-card-top"><div><Link href={`/creation/${item.id}`} className="memory-title" data-testid={`text-title-${item.id}`}>{item.title}</Link><span className="memory-date"><Clock3 size={12}/>{new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div><button className="small-play" aria-label={`Play ${item.title}`} onClick={() => play(item)} data-testid={`button-play-${item.id}`}><Play size={15} fill="currentColor"/></button></div>
          <div className="mini-colors">{item.analysis.samples.slice(0, 6).map((c, i) => <i key={i} style={{ backgroundColor: c }}/>)}</div>
          <div className="memory-actions"><button onClick={() => void rename(item)} data-testid={`button-rename-${item.id}`}>Rename</button><button onClick={() => downloadImage(item.image, item.title)} data-testid={`button-download-image-${item.id}`}><Download size={13}/> Photo</button><button onClick={async () => { try { downloadBlob(await exportWav(item.notes, item.settings.preset, .55), `${item.title}.wav`); } catch (e) { setNotice(errorMessage(e)); } }} data-testid={`button-download-wav-${item.id}`}><FileAudio2 size={13}/> WAV</button><button className="delete-action" onClick={() => void remove(item)} aria-label={`Delete ${item.title}`} data-testid={`button-delete-${item.id}`}><Trash2 size={14}/></button></div>
        </div>
       </article>)}</div> : <div className="empty-library" data-testid="empty-library"><span className="empty-orbit"><AudioLines size={29}/></span><h2>{query ? 'No notes in that name.' : 'A quiet room, for now.'}</h2><p>{query ? 'Try another title or clear your search.' : 'The first song you make from a photo will find its home here.'}</p>{query ? <button className="text-action" onClick={() => setQuery('')}>Clear search</button> : <Link href="/" className="new-memory"><Plus size={16}/> Make your first memory</Link>}</div>)}
     {quizState === 'idle' && <div className="library-foot">{items.length} {items.length === 1 ? 'memory' : 'memories'} · kept on this device</div>}
    <Notice message={notice} onClose={() => setNotice('')}/>
  </main>;
}

function CreationPage() {
  const [, params] = useRoute('/creation/:id');
  const [item, setItem] = useState<Creation | null>(null), [loading, setLoading] = useState(true), [notice, setNotice] = useState('');
  const [preset, setPreset] = useState<Preset>('Piano');
  const [, navigate] = useLocation();
  useEffect(() => {
    let live = true; setLoading(true);
    getCreation(params?.id || '').then(result => { if (live) { setItem(result || null); if (result) setPreset(result.settings.preset); } }).catch(e => { if (live) setNotice(errorMessage(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [params?.id]);
  const rename = async () => {
    if (!item) return;
    const title = window.prompt('Give this memory a name', item.title);
    if (title === null) return;
    if (!title.trim()) { setNotice('A memory needs a name.'); return; }
    const updated = { ...item, title: title.trim() };
    try { await saveCreation(updated); setItem(updated); } catch (e) { setNotice(errorMessage(e)); }
  };
  const remove = async () => {
    if (!item || !window.confirm(`Delete “${item.title}” and its saved photo? This cannot be undone.`)) return;
    try { await deleteCreation(item.id); navigate('/gallery'); } catch (e) { setNotice(errorMessage(e)); }
  };
  const wav = async () => { if (!item) return; try { downloadBlob(await exportWav(item.notes, preset, .55), `${item.title}.wav`); } catch (e) { setNotice(errorMessage(e)); } };
  const changePreset = (next: Preset) => {
    setPreset(next);
    if (!item) return;
    const updated = { ...item, settings: { ...item.settings, preset: next } };
    setItem(updated);
    void saveCreation(updated).catch(e => setNotice(errorMessage(e)));
  };
  if (loading) return <main className="detail-page page-width"><div className="detail-skeleton"/></main>;
  if (!item) return <main className="detail-page page-width"><Link href="/gallery" className="back-link"><ArrowLeft size={16}/> Back to Gallery</Link><div className="empty-library"><span className="empty-orbit"><AudioLines size={29}/></span><h2>This memory isn’t here.</h2><p>It may have been removed from your local Gallery.</p><Link href="/" className="new-memory"><Plus size={16}/> Make a new memory</Link></div><Notice message={notice} onClose={() => setNotice('')}/></main>;
  return <main className="detail-page page-width fade-up">
    <Link href="/gallery" className="back-link" data-testid="link-back-gallery"><ArrowLeft size={16}/> Back to Gallery</Link>
    <div className="detail-layout"><div className="detail-art"><img src={item.image} alt={`Original memory: ${item.title}`} data-testid="img-original"/><div className="detail-color"><span style={{ backgroundColor: item.analysis.dominant }}/><div><small>THE COLOR THAT STAYED</small><strong>{item.analysis.dominant}</strong></div></div></div>
      <section className="detail-copy"><div className="eyebrow"><span className="eyebrow-line"/>A MEMORY, SET TO MUSIC</div><h1 data-testid="text-creation-title">{item.title}</h1><span className="detail-date"><Clock3 size={14}/>{new Date(item.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
        <p className="detail-description">A melody found in the colors, light and details of this photograph. Kept here, just for you.</p>
         <Player key={item.id} notes={item.notes} preset={preset} onPreset={changePreset} title={item.title}/>
        <div className="detail-facts"><span><b>{item.notes.length}</b> notes</span><span><b>{item.settings.tempo}</b> beats per minute</span><span><b>{item.settings.scale}</b></span></div>
        <div className="detail-actions"><button onClick={() => void rename()} data-testid="button-rename-creation">Rename</button><button onClick={() => downloadImage(item.image, item.title)} data-testid="button-download-original"><Download size={15}/> Photo</button><button onClick={() => void wav()} data-testid="button-download-creation-wav"><FileAudio2 size={15}/> WAV</button><button className="delete-action" onClick={() => void remove()} data-testid="button-delete-creation"><Trash2 size={15}/> Delete</button></div>
        <p className="local-note"><Disc3 size={14}/> This memory lives on this device alone.</p>
      </section></div>
    <Notice message={notice} onClose={() => setNotice('')}/>
  </main>;
}

function NotFound() { return <main className="empty-library page-width"><span className="empty-orbit"><AudioLines size={28}/></span><h2>This page is a little quiet.</h2><Link href="/" className="new-memory"><ArrowLeft size={15}/> Return to the studio</Link></main>; }

export function Current() {
  const [path, setPath] = useState('/');
  const location = useMemo(() => [path, setPath] as [string, (to: string) => void], [path]);
  const page = path === '/' ? <Studio/> : path === '/gallery' ? <GalleryPage/> : path.startsWith('/creation/') ? <CreationPage/> : <NotFound/>;
  return <NavigationContext.Provider value={location}>
    <div className="app-shell"><div className="grain"/><Header/>{page}</div>
  </NavigationContext.Provider>;
}
