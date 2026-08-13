"use client";

// Reproductor de notas de voz estilo WhatsApp/Telegram:
// play/pausa, barra de progreso seekable, tiempo y control de velocidad (1x/1.5x/2x).
import { useEffect, useRef, useState } from "react";
import { PlayIcon, PauseIcon } from "@heroicons/react/24/solid";

// Reproductor para audios de "escuchar una vez".
//  - receptor: reproduce una vez y al terminar se destruye (onConsumed).
//  - emisor: puede re-escucharlo (canReplay) sin destruir.
export function ViewOnceAudio({ src, mine = false, alreadyOpened = false, canReplay = false, onConsumed }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  if (alreadyOpened) {
    return (
      <div className="flex items-center gap-2 text-sm min-w-[180px] opacity-70">
        <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-black/30 border border-white/20 text-xs">1</span>
        Audio (escuchado)
      </div>
    );
  }

  function play() {
    const a = audioRef.current;
    if (!a) return;
    a.play().then(() => setPlaying(true)).catch(() => {});
  }

  return (
    <div className="flex items-center gap-2.5 text-sm min-w-[200px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onEnded={() => {
          setPlaying(false);
          if (!canReplay) onConsumed?.(); // el receptor lo destruye al terminar
        }}
      />
      <button
        type="button"
        onClick={play}
        disabled={playing}
        className={`shrink-0 w-9 h-9 grid place-content-center rounded-full cursor-pointer ${mine ? "bg-white/20 hover:bg-white/30" : "bg-white/10 hover:bg-white/20"} transition disabled:opacity-60`}
        aria-label="Escuchar"
      >
        <PlayIcon className="w-5 h-5 translate-x-px" />
      </button>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-black/30 border border-white/20 text-[11px]">1</span>
        <span>{playing ? "Reproduciendo…" : (canReplay ? "Audio (escuchar una vez)" : "Escuchar una vez")}</span>
      </div>
    </div>
  );
}

const SPEEDS = [1, 1.5, 2];

function fmt(t) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function AudioMessage({ src, mine = false, durationHint = 0 }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(durationHint || 0);
  const [speedIdx, setSpeedIdx] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setCur(a.currentTime);
    const onLoaded = () => { if (isFinite(a.duration)) setDur(a.duration); };
    const onEnd = () => { setPlaying(false); setCur(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("durationchange", onLoaded);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("durationchange", onLoaded);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  }

  function seek(e) {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setCur(a.currentTime);
  }

  function cycleSpeed() {
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    const a = audioRef.current;
    if (a) a.playbackRate = SPEEDS[next];
  }

  const pct = dur ? Math.min(100, (cur / dur) * 100) : 0;
  const accent = mine ? "bg-white" : "bg-blue-400";
  const track = mine ? "bg-white/25" : "bg-white/15";

  return (
    <div className="flex items-center gap-2.5 min-w-[210px] max-w-[280px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        className={`shrink-0 w-9 h-9 grid place-content-center rounded-full cursor-pointer ${mine ? "bg-white/20 hover:bg-white/30" : "bg-white/10 hover:bg-white/20"} transition`}
        aria-label={playing ? "Pausar" : "Reproducir"}
      >
        {playing ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 translate-x-px" />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="h-1.5 rounded-full cursor-pointer relative" onClick={seek}>
          <div className={`absolute inset-0 rounded-full ${track}`} />
          <div className={`absolute inset-y-0 left-0 rounded-full ${accent}`} style={{ width: `${pct}%` }} />
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full ${accent} shadow`}
            style={{ left: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] opacity-70 leading-none">
          <span>{fmt(playing || cur ? cur : dur)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded-md cursor-pointer ${mine ? "bg-white/15 hover:bg-white/25" : "bg-white/10 hover:bg-white/20"} transition`}
        title="Velocidad de reproducción"
      >
        {SPEEDS[speedIdx]}×
      </button>
    </div>
  );
}
