'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import PerfilNav from '@/components/PerfilNav'
import AvisoFallo from '@/components/AvisoFallo'
import { suscribir } from '@/lib/suscribir'
import { registrarFallo } from '@/lib/fallos'
import { db } from '@/lib/firebase'
import {
  collection, doc, documentId, getDocs, limit, orderBy,
  query, updateDoc, where, writeBatch,
} from 'firebase/firestore'

function timeAgo(ts) {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return 'ahora'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

/** Qué dice cada notificación y a dónde lleva. */
function notifInfo(n) {
  switch (n.type) {
    case 'friend_request':
      return { text: 'te envió una solicitud de amistad', href: '/perfil' }
    case 'friend_accept':
      return { text: 'aceptó tu solicitud de amistad', href: n.fromUid ? `/friends/${n.fromUid}` : '/perfil' }
    case 'message':
      return {
        text: n.context?.isGroup
          ? <>te escribió en <span className="font-semibold text-white/80">{n.context?.groupName || 'un grupo'}</span></>
          : 'te envió un mensaje',
        href: n.context?.cid ? `/mensajes?c=${n.context.cid}` : '/mensajes',
      }
    case 'group_added':
      return {
        text: <>te añadió al grupo <span className="font-semibold text-white/80">{n.context?.groupName || 'un grupo'}</span></>,
        href: n.context?.cid ? `/mensajes?c=${n.context.cid}` : '/mensajes',
      }
    case 'group_admin':
      return {
        text: <>te hizo administrador de <span className="font-semibold text-white/80">{n.context?.groupName || 'un grupo'}</span></>,
        href: n.context?.cid ? `/mensajes?c=${n.context.cid}` : '/mensajes',
      }
    case 'doomsday_access':
      return { text: 'te dio acceso a la página de Avengers: Doomsday', href: '/doomsday' }
    default:
      return { text: n.context?.text || 'tienes una novedad', href: n.context?.href || '/perfil' }
  }
}

function NotifRow({ n, onRead, autor }) {
  // La notificación guarda una copia de los datos del momento en que se creó.
  // Sirve de respaldo, pero manda el dato actual: si la persona cambió de
  // avatar o de nombre, lo viejo se ve desactualizado.
  const name = autor?.profileName || n.context?.fromProfileName || 'Alguien'
  const photo = autor?.photoURL || n.context?.fromPhotoURL || ''
  const perfilHref = n.fromUid ? `/friends/${n.fromUid}` : '#'
  const { text, href } = notifInfo(n)

  return (
    <div
      className={`flex items-start gap-3 px-3 py-3 rounded-xl transition-colors ${!n.read ? 'bg-white/5' : 'hover:bg-white/3'}`}
      onClick={() => !n.read && onRead(n.id)}
    >
      <Link href={perfilHref} className="shrink-0 mt-0.5">
        <div className="h-10 w-10 rounded-full overflow-hidden bg-neutral-800 ring-1 ring-white/10 flex items-center justify-center text-sm">
          {photo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={photo} alt={name} className="h-full w-full object-cover" />
            : <span>{(name[0] || '?').toUpperCase()}</span>}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          <Link href={perfilHref} className="font-semibold hover:underline">{name}</Link>
          {' '}{text}
        </p>
        <p className="mt-0.5 text-xs text-white/40">{timeAgo(n.createdAt)}</p>
      </div>

      <Link href={href} className="shrink-0 mt-1 text-xs text-violet-400 hover:text-violet-300 hover:underline transition">
        Ver
      </Link>

      {!n.read && <span className="mt-2 h-2 w-2 rounded-full bg-violet-400 shrink-0" />}
    </div>
  )
}

export default function NotificacionesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [notifs, setNotifs] = useState([])
  const [loadingNotifs, setLoadingNotifs] = useState(true)
  const [fallo, setFallo] = useState(null)
  const [reintento, setReintento] = useState(0)
  const [autores, setAutores] = useState({})
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (!user?.uid) return
    const q = query(
      collection(db, 'notifications'),
      where('toUid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(60),
    )
    return suscribir({
      consulta: q,
      donde: 'notificaciones',
      que: 'tus notificaciones',
      alLlegar: snap => {
        setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoadingNotifs(false)
        setFallo(null)
      },
      alFallar: f => { setFallo(f); setLoadingNotifs(false) },
    })
  }, [user?.uid, reintento])

  // Trae nombre y foto ACTUALES de quien generó cada notificación.
  useEffect(() => {
    const pendientes = [...new Set(notifs.map(n => n.fromUid).filter(Boolean))]
      .filter(uid => !(uid in autores))
    if (pendientes.length === 0) return

    let vivo = true
    ;(async () => {
      const encontrados = {}
      // `in` admite como mucho 10 valores por consulta.
      for (let i = 0; i < pendientes.length; i += 10) {
        const lote = pendientes.slice(i, i + 10)
        try {
          const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', lote)))
          snap.forEach(d => {
            const u = d.data() || {}
            encontrados[d.id] = {
              photoURL: u.photoURL ?? '',
              profileName: u.profileName ?? '',
              usernameSlug: u.usernameSlug ?? '',
            }
          })
        } catch (e) {
          registrarFallo('notificaciones:autores', e, 'los perfiles')
        }
        // Los que no aparezcan (cuenta borrada) se marcan igual para no pedirlos en bucle.
        lote.forEach(uid => { if (!(uid in encontrados)) encontrados[uid] = null })
      }
      if (vivo && Object.keys(encontrados).length) {
        setAutores(prev => ({ ...prev, ...encontrados }))
      }
    })()
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifs])

  const markOne = useCallback(id => {
    updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => {})
  }, [])

  const markAll = async () => {
    if (!user?.uid) return
    const unread = notifs.filter(n => !n.read)
    if (!unread.length) return
    setMarkingAll(true)
    const batch = writeBatch(db)
    unread.forEach(n => batch.update(doc(db, 'notifications', n.id), { read: true }))
    await batch.commit().catch(() => {})
    setMarkingAll(false)
  }

  const unreadCount = notifs.filter(n => !n.read).length

  if (loading || !user) return null

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-4 pt-20 pb-8 md:px-6">
        <div className="flex gap-6">
          <PerfilNav className="hidden md:block md:w-[260px] shrink-0" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-xl font-semibold">Notificaciones</h1>
              {unreadCount > 0 && (
                <button
                  onClick={markAll}
                  disabled={markingAll}
                  className="text-xs text-white/50 hover:text-white/80 cursor-pointer transition disabled:opacity-40"
                >
                  {markingAll ? 'Marcando…' : 'Marcar todo como leído'}
                </button>
              )}
            </div>

            {/* Si ya hay notificaciones a la vista, un fallo de refresco se avisa
                arriba sin esconder lo que ya se cargó. */}
            {fallo && notifs.length > 0 && (
              <AvisoFallo fallo={fallo} onReintentar={() => setReintento(n => n + 1)} forma="linea" className="mb-2" />
            )}

            {loadingNotifs ? (
              <div className="flex items-center gap-2 text-sm text-white/50 py-8 justify-center">
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Cargando…
              </div>
            ) : fallo && notifs.length === 0 ? (
              <AvisoFallo
                fallo={fallo}
                onReintentar={() => { setLoadingNotifs(true); setReintento(n => n + 1) }}
                className="my-4"
              />
            ) : notifs.length === 0 ? (
              <div className="py-16 text-center text-white/40 text-sm">
                <p className="text-3xl mb-3">🔔</p>
                <p>Sin notificaciones por ahora.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {notifs.map(n => (
                  <NotifRow key={n.id} n={n} onRead={markOne} autor={autores[n.fromUid]} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
