'use client'

import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/** Número de notificaciones sin leer, en tiempo real. */
export function useUnreadNotifs(uid) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!uid || !db) { setCount(0); return }
    const q = query(
      collection(db, 'notifications'),
      where('toUid', '==', uid),
      where('read', '==', false),
    )
    const unsub = onSnapshot(q, snap => setCount(snap.size), () => setCount(0))
    return () => unsub()
  }, [uid])

  return count
}
