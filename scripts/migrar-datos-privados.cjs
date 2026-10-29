// Saca los datos personales del perfil público (users/{uid}) y los deja donde solo los
// lee su dueño:
//   email      → users/{uid}/private/profile
//   fcmTokens  → users/{uid}/private/settings   (se suman a los que ya hubiera)
//
// No borra nada: cada documento se copia y se quita en UNA transacción, así que o pasan
// las dos cosas o ninguna. Después se vuelve a leer y se comparan todos los demás campos
// (con las claves ordenadas) para asegurar que no ha cambiado nada más.
//
// Uso (desde la raíz de fport1web, con FIREBASE_SERVICE_ACCOUNT en el entorno):
//   node scripts/migrar-datos-privados.cjs                 prueba: dice qué haría, no escribe
//   node scripts/migrar-datos-privados.cjs --uno           prueba con el primer documento
//   node scripts/migrar-datos-privados.cjs --uid ABC       prueba con ese documento
//   ... y lo mismo con --ejecutar para escribir de verdad (--todos para todos)
//
// Contra el emulador: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-x

const admin = require('firebase-admin')
const fs = require('fs')

const MOVER = { email: 'profile', fcmTokens: 'settings' }

const args = process.argv.slice(2)
const ejecutar = args.includes('--ejecutar')
const todos = args.includes('--todos')
const uno = args.includes('--uno')
const uidArg = args.includes('--uid') ? args[args.indexOf('--uid') + 1] : null
if (ejecutar && !todos && !uno && !uidArg) {
  console.error('Con --ejecutar hay que decir cuántos: --uno, --uid <uid> o --todos.')
  process.exit(2)
}

function iniciar() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-fport1' })
  } else {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT
    if (!sa) { console.error('Falta FIREBASE_SERVICE_ACCOUNT (o FIRESTORE_EMULATOR_HOST para el emulador).'); process.exit(2) }
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) })
  }
  return admin.firestore()
}

/** Valor comparable: mapas con las claves ordenadas y los tipos de Firestore en texto. */
function canon(v) {
  if (v === null || v === undefined) return null
  if (v instanceof admin.firestore.Timestamp) return { $ts: `${v.seconds}.${v.nanoseconds}` }
  if (v instanceof admin.firestore.GeoPoint) return { $geo: [v.latitude, v.longitude] }
  if (v instanceof admin.firestore.DocumentReference) return { $ref: v.path }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { $bytes: Buffer.from(v).toString('base64') }
  if (Array.isArray(v)) return v.map(canon)
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
  return v
}
const resto = (data) => JSON.stringify(canon(Object.fromEntries(Object.entries(data).filter(([k]) => !(k in MOVER)))))
const tapar = (v) => { const s = Array.isArray(v) ? `[${v.length} tokens]` : String(v); return s.length <= 6 ? '***' : `${s.slice(0, 2)}…${s.slice(-4)}` }

async function migrarUno(db, uid) {
  const userRef = db.doc(`users/${uid}`)
  const antes = (await userRef.get()).data()
  if (!antes) return { uid, estado: 'no existe' }
  const campos = Object.keys(MOVER).filter((k) => k in antes)
  if (!campos.length) return { uid, estado: 'nada que mover' }

  const plan = { uid, campos: Object.fromEntries(campos.map((k) => [k, `${tapar(antes[k])} → private/${MOVER[k]}`])) }

  // El correo privado ya puede existir (registros nuevos): si no coincide, no se pisa
  if ('email' in antes) {
    const priv = (await db.doc(`users/${uid}/private/profile`).get()).data()
    if (priv?.email && antes.email && priv.email !== antes.email) return { ...plan, estado: 'CONFLICTO: private/profile ya tiene otro correo; no se toca' }
  }
  if (!ejecutar) return { ...plan, estado: 'prueba: se movería' }

  const restoAntes = resto(antes)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    const d = snap.data() || {}
    if (resto(d) !== restoAntes) throw new Error('el documento cambió mientras tanto')
    const borrar = {}
    for (const k of campos) {
      if (!(k in d)) continue
      const destino = db.doc(`users/${uid}/private/${MOVER[k]}`)
      if (k === 'fcmTokens') {
        const tokens = Array.isArray(d.fcmTokens) ? d.fcmTokens : []
        if (tokens.length) tx.set(destino, { fcmTokens: admin.firestore.FieldValue.arrayUnion(...tokens) }, { merge: true })
      } else if (d[k] !== null && d[k] !== '') {
        tx.set(destino, { [k]: d[k] }, { merge: true })
      }
      borrar[k] = admin.firestore.FieldValue.delete()
    }
    tx.update(userRef, borrar)
  })

  // Comprobación: los demás campos idénticos, los movidos fuera y en su sitio
  const despues = (await userRef.get()).data() || {}
  const problemas = []
  if (resto(despues) !== restoAntes) problemas.push('los demás campos han cambiado')
  for (const k of campos) {
    if (k in despues) problemas.push(`${k} sigue en el perfil público`)
    const priv = (await db.doc(`users/${uid}/private/${MOVER[k]}`).get()).data() || {}
    if (k === 'email' && antes.email && priv.email !== antes.email) problemas.push('el correo privado no coincide')
    if (k === 'fcmTokens' && Array.isArray(antes.fcmTokens) && !antes.fcmTokens.every((t) => (priv.fcmTokens || []).includes(t))) problemas.push('faltan tokens en private/settings')
  }
  return { ...plan, estado: problemas.length ? `ERROR: ${problemas.join('; ')}` : 'movido y comprobado' }
}

;(async () => {
  const db = iniciar()
  let uids
  if (uidArg) uids = [uidArg]
  else {
    const snap = await db.collection('users').get()
    uids = snap.docs.filter((d) => Object.keys(MOVER).some((k) => k in d.data())).map((d) => d.id)
    if (uno) uids = uids.slice(0, 1)
  }
  console.log(`${ejecutar ? 'EJECUTANDO' : 'PRUEBA (no se escribe nada)'} · ${uids.length} documento(s) con datos que mover\n`)
  const informe = []
  for (const uid of uids) {
    let r
    try { r = await migrarUno(db, uid) } catch (e) { r = { uid, estado: `ERROR: ${e.message}` } }
    informe.push(r)
    console.log(`${r.uid.slice(0, 6)}…  ${r.estado}`)
    for (const [k, v] of Object.entries(r.campos || {})) console.log(`          ${k}: ${v}`)
    // Al primer error se para: mejor revisar que seguir
    if (r.estado.startsWith('ERROR')) { console.error('\nParado en el primer error.'); break }
  }
  const archivo = `migracion-${ejecutar ? 'real' : 'prueba'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  fs.writeFileSync(archivo, JSON.stringify(informe, null, 2))
  console.log(`\nInforme (sin datos en claro): ${archivo}`)
  process.exit(informe.some((r) => r.estado.startsWith('ERROR') || r.estado.startsWith('CONFLICTO')) ? 1 : 0)
})()
