// src/lib/chatFileGuard.js
// Validación de adjuntos del CHAT, en el navegador.
//
// A diferencia de las propuestas (que pasan por /api y se validan en el
// servidor), aquí los archivos llegan a 25 MB y no caben en una petición a
// Vercel, así que se suben directo a Storage. La defensa es en dos capas:
//   1. Aquí: se comprueba la firma real del archivo (magic bytes), no su
//      extensión ni el tipo que declare el sistema — ambos se falsifican.
//   2. storage.rules: solo acepta subidas cuyo contentType esté en la lista
//      blanca, de modo que nada se sirva como ejecutable aunque burlen esto.

export const MAX_VIDEO_SECS = 90;          // 1 min 30 s
export const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// Medios que se muestran INCRUSTADOS en el chat: lista blanca estricta, porque
// el navegador los interpreta. Aquí no entra SVG (puede contener JavaScript).
export const ALLOWED = {
    image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    video: ["video/mp4", "video/webm", "video/quicktime"],
    audio: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/webm"],
};

// Documentos y comprimidos: NUNCA se muestran incrustados, solo se descargan
// (y la descarga pasa por /api/download, que fuerza "guardar como" en vez de
// abrir). Por eso aquí sí caben ZIP y SVG: el riesgo está en ejecutarlos, no
// en recibirlos, igual que en cualquier otro chat.
export const DOC_EXT = new Set([
    "pdf", "txt", "rtf", "md", "csv", "json", "xml", "html", "htm", "svg",
    "doc", "docx", "docm", "xls", "xlsx", "xlsm", "ppt", "pptx", "pptm",
    "odt", "ods", "odp",
    "zip", "rar", "7z", "tar", "gz",
]);

// Ejecutables e instaladores: se bloquean siempre, por extensión.
export const EXT_BLOQUEADAS = new Set([
    "exe", "msi", "com", "scr", "pif", "cpl", "dll", "sys", "drv", "msc",
    "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "js", "mjs", "jse", "wsf", "wsh",
    "hta", "reg", "lnk", "jar", "apk", "app", "dmg", "pkg", "deb", "rpm",
    "sh", "bash", "run", "bin", "iso", "img", "gadget",
]);

// Formatos que conviene advertir antes de descargar: comprimidos (pueden
// esconder cualquier cosa), Office con macros y web ejecutable en local.
export const RIESGOSOS = new Set([
    "zip", "rar", "7z", "tar", "gz", "svg", "html", "htm",
    "docm", "xlsm", "pptm",
]);

export const extensionDe = (nombre = "") =>
    (String(nombre).toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) || "";

// Tipo MIME por extensión. Se usa al subir para que ningún documento acabe
// como "application/octet-stream": así las reglas de Storage pueden mantener
// una lista blanca estricta sin un comodín que dejaría pasar ejecutables.
const MIME_POR_EXT = {
    pdf: "application/pdf", txt: "text/plain", rtf: "application/rtf",
    md: "text/markdown", csv: "text/csv", json: "application/json",
    xml: "application/xml", html: "text/html", htm: "text/html",
    svg: "image/svg+xml",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docm: "application/vnd.ms-word.document.macroEnabled.12",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    pptm: "application/vnd.ms-powerpoint.presentation.macroEnabled.12",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    zip: "application/zip", rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed", tar: "application/x-tar", gz: "application/gzip",
};

export const mimePorExtension = (nombre) => MIME_POR_EXT[extensionDe(nombre)] || null;

/** ¿Conviene advertir al usuario antes de descargar este adjunto? */
export function esDescargaRiesgosa(nombre) {
    return RIESGOSOS.has(extensionDe(nombre));
}

/** Firmas de ejecutable: se rechazan aunque la extensión parezca inofensiva. */
function esEjecutable(b) {
    if (b[0] === 0x4d && b[1] === 0x5a) return "programa de Windows";              // MZ
    if (b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) return "programa de Linux"; // ELF
    const m = (b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3]) >>> 0;
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(m)) return "programa de macOS";
    if (b[0] === 0x23 && b[1] === 0x21) return "script del sistema";               // #!
    return null;
}

const startsWith = (b, bytes, off = 0) =>
    b.length >= off + bytes.length && bytes.every((v, i) => b[off + i] === v);

const ascii = (b, off, txt) =>
    [...txt].every((c, i) => b[off + i] === c.charCodeAt(0));

