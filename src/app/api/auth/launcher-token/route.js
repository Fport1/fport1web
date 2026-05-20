import { NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebaseAdmin'

// POST /api/auth/launcher-token
// Body: { idToken: string }
// Verifies a Firebase ID token (from Google sign-in on the web) and returns
// a short-lived custom token the Electron launcher can use with signInWithCustomToken.
export async function POST(req) {
  try {
    const { idToken } = await req.json()
    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'idToken requerido' }, { status: 400 })
    }

    const adminAuth  = getAdminAuth()
    const decoded    = await adminAuth.verifyIdToken(idToken)
    const customToken = await adminAuth.createCustomToken(decoded.uid)

    return NextResponse.json({ customToken, uid: decoded.uid })
  } catch (err) {
    console.error('[launcher-token]', err)
    return NextResponse.json({ error: 'Error al crear el token' }, { status: 500 })
  }
}