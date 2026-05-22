'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import {
  reserveUsernameAndUpsertProfile,
  validateHandle,
  normalizeHandle,
  USERNAME_MIN,
  USERNAME_MAX,
  DISPLAY_NAME_MAX,
} from '@/lib/username'

const S = `
  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin    { to{transform:rotate(360deg)} }
  @keyframes pulse   { 0%,100%{opacity:.4} 50%{opacity:1} }
  .btn-primary:hover:not(:disabled){filter:brightness(1.1);}
  .btn-primary:active:not(:disabled){transform:scale(.98);}
  .btn-primary{transition:filter .15s,transform .1s;}
  .btn-google:hover:not(:disabled){background:#1c1c28!important;border-color:#3f3f52!important;}
  .btn-google{transition:background .15s,border-color .15s;}
`

function Spinner({ size = 20, color = '#a855f7' }) {
  return (
    <svg style={{ animation:'spin .7s linear infinite', width:size, height:size, flexShrink:0 }}
      viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity=".2"/>
      <path d="M21 12a9 9 0 00-9-9"/>
    </svg>
  )
}

function TinySpinner() {
  return <span style={{ display:'inline-block', width:10, height:10, verticalAlign:'middle', border:'1.5px solid #facc15', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .7s linear infinite', marginRight:4 }} />
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

const borderColor = { idle:'var(--border)', ok:'rgba(74,222,128,.5)', error:'rgba(239,68,68,.6)', checking:'rgba(250,204,21,.5)' }
function inp(state = 'idle') {
  return { padding:'11px 14px', borderRadius:10, border:`1px solid ${borderColor[state]}`, background:'var(--card)', color:'var(--text)', fontSize:14, outline:'none', width:'100%', boxSizing:'border-box', transition:'border-color .2s' }
}

function Field({ label, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontSize:13, color:'var(--sub)', fontWeight:500 }}>{label}</label>
      {children}
    </div>
  )
}

// ── Profile form shown when the Google user has no @handle yet ─────────────────
function ProfileForm({ user, onDone }) {
  const [form,    setForm]   = useState({ profileName: user.displayName ?? '', handle: '' })
  const [touched, setTouched]= useState({ profileName:false, handle:false })
  const [handleStatus, setHS]= useState('idle')
  const [err,    setErr]     = useState('')
  const [loading,setLoading] = useState(false)

  const up    = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const touch = (k)    => setTouched(t => ({ ...t, [k]: true }))
  const hc       = useMemo(() => validateHandle(form.handle), [form.handle])
  const profileOk= form.profileName.trim().length >= 2
  const canSubmit= profileOk && hc.ok && handleStatus === 'available' && !loading

  useEffect(() => {
    let cancel = false
    const norm = normalizeHandle(form.handle)
    if (!norm)  { setHS('idle');    return }
    if (!hc.ok) { setHS('invalid'); return }
    setHS('checking')
    const t = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'usernames', norm))
        if (!cancel) setHS(snap.exists() ? 'taken' : 'available')
      } catch { if (!cancel) setHS('error') }
    }, 450)
    return () => { cancel=true; clearTimeout(t) }
  }, [form.handle, hc.ok])

  async function submit(e) {
    e.preventDefault()
    setTouched({ profileName:true, handle:true })
    if (!canSubmit) return
    setLoading(true); setErr('')
    try {
      await reserveUsernameAndUpsertProfile({
        uid: user.uid, email: user.email ?? '',
        profileName: form.profileName.trim(),
        handleInput: form.handle,
        minecraftUsername: null, minecraftUUID: null,
      })
      onDone()
    } catch(ex) { setErr(ex.message ?? 'Error al guardar el perfil.') }
    finally { setLoading(false) }
  }

  const hState = () =>
    handleStatus==='checking' ? 'checking' :
    (handleStatus==='available'&&hc.ok) ? 'ok' :
    (touched.handle&&(!hc.ok||handleStatus==='taken')) ? 'error' : 'idle'

  return (
    <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
      <Field label="Nombre de perfil">
        <input type="text" placeholder="Cómo quieres que te vean (apodo, alias…)"
          value={form.profileName} onChange={e=>up('profileName',e.target.value)}
          onBlur={()=>touch('profileName')} maxLength={DISPLAY_NAME_MAX}
          style={inp(touched.profileName&&!profileOk?'error':'idle')} />
        {touched.profileName&&!profileOk && <span style={{fontSize:12,color:'#f87171'}}>Mínimo 2 caracteres.</span>}
      </Field>
      <Field label="Usuario">
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ color:'var(--sub)', fontSize:14 }}>@</span>
          <input type="text" placeholder="tu_usuario"
            value={form.handle} onChange={e=>up('handle',normalizeHandle(e.target.value))}
            onBlur={()=>touch('handle')} maxLength={USERNAME_MAX}
            style={{...inp(hState()),flex:1}} />
        </div>
        {handleStatus==='checking' && <span style={{fontSize:12,color:'#facc15'}}><TinySpinner/>Comprobando…</span>}
        {handleStatus==='available'&&hc.ok && <span style={{fontSize:12,color:'#4ade80'}}>Disponible ✓</span>}
        {handleStatus==='taken' && <span style={{fontSize:12,color:'#f87171'}}>Ese usuario ya está en uso.</span>}
        {touched.handle&&!hc.ok&&hc.msg && <span style={{fontSize:12,color:'#f87171'}}>{hc.msg}</span>}
        <span style={{fontSize:12,color:'var(--muted)'}}>Solo minúsculas, números, - y _. {USERNAME_MIN}–{USERNAME_MAX} caracteres.</span>
      </Field>
      {err && <div style={{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'10px 14px',color:'#f87171',fontSize:13}}>{err}</div>}
      <button type="submit" disabled={!canSubmit} className="btn-primary" style={{
        padding:'12px', borderRadius:10, border:'none', fontSize:14, fontWeight:600,
        cursor:canSubmit?'pointer':'not-allowed',
        background:canSubmit?'var(--accent)':'var(--card)',
        color:canSubmit?'#fff':'var(--muted)',
        transition:'background .2s',
      }}>
        {loading ? 'Guardando…' : 'Continuar →'}
      </button>
    </form>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
