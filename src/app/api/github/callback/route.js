// Vuelta de GitHub: cambia el código por el token y lo guarda cifrado.
//
// Aquí no hay sesión de Firebase (es una navegación que llega desde GitHub), así
// que la identidad la aporta el `state` firmado que emitimos en /login. Sin esa
// firma cualquiera podría provocar que un token acabe guardado bajo otro uid.
import { NextResponse } from 'next/server'
import { verificarEstado, guardarToken } from '@/lib/githubServidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const vuelta = (origen, estado, detalle) =>
  NextResponse.redirect(`${origen}/creaciones/conectar?estado=${estado}${detalle ? `&detalle=${encodeURIComponent(detalle)}` : ''}`)

export async function GET(req) {
  const url = new URL(req.url)
  const origen = url.origin
  const code = url.searchParams.get('code')
  const estado = url.searchParams.get('state')

  // GitHub avisa aquí si la persona le dio a "Cancelar".
  const errorGitHub = url.searchParams.get('error')
  if (errorGitHub) return vuelta(origen, 'cancelado', url.searchParams.get('error_description'))
  if (!code || !estado) return vuelta(origen, 'faltan_datos')

  const uid = verificarEstado(estado)
  if (!uid) return vuelta(origen, 'estado_invalido')

  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${origen}/api/github/callback`,
      }),
    })
    const datos = await res.json().catch(() => ({}))
    // GitHub responde 200 incluso cuando falla; el error viene en el cuerpo.
    if (!datos?.access_token) return vuelta(origen, 'sin_token', datos?.error_description || datos?.error)

    // El nombre de usuario se guarda solo para poder enseñar con qué cuenta
    // está conectado; si falla, no es motivo para tirar la conexión.
    let login = null
    try {
      const yo = await fetch('https://api.github.com/user', {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${datos.access_token}` },
      })
      login = (await yo.json())?.login || null
    } catch { /* sin nombre */ }

    await guardarToken(uid, datos.access_token, login)
    return vuelta(origen, 'conectado')
  } catch (e) {
    // Sin detalles del error en la respuesta: podrían arrastrar el código o el token.
    console.error('[github callback]', e?.message)
    return vuelta(origen, 'fallo')
  }
}
