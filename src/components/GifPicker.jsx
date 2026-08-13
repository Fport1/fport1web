"use client";

// GifPicker (Giphy) — panel anclado al botón que lo abre, al estilo de
// Instagram/X: NO bloquea la página, se puede seguir navegando y scrolleando
// con él abierto. Se cierra al hacer clic fuera o con Escape.
//
// Uso:
//   <GifPicker open={open} anchorEl={btnEl} onClose={...} onPick={(url) => ...} />
//   donde `btnEl` es el elemento del botón (p. ej. e.currentTarget al abrirlo).

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { XMarkIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { giphyFetch, GIF_PAGE } from "@/lib/giphy";

const QUICK = ["aplausos", "gracias", "celebrar", "lol", "ok", "bailar", "feliz", "triste"];

const PANEL_W = 360;
const PANEL_MAX_H = 440;
const MARGIN = 8;

export default function GifPicker({ open, anchorEl, onClose, onPick }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [next, setNext] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fallo, setFallo] = useState("");
  const [pos, setPos] = useState(null);

  const panelRef = useRef(null);
  const sentinelRef = useRef(null);
  const debounceRef = useRef(null);
  const nextRef = useRef("");
  nextRef.current = next;

  /* ---- Posición: pegado al botón, arriba o abajo según el espacio ---- */
  const place = useCallback(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PANEL_W, vw - MARGIN * 2);
    const left = Math.max(MARGIN, Math.min(r.left, vw - width - MARGIN));

    const espacioArriba = r.top;
    const espacioAbajo = vh - r.bottom;
    const arriba = espacioArriba > espacioAbajo;

    const disponible = (arriba ? espacioArriba : espacioAbajo) - MARGIN * 2;

    setPos({
      left,
      width,
      maxH: Math.min(disponible, PANEL_MAX_H),
      ...(arriba ? { bottom: vh - r.top + MARGIN } : { top: r.bottom + MARGIN }),
    });
  }, [anchorEl]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    // `true` para capturar el scroll de cualquier contenedor, no solo el de la ventana.
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, place]);

  /* ---- Cerrar: clic fuera o Escape (sin capa que bloquee la página) ---- */
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorEl?.contains(e.target)) return; // el propio botón alterna
      onClose?.();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchorEl, onClose]);

  /* ---- Datos ---- */
  const loadingRef = useRef(false);
  const load = useCallback(async ({ reset = false } = {}) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const p = reset ? "" : nextRef.current;
      const { data, next: nx } = await giphyFetch({ q: query.trim(), limit: GIF_PAGE, pos: p });
      setResults((prev) => (reset ? data : [...prev, ...data]));
      setNext(nx);
      setHasMore(Boolean(nx));
      setFallo("");
    } catch (e) {
      console.warn("Giphy falló:", e);
      // Distinguimos "no hay GIFs para esa búsqueda" de "Giphy no respondió".
      // Importa porque la clave es de beta y tiene tope: al agotarse llega un 429
      // y antes el panel decía "Sin resultados", como si la búsqueda fuera mala.
      const status = Number((String(e?.message).match(/Giphy error (\d+)/) || [])[1]);
      setFallo(status === 429
        ? "Los GIFs no están disponibles ahora mismo. Intenta en unos minutos."
        : "No se pudieron cargar los GIFs. Revisa tu conexión.");
      if (!reset) setHasMore(false);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [query]);

  // Al abrir: reinicia y carga tendencias
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setNext("");
    setHasMore(true);
    load({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Búsqueda con debounce
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setResults([]);
      setNext("");
      setHasMore(true);
      load({ reset: true });
    }, 300);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  // Scroll infinito dentro del panel
  useEffect(() => {
    if (!open) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loading) load();
    }, { root: el.closest("[data-gif-scroll]") });
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasMore, loading]);

  if (!open || !pos) return null;

  return (
    // Columna flex con overflow oculto: la cuadrícula absorbe el espacio sobrante
    // (flex-1 + min-h-0) y el resto queda fijo, así nada se sale del recuadro.
    <div
      ref={panelRef}
      className="fixed z-[80] flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900 shadow-2xl p-3"
      style={{
        left: pos.left,
        width: pos.width,
        ...(pos.top != null ? { top: pos.top } : { bottom: pos.bottom }),
        maxHeight: pos.maxH,
      }}
    >
      {/* Buscador con la X integrada: una fila menos que la cabecera anterior */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar GIFs"
            autoFocus
            className="w-full rounded-full border border-white/10 bg-white/[0.06] py-1.5 pl-8 pr-3 text-sm placeholder:text-white/35 focus:border-emerald-400/40 focus:outline-none focus:ring-1 focus:ring-emerald-400/40"
          />
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white cursor-pointer"
          title="Cerrar"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex shrink-0 gap-1.5 overflow-x-auto pb-0.5 text-[11px] scrollbar-none">
        {QUICK.map((s) => {
          const activo = query === s;
          return (
            <button
              key={s}
              onClick={() => setQuery(activo ? "" : s)}
              className={`shrink-0 rounded-full px-2.5 py-1 transition cursor-pointer ${
                activo
                  ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40"
                  : "bg-white/[0.07] text-white/60 hover:bg-white/[0.12] hover:text-white/90"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Mosaico en columnas: cada GIF conserva su proporción real (nada se aplasta) */}
      <div
        data-gif-scroll
        className="gif-scroll mt-2 min-h-0 flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="columns-2 gap-2">
          {results.map((g, i) => (
            <button
              key={i}
              onClick={() => onPick?.(g.url)}
              // El hueco se reserva con la proporción real del GIF: evita el salto
              // de maquetación y permite que la carga diferida se dispare.
              style={{ aspectRatio: g.w && g.h ? `${g.w} / ${g.h}` : "1 / 1" }}
              className="group mb-2 block w-full break-inside-avoid overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-white/10 transition hover:ring-2 hover:ring-emerald-400/70 cursor-pointer"
              title="Usar este GIF"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.url}
                alt="gif"
                className="block h-full w-full object-cover select-none transition duration-200 group-hover:brightness-110"
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
        <div ref={sentinelRef} className="h-4" />
      </div>

      {loading && (
        <div className="flex shrink-0 justify-center py-1.5">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-emerald-400" />
        </div>
      )}
      {!loading && results.length === 0 && (
        <div className={`shrink-0 px-3 py-3 text-center text-[11px] ${fallo ? "text-amber-300/90" : "text-white/45"}`}>
          {fallo || "Sin resultados."}
        </div>
      )}
      {!loading && results.length > 0 && fallo && (
        <div className="shrink-0 px-3 py-1.5 text-center text-[11px] text-amber-300/90">{fallo}</div>
      )}

      {/* Atribución obligatoria (términos de Giphy). Marca oficial descargada
          de giphy-attribution-marks.zip; no sustituir por texto ni recrearla. */}
      <div className="mt-1.5 flex h-3 shrink-0 items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/powered-by-giphy.png" alt="Powered by GIPHY" width={72} height={9} className="opacity-45" />
      </div>
    </div>
  );
}
