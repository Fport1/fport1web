import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

let _heartbeat = null
let _uid       = null
let _bound     = false

function _onUnload() {
  // best-effort sync write on tab close — Firestore can't guarantee it,
  // but the 90 s stale window handles the rest
  if (!_uid) return
  const url = `https://firestore.googleapis.com`
  // just clear the timer; lastSeen stops updating → stale in ≤90 s
}

export async function startPresence(uid) {
  if (_uid === uid) return          // already running for this user
  if (_uid)        await stopPresence(_uid)

  _uid = uid

  try {
    await setDoc(doc(db, 'presence', uid), {
      online:   true,
      playing:  false,
      lastSeen: serverTimestamp(),
    }, { merge: true })
  } catch {}

  clearInterval(_heartbeat)
  _heartbeat = setInterval(async () => {
    try { await updateDoc(doc(db, 'presence', uid), { lastSeen: serverTimestamp() }) } catch {}
  }, 55_000)

  if (!_bound) {
    window.addEventListener('beforeunload', _onUnload)
    _bound = true
  }
}

export async function stopPresence(uid) {
  clearInterval(_heartbeat)
  _heartbeat = null
  _uid       = null

  if (_bound) {
    window.removeEventListener('beforeunload', _onUnload)
    _bound = false
  }

  try {
    await updateDoc(doc(db, 'presence', uid), {
      online:   false,
      lastSeen: serverTimestamp(),
    })
  } catch {}
}

// Called by the launcher when Minecraft starts/stops
export async function updatePlaying(uid, playing) {
  try {
    await updateDoc(doc(db, 'presence', uid), {
      playing,
      lastSeen: serverTimestamp(),
    })
  } catch {}
}

// Saves the user's visibility preference
export async function setVisibility(uid, visibility) {
  await setDoc(doc(db, 'presence', uid), { visibility }, { merge: true })
}

/**
 * Resolves what presence to show a viewer.
 * Returns null if the user chose to hide their status.
 * Returns a normalized object { online, playing } otherwise.
 *
 * @param {object|null} presData  - raw presence doc data
 * @param {boolean}     isFriend  - is the viewer in the user's friends list?
 */
export function resolvePresence(presData, isFriend = false) {
  if (!presData) return null

  const vis = presData.visibility ?? 'everyone'
  if (vis === 'nobody')               return null
  if (vis === 'friends' && !isFriend) return null

  // Stale check — if lastSeen is older than 90 s treat as offline
  let stale = false
  if (presData.lastSeen) {
    const ts = presData.lastSeen.toDate ? presData.lastSeen.toDate() : new Date(presData.lastSeen)
    stale = Date.now() - ts.getTime() > 90_000
  }

  return {
    online:  stale ? false : !!presData.online,
    playing: stale ? false : !!presData.playing,
  }
}
