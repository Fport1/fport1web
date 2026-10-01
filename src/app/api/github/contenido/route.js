// Imágenes del catálogo en el repo público de contenido.
//
// Son pequeñas (icono, portada, galería), así que sí caben en una función de
// Vercel y no hace falta el puente de Storage. Se devuelven ya con la URL de
// jsDelivr fijada al commit.
import { NextResponse } from 'next/server'
import { exigirFport1, apiGitHub } from '@/lib/githubServidor'
import { REPO_CONTENIDO, rutaDeImagen, urlDeImagen, pathDeImagen } from '@/lib/convencionesGitHub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 4 * 1024 * 1024 // por debajo del tope de Vercel, con margen
const TIPOS = ['icon', 'banner', 'gallery']
const IMAGENES = /^image\/(png|jpeg|webp|gif)$/

/** Crea el repo de contenido si aún no existe. Es público a propósito: jsDelivr
 *  solo sirve repos públicos. */
async function asegurarRepo(uid, owner) {
  const existe = await apiGitHub(uid, `/repos/${owner}/${REPO_CONTENIDO}`)
  if (existe.ok) return { ok: true }
  const creado = await apiGitHub(uid, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: REPO_CONTENIDO, private: false, auto_init: true,
      description: 'Imágenes y archivos del catálogo de Fport1.',
    }),
  })
  return creado.ok ? { ok: true } : { ok: false, detalle: creado.cuerpo?.message }
}

/** PUT — sube (o reemplaza) una imagen. Espera base64 en el cuerpo. */
export async function PUT(req) {
  const s = await exigirFport1(req)
  if (s.error) return NextResponse.json({ error: s.error }, { status: s.status })

  let b
  try { b = await req.json() } catch { return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 }) }
  const { owner, slug, tipo, nombre, contenidoBase64, contentType, rutaAnterior } = b || {}

  if (!owner || !slug) return NextResponse.json({ error: 'faltan_datos' }, { status: 400 })
  if (!TIPOS.includes(tipo)) return NextResponse.json({ error: 'tipo_invalido' }, { status: 400 })
  if (!IMAGENES.test(String(contentType || ''))) return NextResponse.json({ error: 'solo_imagenes' }, { status: 400 })
  if (typeof contenidoBase64 !== 'string' || !contenidoBase64) return NextResponse.json({ error: 'sin_contenido' }, { status: 400 })

  // base64 ocupa ~4/3 de lo que ocupan los bytes reales.
  if (Math.floor(contenidoBase64.length * 0.75) > MAX_BYTES) {
    return NextResponse.json({ error: 'demasiado_grande', max: MAX_BYTES }, { status: 400 })
  }

  const repo = await asegurarRepo(s.uid, owner)
  if (!repo.ok) return NextResponse.json({ error: 'no_hay_repo_contenido', detalle: repo.detalle }, { status: 502 })

  const ruta = rutaDeImagen({ slug, tipo, nombre })
  const r = await apiGitHub(s.uid, `/repos/${owner}/${REPO_CONTENIDO}/contents/${encodeURI(ruta)}`, {
    method: 'PUT',
    body: JSON.stringify({ message: `Imagen ${tipo} de ${slug}`, content: contenidoBase64 }),
  })
  if (!r.ok) return NextResponse.json({ error: 'github', detalle: r.cuerpo?.message }, { status: r.status || 502 })

  const commitSha = r.cuerpo?.commit?.sha
  // Al reemplazar, se borra la anterior para no dejar imágenes sueltas que ya
  // no se ven en ningún sitio pero siguen ocupando el repo.
  if (rutaAnterior && typeof rutaAnterior === 'string' && rutaAnterior.startsWith('gh:')) {
    const previa = rutaAnterior.split(':').slice(2).join(':')
    if (previa) await borrarRuta(s.uid, owner, previa).catch(() => {})
  }

  return NextResponse.json({
    imagen: {
      url: urlDeImagen({ owner, ruta, commitSha }),
      path: pathDeImagen({ owner, ruta }),
      commitSha,
    },
  })
}

async function borrarRuta(uid, owner, ruta) {
  // La API de contenidos exige el sha del archivo para borrarlo.
  const actual = await apiGitHub(uid, `/repos/${owner}/${REPO_CONTENIDO}/contents/${encodeURI(ruta)}`)
  if (!actual.ok || !actual.cuerpo?.sha) return false
  const r = await apiGitHub(uid, `/repos/${owner}/${REPO_CONTENIDO}/contents/${encodeURI(ruta)}`, {
    method: 'DELETE',
    body: JSON.stringify({ message: `Quitar ${ruta}`, sha: actual.cuerpo.sha }),
  })
  return r.ok
}

/** DELETE — quita una imagen del repo de contenido. */
export async function DELETE(req) {
  const s = await exigirFport1(req)
  if (s.error) return NextResponse.json({ error: s.error }, { status: s.status })

  const url = new URL(req.url)
  const owner = url.searchParams.get('owner')
  const path = url.searchParams.get('path') // formato gh:owner/repo:ruta
  if (!owner || !path?.startsWith('gh:')) return NextResponse.json({ error: 'parametros_invalidos' }, { status: 400 })

  const ruta = path.split(':').slice(2).join(':')
  if (!ruta) return NextResponse.json({ error: 'ruta_invalida' }, { status: 400 })

  const ok = await borrarRuta(s.uid, owner, ruta)
  return NextResponse.json({ ok })
}
