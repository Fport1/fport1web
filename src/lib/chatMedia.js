// src/lib/chatMedia.js
// Convierte las RUTAS de los adjuntos en enlaces temporales para poder verlos.
//
// En Firestore los mensajes nuevos guardan solo `path`, no una URL permanente.
// Aquí se piden a /api/chat-media los enlaces firmados (que caducan en una
// hora) y se guardan en memoria para no repetir la petición en cada render.

import { auth } from "@/lib/firebase";

// path -> { url, expiraEn }
const cache = new Map();
// Peticiones en curso, para no pedir dos veces la misma ruta a la vez.
const enVuelo = new Map();

// Margen antes de que caduque, para no usar un enlace a punto de morir.
const MARGEN_MS = 5 * 60 * 1000;

function vigente(entrada) {
    return entrada && entrada.expiraEn - MARGEN_MS > Date.now();
}

/** Devuelve el enlace en caché si sigue siendo válido. */
export function urlEnCache(path) {
    const e = cache.get(path);
    return vigente(e) ? e.url : null;
}

/**
 * Pide los enlaces de varias rutas de una conversación.
 * @returns {Promise<Record<string,string>>} ruta -> enlace temporal
 */
export async function resolverMedia(cid, paths) {
    const unicas = [...new Set((paths || []).filter(Boolean))];
    const resultado = {};
    const faltantes = [];

    for (const p of unicas) {
        const e = cache.get(p);
        if (vigente(e)) resultado[p] = e.url;
        else faltantes.push(p);
    }
    if (!faltantes.length) return resultado;

    // Reutiliza peticiones ya en curso para las mismas rutas
    const pendientes = faltantes.filter((p) => !enVuelo.has(p));
    const promesa = pendientes.length ? pedir(cid, pendientes) : Promise.resolve({});
    pendientes.forEach((p) => enVuelo.set(p, promesa));

    try {
        await promesa;
    } finally {
        pendientes.forEach((p) => enVuelo.delete(p));
    }
    // Espera también las que ya estaban en vuelo
    await Promise.all(faltantes.map((p) => enVuelo.get(p)).filter(Boolean));

    for (const p of faltantes) {
        const e = cache.get(p);
        if (vigente(e)) resultado[p] = e.url;
    }
    return resultado;
}

async function pedir(cid, paths) {
    try {
        const user = auth.currentUser;
        if (!user) return {};
        const res = await fetch("/api/chat-media", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${await user.getIdToken()}`,
            },
            body: JSON.stringify({ cid, paths }),
        });
        if (!res.ok) return {};
        const { urls, expiresAt } = await res.json();
        for (const [ruta, url] of Object.entries(urls || {})) {
            cache.set(ruta, { url, expiraEn: expiresAt || Date.now() + 3600000 });
        }
        return urls || {};
    } catch {
        return {};
    }
}

/**
 * Rellena `url` en los adjuntos que solo traen `path`, dejando intactos los
 * mensajes antiguos (que ya tienen `url`) y los GIF externos.
 */
export async function hidratarAdjuntos(cid, mensajes) {
    const rutas = [];
    for (const m of mensajes) {
        for (const a of m?.attachments || []) {
            if (a?.path && !a?.url) rutas.push(a.path);
        }
    }
    if (!rutas.length) return mensajes;

    const urls = await resolverMedia(cid, rutas);
    if (!Object.keys(urls).length) return mensajes;

    return mensajes.map((m) => {
        if (!m?.attachments?.some((a) => a?.path && !a?.url)) return m;
        return {
            ...m,
            attachments: m.attachments.map((a) =>
                a?.path && !a?.url && urls[a.path] ? { ...a, url: urls[a.path] } : a
            ),
        };
    });
}
