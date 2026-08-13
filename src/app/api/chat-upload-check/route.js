// src/app/api/chat-upload-check/route.js
// Consulta el cupo de subidas del usuario antes de mandar adjuntos al chat.
//
// Los archivos del chat llegan a 25 MB, así que suben directo a Storage (no
// caben en una petición a Vercel). Por eso este control es DISUASORIO: frena el
// abuso casual y los bucles accidentales, pero alguien que edite el cliente
// puede saltárselo. El control definitivo llega cuando las subidas se hagan con
// URLs firmadas emitidas por el servidor.
import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";

// Cupo por usuario: de sobra para una conversación normal con fotos y audios,
// pero corta en seco un script que suba en bucle.
const SUBIDAS_POR_HORA = 60;

export async function POST(req) {
    const authz = req.headers.get("authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "no_token" }, { status: 401 });

    let uid;
    try {
        uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    } catch {
        return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }

    let cantidad = 1;
    try {
        const body = await req.json();
        cantidad = Math.max(1, Math.min(10, Number(body?.cantidad) || 1));
    } catch { /* una por defecto */ }

    // Se consume una unidad por archivo del envío.
    for (let i = 0; i < cantidad; i++) {
        const r = await rateLimit(`chatUpload:${uid}`, SUBIDAS_POR_HORA, 60 * 60 * 1000);
        if (!r.ok) {
            return NextResponse.json(
                {
                    error: "rate_limited",
                    reason: "Has enviado demasiados archivos seguidos. Espera un momento antes de mandar más.",
                    retryAfter: r.retryAfter,
                },
                { status: 429 }
            );
        }
    }

    return NextResponse.json({ ok: true });
}
