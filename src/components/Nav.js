'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth-context'

export default function Nav() {
  const { user, profile, loading, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
          <Link href="/#launcher" style={{ color: 'var(--sub)', fontSize: 14, textDecoration: 'none' }}>Launcher</Link>

          {!loading && (
            user ? (
              <div ref={ref} style={{ position: 'relative' }}>
                <button
                  onClick={() => setOpen(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: 'none', border: 'none',
                    padding: 0, cursor: 'pointer',
                    color: 'var(--sub)', fontSize: 13, fontWeight: 500,
                    transition: 'color .15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--sub)'}
                >
                  {profile?.profileName || profile?.username || 'Perfil'}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    style={{ color: 'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {open && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 10, padding: 4, minWidth: 160,
                    boxShadow: '0 8px 32px rgba(0,0,0,.5)',
                    animation: 'dropdownIn .12s ease',
                  }}>
                    <Link
                      href="/perfil"
                      onClick={() => setOpen(false)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 12px', borderRadius: 7, fontSize: 13,
                        color: 'var(--sub)', textDecoration: 'none', transition: 'background .12s, color .12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg3)'; e.currentTarget.style.color = 'var(--text)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sub)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      Social
                    </Link>

                    <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />

                    <button
                      onClick={() => { setOpen(false); signOut() }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '9px 12px', borderRadius: 7, fontSize: 13,
                        color: 'var(--muted)', background: 'none', border: 'none',
                        cursor: 'pointer', textAlign: 'left', transition: 'background .12s, color .12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.1)'; e.currentTarget.style.color = '#f87171' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}
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