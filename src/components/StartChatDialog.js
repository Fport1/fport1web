'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/components/auth-context'
import {
  collection, query, orderBy, startAt, endAt,
  limit as qLimit, getDocs,
} from 'firebase/firestore'
import { XMarkIcon, UserGroupIcon } from '@heroicons/react/24/outline'

function Avatar({ src, name = '', size = 40 }) {
  const [err, setErr] = useState(false)
  const initial = name ? name.trim()[0].toUpperCase() : '?'
  if (src && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} onError={() => setErr(true)}
        className="rounded-full object-cover shrink-0 border border-[var(--border)]"
        style={{ width: size, height: size }} />
    )
  }
  return (
    <div style={{ width: size, height: size, background: 'var(--accent)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initial}
    </div>
  )
}

function UserRow({ u, selected, onToggle, multi = false }) {
  const name = u?.profileName || u?.usernameSlug || 'Usuario'
  const avatar = u?.photoURL || ''
  return (
    <button
      onClick={() => onToggle(u.uid)}
      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, borderRadius: 12, border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, padding: '10px 12px', background: selected ? 'rgba(124,58,237,.1)' : 'none', cursor: 'pointer', transition: 'all .15s' }}
    >
      <Avatar src={avatar} name={name} size={38} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {!!u?.usernameSlug && (
          <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{u.usernameSlug}</div>
        )}
      </div>
      {multi && (
        <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${selected ? 'var(--accent)' : 'rgba(255,255,255,.3)'}`, background: selected ? 'var(--accent)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
          {selected && <span style={{ fontSize: 10, color: '#fff', fontWeight: 700 }}>✓</span>}
        </div>
      )}
    </button>
  )
}

export default function StartChatDialog({ open, onClose, onPick, onPickGroup, limit = 20 }) {
  const { user } = useAuth()
  const [tab, setTab] = useState('direct')
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedUid, setSelectedUid] = useState(null)
  const [selectedUids, setSelectedUids] = useState([])
  const [selectedUsersMap, setSelectedUsersMap] = useState({})
  const [groupName, setGroupName] = useState('')

  useEffect(() => {
    if (!open) {
      setQ(''); setResults([]); setSelectedUid(null)
      setSelectedUids([]); setSelectedUsersMap({}); setGroupName(''); setTab('direct')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function run() {
      const term = (q || '').trim().toLowerCase().replace(/^@/, '')
      if (!term) { setResults([]); return }
      setLoading(true)
      try {
        const snap = await getDocs(
          query(
            collection(db, 'users'),
            orderBy('usernameSlug'),
            startAt(term),
            endAt(term + ''),
            qLimit(limit)
          )
        )
        if (!cancelled) {
          setResults(snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.uid !== user?.uid))
        }
      } catch (e) {
        console.warn('[search users]', e?.code, e?.message)
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const t = setTimeout(run, 150)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, open, limit, user?.uid])

  const toggleGroup = (uid) => {
    setSelectedUids(prev => {
      if (prev.includes(uid)) return prev.filter(id => id !== uid)
      const u = results.find(r => r.uid === uid)
      if (u) setSelectedUsersMap(m => ({ ...m, [uid]: u }))
      return [...prev, uid]
    })
  }

  const canAcceptDirect = !!selectedUid
  const canAcceptGroup = selectedUids.length >= 1 && groupName.trim().length >= 1

  const handleAccept = () => {
    if (tab === 'direct' && canAcceptDirect) onPick?.(selectedUid)
    else if (tab === 'group' && canAcceptGroup) onPickGroup?.({ groupName: groupName.trim(), uids: selectedUids })
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--bg3)',
    color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
    transition: 'border-color .15s',
  }

  if (!open) return null

  const canAccept = tab === 'direct' ? canAcceptDirect : canAcceptGroup

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div style={{ position: 'relative', width: '100%', maxWidth: 480, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 20, padding: 24, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.6)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Nueva conversación</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sub)', transition: 'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <XMarkIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
          {[['direct', 'Chat directo'], ['group', 'Crear grupo']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid var(--border)', background: tab === key ? 'var(--accent)' : 'var(--bg3)', color: tab === key ? '#fff' : 'var(--sub)', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {key === 'group' && <UserGroupIcon style={{ width: 14, height: 14 }} />}
              {label}
            </button>
          ))}
        </div>

        {tab === 'group' && (
          <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nombre del grupo…" maxLength={60}
            style={{ ...inputStyle, marginBottom: 12 }} />
        )}

        {tab === 'group' && selectedUids.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {selectedUids.map(uid => {
              const u = selectedUsersMap[uid] || results.find(r => r.uid === uid)
              const name = u?.profileName || u?.usernameSlug || uid
              return (
                <span key={uid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 99, background: 'rgba(124,58,237,.15)', border: '1px solid rgba(124,58,237,.4)', color: 'var(--accent2)', fontSize: 12, padding: '3px 10px' }}>
                  {name}
                  <button onClick={() => toggleGroup(uid)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, marginLeft: 2, lineHeight: 1 }}>×</button>
                </span>
              )
            })}
          </div>
        )}

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar @usuario…"
          style={{ ...inputStyle, marginBottom: 12 }}
          onFocus={e => e.target.style.borderColor = 'var(--accent)'}
          onBlur={e => e.target.style.borderColor = 'var(--border)'} />

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {loading && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 4px' }}>Buscando…</div>}
          {!loading && !results.length && q.trim() && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 4px' }}>Sin resultados.</div>}
          {results.map(u => tab === 'direct' ? (
            <UserRow key={u.uid} u={u} selected={selectedUid === u.uid} onToggle={uid => setSelectedUid(prev => prev === uid ? null : uid)} />
          ) : (
            <UserRow key={u.uid} u={u} selected={selectedUids.includes(u.uid)} onToggle={toggleGroup} multi />
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose}
            style={{ padding: '9px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'none', color: 'var(--sub)', fontSize: 13, cursor: 'pointer', transition: 'background .15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            Cancelar
          </button>
          <button onClick={handleAccept} disabled={!canAccept}
            style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: canAccept ? 'var(--accent)' : 'var(--bg3)', color: canAccept ? '#fff' : 'var(--muted)', fontSize: 13, fontWeight: 600, cursor: canAccept ? 'pointer' : 'not-allowed', transition: 'background .15s', boxShadow: canAccept ? '0 0 20px rgba(124,58,237,.3)' : 'none' }}>
            {tab === 'group' ? 'Crear grupo' : 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}
