'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
} from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'

export default function RegisterPage() {
  const router = useRouter()
  const [displayName, setDisplayName]           = useState('')
  const [email, setEmail]                       = useState('')
  const [password, setPassword]                 = useState('')
  const [minecraftUsername, setMinecraftUsername] = useState('')
  const [error, setError]                       = useState('')
  const [loading, setLoading]                   = useState(false)

  async function saveUserDoc(uid, data) {
    await setDoc(doc(db, 'users', uid), {
      displayName: data.displayName,
      photoURL:    data.photoURL ?? null,
      email:       data.email,
      minecraftUsername: data.minecraftUsername ?? null,
      minecraftUUID:     null,
      createdAt:   serverTimestamp(),
    }, { merge: true })
  }

  async function handleEmail(e) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: displayName.trim() })
      let mcUUID = null
      if (minecraftUsername.trim()) {
        try {
          const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(minecraftUsername.trim())}`)
          if (res.ok) mcUUID = (await res.json()).id
        } catch { /* ignore */ }
      }
      await saveUserDoc(cred.user.uid, {
        displayName: displayName.trim(),
        email,
        minecraftUsername: minecraftUsername.trim() || null,
        minecraftUUID: mcUUID,
      })
      router.push('/amigos')
    } catch (err) {
      setError(friendlyError(err.code))
    } finally { setLoading(false) }
  }

  async function handleGoogle() {
    setError(''); setLoading(true)
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider())
      await saveUserDoc(cred.user.uid, {
        displayName: cred.user.displayName,
        photoURL: cred.user.photoURL,
        email: cred.user.email,
      })
      router.push('/amigos')
    } catch (err) {
      if (err.code !== 'auth/cancelled-popup-request') setError(friendlyError(err.code))
    } finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 80 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Crear cuenta</h1>
        <p style={{ color: 'var(--sub)', fontSize: 14, marginBottom: 28 }}>
          ¿Ya tienes cuenta? <Link href="/login" style={{ color: 'var(--accent2)' }}>Inicia sesión</Link>
        </p>

        <button onClick={handleGoogle} disabled={loading} style={googleBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Registrarse con Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>o con email</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
            placeholder="Tu nombre (apodo)" required minLength={2} style={inputStyle} />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required style={inputStyle} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Contraseña (mínimo 6 caracteres)" required minLength={6} style={inputStyle} />
          <div>
            <input type="text" value={minecraftUsername} onChange={e => setMinecraftUsername(e.target.value)}
              placeholder="Usuario de Minecraft (opcional)" style={inputStyle} />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Para mostrar tu cabeza de skin en el perfil. No es necesario tener cuenta premium.
            </p>
          </div>
          {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={loading} style={submitBtn}>
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--card)',
  color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
}

const googleBtn = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 10, padding: '12px 16px', border: '1px solid var(--border)',
  borderRadius: 12, background: 'var(--card)', color: 'var(--text)',
  fontSize: 14, fontWeight: 500, cursor: 'pointer',
}

const submitBtn = {
  padding: '12px', borderRadius: 10, border: 'none',
  background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}

function friendlyError(code) {
  const map = {
    'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
    'auth/weak-password':        'La contraseña es muy débil (mínimo 6 caracteres).',
    'auth/invalid-email':        'El email no es válido.',
    'auth/network-request-failed': 'Error de red.',
  }
  return map[code] ?? `Error: ${code}`
}