/** Detecta el tipo real leyendo la cabecera del archivo. */
export function sniff(buf) {
    if (startsWith(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
    if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
    if (ascii(buf, 0, "GIF87a") || ascii(buf, 0, "GIF89a")) return "image/gif";
    if (ascii(buf, 0, "RIFF") && ascii(buf, 8, "WEBP")) return "image/webp";
    if (ascii(buf, 0, "RIFF") && ascii(buf, 8, "WAVE")) return "audio/wav";
    if (ascii(buf, 4, "ftyp")) {
        const marca = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
        if (marca === "qt  ") return "video/quicktime";
        if (marca.startsWith("M4A")) return "audio/mp4";
        return "video/mp4"; // isom, mp42, avc1, iso5…
    }
    // EBML: contenedor de WebM y MKV; el códec decide si es audio o video
    if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
    if (startsWith(buf, [0x49, 0x44, 0x33])) return "audio/mpeg";        // ID3
    if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "audio/mpeg"; // MPEG sync
    if (ascii(buf, 0, "OggS")) return "audio/ogg";
    return null;
}

/** Duración de un video/audio, en segundos (0 si no se puede leer). */
export function mediaDuration(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const el = document.createElement(file.type.startsWith("audio") ? "audio" : "video");
        const limpiar = () => { URL.revokeObjectURL(url); };
        el.preload = "metadata";
        el.onloadedmetadata = () => { const d = el.duration; limpiar(); resolve(Number.isFinite(d) ? d : 0); };
        el.onerror = () => { limpiar(); resolve(0); };
        el.src = url;
        setTimeout(() => { limpiar(); resolve(0); }, 8000);
    });
}

/**
 * Valida un archivo para el chat.
 * @returns {Promise<{ok: true} | {ok: false, motivo: string}>}
 */
export async function guardChatFile(file, kind) {
    if (!file) return { ok: false, motivo: "Archivo vacío." };
    if (file.size > MAX_BYTES) {
        return { ok: false, motivo: `"${file.name}" supera los 25 MB.` };
    }

    const cabecera = new Uint8Array(await file.slice(0, 32).arrayBuffer());

    // --- Documentos y comprimidos ---
    if (kind === "file") {
        const ext = extensionDe(file.name);
        if (!ext) return { ok: false, motivo: `"${file.name}" no tiene extensión, no se puede comprobar qué es.` };
        if (EXT_BLOQUEADAS.has(ext)) {
            return { ok: false, motivo: `Los archivos .${ext} no se pueden enviar: son programas y podrían dañar el equipo de quien los reciba.` };
        }
        if (!DOC_EXT.has(ext)) {
            return { ok: false, motivo: `No se permiten archivos .${ext}. Puedes enviar documentos, hojas de cálculo, PDF, imágenes o comprimidos.` };
        }
        // Aunque la extensión sea inofensiva, el CONTENIDO manda.
        const prog = esEjecutable(cabecera);
        if (prog) {
            return { ok: false, motivo: `"${file.name}" dice ser .${ext} pero por dentro es un ${prog}. No se puede enviar.` };
        }
        return { ok: true, riesgoso: RIESGOSOS.has(ext) };
    }

    // --- Medios incrustados (imagen, video, audio) ---
    const permitidos = ALLOWED[kind];
    if (!permitidos) return { ok: false, motivo: "Tipo de adjunto no permitido." };

    const real = sniff(cabecera);

    if (!real) {
        return {
            ok: false,
            motivo: `"${file.name}" no es un archivo de ${kind === "image" ? "imagen" : kind === "video" ? "video" : "audio"} válido. ` +
                "Puede que la extensión no coincida con el contenido real.",
        };
    }

    // WebM sirve para audio y video: se acepta en ambas categorías.
    const encaja = permitidos.includes(real) ||
        (kind === "audio" && real === "video/webm");
    if (!encaja) {
        return { ok: false, motivo: `"${file.name}" no es un ${kind} permitido (se detectó ${real}).` };
    }

    if (kind === "video") {
        const secs = await mediaDuration(file);
        if (secs > MAX_VIDEO_SECS + 0.5) {
            const m = Math.floor(secs / 60), s = Math.round(secs % 60);
            return {
                ok: false,
                motivo: `El video dura ${m}:${String(s).padStart(2, "0")} y el máximo es 1:30. Recórtalo antes de enviarlo.`,
            };
        }
    }

    return { ok: true, tipoReal: real };
}

/** Valida varios y separa los que pasan de los que no. */
export async function guardChatFiles(files, kind) {
    const ok = [], errores = [];
    for (const f of Array.from(files || [])) {
        const r = await guardChatFile(f, kind);
        if (r.ok) ok.push(f); else errores.push(r.motivo);
    }
    return { ok, errores };
}
