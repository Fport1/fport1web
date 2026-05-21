'use client'

import Link from 'next/link'
import { useAuth } from '@/components/auth-context'

export default function Nav() {
  const { user, profile, loading, signOut } = useAuth()

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
              <>
                <Link href="/amigos" style={{ color: 'var(--sub)', fontSize: 14, fontWeight: 500, textDecoration: 'none' }}>
                  {profile?.profileName || profile?.username || 'Perfil'}
                </Link>
                <button
                  onClick={signOut}
                  title="Cerrar sesión"
                  style={{ fontSize: 12, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                >
                  Salir
                </button>
              </>
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
    </nav>
  )
}