// Cifrado de secretos que solo vive en el servidor (AES-256-GCM).
//
// Existe aparte de src/lib/crypto.js por dos motivos:
//   1. Aquel módulo lo importa el chat EN EL NAVEGADOR, así que no puede usar
//      node:crypto sin romper el bundle.
//   2. Aquel módulo hoy no cifra: devuelve el texto tal cual (es un hueco a
//      rellenar). Guardar ahí el token de GitHub lo dejaría en claro en
//      Firestore, y ese token abre los repos privados de @fport1.
//
// El formato guardado es `v1.<iv>.<tag>.<texto>`, todo en base64url. Se versiona
// por delante para poder cambiar de algoritmo sin romper lo ya guardado.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

const VERSION = 'v1'
const ALGORITMO = 'aes-256-gcm'

/**
 * Clave de 32 bytes desde la variable de entorno. Se acepta en base64 o hex; si
 * llega cualquier otra cosa se deriva con SHA-256 para no fallar en silencio con
 * una clave corta (que sería peor: cifrado aparente y débil).
 */
function clave() {
  const bruta = process.env.GITHUB_TOKEN_KEY
  if (!bruta) throw new Error('Falta GITHUB_TOKEN_KEY')

  if (/^[0-9a-f]{64}$/i.test(bruta)) return Buffer.from(bruta, 'hex')
  const b64 = Buffer.from(bruta, 'base64')
  if (b64.length === 32) return b64
  return createHash('sha256').update(bruta, 'utf8').digest()
}

const b64u = buf => buf.toString('base64url')

/** Cifra un texto. Devuelve una cadena lista para guardar en Firestore. */
export function cifrarSecreto(texto) {
  if (typeof texto !== 'string' || !texto) throw new Error('Nada que cifrar')
  const iv = randomBytes(12) // GCM: 96 bits es lo recomendado
  const c = createCipheriv(ALGORITMO, clave(), iv)
  const cifrado = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [VERSION, b64u(iv), b64u(c.getAuthTag()), b64u(cifrado)].join('.')
}

/** Descifra lo que devolvió cifrarSecreto. Lanza si el dato fue manipulado. */
export function descifrarSecreto(guardado) {
  if (typeof guardado !== 'string') throw new Error('Secreto inválido')
  const [version, iv, tag, cifrado] = guardado.split('.')
  if (version !== VERSION || !iv || !tag || !cifrado) throw new Error('Formato de secreto desconocido')

  const d = createDecipheriv(ALGORITMO, clave(), Buffer.from(iv, 'base64url'))
  // Si alguien tocó el texto cifrado, final() lanza: GCM autentica además de cifrar.
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(cifrado, 'base64url')), d.final()]).toString('utf8')
}
