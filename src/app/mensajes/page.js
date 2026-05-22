'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { db } from '@/lib/firebase'
import { useAuth } from '@/components/auth-context'
import {
  collection, query, where, orderBy, limit, addDoc, serverTimestamp,
  onSnapshot, doc, getDoc, getDocs, updateDoc, writeBatch, deleteDoc,
  deleteField, setDoc, arrayRemove, documentId,
} from 'firebase/firestore'
import { storage } from '@/lib/firebase'
import { ref as sRef, deleteObject, uploadBytes, getDownloadURL } from 'firebase/storage'
import PerfilNav from '@/components/PerfilNav'
import StartChatDialog from '@/components/StartChatDialog'
import { getUserRanks } from '@/lib/acl'
import { encryptMessage, decryptMessage } from '@/lib/crypto'
import { uploadManyAttachments } from '@/lib/uploads'
import clsx from 'clsx'
import {
  EllipsisVerticalIcon, ClipboardIcon, PencilIcon, FaceSmileIcon, TrashIcon,
  CheckIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon,
  ChevronDownIcon, ChevronLeftIcon, LinkIcon, PaperAirplaneIcon, PlusIcon,
  XMarkIcon, Cog6ToothIcon, CameraIcon, FolderOpenIcon, DocumentTextIcon,
} from '@heroicons/react/24/outline'
import { Suspense } from 'react'
import Badges from '@/components/Badges'
import Link from 'next/link'

/* === Share card === */
function ShareCard({ meta }) {
  if (!meta) return null
  const isFolder = meta.shareType === 'folder'
  const href = isFolder ? `/coleccion/${meta.ownerUid}/${meta.folderId}` : `/propuestas?id=${meta.id}`
  const title = isFolder ? (meta.folderName || 'Carpeta') : (meta.titulo || 'Propuesta')
  const subtitle = isFolder ? `${meta.count ?? 0} propuestas` : (meta.norma || '')
  const actionText = isFolder ? 'Ver carpeta →' : 'Ver propuesta →'
  return (
    <Link href={href} className="mt-1 flex items-start gap-2.5 rounded-xl bg-white/8 border border-[var(--border)] p-3 hover:bg-white/12 transition" onClick={e => e.stopPropagation()}>
      <div className="shrink-0 p-1.5 bg-white/10 rounded-lg mt-0.5">
        {isFolder ? <FolderOpenIcon className="w-4 h-4 text-white/60" /> : <DocumentTextIcon className="w-4 h-4 text-white/60" />}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {subtitle && <p className="text-xs text-white/50">{subtitle}</p>}
        <p className="text-xs text-[var(--accent2)] mt-1">{actionText}</p>
      </div>
    </Link>
  )
}

/* === MenuItem global === */
function MenuItem({ icon: Icon, label, onClick, disabled, danger }) {
  return (
    <button type="button"
      className={clsx('w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition',
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
        danger && !disabled ? 'hover:bg-red-500/10 text-red-400' : !disabled ? 'hover:bg-white/8' : '')}
      onClick={disabled ? undefined : onClick}>
      <Icon className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </button>
  )
}

/* ===== Lightbox ===== */
const __LB_CSS = `
#chat-lb{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.92)}
#chat-lb.open{display:flex}
#chat-lb img{max-width:92vw;max-height:92vh;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.6)}
#chat-lb .close{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);border-radius:9999px;padding:6px 10px;color:#fff;cursor:pointer;backdrop-filter:saturate(140%) blur(6px)}
#chat-lb .close:hover{background:rgba(255,255,255,.22)}
`
const __CHAT_CSS = `
@keyframes floatHeart{0%{opacity:1;transform:scale(1) translateY(0) rotate(-10deg)}40%{opacity:1;transform:scale(1.6) translateY(-40px) rotate(8deg)}100%{opacity:0;transform:scale(0.8) translateY(-90px) rotate(-5deg)}}
.chat-float-heart{pointer-events:none;position:absolute;font-size:28px;animation:floatHeart .8s ease-out forwards;z-index:60;user-select:none}
@keyframes swipeHint{0%{transform:translateX(0)}40%{transform:translateX(18px)}100%{transform:translateX(0)}}
.chat-swipe-anim{animation:swipeHint .25s ease-out}
@keyframes typingDot{0%,80%,100%{transform:scale(0.6);opacity:.4}40%{transform:scale(1);opacity:1}}
.typing-dot{display:inline-block;width:6px;height:6px;border-radius:9999px;background:currentColor;animation:typingDot 1.2s infinite ease-in-out}
.typing-dot:nth-child(2){animation-delay:.2s}
.typing-dot:nth-child(3){animation-delay:.4s}
@keyframes slideInUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.chat-slide-in{animation:slideInUp .18s ease-out}
@keyframes popIn{0%{transform:scale(0.6);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
.chat-pop-in{animation:popIn .22s cubic-bezier(.34,1.56,.64,1)}
@keyframes msgFlash{0%{background:rgba(250,204,21,.28);border-radius:14px}55%{background:rgba(250,204,21,.18);border-radius:14px}100%{background:transparent}}
.msg-flash{animation:msgFlash 1.4s ease-out forwards}
`
function injectChatCss() {
  if (typeof document === 'undefined') return
  if (document.getElementById('chat-anim-css')) return
  const s = document.createElement('style'); s.id = 'chat-anim-css'; s.textContent = __CHAT_CSS
  document.head.appendChild(s)
}
if (typeof window !== 'undefined') injectChatCss()
function injectLbCss() {
  if (document.getElementById('chat-lb-css')) return
  const s = document.createElement('style'); s.id = 'chat-lb-css'; s.textContent = __LB_CSS
  document.head.appendChild(s)
}
function ensureLb() {
  injectLbCss()
  let el = document.getElementById('chat-lb')
  if (!el) {
    el = document.createElement('div'); el.id = 'chat-lb'
    el.addEventListener('click', e => { if (e.target.id === 'chat-lb') closeLb() })
    document.body.appendChild(el)
  }
  return el
}
export function openLb(src, alt = '') {
  const el = ensureLb()
  el.innerHTML = `<img src="${src}" alt="${(alt || '').replace?.(/"/g, '&quot;')}"><button class="close" aria-label="Cerrar">✕</button>`
  el.querySelector('.close').onclick = closeLb
  el.classList.add('open')
}
export function closeLb() {
  const el = document.getElementById('chat-lb')
  if (!el) return
  el.classList.remove('open'); el.innerHTML = ''
}

function getStorageRefFromAttachment(att) {
  if (att?.path) return sRef(storage, att.path)
  if (att?.url) {
    try { return sRef(storage, att.url) } catch (_) {
      try {
        const m = att.url.match(/\/o\/([^?]+)/)
        if (m && m[1]) return sRef(storage, decodeURIComponent(m[1]))
      } catch (_) { }
    }
  }
  return null
}

async function openViewOnceAndDestroy(convoId, msg) {
  try {
    const imgs = (msg.attachments || []).filter(a => a?.kind === 'image')
    if (!imgs.length) return
    const first = imgs[0]
    openLb(first.url, msg.text || 'Foto')
    const overlay = document.getElementById('chat-lb')
    if (!overlay) return
    const btn = overlay.querySelector('.close')
    const closeAndDestroy = async () => {
      try {
        const refToDelete = getStorageRefFromAttachment(first)
        if (refToDelete) { try { await deleteObject(refToDelete) } catch (_) { } }
        const mref = doc(db, 'conversations', convoId, 'messages', msg.id)
        await updateDoc(mref, { attachments: [], 'meta.viewOnceOpenedAt': serverTimestamp(), type: 'viewonce_opened', text: msg.text || 'Foto' })
      } catch (_) { }
      closeLb()
      btn?.removeEventListener('click', closeAndDestroy)
      overlay?.removeEventListener('click', backdropClose)
      window.removeEventListener('keydown', escClose)
    }
    const backdropClose = e => { if (e?.target?.id === 'chat-lb') closeAndDestroy() }
    const escClose = e => { if (e.key === 'Escape') closeAndDestroy() }
    if (btn) btn.addEventListener('click', closeAndDestroy)
    overlay.addEventListener('click', backdropClose)
    window.addEventListener('keydown', escClose)
  } catch (_) { }
}

if (typeof window !== 'undefined') {
  window.openViewOnceAndDestroy = openViewOnceAndDestroy
  window.__openVO = openViewOnceAndDestroy
}

/* ===== utilidades ===== */
function tsToDate(x) {
  if (!x) return null
  if (x.toDate) return x.toDate()
  if (x instanceof Date) return x
  const n = +x
  return Number.isFinite(n) ? new Date(n) : null
}
function formatRelativeEs(date, now = new Date()) {
  if (!date) return ''
  const diff = date - now, s = Math.round(diff / 1000)
  const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
  if (Math.abs(s) < 60) return rtf.format(Math.round(s), 'second')
  const m = Math.round(s / 60)
  if (Math.abs(m) < 60) return rtf.format(m, 'minute')
  const h = Math.round(m / 60)
  if (Math.abs(h) < 24) return rtf.format(h, 'hour')
  const d = Math.round(h / 24)
  if (Math.abs(d) < 30) return rtf.format(d, 'day')
  const mo = Math.round(d / 30)
  if (Math.abs(mo) < 12) return rtf.format(mo, 'month')
  return rtf.format(Math.round(mo / 12), 'year')
}
function formatDayLabel(d) {
  const dias = ['dom.', 'lun.', 'mar.', 'mié.', 'jue.', 'vie.', 'sáb.']
  const m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${dias[d.getDay()]}., ${d.getDate()} ${m[d.getMonth()]}`
}
function sameYMD(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

async function run(name, fn) {
  try { return await fn() } catch (e) {
    console.error(`[FIRESTORE ERROR] ${name}`, e?.code, e?.message)
    alert(`Error en ${name}: ${e?.code || 'desconocido'}`)
    throw e
  }
}

/* ===== UI básicos ===== */
const IconSearch = p => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" {...p}>
    <path d="M21 21l-4.3-4.3m1.6-4.7a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)
const IconMore = p => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" {...p}>
    <circle cx="5" cy="12" r="2" fill="currentColor" />
    <circle cx="12" cy="12" r="2" fill="currentColor" />
    <circle cx="19" cy="12" r="2" fill="currentColor" />
  </svg>
)
function Avatar({ src, alt = '', size = 36 }) {
  const [err, setErr] = useState(false)
  const initial = alt ? alt.trim()[0].toUpperCase() : '?'
  if (src && !err) {
    return <img src={src} alt={alt} onError={() => setErr(true)} className="rounded-full border border-[var(--border)] object-cover shrink-0" style={{ width: size, height: size }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {initial}
    </div>
  )
}
function Chip({ active, children, onClick }) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded-full text-xs border border-[var(--border)] cursor-pointer transition ${active ? 'bg-white/10' : 'hover:bg-white/10'}`}>
      {children}
    </button>
  )
}
function DateDivider({ date }) {
  return <div className="text-center my-6"><span className="text-xs opacity-70">{formatDayLabel(date)}</span></div>
}

/* ===== Burbuja ===== */
const EMOJI_REACTIONS = [
  { key: 'heart', emoji: '❤️' }, { key: 'laugh', emoji: '😂' }, { key: 'wow', emoji: '😮' },
  { key: 'sad', emoji: '😢' }, { key: 'angry', emoji: '😡' }, { key: 'like', emoji: '👍' },
]

