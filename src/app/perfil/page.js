'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { db } from '@/lib/firebase'
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, writeBatch,
  query, where, orderBy, onSnapshot, serverTimestamp, limit,
} from 'firebase/firestore'
import PerfilNav from '@/components/PerfilNav'
import { setVisibility, resolvePresence } from '@/lib/presence'

function stripAt(s) { return s ? s.replace(/^@/, '') : s }

function Avatar({ src, name, size = 36 }) {
  const [err, setErr] = useState(false)
  const initial = name ? name.trim()[0].toUpperCase() : '?'
  if (src && !err) return <img src={src} alt={name} onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', imageRendering: 'pixelated' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initial}
    </div>
  )
}

function minecraftHead(uuid) {
  if (!uuid) return null
  return `https://crafatar.com/avatars/${uuid.replace(/-/g, '')}?size=72&overlay`
}

export default function PerfilPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading, switching } = useAuth()

  const [tab, setTab]               = useState('friends')
  const [friends, setFriends]       = useState([])
  const [presence, setPresence]     = useState({})
  const [requests, setRequests]     = useState([])
  const [outgoing, setOutgoing]     = useState([])
  const [searchQ, setSearchQ]       = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching, setSearching]   = useState(false)
  const [actionMsg, setActionMsg]   = useState(null)
  const [copyFriendLink, setCopyFriendLink] = useState(false)
  const [myVisibility, setMyVisibility]     = useState(null)
  const [visSaving, setVisSaving]           = useState(false)

  useEffect(() => {
    if (!authLoading && !switching && !user) router.push('/login')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'friends'), orderBy('addedAt', 'desc'))
    const unsubs = []
    const presenceMap = {}

    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
      setFriends(list)

      // subscribe to each friend's presence in real-time
      unsubs.forEach(u => u())
      unsubs.length = 0
      list.forEach(f => {
        const pUnsub = onSnapshot(doc(db, 'presence', f.uid), pSnap => {
          presenceMap[f.uid] = pSnap.exists() ? pSnap.data() : null
          setPresence({ ...presenceMap })
        }, () => {})
        unsubs.push(pUnsub)
      })
    })

    return () => { unsub(); unsubs.forEach(u => u()) }
  }, [user])

  // Load own visibility setting
  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'presence', user.uid), snap => {
      setMyVisibility(snap.exists() ? (snap.data().visibility ?? 'everyone') : 'everyone')
    }, () => {})
    return () => unsub()
  }, [user])

  async function saveVisibility(val) {
    setVisSaving(true)
    try { await setVisibility(user.uid, val); setMyVisibility(val) } catch {}
    finally { setVisSaving(false) }
  }

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'friendRequests'), where('toUid', '==', user.uid), where('status', '==', 'pending'))
    const unsub = onSnapshot(q, snap => setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => unsub()
  }, [user])

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'friendRequests'), where('fromUid', '==', user.uid), where('status', '==', 'pending'))
    const unsub = onSnapshot(q, snap => setOutgoing(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => unsub()
  }, [user])

  useEffect(() => {
    const norm = searchQ.trim().toLowerCase().replace(/^@/, '').replace(/\s+/g, '')
    if (!norm) { setSearchResult(null); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'users'),
          where('usernameSlug', '>=', norm),
          where('usernameSlug', '<=', norm + ''),
          limit(8)
        ))
        setSearchResult(snap.docs.filter(d => d.id !== user?.uid).map(d => ({ uid: d.id, ...d.data() })))
      } catch {
        setSearchResult([])
      } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [searchQ, user])

  async function sendRequest(target) {
    try {
      await setDoc(doc(db, 'friendRequests', `${user.uid}_${target.uid}`), {
        fromUid: user.uid,
        fromProfileName: profile?.profileName || stripAt(profile?.username) || 'Alguien',
        fromUsernameSlug: profile?.usernameSlug || '',
        fromPhotoURL: profile?.photoURL ?? null,
        toUid: target.uid,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
    } catch {
      setActionMsg({ type: 'err', text: 'Error al enviar solicitud.' })
    }
  }

  async function cancelRequest(toUid) {
    await deleteDoc(doc(db, 'friendRequests', `${user.uid}_${toUid}`))
  }

  async function acceptRequest(req) {
    try {
      const batch = writeBatch(db)
      const myName = profile?.profileName || stripAt(profile?.username) || 'Sin nombre'
      batch.set(doc(db, 'users', user.uid, 'friends', req.fromUid), {
        profileName: req.fromProfileName,
        usernameSlug: req.fromUsernameSlug ?? '',
        photoURL: req.fromPhotoURL ?? null,
        addedAt: serverTimestamp(),
      })
      batch.set(doc(db, 'users', req.fromUid, 'friends', user.uid), {
        profileName: myName,
        usernameSlug: profile?.usernameSlug ?? '',
        photoURL: profile?.photoURL ?? null,
        addedAt: serverTimestamp(),
      })
      batch.delete(doc(db, 'friendRequests', req.id))
      await batch.commit()
      setActionMsg({ type: 'ok', text: `Ahora eres amigo de ${req.fromProfileName}.` })
    } catch (err) {
      setActionMsg({ type: 'err', text: `Error al aceptar: ${err?.code ?? err?.message ?? 'desconocido'}` })
    }
  }

  async function declineRequest(reqId) {
    await deleteDoc(doc(db, 'friendRequests', reqId))
  }

  async function removeFriend(uid) {
    const batch = writeBatch(db)
    batch.delete(doc(db, 'users', user.uid, 'friends', uid))
    batch.delete(doc(db, 'users', uid, 'friends', user.uid))
    await batch.commit()
  }

  function copyMyLink() {
    const url = `${window.location.origin}/perfil/${user.uid}`
    navigator.clipboard.writeText(url)
    setCopyFriendLink(true)
    setTimeout(() => setCopyFriendLink(false), 2000)
  }

  if (authLoading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Cargando...</div>
  if (!user) return null

  const myName   = profile?.profileName || stripAt(profile?.username) || 'Sin nombre'
  const myHandle = profile?.username ? stripAt(profile.username) : null
  const myAvatar = profile?.photoURL ?? (profile?.minecraftUUID ? minecraftHead(profile.minecraftUUID) : null)
  const friendUids  = new Set(friends.map(f => f.uid))
  const outgoingUids = new Set(outgoing.map(r => r.toUid))

  return (
    <div className="mx-auto max-w-7xl px-4 pt-[76px] pb-6 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
      <aside className="hidden md:block md:sticky md:top-20 h-fit"><PerfilNav /></aside>

      <div>

      <div className="profile-header">
        <Avatar src={myAvatar} name={myName} size={52} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 24, fontWeight: 700, margin: 0 }}>{myName}</h1>
          {myHandle && <p style={{ fontSize: 13, color: 'var(--muted)', margin: '2px 0 0' }}>@{myHandle}</p>}
        </div>
        <button onClick={copyMyLink} style={{ padding: '8px 16px', borderRadius: 9, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--sub)', fontSize: 13, cursor: 'pointer' }}>
          {copyFriendLink ? '¡Copiado!' : '🔗 Mi enlace'}
        </button>
      </div>

      <div className="profile-tabs">
        {[['friends', 'Amigos'], ['requests', 'Solicitudes'], ['add', 'Añadir'], ['privacy', 'Privacidad']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`profile-tab${tab === key ? ' active' : ''}`} style={{ position: 'relative' }}>
            {label}
            {key === 'requests' && requests.length > 0 && (
              <span style={{ marginLeft: 6, background: 'var(--accent)', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 6px', verticalAlign: 'middle' }}>
                {requests.length}
              </span>
            )}
          </button>
        ))}
        <button onClick={() => router.push('/mensajes')} className="profile-tab" style={{ position: 'relative' }}>
          Mensajes
        </button>
      </div>

      {actionMsg && (
        <p style={{ fontSize: 13, color: actionMsg.type === 'ok' ? '#4ade80' : '#f87171', margin: '0 0 12px' }}>
          {actionMsg.text}
        </p>
      )}

      {/* AMIGOS */}
      {tab === 'friends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {friends.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: 14 }}>
              <p style={{ marginBottom: 8 }}>Aún no tienes amigos.</p>
              <button onClick={() => setTab('add')} style={{ color: 'var(--accent2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Añadir tu primer amigo →</button>
            </div>
          ) : friends.map(f => {
            const raw = presence[f.uid]
            const p   = resolvePresence(raw, true) // viewer is always a friend here
            const fname = f.profileName || f.usernameSlug || '?'
            const head = f.minecraftUUID ? minecraftHead(f.minecraftUUID) : null
            return (
              <div key={f.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar src={head ?? f.photoURL} name={fname} size={40} />
                  {p?.playing && <span style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: '#4ade80', border: '2px solid var(--card)' }} />}
                  {!p?.playing && p?.online && <span style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: '#60a5fa', border: '2px solid var(--card)' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{fname}</p>
                  <p style={{ fontSize: 12, margin: '2px 0 0', color: p?.playing ? '#4ade80' : p?.online ? '#60a5fa' : 'var(--muted)' }}>
                    {p?.playing ? '🎮 Jugando ahora' : p?.online ? 'En línea' : 'Desconectado'}
                  </p>
                </div>
                <button onClick={() => router.push(`/mensajes?u=${f.uid}`)} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>Chat</button>
                <button onClick={() => removeFriend(f.uid)} title="Eliminar amigo"
                  style={{ padding: '6px 10px', borderRadius: 8, background: 'none', border: '1px solid transparent', color: 'var(--muted)', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,.4)'; e.currentTarget.style.color = '#f87171' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--muted)' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* SOLICITUDES */}
      {tab === 'requests' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: 14 }}>
              No tienes solicitudes pendientes.
            </div>
          ) : requests.map(req => (
            <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
              <Avatar src={req.fromPhotoURL} name={req.fromProfileName} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{req.fromProfileName}</p>
                {req.fromUsernameSlug && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>@{req.fromUsernameSlug}</p>}
              </div>
              <button onClick={() => acceptRequest(req)}
                style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>
                Aceptar
              </button>
              <button onClick={() => declineRequest(req.id)}
                style={{ padding: '6px 12px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,.4)'; e.currentTarget.style.color = '#f87171' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                Rechazar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* AÑADIR */}
      {tab === 'add' && (
        <div style={{ maxWidth: 480 }}>
          <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 16 }}>Busca por @usuario o parte de él.</p>
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input value={searchQ} onChange={e => { setSearchQ(e.target.value); setActionMsg(null) }}
              placeholder="@usuario..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            {searching && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin .6s linear infinite', display: 'inline-block' }} />}
          </div>
          {searchResult && searchResult.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin resultados.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searchResult && searchResult.map(u => {
              const uname = u.profileName || u.usernameSlug || '?'
              const uhandle = u.usernameSlug || stripAt(u.username)
              const isFriend = friendUids.has(u.uid)
              const hasSent = outgoingUids.has(u.uid)
              const incomingReq = requests.find(r => r.fromUid === u.uid)
              return (
                <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
                  <Avatar src={u.photoURL} name={uname} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{uname}</p>
                    {uhandle && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>@{uhandle}</p>}
                  </div>
                  {isFriend ? (
                    <span style={{ fontSize: 12, color: '#4ade80', padding: '6px 10px' }}>Amigos ✓</span>
                  ) : incomingReq ? (
                    <button onClick={() => acceptRequest(incomingReq)}
                      style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(74,222,128,.1)', color: '#4ade80', border: '1px solid rgba(74,222,128,.3)', fontSize: 13, cursor: 'pointer' }}>
                      Aceptar solicitud
                    </button>
                  ) : hasSent ? (
                    <button onClick={() => cancelRequest(u.uid)}
                      style={{ padding: '6px 14px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13, cursor: 'pointer', transition: 'all .15s' }}
                      onMouseEnter={e => { e.currentTarget.textContent = 'Cancelar'; e.currentTarget.style.borderColor = 'rgba(239,68,68,.4)'; e.currentTarget.style.color = '#f87171' }}
                      onMouseLeave={e => { e.currentTarget.textContent = 'Enviada ✓'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)' }}>
                      Enviada ✓
                    </button>
                  ) : (
                    <button onClick={() => sendRequest(u)}
                      style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>
                      Añadir
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* PRIVACIDAD */}
      {tab === 'privacy' && (
        <div style={{ maxWidth: 480 }}>
          <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 24, lineHeight: 1.6 }}>
            Controla quién puede ver si estás conectado o jugando Minecraft.
          </p>

          {[
            { val: 'everyone', label: 'Todos', desc: 'Cualquier persona puede ver tu estado en línea.' },
            { val: 'friends', label: 'Solo amigos', desc: 'Solo las personas en tu lista de amigos ven tu estado.' },
            { val: 'nobody',  label: 'Nadie',    desc: 'Siempre apareces como desconectado para todos.' },
          ].map(opt => {
            const active = (myVisibility ?? 'everyone') === opt.val
            return (
              <button
                key={opt.val}
                onClick={() => saveVisibility(opt.val)}
                disabled={visSaving}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%',
                  textAlign: 'left', background: active ? 'rgba(124,58,237,.1)' : 'var(--card)',
                  border: `1px solid ${active ? 'rgba(124,58,237,.5)' : 'var(--border)'}`,
                  borderRadius: 12, padding: '14px 18px', marginBottom: 10,
                  cursor: visSaving ? 'wait' : 'pointer',
                  transition: 'border-color .15s, background .15s',
                }}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  background: active ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                </span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: active ? 'var(--accent2)' : 'var(--text)' }}>{opt.label}</p>
                  <p style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 0' }}>{opt.desc}</p>
                </div>
              </button>
            )
          })}

          {visSaving && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Guardando…</p>}
        </div>
      )}

      </div>
    </div>
  )
}
