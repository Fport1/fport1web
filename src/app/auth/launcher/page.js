'use client'

import { useEffect, useState } from 'react'
import { GoogleAuthProvider, signInWithRedirect, getRedirectResult } from 'firebase/auth'
import { auth } from '@/lib/firebase'

const S = `
  @keyframes fadeUp { from { opacity:0;transform:translateY(16px) } to { opacity:1;transform:translateY(0) } }
  @keyframes spin    { to { transform:rotate(360deg) } }
  @keyframes pulse   { 0%,100%{opacity:.4}50%{opacity:1} }
  .btn-google:hover:not(:disabled) { background:#1c1c28!important; border-color:#3f3f52!important; }
  .btn-google { transition:background .15s,border-color .15s; }
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

export default function LauncherAuthPage() {
  const [status, setStatus] = useState('checking') // checking | idle | redirecting | sending | done | error
  const [error,  setError]  = useState('')

  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) { setStatus('idle'); return }

        // Get the Google credential (idToken + accessToken) — no server needed
        const credential = GoogleAuthProvider.credentialFromResult(result)
        if (!credential?.idToken) throw new Error('No se pudo obtener las credenciales de Google.')

        setStatus('sending')

        // Send tokens to the launcher via deep link
        const params = new URLSearchParams({
          idToken:     credential.idToken,
          accessToken: credential.accessToken ?? '',
          displayName: result.user.displayName ?? '',
          email:       result.user.email ?? '',
          photoURL:    result.user.photoURL ?? '',
        })
        window.location.href = `modpacklauncher://auth?${params.toString()}`

        // Show success after short delay (in case deep link opened without leaving page)
        setTimeout(() => setStatus('done'), 800)
      })
      .catch((err) => {
        setError(err.message || 'Ocurrió un error')
        setStatus('error')
      })
  }, [])

  function handleGoogle() {
    setError('')
    setStatus('redirecting')
    signInWithRedirect(auth, new GoogleAuthProvider())
  }

  // Loading states
  if (status === 'checking' || status === 'sending') {
    return (
      <>
        <style>{S}</style>
        <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, background:'var(--bg)', padding:24 }}>
          <Spinner size={32} />
          <p style={{ fontSize:14, color:'var(--sub)', margin:0, animation:'pulse 1.5s ease infinite' }}>
            {status === 'checking' ? 'Verificando sesión…' : 'Abriendo el launcher…'}
          </p>
        </div>
      </>
    )
  }

  if (status === 'done') {
    return (
      <>
        <style>{S}</style>
        <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, background:'var(--bg)', padding:24 }}>
          <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(74,222,128,.12)', border:'1px solid rgba(74,222,128,.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <p style={{ fontSize:16, fontWeight:600, color:'var(--text)', margin:0 }}>¡Cuenta conectada!</p>
          <p style={{ fontSize:13, color:'var(--sub)', margin:0, textAlign:'center', maxWidth:280 }}>
            Puedes cerrar esta pestaña y volver al launcher.
          </p>
        </div>
      </>
    )
  }

  // idle | redirecting | error
  return (
    <>
      <style>{S}</style>
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, background:'var(--bg)', paddingTop:88 }}>
        <div style={{ width:'100%', maxWidth:400, animation:'fadeUp .35s ease both' }}>
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em', color:'var(--accent)', textTransform:'uppercase', margin:'0 0 8px' }}>
            fport1-social
          </p>
          <h1 style={{ fontSize:26, fontWeight:700, margin:'0 0 8px', color:'var(--text)' }}>
            Conectar con Google
          </h1>
          <p style={{ color:'var(--sub)', fontSize:14, margin:'0 0 32px', lineHeight:1.5 }}>
            Inicia sesión con tu cuenta de Google para usar fport1-social dentro del launcher de Minecraft.
          </p>

          <button
            onClick={handleGoogle}
            disabled={status === 'redirecting'}
            className="btn-google"
            style={{
              width:'100%', display:'flex', alignItems:'center', justifyContent:'center',
              gap:10, padding:'13px 18px', border:'1px solid var(--border)',
              borderRadius:12, background:'var(--card)', color:'var(--text)',
              fontSize:15, fontWeight:500,
              cursor: status === 'redirecting' ? 'wait' : 'pointer',
              opacity: status === 'redirecting' ? .7 : 1,
              transition:'opacity .2s',
            }}
          >
            {status === 'redirecting'
              ? <><Spinner size={18} color="var(--sub)" /> Redirigiendo a Google…</>
              : <><GoogleLogo /> Continuar con Google</>
            }
          </button>

          {status === 'error' && (
            <div style={{ marginTop:16, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:10, padding:'10px 14px', color:'#f87171', fontSize:13 }}>
              {error}
              <button onClick={handleGoogle} style={{ display:'block', marginTop:8, background:'none', border:'none', color:'#f87171', textDecoration:'underline', cursor:'pointer', fontSize:13, padding:0 }}>
                Intentar de nuevo
              </button>
            </div>
          )}

          {(status === 'idle') && (
            <p style={{ fontSize:12, color:'var(--muted)', marginTop:14, lineHeight:1.6 }}>
              Al hacer clic serás redirigido a Google. Tras autenticarte, el launcher se abrirá automáticamente.
            </p>
          )}
        </div>
      </div>
    </>
  )
}