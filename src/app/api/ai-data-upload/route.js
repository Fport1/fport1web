// src/app/api/ai-data-upload/route.js
// Entrega una URL firmada para que el launcher suba UNA serie de rendimiento.
//
// Las series por minuto de una partida no caben bien en Firestore, así que van
// a Storage comprimidas. No se abre la escritura del bucket: el cliente pide
// aquí un permiso puntual y el servidor decide la ruta, el tipo y el tamaño.
//
// Esto NO lleva sesión: el launcher sube aprendizaje anónimo y la mayoría de
// quienes lo usan no tienen cuenta. Por eso el control es por IP (y por
// instalación, que ayuda a repartir el cupo pero NO es una identidad: el id lo
// manda el propio cliente y puede inventarse). Si algún día hay abuso de
// verdad, el paso siguiente es App Check o una sesión anónima.
import { NextResponse } from "next/server";
import { getAdminBucket } from "@/lib/firebaseAdmin";
import { rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 262144;          // 256 KB por archivo
const VALIDEZ_MS = 10 * 60 * 1000; // la URL caduca en 10 minutos
const POR_DIA_INSTALACION = 20;
const POR_DIA_IP = 60;             // varias instalaciones pueden salir por la misma IP
const DIA_MS = 24 * 60 * 60 * 1000;
const TIPO = "application/gzip";

const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function ipDe(req) {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "desconocida";
}

export async function POST(req) {
  let kind, size, installId;
  try { ({ kind, size, installId } = await req.json()); }
  catch { return NextResponse.json({ error: "bad_body" }, { status: 400 }); }

  // Por ahora solo hay un tipo de serie; la lista se amplía aquí, no en el cliente.
  if (kind !== "perf") return NextResponse.json({ error: "kind_invalido" }, { status: 400 });

  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_BYTES) {
    return NextResponse.json({ error: "tamano_invalido", max: MAX_BYTES }, { status: 400 });
  }
  if (typeof installId !== "string" || !ID_VALIDO.test(installId)) {
    return NextResponse.json({ error: "installId_invalido" }, { status: 400 });
  }

  // Dos cupos: el de la instalación reparte, el de la IP es el que de verdad frena.
  const porIp = await rateLimit(`aiData:ip:${ipDe(req)}`, POR_DIA_IP, DIA_MS);
  if (!porIp.ok) {
    return NextResponse.json({ error: "rate_limited", retryAfter: porIp.retryAfter }, { status: 429 });
  }
  const porInstalacion = await rateLimit(`aiData:install:${installId}`, POR_DIA_INSTALACION, DIA_MS);
  if (!porInstalacion.ok) {
    return NextResponse.json({ error: "rate_limited", retryAfter: porInstalacion.retryAfter }, { status: 429 });
  }

  // La ruta la decide el servidor: el cliente no elige dónde escribe.
  const ahora = new Date();
  const aaaa = ahora.getUTCFullYear();
  const mm = String(ahora.getUTCMonth() + 1).padStart(2, "0");
  const id = crypto.randomUUID().replace(/-/g, "");
  const ruta = `ai-data/perf/${aaaa}/${mm}/${id}.json.gz`;

  try {
    const [url] = await getAdminBucket().file(ruta).getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + VALIDEZ_MS,
      contentType: TIPO,
      // Sin esto el límite de tamaño sería solo de palabra: la URL firmada
      // aceptaría un archivo de cualquier peso. Con la cabecera, lo rechaza
      // el propio Storage. El launcher TIENE que enviarla tal cual.
      extensionHeaders: { "x-goog-content-length-range": `0,${MAX_BYTES}` },
    });

    return NextResponse.json({
      url,
      ruta,
      metodo: "PUT",
      expiraEn: VALIDEZ_MS / 1000,
      cabeceras: {
        "Content-Type": TIPO,
        "x-goog-content-length-range": `0,${MAX_BYTES}`,
      },
    });
  } catch (err) {
    console.error("[ai-data-upload]", err);
    return NextResponse.json({ error: "no_se_pudo_firmar" }, { status: 500 });
  }
}
