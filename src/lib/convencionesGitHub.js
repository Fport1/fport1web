// Convenciones de publicación en GitHub.
//
// Esto lo comparten la web y el launcher: si algo cambia aquí, hay que cambiarlo
// allí también o lo publicado en un sitio no encajará en el otro.

export const REPO_CONTENIDO = 'fport1-contenido'

/** `owner/fport1-contenido`, donde viven las imágenes y las releases sueltas. */
export function repoDeContenido(owner) {
  return `${owner}/${REPO_CONTENIDO}`
}

/**
 * Dónde van las releases de un proyecto.
 * `releasesRepo` vacío significa el repo de contenido, no "ninguno".
 */
export function repoDeReleases(proyecto, owner) {
  const r = proyecto?.github?.releasesRepo
  return r && r.trim() ? r.trim() : repoDeContenido(owner)
}

/**
 * Etiqueta de la release: `v1.2.0` en el repo del código, pero
 * `mi-slug-v1.2.0` en el de contenido, donde conviven varios proyectos.
 */
export function etiquetaDeRelease({ version, slug, enRepoDeContenido }) {
  const v = String(version || '').replace(/^v/i, '')
  return enRepoDeContenido ? `${slug}-v${v}` : `v${v}`
}

/** Beta y alpha son prelanzamientos; solo una release normal pasa a ser la última. */
export function marcasDeCanal(canal) {
  const esRelease = (canal || 'release') === 'release'
  return { prerelease: !esRelease, make_latest: esRelease ? 'true' : 'false' }
}

/** Cuerpo de la release: el changelog y una línea con dónde funciona. */
export function cuerpoDeRelease({ changelog, gameVersions = [], loaders = [] }) {
  const partes = []
  if (changelog?.trim()) partes.push(changelog.trim())
  const compat = []
  if (gameVersions.length) compat.push(`**Minecraft:** ${gameVersions.join(', ')}`)
  if (loaders.length) compat.push(`**Loaders:** ${loaders.join(', ')}`)
  if (compat.length) partes.push(compat.join(' · '))
  return partes.join('\n\n---\n\n')
}

/** Ruta de una imagen dentro del repo de contenido. */
export function rutaDeImagen({ slug, tipo, nombre }) {
  const limpio = String(nombre || 'imagen')
    .toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return `media/${slug}/${tipo}-${Date.now()}-${limpio || 'imagen'}`
}

/**
 * URL de jsDelivr fijada al commit. Se fija a propósito: con una rama, la caché
 * de jsDelivr puede seguir sirviendo la imagen vieja durante horas después de
 * cambiarla.
 */
export function urlDeImagen({ owner, ruta, commitSha }) {
  return `https://cdn.jsdelivr.net/gh/${owner}/${REPO_CONTENIDO}@${commitSha}/${ruta}`
}

/** `gh:owner/repo:ruta` — así sabe el launcher de dónde salió la imagen. */
export function pathDeImagen({ owner, ruta }) {
  return `gh:${owner}/${REPO_CONTENIDO}:${ruta}`
}

/** `gh-release:owner/repo:releaseId:tag` — de dónde salió un archivo. */
export function pathDeArchivo({ repo, releaseId, tag }) {
  return `gh-release:${repo}:${releaseId}:${tag}`
}

/**
 * Topics del repo: etiquetas + categorías + tipo + loaders + `minecraft`.
 * GitHub solo admite minúsculas, números y guiones, hasta 20 y de 50 caracteres.
 */
export function topicsDeProyecto({ tags = [], categories = [], type, loaders = [] }) {
  const crudos = [...tags, ...categories, type, ...loaders, 'minecraft']
  const vistos = new Set()
  const salida = []
  for (const bruto of crudos) {
    if (!bruto) continue
    const limpio = String(bruto).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes: GitHub no las admite
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
    if (!limpio || vistos.has(limpio)) continue
    vistos.add(limpio)
    salida.push(limpio)
    if (salida.length === 20) break
  }
  return salida
}

/** Licencias que ofrece el panel. `plantilla` es lo que entiende GitHub al crear el repo. */
export const LICENCIAS_ABIERTAS = [
  { id: 'MIT', name: 'MIT License', plantilla: 'mit' },
  { id: 'Apache-2.0', name: 'Apache License 2.0', plantilla: 'apache-2.0' },
  { id: 'GPL-3.0', name: 'GNU GPL v3.0', plantilla: 'gpl-3.0' },
  { id: 'LGPL-3.0', name: 'GNU LGPL v3.0', plantilla: 'lgpl-3.0' },
  { id: 'MPL-2.0', name: 'Mozilla Public License 2.0', plantilla: 'mpl-2.0' },
  { id: 'AGPL-3.0', name: 'GNU AGPL v3.0', plantilla: 'agpl-3.0' },
  { id: 'BSD-3-Clause', name: 'BSD 3-Clause', plantilla: 'bsd-3-clause' },
  { id: 'Unlicense', name: 'The Unlicense', plantilla: 'unlicense' },
  { id: 'CC0-1.0', name: 'CC0 1.0', plantilla: 'cc0-1.0' },
  { id: 'CC-BY-4.0', name: 'CC BY 4.0', plantilla: null },
  { id: 'CC-BY-SA-4.0', name: 'CC BY-SA 4.0', plantilla: null },
]

export const LICENCIAS_CERRADAS = [
  { id: 'ARR', name: 'Todos los derechos reservados' },
  { id: 'CC-BY-NC-4.0', name: 'CC BY-NC 4.0' },
  { id: 'CC-BY-NC-ND-4.0', name: 'CC BY-NC-ND 4.0' },
]
