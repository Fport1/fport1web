// Conexión con GitHub, solo en el servidor.
//
// Reglas de la casa:
//   - El token NUNCA sale de aquí: ni al navegador, ni a un registro, ni a una
//     respuesta de API. Se guarda cifrado en github_tokens/{uid}.
//   - Solo @fport1 puede conectar, y eso se comprueba contra Firestore con el
//     Admin SDK, no con lo que diga el cliente.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getAdminAuth, getAdminDb } from '@/lib/firebaseAdmin'
import { cifrarSecreto, descifrarSecreto } from '@/lib/secretosServidor'

const ADMIN_SLUG = 'fport1'
const ESTADO_VALIDO_MS = 10 * 60 * 1000

/** Comprueba la sesión de Firebase y que sea @fport1. Devuelve el uid. */
export async function exigirFport1(req) {
  const authz = req.headers.get('authorization') || ''
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : ''
  if (!idToken) return { error: 'no_token', status: 401 }

  let uid
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid
  } catch {
    return { error: 'token_invalido', status: 401 }
  }

  // El rango se mira en Firestore, no en el token: el cliente no decide quién es admin.
  const perfil = await getAdminDb().doc(`users/${uid}`).get()
  if (!perfil.exists || perfil.data()?.usernameSlug !== ADMIN_SLUG) {
    return { error: 'no_autorizado', status: 403 }
  }
  return { uid }
}

/* ── `state` del flujo OAuth ───────────────────────────────────────────────
 * Va firmado para que GitHub no pueda devolvernos a un usuario distinto del
 * que inició el flujo, y caduca para que un enlace viejo no valga. No lleva
 * nada secreto: solo uid, caducidad y un valor al azar. */

function firma(cuerpo) {
  const clave = process.env.GITHUB_TOKEN_KEY
  if (!clave) throw new Error('Falta GITHUB_TOKEN_KEY')
  return createHmac('sha256', clave).update(cuerpo).digest('base64url')
}

export function firmarEstado(uid) {
  const cuerpo = `${uid}.${Date.now() + ESTADO_VALIDO_MS}.${randomBytes(9).toString('base64url')}`
  return `${cuerpo}.${firma(cuerpo)}`
}

export function verificarEstado(estado) {
  if (typeof estado !== 'string') return null
  const partes = estado.split('.')
  if (partes.length !== 4) return null
  const [uid, caduca, , recibida] = partes
  const cuerpo = partes.slice(0, 3).join('.')

  const esperada = Buffer.from(firma(cuerpo))
  const dada = Buffer.from(recibida)
  // Comparación de tiempo constante: comparar con === filtra información
  // sobre cuántos caracteres acertó quien lo intenta.
  if (esperada.length !== dada.length || !timingSafeEqual(esperada, dada)) return null
  if (Number(caduca) < Date.now()) return null
  return uid
}

/* ── Token ─────────────────────────────────────────────────────────────── */

export async function guardarToken(uid, token, login) {
  await getAdminDb().doc(`github_tokens/${uid}`).set({
    tokenCifrado: cifrarSecreto(token),
    login: login || null,
    conectadoEn: new Date(),
  })
}

/** Devuelve el token en claro. Solo para usarlo aquí dentro, nunca para responder. */
export async function leerToken(uid) {
  const snap = await getAdminDb().doc(`github_tokens/${uid}`).get()
  if (!snap.exists) return null
  try {
    return descifrarSecreto(snap.data().tokenCifrado)
  } catch {
    return null // clave cambiada o dato manipulado: se trata como no conectado
  }
}

export async function borrarToken(uid) {
  await getAdminDb().doc(`github_tokens/${uid}`).delete()
}

/** Llama a la API de GitHub con el token de @fport1. */
export async function apiGitHub(uid, ruta, opciones = {}) {
  const token = await leerToken(uid)
  if (!token) return { error: 'sin_conexion', status: 401 }

  const res = await fetch(`https://api.github.com${ruta}`, {
    ...opciones,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(opciones.headers || {}),
    },
  })
  const cuerpo = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, cuerpo }
}
