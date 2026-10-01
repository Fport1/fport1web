'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { TIPOS, CATEGORIAS, etiquetaDeTipo } from '@/lib/catalogo'

function Icono({ src, alt, size = 56 }) {
  const [err, setErr] = useState(false)
  if (src && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} onError={() => setErr(true)} className="cr-icono" style={{ width: size, height: size }} />
  }
  return <div className="cr-icono cr-icono-vacio" style={{ width: size, height: size }}>{(alt?.[0] || '?').toUpperCase()}</div>
}

function Tarjeta({ p }) {
  return (
    <Link href={`/creaciones/${p.slug || p.id}`} className="cr-tarjeta">
      {p.featured && <span className="cr-destacado">★ Destacado</span>}
      <Icono src={p.iconUrl} alt={p.title} />
      <div className="cr-tarjeta-cuerpo">
        <div className="cr-tarjeta-cabecera">
          <h3 className="cr-tarjeta-titulo">{p.title}</h3>
          <span className="cr-tipo">{etiquetaDeTipo(p.type)}</span>
        </div>
        {p.summary && <p className="cr-resumen">{p.summary}</p>}
        <div className="cr-metadatos">
          {(p.loaders || []).slice(0, 3).map(l => <span key={l} className="cr-chip">{l}</span>)}
          {(p.gameVersions || []).slice(0, 2).map(v => <span key={v} className="cr-chip">{v}</span>)}
          <span className="cr-descargas">⬇ {(p.downloads || 0).toLocaleString('es-CO')}</span>
        </div>
      </div>
    </Link>
  )
}

