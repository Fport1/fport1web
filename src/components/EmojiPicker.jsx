"use client";

// EmojiPicker global y reutilizable.
// Categorías al estilo del teclado de Apple/iOS, con "Recientes" (localStorage)
// y buscador. Úsalo en el chat, en comentarios de propuestas y donde quieras.
//
// Uso:
//   <EmojiPicker onPick={(e) => insertar(e)} onClose={() => setOpen(false)} />
//
// El componente solo renderiza el PANEL; el posicionamiento (popover, etc.)
// lo controla quien lo usa con un contenedor.

import { useEffect, useMemo, useRef, useState } from "react";
import { XMarkIcon, MagnifyingGlassIcon, ClockIcon } from "@heroicons/react/24/outline";
import { TwemojiImg } from "@/lib/twemoji";
import EMOJI_DATA from "@/lib/emoji-data";

// Metadatos de categorías (orden + icono + título). Los emojis salen del dataset completo.
const CAT_META = [
  { id: "smileys", icon: "😀", title: "Caras y emociones" },
  { id: "people", icon: "👋", title: "Personas y gestos" },
  { id: "nature", icon: "🐶", title: "Animales y naturaleza" },
  { id: "food", icon: "🍔", title: "Comida y bebida" },
  { id: "activity", icon: "⚽", title: "Actividad" },
  { id: "travel", icon: "✈️", title: "Viajes y lugares" },
  { id: "objects", icon: "💡", title: "Objetos" },
  { id: "symbols", icon: "❤️", title: "Símbolos" },
  { id: "flags", icon: "🏳️", title: "Banderas" },
];

export const EMOJI_CATEGORIES = CAT_META.map((c) => ({
  ...c,
  emojis: (EMOJI_DATA[c.id] || []).map((it) => ({ e: it.e, k: it.n })),
}));

// Traducciones ES→EN para que la búsqueda en español encuentre resultados.
const ES_ALIASES = {
  cara: "face", feliz: "happy", risa: "laugh", llorar: "cry", llanto: "cry", triste: "sad",
  enojado: "angry", enojo: "angry", amor: "love heart", corazon: "heart", beso: "kiss",
  guino: "wink", sonrojo: "blush", miedo: "fear scream", sorpresa: "surprised astonished",
  pensar: "thinking", dormir: "sleep", sueno: "sleep", fiesta: "party", diablo: "devil",
  fantasma: "ghost", robot: "robot", gato: "cat", perro: "dog", mono: "monkey",
  pulgar: "thumbs", bien: "thumbs up", mal: "thumbs down", mano: "hand", aplausos: "clap",
  rezar: "pray", musculo: "muscle", fuerza: "muscle", ojos: "eyes", bandera: "flag",
  colombia: "colombia", comida: "food", pizza: "pizza", hamburguesa: "hamburger",
  cerveza: "beer", cafe: "coffee", torta: "cake", futbol: "soccer", balon: "ball",
  trofeo: "trophy", medalla: "medal", musica: "music", guitarra: "guitar", avion: "airplane",
  carro: "car automobile", auto: "car automobile", casa: "house", fuego: "fire",
  estrella: "star", sol: "sun", luna: "moon", arcoiris: "rainbow", lluvia: "rain",
  dinero: "money", regalo: "gift", reloj: "clock watch", telefono: "phone", celular: "phone",
  computador: "computer laptop", camara: "camera", libro: "book", candado: "lock",
  flor: "flower", arbol: "tree", planta: "plant", pajaro: "bird", pez: "fish",
  serpiente: "snake", arana: "spider", abeja: "bee", mariposa: "butterfly",
  cohete: "rocket", pistola: "pistol gun", bomba: "bomb", check: "check mark",
  cumpleanos: "birthday", pulgares: "thumbs",
};

function translateQuery(q) {
  const words = q.split(/\s+/).filter(Boolean);
  const extra = words.map((w) => ES_ALIASES[w]).filter(Boolean);
  return [q, ...extra].join(" ");
}

const RECENTS_KEY = "dc_recent_emojis";
const MAX_RECENTS = 36;

// Cada categoría: { id, icon (emoji para el tab), title, emojis: [{e, k}] }
// k = palabras clave para el buscador (en español).

