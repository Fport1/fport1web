import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <p style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 72, fontWeight: 700, color: 'var(--accent2)', margin: 0 }}>404</p>
      <p style={{ color: 'var(--sub)', fontSize: 16 }}>Página no encontrada</p>
      <Link href="/" style={{ color: 'var(--accent2)', fontSize: 14 }}>← Volver al inicio</Link>
    </div>
  )
}