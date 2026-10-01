'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/components/auth-context'
import { estadoGitHub } from '@/lib/panelApi'
import { etiquetaDeTipo } from '@/lib/catalogo'

/** Un slug legible y sin sorpresas a partir del título. */
function aSlug(texto) {
  return String(texto || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

export default function PanelCreaciones() {
  const router = useRouter()
  const { user, profile, loading } = useAuth()
  const esAdmin = profile?.usernameSlug === 'fport1'

  const [proyectos, setProyectos] = useState(null)
  const [github, setGithub] = useState(null)
  const [creando, setCreando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { if (!loading && !user) router.push('/login') }, [loading, user, router])

  useEffect(() => {
    if (!esAdmin || !db) return
    // El admin sí ve los borradores; las reglas se lo permiten solo a él.
    const q = query(collection(db, 'fport1_projects'), orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(q,
      s => setProyectos(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setProyectos([]))
    return () => unsub()
  }, [esAdmin])

  useEffect(() => {
    if (!esAdmin) return
    estadoGitHub().then(setGithub).catch(() => setGithub({ conectado: false }))
  }, [esAdmin])

  async function crear() {
    const t = titulo.trim()
    if (!t) return
    const slug = aSlug(t)
    if (!slug) { setError('Ese nombre no da un enlace válido. Usa letras o números.'); return }
    if ((proyectos || []).some(p => p.slug === slug)) { setError('Ya hay una creación con ese enlace.'); return }

    setCreando(true); setError('')
    try {
      const ref = doc(collection(db, 'fport1_projects'))
      await setDoc(ref, {
        title: t, slug, summary: '', description: '', type: 'modpack',
        iconUrl: '', iconPath: '', bannerUrl: null, bannerPath: null,
        gallery: [], categories: [], tags: [],
        license: null, openSource: true, links: {},
        hosting: 'github', github: { sourceRepo: '', sourcePrivate: false, releasesRepo: '' },
        clientSide: 'required', serverSide: 'optional',
        published: false, featured: false, downloads: 0,
        loaders: [], gameVersions: [], latestVersion: null,
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      router.push(`/creaciones/panel/${ref.id}`)
    } catch (e) {
      setError('No se pudo crear: ' + (e?.code || e?.message))
      setCreando(false)
    }
  }

  if (loading || !user) return <main className="pn-pagina"><p className="pn-aviso">Cargando…</p></main>

  if (!esAdmin) {
    return (
      <main className="pn-pagina">
        <div className="pn-caja">
          <h1 className="pn-titulo">Solo para @fport1</h1>
          <p className="pn-texto">Aquí se publican las creaciones, y solo lo usa la cuenta de Fport1.</p>
          <Link href="/creaciones" className="pn-enlace">← Ver el catálogo</Link>
        </div>
        <style>{estilos}</style>
      </main>
    )
  }

  return (
    <main className="pn-pagina">
      <div className="pn-cabecera">
        <div>
          <h1 className="pn-titulo">Mis creaciones</h1>
          <p className="pn-texto" style={{ margin: 0 }}>Publica y edita lo que aparece en el catálogo.</p>
        </div>
        <Link href="/creaciones" className="pn-enlace">Ver catálogo →</Link>
      </div>

      {github && !github.conectado && (
        <div className="pn-alerta">
          <div>
            <strong>GitHub sin conectar.</strong>
            <p>Hace falta para crear releases y subir archivos. Las fichas se pueden editar igualmente.</p>
          </div>
          <Link href="/creaciones/conectar" className="pn-boton">Conectar</Link>
        </div>
      )}
      {github?.conectado && (
        <p className="pn-conectado">✓ GitHub conectado como <strong>{github.login}</strong></p>
      )}

      <div className="pn-nuevo">
        <input className="pn-input" placeholder="Nombre de la nueva creación…" value={titulo}
          onChange={e => { setTitulo(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && crear()} />
        <button className="pn-boton" onClick={crear} disabled={creando || !titulo.trim()}>
          {creando ? 'Creando…' : 'Crear'}
        </button>
      </div>
      {titulo.trim() && <p className="pn-pista">Enlace: /creaciones/<strong>{aSlug(titulo) || '…'}</strong></p>}
      {error && <p className="pn-error">{error}</p>}

      {proyectos === null ? (
        <p className="pn-aviso">Cargando creaciones…</p>
      ) : proyectos.length === 0 ? (
        <p className="pn-aviso">Todavía no has creado nada.</p>
      ) : (
        <div className="pn-lista">
          {proyectos.map(p => (
            <Link key={p.id} href={`/creaciones/panel/${p.id}`} className="pn-fila">
              {p.iconUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.iconUrl} alt="" className="pn-icono" />
                : <div className="pn-icono pn-icono-vacio">{(p.title?.[0] || '?').toUpperCase()}</div>}
              <div className="pn-fila-info">
                <p className="pn-fila-titulo">{p.title}</p>
                <p className="pn-fila-meta">
                  {etiquetaDeTipo(p.type)} · /{p.slug} · ⬇ {(p.downloads || 0).toLocaleString('es-CO')}
                </p>
              </div>
              {p.featured && <span className="pn-marca pn-destacado">★</span>}
              <span className={`pn-marca ${p.published ? 'pn-publicado' : 'pn-borrador'}`}>
                {p.published ? 'Publicado' : 'Borrador'}
              </span>
            </Link>
          ))}
        </div>
      )}
      <style>{estilos}</style>
    </main>
  )
}

const estilos = `
  .pn-pagina { min-height:100vh; max-width:860px; margin:0 auto; padding:100px 20px 60px; position:relative; z-index:1; }
  .pn-cabecera { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:24px; flex-wrap:wrap; }
  .pn-titulo { font-family:'Rajdhani',sans-serif; font-size:34px; font-weight:700; margin:0 0 4px; }
  .pn-texto { color:var(--sub); font-size:14px; line-height:1.7; margin:0 0 16px; }
  .pn-caja { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:28px; }
  .pn-alerta { display:flex; align-items:center; gap:16px; flex-wrap:wrap;
    background:rgba(251,191,36,.08); border:1px solid rgba(251,191,36,.3); border-radius:12px; padding:14px 18px; margin-bottom:18px; }
  .pn-alerta strong { color:#fbbf24; font-size:14px; }
  .pn-alerta p { color:var(--sub); font-size:13px; margin:3px 0 0; }
  .pn-alerta .pn-boton { margin-left:auto; }
  .pn-conectado { font-size:13px; color:#4ade80; margin:0 0 18px; }
  .pn-conectado strong { color:var(--text); }
  .pn-nuevo { display:flex; gap:10px; margin-bottom:6px; }
  .pn-input { flex:1; background:var(--bg3); border:1px solid var(--border); border-radius:10px;
    padding:11px 15px; color:var(--text); font-size:14px; outline:none; }
  .pn-input:focus { border-color:var(--accent); }
  .pn-boton { background:var(--accent); color:#fff; border:none; border-radius:10px; padding:11px 22px;
    font-size:14px; font-weight:600; cursor:pointer; text-decoration:none; display:inline-block; transition:background .2s; }
  .pn-boton:hover:not(:disabled) { background:var(--accent2); }
  .pn-boton:disabled { opacity:.5; cursor:not-allowed; }
  .pn-pista { font-size:12px; color:var(--muted); margin:0 0 16px; }
  .pn-pista strong { color:var(--accent2); }
  .pn-error { font-size:13px; color:#f87171; margin:0 0 16px; }
  .pn-lista { display:flex; flex-direction:column; gap:10px; margin-top:20px; }
  .pn-fila { display:flex; align-items:center; gap:14px; padding:14px 16px; text-decoration:none; color:inherit;
    background:var(--card); border:1px solid var(--border); border-radius:12px; transition:border-color .2s; }
  .pn-fila:hover { border-color:var(--accent); }
  .pn-icono { width:44px; height:44px; border-radius:10px; object-fit:cover; border:1px solid var(--border); flex-shrink:0; }
  .pn-icono-vacio { display:flex; align-items:center; justify-content:center; background:var(--bg3); font-weight:700; color:var(--muted); }
  .pn-fila-info { flex:1; min-width:0; }
  .pn-fila-titulo { font-size:15px; font-weight:600; margin:0; }
  .pn-fila-meta { font-size:12px; color:var(--muted); margin:2px 0 0; }
  .pn-marca { font-size:11px; font-weight:700; border-radius:999px; padding:4px 10px; flex-shrink:0; }
  .pn-publicado { background:rgba(74,222,128,.12); color:#4ade80; }
  .pn-borrador { background:var(--bg3); color:var(--muted); }
  .pn-destacado { background:rgba(251,191,36,.12); color:#fbbf24; }
  .pn-aviso { color:var(--muted); font-size:14px; text-align:center; padding:40px 0; }
  .pn-enlace { color:var(--accent2); font-size:13px; text-decoration:none; }
  .pn-enlace:hover { text-decoration:underline; }
`
