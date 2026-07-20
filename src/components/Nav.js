'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { useUnreadCount } from '@/lib/useUnreadCount'
import AvengersLogo from '@/components/AvengersLogo'

const ACCOUNTS_KEY = 'fport1_accounts'
// Botón Doomsday visible hasta el 16 de diciembre de 2026 (día del estreno en Latam es el 17)
const DOOMSDAY_DEADLINE = new Date('2026-12-17T00:00:00').getTime()

function getInitial(name) {
  return name ? name.trim()[0].toUpperCase() : '?'
}

function MiniAvatar({ photoURL, name, size = 22 }) {
  const [err, setErr] = useState(false)
  if (photoURL && !err) return <img src={photoURL} alt={name} onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.45, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {getInitial(name)}
    </div>
  )
}

export default function Nav() {
  const router = useRouter()
  const { user, profile, loading, switching, signOut, switchToGoogle } = useAuth()
  const unread = useUnreadCount(user?.uid)
  const [open, setOpen] = useState(false)
  const [savedAccounts, setSavedAccounts] = useState([])
  const ref = useRef(null)

  // Save current account to localStorage
  useEffect(() => {
    if (!user) return
    const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]')
    const entry = {
      uid: user.uid,
      profileName: profile?.profileName || profile?.username?.replace(/^@/, '') || user.displayName || user.email?.split('@')[0] || 'Sin nombre',
      username: profile?.username || null,
      photoURL: profile?.photoURL || user.photoURL || null,
      email: user.email || null,
      provider: user.providerData?.[0]?.providerId || 'password',
    }
    const idx = accounts.findIndex(a => a.uid === user.uid)
    if (idx >= 0) accounts[idx] = entry
    else accounts.push(entry)
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
    setSavedAccounts(accounts.filter(a => a.uid !== user.uid))
  }, [user, profile])

  // Load other saved accounts on mount
  useEffect(() => {
    if (!user) return
    const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]')
    setSavedAccounts(accounts.filter(a => a.uid !== user.uid))
  }, [user])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function switchAccount(acc) {
    setOpen(false)
    if (acc.provider === 'google.com') {
      try {
        await switchToGoogle(acc.email)
        router.push('/perfil')
      } catch { /* cancelled */ }
    } else {
      await signOut()
      const q = acc.email ? `?email=${encodeURIComponent(acc.email)}` : ''
      router.push(`/login${q}`)
    }
  }

  async function addAccount() {
    setOpen(false)
    await signOut()
    router.push('/login')
  }

  function removeAccount(uid, e) {
    e.stopPropagation()
    const accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]').filter(a => a.uid !== uid)
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
    setSavedAccounts(accounts.filter(a => a.uid !== user?.uid))
  }

  const myName = profile?.profileName || profile?.username || 'Perfil'

  const itemStyle = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '8px 12px', borderRadius: 7, fontSize: 13,
    color: 'var(--sub)', background: 'none', border: 'none',
    cursor: 'pointer', textAlign: 'left', transition: 'background .12s, color .12s',
  }

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      backdropFilter: 'blur(14px)',
      background: 'rgba(9,9,11,.8)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '0 24px',
        height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--text)', textDecoration: 'none' }}>
          Fport1
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Avengers: Doomsday — solo con sesión, hasta el 16 dic 2026 */}
          {!loading && user && Date.now() < DOOMSDAY_DEADLINE && (
            <Link
              href="/doomsday"
              title="Avengers: Doomsday — ¿quién va?"
              style={{
                display: 'flex', alignItems: 'center',
                color: 'var(--sub)', textDecoration: 'none',
                transition: 'color .2s, filter .2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = '#15803d'
                e.currentTarget.style.filter = 'drop-shadow(0 0 8px rgba(21,128,61,.7))'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--sub)'
                e.currentTarget.style.filter = 'none'
              }}
            >
              <AvengersLogo size={22} />
            </Link>
          )}

          <Link href="/#launcher" style={{ color: 'var(--sub)', fontSize: 14, textDecoration: 'none' }}>Launcher</Link>

          {!loading && !switching && (
            user ? (
              <div ref={ref} style={{ position: 'relative' }}>
                <button
                  onClick={() => setOpen(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none',
                    padding: 0, cursor: 'pointer',
                    color: 'var(--sub)', fontSize: 13, fontWeight: 500,
                    transition: 'color .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--sub)'}
                >
                  <div style={{ position: 'relative' }}>
                    <MiniAvatar photoURL={profile?.photoURL} name={myName} size={24} />
                    {unread > 0 && (
                      <span style={{
                        position: 'absolute', top: -3, right: -3,
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--accent)',
                        border: '1.5px solid rgba(9,9,11,.8)',
                      }} />
                    )}
                  </div>
                  {myName}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {open && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: 4, minWidth: 200,
                    boxShadow: '0 8px 32px rgba(0,0,0,.5)',
                    animation: 'dropdownIn .12s ease',
                  }}>

                    {/* Current account */}
                    <div style={{ padding: '8px 12px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MiniAvatar photoURL={profile?.photoURL} name={myName} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myName}</p>
                        {profile?.username && <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>@{profile.username.replace(/^@/, '')}</p>}
                      </div>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>

                    {/* Other saved accounts */}
                    {savedAccounts.length > 0 && (
                      <>
                        <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />
                        {savedAccounts.map(acc => (
                          <button key={acc.uid} onClick={() => switchAccount(acc)}
                            style={{ ...itemStyle, position: 'relative' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sub)' }}
                          >
                            <MiniAvatar photoURL={acc.photoURL} name={acc.profileName} size={22} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.profileName}</p>
                              {acc.username && <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>@{acc.username.replace(/^@/, '')}</p>}
                            </div>
                            <span
                              onClick={e => removeAccount(acc.uid, e)}
                              style={{ fontSize: 11, color: 'var(--muted)', padding: '2px 4px', borderRadius: 4, lineHeight: 1 }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#f87171' }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)' }}
                            >✕</span>
                          </button>
                        ))}
                      </>
                    )}

                    {/* Add account */}
                    <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />
                    <button onClick={addAccount}
                      style={itemStyle}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sub)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Añadir cuenta
                    </button>

                    <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />

                    {/* Social */}
                    <Link href="/perfil" onClick={() => setOpen(false)}
                      style={{ ...itemStyle, textDecoration: 'none', display: 'flex' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sub)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      Social
                    </Link>

                    {/* Mensajes */}
                    <Link href="/mensajes" onClick={() => setOpen(false)}
                      style={{ ...itemStyle, textDecoration: 'none', display: 'flex' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sub)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      Mensajes
                      {unread > 0 && (
                        <span style={{
                          marginLeft: 'auto', background: 'var(--accent)', color: '#fff',
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99,
                        }}>
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </Link>

                    <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />

                    {/* Sign out */}
                    <button
                      onClick={() => { setOpen(false); signOut() }}
                      style={itemStyle}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.1)'; e.currentTarget.style.color = '#f87171' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sub)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login" style={{
                fontSize: 13, fontWeight: 600,
                background: 'var(--accent)', color: '#fff',
                padding: '6px 16px', borderRadius: 8, textDecoration: 'none',
              }}>
                Entrar
              </Link>
            )
          )}
        </div>
      </div>

      <style>{`
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </nav>
  )
}
