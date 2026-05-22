'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

const AuthCtx = createContext({ user: null, profile: null, loading: true, switching: false })

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [switching, setSwitching] = useState(false)
  const switchingRef = useRef(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      // Ignore the transient null fired during account switching
      if (switchingRef.current && !u) return
      setUser(u)
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'users', u.uid))
          setProfile(snap.exists() ? snap.data() : null)
        } catch {
          setProfile(null)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  async function switchToGoogle(email) {
    switchingRef.current = true
    setSwitching(true)
    try {
      const provider = new GoogleAuthProvider()
      if (email) provider.setCustomParameters({ login_hint: email })
      await signInWithPopup(auth, provider)
    } finally {
      switchingRef.current = false
      setSwitching(false)
    }
  }

  return (
    <AuthCtx.Provider value={{
      user, profile, loading, switching,
      signOut: () => signOut(auth),
      switchToGoogle,
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() { return useContext(AuthCtx) }