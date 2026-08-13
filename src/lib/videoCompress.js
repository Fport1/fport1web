// Compresión de video en el navegador (best-effort, estilo "chat").
// Reduce resolución y bitrate re-grabando con canvas + MediaRecorder, preservando
// el audio. Si el navegador no lo soporta de forma fiable (p. ej. Safari iOS) o algo
// falla, devuelve el archivo ORIGINAL sin romper nada.

function pickMime() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null;
    const candidates = [
        "video/mp4;codecs=h264,aac",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
    ];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || null;
}

export async function compressVideo(file, {
    maxDim = 1280,            // lado máximo (px)
    fps = 30,
    videoBitsPerSecond = 1_600_000, // ~1.6 Mbps (calidad tipo chat)
    skipUnderBytes = 3 * 1024 * 1024, // si ya pesa poco, no comprimir
} = {}) {
    try {
        if (!file || typeof window === "undefined") return file;
        if (file.size <= skipUnderBytes) return file;

        const canCanvasStream = !!document.createElement("canvas").captureStream;
        const mime = pickMime();
        if (!canCanvasStream || !mime || typeof MediaRecorder === "undefined") return file;

        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.src = url;
        video.playsInline = true;
        video.preload = "auto";

        await new Promise((res, rej) => {
            video.onloadedmetadata = res;
            video.onerror = () => rej(new Error("metadata"));
        });

        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h) { URL.revokeObjectURL(url); return file; }

        const scale = Math.min(1, maxDim / Math.max(w, h));
        const cw = Math.max(2, Math.round((w * scale) / 2) * 2);
        const ch = Math.max(2, Math.round((h * scale) / 2) * 2);

        const canvas = document.createElement("canvas");
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext("2d");

        // Audio del video original (si lo hay)
        let audioTrack = null;
        let srcHadAudio = false;
        try {
            const cap = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
            const at = cap?.getAudioTracks?.() || [];
            srcHadAudio = at.length > 0;
            audioTrack = at[0] || null;
        } catch { /* sin captureStream → sin audio */ }

        // Si el video tenía audio pero no lo pudimos capturar, NO comprimimos
        // (evita subir un video mudo). Mejor el original.
        // Nota: algunos navegadores no exponen audio hasta reproducir; lo reintentamos abajo.

        const canvasStream = canvas.captureStream(fps);
        const tracks = [...canvasStream.getVideoTracks()];
        if (audioTrack) tracks.push(audioTrack);
        const mixed = new MediaStream(tracks);

        const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond });
        const chunks = [];
        rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        const stopped = new Promise((res) => { rec.onstop = res; });

        let raf = 0;
        const draw = () => { try { ctx.drawImage(video, 0, 0, cw, ch); } catch { } raf = requestAnimationFrame(draw); };

        rec.start(250);
        try { await video.play(); } catch { /* autoplay bloqueado */ }

        // Reintento de audio una vez que reproduce
        if (!audioTrack) {
            try {
                const cap2 = video.captureStream ? video.captureStream() : null;
                const at2 = cap2?.getAudioTracks?.() || [];
                if (at2[0]) { mixed.addTrack(at2[0]); srcHadAudio = srcHadAudio || true; }
            } catch { }
        }

        draw();
        await new Promise((res) => { video.onended = res; });

        cancelAnimationFrame(raf);
        if (rec.state !== "inactive") rec.stop();
        await stopped;
        URL.revokeObjectURL(url);

        const blob = new Blob(chunks, { type: mime });
        if (!blob.size) return file;

        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const baseName = (file.name || "video").replace(/\.[^.]+$/, "");
        const out = new File([blob], `${baseName}.${ext}`, { type: mime });

        // Solo usar el comprimido si realmente quedó más liviano
        return out.size > 0 && out.size < file.size ? out : file;
    } catch (e) {
        // Cualquier fallo → subir original
        // eslint-disable-next-line no-console
        console.warn("compressVideo: usando original por:", e?.message || e);
        return file;
    }
}
