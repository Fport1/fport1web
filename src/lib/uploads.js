// src/lib/uploads.js
import { auth, storage } from "@/lib/firebase";
import { ref as sRef, uploadBytes } from "firebase/storage";
import { sniff, mimePorExtension } from "@/lib/chatFileGuard";

// El Content-Type se decide aquí, no se toma del navegador (que a veces lo deja
// vacío y, sobre todo, es falsificable). Orden: firma real del archivo →
// extensión conocida → lo que declare el navegador. Las reglas de Storage solo
// aceptan la lista blanca de tipos del chat.
async function tipoSeguro(file) {
    try {
        const cab = new Uint8Array(await file.slice(0, 32).arrayBuffer());
        const real = sniff(cab);
        if (real) return real;
    } catch { /* seguimos con los otros criterios */ }
    return mimePorExtension(file.name) || file.type || "application/octet-stream";
}

function safeName(name) {
    return String(name || "file").replace(/[^\w.\-]+/g, "_");
}

// NO se llama a getDownloadURL: esa URL lleva un token permanente que funciona
// sin sesión y se salta las reglas de Storage, así que filtrarla equivale a
// regalar el archivo para siempre. Se guarda solo la ruta; para ver el adjunto
// hay que pedir un enlace temporal a /api/chat-media, que comprueba que quien
// lo pide participa en la conversación.
async function uploadBlob(file, path) {
    const ref = sRef(storage, path);
    const contentType = await tipoSeguro(file);
    await uploadBytes(ref, file, { contentType });
    return { path, contentType };
}

/**
 * Sube UN adjunto y devuelve el objeto listo para guardarse en Firestore
 * - Usa SIEMPRE el auth.currentUser.uid como dueño de la carpeta
 */
export async function uploadMessageAttachment(cid, file, kind, { viewOnce = false } = {}) {
    const me = auth.currentUser?.uid;
    if (!me) throw new Error("No auth user");

    const ts = Date.now();
    const base = `${ts}_${me}_${safeName(file.name || kind)}`;
    // "ver/escuchar una vez" → carpeta viewonce (cualquiera puede destruirla al abrir);
    // normales → uploads (solo el dueño borra).
    const path = viewOnce
        ? `viewonce/${me}/conversations/${cid}/${base}`
        : `uploads/${me}/conversations/${cid}/${base}`;
    const { contentType } = await uploadBlob(file, path);

    return {
        kind: kind || "file",
        name: file.name || base,
        path,                       // el enlace se resuelve al mostrarlo
        size: file.size || null,
        contentType,
    };
}

/**
 * Sube varios adjuntos [{kind, file}] -> devuelve [{kind,name,url,...}]
 */
export async function uploadManyAttachments(cid, items = [], { viewOnce = false } = {}) {
    const out = [];
    for (const it of items) {
        const kind = it.kind || "file";
        const file = it.file || it;
        const att = await uploadMessageAttachment(cid, file, kind, { viewOnce });
        out.push(att);
    }
    return out;
}
