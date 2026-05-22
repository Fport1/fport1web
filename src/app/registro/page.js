'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  deleteUser,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import {
  reserveUsernameAndUpsertProfile,
  validateHandle,
  normalizeHandle,
  USERNAME_MIN,
  USERNAME_MAX,
  DISPLAY_NAME_MAX,
} from '@/lib/username'

const S = `@keyframes spin { to { transform: rotate(360deg) } }`

function TinySpinner() {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, verticalAlign: 'middle',
      border: '1.5px solid currentColor', borderTopColor: 'transparent',
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginRight: 4,
    }} />
  )
}

function EyeIcon({ open }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22"/>
    </svg>
  )
}

function RegisterPage() {
  const router = useRouter()

  const [form, setForm] = useState({
    profileName: '',
    handle: '',
    email: '',
    pass: '',
    pass2: '',
    minecraftUsername: '',
    acepta: false,
  })
  const [touched, setTouched] = useState({
    profileName: false, handle: false, email: false,
    pass: false, pass2: false, acepta: false,
  })
  const [show1, setShow1] = useState(false)
  const [show2, setShow2] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [serverError, setServerError] = useState('')

  // 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error'
  const [emailStatus, setEmailStatus]   = useState('idle')
  const [handleStatus, setHandleStatus] = useState('idle')

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const touch  = (field) => setTouched(t => ({ ...t, [field]: true }))


  const emailNorm      = form.email.trim().toLowerCase()
  const emailFormatOk  = /\S+@\S+\.\S+/.test(emailNorm)
  const passLenOk      = form.pass.length >= 8
  const passMatch      = form.pass === form.pass2
  const showPassMismatch = form.pass.length > 0 && form.pass2.length > 0 && !passMatch
  const profileNameOk  = form.profileName.trim().length >= 2
  const aceptaOk       = form.acepta === true

  const handleCheck     = useMemo(() => validateHandle(form.handle), [form.handle])
  const handleSyntaxOk  = handleCheck.ok

  // Email availability
  useEffect(() => {
    let cancel = false
    if (!emailNorm)     { setEmailStatus('idle'); return }
    if (!emailFormatOk) { setEmailStatus('invalid'); return }
    setEmailStatus('checking')
    const t = setTimeout(async () => {
      try {
        const methods = await fetchSignInMethodsForEmail(auth, emailNorm)
        if (!cancel) setEmailStatus(methods.length > 0 ? 'taken' : 'available')
      } catch {
        if (!cancel) setEmailStatus('available') // deprecated API — fall through to server check
      }
    }, 500)
    return () => { cancel = true; clearTimeout(t) }
  }, [emailNorm, emailFormatOk])

  // Handle availability
  useEffect(() => {
    let cancel = false
    const norm = normalizeHandle(form.handle)
    if (!norm)           { setHandleStatus('idle');    return }
    if (!handleSyntaxOk) { setHandleStatus('invalid'); return }
    setHandleStatus('checking')
    const t = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, 'usernames', norm))
        if (!cancel) setHandleStatus(snap.exists() ? 'taken' : 'available')
      } catch {
        // Firestore rules may block unauthenticated reads — server validates duplicates
        if (!cancel) setHandleStatus('unchecked')
      }
    }, 450)
    return () => { cancel = true; clearTimeout(t) }
  }, [form.handle, handleSyntaxOk])

  // Allow submit when handle check passes OR when Firestore check is unavailable
  // (server-side transaction always catches duplicates)
  const handleOk = handleStatus === 'available' || handleStatus === 'unchecked'
  const canSubmit = profileNameOk && handleSyntaxOk && handleOk &&
    emailFormatOk && emailStatus === 'available' &&
    passLenOk && passMatch && aceptaOk && !loading

  async function handleGoogle() {
    setServerError(''); setGoogleLoading(true)
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider())
      const snap = await getDoc(doc(db, 'users', result.user.uid))
      if (snap.exists() && snap.data().usernameSlug) {
        router.push('/perfil')
      } else {
        router.push('/registro/completar')
      }
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
        setServerError(friendlyError(err.code))
      }
    } finally { setGoogleLoading(false) }
  }

  async function onSubmit(e) {
    e.preventDefault()
    setTouched({ profileName: true, handle: true, email: true, pass: true, pass2: true, acepta: true })
    setServerError('')
    if (!canSubmit) return
    setLoading(true)
    try {
      // Re-check before creating (race condition guard)
      const methods = await fetchSignInMethodsForEmail(auth, emailNorm).catch(() => [])
      if (methods.length > 0) { setEmailStatus('taken'); throw new Error('Ese correo ya está registrado.') }
      const slug = normalizeHandle(form.handle)
      const unameSnap = await getDoc(doc(db, 'usernames', slug)).catch(() => null)
      if (unameSnap?.exists()) { setHandleStatus('taken'); throw new Error('Ese usuario ya está en uso.') }

      const cred = await createUserWithEmailAndPassword(auth, emailNorm, form.pass)
      await updateProfile(cred.user, { displayName: form.profileName.trim() })

      let mcUUID = null
      if (form.minecraftUsername.trim()) {
        try {
          const res = await fetch(`/api/minecraft?username=${encodeURIComponent(form.minecraftUsername.trim())}`)
          if (res.ok) mcUUID = (await res.json()).id
        } catch { /* ignore */ }
      }

      await reserveUsernameAndUpsertProfile({
        uid: cred.user.uid,
        email: emailNorm,
        profileName: form.profileName.trim(),
        handleInput: form.handle,
        minecraftUsername: form.minecraftUsername.trim() || null,
        minecraftUUID: mcUUID,
      })
      router.push('/perfil')
    } catch (err) {
      const code = err?.code || ''
      const msg  = err?.message || ''
      if (code === 'auth/weak-password')            setServerError('La contraseña es muy débil.')
      else if (code === 'auth/invalid-email')        setServerError('Correo inválido.')
      else if (code === 'auth/email-already-in-use' || /correo ya est/i.test(msg)) setServerError('Ese correo ya está registrado.')
      else if (/usuario ya est/i.test(msg))          setServerError('Ese usuario ya está en uso. Elige otro.')
      else setServerError('Ocurrió un error creando la cuenta.')

      const u = auth.currentUser
      if (u) { try { await deleteUser(u) } catch { /* ignore */ } }
    } finally { setLoading(false) }
  }

  if (googleLoading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <style>{S}</style>
        <svg style={{ animation:'spin .7s linear infinite', width:28, height:28 }} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity=".2"/><path d="M21 12a9 9 0 00-9-9"/>
        </svg>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <style>{S}</style>
      <div className="auth-card">
        <h1 className="auth-title">Crear cuenta</h1>
        <p className="auth-sub">
          ¿Ya tienes cuenta? <Link href="/login" style={{ color: 'var(--accent2)' }}>Inicia sesión</Link>
        </p>

        <button onClick={handleGoogle} disabled={loading} className="auth-google-btn">
          <GoogleLogo />
          Registrarse con Google
        </button>

        <Divider />

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <Field label="Nombre de perfil">
            <input
              type="text"
              placeholder="Cómo quieres que te vean (apodo, alias…)"
              value={form.profileName}
              onChange={e => update('profileName', e.target.value)}
              onBlur={() => touch('profileName')}
              maxLength={DISPLAY_NAME_MAX}
              style={inputStyle(touched.profileName && !profileNameOk ? 'error' : 'idle')}
            />
            {touched.profileName && !profileNameOk && <Hint color="#f87171">Mínimo 2 caracteres.</Hint>}
          </Field>

          <Field label="Usuario">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--sub)', fontSize: 14 }}>@</span>
              <input
                type="text"
                placeholder="tu_usuario"
                value={form.handle}
                onChange={e => update('handle', normalizeHandle(e.target.value))}
                onBlur={() => touch('handle')}
                maxLength={USERNAME_MAX}
                style={{ ...inputStyle(
                  (touched.handle && (!handleSyntaxOk || handleStatus === 'taken')) ? 'error'
                  : handleStatus === 'available' && handleSyntaxOk ? 'ok'
                  : handleStatus === 'checking' ? 'checking'
                  : 'idle'
                ), flex: 1 }}
              />
            </div>
            <StatusHint status={handleStatus} syntaxOk={handleSyntaxOk} touched={touched.handle} msg={handleCheck.msg}
              checkingText="Comprobando…"
              availableText="Disponible ✓"
              takenText="Ese usuario ya está en uso."
              uncheckedText="No se pudo verificar disponibilidad (se comprobará al crear la cuenta)."
            />
            <Hint color="var(--muted)">Solo minúsculas, números, - y _. {USERNAME_MIN}–{USERNAME_MAX} caracteres.</Hint>
          </Field>

          <Field label="Correo electrónico">
            <input
              type="email"
              placeholder="tucorreo@ejemplo.com"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              onBlur={() => touch('email')}
              style={inputStyle(
                (touched.email && (!emailFormatOk || emailStatus === 'taken')) ? 'error'
                : emailStatus === 'available' && emailFormatOk ? 'ok'
                : emailStatus === 'checking' ? 'checking'
                : 'idle'
              )}
            />
            <StatusHint status={emailStatus} syntaxOk={emailFormatOk} touched={touched.email}
              checkingText="Comprobando…"
              availableText="Disponible ✓"
              takenText="Ese correo ya está registrado."
            />
            {touched.email && !emailFormatOk && form.email && <Hint color="#f87171">Correo inválido.</Hint>}
          </Field>

          <Field label="Contraseña">
            <div style={{ position: 'relative' }}>
              <input
                type={show1 ? 'text' : 'password'}
                placeholder="Mínimo 8 caracteres"
                value={form.pass}
                onChange={e => update('pass', e.target.value)}
                onBlur={() => touch('pass')}
                style={{ ...inputStyle(touched.pass && !passLenOk ? 'error' : 'idle'), width: '100%', paddingRight: 44, boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShow1(v => !v)} style={eyeBtn}>
                <EyeIcon open={show1} />
              </button>
            </div>
            {touched.pass && !passLenOk && <Hint color="#f87171">Mínimo 8 caracteres.</Hint>}
          </Field>

          <Field label="Confirmar contraseña">
            <div style={{ position: 'relative' }}>
              <input
                type={show2 ? 'text' : 'password'}
                placeholder="Repite tu contraseña"
                value={form.pass2}
                onChange={e => update('pass2', e.target.value)}
                onBlur={() => touch('pass2')}
                style={{ ...inputStyle(showPassMismatch ? 'error' : 'idle'), width: '100%', paddingRight: 44, boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShow2(v => !v)} style={eyeBtn}>
                <EyeIcon open={show2} />
              </button>
            </div>
            {showPassMismatch && <Hint color="#f87171">Las contraseñas no coinciden.</Hint>}
          </Field>

          <Field label="Usuario de Minecraft (opcional)">
            <input
              type="text"
              placeholder="TuNombreEnMinecraft"
              value={form.minecraftUsername}
              onChange={e => update('minecraftUsername', e.target.value)}
              style={inputStyle('idle')}
            />
            <Hint color="var(--muted)">Para mostrar tu skin en el perfil. No necesitas cuenta premium.</Hint>
          </Field>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--sub)', cursor: 'pointer', marginTop: 2 }}>
            <input
              type="checkbox"
              checked={form.acepta}
              onChange={e => update('acepta', e.target.checked)}
              onBlur={() => touch('acepta')}
              style={{ marginTop: 2, accentColor: 'var(--accent)', width: 15, height: 15 }}
            />
            <span>
              Acepto los{' '}
              <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--accent2)' }}>Términos</a>
              {' '}y la{' '}
              <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--accent2)' }}>Política de privacidad</a>.
            </span>
          </label>
          {touched.acepta && !aceptaOk && <Hint color="#f87171">Debes aceptar los términos para continuar.</Hint>}

          {serverError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13 }}>
              {serverError}
            </div>
          )}

          <button type="submit" disabled={!canSubmit} className="auth-submit-btn">
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function RegistroPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <style>{`@keyframes spin { to { transform:rotate(360deg) } }`}</style>
        <svg style={{ animation:'spin .7s linear infinite', width:28, height:28 }} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity=".2"/><path d="M21 12a9 9 0 00-9-9"/>
        </svg>
      </div>
    }>
      <RegisterPage />
    </Suspense>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, color: 'var(--sub)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  )
}

