// src/app/api/chat-media/route.js
// Entrega enlaces TEMPORALES para los adjuntos de una conversación.
//
// Antes cada adjunto se guardaba como una URL de descarga de Firebase con un
// token permanente: funcionaba para siempre, sin sesión y saltándose las reglas
// de Storage. Quien consiguiera el enlace (reenviado, en una captura, leyendo
// el mensaje con las herramientas del navegador) accedía al archivo para
// siempre. Eso también permitía rodear el "ver una vez": bastaba con sacar la
// URL del mensaje sin llegar a abrirlo.
//
// Ahora en Firestore solo se guarda la RUTA. Para ver el archivo hay que pedir
// aquí un enlace firmado, y solo se entrega si:
//   1. el token de sesión es válido, y
//   2. quien lo pide es participante de esa conversación, y
//   3. la ruta pertenece de verdad a esa conversación.
// El enlace caduca en una hora, así que filtrarlo sirve de poco.
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, getAdminBucket } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const VIGENCIA_MS = 60 * 60 * 1000; // 1 hora

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

    let cid, paths;
    try {
        ({ cid, paths } = await req.json());
    } catch {
        return NextResponse.json({ error: "bad_body" }, { status: 400 });
    }
    if (!cid || !Array.isArray(paths) || !paths.length) {
        return NextResponse.json({ error: "bad_request" }, { status: 400 });
    }
    if (paths.length > 60) {
        return NextResponse.json({ error: "too_many" }, { status: 400 });
    }

    // ¿Es participante de la conversación?
    const convSnap = await getAdminDb().doc(`conversations/${cid}`).get();
    if (!convSnap.exists) return NextResponse.json({ error: "no_conv" }, { status: 404 });
    const participantes = convSnap.data()?.participantUids || [];
    if (!participantes.includes(uid)) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const bucket = getAdminBucket();
    const expires = Date.now() + VIGENCIA_MS;
    const urls = {};

    await Promise.all(
        paths.map(async (p) => {
            const ruta = String(p || "");
            // La ruta debe ser de un adjunto de ESTA conversación. Evita que un
            // participante pida archivos de otro chat con solo cambiar la ruta.
            if (!/^(uploads|viewonce)\/[^/]+\/conversations\/([^/]+)\//.test(ruta)) return;
            const cidEnRuta = ruta.match(/\/conversations\/([^/]+)\//)?.[1];
            if (cidEnRuta !== cid) return;
            if (ruta.includes("..")) return;

            try {
                const [url] = await bucket.file(ruta).getSignedUrl({
                    version: "v4",
                    action: "read",
                    expires,
                });
                urls[ruta] = url;
            } catch { /* archivo borrado (p. ej. ver una vez ya abierta) */ }
        })
    );

    return NextResponse.json({ urls, expiresAt: expires });
}
