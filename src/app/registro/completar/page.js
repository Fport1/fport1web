'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import { reserveUsernameAndUpsertProfile, validateHandle, normalizeHandle, USERNAME_MIN, USERNAME_MAX, DISPLAY_NAME_MAX } from '@/lib/username'

const S = `@keyframes spin { to { transform:rotate(360deg) } }`

function TinySpinner() {
  return <span style={{ display:'inline-block', width:10, height:10, verticalAlign:'middle', border:'1.5px solid #facc15', borderTopColor:'transparent', borderRadius:'50%', animation:'spin .7s linear infinite', marginRight:4 }} />
}

function Field({ label, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontSize:13, color:'var(--sub)', fontWeight:500 }}>{label}</label>
      {children}
    </div>
  )
}

function Hint({ color, children }) {
  return <span style={{ fontSize:12, color }}>{children}</span>
}

const borderColor = { idle:'var(--border)', ok:'rgba(74,222,128,.5)', error:'rgba(239,68,68,.6)', checking:'rgba(250,204,21,.5)' }
function inputStyle(state = 'idle') {
  return {
    padding:'11px 14px', borderRadius:10, border:`1px solid ${borderColor[state]}`,
    background:'var(--card)', color:'var(--text)', fontSize:14,
    outline:'none', width:'100%', boxSizing:'border-box', transition:'border-color .2s',
  }
}

export default function CompletarRegistro() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const uid          = searchParams.get('uid')

  const [user,    setUser]    = useState(null)   // Firebase user
  const [loading, setLoading] = useState(true)
  const [form,    setForm]    = useState({ profileName:'', handle:'' })
  const [touched, setTouched] = useState({ profileName:false, handle:false })
  const [handleStatus, setHandleStatus] = useState('idle')
  const [serverError,  setServerError]  = useState('')
  const [submitting,   setSubmitting]   = useState(false)

  const up    = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const touch = (k)    => setTouched(t => ({ ...t, [k]: true }))

  // Get authenticated user
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      if (!u) { router.push('/login'); return }
      setUser(u)
      // Pre-fill display name from Google
      if (u.displayName) up('profileName', u.displayName)
      setLoading(false)
    })
    return unsub
  }, [])

  const handleCheck = useMemo(() => validateHandle(form.handle), [form.handle])
  const handleSynOk = handleCheck.ok
  const profileOk   = form.profileName.trim().length >= 2

  // Handle availability check
  useEffect(() => {
    let cancel = false
    const norm = normalizeHandle(form.handle)
    if (!norm) { setHandleStatus('idle'); return }
    if (!handleSynOk) { setHandleStatus('invalid'); return }
    setHandleStatus('checking')
    const t = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'usernames', norm))
        if (!cancel) setHandleStatus(snap.exists() ? 'taken' : 'available')
      } catch { if (!cancel) setHandleStatus('error') }
    }, 450)
    return () => { cancel = true; clearTimeout(t) }
  }, [form.handle, handleSynOk])

  const canSubmit = profileOk && handleSynOk && handleStatus === 'available' && !submitting

  async function onSubmit(e) {
    e.preventDefault()
    setTouched({ profileName:true, handle:true })
    if (!canSubmit || !user) return
    setSubmitting(true); setServerError('')
    try {
      await reserveUsernameAndUpsertProfile({
        uid:         user.uid,
        email:       user.email ?? '',
        profileName: form.profileName.trim(),
        handleInput: form.handle,
        minecraftUsername: null,
        minecraftUUID:     null,
      })
      router.push('/amigos')
    } catch (err) {
      setServerError(err.message ?? 'Error al guardar el perfil.')
    } finally { setSubmitting(false) }
  }

  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
        <style>{S}</style>
        <svg style={{ animation:'spin .7s linear infinite', width:28, height:28 }} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity=".2"/><path d="M21 12a9 9 0 00-9-9"/>
        </svg>
      </div>
    )
  }

  const handleState = () =>
    handleStatus === 'checking' ? 'checking' :
    (handleStatus === 'available' && handleSynOk) ? 'ok' :
    (touched.handle && (!handleSynOk || handleStatus === 'taken')) ? 'error' : 'idle'

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, paddingTop:88 }}>
      <style>{S}</style>
      <div style={{ width:'100%', maxWidth:440 }}>
        <p style={{ fontSize:11, fontWeight:700, letterSpacing:'0.12em', color:'var(--accent)', textTransform:'uppercase', margin:'0 0 6px' }}>fport1-social</p>
        <h1 style={{ fontSize:26, fontWeight:700, margin:'0 0 6px' }}>Completa tu perfil</h1>
        <p style={{ color:'var(--sub)', fontSize:14, margin:'0 0 28px' }}>
          Elige un nombre de perfil y un @usuario único para tu cuenta.
        </p>

        <form onSubmit={onSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <Field label="Nombre de perfil">
            <input type="text" placeholder="Cómo quieres que te vean (apodo, alias…)"
              value={form.profileName} onChange={e => up('profileName', e.target.value)}
              onBlur={() => touch('profileName')} maxLength={DISPLAY_NAME_MAX}
              style={inputStyle(touched.profileName && !profileOk ? 'error' : 'idle')} />
            {touched.profileName && !profileOk && <Hint color="#f87171">Mínimo 2 caracteres.</Hint>}
          </Field>

          <Field label="Usuario">
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ color:'var(--sub)', fontSize:14 }}>@</span>
              <input type="text" placeholder="tu_usuario"
                value={form.handle} onChange={e => up('handle', normalizeHandle(e.target.value))}
                onBlur={() => touch('handle')} maxLength={USERNAME_MAX}
                style={{ ...inputStyle(handleState()), flex:1 }} />
            </div>
            {handleStatus === 'checking' && <Hint color="#facc15"><TinySpinner />Comprobando…</Hint>}
            {handleStatus === 'available' && handleSynOk && <Hint color="#4ade80">Disponible ✓</Hint>}
            {handleStatus === 'taken' && <Hint color="#f87171">Ese usuario ya está en uso.</Hint>}
            {touched.handle && !handleSynOk && handleCheck.msg && <Hint color="#f87171">{handleCheck.msg}</Hint>}
            <Hint color="var(--muted)">Solo minúsculas, números, - y _. {USERNAME_MIN}–{USERNAME_MAX} caracteres.</Hint>
          </Field>

          {serverError && (
            <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'10px 14px', color:'#f87171', fontSize:13 }}>
              {serverError}
            </div>
          )}

          <button type="submit" disabled={!canSubmit} style={{
            padding:'12px', borderRadius:10, border:'none', fontSize:14, fontWeight:600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            background: canSubmit ? 'var(--accent)' : 'var(--card)',
            color: canSubmit ? '#fff' : 'var(--muted)',
            transition:'background .2s',
          }}>
            {submitting ? 'Guardando…' : 'Continuar'}
          </button>
        </form>
      </div>
    </div>
  )
}