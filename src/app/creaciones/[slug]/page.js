'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  collection, doc, getDocs, limit, onSnapshot, orderBy, query, updateDoc, where, increment,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { etiquetaDeTipo, etiquetaDeCategoria, SOPORTE, ENLACES } from '@/lib/catalogo'
import { descripcionAHtml, prepararEnlaces } from '@/lib/descripcionCreaciones'

const CANALES = { release: 'Release', beta: 'Beta', alpha: 'Alpha' }

function Descripcion({ markdown }) {
  const ref = useRef(null)
  const html = useMemo(() => descripcionAHtml(markdown), [markdown])
  useEffect(() => { prepararEnlaces(ref.current) }, [html])
  if (!html) return null
  return <div ref={ref} className="cr-descripcion" dangerouslySetInnerHTML={{ __html: html }} />
}

function Galeria({ imagenes }) {
  const [abierta, setAbierta] = useState(null)
  useEffect(() => {
    if (abierta === null) return
    const tecla = e => {
      if (e.key === 'Escape') setAbierta(null)
      if (e.key === 'ArrowRight') setAbierta(i => (i + 1) % imagenes.length)
      if (e.key === 'ArrowLeft') setAbierta(i => (i - 1 + imagenes.length) % imagenes.length)
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [abierta, imagenes.length])

  if (!imagenes?.length) return null
  return (
    <>
      <div className="cr-galeria">
        {imagenes.map((img, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={img.url} alt={img.title || `Imagen ${i + 1}`}
            className="cr-galeria-img" onClick={() => setAbierta(i)} />
        ))}
      </div>
      {abierta !== null && (
        <div className="cr-visor" onClick={() => setAbierta(null)}>
          <button className="cr-visor-cerrar" onClick={() => setAbierta(null)}>✕</button>
          {imagenes.length > 1 && (
            <>
              <button className="cr-visor-nav izq" onClick={e => { e.stopPropagation(); setAbierta(i => (i - 1 + imagenes.length) % imagenes.length) }}>‹</button>
              <button className="cr-visor-nav der" onClick={e => { e.stopPropagation(); setAbierta(i => (i + 1) % imagenes.length) }}>›</button>
            </>
          )}
          <figure className="cr-visor-figura" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagenes[abierta].url} alt={imagenes[abierta].title || ''} />
            {(imagenes[abierta].title || imagenes[abierta].description) && (
              <figcaption>
                {imagenes[abierta].title && <strong>{imagenes[abierta].title}</strong>}
                {imagenes[abierta].description && <span>{imagenes[abierta].description}</span>}
              </figcaption>
            )}
          </figure>
        </div>
      )}
    </>
  )
}

export default function FichaCreacion() {
  const { slug } = useParams()
  const [p, setP] = useState(undefined)   // undefined = cargando, null = no existe
  const [versiones, setVersiones] = useState([])
  const [descargando, setDescargando] = useState(null)

  useEffect(() => {
    if (!db || !slug) return
    // La ficha se busca por slug, pero el documento puede no tenerlo todavía:
    // en ese caso se intenta por id.
    // El filtro por published no sobra: en una consulta de lista, Firestore exige
    // que los filtros demuestren que se cumple la regla, y la regla mira ese
    // campo. Sin el, la consulta entera se rechaza por permisos.
    const q = query(
      collection(db, 'fport1_projects'),
      where('published', '==', true),
      where('slug', '==', slug),
      limit(1),
    )
    const unsub = onSnapshot(q, snap => {
      if (!snap.empty) { const d = snap.docs[0]; setP({ id: d.id, ...d.data() }); return }
      const porId = doc(db, 'fport1_projects', String(slug))
      onSnapshot(porId, s => setP(s.exists() ? { id: s.id, ...s.data() } : null), () => setP(null))
    }, () => setP(null))
    return () => unsub()
  }, [slug])

  useEffect(() => {
    if (!db || !p?.id) return
    const q = query(collection(db, 'fport1_projects', p.id, 'versions'), orderBy('publishedAt', 'desc'))
    const unsub = onSnapshot(q, snap => setVersiones(snap.docs.map(d => ({ id: d.id, ...d.data() }))), () => setVersiones([]))
    return () => unsub()
  }, [p?.id])

  /**
   * Suma 1 descarga al proyecto y a la versión, como hace el launcher.
   * Las reglas solo admiten +1 y nada más, así que si esto falla la descarga
   * sigue adelante: perder una cuenta importa menos que no poder descargar.
   */
  async function descargar(version) {
    const archivo = (version.files || []).find(f => f.primary) || (version.files || [])[0]
    if (!archivo?.url) return
    setDescargando(version.id)
    try {
      await Promise.all([
        updateDoc(doc(db, 'fport1_projects', p.id), { downloads: increment(1) }),
        updateDoc(doc(db, 'fport1_projects', p.id, 'versions', version.id), { downloads: increment(1) }),
      ])
    } catch (e) {
      console.warn('[descarga] no se pudo contar', e?.code)
    }
    window.open(archivo.url, '_blank', 'noopener,noreferrer')
    setDescargando(null)
  }

  if (p === undefined) return <main className="cr-ficha"><p className="cr-aviso">Cargando…</p></main>
  if (p === null) {
    return (
      <main className="cr-ficha">
        <p className="cr-aviso">Esta creación no existe o todavía no está publicada.</p>
        <Link href="/creaciones" className="cr-volver">← Volver al catálogo</Link>
      </main>
    )
  }

  const galeria = (p.gallery || []).filter(g => g?.url)
  // El repo del código solo se enseña si es abierto y no está marcado privado.
  const verCodigo = p.openSource && p.links?.source && !p.github?.sourcePrivate
  const enlaces = Object.entries(p.links || {})
    .filter(([k, v]) => v && (k !== 'source' || verCodigo))

  return (
    <main className="cr-ficha">
      <Link href="/creaciones" className="cr-volver">← Catálogo</Link>

      {p.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.bannerUrl} alt="" className="cr-portada" />
      )}

      <header className="cr-ficha-cabecera">
        {p.iconUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={p.iconUrl} alt={p.title} className="cr-ficha-icono" />
          : <div className="cr-ficha-icono cr-icono-vacio">{(p.title?.[0] || '?').toUpperCase()}</div>}
        <div className="cr-ficha-info">
          <div className="cr-ficha-tipo">{etiquetaDeTipo(p.type)}{p.featured && <span className="cr-destacado"> · ★ Destacado</span>}</div>
          <h1 className="cr-ficha-titulo">{p.title}</h1>
          {p.summary && <p className="cr-ficha-resumen">{p.summary}</p>}
          <div className="cr-metadatos">
            <span className="cr-descargas">⬇ {(p.downloads || 0).toLocaleString('es-CO')} descargas</span>
            {p.latestVersion && <span className="cr-chip">v{p.latestVersion}</span>}
          </div>
        </div>
      </header>

      <div className="cr-columnas">
        <div className="cr-principal">
          <Descripcion markdown={p.description} />
          {galeria.length > 0 && (
            <section className="cr-seccion">
              <h2 className="cr-h2">Galería</h2>
              <Galeria imagenes={galeria} />
            </section>
          )}

          <section className="cr-seccion">
            <h2 className="cr-h2">Versiones</h2>
            {versiones.length === 0 ? (
              <p className="cr-aviso-pequeno">Todavía no hay versiones publicadas.</p>
            ) : versiones.map(v => (
              <article key={v.id} className="cr-version">
                <div className="cr-version-cabecera">
                  <div>
                    <h3 className="cr-version-nombre">{v.name || v.versionNumber}</h3>
                    <div className="cr-metadatos">
                      <span className={`cr-canal cr-canal-${v.channel || 'release'}`}>{CANALES[v.channel] || v.channel || 'Release'}</span>
                      {(v.loaders || []).map(l => <span key={l} className="cr-chip">{l}</span>)}
                      {(v.gameVersions || []).map(g => <span key={g} className="cr-chip">{g}</span>)}
                    </div>
                  </div>
                  <button className="cr-descargar" disabled={descargando === v.id || !(v.files || []).length}
                    onClick={() => descargar(v)}>
                    {descargando === v.id ? 'Abriendo…' : 'Descargar'}
                  </button>
                </div>
                {v.changelog && <Descripcion markdown={v.changelog} />}
              </article>
            ))}
          </section>
        </div>

        <aside className="cr-lateral">
          <div className="cr-caja">
            <h3 className="cr-caja-titulo">Compatibilidad</h3>
            {['clientSide', 'serverSide'].map(lado => {
              const s = SOPORTE[p[lado]]
              if (!s) return null
              return (
                <div key={lado} className="cr-fila">
                  <span>{lado === 'clientSide' ? 'Cliente' : 'Servidor'}</span>
                  <strong style={{ color: s.color }}>{s.texto}</strong>
                </div>
              )
            })}
            {(p.loaders || []).length > 0 && (
              <div className="cr-fila"><span>Loaders</span><strong>{p.loaders.join(', ')}</strong></div>
            )}
            {(p.gameVersions || []).length > 0 && (
              <div className="cr-fila"><span>Minecraft</span><strong>{p.gameVersions.join(', ')}</strong></div>
            )}
          </div>

          <div className="cr-caja">
            <h3 className="cr-caja-titulo">Licencia</h3>
            <div className="cr-fila">
              <span>Código</span>
              <strong style={{ color: p.openSource ? '#4ade80' : 'var(--sub)' }}>
                {p.openSource ? 'Abierto' : 'Cerrado'}
              </strong>
            </div>
            {p.license && (
              <p className="cr-licencia">
                {p.license.url
                  ? <a href={p.license.url} target="_blank" rel="noopener noreferrer">{p.license.name || p.license.id}</a>
                  : (p.license.name || p.license.id)}
              </p>
            )}
          </div>

          {enlaces.length > 0 && (
            <div className="cr-caja">
              <h3 className="cr-caja-titulo">Enlaces</h3>
              {enlaces.map(([k, v]) => (
                <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="cr-enlace">
                  {ENLACES[k] || k} ↗
                </a>
              ))}
            </div>
          )}

          {(p.categories || []).length > 0 && (
            <div className="cr-caja">
              <h3 className="cr-caja-titulo">Categorías</h3>
              <div className="cr-metadatos">
                {p.categories.map(c => <span key={c} className="cr-chip">{etiquetaDeCategoria(c)}</span>)}
              </div>
            </div>
          )}

          {(p.tags || []).length > 0 && (
            <div className="cr-caja">
              <h3 className="cr-caja-titulo">Etiquetas</h3>
              <div className="cr-metadatos">
                {p.tags.map(t => <span key={t} className="cr-chip">#{t}</span>)}
              </div>
            </div>
          )}
        </aside>
      </div>

      <style>{`
        .cr-ficha { min-height:100vh; max-width:1100px; margin:0 auto; padding:100px 20px 60px; position:relative; z-index:1; }
        .cr-volver { display:inline-block; color:var(--sub); font-size:13px; text-decoration:none; margin-bottom:18px; }
        .cr-volver:hover { color:var(--text); }
        .cr-portada { width:100%; aspect-ratio:4/1; object-fit:cover; border-radius:16px; border:1px solid var(--border); margin-bottom:20px; }
        .cr-ficha-cabecera { display:flex; gap:20px; margin-bottom:30px; }
        .cr-ficha-icono { width:96px; height:96px; border-radius:18px; object-fit:cover; border:1px solid var(--border); flex-shrink:0; }
        .cr-icono-vacio { display:flex; align-items:center; justify-content:center; background:var(--bg3); font-size:36px; font-weight:700; color:var(--muted); }
        .cr-ficha-info { min-width:0; }
        .cr-ficha-tipo { font-size:11px; text-transform:uppercase; letter-spacing:.1em; color:var(--accent2); margin-bottom:4px; }
        .cr-destacado { color:#fbbf24; }
        .cr-ficha-titulo { font-family:'Rajdhani',sans-serif; font-size:36px; font-weight:700; margin:0 0 6px; line-height:1.1; }
        .cr-ficha-resumen { color:var(--sub); font-size:15px; margin:0 0 10px; }
        .cr-columnas { display:grid; grid-template-columns:1fr 300px; gap:28px; align-items:start; }
        .cr-principal { min-width:0; }
        .cr-seccion { margin-top:36px; }
        .cr-h2 { font-family:'Rajdhani',sans-serif; font-size:22px; font-weight:700; margin:0 0 14px; }
        .cr-caja { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px; margin-bottom:14px; }
        .cr-caja-titulo { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:0 0 12px; }
        .cr-fila { display:flex; justify-content:space-between; gap:10px; font-size:13px; color:var(--sub); padding:5px 0; }
        .cr-fila strong { color:var(--text); font-weight:600; text-align:right; }
        .cr-licencia { font-size:13px; color:var(--sub); margin:6px 0 0; }
        .cr-licencia a { color:var(--accent2); }
        .cr-enlace { display:block; font-size:13px; color:var(--accent2); text-decoration:none; padding:5px 0; }
        .cr-enlace:hover { text-decoration:underline; }
        .cr-metadatos { display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
        .cr-chip { font-size:12px; color:var(--sub); background:var(--bg3); border:1px solid var(--border); border-radius:999px; padding:3px 10px; }
        .cr-descargas { font-size:13px; color:var(--muted); }
        .cr-version { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px; margin-bottom:12px; }
        .cr-version-cabecera { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; }
        .cr-version-nombre { font-size:16px; font-weight:600; margin:0 0 8px; }
        .cr-canal { font-size:11px; font-weight:700; border-radius:999px; padding:3px 10px; }
        .cr-canal-release { background:rgba(74,222,128,.12); color:#4ade80; }
        .cr-canal-beta { background:rgba(251,191,36,.12); color:#fbbf24; }
        .cr-canal-alpha { background:rgba(248,113,113,.12); color:#f87171; }
        .cr-descargar {
          flex-shrink:0; background:var(--accent); color:#fff; border:none; border-radius:10px;
          padding:10px 20px; font-size:14px; font-weight:600; cursor:pointer; transition:background .2s;
        }
        .cr-descargar:hover:not(:disabled) { background:var(--accent2); }
        .cr-descargar:disabled { opacity:.5; cursor:not-allowed; }
        .cr-galeria { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px; }
        .cr-galeria-img { width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:10px; border:1px solid var(--border); cursor:pointer; transition:border-color .2s; }
        .cr-galeria-img:hover { border-color:var(--accent); }
        .cr-visor { position:fixed; inset:0; z-index:200; background:rgba(0,0,0,.92); display:flex; align-items:center; justify-content:center; padding:40px; }
        .cr-visor-figura { margin:0; max-width:100%; max-height:100%; text-align:center; }
        .cr-visor-figura img { max-width:100%; max-height:80vh; border-radius:10px; }
        .cr-visor-figura figcaption { margin-top:12px; color:var(--sub); font-size:13px; display:flex; flex-direction:column; gap:3px; }
        .cr-visor-figura figcaption strong { color:var(--text); }
        .cr-visor-cerrar { position:absolute; top:20px; right:24px; background:none; border:none; color:#fff; font-size:26px; cursor:pointer; opacity:.7; }
        .cr-visor-nav { position:absolute; top:50%; transform:translateY(-50%); background:none; border:none; color:#fff; font-size:48px; cursor:pointer; opacity:.6; padding:0 18px; }
        .cr-visor-nav:hover, .cr-visor-cerrar:hover { opacity:1; }
        .cr-visor-nav.izq { left:10px; } .cr-visor-nav.der { right:10px; }
        .cr-aviso { color:var(--muted); font-size:14px; padding:40px 0; text-align:center; }
        .cr-aviso-pequeno { color:var(--muted); font-size:13px; }

        /* Descripción: el launcher maqueta con <p align> e <img align>, así que
           el float necesita margen o el texto se pega a la imagen. */
        .cr-descripcion { font-size:15px; line-height:1.75; color:var(--sub); }
        .cr-descripcion :where(h1,h2,h3,h4) { color:var(--text); font-family:'Rajdhani',sans-serif; margin:26px 0 10px; }
        .cr-descripcion h1 { font-size:26px; } .cr-descripcion h2 { font-size:22px; } .cr-descripcion h3 { font-size:18px; }
        .cr-descripcion p { margin:0 0 14px; }
        .cr-descripcion a { color:var(--accent2); }
        .cr-descripcion strong { color:var(--text); }
        .cr-descripcion img { max-width:100%; height:auto; border-radius:10px; }
        .cr-descripcion img[align="left"] { float:left; margin:4px 18px 12px 0; }
        .cr-descripcion img[align="right"] { float:right; margin:4px 0 12px 18px; }
        .cr-descripcion p[align="center"] { text-align:center; }
        .cr-descripcion ul, .cr-descripcion ol { margin:0 0 14px; padding-left:22px; }
        .cr-descripcion li { margin:4px 0; }
        .cr-descripcion blockquote { border-left:3px solid var(--accent); margin:0 0 14px; padding:4px 0 4px 16px; color:var(--muted); }
        .cr-descripcion code { background:var(--bg3); border-radius:5px; padding:2px 6px; font-size:.9em; color:var(--accent2); }
        .cr-descripcion pre { background:var(--bg); border:1px solid var(--border); border-radius:10px; padding:14px; overflow-x:auto; }
        .cr-descripcion pre code { background:none; padding:0; color:var(--sub); }
        .cr-descripcion table { width:100%; border-collapse:collapse; margin:0 0 14px; font-size:14px; }
        .cr-descripcion th, .cr-descripcion td { border:1px solid var(--border); padding:8px 12px; text-align:left; }
        .cr-descripcion th { background:var(--bg3); color:var(--text); }
        .cr-descripcion hr { border:none; border-top:1px solid var(--border); margin:24px 0; }

        @media (max-width:860px) {
          .cr-columnas { grid-template-columns:1fr; }
          .cr-ficha-cabecera { flex-direction:column; gap:14px; }
        }
      `}</style>
    </main>
  )
}
