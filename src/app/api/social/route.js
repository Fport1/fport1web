import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebaseAdmin'

// GET /api/social?minecraftUUID={uuid}
// Returns the fport1web profile + friends list for a user identified by their Minecraft UUID.
// Used by the launcher to show web social friends.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const minecraftUUID = searchParams.get('minecraftUUID') ?? ''

    if (!minecraftUUID || minecraftUUID.length < 10) {
      return NextResponse.json({ error: 'minecraftUUID inválido' }, { status: 400 })
    }

    const db = getAdminDb()

    // Find the user with this Minecraft UUID
    const usersSnap = await db.collection('users')
      .where('minecraftUUID', '==', minecraftUUID)
      .limit(1)
      .get()

    if (usersSnap.empty) {
      return NextResponse.json({ profile: null, friends: [] })
    }

    const userDoc = usersSnap.docs[0]
    const userData = userDoc.data()
    const uid = userDoc.id

    const profile = {
      uid,
      username: userData.username ?? null,
      profileName: userData.profileName ?? userData.displayName ?? null,
      minecraftUsername: userData.minecraftUsername ?? null,
      minecraftUUID: userData.minecraftUUID ?? null,
    }

    // Get friends subcollection
    const friendsSnap = await db.collection('users').doc(uid).collection('friends').get()

    const friendUids = friendsSnap.docs.map(d => d.id)

    if (friendUids.length === 0) {
      return NextResponse.json({ profile, friends: [] })
    }

    // Batch fetch friend profiles and presence
    const [profileSnaps, presenceSnaps] = await Promise.all([
      Promise.all(friendUids.map(fuid => db.collection('users').doc(fuid).get())),
      Promise.all(friendUids.map(fuid => db.collection('presence').doc(fuid).get())),
    ])

    const friends = profileSnaps.map((snap, i) => {
      const fData = snap.exists ? snap.data() : {}
      const presence = presenceSnaps[i].exists ? presenceSnaps[i].data() : null
      return {
        uid: friendUids[i],
        username: fData.username ?? null,
        profileName: fData.profileName ?? fData.displayName ?? null,
        minecraftUsername: fData.minecraftUsername ?? null,
        minecraftUUID: fData.minecraftUUID ?? null,
        presence,
      }
    })

    return NextResponse.json({ profile, friends })
  } catch (err) {
    console.error('[social GET]', err)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}