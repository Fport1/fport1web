'use client'

import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'

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
        if (lastAt && (!myReadAt || lastAt > myReadAt) && sender && sender !== uid) n++
      })
      setCount(n)
    }, () => {})

    return () => unsub()
  }, [uid])

  return count
}
