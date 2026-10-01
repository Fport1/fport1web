'use client'

// Convierte la descripción de una creación (Markdown con algo de HTML) en HTML
// seguro para pintar.
//
// La descripción la escribe @fport1 desde el panel del launcher, pero igualmente
// se sanea: el documento de Firestore podría editarse por otras vías, y un
// `dangerouslySetInnerHTML` sin filtrar es una puerta abierta a robar la sesión
// de quien visite la ficha.
//
// El filtro es una LISTA BLANCA: lo que no está nombrado, fuera. Así, si mañana
// aparece una etiqueta nueva, el fallo es que no se pinte, no que se ejecute.

import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Etiquetas que el launcher usa para maquetar: imágenes a todo el ancho,
// centradas con <p align>, o flotando con <img align>.
const ETIQUETAS = [
  'p', 'br', 'hr', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'img', 'a', 'span',
]
const ATRIBUTOS = ['align', 'src', 'alt', 'width', 'height', 'href', 'title']

// Los enlaces se marcan AQUI, durante el saneado, y no tocando el DOM despues de
// pintar: asi el atributo viaja ya en el HTML y no depende de cuando React
// reemplace el contenido. Se registra una sola vez por carga del modulo.
let hookPuesto = false
function asegurarHook() {
  if (hookPuesto || typeof window === 'undefined') return
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName !== 'A') return
    // Sin href son los que el saneador vacio por peligrosos: quedan inertes.
    if (!node.getAttribute('href')) { node.removeAttribute('target'); return }
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer nofollow')
  })
  hookPuesto = true
}

/** Markdown + HTML saneado → cadena de HTML lista para pintar. */
export function descripcionAHtml(markdown) {
  if (!markdown || typeof markdown !== 'string') return ''
  if (typeof window === 'undefined') return '' // se pinta en el cliente

  asegurarHook()
  const bruto = marked.parse(markdown, { breaks: true, gfm: true })

  return DOMPurify.sanitize(bruto, {
    ALLOWED_TAGS: ETIQUETAS,
    ALLOWED_ATTR: ATRIBUTOS,
    // NO se pone ALLOWED_URI_REGEXP: DOMPurify lo aplica a TODOS los atributos,
    // no solo a los que llevan URL, asi que align="center" y width="600" no
    // encajaban con el patron y desaparecian, rompiendo el maquetado. Sus
    // valores por defecto ya bloquean javascript: en href y en src; comprobado.
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'style'],
  })
}

/** Ya no hace falta: los enlaces se marcan durante el saneado. Se mantiene
 *  exportada para no romper a quien la importe. */
export function prepararEnlaces() {}
