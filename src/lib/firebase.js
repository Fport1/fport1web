import { initializeApp, getApps } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.projectId

let _app, _auth, _db, _storage

if (hasConfig) {
  _app     = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  _auth    = getAuth(_app)
  _db      = getFirestore(_app)
  _storage = firebaseConfig.storageBucket
    ? getStorage(_app, `gs://${firebaseConfig.storageBucket}`)
    : getStorage(_app)
  setPersistence(_auth, browserLocalPersistence).catch(() => {})
}

export const auth    = _auth
export const db      = _db
export const storage = _storage