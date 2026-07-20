'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import Link from 'next/link'
import { resolvePresence } from '@/lib/presence'

export default function FriendProfilePage({ params }) {
  const { uid } = params
  const [profile, setProfile]   = useState(null)
  const [presRaw, setPresRaw]   = useState(null)
  const [skinHead, setSkinHead] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    let unsubs = []

    const pUnsub = onSnapshot(doc(db, 'users', uid), snap => {
      const p = snap.exists() ? snap.data() : null
      setProfile(p)
      if (p?.minecraftUUID) {
        const clean = p.minecraftUUID.replace(/-/g, '')
        setSkinHead(`https://crafatar.com/avatars/${clean}?size=128&overlay`)
      }
      setLoading(false)
    }, () => setLoading(false))

    const presUnsub = onSnapshot(doc(db, 'presence', uid), snap => {
      setPresRaw(snap.exists() ? snap.data() : null)
    }, () => {})

    unsubs = [pUnsub, presUnsub]
    return () => unsubs.forEach(u => u())
  }, [uid])

  function addInLauncher() {
    const name = encodeURIComponent(profile?.profileName ?? profile?.displayName ?? 'Desconocido')
    window.location.href = `modpacklauncher://friend-add?uid=${uid}&username=${name}`
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Cargando perfil...</div>
  )

  if (!profile) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ color: 'var(--muted)', fontSize: 16 }}>Perfil no encontrado.</p>
      <Link href="/" style={{ color: 'var(--accent2)', fontSize: 14 }}>← Volver al inicio</Link>
    </div>
  )

  // Public profile page — viewer identity unknown, use isFriend=false (conservative)
  const p         = resolvePresence(presRaw, false)
  const isPlaying = !!p?.playing
  const isOnline  = !!p?.online
  const displayName = profile.profileName ?? profile.displayName ?? '?'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>

        {skinHead ? (
          <img src={skinHead} alt={displayName} style={{ width: 96, height: 96, borderRadius: 16, marginBottom: 16, imageRendering: 'pixelated' }} />
        ) : profile.photoURL ? (
          <img src={profile.photoURL} alt={displayName} style={{ width: 96, height: 96, borderRadius: '50%', marginBottom: 16, objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700, color: '#fff', margin: '0 auto 16px' }}>
            {displayName[0]?.toUpperCase()}
          </div>
        )}

        <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{displayName}</h1>
        {profile.usernameSlug && <p style={{ fontSize: 13, color: 'var(--accent2)', marginBottom: 4 }}>@{profile.usernameSlug}</p>}
        {profile.minecraftUsername && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>⛏ {profile.minecraftUsername}</p>
        )}

        <p style={{ fontSize: 13, marginBottom: 24, color: isPlaying ? '#4ade80' : isOnline ? '#60a5fa' : 'var(--muted)' }}>
          {isPlaying ? '🎮 Jugando ahora mismo' : isOnline ? '🟢 En línea' : '⚫ Desconectado'}
        </p>

        <button onClick={addInLauncher} style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 12, boxShadow: '0 0 20px rgba(124,58,237,.3)' }}>
          ➕ Añadir como amigo en el Launcher
        </button>

        <Link href="/#descargar" style={{ display: 'block', padding: '12px', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--sub)', fontSize: 13, textDecoration: 'none' }}>
          ¿No tienes ModpackLauncher? Descárgalo aquí →
        </Link>
      </div>
    </div>
  )
}
