import admin from 'firebase-admin'

function getAdminApp() {
  if (admin.apps.length) return admin.apps[0]
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT no configurado')
  return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) })
}

export function getAdminAuth() { return getAdminApp().auth() }
export function getAdminDb()   { return getAdminApp().firestore() }