function getRecents() {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(window.localStorage.getItem(RECENTS_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentEmoji(emoji) {
  if (typeof window === "undefined" || !emoji) return;
  try {
    const cur = getRecents().filter((e) => e !== emoji);
    const next = [emoji, ...cur].slice(0, MAX_RECENTS);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

export default function EmojiPicker({ onPick, onClose, className = "" }) {
  const [recents, setRecents] = useState([]);
  const [activeCat, setActiveCat] = useState("smileys");
  const [search, setSearch] = useState("");
  const gridRef = useRef(null);

  useEffect(() => {
    setRecents(getRecents());
  }, []);

  const hasRecents = recents.length > 0;

  // Tabs visibles: "recientes" (si hay) + categorías
  const tabs = useMemo(() => {
    const base = EMOJI_CATEGORIES.map((c) => ({ id: c.id, icon: c.icon, title: c.title }));
    return hasRecents ? [{ id: "recents", icon: "🕘", title: "Recientes" }, ...base] : base;
  }, [hasRecents]);

  // Resultados a mostrar según búsqueda / categoría
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      // términos: la consulta + sus traducciones ES→EN
      const terms = translateQuery(q).toLowerCase().split(/\s+/).filter(Boolean);
      const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
      const seen = new Set();
      return all
        .filter((it) => it.e === q || terms.some((t) => it.k.includes(t)))
        .filter((it) => (seen.has(it.e) ? false : (seen.add(it.e), true)))
        .map((it) => it.e);
    }
    if (activeCat === "recents") return recents;
    const cat = EMOJI_CATEGORIES.find((c) => c.id === activeCat) || EMOJI_CATEGORIES[0];
    return cat.emojis.map((it) => it.e);
  }, [search, activeCat, recents]);

  function handlePick(e) {
    pushRecentEmoji(e);
    setRecents(getRecents());
    onPick?.(e);
  }

  return (
    <div
      className={clsxLite(
        "w-[min(360px,92vw)] rounded-2xl border border-white/10 bg-neutral-950/95 backdrop-blur shadow-xl overflow-hidden",
        className
      )}
    >
      {/* Buscador */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 flex-1 rounded-full bg-white/8 px-3 py-1.5">
          <MagnifyingGlassIcon className="w-4 h-4 text-white/40 shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar emoji"
            className="bg-transparent outline-none text-sm w-full placeholder-white/40"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-white/40 hover:text-white/80 cursor-pointer"
              aria-label="Limpiar búsqueda"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white/80 transition"
            aria-label="Cerrar"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabs de categorías (ocultos al buscar) */}
      {!search && (
        <div className="flex items-center gap-0.5 px-2 pb-1 border-b border-white/8 overflow-x-auto scrollbar-none">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              title={t.title}
              onClick={() => {
                setActiveCat(t.id);
                if (gridRef.current) gridRef.current.scrollTop = 0;
              }}
              className={clsxLite(
                "shrink-0 px-2 py-1.5 rounded-xl transition cursor-pointer grid place-content-center",
                activeCat === t.id ? "bg-white/15" : "opacity-55 hover:opacity-100 hover:bg-white/8"
              )}
            >
              {t.id === "recents" ? <ClockIcon className="w-5 h-5" /> : <TwemojiImg emoji={t.icon} size="1.25rem" />}
            </button>
          ))}
        </div>
      )}

      {/* Grid de emojis */}
      <div ref={gridRef} className="grid grid-cols-8 gap-0.5 p-2 max-h-56 overflow-y-auto">
        {results.length === 0 ? (
          <div className="col-span-8 py-8 text-center text-sm text-white/40">
            {search ? "Sin resultados" : "Aún no hay recientes"}
          </div>
        ) : (
          results.map((e, i) => (
            <button
              key={`${e}-${i}`}
              type="button"
              className="cursor-pointer p-1.5 rounded-xl hover:bg-white/10 transition hover:scale-110 active:scale-95 grid place-content-center"
              onClick={() => handlePick(e)}
            >
              <TwemojiImg emoji={e} size="1.6rem" />
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// clsx minimalista para no acoplar imports
function clsxLite(...parts) {
  return parts.filter(Boolean).join(" ");
}