function Bubble({ mine, children, time, msgId, msgType, convoId, db, userUid, reactions, editedAt, forwarded, status = 'sent', onRetry, errorMessage, replyTo, onReply, onJumpToReply, onForward, selectMode, selected, onSelect }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [hiddenForMe, setHiddenForMe] = useState(false)
  const [showError, setShowError] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const editRef = useRef(null)
  const [reactOpen, setReactOpen] = useState(false)
  const [reactCoords, setReactCoords] = useState({ top: 0, left: 0 })
  const [floatingHearts, setFloatingHearts] = useState([])
  const bubbleRef = useRef(null)
  const swipeRef = useRef({ startX: 0, startY: 0, swiping: false })
  const [swipeOffset, setSwipeOffset] = useState(0)
  const menuBtnRef = useRef(null)
  const menuRef = useRef(null)
  const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 })

  function myReaction(key) { return !!reactions?.[key]?.[userUid] }
  function reactionCount(key) { return reactions?.[key] ? Object.keys(reactions[key]).length : 0 }
  const hasAnyReaction = EMOJI_REACTIONS.some(r => reactionCount(r.key) > 0)

  function openReactPopover() {
    const btn = menuBtnRef.current
    if (!btn) return
    const br = btn.getBoundingClientRect(), vw = window.innerWidth
    const popW = 292, popH = 54, gap = 10
    let left = mine ? br.right - popW : br.left
    left = Math.max(8, Math.min(left, vw - popW - 8))
    let top = br.top - popH - gap
    if (top < 8) top = br.bottom + gap
    setReactCoords({ top, left }); setReactOpen(true); setMenuOpen(false)
  }

  async function toggleReaction(key) {
    setReactOpen(false)
    if (!db || !convoId || !msgId || !userUid) return
    if (String(msgId).startsWith('local-')) return
    try {
      const mref = doc(db, 'conversations', convoId, 'messages', msgId)
      const field = `reactions.${key}.${userUid}`
      await updateDoc(mref, { [field]: myReaction(key) ? deleteField() : true })
    } catch (e) { console.error('Error reaccionando:', e) }
  }

  function spawnFloatingHeart(e) {
    injectChatCss()
    const rect = bubbleRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = (e?.clientX ?? rect.left + rect.width / 2) - rect.left
    const y = (e?.clientY ?? rect.top + rect.height / 2) - rect.top
    const id = Date.now() + Math.random()
    setFloatingHearts(prev => [...prev, { id, x, y }])
    setTimeout(() => setFloatingHearts(prev => prev.filter(h => h.id !== id)), 850)
  }

  function handleDoubleClick(e) {
    if (selectMode) return
    spawnFloatingHeart(e); toggleReaction('heart')
  }

  function onTouchStart(e) {
    if (selectMode) return
    const t = e.touches[0]
    swipeRef.current = { startX: t.clientX, startY: t.clientY, swiping: true, triggered: false }
  }
  function onTouchMove(e) {
    if (!swipeRef.current.swiping) return
    const t = e.touches[0]
    const dx = t.clientX - swipeRef.current.startX
    const dy = Math.abs(t.clientY - swipeRef.current.startY)
    if (dy > 20) { swipeRef.current.swiping = false; setSwipeOffset(0); return }
    if (dx > 0 && dx < 80) setSwipeOffset(dx * 0.5)
    if (dx >= 65 && !swipeRef.current.triggered) {
      swipeRef.current.triggered = true; onReply?.(); setSwipeOffset(0)
      swipeRef.current.swiping = false
      if (navigator.vibrate) navigator.vibrate(30)
    }
  }
  function onTouchEnd() { swipeRef.current.swiping = false; setSwipeOffset(0) }

  const canEdit = mine && !String(msgId || '').startsWith('local-') && !!db && msgType !== 'share'

  const textToCopy = typeof children === 'string' ? children : (Array.isArray(children) ? children.join('') : String(children ?? ''))

  function startEdit() { setEditText(textToCopy); setEditing(true); setMenuOpen(false) }

  async function submitEdit() {
    const newText = editText.trim()
    if (!newText || !canEdit) { setEditing(false); return }
    if (newText === textToCopy) { setEditing(false); return }
    try {
      await updateDoc(doc(db, 'conversations', convoId, 'messages', msgId), { text: newText, editedAt: serverTimestamp() })
    } catch (e) { console.error('Error editando:', e) }
    setEditing(false)
  }

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus()
      const len = editRef.current.value.length
      editRef.current.setSelectionRange(len, len)
    }
  }, [editing])

  useEffect(() => {
    const onCloseOther = e => { if (e.detail?.key !== msgId && menuOpen) setMenuOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('dc-close-other-menus', onCloseOther)
    document.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('dc-close-other-menus', onCloseOther); document.removeEventListener('keydown', onKey) }
  }, [menuOpen, msgId])

  useEffect(() => {
    if (!menuOpen) return
    const place = () => {
      const btn = menuBtnRef.current, pop = menuRef.current
      if (!btn) return
      const br = btn.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, gap = 8
      const menuW = pop?.offsetWidth || 176, menuH = pop?.offsetHeight || 160
      const openRight = !mine
      let left = openRight ? (br.right + gap) : (br.left - menuW - gap)
      if (openRight) { if (left + menuW > vw - 8) left = vw - menuW - 8; if (left < 8) left = 8 }
      else { if (left < 8) left = 8; if (left + menuW > vw - 8) left = vw - menuW - 8 }
      let top
      if (vh - br.bottom < menuH + gap) top = Math.max(8, br.top - menuH - gap)
      else top = Math.min(vh - menuH - 8, br.bottom + gap)
      setMenuCoords({ top, left })
    }
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [menuOpen, mine])

  if (hiddenForMe) return null

  function countEmojiSeqs(str = '') {
    try {
      const re = /\p{Extended_Pictographic}(?:️|︎)?(?:‍\p{Extended_Pictographic}(?:️|︎)?)*/gu
      const m = str.match(re); return m ? m.length : 0
    } catch { const m = str.match(/([⌚-⌛]|[\uD83C퀀-🛿])/g); return m ? m.length : 0 }
  }
  function isEmojiOnlyText(str = '') {
    const s = (str || '').trim(); if (!s) return false
    try { return /^[\p{Extended_Pictographic}️︎‍\s]+$/u.test(s) }
    catch { const ec = countEmojiSeqs(s); return ec > 0 && !/[A-Za-z0-9]/.test(s) }
  }

  const onlyEmoji = isEmojiOnlyText(textToCopy)
  const emojiCount = onlyEmoji ? countEmojiSeqs(textToCopy) : 0
  let emojiSizeClass = ''
  if (onlyEmoji) {
    if (emojiCount === 1) emojiSizeClass = 'text-[52px] sm:text-[60px]'
    else if (emojiCount === 2) emojiSizeClass = 'text-[40px] sm:text-[46px]'
    else if (emojiCount === 3) emojiSizeClass = 'text-[32px]'
  }
  const emojiLayoutClass = onlyEmoji && emojiCount <= 3 ? 'whitespace-nowrap text-center leading-[1.05]' : ''

  async function handleCopy() {
    try { await navigator.clipboard.writeText(textToCopy); setMenuOpen(false) }
    catch (e) { console.error('No se pudo copiar:', e) }
  }

  async function handleDelete() {
    if (mine) {
      if (db && convoId && msgId && !String(msgId).startsWith('local-')) {
        try { await deleteDoc(doc(db, 'conversations', convoId, 'messages', msgId)) }
        catch (e) { console.error('Error eliminando:', e) }
      } else setHiddenForMe(true)
    } else setHiddenForMe(true)
    setMenuOpen(false)
  }

  function StatusIcon() {
    if (!mine) return null
    if (status === 'sending') return <ArrowPathIcon className="w-3.5 h-3.5 ml-1 animate-spin opacity-80" />
    if (status === 'error') return (
      <button type="button" className="ml-1 opacity-90 hover:opacity-100" onClick={() => setShowError(v => !v)}>
        <ExclamationCircleIcon className="w-3.5 h-3.5" />
      </button>
    )
    if (status === 'read') return <span className="ml-1 text-[11px] text-[var(--accent2)] leading-none select-none">✓✓</span>
    return <CheckIcon className="w-3.5 h-3.5 ml-1 opacity-50" />
  }

  return (
    <div className={`w-full flex ${hasAnyReaction ? 'mb-6' : 'mb-2'} ${mine ? 'justify-end' : 'justify-start'} ${selectMode ? 'cursor-pointer' : ''}`} onClick={selectMode ? onSelect : undefined}>
      {selectMode && (
        <div className={`flex items-center ${mine ? 'order-last ml-2' : 'mr-2'}`}>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${selected ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-white/30'}`}>
            {selected && <CheckIcon className="w-3 h-3 text-white" />}
          </div>
        </div>
      )}
      <div className="relative flex items-start">
        <div ref={bubbleRef} data-bubble="true"
          className={`relative group inline-flex flex-col whitespace-pre-wrap ${mine ? 'bg-[var(--accent)] text-white ml-auto' : 'bg-[var(--bg3)] text-neutral-100 mr-auto'} w-fit text-[14px] leading-5 ${selected ? 'ring-2 ring-[var(--accent2)]' : ''} chat-slide-in`}
          onDoubleClick={handleDoubleClick} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
          style={{ borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px', maxWidth: 'min(520px, 70%)', minWidth: editing ? '270px' : '120px', overflowWrap: 'break-word', wordBreak: 'normal', hyphens: 'none', transform: swipeOffset ? `translateX(${mine ? -swipeOffset : swipeOffset}px)` : undefined, transition: swipeOffset ? 'none' : 'transform .18s ease-out' }}>
          {floatingHearts.map(h => <span key={h.id} className="chat-float-heart" style={{ left: h.x - 14, top: h.y - 14 }} aria-hidden>❤️</span>)}
          <button ref={menuBtnRef}
            className={clsx('absolute top-1/2 -translate-y-1/2 z-20 rounded-full p-1.5 hover:bg-white/10 focus:bg-white/10 cursor-pointer opacity-100 lg:opacity-0 lg:group-hover:opacity-100', mine ? '-left-8' : '-right-8')}
            onClick={() => setMenuOpen(v => { const next = !v; if (next) window.dispatchEvent(new CustomEvent('dc-close-other-menus', { detail: { key: msgId } })); return next })}
            aria-label="Más opciones">
            <EllipsisVerticalIcon className="w-5 h-5" />
          </button>
          {forwarded && (
            <div className={`flex items-center gap-1 px-4 pt-2 pb-0 text-[11px] ${mine ? 'opacity-60' : 'opacity-50'}`}>
              <ArrowPathIcon className="w-3 h-3" /><span>Reenviado</span>
            </div>
          )}
          {replyTo && (
            <button type="button" className={clsx('flex items-stretch rounded-t-xl overflow-hidden -mx-0 border-b w-full text-left transition-opacity hover:opacity-80 active:opacity-60 cursor-pointer', mine ? 'border-[var(--accent)]/30' : 'border-[var(--border)]')} onClick={() => onJumpToReply?.(replyTo.id)}>
              <div className={`w-1 flex-shrink-0 ${mine ? 'bg-white/60' : 'bg-[var(--accent2)]'}`} />
              <div className="px-3 py-2 text-[12px] opacity-75 leading-snug max-h-10 overflow-hidden">
                <span className="font-semibold block">{replyTo.senderName}</span>
                <span className="truncate block">{replyTo.text || '📎 adjunto'}</span>
              </div>
            </button>
          )}
          <div className="px-4 py-2 flex flex-col">
            {editing ? (
              <div className="flex flex-col gap-2 min-w-[230px]">
                <textarea ref={editRef} value={editText} onChange={e => setEditText(e.target.value)}
                  className="bg-black/20 rounded-xl px-3 py-2 w-full outline-none resize-none text-[14px] leading-5 min-h-[44px] border border-white/20 focus:border-white/40 transition-colors"
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit() } if (e.key === 'Escape') setEditing(false) }} />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setEditing(false)} className="cursor-pointer px-3 py-1 rounded-lg text-[12px] font-medium opacity-70 hover:opacity-100 hover:bg-white/10 transition">Cancelar</button>
                  <button type="button" onClick={submitEdit} className="cursor-pointer px-3 py-1 rounded-lg text-[12px] font-semibold bg-white/20 hover:bg-white/30 transition">Guardar</button>
                </div>
              </div>
            ) : (
              <div className={clsx(emojiLayoutClass, emojiSizeClass)}>{children}</div>
            )}
            <div className="mt-1 self-end text-[11px] opacity-70 leading-none whitespace-nowrap flex items-center gap-1">
              {editedAt && <span className="opacity-60 italic">editado ·</span>}
              {time}<StatusIcon />
            </div>
          </div>
        </div>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40 cursor-default" aria-hidden="true" onClick={() => setMenuOpen(false)} />
            <div ref={menuRef}
              className={clsx('fixed z-50 w-44 rounded-xl border border-[var(--border)] bg-[var(--bg2)]/95 backdrop-blur shadow-lg p-1 transform-gpu transition-[opacity,transform] duration-150', mine ? 'origin-right' : 'origin-left')}
              role="menu" tabIndex={-1} style={{ top: menuCoords.top, left: menuCoords.left }}>
              <MenuItem icon={ClipboardIcon} label="Copiar" onClick={handleCopy} />
              <MenuItem icon={FaceSmileIcon} label="Reaccionar" onClick={openReactPopover} />
              {onReply && <MenuItem icon={ChevronLeftIcon} label="Responder" onClick={() => { onReply(); setMenuOpen(false) }} />}
              {onForward && <MenuItem icon={ArrowPathIcon} label="Reenviar" onClick={() => { onForward(); setMenuOpen(false) }} />}
              <MenuItem icon={PencilIcon} label="Editar" onClick={startEdit} disabled={!canEdit} />
              <div className="h-px bg-white/10 my-1" />
              <MenuItem icon={TrashIcon} label={mine ? 'Eliminar para ambos' : 'Eliminar para mí'} onClick={handleDelete} danger />
            </div>
          </>
        )}

        {reactOpen && (
          <>
            <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setReactOpen(false)} />
            <div className="fixed z-50 rounded-full border border-[var(--border)] bg-[var(--bg2)]/95 backdrop-blur shadow-lg px-2 py-1 flex items-center gap-0.5" style={{ top: reactCoords.top, left: reactCoords.left }}>
              {EMOJI_REACTIONS.map(({ key, emoji }) => (
                <button key={key} type="button" onClick={() => toggleReaction(key)}
                  className={clsx('w-10 h-10 rounded-full flex items-center justify-center text-[22px] transition-transform hover:scale-125', myReaction(key) ? 'bg-white/15 scale-110' : 'hover:bg-white/10')}>
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}

        {hasAnyReaction && (
          <div className={`absolute -bottom-5 flex gap-0.5 ${mine ? 'right-1' : 'left-1'}`}>
            {EMOJI_REACTIONS.filter(r => reactionCount(r.key) > 0).map(({ key, emoji }) => (
              <button key={key} type="button" onClick={() => toggleReaction(key)}
                className={clsx('flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full border transition',
                  myReaction(key) ? 'bg-[var(--accent)]/30 border-[var(--accent2)]/40 text-white' : 'bg-[var(--bg3)]/80 border-[var(--border)] text-neutral-300 hover:bg-white/10')}>
                <span className="text-[13px]">{emoji}</span>
                {reactionCount(key) > 1 && <span>{reactionCount(key)}</span>}
              </button>
            ))}
          </div>
        )}

        {showError && status === 'error' && mine && (
          <div className="absolute right-0 -bottom-1 translate-y-full z-30 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg2)]/95 backdrop-blur shadow-lg p-3">
            <div className="text-sm mb-2">{errorMessage || 'No se pudo enviar el mensaje.'}</div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-1.5 text-sm rounded-lg border border-[var(--border)] hover:bg-white/10" onClick={() => setShowError(false)}>Cancelar</button>
              <button className="px-3 py-1.5 text-sm rounded-lg bg-green-600 hover:bg-green-500" onClick={() => { setShowError(false); onRetry?.() }}>Reintentar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ===== Categorías de emojis ===== */
const EMOJI_CATS = [
  { label: '😊', title: 'Caras', emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😉','😊','😇','🥰','😍','🤩','😘','😚','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😏','😒','🙄','😬','😮','😌','😔','😪','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥸','😎','🧐','🤓','😕','😟','🙁','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','💩','🤡','👻','👾','🤖'] },
  { label: '👍', title: 'Gestos', emojis: ['👋','🤚','🖐️','✋','👌','🤌','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🙏','✍️','💅','💪','🦵','🦶','👀','👄','💋','👁️'] },
  { label: '❤️', title: 'Amor', emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','💕','💞','💓','💗','💖','💘','💝','💟','🌹','🌸','💐','🥀','🌺','🌻','🌼','🌷','🪷','💑','👫','👬','👭','💏','💍','🫂'] },
  { label: '🎉', title: 'Fiesta', emojis: ['🎉','🎊','🎈','🎁','🎀','🥇','🥈','🥉','🏆','🏅','🎖️','🚀','⭐','🌟','✨','💫','🎆','🎇','🧨','🥳','🎂','🍰','🧁','🥂','🍾','🎯','🎮','🕹️','🎲','🎭','🎬','🎤','🎧','🎵','🎶','🎸','🎹','🎺','🥁','🎷'] },
  { label: '🔥', title: 'Popular', emojis: ['🔥','💯','✅','❌','⚡','💥','🌈','💧','❄️','🌊','🎯','💎','👑','🔮','🧿','💻','📱','📸','🎥','📺','🕹️','🧩','♟️','🃏','🎲','🛸','🌌','🌠','🌙','⭐','🌟','✨','💫','🌞','🌝','🌛','🌜','🌚'] },
  { label: '🐶', title: 'Animales', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🦅','🦉','🦇','🐺','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐢','🐍','🦎','🐙','🦑','🐡','🐠','🐟','🐬','🐳','🦈','🐊','🐘','🦛','🦒','🦘','🦬','🐕','🐈','🐓','🦚','🦜','🐇','🦝','🦨','🦦','🦥','🐁','🐿️','🦔'] },
  { label: '🍕', title: 'Comida', emojis: ['🍕','🍔','🌮','🌯','🥙','🧆','🥚','🍳','🥘','🍲','🫕','🥗','🥫','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🦪','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','☕','🍵','🧋','🥤','🧃','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾'] },
]

/* ===== página principal ===== */
function MensajesPageContent() {
  const { user, profile } = useAuth()
  const router = useRouter()

  const [openNew, setOpenNew] = useState(false)
  const [convos, setConvos] = useState([])
  const [convosErr, setConvosErr] = useState(null)
  const [activeCid, setActiveCid] = useState(null)
  const [convFilter, setConvFilter] = useState('all')

  useEffect(() => { if (activeCid) setWantAutoScrollNext(true) }, [activeCid])
  useEffect(() => { if (activeCid && user?.uid) markConversationRead(activeCid, user, db) }, [activeCid, user?.uid])

  const [pendingMsgs, setPendingMsgs] = useState([])
  const [serverMsgs, setServerMsgs] = useState([])
  const [mobileView, setMobileView] = useState('list')

  const SHOW_INVITE = !!user

  const [myChatLinkToken, setMyChatLinkToken] = useState(null)
  const [myChatLinkLoading, setMyChatLinkLoading] = useState(false)
  const [myChatLinkError, setMyChatLinkError] = useState(null)
  const [showToast, setShowToast] = useState(false)

  function genToken() { return Math.random().toString(36).slice(2, 12) }
  function chatLinkUrl(token) {
    if (!token) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/mensajes?i=${token}`
  }

  async function fetchOrCreateMyChatLink() {
    if (!user?.uid) return null
    setMyChatLinkLoading(true); setMyChatLinkError(null)
    try {
      const snap = await getDocs(query(collection(db, 'chatLinks'), where('ownerUid', '==', user.uid), limit(1)))
      if (!snap.empty) { const token = snap.docs[0].id; setMyChatLinkToken(token); return token }
      const token = genToken()
      await setDoc(doc(db, 'chatLinks', token), { ownerUid: user.uid, enabled: true, createdAt: serverTimestamp() })
      setMyChatLinkToken(token); return token
    } catch (e) { console.warn('[myChatLink]', e); setMyChatLinkError(e?.message || 'Error'); return null }
    finally { setMyChatLinkLoading(false) }
  }

  async function regenerateMyChatLink() {
    if (!user?.uid) return null
    setMyChatLinkLoading(true); setMyChatLinkError(null)
    try {
      const token = genToken()
      await setDoc(doc(db, 'chatLinks', token), { ownerUid: user.uid, enabled: true, createdAt: serverTimestamp() })
      setMyChatLinkToken(token); return token
    } catch (e) { console.warn('[myChatLink regenerate]', e); setMyChatLinkError(e?.message || 'Error'); return null }
    finally { setMyChatLinkLoading(false) }
  }

  const searchParams = useSearchParams()
  const inviteToken = searchParams?.get('i') || null
  const convToken = searchParams?.get('v') || null
  const userTarget = searchParams?.get('u') || null

  useEffect(() => {
    let cancelled = false
    async function resolveConvToken() {
      if (!convToken || !user?.uid) return
      try {
        const snap = await getDoc(doc(db, 'convLinks', convToken))
        if (!snap.exists()) return
        const cid = snap.data()?.cid
        if (!cid || cancelled) return
        setActiveCid(cid); setMobileView('thread')
      } catch (e) { console.warn('[convLink]', e?.code, e?.message) }
    }
    resolveConvToken()
    return () => { cancelled = true }
  }, [convToken, user?.uid])

  useEffect(() => {
    let cancelled = false
    async function go() {
      if (!user?.uid || !userTarget || inviteToken || convToken || activeCid || userTarget === user.uid) return
      if (creatingRef.current) return
      creatingRef.current = true
      try { await startConversationWith(userTarget); if (!cancelled) setMobileView('thread') }
      finally { creatingRef.current = false }
    }
    go()
    return () => { cancelled = true }
  }, [userTarget, user?.uid, inviteToken, convToken, activeCid])

  const [inviteOwnerUid, setInviteOwnerUid] = useState(null)
  const [inviteResolved, setInviteResolved] = useState(false)
  const [inviteBypass, setInviteBypass] = useState(false)

  const messages = useMemo(() => {
    const acked = new Set(serverMsgs.map(m => m.clientId).filter(Boolean))
    const locals = pendingMsgs
      .filter(p => p.cid === activeCid && !acked.has(p.clientId))
      .map(p => ({
        id: p.id, clientId: p.clientId, senderUid: user?.uid,
        type: p.attachments?.length ? (p.attachments[0]?.kind || 'file') : 'text',
        text: p.text, attachments: p.attachments || [], at: new Date(p.atMs),
        __localStatus: p.status, __localError: p.error,
        __retryPayload: { text: p.text, attachments: p.attachments },
      }))
    const all = [...serverMsgs, ...locals]
    all.sort((a, b) => tsToDate(a.at) - tsToDate(b.at))
    return all
  }, [serverMsgs, pendingMsgs, activeCid, user?.uid])

  const scrollRef = useRef(null)
  const SHOW_ARROW_PX = 220
  const [showDownArrow, setShowDownArrow] = useState(false)
  const [showJumpDown, setShowJumpDown] = useState(false)
  const [wantAutoScrollNext, setWantAutoScrollNext] = useState(false)

  function getDistanceToBottom(el) { return el.scrollHeight - (el.scrollTop + el.clientHeight) }
  function isNearBottom(el, px = 200) { return getDistanceToBottom(el) <= px }
  function scrollToBottom(mode = 'smooth') {
    const el = scrollRef.current; if (!el) return
    if (mode === 'instant') el.scrollTop = el.scrollHeight
    else el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }
  function handleScroll() {
    const el = scrollRef.current; if (!el) return
    setShowDownArrow(el.scrollHeight - el.scrollTop - el.clientHeight > SHOW_ARROW_PX)
  }
  function goToBottomSmart() {
    const el = scrollRef.current; if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    el.scrollTo({ top: el.scrollHeight, behavior: distance > 1500 ? 'auto' : 'smooth' })
  }

  useEffect(() => {
    const el = scrollRef.current; if (!el) return
    const dist = getDistanceToBottom(el)
    if (wantAutoScrollNext || isNearBottom(el, 200)) {
      scrollToBottom(dist > 1000 ? 'instant' : 'smooth')
      setWantAutoScrollNext(false)
    }
  }, [messages])

  const [loadingMessages, setLoadingMessages] = useState(false)
  const [messagesErr, setMessagesErr] = useState(null)
  const wasLoadingRef = useRef(false)
  const [userMap, setUserMap] = useState({})
  const [menuCid, setMenuCid] = useState(null)

  useEffect(() => {
    if (loadingMessages) { wasLoadingRef.current = true; return }
    if (wasLoadingRef.current) { wasLoadingRef.current = false; scrollToBottom('instant') }
  }, [loadingMessages])

  const [canSendHere, setCanSendHere] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const [forwardingMsg, setForwardingMsg] = useState(null)
  const [showGroupMembers, setShowGroupMembers] = useState(false)
  const [showGroupSettings, setShowGroupSettings] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedMsgIds, setSelectedMsgIds] = useState(new Set())
  const [otherIsTyping, setOtherIsTyping] = useState(false)
  const typingWriteTimerRef = useRef(null)

  const [imgMenu, setImgMenu] = useState({ open: false, x: 0, y: 0, msg: null, url: '', isVO: false })
  function openImgMenu(e, msg, url, isVO) {
    e.stopPropagation()
    const r = e.currentTarget.getBoundingClientRect()
    setImgMenu({ open: true, x: r.left, y: r.bottom + 8, msg, url, isVO: !!isVO })
  }
  function closeImgMenu() { setImgMenu({ open: false, x: 0, y: 0, msg: null, url: '', isVO: false }) }

  async function deleteImageMessage(convoId, msg) {
    try {
      const first = (msg.attachments || []).filter(a => a?.kind === 'image')[0]
      if (first) { const r = getStorageRefFromAttachment(first); if (r) { try { await deleteObject(r) } catch (_) { } } }
      await updateDoc(doc(db, 'conversations', convoId, 'messages', msg.id), { attachments: [], type: 'deleted', text: '' })
    } catch (_) { }
    closeImgMenu()
  }

  const creatingRef = useRef(false)

  /* conversaciones */
  useEffect(() => {
    if (!user?.uid) return
    const qConvos = query(collection(db, 'conversations'), where('participantUids', 'array-contains', user.uid), orderBy('updatedAt', 'desc'), limit(50))
    const unsub = onSnapshot(qConvos, snap => {
      setConvosErr(null)
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setConvos(list)
      const cidParam = searchParams?.get('c')
      if (!activeCid && list.length && cidParam && list.some(x => x.id === cidParam)) setActiveCid(cidParam)
    }, err => setConvosErr(err))
    return () => unsub()
  }, [user?.uid, activeCid])

  /* perfiles de participantes */
  useEffect(() => {
    async function fetchMissing(uids) {
      const next = { ...userMap }
      for (const uid of uids) {
        if (next[uid]) continue
        const s = await run('getUserProfile(' + uid + ')', () => getDoc(doc(db, 'users', uid)))
        if (s.exists()) next[uid] = { uid, ...s.data() }
      }
      setUserMap(next)
    }
    if (!user?.uid || !convos.length) return
    const others = new Set()
    convos.forEach(c => (c.participantUids || []).forEach(p => { if (p !== user.uid) others.add(p) }))
    fetchMissing([...others])
  }, [convos, user?.uid])

  /* perfil propio en userMap */
  useEffect(() => {
    if (!user?.uid || !profile) return
    setUserMap(prev => { if (prev[user.uid]) return prev; return { ...prev, [user.uid]: { uid: user.uid, ...profile } } })
  }, [user?.uid, profile])

  /* resolver token de invitación */
  useEffect(() => {
    let cancelled = false
    async function runInviteFlow() {
      if (!inviteToken || !user?.uid) { setInviteResolved(true); return }
      try {
        const snap = await getDoc(doc(db, 'chatLinks', inviteToken))
        if (!snap.exists()) { setInviteResolved(true); return }
        const ownerUid = snap.data()?.ownerUid || null
        if (!ownerUid || ownerUid === user.uid) { setInviteOwnerUid(null); setInviteResolved(true); return }
        setInviteOwnerUid(ownerUid)
        const pk = uidPair(user.uid, ownerUid)
        const ex = await getDocs(query(collection(db, 'conversations'), where('participantUids', 'array-contains', user.uid), where('pairKey', '==', pk), limit(1)))
        if (!cancelled) {
          if (!ex.empty) { setActiveCid(ex.docs[0].id); setInviteBypass(true); setMobileView('thread') }
          else {
            const ref = await addDoc(collection(db, 'conversations'), { participantUids: [user.uid, ownerUid], pairKey: pk, startedBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessage: null, createdByInviteToken: inviteToken })
            setActiveCid(ref.id); setInviteBypass(true); setMobileView('thread')
          }
        }
      } catch (e) { console.warn('[inviteFlow]', e?.code, e?.message) }
      finally { if (!cancelled) setInviteResolved(true) }
    }
    runInviteFlow()
    return () => { cancelled = true }
  }, [inviteToken, user?.uid])

  useEffect(() => { if (!user?.uid) return; fetchOrCreateMyChatLink() }, [user?.uid])

  /* sincronizar URL */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (activeCid) url.searchParams.set('c', activeCid); else url.searchParams.delete('c')
    url.searchParams.delete('u'); url.searchParams.delete('i'); url.searchParams.delete('v')
    window.history.replaceState({}, '', url.toString())
  }, [activeCid])

  const iAmParticipant = useMemo(() => {
    if (!activeCid) return false
    const c = convos.find(x => x.id === activeCid)
    return !!c && (c.participantUids || []).includes(user?.uid)
  }, [convos, activeCid, user?.uid])

  /* mensajes activos */
  useEffect(() => {
    let unsub = null, cancelled = false
    async function attach() {
      setServerMsgs([])
      if (!activeCid || !user?.uid) return
      setLoadingMessages(true)
      try {
        const snap = await getDoc(doc(db, 'conversations', activeCid))
        const data = snap.exists() ? snap.data() : null
        const isMember = !!data && Array.isArray(data.participantUids) && data.participantUids.includes(user.uid)
        if (!isMember || cancelled) return
      } catch (err) { console.warn('[preflight messages]', err?.code, err?.message); setMessagesErr(err); setLoadingMessages(false); return }
      setMessagesErr(null)
      const qMsgs = query(collection(db, 'conversations', activeCid, 'messages'), limit(500))
      unsub = onSnapshot(qMsgs, async snap => {
        if (cancelled) return
        const rows = []
        for (const d of snap.docs) {
          const m = { id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }
          const text = await decryptMessage(m.textCipher, activeCid, user?.uid)
          rows.push({ ...m, text })
        }
        rows.sort((a, b) => {
          function ts(m) { const t = m.at ?? m.createdAt; if (!t) return Date.now(); if (typeof t.toMillis === 'function') return t.toMillis(); if (t instanceof Date) return t.getTime(); return Date.now() }
          return ts(a) - ts(b)
        })
        setServerMsgs(rows); setLoadingMessages(false)
      }, err => { if (cancelled) return; console.warn('[messages listener]', err?.code, err?.message); setServerMsgs([]); setLoadingMessages(false); setMessagesErr(err) })
    }
    attach()
    return () => { cancelled = true; if (unsub) unsub() }
  }, [activeCid, user?.uid])

  /* crear/reusar conversación directa */
  async function startConversationWith(otherUid) {
    if (!user?.uid || !otherUid) return
    if (inviteToken || inviteBypass) return
    let selfDoc = profile || null
    try {
      if (!selfDoc || (!Array.isArray(selfDoc.ranks) && !Array.isArray(selfDoc.roles))) {
        const snap = await getDoc(doc(db, 'users', user.uid))
        if (snap.exists()) selfDoc = { uid: user.uid, ...snap.data() }
      }
    } catch (e) { console.warn('[startConversation] refresh profile:', e?.code, e?.message) }
    const ranks = getUserRanks(selfDoc || {})
    console.log('[startConversation]', { me: user?.uid, otherUid, ranks })
    const pk = uidPair(user.uid, otherUid)
    try {
      const ex = await getDocs(query(collection(db, 'conversations'), where('participantUids', 'array-contains', user.uid), where('pairKey', '==', pk), limit(1)))
      if (!ex.empty) { setActiveCid(ex.docs[0].id); return }
    } catch (e) { console.error('[checkExistingConversation]', e?.code, e?.message); alert('Error verificando conversaciones: ' + (e?.code || 'desconocido')); return }
    try {
      const ref = await addDoc(collection(db, 'conversations'), { participantUids: [user.uid, otherUid], pairKey: pk, startedBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessage: null })
      const convTokenNew = genToken()
      await setDoc(doc(db, 'convLinks', convTokenNew), { cid: ref.id, createdAt: serverTimestamp(), createdBy: user.uid })
      await updateDoc(doc(db, 'conversations', ref.id), { linkToken: convTokenNew })
      setActiveCid(ref.id)
    } catch (e) {
      if (e?.code === 'permission-denied') {
        try {
          const ex2 = await getDocs(query(collection(db, 'conversations'), where('participantUids', 'array-contains', user.uid), where('pairKey', '==', pk), limit(1)))
          if (!ex2.empty) { setActiveCid(ex2.docs[0].id); return }
        } catch (_) { }
        if (inviteBypass || inviteToken) return
        alert('No se pudo iniciar la conversación: permission-denied'); return
      }
      console.error('[createConversation]', e?.code, e?.message)
      alert('No se pudo iniciar la conversación: ' + (e?.code || 'error'))
    }
  }

  /* crear grupo */
  async function createGroupConversation({ groupName, uids }) {
    if (!user?.uid || !groupName || uids.length === 0) return
    try {
      const ref = await addDoc(collection(db, 'conversations'), { isGroup: true, groupName: groupName.trim(), participantUids: [user.uid, ...uids], startedBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessage: null })
      setActiveCid(ref.id); setMobileView('thread')
    } catch (e) { console.error('[createGroupConversation]', e?.code, e?.message); alert('No se pudo crear el grupo: ' + (e?.code || 'error')) }
  }

  /* enviar mensaje */
  async function sendMessage(cid, text, attachments = [], options = {}) {
    const { viewOnce = false, replyTo = null } = options
    if (!user?.uid) return
    if (!canSendHere) { alert('No tienes permiso para enviar mensajes en esta conversación.'); return }
    const conv = convos.find(c => c.id === cid)
    if (!conv) return
    setWantAutoScrollNext(true)
    queueMicrotask(() => scrollToBottom('smooth'))
    const tempId = 'local-' + Math.random().toString(36).slice(2)
    const clientId = (typeof crypto !== 'undefined' && crypto.randomUUID?.()) || ('cid-' + Math.random().toString(36).slice(2))
    const atMs = Date.now()
    setPendingMsgs(arr => [...arr, { id: tempId, cid, clientId, text: text || '', attachments, atMs, status: 'sending', error: null }])
    try {
      let uploaded = []
      if (attachments?.length) uploaded = await uploadManyAttachments(cid, attachments.map(a => ({ kind: a.kind, file: a.file })))
      const textCipher = await encryptMessage(text || '', cid, user.uid)
      await addDoc(collection(db, 'conversations', cid, 'messages'), {
        clientId, type: uploaded.length ? uploaded[0].kind : 'text', textCipher,
        attachments: uploaded, meta: { viewOnce }, senderUid: user.uid,
        ...(conv.isGroup ? { senderProfileName: profile?.profileName || user?.displayName || '' } : {}),
        at: serverTimestamp(),
        ...(replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text, replyToSenderName: replyTo.senderName } : {}),
      })
      await updateDoc(doc(db, 'conversations', cid), {
        updatedAt: serverTimestamp(),
        lastMessage: { text: text || uploaded[0]?.name || uploaded[0]?.kind, senderUid: user.uid, at: serverTimestamp() },
        [`readAt.${user.uid}`]: serverTimestamp(),
      })
      setPendingMsgs(arr => arr.map(m => m.id === tempId ? { ...m, status: 'sent' } : m))
    } catch (e) {
      setPendingMsgs(arr => arr.map(m => m.id === tempId ? { ...m, status: 'error', error: e?.message || 'Error desconocido' } : m))
    }
  }

  /* eliminar conversación */
  async function deleteConversation(cid) {
    if (!cid) return
    if (!confirm('¿Eliminar el chat completo? Esta acción no se puede deshacer.')) return
    try {
      while (true) {
        const snap = await run('listMessagesForDelete', () => getDocs(query(collection(db, 'conversations', cid, 'messages'), limit(100))))
        if (snap.empty) break
        const batch = writeBatch(db)
        snap.docs.forEach(d => batch.delete(d.ref))
        await run('commitDeleteBatch', () => batch.commit())
      }
      await run('deleteConversation', () => deleteDoc(doc(db, 'conversations', cid)))
      if (activeCid === cid) setActiveCid(null)
    } catch { }
  }

  const activeConversation = convos.find(c => c.id === activeCid) || null
  const otherUid = useMemo(() => (activeConversation?.participantUids || []).find(u => u !== user?.uid) || null, [activeConversation, user?.uid])
  const otherUser = otherUid ? userMap[otherUid] : null
  const isGroupConv = !!activeConversation?.isGroup
  const groupParticipantCount = isGroupConv ? (activeConversation?.participantUids?.length ?? 0) : 0

  /* typing indicator escucha */
  useEffect(() => {
    if (!activeCid || !otherUid) { setOtherIsTyping(false); return }
    const unsub = onSnapshot(doc(db, 'conversations', activeCid), snap => {
      const d = snap.data()
      const ts = d?.typing?.[otherUid]
      if (!ts) { setOtherIsTyping(false); return }
      const date = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null)
      setOtherIsTyping(!!date && (Date.now() - date.getTime() < 5000))
    })
    return () => unsub()
  }, [activeCid, otherUid])

  function jumpToMessage(msgId) {
    if (!msgId) return
    const el = document.getElementById(`msg-${msgId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const bubble = el.querySelector('[data-bubble]')
    setTimeout(() => {
      if (!bubble) return
      bubble.style.transition = 'box-shadow 0.15s ease'
      bubble.style.boxShadow = '0 0 0 2px #3ea6ff, 0 0 18px rgba(62,166,255,0.5)'
      setTimeout(() => {
        bubble.style.transition = 'box-shadow 0.7s ease'
        bubble.style.boxShadow = '0 0 0 0 rgba(62,166,255,0)'
        setTimeout(() => { bubble.style.boxShadow = ''; bubble.style.transition = '' }, 750)
      }, 450)
    }, 350)
  }

  function handleTyping(isTyping) {
    if (!activeCid || !user?.uid) return
    clearTimeout(typingWriteTimerRef.current)
    const field = `typing.${user.uid}`
    if (isTyping) {
      updateDoc(doc(db, 'conversations', activeCid), { [field]: serverTimestamp() }).catch(() => {})
      typingWriteTimerRef.current = setTimeout(() => {
        updateDoc(doc(db, 'conversations', activeCid), { [field]: deleteField() }).catch(() => {})
      }, 5000)
    } else {
      updateDoc(doc(db, 'conversations', activeCid), { [field]: deleteField() }).catch(() => {})
    }
  }

  /* habilitar composer */
  useEffect(() => {
    let cancelled = false
    async function compute() {
      if (!user?.uid || !activeConversation) { if (!cancelled) setCanSendHere(false); return }
      if (inviteBypass && inviteOwnerUid && otherUid === inviteOwnerUid) { if (!cancelled) setCanSendHere(true); return }
      if (activeConversation.startedBy !== user.uid) { if (!cancelled) setCanSendHere(true); return }
      let docData = profile
      try {
        if (!docData || (!Array.isArray(docData.ranks) && !Array.isArray(docData.roles))) {
          const s = await getDoc(doc(db, 'users', user.uid))
          if (s.exists()) docData = { uid: user.uid, ...s.data() }
        }
      } catch (_) { }
      if (!cancelled) setCanSendHere(true)
    }
    compute()
    return () => { cancelled = true }
  }, [user?.uid, profile, activeConversation, inviteBypass, inviteOwnerUid, otherUid])

  return (
    <div className="mx-auto max-w-7xl px-4 pt-[76px] pb-6 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
      <aside className="hidden md:block md:sticky md:top-4 h-fit"><PerfilNav /></aside>

      <div className="grid grid-cols-[340px_1fr] gap-4 h-[calc(100vh-100px)] min-h-0">
        {/* lista de conversaciones */}
        <aside className={clsx('border border-[var(--border)] bg-[var(--card)] rounded-2xl p-3 flex flex-col h-full overflow-hidden', mobileView === 'list' ? 'block' : 'hidden', 'lg:block')}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-semibold">Chatear</h2>
            <button onClick={() => setOpenNew(true)} className="w-8 h-8 rounded-full border border-[var(--border)] flex items-center justify-center cursor-pointer transition hover:bg-white/10" title="Nuevo chat">
              <PlusIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 relative">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
              <input className="w-full rounded-full border border-[var(--border)] pl-9 pr-4 py-2 text-sm bg-transparent" placeholder="Buscar" />
            </div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <Chip active={convFilter === 'all'} onClick={() => setConvFilter('all')}>Todas</Chip>
            <Chip active={convFilter === 'groups'} onClick={() => setConvFilter('groups')}>Grupos</Chip>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-0.5">
            {convos.filter(c => convFilter === 'groups' ? c.isGroup : true).map(c => {
              const isGroup = !!c.isGroup
              const other = isGroup ? null : (c.participantUids || []).find(u => u !== user?.uid)
              const u = other ? userMap[other] : null
              const name = isGroup ? (c.groupName || 'Grupo') : (displayNameFromUser(u) || other || 'Usuario')
              const avatar = isGroup ? null : avatarFromUser(u)
              const whenDate = tsToDate(c?.lastMessage?.at)
              const whenRaw = whenDate ? formatRelativeEs(whenDate) : ''
              const when = whenRaw.replace(/^hace\s+/i, '').replace(/^en\s+/i, '').replace(/^dentro de\s+/i, '')
              const lm = (c.lastMessage?.senderName ? `${c.lastMessage.senderName}: ` : '') + (c.lastMessage?.text || (c.lastMessage?.attachments?.length ? '📎 Archivo' : c.lastMessage?.type === 'image' ? '📷 Imagen' : ''))
              const selected = activeCid === c.id
              const showMenu = menuCid === c.id
              const lastAt = tsToDate(c?.lastMessage?.at)
              const myReadAt = tsToDate(c?.readAt?.[user?.uid])
              const unread = !!lastAt && (!myReadAt || lastAt > myReadAt) && c?.lastMessage?.senderUid && c.lastMessage.senderUid !== user?.uid
              return (
                <div key={c.id} className="relative group">
                  <div onClick={() => { setActiveCid(c.id); setMobileView('thread'); markConversationRead(c.id, user, db); router.replace(`/mensajes?c=${c.id}`, { scroll: false }) }}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl transition cursor-pointer ${selected ? 'bg-[var(--bg3)]' : 'hover:bg-white/5'}`}>
                    {isGroup ? (
                      c.groupPhotoURL
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={c.groupPhotoURL} alt={name} className="h-[46px] w-[46px] shrink-0 rounded-full object-cover border border-[var(--border)]" />
                        : <div className="h-[46px] w-[46px] shrink-0 rounded-full bg-[var(--bg3)] border border-[var(--border)] flex items-center justify-center text-base font-semibold text-white/70">{(c.groupName?.[0] || 'G').toUpperCase()}</div>
                    ) : <Avatar src={avatar} alt={name} size={46} />}
                    <div className="flex-1 min-w-0 pr-8">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`truncate text-[14px] ${isDeletedUser(u) ? 'text-white/30 italic font-normal' : unread ? 'font-semibold text-white' : 'font-medium text-white/85'}`}>{name}</span>
                          {!isGroup && other && !isDeletedUser(u) && <Badges uid={other} size="xs" />}
                        </div>
                        {when && <span className={`text-[11px] shrink-0 ${unread ? 'text-[var(--accent2)] font-medium' : 'opacity-45'}`}>{when}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className={`text-xs truncate ${unread ? 'text-white/75' : 'opacity-45'}`}>{lm || ' '}</div>
                        {unread && <span className="shrink-0 w-2 h-2 rounded-full bg-[var(--accent2)]" />}
                      </div>
                    </div>
                  </div>
                  <button className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition" onClick={() => setMenuCid(showMenu ? null : c.id)}>
                    <IconMore />
                  </button>
                  {showMenu && (
                    <div className="mx-3 mb-1 bg-black/90 border border-[var(--border)] rounded-lg p-1 text-sm shadow-xl">
                      <button className="px-3 py-2 rounded-lg hover:bg-white/10 cursor-pointer w-full text-left" onClick={() => { setMenuCid(null); deleteConversation(c.id) }}>Eliminar chat</button>
                    </div>
                  )}
                </div>
              )
            })}
            {!convos.length && !convosErr && <div className="text-sm opacity-70 p-3">No tienes conversaciones.</div>}
            {convosErr?.code === 'failed-precondition' && (
              <div className="text-xs p-3 rounded-lg border border-[var(--border)]">Esta vista requiere un índice de Firestore. Abre el enlace de la consola para crearlo.</div>
            )}
          </div>
        </aside>

        {/* hilo de conversación */}
        <section className={clsx('border border-[var(--border)] bg-[var(--card)] rounded-2xl flex flex-col h-full overflow-hidden lg:static lg:flex', mobileView === 'thread' ? 'fixed inset-0 z-40 bg-[var(--bg)]' : 'hidden lg:flex')}>
          <div className="p-3 border-b border-[var(--border)] sticky top-0 bg-[var(--card)]/95 backdrop-blur z-10">
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Volver" onClick={() => setMobileView('list')} className="lg:hidden rounded-full p-2 hover:bg-white/10 active:scale-95 transition">
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              {!activeCid ? (
                <div className="text-sm opacity-70">Elige una conversación.</div>
              ) : (
                <>
                  {isGroupConv ? (
                    activeConversation?.groupPhotoURL
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={activeConversation.groupPhotoURL} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover border border-[var(--border)]" />
                      : <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--bg3)] border border-[var(--border)] flex items-center justify-center text-base font-semibold text-white/70">{(activeConversation?.groupName?.[0] || 'G').toUpperCase()}</div>
                  ) : <Avatar src={avatarFromUser(otherUser)} alt={displayNameFromUser(otherUser)} size={40} />}
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate flex items-center gap-2">
                      <span className={!isGroupConv && isDeletedUser(otherUser) ? 'text-white/30 italic font-normal' : ''}>
                        {isGroupConv ? (activeConversation?.groupName || 'Grupo') : (displayNameFromUser(otherUser) || otherUid)}
                      </span>
                      {!isGroupConv && !isDeletedUser(otherUser) && <Badges uid={otherUid} size="sm" />}
                    </div>
                    {isGroupConv ? (
                      <button onClick={() => setShowGroupMembers(true)} className="text-xs opacity-60 hover:opacity-90 cursor-pointer transition text-left">{groupParticipantCount} participantes</button>
                    ) : (
                      <>
                        {inviteBypass && inviteOwnerUid && otherUid === inviteOwnerUid && (
                          <div className="text-[11px] opacity-70">Conversación iniciada por enlace</div>
                        )}
                        {otherUser?.usernameSlug && <div className="text-xs opacity-70 truncate">@{otherUser.usernameSlug}</div>}
                      </>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-0.5">
                    <button type="button" title={selectMode ? 'Cancelar selección' : 'Seleccionar mensajes'}
                      onClick={() => { setSelectMode(v => !v); setSelectedMsgIds(new Set()) }}
                      className={clsx('rounded-full p-2 transition hover:bg-white/10 cursor-pointer', selectMode && 'bg-white/10 text-[var(--accent2)]')}>
                      <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    {isGroupConv && (
                      <button type="button" title="Ajustes del grupo" onClick={() => setShowGroupSettings(true)} className="rounded-full p-2 transition hover:bg-white/10 cursor-pointer">
                        <Cog6ToothIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div ref={scrollRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 max-w-3xl mx-auto w-full">
            {imgMenu.open && (
              <>
                <div className="fixed inset-0 z-[55]" onClick={closeImgMenu} />
                <div style={{ left: imgMenu.x, top: imgMenu.y }} className="fixed z-[60] w-44 rounded-xl border border-[var(--border)] bg-[var(--bg2)]/95 backdrop-blur shadow-lg p-1" role="menu" tabIndex={-1}>
                  <MenuItem icon={FaceSmileIcon} label="Reaccionar" onClick={() => { closeImgMenu() }} />
                  <div className="h-px bg-white/10 my-1" />
                  <MenuItem icon={TrashIcon} label="Eliminar" onClick={() => deleteImageMessage(activeCid, imgMenu.msg)} danger />
                </div>
              </>
            )}

            {loadingMessages && <div className="flex items-center justify-center h-full min-h-[200px]"><div className="text-sm opacity-60">Cargando…</div></div>}
            {!loadingMessages && messagesErr && (
              <div className="text-xs p-3 rounded-lg border border-[var(--border)]">
                No tienes permiso para leer este hilo todavía.
                {canSendHere && <span className="opacity-70"> Puedes escribir y el otro usuario verá tus mensajes.</span>}
                <div className="mt-1 opacity-60">{messagesErr?.code || 'permission-denied'}</div>
              </div>
            )}
            {!loadingMessages && activeCid && !messagesErr && (
              <div className="relative h-full min-w-0">
                <div className="min-h-0 w-full overflow-x-hidden pr-1">
                  <div className="space-y-3">
                    {(() => {
                      const out = []; let lastDay = null
                      for (const m of messages) {
                        const d = tsToDate(m.at)
                        if (d && (!lastDay || !sameYMD(d, lastDay))) { out.push(<DateDivider key={`day-${d?.toISOString()}`} date={d} />); lastDay = d }
                        if (Array.isArray(m.attachments) && m.attachments.some(a => a?.kind === 'image')) {
                          const isSender = m.senderUid === user?.uid
                          const imgs = m.attachments.filter(a => a?.kind === 'image')
                          const first = imgs[0]
                          const isVO = m?.meta?.viewOnce === true
                          const alreadyOpened = !!m?.meta?.viewOnceOpenedAt || (m.attachments || []).length === 0
                          if (isVO) {
                            out.push(
                              <div key={m.id} id={`msg-${m.id}`} className={`w-full flex mb-2 ${isSender ? 'justify-end' : 'justify-start'}`}>
                                <div className="relative inline-flex flex-col max-w-[min(520px,92vw)]">
                                  <div className={`px-4 py-2 rounded-2xl whitespace-pre-wrap break-words ${isSender ? 'bg-[var(--accent)] text-white ml-auto' : 'bg-[var(--bg3)] text-neutral-100 mr-auto'}`}
                                    onClick={() => { if (alreadyOpened || isSender) return; window.openViewOnceAndDestroy?.(activeCid, m) }}>
                                    <div className="flex items-center gap-2">
                                      <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full bg-black/30 border border-white/20 text-xs">1</span>
                                      <span>{alreadyOpened ? 'Foto (vista)' : (isSender ? 'Foto (ver una vez)' : 'Foto (ver una vez) • tocar para ver')}</span>
                                    </div>
                                    <div className="mt-1 text-[11px] opacity-70 leading-none text-right">{(tsToDate(m.at) || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                  </div>
                                </div>
                              </div>
                            )
                          } else {
                            out.push(
                              <div key={m.id} id={`msg-${m.id}`} className={`w-full flex mb-2 ${isSender ? 'justify-end' : 'justify-start'}`}>
                                <div className="relative inline-flex flex-col max-w-[min(520px,92vw)]">
                                  <div className={`${isSender ? 'ml-auto' : 'mr-auto'} relative`}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={first?.url} alt={first?.name || 'Imagen'} className="rounded-2xl border border-[var(--border)] cursor-pointer max-w-[min(420px,90vw)] max-h-[60vh] object-contain" onClick={() => { if (first?.url) openLb(first.url, m.text || first.name || '') }} />
                                    <div className="absolute top-2 right-2">
                                      <button type="button" className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center cursor-pointer"
                                        onClick={e => { e.stopPropagation(); if (imgMenu.open) { closeImgMenu(); return } openImgMenu(e, m, first?.url || '', false) }}>⋮</button>
                                    </div>
                                  </div>
                                  {(m.text || first?.name) && (
                                    <div className={`mt-1 px-3 py-2 rounded-2xl text-sm ${isSender ? 'bg-[var(--accent)] text-white ml-auto' : 'bg-[var(--bg3)] text-neutral-100 mr-auto'}`}>
                                      <div className="whitespace-pre-wrap break-words">{m.text || first?.name}</div>
                                      <div className="mt-1 text-[11px] opacity-70 leading-none text-right">{(tsToDate(m.at) || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          }
                        } else {
                          const isMine = m.senderUid === user?.uid
                          const senderInGroup = isGroupConv ? (userMap[m.senderUid] ? displayNameFromUser(userMap[m.senderUid]) : m.senderProfileName || null) : null
                          const senderAvatar = isGroupConv ? (isMine ? (profile?.photoURL || user?.photoURL || avatarFromUser(userMap[m.senderUid])) : avatarFromUser(userMap[m.senderUid])) : null
                          out.push(
                            <div key={m.id} id={`msg-${m.id}`}>
                              {isGroupConv && senderInGroup && <div className={`text-[11px] text-white/45 mb-0.5 ${isMine ? 'text-right pr-9' : 'pl-9'}`}>{senderInGroup}</div>}
                              <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                                {isGroupConv && (
                                  <div className="w-7 h-7 rounded-full bg-[var(--bg3)] ring-1 ring-white/10 overflow-hidden flex items-center justify-center shrink-0 text-xs self-end mb-1">
                                    {senderAvatar
                                      // eslint-disable-next-line @next/next/no-img-element
                                      ? <img src={senderAvatar} alt="" className="w-full h-full object-cover" />
                                      : <span>{(senderInGroup?.[0] || '?').toUpperCase()}</span>}
                                  </div>
                                )}
                                <Bubble mine={isMine}
                                  time={(tsToDate(m.at) || new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  msgId={m.id} msgType={m.type} convoId={activeCid} db={db} userUid={user?.uid}
                                  reactions={m.reactions} editedAt={m.editedAt} forwarded={!!m.meta?.forwarded}
                                  replyTo={m.replyToId ? { id: m.replyToId, text: m.replyToText, senderName: m.replyToSenderName || '↩' } : null}
                                  onReply={() => setReplyingTo({ id: m.id, text: m.text, senderName: m.senderUid === user?.uid ? 'Tú' : (displayNameFromUser(otherUser) || 'Ellos') })}
                                  onJumpToReply={jumpToMessage}
                                  onForward={() => setForwardingMsg(m)}
                                  selectMode={selectMode} selected={selectedMsgIds.has(m.id)}
                                  onSelect={() => setSelectedMsgIds(prev => { const next = new Set(prev); next.has(m.id) ? next.delete(m.id) : next.add(m.id); return next })}
                                  status={m.__localStatus ? m.__localStatus : (() => {
                                    if (m.senderUid !== user?.uid) return undefined
                                    const otherReadAt = activeConversation?.readAt?.[otherUid]
                                    const msgAt = m.at?.toDate?.() || (m.at instanceof Date ? m.at : null)
                                    if (otherReadAt && msgAt && (otherReadAt?.toDate?.() || otherReadAt) >= msgAt) return 'read'
                                    return 'sent'
                                  })()}
                                  errorMessage={m.__localError}
                                  onRetry={m.__localStatus === 'error' ? () => {
                                    setPendingMsgs(arr => arr.map(x => x.id === m.id ? { ...x, status: 'sending', error: null } : x))
                                    sendMessage(activeCid, m.__retryPayload?.text || '', m.__retryPayload?.attachments || [])
                                  } : undefined}>
                                  {m.type === 'viewonce_opened' ? 'Foto (ver una vez) • abierta'
                                    : m.type === 'share' ? <ShareCard meta={m.meta} />
                                    : (m.type === 'text' ? (m.text || '') : (m.attachments?.[0]?.name || m.type))}
                                </Bubble>
                              </div>
                            </div>
                          )
                        }
                      }
                      return out.length ? out : <div className="flex items-center justify-center h-full min-h-[200px] text-sm opacity-60">No hay mensajes aún.</div>
                    })()}
                    <div aria-hidden className="h-1" />
                  </div>
                </div>
                {showDownArrow && (
                  <button type="button" title="Ir al final" onClick={goToBottomSmart}
                    className="pointer-events-auto absolute bottom-4 right-4 z-40 rounded-full p-3 bg-[var(--bg2)] backdrop-blur border border-[var(--border)] hover:bg-[var(--bg3)] shadow-lg cursor-pointer transition-transform duration-150 hover:scale-110 active:scale-95">
                    <ChevronDownIcon className="w-6 h-6" />
                  </button>
                )}
              </div>
            )}
          </div>

          {activeCid && (
            <div className="max-w-3xl mx-auto w-full flex flex-col">
              {replyingTo && (
                <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg2)] border-t border-[var(--border)] backdrop-blur">
                  <div className="w-1 h-9 bg-[var(--accent2)] rounded-full flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[var(--accent2)] text-xs font-semibold mb-0.5">{replyingTo.senderName}</div>
                    <div className="truncate text-xs text-white/60">{replyingTo.text || '📎 adjunto'}</div>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} className="cursor-pointer shrink-0 p-1.5 rounded-full hover:bg-white/10 transition text-white/50 hover:text-white/90">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
              {selectMode && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg2)] border-t border-[var(--border)] backdrop-blur">
                  <span className="text-sm text-white/60 flex-1">{selectedMsgIds.size > 0 ? `${selectedMsgIds.size} seleccionado${selectedMsgIds.size !== 1 ? 's' : ''}` : 'Selecciona mensajes'}</span>
                  {selectedMsgIds.size > 0 && (
                    <>
                      <button type="button" onClick={() => { const msgs = messages.filter(m => selectedMsgIds.has(m.id)); if (msgs.length === 1) setForwardingMsg(msgs[0]); setSelectMode(false); setSelectedMsgIds(new Set()) }}
                        className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--accent2)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/10 transition">Reenviar</button>
                      <button type="button" onClick={async () => {
                        for (const id of selectedMsgIds) {
                          const m = messages.find(x => x.id === id)
                          if (m?.senderUid === user?.uid) { try { await deleteDoc(doc(db, 'conversations', activeCid, 'messages', id)) } catch (_) { } }
                        }
                        setSelectMode(false); setSelectedMsgIds(new Set())
                      }} className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition">Eliminar</button>
                    </>
                  )}
                  <button type="button" onClick={() => { setSelectMode(false); setSelectedMsgIds(new Set()) }} className="cursor-pointer p-1.5 rounded-full hover:bg-white/10 transition text-white/50 hover:text-white/90">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
              {otherIsTyping && (
                <div className="flex items-center gap-2 px-4 pb-1 text-[12px] opacity-60 chat-slide-in select-none">
                  <div className="flex items-center gap-1"><span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" /></div>
                  <span>{displayNameFromUser(otherUser) || 'Alguien'} está escribiendo…</span>
                </div>
              )}
              <ChatComposer key={activeCid || 'no-chat'} disabled={!canSendHere || selectMode}
                draftKey={activeCid ? `dc_draft_${activeCid}` : null} onTyping={handleTyping}
                onSend={({ text, attachments, viewOnce }) => { sendMessage(activeCid, text, attachments, { viewOnce, replyTo: replyingTo }); setReplyingTo(null); handleTyping(false) }} />
            </div>
          )}
        </section>
      </div>

      <StartChatDialog open={openNew} onClose={() => setOpenNew(false)}
        onPick={uid => { setOpenNew(false); startConversationWith(uid) }}
        onPickGroup={({ groupName, uids }) => { setOpenNew(false); createGroupConversation({ groupName, uids }) }} />

      <GroupMembersModal open={showGroupMembers} conv={activeConversation} userUid={user?.uid} db={db} onClose={() => setShowGroupMembers(false)} />
      <GroupSettingsModal open={showGroupSettings} conv={activeConversation} userUid={user?.uid} db={db} storage={storage} onClose={() => setShowGroupSettings(false)} />

      {forwardingMsg && <ForwardModal msg={forwardingMsg} convos={convos} userMap={userMap} userUid={user?.uid} db={db} onClose={() => setForwardingMsg(null)} />}

    </div>
  )
}

export default function MensajesPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm opacity-70">Cargando…</div>}>
      <MensajesPageContent />
    </Suspense>
  )
}

/* ===== helpers datos ===== */
function isDeletedUser(u) { return u?.status === 'deleted' || u?.profile?.status === 'deleted' }
function displayNameFromUser(u) {
  if (isDeletedUser(u)) return 'Cuenta eliminada'
  return u?.profile?.profileName || u?.profileName || u?.displayName || (typeof u?.username === 'string' ? u.username.replace(/^@/, '') : '') || u?.usernameSlug || 'Usuario'
}
function avatarFromUser(u) {
  if (isDeletedUser(u)) return ''
  return u?.avatarUrl || u?.photoURL || ''
}
function uidPair(a, b) { return [a, b].sort().join('__') }

async function markConversationRead(cid, user, db) {
  if (!user?.uid || !cid) return
  try { await updateDoc(doc(db, 'conversations', cid), { [`readAt.${user.uid}`]: serverTimestamp() }) } catch (_) { }
}

/* ===== GroupMembersModal ===== */
function GroupMembersModal({ open, conv, userUid, db, onClose }) {
  const [members, setMembers] = useState([])
  const isAdmin = conv?.startedBy === userUid
  useEffect(() => {
    if (!open || !conv?.participantUids?.length) { setMembers([]); return }
    let active = true
    ;(async () => {
      const acc = []
      for (let i = 0; i < conv.participantUids.length; i += 10) {
        const chunk = conv.participantUids.slice(i, i + 10)
        const snap = await getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk)))
        snap.forEach(d => acc.push({ id: d.id, ...d.data() }))
      }
      if (active) setMembers(acc)
    })()
    return () => { active = false }
  }, [open, conv?.participantUids, db])
  if (!open) return null
  async function kickMember(uid) {
    if (!isAdmin || uid === userUid) return
    try { await updateDoc(doc(db, 'conversations', conv.id), { participantUids: arrayRemove(uid) }) }
    catch (e) { console.error('kick:', e) }
  }
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(480px,92vw)] max-h-[80vh] overflow-hidden rounded-2xl border border-[var(--border)] bg-black">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <div>
            <h3 className="font-semibold">{conv?.groupName || 'Grupo'}</h3>
            <p className="text-xs text-white/50">{conv?.participantUids?.length ?? 0} participantes</p>
          </div>
          <button onClick={onClose} className="text-sm text-white/50 hover:text-white cursor-pointer transition">Cerrar</button>
        </div>
        <div className="divide-y divide-white/8 overflow-auto max-h-[calc(80vh-60px)]">
          {members.map(u => {
            const name = u?.profile?.profileName || u?.profileName || u?.displayName || u?.usernameSlug || 'Usuario'
            const slug = u?.usernameSlug || ''
            const avatar = u?.profile?.photoURL || u?.photoURL || ''
            const isSelf = u.id === userUid
            const isCreator = u.id === conv?.startedBy
            return (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="h-9 w-9 rounded-full bg-[var(--bg3)] ring-1 ring-white/10 overflow-hidden flex items-center justify-center shrink-0">
                  {avatar
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                    : <span className="text-sm">{(name[0] || '?').toUpperCase()}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{name}</span>
                    {isCreator && <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5">Admin</span>}
                    {isSelf && <span className="text-[10px] text-white/40">Tú</span>}
                  </div>
                  {slug && <div className="text-xs text-white/45 truncate">@{slug}</div>}
                </div>
                {isAdmin && !isSelf && !isCreator && (
                  <button onClick={() => kickMember(u.id)} className="text-xs text-red-400/70 hover:text-red-400 cursor-pointer transition px-2 py-1 rounded-lg hover:bg-red-500/10">Quitar</button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ===== GroupSettingsModal ===== */
function GroupSettingsModal({ open, conv, userUid, db, storage: st, onClose }) {
  const [uploading, setUploading] = useState(false)
  const [editName, setEditName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const fileRef = useRef(null)
  const isAdmin = conv?.startedBy === userUid
  useEffect(() => { if (open) setEditName(conv?.groupName || '') }, [open, conv?.groupName])
  if (!open) return null
  async function handlePhoto(file) {
    if (!file || !conv?.id) return
    setUploading(true)
    try {
      const r = sRef(st, `conversations/${conv.id}/groupPhoto.jpg`)
      await uploadBytes(r, file, { contentType: 'image/jpeg' })
      const url = await getDownloadURL(r)
      await updateDoc(doc(db, 'conversations', conv.id), { groupPhotoURL: url })
    } catch (e) { console.error('group photo:', e) }
    finally { setUploading(false) }
  }
  async function saveName() {
    const name = editName.trim()
    if (!name || name === conv?.groupName) return
    setSavingName(true)
    try { await updateDoc(doc(db, 'conversations', conv.id), { groupName: name }) }
    catch (e) { console.error(e) }
    setSavingName(false)
  }
  const photoURL = conv?.groupPhotoURL || ''
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,92vw)] rounded-2xl border border-[var(--border)] bg-black overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <h3 className="font-semibold">Ajustes del grupo</h3>
          <button onClick={onClose} className="text-sm text-white/50 hover:text-white cursor-pointer transition">Cerrar</button>
        </div>
        <div className="p-5 space-y-5">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="h-24 w-24 rounded-full bg-[var(--bg3)] border border-[var(--border)] overflow-hidden flex items-center justify-center text-3xl font-bold text-white/70">
                {photoURL
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={photoURL} alt="" className="h-full w-full object-cover" />
                  : (conv?.groupName?.[0] || 'G').toUpperCase()}
              </div>
              {isAdmin && (
                <label className="absolute inset-0 grid place-content-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition cursor-pointer">
                  <CameraIcon className="w-7 h-7 text-white" />
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden"
                    onChange={async e => { const f = e.target.files?.[0]; if (f) await handlePhoto(f); if (fileRef.current) fileRef.current.value = '' }} />
                </label>
              )}
            </div>
            <div className="text-xs text-white/40">{uploading ? 'Subiendo foto…' : isAdmin ? 'Toca la foto para cambiarla' : ''}</div>
          </div>
          {isAdmin ? (
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Nombre del grupo</label>
              <div className="flex gap-2">
                <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={60}
                  className="flex-1 rounded-xl border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-white/30 transition" />
                <button onClick={saveName} disabled={savingName || !editName.trim() || editName.trim() === conv?.groupName}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition">
                  {savingName ? '…' : 'Guardar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center font-semibold text-lg">{conv?.groupName || 'Grupo'}</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ===== ForwardModal ===== */
function ForwardModal({ msg, convos, userMap, userUid, db, onClose }) {
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(null)
  const [sent, setSent] = useState(new Set())
  const filtered = (convos || []).filter(c => {
    if (!search) return true
    const otherId = (c.participantUids || []).find(u => u !== userUid) || ''
    const u = userMap?.[otherId]
    const name = (u?.profileName || u?.displayName || u?.usernameSlug || otherId || '').toLowerCase()
    return name.includes(search.toLowerCase())
  })
  async function forward(targetCid) {
    if (!msg || !targetCid || !userUid || !db) return
    setSending(targetCid)
    try {
      const textCipher = await encryptMessage(msg.text || '', targetCid, userUid)
      await addDoc(collection(db, 'conversations', targetCid, 'messages'), { type: 'text', textCipher, attachments: [], meta: { forwarded: true }, senderUid: userUid, at: serverTimestamp() })
      await updateDoc(doc(db, 'conversations', targetCid), { updatedAt: serverTimestamp(), lastMessage: { text: msg.text || '', senderUid: userUid, at: serverTimestamp() }, [`readAt.${userUid}`]: serverTimestamp() })
      setSent(prev => new Set([...prev, targetCid]))
    } catch (e) { console.error('Error reenviando:', e) }
    finally { setSending(null) }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--bg2)] border border-[var(--border)] rounded-2xl w-full max-w-sm p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="font-semibold">Reenviar a...</span>
          <button type="button" onClick={onClose} className="opacity-50 hover:opacity-100 p-1 rounded-full hover:bg-white/10">✕</button>
        </div>
        <input autoFocus placeholder="Buscar conversación..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-[var(--bg3)] rounded-xl px-3 py-2 text-sm outline-none border border-[var(--border)]" />
        <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
          {filtered.map(c => {
            const otherId = (c.participantUids || []).find(u => u !== userUid) || ''
            const u = userMap?.[otherId]
            const name = u?.profileName || u?.displayName || u?.usernameSlug || otherId || 'Usuario'
            const avatar = u?.avatarUrl || u?.photoURL || '/favicon.ico'
            const isSent = sent.has(c.id)
            return (
              <button key={c.id} type="button" disabled={sending === c.id || isSent} onClick={() => !isSent && forward(c.id)}
                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-sm text-left disabled:opacity-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatar} alt={name} className="w-8 h-8 rounded-full border border-[var(--border)] object-cover flex-shrink-0" />
                <span className="flex-1 truncate">{name}</span>
                {sending === c.id ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : isSent ? <CheckIcon className="w-4 h-4 text-green-400" /> : <span className="text-[var(--accent2)] text-xs">Enviar</span>}
              </button>
            )
          })}
          {!filtered.length && <div className="text-sm opacity-50 text-center py-4">Sin conversaciones</div>}
        </div>
        {sent.size > 0 && <button type="button" onClick={onClose} className="w-full py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent2)] text-sm font-medium transition">Listo</button>}
      </div>
    </div>
  )
}

/* ===== ChatComposer ===== */
function ChatComposer({ disabled, onSend, draftKey, onTyping }) {
  const [text, setText] = useState('')
  const typingTimerRef = useRef(null)
  const [pendingImages, setPendingImages] = useState([])
  const [showEmojiPanel, setShowEmojiPanel] = useState(false)
  const [emojiCat, setEmojiCat] = useState(0)
  const [viewOnce, setViewOnce] = useState(false)
  const viewOnceRef = useRef(false)
  useEffect(() => { viewOnceRef.current = viewOnce }, [viewOnce])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!draftKey) { setText(''); return }
    try {
      const saved = window.localStorage.getItem(draftKey)
      setText(typeof saved === 'string' && saved.length ? saved : '')
    } catch (_) { setText('') }
  }, [draftKey])

  function toastOnce(msg) {
    const id = 'composer-toast'
    let el = document.getElementById(id)
    if (!el) {
      el = document.createElement('div'); el.id = id
      Object.assign(el.style, { position: 'fixed', bottom: '110px', left: '50%', transform: 'translateX(-50%)', padding: '8px 12px', borderRadius: '10px', background: 'rgba(0,0,0,.85)', color: '#fff', fontSize: '12px', zIndex: '1000', pointerEvents: 'none' })
      document.body.appendChild(el)
    }
    el.textContent = msg; el.style.opacity = '1'
    setTimeout(() => { if (el) el.style.opacity = '0' }, 1800)
  }

  const [openMenu, setOpenMenu] = useState(false)
  const imgRef = useRef(null), fileRef = useRef(null), audioRef = useRef(null)
  const taRef = useRef(null)
  const MAX_HEIGHT_PX = 160
  const canSendText = !disabled && text.trim().length > 0
  const canSendImgs = !disabled && pendingImages.length > 0

  function autoGrow() {
    const el = taRef.current; if (!el) return
    el.style.height = 'auto'
    const next = Math.min(el.scrollHeight, MAX_HEIGHT_PX)
    el.style.height = next + 'px'
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? 'auto' : 'hidden'
  }
  useEffect(() => { autoGrow() }, [text])

  function pick(type) {
    if (type === 'image') imgRef.current?.click()
    if (type === 'file') fileRef.current?.click()
    if (type === 'audio') audioRef.current?.click()
    setOpenMenu(false)
  }

  function addPendingFiles(fileList) {
    const files = Array.from(fileList || []).filter(f => f && f.type?.startsWith('image/'))
    if (!files.length) return
    setPendingImages(prev => [...prev, ...files.map(f => ({ id: crypto.randomUUID(), file: f, url: URL.createObjectURL(f) }))])
  }
  function removePending(id) { setPendingImages(prev => prev.filter(x => x.id !== id)) }
  function clearPending() { setPendingImages([]) }

  async function handleFiles(list, kind) {
    if (disabled || !list?.length) return
    if (kind === 'image') { addPendingFiles(list); return }
    await onSend?.({ text: '', attachments: Array.from(list).map(f => ({ kind, file: f })) })
  }

  async function handlePaste(e) {
    if (!e.clipboardData) return
    const imgs = Array.from(e.clipboardData.items || []).filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean)
    if (imgs.length) { e.preventDefault(); addPendingFiles(imgs) }
  }

  async function submitText(e) {
    e?.preventDefault?.()
    if (!canSendText) return
    const t = text.trim()
    await onSend?.({ text: t, attachments: [] })
    setText('')
    if (typeof window !== 'undefined' && draftKey) { try { window.localStorage.removeItem(draftKey) } catch (_) { } }
    const el = taRef.current
    if (el) { el.style.height = 'auto'; el.style.overflowY = 'hidden' }
  }

  async function sendPendingImages() {
    if (!pendingImages.length) return
    const caption = (text || '').trim()
    await onSend?.({ text: caption, attachments: pendingImages.map(x => ({ kind: 'image', file: x.file })), viewOnce: viewOnceRef.current ?? viewOnce })
    clearPending(); setViewOnce(false); setText('')
    if (typeof window !== 'undefined' && draftKey) { try { window.localStorage.removeItem(draftKey) } catch (_) { } }
    const el = taRef.current
    if (el) { el.style.height = 'auto'; el.style.overflowY = 'hidden' }
  }

  function handleKeyDown(e) {
    if (disabled) return
    if (e.key === 'Enter' && !e.shiftKey && pendingImages.length === 0) { e.preventDefault(); submitText(e) }
  }

  const EmojiPanel = () => (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur shadow-xl overflow-hidden">
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1 border-b border-white/8 overflow-x-auto scrollbar-none">
        {EMOJI_CATS.map((cat, i) => (
          <button key={cat.label} type="button" title={cat.title} onClick={() => setEmojiCat(i)}
            className={clsx('shrink-0 text-lg px-2.5 py-1 rounded-lg transition cursor-pointer', emojiCat === i ? 'bg-white/15' : 'hover:bg-white/8 opacity-60 hover:opacity-100')}>
            {cat.label}
          </button>
        ))}
        <button type="button" onClick={() => setShowEmojiPanel(false)} className="cursor-pointer ml-auto p-1.5 rounded-full hover:bg-white/10 text-white/40 hover:text-white/80 transition">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-9 gap-0.5 p-2 max-h-44 overflow-y-auto">
        {EMOJI_CATS[emojiCat].emojis.map(e => (
          <button key={e} type="button" className="cursor-pointer text-xl p-1.5 rounded-lg hover:bg-white/10 transition hover:scale-110 active:scale-95"
            onClick={() => {
              const el = taRef.current; if (!el) return
              const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? el.value.length
              const next = (el.value ?? '').slice(0, start) + e + (el.value ?? '').slice(end)
              el.value = next; el.dispatchEvent(new Event('input', { bubbles: true }))
              el.focus(); el.setSelectionRange(start + e.length, start + e.length)
              setText(next)
            }}>
            {e}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="p-4">
      {pendingImages.length > 0 && (
        <div className="mb-3 rounded-2xl border border-[var(--border)] bg-black/80 backdrop-blur p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2 relative">
            <button type="button" onClick={() => { taRef.current?.focus(); setShowEmojiPanel(v => !v) }}
              className={clsx('p-2 rounded-lg transition cursor-pointer hover:bg-white/10', showEmojiPanel && 'bg-white/10 text-yellow-300')}>
              <FaceSmileIcon className="w-5 h-5" />
            </button>
            <div className="absolute right-12 -top-2 h-6 min-w-6 px-2 rounded-full bg-white/10 text-xs flex items-center justify-center">{pendingImages.length}</div>
            <button type="button" onClick={clearPending} className="p-2 rounded-lg hover:bg-white/10 cursor-pointer">🗑️</button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {pendingImages.map(img => (
              <div key={img.id} className="relative shrink-0">
                <img src={img.url} alt="" className="h-28 w-28 object-cover rounded-xl border border-[var(--border)]" />
                <button onClick={() => removePending(img.id)} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-black/80 border border-[var(--border)] hover:bg-black">×</button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-end gap-3">
            <button type="button"
              onClick={() => setViewOnce(v => { const nv = !v; toastOnce(nv ? 'La imagen se podrá ver una sola vez' : 'La imagen se podrá ver siempre'); return nv })}
              className={`h-8 min-w-8 px-3 rounded-full border transition cursor-pointer ${viewOnce ? 'bg-violet-500 text-black border-violet-500' : 'bg-white/10 border-[var(--border)]'}`}
              aria-pressed={viewOnce}>1</button>
            <button type="button" onClick={sendPendingImages} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500 text-black hover:brightness-95 cursor-pointer">Enviar</button>
          </div>
          {showEmojiPanel && <div className="mt-2"><EmojiPanel /></div>}
        </div>
      )}

      {showEmojiPanel && pendingImages.length === 0 && <div className="mb-2"><EmojiPanel /></div>}

      <form onSubmit={submitText}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button type="button" className="w-10 h-10 rounded-full border border-[var(--border)] flex items-center justify-center transition hover:bg-white/10 active:scale-95" disabled={disabled} onClick={() => setOpenMenu(v => !v)} style={{ cursor: disabled ? 'default' : 'pointer' }}>
              <PlusIcon className="w-5 h-5" />
            </button>
            {openMenu && !disabled && (
              <div className="absolute left-0 bottom-12 z-10 bg-black/90 border border-[var(--border)] rounded-xl p-2 text-sm shadow-lg">
                <button className="block px-3 py-1 w-full text-left hover:bg-white/10 rounded-lg" onClick={() => pick('image')}>Imagen</button>
                <button className="block px-3 py-1 w-full text-left hover:bg-white/10 rounded-lg" onClick={() => pick('file')}>Archivo</button>
                <button className="block px-3 py-1 w-full text-left hover:bg-white/10 rounded-lg" onClick={() => pick('audio')}>Audio</button>
              </div>
            )}
          </div>
          <input ref={imgRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleFiles(e.target.files, 'image')} />
          <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files, 'file')} />
          <input ref={audioRef} type="file" accept="audio/*" multiple className="hidden" onChange={e => handleFiles(e.target.files, 'audio')} />
          <div className="relative flex items-end gap-2 rounded-full border border-[var(--border)] px-2 py-2 flex-1 overflow-hidden">
            <button type="button" onClick={() => { taRef.current?.focus(); setShowEmojiPanel(v => !v) }}
              className={clsx('p-2 rounded-lg transition cursor-pointer hover:bg-white/10', showEmojiPanel && 'bg-white/10 text-yellow-300')}>
              <FaceSmileIcon className="w-5 h-5" />
            </button>
            <textarea ref={taRef}
              className="flex-1 bg-transparent outline-none text-sm resize-none leading-5 min-h-[36px] px-3 md:px-4 mr-2"
              placeholder={disabled ? 'No puedes enviar en esta conversación' : 'Mensaje'}
              value={text}
              onChange={e => {
                const v = e.target.value; setText(v)
                if (typeof window !== 'undefined' && draftKey) {
                  try { if (v && v.trim().length) window.localStorage.setItem(draftKey, v); else window.localStorage.removeItem(draftKey) } catch (_) { }
                }
                if (onTyping && v.trim().length) {
                  onTyping(true); clearTimeout(typingTimerRef.current)
                  typingTimerRef.current = setTimeout(() => onTyping(false), 3000)
                } else if (onTyping) { clearTimeout(typingTimerRef.current); onTyping(false) }
              }}
              onInput={autoGrow} onKeyDown={handleKeyDown} onPaste={handlePaste}
              disabled={disabled} rows={1} inputMode="text" enterKeyHint="send"
              style={{ height: 'auto', overflowY: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word', paddingRight: '0.75rem', paddingLeft: '0.75rem' }} />
            <button type="submit"
              className={clsx('shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90', canSendText ? 'bg-[var(--accent)] hover:bg-[var(--accent2)] cursor-pointer' : 'bg-white/8 text-white/30 cursor-default')}
              disabled={!canSendText}>
              <PaperAirplaneIcon className="w-4 h-4 -rotate-45 translate-x-px" />
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}