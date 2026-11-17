// Página de descarga de faisp (app de escritorio). Componente de servidor:
// la versión se lee de version.json en el servidor (sin problemas de CORS)
// y se refresca cada 10 minutos.

import { ArrowPathIcon, KeyIcon, LockClosedIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'

const BASE = 'https://faisp.vercel.app'
const ZIP_URL = `${BASE}/descargar/faisp-windows.zip`
const VERSION_URL = `${BASE}/descargar/version.json`
const DEMO_URL = `${BASE}/app`

export const revalidate = 600

export const metadata = {
  title: 'faisp · Descargar',
  description: 'faisp: varias IAs trabajando juntas en tus proyectos locales. Descarga para Windows.',
}

async function getRelease() {
  try {
    const r = await fetch(VERSION_URL, { next: { revalidate } })
    if (!r.ok) return null
    const d = await r.json()
    return {
      version: typeof d.version === 'string' ? d.version : null,
      size: typeof d.size === 'number' ? d.size : null,
    }
  } catch {
    return null
  }
}

function formatSize(bytes) {
  if (!bytes) return null
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

const DownloadIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const steps = [
  <>Descarga el <strong>.zip</strong> y descomprímelo (clic derecho → <em>«Extraer todo»</em>).</>,
  <>Doble clic en <strong>Instalar.cmd</strong>.</>,
  <>Si Windows muestra <em>«Windows protegió tu PC»</em>, pulsa <em>«Más información»</em> → <em>«Ejecutar de todas formas»</em> (la app aún no está firmada).</>,
  <>faisp se abre sola; después la encuentras buscando <strong>faisp</strong> en el menú Inicio.</>,
]

const info = [
  {
    icon: ArrowPathIcon,
    title: 'Actualizaciones',
    text: 'La app avisa sola cuando hay una versión nueva y se actualiza con un botón.',
  },
  {
    icon: KeyIcon,
    title: 'Qué necesitas',
    text: 'Tus propias claves de IA en Ajustes, o iniciar sesión con tu cuenta de Claude (Claude Code) o de ChatGPT (Codex). Hay opciones gratuitas como Gemini, Groq u Ollama.',
  },
  {
    icon: LockClosedIcon,
    title: 'Privacidad',
    text: 'Las claves y los chats se guardan solo en tu PC.',
  },
]

export default async function FaispPage() {
  const release = await getRelease()
  const size = formatSize(release?.size)

  return (
    <div className="faisp-page">
      <div className="faisp-wrap">
        {/* HERO */}
        <header className="faisp-hero">
          <p className="faisp-label">App de escritorio</p>
          <h1 className="faisp-title">
            faisp <span className="faisp-alpha">Alfa</span>
          </h1>
          <p className="faisp-sub">
            Varias IAs trabajando juntas en tus proyectos locales: cada tarea va a la IA adecuada y ahorras tokens.
          </p>

          <div className="faisp-warning" role="note">
            <ExclamationTriangleIcon className="ico faisp-warning-icon" aria-hidden="true" />
            <p>
              <strong>faisp está en fase alfa:</strong> en desarrollo activo, puede tener fallos y cambiar entre versiones.
            </p>
          </div>
        </header>

        {/* DESCARGA */}
        <section id="descargar" className="faisp-section faisp-download">
          <a href={ZIP_URL} className="faisp-btn-primary btn-glow" download>
            <DownloadIcon />
            Descargar para Windows
          </a>
          <p className="faisp-meta">
            Windows 10/11 · 64 bits
            {release?.version && <> · v{release.version}</>}
            {size && <> · {size}</>}
          </p>

          <div className="faisp-soon">
            <span className="faisp-btn-disabled" aria-disabled="true">macOS · próximamente</span>
            <span className="faisp-btn-disabled" aria-disabled="true">Linux · próximamente</span>
          </div>

          <a href={DEMO_URL} target="_blank" rel="noopener" className="faisp-demo">
            Probar la demo en el navegador →
          </a>
        </section>

        {/* INSTALACIÓN */}
        <section className="faisp-section">
          <h2 className="faisp-h2">Instalar en Windows</h2>
          <ol className="faisp-steps">
            {steps.map((s, i) => (
              <li key={i} className="faisp-step">
                <span className="step-num" aria-hidden="true">{i + 1}</span>
                <div className="step-content">{s}</div>
              </li>
            ))}
          </ol>
        </section>

        {/* INFO */}
        <section className="faisp-section">
          <div className="faisp-grid">
            {info.map(c => (
              <div key={c.title} className="faisp-card card-hover">
                <div className="faisp-card-icon"><c.icon width={28} height={28} aria-hidden="true" /></div>
                <h3 className="faisp-card-title">{c.title}</h3>
                <p className="faisp-card-text">{c.text}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
