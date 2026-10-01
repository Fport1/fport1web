// Arranca la conexión con GitHub.
//
// Es POST y no un enlace directo a propósito: para saber si quien pide esto es
// @fport1 hace falta su token de sesión, y una navegación normal no puede
// mandar cabeceras. Si fuera por la URL, el token quedaría escrito en el
// historial del navegador y en los registros del servidor.
//
// Responde con la URL de GitHub; el navegador va luego por su cuenta.
import { NextResponse } from 'next/server'
import { exigirFport1, firmarEstado } from '@/lib/githubServidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// `repo` hace falta para crear releases y subir archivos, incluso en repos
// privados. Es amplio, pero es el permiso mínimo que cubre lo que el panel hace.
const PERMISOS = 'repo'

export async function POST(req) {
  const sesion = await exigirFport1(req)
  if (sesion.error) return NextResponse.json({ error: sesion.error }, { status: sesion.status })

  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) return NextResponse.json({ error: 'sin_configurar' }, { status: 500 })

  // El destino se arma desde la petición, así vale igual en local y en producción
  // (y coincide con las URIs registradas en la app de GitHub).
  const origen = new URL(req.url).origin
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', `${origen}/api/github/callback`)
  url.searchParams.set('scope', PERMISOS)
  url.searchParams.set('state', firmarEstado(sesion.uid))

  return NextResponse.json({ url: url.toString() })
}
