'use client'

import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { readLocalAt } from '@/lib/readLocal'

/**
 * Returns the number of conversations with unread messages for `uid`.
 * Subscribes in real-time so the badge updates immediately.
 */
export function useUnreadCount(uid) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!uid || !db) { setCount(0); return }

    const q = query(
      collection(db, 'conversations'),
      where('participantUids', 'array-contains', uid),
    )

    const unsub = onSnapshot(q, snap => {
      let n = 0
      snap.docs.forEach(d => {
        const c = d.data()
        const lastAt    = c.lastMessage?.at?.toMillis?.() ?? 0
        const myReadAt  = c.readAt?.[uid]?.toMillis?.() ?? 0
        const sender    = c.lastMessage?.senderUid
        // Vale la lectura más reciente: la del servidor o la de este navegador.
        // Sin esto el contador parpadea al abrir un chat, mientras Firestore
        // todavía tiene el serverTimestamp vacío.
        const readMs    = Math.max(myReadAt, readLocalAt(d.id))
        if (lastAt && lastAt > readMs && sender && sender !== uid) n++
      })
      setCount(n)
    }, () => {})

    return () => unsub()
  }, [uid])

  return count
}
