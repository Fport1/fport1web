// Proxy de descarga: el navegador pide a NUESTRO origen, el servidor trae el
// archivo de Firebase Storage y lo devuelve con Content-Disposition: attachment.
// Así "Guardar como…" descarga de verdad (no abre otra pestaña) sin necesitar
// configurar CORS en el bucket.
import { NextResponse } from "next/server";

// Solo permitimos descargar desde el Storage del proyecto (evita SSRF / proxy abierto).
const ALLOWED = /^https:\/\/(firebasestorage\.googleapis\.com|[a-z0-9.-]+\.firebasestorage\.app|storage\.googleapis\.com)\//i;

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    const name = searchParams.get("name") || "descarga";

    if (!url || !ALLOWED.test(url)) {
        return NextResponse.json({ error: "invalid_url" }, { status: 400 });
    }

    let upstream;
    try {
        upstream = await fetch(url);
    } catch {
        return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
    }
    if (!upstream.ok) {
        return NextResponse.json({ error: "not_found" }, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const safeName = name.replace(/[\r\n"]/g, "_");
    const body = await upstream.arrayBuffer();

    return new NextResponse(body, {
        headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(name)}`,
            "Cache-Control": "private, max-age=0, no-store",
        },
    });
}
