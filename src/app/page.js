'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const GITHUB_API = 'https://api.github.com/repos/Fport1/modpacklauncher/releases/latest'

async function detectOS() {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  const platform = navigator.platform || ''
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows'
  if (/Linux/i.test(platform) || /Linux/i.test(ua)) return 'linux'
  if (/Mac/i.test(platform) || /Macintosh/i.test(ua)) {
    // 1. API moderna (Chrome/Edge): reporta arquitectura real
    try {
      if (navigator.userAgentData?.getHighEntropyValues) {
        const d = await navigator.userAgentData.getHighEntropyValues(['architecture'])
        return d.architecture === 'arm' ? 'mac-arm' : 'mac-x64'
      }
    } catch {}
    // 2. WebGL renderer (funciona en Safari): Apple M-series tiene "Apple GPU" o "Apple Mx"
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl')
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info')
        if (ext) {
          const r = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          if (/Apple M\d|Apple GPU/i.test(r)) return 'mac-arm'
          if (/Intel/i.test(r)) return 'mac-x64'
        }
      }
    } catch {}
    // 3. No se pudo detectar → mostrar ambas opciones
    return 'mac-unknown'
  }
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
  const [macCopied, setMacCopied]       = useState(false)
  const [macFlash, setMacFlash]         = useState(false)

  useEffect(() => {
    detectOS().then(setOs)
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
    'mac-unknown': 'Ver versiones de macOS ↓',
  }[os] ?? 'Detectando sistema...'

  function copyMacCmd() {
    navigator.clipboard.writeText('xattr -d com.apple.quarantine /Applications/ModpackLauncher.app')
    setMacCopied(true)
    setTimeout(() => setMacCopied(false), 2000)
  }

  function openMacGuide() {
    setMacGuideOpen(true)
    setMacFlash(false)
    setTimeout(() => {
      setMacFlash(true)
      document.getElementById('mac-guide')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    setTimeout(() => setMacFlash(false), 1400)
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

  const dlPlatforms = [
    { id: 'windows',  label: 'Windows',             desc: 'Instalador NSIS · x64',  ext: '.exe',      url: assets.windows, isMac: false },
    { id: 'mac-x64',  label: 'macOS Intel',          desc: 'DMG · x64',              ext: '.dmg',      url: assets.macX64,  isMac: true  },
    { id: 'mac-arm',  label: 'macOS Apple Silicon',  desc: 'DMG · arm64',            ext: '.dmg',      url: assets.macArm,  isMac: true  },
    { id: 'linux',    label: 'Linux',                desc: 'AppImage · x86_64',      ext: '.AppImage', url: assets.linux,   isMac: false },
  ]

  return (
    <div style={S.page}>
      {/* Background grid */}
      <div className="grid-overlay" />

      {/* HERO */}
      <div style={{ position: 'relative', background: `radial-gradient(ellipse 60% 50% at 70% 50%, rgba(124,58,237,.12) 0%, transparent 70%)` }}>
        <div style={S.hero}>
          <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
            <p style={S.label}>Featured Project</p>
            <h1 style={S.h1}>Modpack<span style={S.accent}>Launcher</span></h1>
            <p style={S.sub}>
              Cross-platform Minecraft modpack launcher con auto-update,<br />
              gestión de mods e integración con Modrinth.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {mainDownloadUrl ? (
                <a href={mainDownloadUrl} style={S.btnPrimary} className="btn-glow">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {mainLabel}
                </a>
              ) : (
                <a href="#descargar" style={S.btnPrimary} className="btn-glow">{mainLabel}</a>
              )}
              <a href="#descargar" style={S.btnGhost}>Ver todas las plataformas</a>
            </div>
            <p style={S.vBadge}>Versión <strong>v{version}</strong> &nbsp;·&nbsp; Siempre la última</p>
          </div>

          {/* Mockup */}
          <div style={{ flex: '0 0 420px', maxWidth: '100%', position: 'relative', zIndex: 1 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 0 60px rgba(124,58,237,.2), 0 24px 80px rgba(0,0,0,.6)' }}>
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
            <div key={f.title} style={S.card} className="card-hover">
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
          {dlPlatforms.map(p => (
            <div key={p.id} style={{ ...S.dlCard, borderColor: os === p.id ? 'var(--accent2)' : 'var(--border)', boxShadow: os === p.id ? '0 0 30px rgba(124,58,237,.25)' : 'none' }} className="card-hover">
              <div style={S.platformHeader}>
                <strong style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 17 }}>{p.label}</strong>
                {os === p.id && <span style={{ fontSize: 11, background: 'var(--accent)', color: '#fff', borderRadius: 6, padding: '2px 8px' }}>← Tu sistema</span>}
              </div>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{p.desc}</p>
              {p.url ? (
                <a
                  href={p.url}
                  className="dl-btn-outline"
                  onClick={p.isMac ? openMacGuide : undefined}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Descargar {p.ext}
                </a>
              ) : (
                <span className="dl-btn-outline unavailable">No disponible</span>
              )}
            </div>
          ))}
        </div>

        {/* macOS guide — full detailed version */}
        <div id="mac-guide" className={`mac-guide${macFlash ? ' flash' : ''}`} style={{ marginBottom: 24 }}>
          <button
            className="mac-guide-summary"
            onClick={() => setMacGuideOpen(v => !v)}
          >
            <span>
              🍎 ¿Cómo instalo en macOS?
              <span className="summary-tag">¡Léeme antes de abrir!</span>
            </span>
            <span>{macGuideOpen ? '▲' : '▼'}</span>
          </button>

          {macGuideOpen && (
            <div className="mac-guide-body">
              <div className="mac-warning-box">
                <span className="warn-icon">⚠️</span>
                <div>
                  <strong>¿Por qué macOS dice que la app está dañada?</strong>
                  <p>
                    No está dañada para nada. Apple exige pagar <strong>$99 al año</strong> para
                    "firmar" apps y que macOS las acepte sin drama. Como eso no es plata que todo
                    el mundo tiene, macOS bloquea la app. Hay que decirle manualmente que confíes
                    en ella. 👇
                  </p>
                </div>
              </div>

              <div className="mac-steps">
                <div className="mac-step">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    Descarga el archivo <strong>.dmg</strong> y ábrelo haciendo doble clic.
                    Se monta como un USB virtual. Arrastra el ícono del launcher a la carpeta
                    <em> Aplicaciones</em> que aparece al lado. 📂
                  </div>
                </div>
                <div className="mac-step">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <strong>Expulsa el .dmg</strong> — en el Finder, barra lateral izquierda bajo
                    "Ubicaciones", clic derecho sobre el disco → <em>Expulsar</em>. O arrástralo
                    al icono de papelera. 💿➡️🗑️
                  </div>
                </div>
                <div className="mac-step">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    Intenta abrir el launcher desde Aplicaciones. macOS va a decir que
                    <strong> "ModpackLauncher está dañado y no se puede abrir"</strong>.
                    Dale <em>OK</em> y cierra ese mensaje. 🚫
                  </div>
                </div>
                <div className="mac-step">
                  <div className="step-num">4</div>
                  <div className="step-content">
                    Abre <strong>Terminal</strong> — <kbd>⌘ Cmd</kbd> + <kbd>Espacio</kbd>,
                    escribe "Terminal" y presiona <kbd>Enter</kbd>. Luego pega este comando:
                  </div>
                </div>
              </div>

              <div className="mac-code-block">
                <code>xattr -d com.apple.quarantine /Applications/ModpackLauncher.app</code>
                <button className="copy-btn" onClick={copyMacCmd}>
                  {macCopied ? '¡Copiado!' : 'Copiar'}
                </button>
              </div>
              <p className="mac-tip">
                🔐 Si te pide contraseña: escríbela aunque no veas nada — así funciona Terminal,
                es normal. Presiona <kbd>Enter</kbd> cuando termines. Si no muestra ningún error,
                funcionó perfectamente.
              </p>

              <div className="mac-step">
                <div className="step-num">5</div>
                <div className="step-content">
                  ¡Listo! Presiona <kbd>⌘ Cmd</kbd> + <kbd>Espacio</kbd>, escribe
                  <strong> ModpackLauncher</strong> y presiona <kbd>Enter</kbd>. 🚀
                  Abre normal. La próxima vez ya no hay que hacer nada extra.
                </div>
              </div>
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
            <Link href="/perfil" style={{ color: 'var(--muted)', fontSize: 13, textDecoration: 'none' }}>Social</Link>
          </div>
          <span>© 2025 Francisco Porto</span>
        </div>
      </footer>
    </div>
  )
}