'use client'

// Recuerda en el navegador cuándo marcaste cada chat como leído.
//
// Firestore aplica serverTimestamp() en dos pasos: primero escribe en local con
// el campo vacío y solo después llega el valor real del servidor. En ese hueco
// `readAt[uid]` es null, así que el chat vuelve a contarse como NO leído justo
// después de abrirlo — que es el parpadeo del contador al entrar a un chat.
// Este registro tapa ese hueco y además sobrevive a un refresco de la página.
//
// No es la fuente de verdad: en cuanto llega el dato del servidor, se usa el
// más reciente de los dos.

const KEY = 'fport1_chat_read'

function load() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(window.localStorage.getItem(KEY) || '{}') } catch { return {} }
}

/** Marca el chat como leído ahora mismo, en este navegador. */
export function markReadLocal(cid) {
  if (typeof window === 'undefined' || !cid) return
  const m = load()
  m[cid] = Date.now()
  try { window.localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* sin sitio: da igual */ }
}

/** Milisegundos de la última lectura local del chat (0 si no hay). */
export function readLocalAt(cid) {
  if (!cid) return 0
  return load()[cid] || 0
}
