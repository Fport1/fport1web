import admin from 'firebase-admin'

function getAdminApp() {
  if (admin.apps.length) return admin.apps[0]
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT no configurado')
  return admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(sa)),
    // Necesario para getStorage().bucket(): enlaces firmados de los adjuntos
    // del chat y validación de subidas.
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
  })
}

export function getAdminAuth()   { return getAdminApp().auth() }
export function getAdminDb()     { return getAdminApp().firestore() }
export function getAdminBucket() { return admin.storage(getAdminApp()).bucket() }