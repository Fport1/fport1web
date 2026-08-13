// src/lib/giphy.js
// Búsqueda de GIFs con la API de Giphy. Sustituye a Tenor, que Google apagó
// (la API dejó de estar disponible el 30 de junio de 2026).
//
// Devuelve { data: [{ url, w, h }], next }. Quien la use trata `next` como una
// caja negra: aquí es el offset numérico de Giphy en forma de texto.

const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_KEY;

export const GIF_PAGE = 24;

// Giphy no acepta offsets por encima de ~5000.
const MAX_OFFSET = 4999;

// Devolvemos también el tamaño: el mosaico necesita reservar el hueco con la
// proporción real, o el contenedor colapsa y la carga diferida nunca dispara.
function pickImage(item) {
    const im = item?.images || {};
    // Preferimos una versión ligera para el mosaico; el original pesa mucho.
    const c = im.fixed_height_small || im.fixed_height || im.downsized || im.original;
    if (!c?.url) return null;
    return { url: c.url, w: Number(c.width) || 0, h: Number(c.height) || 0 };
}

export async function giphyFetch({ q = "", limit = GIF_PAGE, pos = "" } = {}) {
    if (!GIPHY_KEY) throw new Error("Falta NEXT_PUBLIC_GIPHY_KEY");

    const base = q
        ? "https://api.giphy.com/v1/gifs/search"
        : "https://api.giphy.com/v1/gifs/trending";

    const offset = Number(pos) || 0;
    const url = new URL(base);
    url.searchParams.set("api_key", GIPHY_KEY);
    if (q) url.searchParams.set("q", q);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("rating", "g");   // equivalente al contentfilter alto de Tenor
    url.searchParams.set("lang", "es");
    if (offset) url.searchParams.set("offset", String(offset));

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Giphy error ${res.status}`);
    const json = await res.json();

    const data = (json.data || []).map(pickImage).filter(Boolean);
    const p = json.pagination || {};
    const nextOffset = offset + (p.count ?? data.length);
    const total = p.total_count ?? 0;
    const hayMas = data.length > 0 && nextOffset < Math.min(total || Infinity, MAX_OFFSET);

    return { data, next: hayMas ? String(nextOffset) : "" };
}
