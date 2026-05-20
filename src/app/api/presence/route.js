import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebaseAdmin'

// POST /api/presence — update presence from launcher
// Body: { uid, playing: bool, online: bool, token? }
export async function POST(req) {
  try {
    const body = await req.json()
    const { uid, playing = false, online = true } = body

    if (!uid || typeof uid !== 'string' || uid.length < 10) {
      return NextResponse.json({ error: 'uid inválido' }, { status: 400 })
    }

    const db = getAdminDb()
    await db.collection('presence').doc(uid).set({
      online,
      playing,
      lastSeen: new Date(),
    }, { merge: true })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[presence POST]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// GET /api/presence?uids=uid1,uid2,...
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const uidsParam = searchParams.get('uids') ?? ''
    const uids = uidsParam.split(',').filter(u => u.length > 5).slice(0, 50)

    if (uids.length === 0) return NextResponse.json({})

    const db = getAdminDb()
    const snaps = await Promise.all(uids.map(uid => db.collection('presence').doc(uid).get()))
    const result = {}
    snaps.forEach((snap, i) => {
      result[uids[i]] = snap.exists ? snap.data() : null
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[presence GET]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}