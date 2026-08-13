'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

export const DOOMSDAY_ADMIN_SLUG = 'fport1'

/**
 * Quién puede ver la página de Doomsday: el admin siempre, y los usuarios
 * a los que el admin les concedió acceso (doc en doomsday_access/{uid}).
 * Devuelve { isAdmin, hasAccess, checking }.
 */
export function useDoomsdayAccess(uid, usernameSlug) {
  const isAdmin = usernameSlug === DOOMSDAY_ADMIN_SLUG
  const [granted, setGranted] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (!db || !uid) { setGranted(false); setChecking(false); return }
    if (isAdmin) { setGranted(true); setChecking(false); return }

    setChecking(true)
    const unsub = onSnapshot(doc(db, 'doomsday_access', uid),
      snap => { setGranted(snap.exists()); setChecking(false) },
      () => { setGranted(false); setChecking(false) })
    return () => unsub()
  }, [uid, isAdmin])

  return { isAdmin, hasAccess: isAdmin || granted, checking }
}
