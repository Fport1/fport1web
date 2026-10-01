'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { auth } from '@/lib/firebase'

const MENSAJES = {
  conectado: { tipo: 'ok', texto: 'GitHub conectado correctamente.' },
  cancelado: { tipo: 'aviso', texto: 'Cancelaste la conexión en GitHub.' },
  estado_invalido: { tipo: 'error', texto: 'El enlace de conexión caducó o no era válido. Inténtalo otra vez.' },
  faltan_datos: { tipo: 'error', texto: 'GitHub no devolvió los datos esperados.' },
  sin_token: { tipo: 'error', texto: 'GitHub no entregó el permiso.' },
  fallo: { tipo: 'error', texto: 'No se pudo completar la conexión.' },
}

function Contenido() {
  const router = useRouter()
  const params = useSearchParams()
  const { user, profile, loading } = useAuth()
  const esAdmin = profile?.usernameSlug === 'fport1'

  const [estado, setEstado] = useState(null)   // null = consultando
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState('')

  const resultado = params.get('estado')
  const detalle = params.get('detalle')

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  const consultar = useCallback(async () => {
    if (!auth?.currentUser) return
    try {
      const r = await fetch('/api/github/estado', {
        headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
      })
      setEstado(await r.json())
    } catch {
      setEstado({ conectado: false, motivo: 'No se pudo consultar el estado.' })
    }
  }, [])

  useEffect(() => { if (esAdmin) consultar() }, [esAdmin, consultar, resultado])

  async function conectar() {
    setTrabajando(true); setError('')
    try {
      // Se pide por POST con el token de sesión: así el servidor comprueba quién
      // eres antes de dar el enlace, y ese token no acaba en la URL.
      const r = await fetch('/api/github/login', {
        method: 'POST',
        headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
      })
      const d = await r.json()
      if (!r.ok || !d.url) { setError(d.error === 'sin_configurar' ? 'Falta configurar la app de GitHub.' : 'No se pudo iniciar la conexión.'); setTrabajando(false); return }
      window.location.href = d.url
    } catch {
      setError('No se pudo iniciar la conexión.')
      setTrabajando(false)
    }
  }

  async function desconectar() {
    if (!confirm('¿Desconectar GitHub? Tendrás que volver a autorizar para publicar.')) return
    setTrabajando(true)
    try {
      await fetch('/api/github/estado', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
      })
      await consultar()
    } catch { setError('No se pudo desconectar.') }
    setTrabajando(false)
  }

  if (loading || !user) return <p className="gh-aviso">Cargando…</p>

  if (!esAdmin) {
    return (
      <div className="gh-caja">
        <h1 className="gh-titulo">Solo para @fport1</h1>
        <p className="gh-texto">Esta página sirve para publicar creaciones, y solo la usa la cuenta de Fport1.</p>
        <Link href="/creaciones" className="gh-enlace">← Ver el catálogo</Link>
      </div>
    )
  }

  const msg = resultado ? MENSAJES[resultado] : null

  return (
    <div className="gh-caja">
      <h1 className="gh-titulo">Conexión con GitHub</h1>
      <p className="gh-texto">
        Las creaciones se publican como <strong>releases de GitHub</strong>, cuyas descargas no cuestan nada.
        Hace falta autorizar una vez para que la web pueda crear repos, releases y subir archivos en tu nombre.
      </p>

      {msg && (
        <div className={`gh-mensaje gh-${msg.tipo}`}>
          {msg.texto}{detalle ? ` (${detalle})` : ''}
        </div>
      )}
      {error && <div className="gh-mensaje gh-error">{error}</div>}

      <div className="gh-estado">
        {estado === null ? (
          <span className="gh-texto">Consultando…</span>
        ) : estado.conectado ? (
          <>
            {estado.avatar && /* eslint-disable-next-line @next/next/no-img-element */
              <img src={estado.avatar} alt="" className="gh-avatar" />}
            <div>
              <p className="gh-conectado">Conectado como <strong>{estado.login}</strong></p>
              {estado.conectadoEn && (
                <p className="gh-fecha">desde {new Date(estado.conectadoEn).toLocaleDateString('es-CO')}</p>
              )}
            </div>
            <button className="gh-boton gh-secundario" onClick={desconectar} disabled={trabajando}>Desconectar</button>
          </>
        ) : (
          <>
            <div>
              <p className="gh-texto" style={{ margin: 0 }}>Sin conectar.</p>
              {estado.motivo && <p className="gh-fecha">{estado.motivo}</p>}
            </div>
            <button className="gh-boton" onClick={conectar} disabled={trabajando}>
              {trabajando ? 'Abriendo GitHub…' : 'Conectar con GitHub'}
            </button>
          </>
        )}
      </div>

      <p className="gh-nota">
        🔒 El permiso se guarda cifrado en el servidor y nunca llega al navegador. Puedes retirarlo cuando
        quieras, aquí o desde los ajustes de tu cuenta de GitHub.
      </p>

      <Link href="/creaciones" className="gh-enlace">← Ver el catálogo</Link>
    </div>
  )
}

