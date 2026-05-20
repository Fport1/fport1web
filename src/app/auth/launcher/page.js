'use client'

import { useState, useEffect } from 'react'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/lib/firebase'

const S = `
  @keyframes fadeUp { from { opacity:0;transform:translateY(16px) } to { opacity:1;transform:translateY(0) } }
  @keyframes spin    { to { transform:rotate(360deg) } }
  @keyframes pulse   { 0%,100%{opacity:.5}50%{opacity:1} }
  .btn-google:hover:not(:disabled) { background:#1c1c28!important; border-color:#3f3f52!important; }
  .btn-google { transition:background .15s,border-color .15s; }
  .btn-done:hover { filter:brightness(1.12); }
  .btn-done { transition:filter .15s; }
`

function Spinner({ size = 18, color = '#a855f7' }) {
  return (
    <svg style={{ animation:'spin .7s linear infinite', width:size, height:size, flexShrink:0 }}
      viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity=".2"/>
      <path d="M21 12a9 9 0 00-9-9"/>
    </svg>
  )
}

function GoogleLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

// Status: 'idle' | 'loading' | 'creating-token' | 'redirecting' | 'done' | 'error'
export default function LauncherAuthPage() {
  const [status, setStatus] = useState('idle')
  const [error,  setError]  = useState('')

  // Auto-trigger Google sign-in as soon as the page loads
  useEffect(() => {
    // Small delay so the page renders first
    const t = setTimeout(() => handleGoogle(), 400)
    return () => clearTimeout(t)
  }, [])

  async function handleGoogle() {
    setError('')
    setStatus('loading')
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider())
      setStatus('creating-token')

      const idToken = await cred.user.getIdToken()
      const res = await fetch('/api/auth/launcher-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      const data = await res.json()
      if (data.error || !data.customToken) throw new Error(data.error || 'No se pudo crear el token')

      setStatus('redirecting')
      window.location.href = `modpacklauncher://auth?token=${encodeURIComponent(data.customToken)}`

      // Fallback: if the redirect doesn't work immediately, show success after 1.5s
      setTimeout(() => setStatus('done'), 1500)
    } catch (err) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        setStatus('idle')
        return
      }
      setError(err.message || 'Ocurrió un error al autenticar')
      setStatus('error')
    }
  }

  const labelMap = {
    loading:        'Abriendo Google…',
    'creating-token': 'Preparando sesión…',
    redirecting:    'Abriendo launcher…',
    done:           '¡Conectado!',
  }

  return (
    <>
      <style>{S}</style>
      <div style={{
        minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
        padding:24, background:'var(--bg)', paddingTop:88,
      }}>
        <div style={{ width:'100%', maxWidth:400, animation:'fadeUp .35s ease both' }}>

          {/* Logo chip */}
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em', color:'var(--accent)', textTransform:'uppercase', margin:'0 0 8px' }}>
            fport1-social
          </p>

          <h1 style={{ fontSize:26, fontWeight:700, margin:'0 0 8px', color:'var(--text)' }}>
            {status === 'done' ? '¡Cuenta conectada!' : 'Conectar con Google'}
          </h1>

          <p style={{ color:'var(--sub)', fontSize:14, margin:'0 0 32px', lineHeight:1.5 }}>
            {status === 'done'
              ? 'Ya puedes cerrar esta ventana y volver al launcher.'
              : 'Inicia sesión con tu cuenta de Google para usar fport1-social dentro del launcher de Minecraft.'}
          </p>

          {status === 'done' ? (
            <div style={{ borderRadius:14, border:'1px solid rgba(74,222,128,.3)', background:'rgba(74,222,128,.07)', padding:'18px 20px', display:'flex', alignItems:'center', gap:12, animation:'fadeUp .3s ease both' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <p style={{ fontSize:14, color:'#4ade80', fontWeight:500, margin:0 }}>
                Sesión iniciada. Puedes cerrar esta pestaña.
              </p>
            </div>
          ) : (
            <>
              {/* Google button */}
              <button
                onClick={handleGoogle}
                disabled={status !== 'idle' && status !== 'error'}
                className="btn-google"
                style={{
                  width:'100%', display:'flex', alignItems:'center', justifyContent:'center',
                  gap:10, padding:'13px 18px', border:'1px solid var(--border)',
                  borderRadius:12, background:'var(--card)', color:'var(--text)',
                  fontSize:15, fontWeight:500, cursor: (status !== 'idle' && status !== 'error') ? 'wait' : 'pointer',
                  opacity: (status !== 'idle' && status !== 'error') ? .7 : 1,
                  transition:'opacity .2s',
                }}
              >
                {status === 'idle' || status === 'error' ? (
                  <><GoogleLogo /> Continuar con Google</>
                ) : (
                  <><Spinner size={18} /> {labelMap[status] ?? 'Procesando…'}</>
                )}
              </button>

              {/* Explanation */}
              {(status === 'idle' || status === 'error') && (
                <p style={{ fontSize:12, color:'var(--muted)', marginTop:14, lineHeight:1.6, animation:'fadeUp .25s ease both' }}>
                  Al continuar, se abrirá un popup de Google. Tras autenticarte, serás redirigido automáticamente al launcher.
                </p>
              )}

              {/* Error */}
              {status === 'error' && error && (
                <div style={{ marginTop:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:10, padding:'10px 14px', color:'#f87171', fontSize:13, animation:'fadeUp .2s ease both' }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}