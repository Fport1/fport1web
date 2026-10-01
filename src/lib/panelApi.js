'use client'

// Llamadas del panel a las rutas de servidor. Todas van con el token de sesión:
// el servidor comprueba allí que eres @fport1, nunca se decide en el cliente.
import { auth, storage } from '@/lib/firebase'
import { ref as sRef, uploadBytesResumable } from 'firebase/storage'

async function pedir(ruta, { metodo = 'GET', cuerpo } = {}) {
  if (!auth?.currentUser) throw new Error('Sin sesión')
  const res = await fetch(ruta, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  })
  const datos = await res.json().catch(() => null)
  if (!res.ok) {
    const e = new Error(datos?.detalle || datos?.error || `Error ${res.status}`)
    e.codigo = datos?.error
    throw e
  }
  return datos
}

export const estadoGitHub = () => pedir('/api/github/estado')
export const listarRepos = () => pedir('/api/github/repos')
export const crearRepo = d => pedir('/api/github/repos', { metodo: 'POST', cuerpo: d })
export const sincronizarRepo = d => pedir('/api/github/repos', { metodo: 'PATCH', cuerpo: d })
export const crearRelease = d => pedir('/api/github/releases', { metodo: 'POST', cuerpo: d })
export const borrarRelease = ({ repo, releaseId, tag }) =>
  pedir(`/api/github/releases?repo=${encodeURIComponent(repo)}&releaseId=${releaseId}&tag=${encodeURIComponent(tag || '')}`, { metodo: 'DELETE' })
export const adjuntarArchivo = d => pedir('/api/github/releases/archivo', { metodo: 'POST', cuerpo: d })
export const borrarImagen = ({ owner, path }) =>
  pedir(`/api/github/contenido?owner=${encodeURIComponent(owner)}&path=${encodeURIComponent(path)}`, { metodo: 'DELETE' })

/** Sube una imagen al repo de contenido. Va en base64 porque son pequeñas. */
export async function subirImagen({ owner, slug, tipo, archivo, rutaAnterior }) {
  const base64 = await new Promise((ok, mal) => {
    const fr = new FileReader()
    fr.onload = () => ok(String(fr.result).split(',')[1])
    fr.onerror = mal
    fr.readAsDataURL(archivo)
  })
  const r = await pedir('/api/github/contenido', {
    metodo: 'PUT',
    cuerpo: { owner, slug, tipo, nombre: archivo.name, contenidoBase64: base64, contentType: archivo.type, rutaAnterior },
  })
  return r.imagen
}

/**
 * Sube el archivo de una versión a la release.
 *
 * Pasa por Storage a propósito: una función de Vercel no admite cuerpos de más
 * de 4,5 MB y un modpack pesa mucho más. El navegador lo deja en un temporal y
 * el servidor lo copia a GitHub y lo borra.
 */
export async function subirArchivoDeVersion({ archivo, repo, releaseId, alAvanzar }) {
  const uid = auth.currentUser.uid
  const rutaTemporal = `fport1/tmp/${uid}/${Date.now()}-${archivo.name.replace(/[^\w.\-]+/g, '_')}`

  await new Promise((ok, mal) => {
    const tarea = uploadBytesResumable(sRef(storage, rutaTemporal), archivo, {
      contentType: archivo.type || 'application/octet-stream',
    })
    tarea.on('state_changed',
      s => alAvanzar?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
      mal, ok)
  })

  alAvanzar?.(100)
  const r = await adjuntarArchivo({
    repo, releaseId, rutaTemporal,
    filename: archivo.name,
    contentType: archivo.type || 'application/octet-stream',
  })
  return r.asset
}
