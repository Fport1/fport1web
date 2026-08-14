'use client'

import { useEffect, useRef } from 'react'

// Chispas verdes que suben desde abajo, tipo brasas de fuego.
//
// Va en canvas y no en CSS porque son decenas de partículas con vida propia:
// con elementos del DOM el navegador acabaría recalculando estilos sin parar.
// Se detiene sola cuando la pestaña no está a la vista, y no se dibuja nada si
// el sistema pide menos animaciones.

const COLORES = ['#22c55e', '#4ade80', '#86efac', '#16a34a']

export default function EmberParticles({ densidad = 0.00008 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Respeta a quien pide menos movimiento en su sistema.
    const menosMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (menosMovimiento?.matches) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let ancho = 0, alto = 0, dpr = 1
    let chispas = []
    let raf = null
    let ultimo = performance.now()

    function nueva(alturaInicialAleatoria = false) {
      return {
        x: Math.random() * ancho,
        // Nacen justo debajo del borde inferior; al arrancar se reparten por
        // toda la pantalla para no ver la primera oleada subir en bloque.
        y: alturaInicialAleatoria ? Math.random() * alto : alto + Math.random() * 40,
        r: 0.7 + Math.random() * 1.9,
        vy: 12 + Math.random() * 34,          // píxeles por segundo, hacia arriba
        deriva: (Math.random() - 0.5) * 18,   // vaivén horizontal
        fase: Math.random() * Math.PI * 2,
        vidaMax: 4 + Math.random() * 5,       // segundos
        vida: 0,
        color: COLORES[(Math.random() * COLORES.length) | 0],
        brillo: 0.35 + Math.random() * 0.5,
      }
    }

    function medir() {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      ancho = canvas.clientWidth
      alto = canvas.clientHeight
      canvas.width = Math.floor(ancho * dpr)
      canvas.height = Math.floor(alto * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const objetivo = Math.round(ancho * alto * densidad)
      const total = Math.max(24, Math.min(140, objetivo))
      chispas = Array.from({ length: total }, () => nueva(true))
      chispas.forEach(c => { c.vida = Math.random() * c.vidaMax })
    }

    function pintar(ahora) {
      const dt = Math.min((ahora - ultimo) / 1000, 0.05) // sin saltos al volver
      ultimo = ahora
      ctx.clearRect(0, 0, ancho, alto)

      for (const c of chispas) {
        c.vida += dt
        c.y -= c.vy * dt
        c.fase += dt * 1.6
        c.x += Math.sin(c.fase) * c.deriva * dt

        if (c.vida >= c.vidaMax || c.y < -20) {
          Object.assign(c, nueva())
          continue
        }

        // Aparece y se apaga suavemente en los extremos de su vida.
        const t = c.vida / c.vidaMax
        const desvanecido = t < 0.15 ? t / 0.15 : t > 0.6 ? (1 - t) / 0.4 : 1
        const alfa = Math.max(0, Math.min(1, desvanecido)) * c.brillo

        ctx.globalAlpha = alfa
        ctx.fillStyle = c.color
        ctx.shadowBlur = c.r * 4
        ctx.shadowColor = c.color
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      raf = requestAnimationFrame(pintar)
    }

    function arrancar() {
      if (raf) return
      ultimo = performance.now()
      raf = requestAnimationFrame(pintar)
    }
    function parar() {
      if (!raf) return
      cancelAnimationFrame(raf)
      raf = null
    }
    function alCambiarVisibilidad() {
      document.hidden ? parar() : arrancar()
    }

    medir()
    // Si la pestaña ya está en segundo plano al montar, no dejamos un ciclo
    // pendiente: se arranca cuando vuelva a estar a la vista.
    if (!document.hidden) arrancar()
    window.addEventListener('resize', medir)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      parar()
      window.removeEventListener('resize', medir)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
    }
  }, [densidad])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
      }}
    />
  )
}
