// Dice si @fport1 tiene GitHub conectado, y permite desconectar.
//
// Nunca devuelve el token: solo si existe, con qué cuenta y desde cuándo. Para
// comprobar que sigue sirviendo se pregunta a GitHub, porque el token pudo
// revocarse desde su web sin que aquí nos enteremos.
import { NextResponse } from 'next/server'
import { exigirFport1, apiGitHub, borrarToken, leerToken } from '@/lib/githubServidor'
import { getAdminDb } from '@/lib/firebaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req) {
  const sesion = await exigirFport1(req)
  if (sesion.error) return NextResponse.json({ error: sesion.error }, { status: sesion.status })

  const token = await leerToken(sesion.uid)
  if (!token) return NextResponse.json({ conectado: false })

  const doc = await getAdminDb().doc(`github_tokens/${sesion.uid}`).get()
  const r = await apiGitHub(sesion.uid, '/user')
  if (!r.ok) {
    return NextResponse.json({
      conectado: false,
      motivo: r.status === 401 ? 'El permiso fue revocado desde GitHub.' : 'GitHub no respondió.',
    })
  }

  return NextResponse.json({
    conectado: true,
    login: r.cuerpo?.login || doc.data()?.login || null,
    avatar: r.cuerpo?.avatar_url || null,
    conectadoEn: doc.data()?.conectadoEn?.toDate?.()?.toISOString() || null,
  })
}

export async function DELETE(req) {
  const sesion = await exigirFport1(req)
  if (sesion.error) return NextResponse.json({ error: sesion.error }, { status: sesion.status })
  await borrarToken(sesion.uid)
  return NextResponse.json({ ok: true })
}
