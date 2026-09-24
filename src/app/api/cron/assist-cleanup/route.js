import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebaseAdmin'

// Borra los documentos abandonados de `assist` (señalización del launcher).
//
// Lo normal es que el anfitrión borre el suyo al conectar, al cancelar o al
// cerrar el launcher; aquí solo caen los que quedaron huérfanos porque el
// launcher se cerró de golpe. Esto haría una política TTL de Firestore, pero
// las TTL exigen el plan de pago, así que lo hacemos con un cron de Vercel.
//
// El SDK de administración no pasa por las reglas de seguridad, por eso puede
// recorrer la colección aunque para los clientes el `list` esté bloqueado.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOTE = 300               // documentos por pasada
const MARGEN_MS = 60 * 60 * 1000 // 1 h de cortesía para los que no traen expiresAt

export async function GET(req) {
  // Vercel firma sus llamadas de cron con CRON_SECRET. Si la variable está
  // configurada, exigimos la cabecera: así nadie puede disparar la limpieza.
  const secreto = process.env.CRON_SECRET
  if (secreto) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secreto}`) {
      return NextResponse.json({ error: 'no autorizado' }, { status: 401 })
    }
  }

  try {
    const db = getAdminDb()
    const ahora = Date.now()

    // Vencidos por su propia marca de caducidad.
    const vencidos = await db.collection('assist')
      .where('expiresAt', '<', ahora)
      .limit(LOTE)
      .get()

    // Los antiguos sin `expiresAt` (versiones viejas del launcher) se barren
    // por fecha de creación, con un margen para no tocar los que están vivos.
    const viejos = await db.collection('assist')
      .where('createdAt', '<', ahora - MARGEN_MS)
      .limit(LOTE)
      .get()

    const porBorrar = new Map()
    for (const d of [...vencidos.docs, ...viejos.docs]) porBorrar.set(d.id, d.ref)

    if (porBorrar.size === 0) {
      return NextResponse.json({ ok: true, borrados: 0 })
    }

    // Firestore admite como mucho 500 operaciones por lote.
    const refs = [...porBorrar.values()]
    for (let i = 0; i < refs.length; i += 450) {
      const lote = db.batch()
      refs.slice(i, i + 450).forEach(ref => lote.delete(ref))
      await lote.commit()
    }

    return NextResponse.json({ ok: true, borrados: refs.length })
  } catch (err) {
    console.error('[cron assist-cleanup]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
