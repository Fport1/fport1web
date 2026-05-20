'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const GITHUB_API = 'https://api.github.com/repos/Fport1/modpacklauncher/releases/latest'

function detectOS() {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  const platform = navigator.platform || ''
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows'
  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) return 'mac-x64'
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux'
  return 'unknown'
}

function findAssets(assets) {
  const found = { windows: null, macX64: null, macArm: null, linux: null }
  for (const a of assets) {
    if (a.name.endsWith('.exe') && !a.name.endsWith('.blockmap')) found.windows = a.browser_download_url
    else if (a.name.endsWith('.dmg')) {
      if (/arm64/i.test(a.name)) found.macArm = a.browser_download_url
      else found.macX64 = a.browser_download_url
    } else if (a.name.endsWith('.AppImage')) found.linux = a.browser_download_url
  }
  return found
}

export default function Home() {
  const [version, setVersion] = useState('cargando...')
  const [assets, setAssets] = useState({ windows: null, macX64: null, macArm: null, linux: null })
  const [os, setOs] = useState('unknown')
  const [macGuideOpen, setMacGuideOpen] = useState(false)
  const [macCopied, setMacCopied] = useState(false)

  useEffect(() => {
    setOs(detectOS())
    fetch(GITHUB_API)
      .then(r => r.json())
      .then(data => {
        setVersion(data.tag_name?.replace(/^v/, '') ?? '—')
        setAssets(findAssets(data.assets ?? []))
      })
      .catch(() => setVersion('—'))
  }, [])

  const mainDownloadUrl = {
    windows: assets.windows, 'mac-x64': assets.macX64,
    'mac-arm': assets.macArm, linux: assets.linux,
  }[os]

  const mainLabel = {
    windows: 'Descargar para Windows (.exe)',
    'mac-x64': 'Descargar para macOS Intel (.dmg)',
    'mac-arm': 'Descargar para macOS Apple Silicon (.dmg)',
    linux: 'Descargar para Linux (.AppImage)',
    unknown: 'Ver todas las plataformas',
  }[os] ?? 'Detectando sistema...'

  function copyMacCmd() {
    navigator.clipboard.writeText('xattr -d com.apple.quarantine /Applications/ModpackLauncher.app')
    setMacCopied(true)
    setTimeout(() => setMacCopied(false), 2000)
  }

  const S = {
    page:       { paddingTop: 60 },
    hero:       { position: 'relative', minHeight: '92vh', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 48, padding: '80px 24px 60px', maxWidth: 1100, margin: '0 auto' },
    label:      { fontSize: 12, fontWeight: 600, letterSpacing: 2, color: 'var(--accent2)', textTransform: 'uppercase', marginBottom: 16 },
    h1:         { fontFamily: 'Rajdhani, sans-serif', fontSize: 'clamp(42px,6vw,80px)', fontWeight: 700, lineHeight: 1.05, marginBottom: 20 },
    accent:     { color: 'var(--accent2)' },
    sub:        { fontSize: 18, color: 'var(--sub)', lineHeight: 1.6, marginBottom: 36, maxWidth: 500 },
    btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 10, background: 'var(--accent)', color: '#fff', padding: '14px 28px', borderRadius: 12, fontWeight: 600, fontSize: 15, border: 'none', textDecoration: 'none', transition: 'background .2s' },
    btnGhost:   { display: 'inline-flex', alignItems: 'center', padding: '13px 22px', borderRadius: 12, fontWeight: 500, fontSize: 14, border: '1px solid var(--border)', color: 'var(--sub)', textDecoration: 'none' },
    vBadge:     { marginTop: 20, fontSize: 13, color: 'var(--muted)' },
    section:    { padding: '80px 24px', maxWidth: 1100, margin: '0 auto' },
    secTitle:   { fontFamily: 'Rajdhani, sans-serif', fontSize: 'clamp(28px,4vw,48px)', fontWeight: 700, textAlign: 'center', marginBottom: 48 },
    grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 20 },
    card:       { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '28px 24px' },
    cardIcon:   { fontSize: 32, marginBottom: 14 },
    cardTitle:  { fontFamily: 'Rajdhani, sans-serif', fontSize: 20, fontWeight: 600, marginBottom: 8 },
    cardText:   { fontSize: 14, color: 'var(--sub)', lineHeight: 1.6 },
    dlGrid:     { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 32 },
    dlCard:     { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 20px' },
    dlBtn:      { display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, padding: '10px 18px', background: 'var(--accent)', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 600, textDecoration: 'none' },
    platformHeader: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
    footer:     { borderTop: '1px solid var(--border)', padding: '32px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1100, margin: '0 auto', color: 'var(--muted)', fontSize: 13 },
  }

  const features = [
    { icon: '⚡', title: 'Auto-update', text: 'El launcher se actualiza solo. Tus modpacks también, sin que toques nada.' },
    { icon: '🌐', title: 'Modrinth integrado', text: 'Busca e instala mods directamente desde Modrinth sin salir del launcher.' },
    { icon: '🖥', title: 'Cross-platform', text: 'Windows, macOS (Intel y Apple Silicon) y Linux. Un solo launcher para todo.' },
    { icon: '🎮', title: 'Múltiples instancias', text: 'Administra Fabric, Forge y NeoForge en la misma interfaz, sin conflictos.' },
    { icon: '🎨', title: 'Vista 3D de skin', text: 'Previsualiza tu skin de Minecraft en 3D directamente desde el perfil.' },
    { icon: '👥', title: 'Amigos y chat', text: 'Añade amigos, ve quién está jugando ahora mismo y chatea desde el launcher.' },
  ]

  return (
    <div style={S.page}>
      {/* HERO */}
      <div style={{ position: 'relative', background: `radial-gradient(ellipse 60% 50% at 70% 50%, rgba(124,58,237,.12) 0%, transparent 70%)` }}>
        <div style={S.hero}>
          <div style={{ flex: 1 }}>
            <p style={S.label}>Featured Project</p>
            <h1 style={S.h1}>Modpack<span style={S.accent}>Launcher</span></h1>
            <p style={S.sub}>
              Cross-platform Minecraft modpack launcher con auto-update,<br />
              gestión de mods e integración con Modrinth.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {mainDownloadUrl ? (
                <a href={mainDownloadUrl} style={S.btnPrimary}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {mainLabel}
                </a>
              ) : (
                <a href="#descargar" style={S.btnPrimary}>{mainLabel}</a>
              )}
              <a href="#descargar" style={S.btnGhost}>Ver todas las plataformas</a>
            </div>
            <p style={S.vBadge}>Versión <strong>v{version}</strong> &nbsp;·&nbsp; Siempre la última</p>
          </div>

          {/* Mockup */}
          <div style={{ flex: '0 0 420px', maxWidth: '100%' }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,.5)' }}>
              <div style={{ background: 'var(--bg3)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57', display: 'inline-block' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e', display: 'inline-block' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840', display: 'inline-block' }} />
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>ModpackLauncher</span>
              </div>
              <div style={{ display: 'flex', height: 220 }}>
                <div style={{ width: 130, background: 'var(--bg2)', borderRight: '1px solid var(--border)', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {['🗂 Instancias', '🧩 Mods', '👥 Amigos', '⚙️ Ajustes'].map((item, i) => (
                    <div key={i} style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, background: i === 0 ? 'rgba(124,58,237,.2)' : 'transparent', color: i === 0 ? 'var(--accent2)' : 'var(--muted)' }}>{item}</div>
                  ))}
                </div>
                <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['⛏', 'SkyBlock Ultra', 'Fabric 1.21 · 47 mods'], ['🌲', 'Better Survival', 'Forge 1.20.1 · 83 mods'], ['🔮', 'Magic Realm', 'NeoForge 1.21 · 61 mods']].map(([icon, name, meta], i) => (
                    <div key={i} style={{ background: 'var(--bg3)', borderRadius: 10, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 20 }}>{icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{meta}</div>
                      </div>
                      <div style={{ fontSize: 18, color: 'var(--accent2)' }}>▶</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FEATURES */}
      <section id="launcher" style={S.section}>
        <h2 style={S.secTitle}>¿Por qué <span style={S.accent}>ModpackLauncher</span>?</h2>
        <div style={S.grid}>
          {features.map(f => (
            <div key={f.title} style={S.card}>
              <div style={S.cardIcon}>{f.icon}</div>
              <h3 style={S.cardTitle}>{f.title}</h3>
              <p style={S.cardText}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* DOWNLOADS */}
      <section id="descargar" style={{ ...S.section, background: 'var(--bg2)', borderRadius: 24 }}>
        <h2 style={S.secTitle}>Descargar</h2>
        <p style={{ textAlign: 'center', color: 'var(--sub)', marginBottom: 32 }}>Versión <strong>v{version}</strong></p>
        <div style={S.dlGrid}>
          {[
            { id: 'windows', label: 'Windows', desc: 'Instalador NSIS · x64', ext: '.exe', url: assets.windows, highlight: os === 'windows' },
            { id: 'mac-x64', label: 'macOS Intel', desc: 'DMG · x64', ext: '.dmg', url: assets.macX64, highlight: os === 'mac-x64' },
            { id: 'mac-arm', label: 'macOS Apple Silicon', desc: 'DMG · arm64', ext: '.dmg', url: assets.macArm, highlight: os === 'mac-arm' },
            { id: 'linux', label: 'Linux', desc: 'AppImage · x86_64', ext: '.AppImage', url: assets.linux, highlight: os === 'linux' },
          ].map(p => (
            <div key={p.id} style={{ ...S.dlCard, borderColor: p.highlight ? 'var(--accent)' : 'var(--border)' }}>
              <div style={S.platformHeader}>
                <strong style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 17 }}>{p.label}</strong>
                {p.highlight && <span style={{ fontSize: 11, background: 'var(--accent)', color: '#fff', borderRadius: 6, padding: '2px 8px' }}>Tu sistema</span>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{p.desc}</p>
              {p.url ? (
                <a href={p.url} style={S.dlBtn}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Descargar {p.ext}
                </a>
              ) : (
                <span style={{ ...S.dlBtn, opacity: .4, cursor: 'not-allowed' }}>No disponible</span>
              )}
            </div>
          ))}
        </div>

        {/* macOS guide */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
          <button
            onClick={() => setMacGuideOpen(v => !v)}
            style={{ width: '100%', padding: '14px 20px', background: 'var(--bg3)', border: 'none', color: 'var(--text)', textAlign: 'left', fontSize: 14, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>🍎 ¿Cómo instalo en macOS? <span style={{ fontSize: 11, background: 'var(--accent)', color: '#fff', borderRadius: 6, padding: '2px 8px', marginLeft: 8 }}>¡Léeme!</span></span>
            <span>{macGuideOpen ? '▲' : '▼'}</span>
          </button>
          {macGuideOpen && (
            <div style={{ padding: '20px', fontSize: 14, color: 'var(--sub)', lineHeight: 1.7 }}>
              <p style={{ marginBottom: 12 }}>macOS bloquea apps sin firma de Apple ($99/año). No está dañada — solo hay que desbloquearla manualmente:</p>
              <ol style={{ paddingLeft: 20, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li>Descarga el <strong>.dmg</strong>, ábrelo y arrastra el launcher a <em>Aplicaciones</em>.</li>
                <li>Intenta abrirlo — macOS dirá que está dañado. Dale OK y ciérralo.</li>
                <li>Abre <strong>Terminal</strong> (<kbd>⌘ Cmd</kbd> + <kbd>Espacio</kbd> → escribe Terminal) y ejecuta:</li>
              </ol>
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }}>
                <code>xattr -d com.apple.quarantine /Applications/ModpackLauncher.app</code>
                <button onClick={copyMacCmd} style={{ marginLeft: 12, padding: '4px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  {macCopied ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
              <p>4. ¡Listo! Ábrelo desde Aplicaciones. Ya no habrá más mensajes de bloqueo.</p>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          Ver todas las versiones en{' '}
          <a href="https://github.com/Fport1/modpacklauncher/releases" target="_blank" rel="noopener" style={{ color: 'var(--accent2)' }}>
            GitHub Releases →
          </a>
        </p>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid var(--border)', marginTop: 0 }}>
        <div style={S.footer}>
          <span style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: 18 }}>Fport1</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/login" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>Entrar</Link>
            <Link href="/amigos" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>Amigos</Link>
          </div>
          <span>© 2025 Francisco Porto</span>
        </div>
      </footer>
    </div>
  )
}