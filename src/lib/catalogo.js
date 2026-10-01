// Vocabulario del catálogo de creaciones.
//
// Los identificadores son los que escribe el launcher: NO se cambian sin
// cambiarlos también allí, o un proyecto publicado desde el launcher dejaría de
// encajar en los filtros de la web.

export const TIPOS = [
  { id: 'modpack', nombre: 'Modpack' },
  { id: 'mod', nombre: 'Mod' },
  { id: 'resourcepack', nombre: 'Paquete de recursos' },
  { id: 'datapack', nombre: 'Datapack' },
  { id: 'shader', nombre: 'Shader' },
  { id: 'plugin', nombre: 'Plugin' },
]

export const CATEGORIAS = [
  { id: 'adventure', nombre: 'Aventura' },
  { id: 'magic', nombre: 'Magia' },
  { id: 'tech', nombre: 'Tecnología' },
  { id: 'exploration', nombre: 'Exploración' },
  { id: 'building', nombre: 'Construcción' },
  { id: 'combat', nombre: 'Combate' },
  { id: 'survival', nombre: 'Supervivencia' },
  { id: 'optimization', nombre: 'Optimización' },
  { id: 'utility', nombre: 'Utilidades' },
  { id: 'decoration', nombre: 'Decoración' },
  { id: 'multiplayer', nombre: 'Multijugador' },
  { id: 'challenge', nombre: 'Desafío' },
]

export function etiquetaDeTipo(id) {
  return TIPOS.find(t => t.id === id)?.nombre || id || 'Creación'
}

export function etiquetaDeCategoria(id) {
  return CATEGORIAS.find(c => c.id === id)?.nombre || id
}

/** Cómo se enseña el soporte de cliente/servidor en la ficha. */
export const SOPORTE = {
  required: { texto: 'Obligatorio', color: '#4ade80' },
  optional: { texto: 'Opcional', color: '#fbbf24' },
  unsupported: { texto: 'No compatible', color: '#71717a' },
}

/** Nombre bonito de los enlaces del proyecto. */
export const ENLACES = {
  source: 'Código fuente',
  issues: 'Reportar un problema',
  wiki: 'Wiki',
  discord: 'Discord',
  website: 'Sitio web',
  donate: 'Donar',
}
