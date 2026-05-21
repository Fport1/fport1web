'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/auth-context'
import { db } from '@/lib/firebase'
import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, onSnapshot, addDoc, serverTimestamp, limit,
} from 'firebase/firestore'

// ── helpers ──────────────────────────────────────────────────────────────────

function chatId(a, b) { return [a, b].sort().join('_') }

function Avatar({ src, name, size = 36 }) {
  const initial = name ? name.trim()[0].toUpperCase() : '?'
  if (src) return <img src={src} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', imageRendering: 'pixelated' }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initial}
    </div>
  )
}

function minecraftHead(uuid) {
  if (!uuid) return null
  const clean = uuid.replace(/-/g, '')
  return `https://crafatar.com/avatars/${clean}?size=72&overlay`
}

// ── component ─────────────────────────────────────────────────────────────────

export default function AmigosPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()

  const [tab, setTab]           = useState('friends')   // 'friends' | 'chat'
  const [friends, setFriends]   = useState([])
  const [presence, setPresence] = useState({})          // uid → { online, playing }
  const [chats, setChats]       = useState([])
  const [openChatId, setOpenChatId] = useState(null)
  const [messages, setMessages] = useState([])
  const [msgText, setMsgText]   = useState('')
  const [searchQ, setSearchQ]   = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching, setSearching] = useState(false)
  const [addMsg, setAddMsg]     = useState(null)
  const [copyFriendLink, setCopyFriendLink] = useState(false)
  const msgEndRef = useRef(null)

  // redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [authLoading, user, router])

  // load friends + presence
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'friends'), orderBy('addedAt', 'desc'))
    const unsub = onSnapshot(q, async snap => {
      const list = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
      setFriends(list)
      // load presence for each friend
      const presenceMap = {}
      await Promise.all(list.map(async f => {
        try {
          const pSnap = await getDoc(doc(db, 'presence', f.uid))
          if (pSnap.exists()) presenceMap[f.uid] = pSnap.data()
        } catch { /* ignore */ }
      }))
      setPresence(presenceMap)
    })
    return () => unsub()
  }, [user])

  // load chat conversations
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'chats'), where('members', 'array-contains', user.uid), orderBy('lastMessageAt', 'desc'))
    const unsub = onSnapshot(q, snap => {
      setChats(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsub()
  }, [user])

  // load messages for open chat
  useEffect(() => {
    if (!openChatId) return
    const q = query(collection(db, 'chats', openChatId, 'messages'), orderBy('createdAt', 'asc'), limit(100))
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    })
    return () => unsub()
  }, [openChatId])

  async function searchUser() {
    if (!searchQ.trim()) return
    setSearching(true); setSearchResult(null); setAddMsg(null)
    try {
      // search by displayName prefix in Firestore (simple approach)
      const snap = await getDocs(query(collection(db, 'users'), where('displayName', '>=', searchQ.trim()), where('displayName', '<=', searchQ.trim() + ''), limit(5)))
      const results = snap.docs.filter(d => d.id !== user.uid).map(d => ({ uid: d.id, ...d.data() }))
      setSearchResult(results)
    } catch {
      setAddMsg({ type: 'err', text: 'Error al buscar.' })
    } finally { setSearching(false) }
  }

  async function addFriend(friend) {
    try {
      await setDoc(doc(db, 'users', user.uid, 'friends', friend.uid), {
        displayName: friend.displayName,
        photoURL: friend.photoURL ?? null,
        minecraftUsername: friend.minecraftUsername ?? null,
        addedAt: serverTimestamp(),
      })
      setAddMsg({ type: 'ok', text: `¡${friend.displayName} añadido!` })
    } catch {
      setAddMsg({ type: 'err', text: 'Error al añadir.' })
    }
  }

  async function removeFriend(uid) {
    await deleteDoc(doc(db, 'users', user.uid, 'friends', uid))
  }

  async function openChat(friendUid) {
    const cid = chatId(user.uid, friendUid)
    const friend = friends.find(f => f.uid === friendUid)
    const chatRef = doc(db, 'chats', cid)
    const snap = await getDoc(chatRef)
    if (!snap.exists()) {
      await setDoc(chatRef, {
        members: [user.uid, friendUid].sort(),
        memberNames: { [user.uid]: profile?.displayName ?? 'Tú', [friendUid]: friend?.displayName ?? '?' },
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        lastMessage: '',
      })
    }
    setOpenChatId(cid)
    setTab('chat')
  }

  async function sendMessage(e) {
    e.preventDefault()
    if (!msgText.trim() || !openChatId) return
    const text = msgText.trim()
    setMsgText('')
    const chatRef = doc(db, 'chats', openChatId)
    await addDoc(collection(db, 'chats', openChatId, 'messages'), {
      sender: user.uid,
      senderName: profile?.displayName ?? 'Tú',
      text,
      createdAt: serverTimestamp(),
    })
    await setDoc(chatRef, { lastMessage: text, lastMessageAt: serverTimestamp() }, { merge: true })
  }

  function copyMyLink() {
    const url = `${window.location.origin}/friends/${user.uid}`
    navigator.clipboard.writeText(url)
    setCopyFriendLink(true)
    setTimeout(() => setCopyFriendLink(false), 2000)
  }

  if (authLoading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)' }}>Cargando...</div>
  if (!user) return null

  // ── render ─────────────────────────────────────────────────────────────────

  const myName   = profile?.profileName || profile?.username || 'Sin nombre'
  const myHandle = profile?.username   || null
  const myAvatar = profile?.photoURL ?? (profile?.minecraftUUID ? minecraftHead(profile.minecraftUUID) : null)

  return (
    <div style={{ paddingTop: 60, minHeight: '100vh', maxWidth: 900, margin: '0 auto', padding: '60px 16px 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, marginTop: 20 }}>
        <Avatar src={myAvatar} name={myName} size={48} />
        <div>
          <h1 style={{ fontFamily: 'Rajdhani, sans-serif', fontSize: 22, fontWeight: 700 }}>{myName}</h1>
          {myHandle && <p style={{ fontSize: 12, color: 'var(--muted)' }}>{myHandle}</p>}
        </div>
        <button onClick={copyMyLink} style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 9, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--sub)', fontSize: 13, cursor: 'pointer' }}>
          {copyFriendLink ? '¡Copiado!' : '🔗 Mi enlace de amigo'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[['friends', '👥 Amigos'], ['add', '➕ Añadir'], ['chat', '💬 Chat']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
            color: tab === key ? 'var(--accent2)' : 'var(--muted)',
            borderBottom: tab === key ? '2px solid var(--accent2)' : '2px solid transparent',
            fontSize: 14, fontWeight: tab === key ? 600 : 400, marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* FRIENDS TAB */}
      {tab === 'friends' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {friends.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)', fontSize: 14 }}>
              <p style={{ marginBottom: 8 }}>Aún no tienes amigos añadidos.</p>
              <button onClick={() => setTab('add')} style={{ color: 'var(--accent2)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Añadir tu primer amigo →</button>
            </div>
          ) : friends.map(f => {
            const p = presence[f.uid]
            const head = f.minecraftUsername ? minecraftHead(f.minecraftUUID) : null
            return (
              <div key={f.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
                <Avatar src={head ?? f.photoURL} name={f.displayName} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{f.displayName}</p>
                  <p style={{ fontSize: 12, color: p?.playing ? '#22c55e' : p?.online ? '#60a5fa' : 'var(--muted)' }}>
                    {p?.playing ? '🎮 Jugando ahora' : p?.online ? '🟢 En línea' : '⚫ Desconectado'}
                  </p>
                </div>
                <button onClick={() => openChat(f.uid)} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>Chat</button>
                <button onClick={() => removeFriend(f.uid)} title="Eliminar amigo" style={{ padding: '6px', borderRadius: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ADD FRIEND TAB */}
      {tab === 'add' && (
        <div style={{ maxWidth: 480 }}>
          <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 16 }}>Busca a alguien por su nombre de usuario de la plataforma, o pídele que comparta su enlace de amigo.</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchUser()}
              placeholder="Nombre de usuario..."
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
            <button onClick={searchUser} disabled={searching} style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 14, cursor: 'pointer' }}>
              {searching ? '...' : 'Buscar'}
            </button>
          </div>
          {addMsg && <p style={{ fontSize: 13, color: addMsg.type === 'ok' ? '#4ade80' : '#f87171', marginBottom: 12 }}>{addMsg.text}</p>}
          {searchResult && searchResult.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin resultados.</p>}
          {searchResult && searchResult.map(u => (
            <div key={u.uid} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
              <Avatar src={u.photoURL} name={u.displayName} size={36} />
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{u.displayName}</span>
              <button onClick={() => addFriend(u)} style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>Añadir</button>
            </div>
          ))}
        </div>
      )}

      {/* CHAT TAB */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', height: 500, border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {/* Conversations list */}
          <div style={{ width: 220, borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg2)' }}>
            {chats.length === 0 && <p style={{ padding: 16, fontSize: 13, color: 'var(--muted)' }}>Sin conversaciones aún.</p>}
            {chats.map(c => {
              const otherUid = c.members.find(m => m !== user.uid)
              const name = c.memberNames?.[otherUid] ?? 'Desconocido'
              return (
                <button key={c.id} onClick={() => setOpenChatId(c.id)} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', background: openChatId === c.id ? 'var(--card)' : 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{name}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage || '…'}</p>
                </button>
              )
            })}
          </div>

          {/* Messages pane */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {!openChatId ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 14 }}>
                Selecciona o abre un chat desde la lista de amigos
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {messages.map(m => {
                    const mine = m.sender === user.uid
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '70%', padding: '8px 12px', borderRadius: 12, background: mine ? 'var(--accent)' : 'var(--card)', color: '#fff', fontSize: 13, lineHeight: 1.5 }}>
                          {!mine && <p style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginBottom: 2 }}>{m.senderName}</p>}
                          {m.text}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={msgEndRef} />
                </div>
                <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                  <input value={msgText} onChange={e => setMsgText(e.target.value)} placeholder="Escribe un mensaje..."
                    style={{ flex: 1, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                  <button type="submit" style={{ padding: '9px 16px', borderRadius: 10, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, cursor: 'pointer' }}>Enviar</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}