// States: checking | idle | redirecting | profile-needed | writing | done | error

function LauncherAuthInner() {
  const searchParams   = useSearchParams()
  const sessionCode    = searchParams.get('code')

  const [status,      setStatus]  = useState('idle')
  const [error,       setError]   = useState('')
  const [credential,  setCred]    = useState(null)
  const [firebaseUser,setFbUser]  = useState(null)

  async function notifyLauncher(cred) {
    if (!cred?.idToken) { setError('Sin credenciales. Intenta de nuevo.'); setStatus('error'); return }
    try {
      if (sessionCode) {
        await setDoc(doc(db, 'launcher_sessions', sessionCode), {
          idToken:     cred.idToken,
          accessToken: cred.accessToken ?? '',
          createdAt:   serverTimestamp(),
        })
      }
      setStatus('done')
    } catch (err) {
      setError(err.message ?? 'No se pudo notificar al launcher.')
      setStatus('error')
    }
  }

  useEffect(() => {
    if (status === 'writing' && credential) notifyLauncher(credential)
  }, [status, credential])

  function onProfileDone() { setStatus('writing') }

  async function handleGoogle() {
    setError('')
    setStatus('redirecting')
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const cred = GoogleAuthProvider.credentialFromResult(result)
      if (!cred?.idToken) throw new Error('No se pudo obtener las credenciales de Google.')

      setCred(cred)
      setFbUser(result.user)

      const snap = await getDoc(doc(db, 'users', result.user.uid))
      if (snap.exists() && snap.data().usernameSlug) {
        setStatus('writing')
      } else {
        setStatus('profile-needed')
      }
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setStatus('idle')
      } else {
        setError(err.message || 'Error al iniciar sesión con Google.')
        setStatus('error')
      }
    }
  }

  const effectiveCode = sessionCode

  // Loading states
  if (status === 'redirecting' || status === 'writing') {
    return (
      <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, background:'var(--bg)' }}>
        <Spinner size={32} />
        <p style={{ fontSize:14, color:'var(--sub)', margin:0, animation:'pulse 1.5s ease infinite' }}>
          {status === 'redirecting' ? 'Esperando Google…' : 'Conectando con el launcher…'}
        </p>
      </div>
    )
  }

  // Profile needed
  if (status === 'profile-needed') {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, paddingTop:88, background:'var(--bg)' }}>
        <div style={{ width:'100%', maxWidth:440, animation:'fadeUp .3s ease both' }}>
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em', color:'var(--accent)', textTransform:'uppercase', margin:'0 0 6px' }}>fport1-social</p>
          <h1 style={{ fontSize:24, fontWeight:700, margin:'0 0 6px', color:'var(--text)' }}>Completa tu perfil</h1>
          <p style={{ color:'var(--sub)', fontSize:14, margin:'0 0 24px' }}>Elige un nombre y @usuario para tu cuenta de fport1-social.</p>
          <ProfileForm user={firebaseUser} onDone={onProfileDone} />
        </div>
      </div>
    )
  }

  // Done
  if (status === 'done') {
    return (
      <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14, background:'var(--bg)' }}>
        <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(74,222,128,.12)', border:'1px solid rgba(74,222,128,.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p style={{ fontSize:16, fontWeight:600, color:'var(--text)', margin:0 }}>¡Conectado al launcher!</p>
        <p style={{ fontSize:13, color:'var(--sub)', margin:0, textAlign:'center', maxWidth:280 }}>
          {effectiveCode ? 'El launcher ya fue notificado. Puedes cerrar esta pestaña.' : 'Puedes cerrar esta pestaña.'}
        </p>
      </div>
    )
  }

  // Error
  if (status === 'error') {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, background:'var(--bg)' }}>
        <div style={{ width:'100%', maxWidth:400 }}>
          <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em', color:'var(--accent)', textTransform:'uppercase', margin:'0 0 6px' }}>fport1-social</p>
          <h1 style={{ fontSize:22, fontWeight:700, margin:'0 0 16px', color:'var(--text)' }}>Conectar con Google</h1>
          <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:10, padding:'12px 16px', color:'#f87171', fontSize:13, marginBottom:18 }}>
            {error}
          </div>
          <button onClick={handleGoogle} className="btn-google" style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'13px', border:'1px solid var(--border)', borderRadius:12, background:'var(--card)', color:'var(--text)', fontSize:14, fontWeight:500, cursor:'pointer' }}>
            <GoogleLogo /> Intentar de nuevo
          </button>
        </div>
      </div>
    )
  }

  // Idle
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, background:'var(--bg)', paddingTop:88 }}>
      <div style={{ width:'100%', maxWidth:400, animation:'fadeUp .35s ease both' }}>
        <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em', color:'var(--accent)', textTransform:'uppercase', margin:'0 0 8px' }}>fport1-social</p>
        <h1 style={{ fontSize:26, fontWeight:700, margin:'0 0 8px', color:'var(--text)' }}>Conectar con Google</h1>
        <p style={{ color:'var(--sub)', fontSize:14, margin:'0 0 32px', lineHeight:1.5 }}>
          {effectiveCode ? 'Inicia sesión con Google para conectar tu cuenta al launcher de Minecraft.' : 'Inicia sesión con tu cuenta de Google para usar fport1-social.'}
        </p>
        <button onClick={handleGoogle} className="btn-google" style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'13px 18px', border:'1px solid var(--border)', borderRadius:12, background:'var(--card)', color:'var(--text)', fontSize:15, fontWeight:500, cursor:'pointer' }}>
          <GoogleLogo /> Continuar con Google
        </button>
        <p style={{ fontSize:12, color:'var(--muted)', marginTop:14, lineHeight:1.6 }}>
          Serás redirigido a Google. Tras autenticarte, esta página notificará al launcher automáticamente.
        </p>
      </div>
    </div>
  )
}

export default function LauncherAuthPage() {
  return (
    <>
      <style>{S}</style>
      <Suspense fallback={
        <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
          <svg style={{ animation:'spin .7s linear infinite', width:28, height:28 }} viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2">
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity=".2"/><path d="M21 12a9 9 0 00-9-9"/>
          </svg>
        </div>
      }>
        <LauncherAuthInner />
      </Suspense>
    </>
  )
}