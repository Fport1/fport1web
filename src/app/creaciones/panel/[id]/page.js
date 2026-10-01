'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/components/auth-context'
import { TIPOS, CATEGORIAS } from '@/lib/catalogo'
import { LICENCIAS_ABIERTAS, LICENCIAS_CERRADAS, repoDeReleases, etiquetaDeRelease, pathDeArchivo, REPO_CONTENIDO } from '@/lib/convencionesGitHub'
import EditorMarkdown, { marcadoDeImagen, COLOCACIONES } from '@/components/panel/EditorMarkdown'
import {
  estadoGitHub, listarRepos, crearRepo, sincronizarRepo,
  crearRelease, borrarRelease, subirImagen, borrarImagen, subirArchivoDeVersion,
} from '@/lib/panelApi'

const SOPORTES = [['required', 'Obligatorio'], ['optional', 'Opcional'], ['unsupported', 'No compatible']]
const CANALES = [['release', 'Release'], ['beta', 'Beta'], ['alpha', 'Alpha']]
const listaDesde = t => String(t || '').split(',').map(x => x.trim()).filter(Boolean)

export default function EditorProyecto() {
  const { id } = useParams()
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const esAdmin = profile?.usernameSlug === 'fport1'

  const [p, setP] = useState(undefined)
  const [versiones, setVersiones] = useState([])
  const [github, setGithub] = useState(null)
  const [repos, setRepos] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [seccion, setSeccion] = useState('ficha')
  const sinGuardar = useRef(false)

  useEffect(() => { if (!loading && !user) router.push('/login') }, [loading, user, router])

  useEffect(() => {
    if (!esAdmin || !db || !id) return
    const unsub = onSnapshot(doc(db, 'fport1_projects', String(id)), s => {
      // No pisamos lo que esté editando: solo cargamos la primera vez.
      if (!sinGuardar.current) setP(s.exists() ? { id: s.id, ...s.data() } : null)
    }, () => setP(null))
    return () => unsub()
  }, [esAdmin, id])

  useEffect(() => {
    if (!esAdmin || !db || !id) return
    const q = query(collection(db, 'fport1_projects', String(id), 'versions'), orderBy('publishedAt', 'desc'))
    const unsub = onSnapshot(q, s => setVersiones(s.docs.map(d => ({ id: d.id, ...d.data() }))), () => setVersiones([]))
    return () => unsub()
  }, [esAdmin, id])

  useEffect(() => {
    if (!esAdmin) return
    estadoGitHub().then(g => {
      setGithub(g)
      if (g?.conectado) listarRepos().then(r => setRepos(r.repos || [])).catch(() => {})
    }).catch(() => setGithub({ conectado: false }))
  }, [esAdmin])

  const cambiar = useCallback((campos) => {
    sinGuardar.current = true
    setP(x => ({ ...x, ...campos }))
  }, [])

  async function guardar() {
    setGuardando(true); setAviso('')
    try {
      const { id: _, ...datos } = p
      await updateDoc(doc(db, 'fport1_projects', String(id)), { ...datos, updatedAt: serverTimestamp() })
      sinGuardar.current = false
      // Mantener el repo del código al día con la ficha es parte de publicar.
      if (github?.conectado && p.github?.sourceRepo) {
        await sincronizarRepo({
          repo: p.github.sourceRepo,
          descripcion: p.summary,
          homepage: `https://www.fport1.com/creaciones/${p.slug}`,
          proyecto: p,
        }).catch(() => {})
      }
      setAviso('Guardado.')
    } catch (e) {
      setAviso('No se pudo guardar: ' + (e?.code || e?.message))
    }
    setGuardando(false)
  }

  if (loading || !user) return <main className="pe"><p className="pe-aviso">Cargando…</p></main>
  if (!esAdmin) return <main className="pe"><p className="pe-aviso">Solo para @fport1.</p></main>
  if (p === undefined) return <main className="pe"><p className="pe-aviso">Cargando creación…</p></main>
  if (p === null) {
    return <main className="pe"><p className="pe-aviso">Esa creación no existe.</p>
      <Link href="/creaciones/panel" className="pe-enlace">← Volver</Link></main>
  }

  const owner = github?.login
  const propsComunes = { p, cambiar, owner, github, repos, setAviso }

  return (
    <main className="pe">
      <div className="pe-cabecera">
        <Link href="/creaciones/panel" className="pe-enlace">← Mis creaciones</Link>
        <div className="pe-acciones">
          {p.published && <Link href={`/creaciones/${p.slug}`} className="pe-enlace">Ver ficha ↗</Link>}
          <button className="pe-boton pe-secundario" onClick={() => cambiar({ published: !p.published })}>
            {p.published ? 'Despublicar' : 'Publicar'}
          </button>
          <button className="pe-boton" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>

      <h1 className="pe-titulo">{p.title}</h1>
      <p className="pe-sub">
        /creaciones/{p.slug} · {p.published ? 'Publicado' : 'Borrador'}
        {sinGuardar.current && <span className="pe-pendiente"> · cambios sin guardar</span>}
      </p>
      {aviso && <p className={`pe-mensaje ${aviso.startsWith('No se pudo') ? 'pe-error' : 'pe-ok'}`}>{aviso}</p>}

      <nav className="pe-pestanas">
        {[['ficha', 'Ficha'], ['descripcion', 'Descripción'], ['imagenes', 'Imágenes'],
          ['github', 'Código y GitHub'], ['versiones', `Versiones (${versiones.length})`]].map(([k, n]) => (
          <button key={k} className={`pe-pestana ${seccion === k ? 'activa' : ''}`} onClick={() => setSeccion(k)}>{n}</button>
        ))}
      </nav>

      {seccion === 'ficha' && <Ficha {...propsComunes} />}
      {seccion === 'descripcion' && <Descripcion {...propsComunes} />}
      {seccion === 'imagenes' && <Imagenes {...propsComunes} />}
      {seccion === 'github' && <GitHubSeccion {...propsComunes} />}
      {seccion === 'versiones' && <Versiones {...propsComunes} versiones={versiones} proyectoId={String(id)} />}

      <style>{estilos}</style>
    </main>
  )
}

