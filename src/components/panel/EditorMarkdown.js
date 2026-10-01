'use client'

import { useMemo, useRef, useState } from 'react'
import { descripcionAHtml } from '@/lib/descripcionCreaciones'

// Cómo se inserta una imagen. Son las cuatro formas que entiende la ficha, y
// las mismas que usa el launcher: si aquí se escribe otra cosa, allí no se verá.
const COLOCACIONES = [
  { id: 'ancho', nombre: 'Ancho completo' },
  { id: 'centro', nombre: 'Centrada' },
  { id: 'izquierda', nombre: 'Izquierda, texto al lado' },
  { id: 'derecha', nombre: 'Derecha, texto al lado' },
]

export function marcadoDeImagen({ url, alt = '', colocacion = 'ancho', ancho = 600 }) {
  if (colocacion === 'centro') return `<p align="center"><img src="${url}" alt="${alt}" width="${ancho}"></p>`
  if (colocacion === 'izquierda') return `<img src="${url}" alt="${alt}" width="${ancho}" align="left">`
  if (colocacion === 'derecha') return `<img src="${url}" alt="${alt}" width="${ancho}" align="right">`
  return `![${alt}](${url})`
}

const BOTONES = [
  { id: 'h2', titulo: 'Título', texto: 'H', envoltura: ['## ', ''], linea: true },
  { id: 'b', titulo: 'Negrita', texto: 'B', envoltura: ['**', '**'], estilo: { fontWeight: 700 } },
  { id: 'i', titulo: 'Cursiva', texto: 'I', envoltura: ['*', '*'], estilo: { fontStyle: 'italic' } },
  { id: 'del', titulo: 'Tachado', texto: 'S', envoltura: ['~~', '~~'], estilo: { textDecoration: 'line-through' } },
  { id: 'ul', titulo: 'Lista', texto: '•', envoltura: ['- ', ''], linea: true },
  { id: 'ol', titulo: 'Lista numerada', texto: '1.', envoltura: ['1. ', ''], linea: true },
  { id: 'quote', titulo: 'Cita', texto: '❝', envoltura: ['> ', ''], linea: true },
  { id: 'code', titulo: 'Código', texto: '</>', envoltura: ['`', '`'] },
  { id: 'link', titulo: 'Enlace', texto: '🔗', envoltura: ['[', '](https://)'] },
  { id: 'table', titulo: 'Tabla', texto: '▦', bloque: '\n| Columna | Columna |\n|---|---|\n| Dato | Dato |\n' },
  { id: 'hr', titulo: 'Separador', texto: '―', bloque: '\n\n---\n\n' },
  { id: 'video', titulo: 'Vídeo de YouTube', texto: '▶', video: true },
]

export default function EditorMarkdown({ valor, alCambiar, alPedirImagen }) {
  const areaRef = useRef(null)
  const [vista, setVista] = useState('lado') // lado | escribir | ver

  function insertar({ envoltura, bloque, linea }) {
    const area = areaRef.current
    if (!area) return
    const ini = area.selectionStart
    const fin = area.selectionEnd
    const texto = valor || ''

    let nuevo, cursor
    if (bloque) {
      nuevo = texto.slice(0, ini) + bloque + texto.slice(fin)
      cursor = ini + bloque.length
    } else if (linea) {
      // Los prefijos de línea van al principio del renglón, no donde esté el cursor.
      const inicioLinea = texto.lastIndexOf('\n', ini - 1) + 1
      nuevo = texto.slice(0, inicioLinea) + envoltura[0] + texto.slice(inicioLinea)
      cursor = fin + envoltura[0].length
    } else {
      const sel = texto.slice(ini, fin)
      nuevo = texto.slice(0, ini) + envoltura[0] + sel + envoltura[1] + texto.slice(fin)
      cursor = sel ? fin + envoltura[0].length + envoltura[1].length : ini + envoltura[0].length
    }
    alCambiar(nuevo)
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(cursor, cursor) })
  }

  function insertarVideo() {
    const url = prompt('Enlace del vídeo de YouTube:')
    if (!url) return
    const id = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1]
    if (!id) { alert('No reconozco ese enlace de YouTube.'); return }
    // Miniatura enlazada: no se puede incrustar un iframe, el saneador lo quita.
    insertar({ bloque: `\n\n[![Vídeo](https://img.youtube.com/vi/${id}/maxresdefault.jpg)](https://www.youtube.com/watch?v=${id})\n\n` })
  }

  const html = useMemo(() => descripcionAHtml(valor), [valor])

  return (
    <div className="em">
      <div className="em-barra">
        {BOTONES.map(b => (
          <button key={b.id} type="button" title={b.titulo} className="em-boton" style={b.estilo}
            onClick={() => (b.video ? insertarVideo() : insertar(b))}>
            {b.texto}
          </button>
        ))}
        {alPedirImagen && (
          <button type="button" title="Insertar imagen de la galería" className="em-boton" onClick={alPedirImagen}>🖼</button>
        )}
        <div className="em-vistas">
          {[['lado', 'Lado a lado'], ['escribir', 'Escribir'], ['ver', 'Vista previa']].map(([id, n]) => (
            <button key={id} type="button" className={`em-vista ${vista === id ? 'activa' : ''}`}
              onClick={() => setVista(id)}>{n}</button>
          ))}
        </div>
      </div>

      <div className={`em-cuerpo em-${vista}`}>
        {vista !== 'ver' && (
          <textarea ref={areaRef} className="em-area" value={valor || ''} spellCheck
            onChange={e => alCambiar(e.target.value)}
            placeholder="Describe tu creación. Admite Markdown." />
        )}
        {vista !== 'escribir' && (
          <div className="em-previa cr-descripcion" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </div>

      <style>{`
        .em { border:1px solid var(--border); border-radius:12px; overflow:hidden; background:var(--bg3); }
        .em-barra { display:flex; gap:4px; align-items:center; flex-wrap:wrap; padding:8px; border-bottom:1px solid var(--border); }
        .em-boton { width:30px; height:30px; border-radius:7px; border:1px solid var(--border); background:var(--bg);
          color:var(--sub); font-size:13px; cursor:pointer; transition:all .15s; }
        .em-boton:hover { border-color:var(--accent); color:var(--text); }
        .em-vistas { margin-left:auto; display:flex; gap:3px; }
        .em-vista { border:none; background:none; color:var(--muted); font-size:12px; padding:5px 10px;
          border-radius:7px; cursor:pointer; }
        .em-vista.activa { background:var(--accent); color:#fff; }
        .em-cuerpo { display:grid; min-height:320px; }
        .em-lado { grid-template-columns:1fr 1fr; }
        .em-escribir, .em-ver { grid-template-columns:1fr; }
        .em-area { border:none; background:var(--bg); color:var(--text); padding:16px; font-size:14px;
          line-height:1.7; resize:vertical; outline:none; font-family:ui-monospace,monospace; min-height:320px; }
        .em-lado .em-area { border-right:1px solid var(--border); }
        .em-previa { padding:16px; overflow-y:auto; max-height:600px; }
        @media (max-width:760px) { .em-lado { grid-template-columns:1fr; } .em-lado .em-previa { border-top:1px solid var(--border); } }
      `}</style>
    </div>
  )
}

export { COLOCACIONES }
