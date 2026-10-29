'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth, db } from '@/lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import { startPresence, stopPresence } from '@/lib/presence'

const AuthCtx = createContext({ user: null, profile: null, loading: true, switching: false })

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [switching, setSwitching] = useState(false)
  const switchingRef = useRef(false)
  const prevUidRef   = useRef(null)

  useEffect(() => {
    // El perfil sale de DOS documentos y se escucha en vivo:
    //   users/{uid}                  -> lo publico (nombre, @usuario, foto)
    //   users/{uid}/private/settings -> lo que solo ve su dueno (chats
    //                                   silenciados, bloqueados, push)
    // Antes solo se leia el primero, y una sola vez: silenciar o bloquear se
    // guardaba en private/settings pero la interfaz nunca lo enteraba.
    let quitarPublico = null
    let quitarPrivado = null
    const soltar = () => { quitarPublico?.(); quitarPrivado?.(); quitarPublico = quitarPrivado = null }

    const unsub = onAuthStateChanged(auth, async (u) => {
      // Ignore the transient null fired during account switching
      if (switchingRef.current && !u) return

      // Presence: stop previous session, start new one
      if (!u && prevUidRef.current) {
        stopPresence(prevUidRef.current).catch(() => {})
        prevUidRef.current = null
      }

      soltar()
      setUser(u)
      if (!u) { setProfile(null); setLoading(false); return }

      startPresence(u.uid).catch(() => {})
      prevUidRef.current = u.uid

      let publico = null, privado = {}, publicoListo = false
      // Lo privado se pone encima de lo publico, pero solo en memoria: nada de
      // esto se vuelve a escribir entero en el documento publico.
      const publicar = () => { if (publicoListo) setProfile(publico ? { ...publico, ...privado } : null) }

      quitarPublico = onSnapshot(doc(db, 'users', u.uid),
        snap => { publico = snap.exists() ? snap.data() : null; publicoListo = true; publicar(); setLoading(false) },
        ()   => { publico = null; publicoListo = true; publicar(); setLoading(false) })
      quitarPrivado = onSnapshot(doc(db, 'users', u.uid, 'private', 'settings'),
        snap => { privado = snap.exists() ? snap.data() : {}; publicar() },
        ()   => { /* sin ajustes privados: el perfil publico basta */ })
    })
    return () => { unsub(); soltar() }
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
      signOut: async () => {
        if (prevUidRef.current) await stopPresence(prevUidRef.current).catch(() => {})
        return signOut(auth)
      },
      switchToGoogle,
    }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() { return useContext(AuthCtx) }