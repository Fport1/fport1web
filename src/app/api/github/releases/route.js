// Releases: crear o actualizar la de una versión, y borrarla con su etiqueta.
import { NextResponse } from 'next/server'
import { exigirFport1, apiGitHub } from '@/lib/githubServidor'
import { etiquetaDeRelease, marcasDeCanal, cuerpoDeRelease, REPO_CONTENIDO } from '@/lib/convencionesGitHub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REPO = /^[\w.-]+\/[\w.-]+$/

/** POST — crea la release, o la actualiza si la etiqueta ya existía. */
export async function POST(req) {
  const s = await exigirFport1(req)
  if (s.error) return NextResponse.json({ error: s.error }, { status: s.status })

  let b
  try { b = await req.json() } catch { return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 }) }
  const { repo, slug, version, nombre, canal = 'release', changelog = '', gameVersions = [], loaders = [] } = b || {}

  if (!REPO.test(String(repo || ''))) return NextResponse.json({ error: 'repo_invalido' }, { status: 400 })
  if (!String(version || '').trim()) return NextResponse.json({ error: 'falta_version' }, { status: 400 })
  if (!['release', 'beta', 'alpha'].includes(canal)) return NextResponse.json({ error: 'canal_invalido' }, { status: 400 })

  // En el repo de contenido conviven varios proyectos, así que la etiqueta
  // lleva el slug delante para no chocar.
  const enContenido = repo.endsWith(`/${REPO_CONTENIDO}`)
  if (enContenido && !slug) return NextResponse.json({ error: 'falta_slug' }, { status: 400 })
  const tag = etiquetaDeRelease({ version, slug, enRepoDeContenido: enContenido })

  const datos = {
    tag_name: tag,
    name: nombre || `${slug || ''} ${version}`.trim(),
    body: cuerpoDeRelease({ changelog, gameVersions, loaders }),
    ...marcasDeCanal(canal),
  }

  // Si ya existe esa etiqueta, se actualiza en vez de fallar: así reintentar
  // una publicación a medias no deja el repo en un estado raro.
  const existente = await apiGitHub(s.uid, `/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`)
  const r = existente.ok
    ? await apiGitHub(s.uid, `/repos/${repo}/releases/${existente.cuerpo.id}`, { method: 'PATCH', body: JSON.stringify(datos) })
    : await apiGitHub(s.uid, `/repos/${repo}/releases`, { method: 'POST', body: JSON.stringify(datos) })

  if (!r.ok) return NextResponse.json({ error: 'github', detalle: r.cuerpo?.message }, { status: r.status || 502 })
  return NextResponse.json({
    release: { id: r.cuerpo.id, tag, htmlUrl: r.cuerpo.html_url, uploadUrl: r.cuerpo.upload_url, actualizada: existente.ok },
  })
}

/** DELETE — borra la release y, si se pide, también su etiqueta. */
export async function DELETE(req) {
  const s = await exigirFport1(req)
  if (s.error) return NextResponse.json({ error: s.error }, { status: s.status })

  const url = new URL(req.url)
  const repo = url.searchParams.get('repo')
  const releaseId = url.searchParams.get('releaseId')
  const tag = url.searchParams.get('tag')
  if (!REPO.test(String(repo || '')) || !releaseId) {
    return NextResponse.json({ error: 'parametros_invalidos' }, { status: 400 })
  }

  const r = await apiGitHub(s.uid, `/repos/${repo}/releases/${releaseId}`, { method: 'DELETE' })
  // 404 se da por bueno: si ya no está, el objetivo está cumplido.
  if (!r.ok && r.status !== 404) {
    return NextResponse.json({ error: 'github', detalle: r.cuerpo?.message }, { status: r.status || 502 })
  }

  // Borrar la release deja la etiqueta huérfana, y entonces volver a publicar
  // esa misma versión reutilizaría un commit viejo.
  let etiquetaBorrada = false
  if (tag) {
    const t = await apiGitHub(s.uid, `/repos/${repo}/git/refs/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' })
    etiquetaBorrada = t.ok || t.status === 404
  }
  return NextResponse.json({ ok: true, etiquetaBorrada })
}
