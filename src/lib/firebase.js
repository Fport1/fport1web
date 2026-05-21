import { initializeApp, getApps } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

// Only initialize Firebase when running in the browser or when config is present
const hasConfig = !!firebaseConfig.apiKey && !!firebaseConfig.projectId

let _app, _auth, _db

if (hasConfig) {
  _app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  _auth = getAuth(_app)
  _db   = getFirestore(_app)
  setPersistence(_auth, browserLocalPersistence).catch(() => {})
}

export const auth = _auth
export const db   = _db