export default function CreacionesPage() {
  const [proyectos, setProyectos] = useState(null)
  const [error, setError] = useState(false)
  const [tipo, setTipo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [etiqueta, setEtiqueta] = useState('')
  const [loader, setLoader] = useState('')
  const [version, setVersion] = useState('')
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (!db) return
    // Solo lo publicado: las reglas tampoco dejarían leer un borrador.
    const q = query(collection(db, 'fport1_projects'), where('published', '==', true))
    const unsub = onSnapshot(q,
      snap => { setProyectos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setError(false) },
      () => { setProyectos([]); setError(true) })
    return () => unsub()
  }, [])

  // Las listas de filtros salen de lo que hay publicado, no de una lista fija:
  // así no se ofrece un filtro que no devuelve nada.
  const { loaders, versiones, etiquetas } = useMemo(() => {
    const L = new Set(), V = new Set(), E = new Set()
    ;(proyectos || []).forEach(p => {
      (p.loaders || []).forEach(x => L.add(x))
      ;(p.gameVersions || []).forEach(x => V.add(x))
      ;(p.tags || []).forEach(x => E.add(x))
    })
    return { loaders: [...L].sort(), versiones: [...V].sort().reverse(), etiquetas: [...E].sort() }
  }, [proyectos])

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    return (proyectos || [])
      .filter(p => !tipo || p.type === tipo)
      .filter(p => !categoria || (p.categories || []).includes(categoria))
      .filter(p => !etiqueta || (p.tags || []).includes(etiqueta))
      .filter(p => !loader || (p.loaders || []).includes(loader))
      .filter(p => !version || (p.gameVersions || []).includes(version))
      .filter(p => !t || [p.title, p.summary, ...(p.tags || [])].filter(Boolean).join(' ').toLowerCase().includes(t))
      // Destacados primero; dentro de cada grupo, los más descargados.
      .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.downloads || 0) - (a.downloads || 0))
  }, [proyectos, tipo, categoria, etiqueta, loader, version, busqueda])

  const hayFiltros = tipo || categoria || etiqueta || loader || version || busqueda

  return (
    <main className="cr-pagina">
      <header className="cr-cabecera">
        <h1 className="cr-titulo">Creaciones</h1>
        <p className="cr-subtitulo">Modpacks, mods y recursos hechos por Fport1.</p>
      </header>

      <div className="cr-filtros">
        <input className="cr-buscar" placeholder="Buscar…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        <select className="cr-select" value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {TIPOS.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <select className="cr-select" value={categoria} onChange={e => setCategoria(e.target.value)}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        {loaders.length > 0 && (
          <select className="cr-select" value={loader} onChange={e => setLoader(e.target.value)}>
            <option value="">Cualquier loader</option>
            {loaders.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {versiones.length > 0 && (
          <select className="cr-select" value={version} onChange={e => setVersion(e.target.value)}>
            <option value="">Cualquier versión</option>
            {versiones.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
        {hayFiltros && (
          <button className="cr-limpiar" onClick={() => { setTipo(''); setCategoria(''); setEtiqueta(''); setLoader(''); setVersion(''); setBusqueda('') }}>
            Limpiar
          </button>
        )}
      </div>

      {etiquetas.length > 0 && (
        <div className="cr-etiquetas">
          {etiquetas.map(e => (
            <button key={e} onClick={() => setEtiqueta(etiqueta === e ? '' : e)}
              className={`cr-chip cr-chip-boton ${etiqueta === e ? 'activo' : ''}`}>#{e}</button>
          ))}
        </div>
      )}

      {proyectos === null ? (
        <p className="cr-aviso">Cargando…</p>
      ) : error ? (
        <p className="cr-aviso">No se pudo cargar el catálogo. Revisa tu conexión.</p>
      ) : visibles.length === 0 ? (
        <p className="cr-aviso">
          {proyectos.length === 0 ? 'Todavía no hay creaciones publicadas.' : 'Nada coincide con esos filtros.'}
        </p>
      ) : (
        <div className="cr-rejilla">{visibles.map(p => <Tarjeta key={p.id} p={p} />)}</div>
      )}

      <style>{`
        .cr-pagina { min-height:100vh; max-width:1100px; margin:0 auto; padding:100px 20px 60px; position:relative; z-index:1; }
        .cr-cabecera { margin-bottom:28px; }
        .cr-titulo { font-family:'Rajdhani',sans-serif; font-size:40px; font-weight:700; margin:0 0 6px; }
        .cr-subtitulo { color:var(--sub); font-size:15px; margin:0; }
        .cr-filtros { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
        .cr-buscar, .cr-select {
          background:var(--bg3); border:1px solid var(--border); border-radius:10px;
          padding:10px 14px; color:var(--text); font-size:14px; outline:none; transition:border-color .15s;
        }
        .cr-buscar { flex:1; min-width:200px; }
        .cr-buscar:focus, .cr-select:focus { border-color:var(--accent); }
        .cr-limpiar { background:none; border:1px solid var(--border); border-radius:10px; padding:10px 16px; color:var(--sub); font-size:13px; cursor:pointer; }
        .cr-limpiar:hover { color:var(--text); border-color:var(--accent); }
        .cr-etiquetas { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:24px; }
        .cr-chip { font-size:12px; color:var(--sub); background:var(--bg3); border:1px solid var(--border); border-radius:999px; padding:3px 10px; }
        .cr-chip-boton { cursor:pointer; transition:all .15s; }
        .cr-chip-boton:hover { color:var(--text); border-color:var(--accent); }
        .cr-chip-boton.activo { background:var(--accent); border-color:var(--accent); color:#fff; }
        .cr-rejilla { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; }
        .cr-tarjeta {
          position:relative; display:flex; gap:14px; padding:18px;
          background:var(--card); border:1px solid var(--border); border-radius:16px;
          text-decoration:none; color:inherit; transition:border-color .2s, transform .15s, box-shadow .2s;
        }
        .cr-tarjeta:hover { border-color:var(--accent); transform:translateY(-2px); box-shadow:0 8px 28px rgba(124,58,237,.14); }
        .cr-destacado {
          position:absolute; top:10px; right:12px; font-size:10px; font-weight:700;
          letter-spacing:.06em; color:#fbbf24;
        }
        .cr-icono { border-radius:12px; object-fit:cover; flex-shrink:0; border:1px solid var(--border); }
        .cr-icono-vacio { display:flex; align-items:center; justify-content:center; background:var(--bg3); font-size:22px; font-weight:700; color:var(--muted); }
        .cr-tarjeta-cuerpo { min-width:0; flex:1; }
        .cr-tarjeta-cabecera { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
        .cr-tarjeta-titulo { font-size:16px; font-weight:600; margin:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cr-tipo { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:var(--accent2); flex-shrink:0; }
        .cr-resumen { font-size:13px; color:var(--sub); line-height:1.5; margin:0 0 10px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .cr-metadatos { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
        .cr-descargas { font-size:12px; color:var(--muted); margin-left:auto; }
        .cr-aviso { color:var(--muted); font-size:14px; padding:40px 0; text-align:center; }
        @media (max-width:560px) { .cr-rejilla { grid-template-columns:1fr; } }
      `}</style>
    </main>
  )
}
