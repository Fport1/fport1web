// Repos de @fport1: listar, crear y actualizar descripción y topics.
import { NextResponse } from 'next/server'
import { exigirFport1, apiGitHub } from '@/lib/githubServidor'
import { topicsDeProyecto, LICENCIAS_ABIERTAS } from '@/lib/convencionesGitHub'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NOMBRE_REPO = /^[A-Za-z0-9._-]{1,100}$/

/** GET — repos donde se puede publicar (los que admiten escritura). */
export async function GET(req) {
  const s = await exigirFport1(req)
  if (s.error) return NextResponse.json({ error: s.error }, { status: s.status })

  const r = await apiGitHub(s.uid, '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator')
  if (!r.ok) return NextResponse.json({ error: 'github', detalle: r.cuerpo?.message }, { status: r.status || 502 })

  return NextResponse.json({
    repos: (r.cuerpo || [])
      .filter(x => x.permissions?.push) // sin permiso de escritura no sirve para publicar
      .map(x => ({
        fullName: x.full_name, name: x.name, owner: x.owner?.login,
        privado: x.private, descripcion: x.description, topics: x.topics || [],
        url: x.html_url, actualizado: x.updated_at,
      })),
  })
}

/** POST — crea un repo. */
export async function POST(req) {
  const s = await exigirFport1(req)
  if (s.error) return NextResponse.json({ error: s.error }, { status: s.status })

  let cuerpo
  try { cuerpo = await req.json() } catch { return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 }) }
  const { nombre, descripcion = '', privado = false, licencia = null, proyecto = null } = cuerpo || {}

  if (!NOMBRE_REPO.test(String(nombre || ''))) {
    return NextResponse.json({ error: 'nombre_invalido' }, { status: 400 })
  }
  // Un proyecto de código abierto no puede vivir en un repo privado: nadie
  // podría ver el código que decimos que es abierto.
  if (proyecto?.openSource && privado) {
    return NextResponse.json({ error: 'abierto_no_puede_ser_privado' }, { status: 400 })
  }

  const plantilla = LICENCIAS_ABIERTAS.find(l => l.id === licencia)?.plantilla || undefined
  const r = await apiGitHub(s.uid, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: nombre, description: descripcion.slice(0, 350), private: !!privado,
      auto_init: true, license_template: plantilla,
    }),
  })
  if (!r.ok) return NextResponse.json({ error: 'github', detalle: r.cuerpo?.message }, { status: r.status || 502 })

  // Los topics van en otra llamada: crear el repo no los acepta.
  if (proyecto) {
    await apiGitHub(s.uid, `/repos/${r.cuerpo.full_name}/topics`, {
      method: 'PUT', body: JSON.stringify({ names: topicsDeProyecto(proyecto) }),
    })
  }
  return NextResponse.json({ repo: { fullName: r.cuerpo.full_name, url: r.cuerpo.html_url, privado: r.cuerpo.private } })
}

/** PATCH — sincroniza descripción y topics con la ficha del proyecto. */
export async function PATCH(req) {
  const s = await exigirFport1(req)
  if (s.error) return NextResponse.json({ error: s.error }, { status: s.status })

  let cuerpo
  try { cuerpo = await req.json() } catch { return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 }) }
  const { repo, descripcion, proyecto, homepage } = cuerpo || {}
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repo || ''))) {
    return NextResponse.json({ error: 'repo_invalido' }, { status: 400 })
  }

  if (descripcion !== undefined || homepage !== undefined) {
    const r = await apiGitHub(s.uid, `/repos/${repo}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(descripcion !== undefined ? { description: String(descripcion).slice(0, 350) } : {}),
        ...(homepage !== undefined ? { homepage } : {}),
      }),
    })
    if (!r.ok) return NextResponse.json({ error: 'github', detalle: r.cuerpo?.message }, { status: r.status || 502 })
  }

  let topics
  if (proyecto) {
    topics = topicsDeProyecto(proyecto)
    const t = await apiGitHub(s.uid, `/repos/${repo}/topics`, {
      method: 'PUT', body: JSON.stringify({ names: topics }),
    })
    if (!t.ok) return NextResponse.json({ error: 'github', detalle: t.cuerpo?.message }, { status: t.status || 502 })
  }
  return NextResponse.json({ ok: true, topics })
}