export default function ConectarGitHub() {
  return (
    <main className="gh-pagina">
      <Suspense fallback={<p className="gh-aviso">Cargando…</p>}>
        <Contenido />
      </Suspense>
      <style>{`
        .gh-pagina { min-height:100vh; max-width:640px; margin:0 auto; padding:110px 20px 60px; position:relative; z-index:1; }
        .gh-caja { background:var(--card); border:1px solid var(--border); border-radius:18px; padding:30px; }
        .gh-titulo { font-family:'Rajdhani',sans-serif; font-size:28px; font-weight:700; margin:0 0 10px; }
        .gh-texto { color:var(--sub); font-size:14px; line-height:1.7; margin:0 0 18px; }
        .gh-texto strong { color:var(--text); }
        .gh-estado { display:flex; align-items:center; gap:14px; flex-wrap:wrap;
          background:var(--bg3); border:1px solid var(--border); border-radius:12px; padding:16px; }
        .gh-avatar { width:42px; height:42px; border-radius:50%; }
        .gh-conectado { font-size:14px; color:var(--text); margin:0; }
        .gh-fecha { font-size:12px; color:var(--muted); margin:2px 0 0; }
        .gh-boton { margin-left:auto; background:var(--accent); color:#fff; border:none; border-radius:10px;
          padding:11px 20px; font-size:14px; font-weight:600; cursor:pointer; transition:background .2s; }
        .gh-boton:hover:not(:disabled) { background:var(--accent2); }
        .gh-boton:disabled { opacity:.6; cursor:not-allowed; }
        .gh-secundario { background:transparent; border:1px solid var(--border); color:var(--sub); }
        .gh-secundario:hover:not(:disabled) { background:rgba(239,68,68,.1); border-color:rgba(239,68,68,.4); color:#f87171; }
        .gh-mensaje { border-radius:10px; padding:12px 16px; font-size:13px; margin-bottom:16px; }
        .gh-ok { background:rgba(74,222,128,.1); border:1px solid rgba(74,222,128,.3); color:#4ade80; }
        .gh-aviso { color:var(--muted); font-size:14px; text-align:center; padding:40px 0; }
        .gh-mensaje.gh-aviso { background:rgba(251,191,36,.1); border:1px solid rgba(251,191,36,.3); color:#fbbf24; text-align:left; padding:12px 16px; }
        .gh-error { background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.3); color:#f87171; }
        .gh-nota { font-size:12px; color:var(--muted); line-height:1.6; margin:18px 0 0; }
        .gh-enlace { display:inline-block; margin-top:20px; color:var(--accent2); font-size:13px; text-decoration:none; }
        .gh-enlace:hover { text-decoration:underline; }
      `}</style>
    </main>
  )
}
