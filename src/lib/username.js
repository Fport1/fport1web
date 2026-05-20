import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const USERNAME_MIN = 3
export const USERNAME_MAX = 15
export const DISPLAY_NAME_MAX = 50

export function normalizeHandle(input) {
  if (!input) return ''
  let s = String(input).trim().toLowerCase()
  if (s.startsWith('@')) s = s.slice(1)
  s = s.replace(/[^a-z0-9_-]/g, '')
  return s
}

export function validateHandle(input) {
  const slug = normalizeHandle(input)
  if (slug.length < USERNAME_MIN) return { ok: false, slug, msg: `Mínimo ${USERNAME_MIN} caracteres.` }
  if (slug.length > USERNAME_MAX) return { ok: false, slug, msg: `Máximo ${USERNAME_MAX} caracteres.` }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) return { ok: false, slug, msg: "Solo minúsculas, números, '-' y '_'." }
  return { ok: true, slug, msg: '' }
}

export async function reserveUsernameAndUpsertProfile({ uid, email, profileName, handleInput, minecraftUsername = null, minecraftUUID = null }) {
  const { ok, slug, msg } = validateHandle(handleInput)
  if (!ok) throw new Error(msg)

  const unameRef = doc(db, 'usernames', slug)
  const userRef = doc(db, 'users', uid)

  await runTransaction(db, async (tx) => {
    const unameSnap = await tx.get(unameRef)
    if (unameSnap.exists()) throw new Error('Ese usuario ya está en uso.')

    const now = serverTimestamp()
    const base = {
      uid,
      email: email || null,
      username: `@${slug}`,
      usernameSlug: slug,
      profileName: String(profileName || '').slice(0, DISPLAY_NAME_MAX),
      minecraftUsername: minecraftUsername || null,
      minecraftUUID: minecraftUUID || null,
      updatedAt: now,
    }

    const current = await tx.get(userRef)
    if (!current.exists()) base.createdAt = now

    tx.set(unameRef, { uid, createdAt: now })
    tx.set(userRef, base, { merge: true })
  })

  return `@${slug}`
}

export async function changeUsername({ uid, newHandle }) {
  const { ok, slug, msg } = validateHandle(newHandle)
  if (!ok) throw new Error(msg)

  const userRef = doc(db, 'users', uid)
  const newRef = doc(db, 'usernames', slug)

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef)
    if (!userSnap.exists()) throw new Error('Perfil no encontrado.')
    const prevSlug = userSnap.data().usernameSlug || null

    const takenSnap = await tx.get(newRef)
    if (takenSnap.exists()) throw new Error('Ese usuario ya está en uso.')

    tx.set(newRef, { uid, createdAt: serverTimestamp() })

    if (prevSlug) {
      const oldRef = doc(db, 'usernames', prevSlug)
      const oldSnap = await tx.get(oldRef)
      if (oldSnap.exists() && oldSnap.data()?.uid === uid) tx.delete(oldRef)
    }

    tx.set(userRef, { username: `@${slug}`, usernameSlug: slug, updatedAt: serverTimestamp() }, { merge: true })
  })

  return `@${slug}`
}