function Hint({ color, children }) {
  return <span style={{ fontSize: 12, color }}>{children}</span>
}

function StatusHint({ status, syntaxOk, touched, msg, checkingText, availableText, takenText, uncheckedText }) {
  if (status === 'checking')                return <Hint color="#facc15"><TinySpinner />{checkingText}</Hint>
  if (status === 'available' && syntaxOk)   return <Hint color="#4ade80">{availableText}</Hint>
  if (status === 'taken')                   return <Hint color="#f87171">{takenText}</Hint>
  if (status === 'unchecked' && uncheckedText) return <Hint color="#94a3b8">{uncheckedText}</Hint>
  if (touched && !syntaxOk && msg)          return <Hint color="#f87171">{msg}</Hint>
  return null
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>o con email</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  )
}

const borderColor = { idle: 'var(--border)', ok: 'rgba(74,222,128,0.5)', error: 'rgba(239,68,68,0.6)', checking: 'rgba(250,204,21,0.5)' }

function inputStyle(state = 'idle') {
  return {
    padding: '11px 14px', borderRadius: 10,
    border: `1px solid ${borderColor[state] ?? borderColor.idle}`,
    background: 'var(--card)', color: 'var(--text)', fontSize: 14,
    outline: 'none', width: '100%', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }
}

const googleBtn = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 10, padding: '12px 16px', border: '1px solid var(--border)',
  borderRadius: 12, background: 'var(--card)', color: 'var(--text)',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
}

const eyeBtn = {
  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sub)',
  display: 'flex', alignItems: 'center', padding: 4,
}

function friendlyError(code) {
  const map = {
    'auth/email-already-in-use':  'Ya existe una cuenta con ese email.',
    'auth/weak-password':         'La contraseña es muy débil.',
    'auth/invalid-email':         'El email no es válido.',
    'auth/network-request-failed':'Error de red.',
  }
  return map[code] ?? `Error: ${code}`
}