/* ─────────────── Ficha ─────────────── */
function Ficha({ p, cambiar }) {
  return (
    <section className="pe-caja">
      <Campo etiqueta="Nombre">
        <input className="pe-input" value={p.title || ''} onChange={e => cambiar({ title: e.target.value })} />
      </Campo>
      <Campo etiqueta="Resumen" pista="Una línea, máximo 160 caracteres. Es lo que se ve en el catálogo.">
        <input className="pe-input" maxLength={160} value={p.summary || ''}
          onChange={e => cambiar({ summary: e.target.value })} />
        <span className="pe-contador">{(p.summary || '').length}/160</span>
      </Campo>
      <Campo etiqueta="Tipo">
        <select className="pe-input" value={p.type || 'modpack'} onChange={e => cambiar({ type: e.target.value })}>
          {TIPOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Categorías">
        <div className="pe-chips">
          {CATEGORIAS.map(c => {
            const puesta = (p.categories || []).includes(c.id)
            return (
              <button key={c.id} className={`pe-chip ${puesta ? 'activo' : ''}`}
                onClick={() => cambiar({ categories: puesta ? p.categories.filter(x => x !== c.id) : [...(p.categories || []), c.id] })}>
                {c.nombre}
              </button>
            )
          })}
        </div>
      </Campo>
      <Campo etiqueta="Etiquetas" pista="Separadas por comas. En minúsculas y con guiones.">
        <input className="pe-input" value={(p.tags || []).join(', ')}
          onChange={e => cambiar({ tags: listaDesde(e.target.value).map(t => t.toLowerCase().replace(/\s+/g, '-')) })} />
      </Campo>
      <div className="pe-dos">
        <Campo etiqueta="En el cliente">
          <select className="pe-input" value={p.clientSide || 'required'} onChange={e => cambiar({ clientSide: e.target.value })}>
            {SOPORTES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="En el servidor">
          <select className="pe-input" value={p.serverSide || 'optional'} onChange={e => cambiar({ serverSide: e.target.value })}>
            {SOPORTES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Enlaces" pista="Déjalo vacío si no aplica.">
        {[['issues', 'Reportar problemas'], ['wiki', 'Wiki'], ['discord', 'Discord'], ['website', 'Sitio web'], ['donate', 'Donar']].map(([k, n]) => (
          <div key={k} className="pe-enlace-fila">
            <span>{n}</span>
            <input className="pe-input" placeholder="https://…" value={p.links?.[k] || ''}
              onChange={e => cambiar({ links: { ...(p.links || {}), [k]: e.target.value } })} />
          </div>
        ))}
      </Campo>
      <label className="pe-check">
        <input type="checkbox" checked={!!p.featured} onChange={e => cambiar({ featured: e.target.checked })} />
        Destacar en el catálogo
      </label>
    </section>
  )
}

/* ─────────────── Descripción ─────────────── */
function Descripcion({ p, cambiar }) {
  function insertarDeGaleria() {
    const galeria = (p.gallery || []).filter(g => g?.url)
    if (!galeria.length) { alert('Sube imágenes en la pestaña «Imágenes» para poder insertarlas.'); return }
    const i = Number(prompt(`¿Cuál? (1 a ${galeria.length})\n` + galeria.map((g, n) => `${n + 1}. ${g.title || 'Sin título'}`).join('\n')))
    const img = galeria[i - 1]
    if (!img) return
    const colocacion = prompt('¿Dónde?\n' + COLOCACIONES.map((c, n) => `${n + 1}. ${c.nombre}`).join('\n'), '1')
    const col = COLOCACIONES[Number(colocacion) - 1]?.id || 'ancho'
    const ancho = col === 'ancho' ? 600 : Number(prompt('Ancho en píxeles:', col === 'centro' ? '600' : '300')) || 400
    cambiar({ description: `${p.description || ''}\n\n${marcadoDeImagen({ url: img.url, alt: img.title || '', colocacion: col, ancho })}\n` })
  }
  return (
    <section className="pe-caja">
      <p className="pe-pista" style={{ marginBottom: 12 }}>
        Así se verá en la ficha. Las imágenes centradas o flotantes se escriben con HTML, igual que en el launcher.
      </p>
      <EditorMarkdown valor={p.description} alCambiar={v => cambiar({ description: v })} alPedirImagen={insertarDeGaleria} />
    </section>
  )
}

/* ─────────────── Imágenes ─────────────── */
function Imagenes({ p, cambiar, owner, github, setAviso }) {
  const [subiendo, setSubiendo] = useState('')

  async function subir(tipo, archivo) {
    if (!archivo) return
    if (!github?.conectado) { setAviso('No se pudo guardar: conecta GitHub primero.'); return }
    setSubiendo(tipo)
    try {
      const anterior = tipo === 'icon' ? p.iconPath : tipo === 'banner' ? p.bannerPath : null
      const img = await subirImagen({ owner, slug: p.slug, tipo, archivo, rutaAnterior: anterior })
      if (tipo === 'icon') cambiar({ iconUrl: img.url, iconPath: img.path })
      else if (tipo === 'banner') cambiar({ bannerUrl: img.url, bannerPath: img.path })
      else cambiar({ gallery: [...(p.gallery || []), { url: img.url, path: img.path, title: '', description: '' }] })
      setAviso('Imagen subida. Recuerda guardar.')
    } catch (e) { setAviso('No se pudo guardar: ' + e.message) }
    setSubiendo('')
  }

  function mover(i, dir) {
    const g = [...(p.gallery || [])]
    const j = i + dir
    if (j < 0 || j >= g.length) return
    ;[g[i], g[j]] = [g[j], g[i]]
    cambiar({ gallery: g })
  }

  async function quitar(i) {
    const img = (p.gallery || [])[i]
    if (!confirm('¿Quitar esta imagen?')) return
    if (img?.path?.startsWith('gh:') && owner) await borrarImagen({ owner, path: img.path }).catch(() => {})
    cambiar({ gallery: p.gallery.filter((_, n) => n !== i) })
  }

  return (
    <section className="pe-caja">
      <div className="pe-dos">
        <Campo etiqueta="Icono" pista="Cuadrado. Es la cara de la creación.">
          {p.iconUrl && /* eslint-disable-next-line @next/next/no-img-element */
            <img src={p.iconUrl} alt="" className="pe-previa-icono" />}
          <input type="file" accept="image/*" disabled={subiendo === 'icon'}
            onChange={e => subir('icon', e.target.files?.[0])} />
        </Campo>
        <Campo etiqueta="Portada" pista="Ancha, alrededor de 4:1. Va arriba de la ficha.">
          {p.bannerUrl && /* eslint-disable-next-line @next/next/no-img-element */
            <img src={p.bannerUrl} alt="" className="pe-previa-banner" />}
          <input type="file" accept="image/*" disabled={subiendo === 'banner'}
            onChange={e => subir('banner', e.target.files?.[0])} />
        </Campo>
      </div>

      <Campo etiqueta="Galería" pista="La primera es la destacada. El orden es el que se ve en la ficha.">
        <input type="file" accept="image/*" disabled={subiendo === 'gallery'}
          onChange={e => subir('gallery', e.target.files?.[0])} />
        <div className="pe-galeria">
          {(p.gallery || []).map((g, i) => (
            <div key={i} className="pe-galeria-item">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.url} alt="" />
              <div className="pe-galeria-campos">
                {i === 0 && <span className="pe-destacada">Destacada</span>}
                <input className="pe-input" placeholder="Título" value={g.title || ''}
                  onChange={e => cambiar({ gallery: p.gallery.map((x, n) => n === i ? { ...x, title: e.target.value } : x) })} />
                <input className="pe-input" placeholder="Descripción" value={g.description || ''}
                  onChange={e => cambiar({ gallery: p.gallery.map((x, n) => n === i ? { ...x, description: e.target.value } : x) })} />
                <div className="pe-galeria-botones">
                  <button className="pe-mini" onClick={() => mover(i, -1)} disabled={i === 0}>↑</button>
                  <button className="pe-mini" onClick={() => mover(i, 1)} disabled={i === (p.gallery.length - 1)}>↓</button>
                  <button className="pe-mini" onClick={() => mover(i, -i)} disabled={i === 0}>Destacar</button>
                  <button className="pe-mini pe-peligro" onClick={() => quitar(i)}>Quitar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Campo>
    </section>
  )
}

/* ─────────────── Código y GitHub ─────────────── */
function GitHubSeccion({ p, cambiar, owner, github, repos, setAviso }) {
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [creando, setCreando] = useState(false)
  const licencias = p.openSource ? LICENCIAS_ABIERTAS : LICENCIAS_CERRADAS

  async function crear() {
    setCreando(true)
    try {
      const r = await crearRepo({
        nombre: nombreNuevo.trim() || p.slug,
        descripcion: p.summary, privado: !p.openSource && p.github?.sourcePrivate,
        licencia: p.license?.id, proyecto: p,
      })
      cambiar({ github: { ...(p.github || {}), sourceRepo: r.repo.fullName, releasesRepo: r.repo.privado ? '' : r.repo.fullName } })
      setAviso('Repo creado. Recuerda guardar.')
    } catch (e) { setAviso('No se pudo guardar: ' + e.message) }
    setCreando(false)
  }

  if (!github?.conectado) {
    return (
      <section className="pe-caja">
        <p className="pe-pista">Conecta GitHub para elegir dónde se publican las versiones.</p>
        <Link href="/creaciones/conectar" className="pe-boton">Conectar GitHub</Link>
      </section>
    )
  }

  return (
    <section className="pe-caja">
      <label className="pe-check">
        <input type="checkbox" checked={!!p.openSource}
          onChange={e => cambiar({ openSource: e.target.checked, license: null })} />
        El código es abierto
      </label>
      <p className="pe-pista">
        {p.openSource
          ? 'El repo tiene que ser público y el enlace al código se verá en la ficha.'
          : 'El repo puede ser privado. El enlace al código no se enseñará.'}
      </p>

      <Campo etiqueta="Licencia">
        <select className="pe-input" value={p.license?.id || ''}
          onChange={e => {
            const l = licencias.find(x => x.id === e.target.value)
            cambiar({ license: l ? { id: l.id, name: l.name } : null })
          }}>
          <option value="">Sin especificar</option>
          {licencias.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Campo>

      <Campo etiqueta="Repositorio del código">
        <select className="pe-input" value={p.github?.sourceRepo || ''}
          onChange={e => {
            const r = repos.find(x => x.fullName === e.target.value)
            cambiar({ github: { ...(p.github || {}), sourceRepo: e.target.value, sourcePrivate: !!r?.privado,
              releasesRepo: r?.privado ? '' : e.target.value } })
          }}>
          <option value="">Sin repositorio</option>
          {repos.map(r => <option key={r.fullName} value={r.fullName}>{r.fullName}{r.privado ? ' (privado)' : ''}</option>)}
        </select>
      </Campo>

      <Campo etiqueta="O crea uno nuevo">
        <div className="pe-fila-boton">
          <input className="pe-input" placeholder={p.slug} value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} />
          <button className="pe-boton" onClick={crear} disabled={creando}>{creando ? 'Creando…' : 'Crear repo'}</button>
        </div>
      </Campo>

      <div className="pe-nota">
        Las versiones se publicarán en <strong>{repoDeReleases(p, owner)}</strong>
        {p.github?.sourcePrivate && ` (el repo del código es privado, así que los archivos van al repo público ${REPO_CONTENIDO})`}.
      </div>
    </section>
  )
}

/* ─────────────── Versiones ─────────────── */
function Versiones({ p, owner, github, setAviso, versiones, proyectoId }) {
  const vacia = { versionNumber: '', name: '', channel: 'release', loaders: '', gameVersions: '', changelog: '' }
  const [f, setF] = useState(vacia)
  const [archivo, setArchivo] = useState(null)
  const [progreso, setProgreso] = useState(null)
  const [publicando, setPublicando] = useState(false)

  const repo = repoDeReleases(p, owner)
  const enContenido = repo.endsWith(`/${REPO_CONTENIDO}`)

  async function publicar() {
    if (!github?.conectado) { setAviso('No se pudo guardar: conecta GitHub primero.'); return }
    if (!f.versionNumber.trim() || !archivo) { setAviso('No se pudo guardar: falta la versión o el archivo.'); return }
    setPublicando(true); setProgreso(0)
    try {
      const loaders = listaDesde(f.loaders)
      const gameVersions = listaDesde(f.gameVersions)
      const r = await crearRelease({
        repo, slug: p.slug, version: f.versionNumber, nombre: f.name || `${p.title} ${f.versionNumber}`,
        canal: f.channel, changelog: f.changelog, gameVersions, loaders,
      })
      const asset = await subirArchivoDeVersion({ archivo, repo, releaseId: r.release.id, alAvanzar: setProgreso })

      const vid = f.versionNumber.replace(/[^\w.-]+/g, '_')
      await setDoc(doc(db, 'fport1_projects', proyectoId, 'versions', vid), {
        name: f.name || `${p.title} ${f.versionNumber}`, versionNumber: f.versionNumber,
        channel: f.channel, loaders, gameVersions, changelog: f.changelog,
        dependencies: [], downloads: 0,
        files: [{
          url: asset.url, path: pathDeArchivo({ repo, releaseId: r.release.id, tag: r.release.tag }),
          filename: asset.name, size: asset.size, sha1: '', primary: true, host: 'github',
          github: { repo, tag: r.release.tag, releaseId: r.release.id, assetId: asset.id, htmlUrl: r.release.htmlUrl },
        }],
        publishedAt: serverTimestamp(),
      })
      // La ficha enseña la última versión y dónde funciona.
      await updateDoc(doc(db, 'fport1_projects', proyectoId), {
        latestVersion: f.versionNumber,
        loaders: [...new Set([...(p.loaders || []), ...loaders])],
        gameVersions: [...new Set([...(p.gameVersions || []), ...gameVersions])],
        updatedAt: serverTimestamp(),
      })
      setF(vacia); setArchivo(null); setAviso('Versión publicada.')
    } catch (e) { setAviso('No se pudo guardar: ' + e.message) }
    setPublicando(false); setProgreso(null)
  }

  async function quitar(v) {
    if (!confirm(`¿Borrar la versión ${v.versionNumber}? También se borra su release en GitHub.`)) return
    const gh = v.files?.[0]?.github
    if (gh?.releaseId) await borrarRelease({ repo: gh.repo, releaseId: gh.releaseId, tag: gh.tag }).catch(() => {})
    await deleteDoc(doc(db, 'fport1_projects', proyectoId, 'versions', v.id)).catch(() => {})
    setAviso('Versión borrada.')
  }

  return (
    <section className="pe-caja">
      <h3 className="pe-h3">Nueva versión</h3>
      <div className="pe-dos">
        <Campo etiqueta="Número"><input className="pe-input" placeholder="1.2.0" value={f.versionNumber}
          onChange={e => setF({ ...f, versionNumber: e.target.value })} /></Campo>
        <Campo etiqueta="Canal">
          <select className="pe-input" value={f.channel} onChange={e => setF({ ...f, channel: e.target.value })}>
            {CANALES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </Campo>
      </div>
      <Campo etiqueta="Nombre" pista="Opcional."><input className="pe-input" value={f.name}
        onChange={e => setF({ ...f, name: e.target.value })} /></Campo>
      <div className="pe-dos">
        <Campo etiqueta="Loaders" pista="Separados por comas."><input className="pe-input" placeholder="forge, neoforge"
          value={f.loaders} onChange={e => setF({ ...f, loaders: e.target.value })} /></Campo>
        <Campo etiqueta="Versiones de Minecraft" pista="Separadas por comas."><input className="pe-input" placeholder="1.20.1, 1.21.1"
          value={f.gameVersions} onChange={e => setF({ ...f, gameVersions: e.target.value })} /></Campo>
      </div>
      <Campo etiqueta="Notas de la versión">
        <textarea className="pe-input pe-area" rows={4} value={f.changelog}
          onChange={e => setF({ ...f, changelog: e.target.value })} />
      </Campo>
      <Campo etiqueta="Archivo">
        <input type="file" onChange={e => setArchivo(e.target.files?.[0] || null)} />
        {archivo && <span className="pe-pista">{archivo.name} · {(archivo.size / 1048576).toFixed(1)} MB</span>}
      </Campo>
      {progreso !== null && (
        <div className="pe-progreso"><div style={{ width: `${progreso}%` }} /><span>{progreso}%</span></div>
      )}
      <p className="pe-pista">
        Se publicará en <strong>{repo}</strong> con la etiqueta <strong>
          {etiquetaDeRelease({ version: f.versionNumber || 'X.Y.Z', slug: p.slug, enRepoDeContenido: enContenido })}
        </strong>.
      </p>
      <button className="pe-boton" onClick={publicar} disabled={publicando || !github?.conectado}>
        {publicando ? 'Publicando…' : 'Publicar versión'}
      </button>

      <h3 className="pe-h3" style={{ marginTop: 30 }}>Publicadas</h3>
      {versiones.length === 0 ? <p className="pe-pista">Todavía ninguna.</p> : versiones.map(v => (
        <div key={v.id} className="pe-version">
          <div>
            <strong>{v.name || v.versionNumber}</strong>
            <p className="pe-pista">{v.channel} · {(v.loaders || []).join(', ')} · {(v.gameVersions || []).join(', ')} · ⬇ {v.downloads || 0}</p>
          </div>
          <button className="pe-mini pe-peligro" onClick={() => quitar(v)}>Borrar</button>
        </div>
      ))}
    </section>
  )
}

function Campo({ etiqueta, pista, children }) {
  return (
    <div className="pe-campo">
      <label className="pe-etiqueta">{etiqueta}</label>
      {pista && <p className="pe-pista">{pista}</p>}
      {children}
    </div>
  )
}

const estilos = `
  .pe { min-height:100vh; max-width:900px; margin:0 auto; padding:100px 20px 60px; position:relative; z-index:1; }
  .pe-cabecera { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:18px; flex-wrap:wrap; }
  .pe-acciones { display:flex; gap:10px; align-items:center; }
  .pe-titulo { font-family:'Rajdhani',sans-serif; font-size:32px; font-weight:700; margin:0 0 4px; }
  .pe-sub { color:var(--muted); font-size:13px; margin:0 0 16px; }
  .pe-pendiente { color:#fbbf24; }
  .pe-mensaje { font-size:13px; border-radius:9px; padding:10px 14px; margin:0 0 16px; }
  .pe-ok { background:rgba(74,222,128,.1); color:#4ade80; }
  .pe-error { background:rgba(239,68,68,.1); color:#f87171; }
  .pe-pestanas { display:flex; gap:4px; border-bottom:1px solid var(--border); margin-bottom:20px; flex-wrap:wrap; }
  .pe-pestana { background:none; border:none; color:var(--muted); font-size:14px; padding:10px 16px;
    cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .pe-pestana.activa { color:var(--accent2); font-weight:600; border-bottom-color:var(--accent2); }
  .pe-caja { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:24px; }
  .pe-campo { margin-bottom:18px; position:relative; }
  .pe-etiqueta { display:block; font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin-bottom:6px; }
  .pe-pista { font-size:12px; color:var(--muted); margin:0 0 8px; }
  .pe-input { width:100%; background:var(--bg3); border:1px solid var(--border); border-radius:9px;
    padding:10px 13px; color:var(--text); font-size:14px; outline:none; box-sizing:border-box; }
  .pe-input:focus { border-color:var(--accent); }
  .pe-area { font-family:inherit; line-height:1.6; resize:vertical; }
  .pe-contador { position:absolute; right:10px; bottom:10px; font-size:11px; color:var(--muted); }
  .pe-dos { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .pe-chips { display:flex; gap:6px; flex-wrap:wrap; }
  .pe-chip { font-size:12px; background:var(--bg3); border:1px solid var(--border); border-radius:999px;
    padding:5px 12px; color:var(--sub); cursor:pointer; transition:all .15s; }
  .pe-chip.activo { background:var(--accent); border-color:var(--accent); color:#fff; }
  .pe-check { display:flex; align-items:center; gap:9px; font-size:14px; color:var(--sub); cursor:pointer; margin-bottom:10px; }
  .pe-check input { accent-color:var(--accent); cursor:pointer; }
  .pe-enlace-fila { display:grid; grid-template-columns:150px 1fr; gap:10px; align-items:center; margin-bottom:8px; font-size:13px; color:var(--sub); }
  .pe-fila-boton { display:flex; gap:10px; }
  .pe-boton { background:var(--accent); color:#fff; border:none; border-radius:9px; padding:10px 20px;
    font-size:14px; font-weight:600; cursor:pointer; text-decoration:none; display:inline-block; }
  .pe-boton:hover:not(:disabled) { background:var(--accent2); }
  .pe-boton:disabled { opacity:.5; cursor:not-allowed; }
  .pe-secundario { background:transparent; border:1px solid var(--border); color:var(--sub); }
  .pe-mini { background:var(--bg3); border:1px solid var(--border); border-radius:7px; padding:5px 11px;
    font-size:12px; color:var(--sub); cursor:pointer; }
  .pe-mini:hover:not(:disabled) { border-color:var(--accent); color:var(--text); }
  .pe-mini:disabled { opacity:.4; cursor:not-allowed; }
  .pe-peligro:hover { border-color:rgba(239,68,68,.5); color:#f87171; }
  .pe-previa-icono { width:72px; height:72px; border-radius:12px; object-fit:cover; display:block; margin-bottom:8px; border:1px solid var(--border); }
  .pe-previa-banner { width:100%; aspect-ratio:4/1; object-fit:cover; border-radius:10px; display:block; margin-bottom:8px; border:1px solid var(--border); }
  .pe-galeria { display:flex; flex-direction:column; gap:12px; margin-top:12px; }
  .pe-galeria-item { display:flex; gap:12px; background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:10px; }
  .pe-galeria-item img { width:140px; aspect-ratio:16/9; object-fit:cover; border-radius:8px; flex-shrink:0; }
  .pe-galeria-campos { flex:1; display:flex; flex-direction:column; gap:7px; min-width:0; }
  .pe-galeria-botones { display:flex; gap:6px; flex-wrap:wrap; }
  .pe-destacada { font-size:11px; color:#fbbf24; font-weight:700; }
  .pe-version { display:flex; justify-content:space-between; align-items:center; gap:12px;
    background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:12px 14px; margin-bottom:8px; }
  .pe-version strong { font-size:14px; }
  .pe-version .pe-pista { margin:3px 0 0; }
  .pe-h3 { font-family:'Rajdhani',sans-serif; font-size:19px; margin:0 0 14px; }
  .pe-nota { font-size:13px; color:var(--sub); background:var(--bg3); border-radius:9px; padding:12px 14px; margin-top:6px; }
  .pe-nota strong { color:var(--accent2); }
  .pe-progreso { position:relative; height:22px; background:var(--bg3); border-radius:999px; overflow:hidden; margin-bottom:12px; }
  .pe-progreso div { height:100%; background:var(--accent); transition:width .2s; }
  .pe-progreso span { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:11px; }
  .pe-aviso { color:var(--muted); font-size:14px; text-align:center; padding:40px 0; }
  .pe-enlace { color:var(--accent2); font-size:13px; text-decoration:none; }
  .pe-enlace:hover { text-decoration:underline; }
  @media (max-width:700px) { .pe-dos { grid-template-columns:1fr; } .pe-enlace-fila { grid-template-columns:1fr; } }
`
