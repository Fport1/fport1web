'use client'

// Crear notificaciones. Se guardan en `notifications` y las lee /notificaciones.
//
// Guardamos una copia del nombre y la foto de quien la genera para poder pintar
// la fila sin una segunda consulta; la página luego refresca esos datos con los
// actuales, por si la persona cambió de avatar o de nombre.

import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * @param {object} o
 * @param {string} o.toUid      a quién le llega
 * @param {string} o.fromUid    quién la genera
 * @param {string} o.type       friend_request | friend_accept | message |
 *                              group_added | group_admin | doomsday_access
 * @param {object} [o.context]  datos extra (cid, groupName, …)
 * @param {object} [o.from]     perfil de quien la genera, para la copia
 */
export async function notificar({ toUid, fromUid, type, context = {}, from = null }) {
  if (!db || !toUid || !fromUid || !type) return
  if (toUid === fromUid) return // uno no se notifica a sí mismo

  try {
    await addDoc(collection(db, 'notifications'), {
      toUid,
      fromUid,
      type,
      read: false,
      createdAt: serverTimestamp(),
      context: {
        ...context,
        fromProfileName: from?.profileName || from?.displayName || null,
        fromPhotoURL: from?.photoURL || null,
      },
    })
  } catch (e) {
    // Una notificación que no sale no debe tumbar la acción que la originó.
    console.warn('[notificar]', e?.code, e?.message)
  }
}

/** Varias a la vez (p. ej. al añadir gente a un grupo). */
export async function notificarVarios(uids = [], base) {
  await Promise.all([...new Set(uids)].map(uid => notificar({ ...base, toUid: uid })))
}
