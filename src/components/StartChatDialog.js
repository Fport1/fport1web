'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/firebase'
import { useAuth } from '@/components/auth-context'
import {
  collection, query, orderBy, startAt, endAt,
  limit as qLimit, getDocs,
} from 'firebase/firestore'
import { XMarkIcon, UserGroupIcon } from '@heroicons/react/24/outline'

function Avatar({ src, alt = '', size = 40 }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || '/favicon.ico'}
      alt={alt}
      className="rounded-full border border-white/10 object-cover shrink-0"
      style={{ width: size, height: size }}
    />
  )
}

function UserRow({ u, selected, onToggle, multi = false }) {
  const name = u?.profileName || u?.usernameSlug || 'Usuario'
  const avatar = u?.photoURL || ''
  return (
    <button
      onClick={() => onToggle(u.uid)}
      className={`w-full text-left flex items-center gap-3 rounded-xl border px-3 py-3 transition cursor-pointer ${
        selected ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-white/10 hover:bg-white/5'
      }`}
    >
      <Avatar src={avatar} alt={name} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{name}</div>
        {!!u?.usernameSlug && (
          <div className="text-sm opacity-70 truncate">@{u.usernameSlug}</div>
        )}
      </div>
      {multi && (
        <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition ${
          selected ? 'bg-emerald-500 border-emerald-500' : 'border-white/30'
        }`}>
          {selected && <span className="text-[10px] text-white font-bold">✓</span>}
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

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative mx-auto mt-10 w-full max-w-lg rounded-2xl border border-white/10 bg-black/90 p-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Nueva conversación</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer transition">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('direct')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${tab === 'direct' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
            Chat directo
          </button>
          <button onClick={() => setTab('group')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition cursor-pointer flex items-center justify-center gap-2 ${tab === 'group' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
            <UserGroupIcon className="w-4 h-4" />
            Crear grupo
          </button>
        </div>

        {tab === 'group' && (
          <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nombre del grupo…" maxLength={60}
            className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-2.5 outline-none mb-3 text-sm placeholder:text-white/35 focus:border-white/30 transition" />
        )}

        {tab === 'group' && selectedUids.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedUids.map(uid => {
              const u = selectedUsersMap[uid] || results.find(r => r.uid === uid)
              const name = u?.profileName || u?.usernameSlug || uid
              return (
                <span key={uid} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs px-2.5 py-1">
                  {name}
                  <button onClick={() => toggleGroup(uid)} className="ml-0.5 hover:text-white cursor-pointer">×</button>
                </span>
              )
            })}
          </div>
        )}

        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar @usuario…"
          className="w-full rounded-xl border border-white/10 bg-transparent px-4 py-2.5 outline-none text-sm placeholder:text-white/35 focus:border-white/30 transition mb-3" />

        <div className="flex-1 overflow-y-auto space-y-1.5">
          {loading && <div className="text-sm opacity-70 px-2 py-2">Buscando…</div>}
          {!loading && !results.length && q.trim() && <div className="text-sm opacity-70 px-2 py-2">Sin resultados.</div>}
          {results.map(u => tab === 'direct' ? (
            <UserRow key={u.uid} u={u} selected={selectedUid === u.uid} onToggle={uid => setSelectedUid(prev => prev === uid ? null : uid)} />
          ) : (
            <UserRow key={u.uid} u={u} selected={selectedUids.includes(u.uid)} onToggle={toggleGroup} multi />
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/10 cursor-pointer text-sm transition">Cancelar</button>
          <button onClick={handleAccept} disabled={tab === 'direct' ? !canAcceptDirect : !canAcceptGroup}
            className={`px-4 py-2 rounded-xl text-sm cursor-pointer transition ${(tab === 'direct' ? canAcceptDirect : canAcceptGroup) ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-emerald-600/30 text-white/50 cursor-not-allowed'}`}>
            {tab === 'group' ? 'Crear grupo' : 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}
