// src/lib/rateLimit.js
// Límite de peticiones por usuario, con ventana deslizante en Firestore.
// Sirve para que nadie pueda gastar CPU/almacenamiento en bucle (un ataque que
// no busca entrar, sino inflar la factura).
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Consume un intento. Devuelve { ok: true } o { ok: false, retryAfter } (segundos).
 * @param {string} key      Identificador (p. ej. `upload:${uid}`)
 * @param {number} limit    Máximo de intentos por ventana
 * @param {number} windowMs Duración de la ventana
 */
export async function rateLimit(key, limit, windowMs) {
    const db = getAdminDb();
    const ref = db.doc(`rateLimits/${encodeURIComponent(key)}`);
    const now = Date.now();
    const cutoff = now - windowMs;

    try {
        return await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            const prev = snap.exists ? (snap.data().hits || []) : [];
            // Nos quedamos solo con los intentos dentro de la ventana.
            const hits = prev.filter((t) => typeof t === "number" && t > cutoff);

            if (hits.length >= limit) {
                const retryAfter = Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000));
                return { ok: false, retryAfter };
            }

            hits.push(now);
            tx.set(ref, { hits, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            return { ok: true, remaining: limit - hits.length };
        });
    } catch {
        // Si Firestore falla, no bloqueamos al usuario legítimo.
        return { ok: true, remaining: null };
    }
}
