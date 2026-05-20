'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import Link from 'next/link'

export default function FriendProfilePage({ params }) {
  const { uid } = params
  const [profile, setProfile]   = useState(null)
  const [presence, setPresence] = useState(null)
  const [skinHead, setSkinHead] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [userSnap, presSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          getDoc(doc(db, 'presence', uid)),
        ])
        const p = userSnap.exists() ? userSnap.data() : null
        setProfile(p)
        setPresence(presSnap.exists() ? presSnap.data() : null)

        if (p?.minecraftUUID) {
          const clean = p.minecraftUUID.replace(/-/g, '')
          setSkinHead(`https://crafatar.com/avatars/${clean}?size=128&overlay`)
        }
      } catch { /* ignore */ } finally { setLoading(false) }
    }
    load()
  }, [uid])

  function addInLauncher() {
    const name = encodeURIComponent(profile?.displayName ?? 'Desconocido')
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

  const isOnline  = presence?.online
  const isPlaying = presence?.playing

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>

        {/* Avatar */}
        {skinHead ? (
          <img src={skinHead} alt={profile.displayName} style={{ width: 96, height: 96, borderRadius: 16, marginBottom: 16, imageRendering: 'pixelated' }} />
        ) : profile.photoURL ? (
          <img src={profile.photoURL} alt={profile.displayName} style={{ width: 96, height: 96, borderRadius: '50%', marginBottom: 16 }} />
        ) : (
          <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700, color: '#fff', margin: '0 auto 16px' }}>
            {profile.displayName?.[0]?.toUpperCase()}
          </div>
        )}

        <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 28, fontWeight: 700, marginBottom: 4 }}>{profile.displayName}</h1>

        {profile.minecraftUsername && (
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>⛏ {profile.minecraftUsername}</p>
        )}

        <p style={{ fontSize: 13, marginBottom: 24, color: isPlaying ? '#22c55e' : isOnline ? '#60a5fa' : 'var(--muted)' }}>
          {isPlaying ? '🎮 Jugando ahora mismo' : isOnline ? '🟢 En línea' : '⚫ Desconectado'}
        </p>

        <button onClick={addInLauncher} style={{ width: '100%', padding: '14px', borderRadius: 12, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
          ➕ Añadir como amigo en el Launcher
        </button>

        <Link href="/#descargar" style={{ display: 'block', padding: '12px', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--sub)', fontSize: 13, textDecoration: 'none' }}>
          ¿No tienes ModpackLauncher? Descárgalo aquí →
        </Link>
      </div>
    </div>
  )
}