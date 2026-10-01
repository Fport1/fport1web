// Puente para adjuntar un archivo grande a una release.
//
// Por qué no se sube directo: una función de Vercel no admite cuerpos de más de
// 4,5 MB, y un modpack pesa mucho más. Así que el navegador deja el archivo en
// `fport1/tmp/{uid}/…` (Storage) y aquí el servidor lo pasa a GitHub, donde ese
// límite no aplica, y borra el temporal.
//
// El temporal se borra SIEMPRE, también si GitHub falla: si no, cada intento
// fallido dejaría cientos de megas ocupando sitio y costando dinero.
import { NextResponse } from 'next/server'
import { exigirFport1, leerToken } from '@/lib/githubServidor'
import { getAdminBucket } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Copiar cientos de megas lleva su tiempo; sin esto Vercel corta a los 10 s.
export const maxDuration = 300

const REPO = /^[\w.-]+\/[\w.-]+$/
const MAX_BYTES = 500 * 1024 * 1024

export async function POST(req) {
  const s = await exigirFport1(req)
  if (s.error) return NextResponse.json({ error: s.error }, { status: s.status })

  let b
  try { b = await req.json() } catch { return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 }) }
  const { repo, releaseId, rutaTemporal, filename, contentType = 'application/octet-stream' } = b || {}

  if (!REPO.test(String(repo || '')) || !releaseId) return NextResponse.json({ error: 'parametros_invalidos' }, { status: 400 })
  if (!filename || /[/\\]/.test(filename)) return NextResponse.json({ error: 'nombre_invalido' }, { status: 400 })
  // La ruta temporal tiene que ser la del propio admin: si no, esto serviría
  // para publicar cualquier archivo del bucket.
  if (typeof rutaTemporal !== 'string' || !rutaTemporal.startsWith(`fport1/tmp/${s.uid}/`)) {
    return NextResponse.json({ error: 'ruta_temporal_invalida' }, { status: 400 })
  }

  const token = await leerToken(s.uid)
  if (!token) return NextResponse.json({ error: 'sin_conexion' }, { status: 401 })

  const archivo = getAdminBucket().file(rutaTemporal)
  try {
    const [existe] = await archivo.exists()
    if (!existe) return NextResponse.json({ error: 'temporal_no_encontrado' }, { status: 404 })

    const [meta] = await archivo.getMetadata()
    const tamano = Number(meta.size || 0)
    if (!tamano || tamano > MAX_BYTES) return NextResponse.json({ error: 'tamano_invalido', tamano }, { status: 400 })

    const [contenido] = await archivo.download()

    // Si ya había un adjunto con ese nombre, GitHub rechaza el nuevo.
    const lista = await fetch(`https://api.github.com/repos/${repo}/releases/${releaseId}/assets`, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
    }).then(r => r.json()).catch(() => [])
    const repetido = Array.isArray(lista) && lista.find(a => a.name === filename)
    if (repetido) {
      await fetch(`https://api.github.com/repos/${repo}/releases/assets/${repetido.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }

    const subida = await fetch(
      `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(filename)}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
          'Content-Length': String(tamano),
        },
        body: contenido,
      },
    )
    const asset = await subida.json().catch(() => null)
    if (!subida.ok) {
      return NextResponse.json({ error: 'github', detalle: asset?.message }, { status: subida.status })
    }

    return NextResponse.json({
      asset: {
        id: asset.id, name: asset.name, size: asset.size,
        url: asset.browser_download_url, htmlUrl: asset.browser_download_url,
      },
    })
  } catch (e) {
    console.error('[github asset]', e?.message)
    return NextResponse.json({ error: 'fallo_al_copiar' }, { status: 500 })
  } finally {
    // Pase lo que pase, el temporal no se queda.
    await archivo.delete().catch(() => {})
  }
}
