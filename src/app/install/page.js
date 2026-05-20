'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function InstallContent() {
  const params = useSearchParams()
  const url    = params.get('url')
  const key    = params.get('key') ?? ''

  const [manifest, setManifest]   = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    if (!url) { setError('No se proporcionó URL de modpack.'); setLoading(false); return }
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('No se pudo descargar el manifiesto.'); return r.json() })
      .then(data => { setManifest(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [url])

  function installInLauncher() {
    const deepLink = `modpacklauncher://install?url=${encodeURIComponent(url)}${key ? `&key=${encodeURIComponent(key)}` : ''}`
    window.location.href = deepLink
    setInstalled(true)
  }

  if (!url) return <Msg icon="❌" title="URL no válida" sub={<>No se encontró la URL del modpack. <Link href="/" style={{ color: 'var(--accent2)' }}>Ir al inicio →</Link></>} />
  if (loading) return <Msg icon="⏳" title="Cargando modpack..." />
  if (error)   return <Msg icon="❌" title="Error" sub={error} />

  return (
    <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>📦</div>
      <p style={{ fontSize: 12, letterSpacing: 2, fontWeight: 600, color: 'var(--accent2)', textTransform: 'uppercase', marginBottom: 8 }}>Instalar Modpack</p>
      <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 30, fontWeight: 700, marginBottom: 4 }}>{manifest?.name ?? 'Modpack'}</h1>
      {manifest?.version && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>v{manifest.version}</p>}
      {manifest?.minecraft && <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 4 }}>Minecraft {manifest.minecraft} · {manifest.modloader}</p>}
      {manifest?.description && <p style={{ fontSize: 14, color: 'var(--sub)', marginBottom: 24, lineHeight: 1.6 }}>{manifest.description}</p>}

      {!installed ? (
        <button onClick={installInLauncher} style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
          ⚡ Instalar en ModpackLauncher
        </button>
      ) : (
        <div style={{ padding: '14px', borderRadius: 12, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)', color: '#4ade80', fontSize: 14, marginBottom: 12 }}>
          ✅ Se ha abierto ModpackLauncher para instalar. Si no se abrió, comprueba que esté instalado.
        </div>
      )}

      <Link href="/#descargar" style={{ display: 'block', padding: '12px', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--sub)', fontSize: 13, textDecoration: 'none' }}>
        ¿No tienes ModpackLauncher? Descárgalo aquí →
      </Link>
    </div>
  )
}

function Msg({ icon, title, sub }) {
  return (
    <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h2 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 24, fontWeight: 700, marginBottom: sub ? 10 : 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 14, color: 'var(--sub)' }}>{sub}</p>}
    </div>
  )
}

export default function InstallPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Suspense fallback={<Msg icon="⏳" title="Cargando..." />}>
        <InstallContent />
      </Suspense>
    </div>
  )
}