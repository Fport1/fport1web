'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth-context'
import { db } from '@/lib/firebase'
import {
  collection, doc, onSnapshot, orderBy, query,
  setDoc, deleteDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import AvengersLogo from '@/components/AvengersLogo'

// ── Datos reales de la película ─────────────────────────────
// Estreno internacional: 18 dic 2026 · Latam (CO/MX): 17 dic 2026
// Duración: 2h 45min · Dir: Anthony & Joe Russo · RDJ es Doctor Doom
// Preventa EE.UU.: 20 de julio 2026 · Latam: por anunciar
const PREMIERE = new Date('2026-12-17T00:00:00')
const ADMIN_SLUG = 'fport1'

function getInitial(name) {
  return name ? name.trim()[0].toUpperCase() : '?'
}

function Avatar({ photoURL, name, size = 44 }) {
  const [err, setErr] = useState(false)
  if (photoURL && !err) {
    return <img src={photoURL} alt={name} onError={() => setErr(true)}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(34,197,94,.4)' }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #14532d, #166534)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.42, fontWeight: 700, color: '#dcfce7', flexShrink: 0,
      border: '2px solid rgba(34,197,94,.4)',
    }}>
      {getInitial(name)}
    </div>
  )
}

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const diff = Math.max(0, target.getTime() - now)
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor(diff / 3600000) % 24,
    mins: Math.floor(diff / 60000) % 60,
    secs: Math.floor(diff / 1000) % 60,
  }
}

export default function DoomsdayPage() {
  const { user, profile, loading } = useAuth()
  const [rsvps, setRsvps] = useState([])
  const [busy, setBusy] = useState(false)
  const [seatDrafts, setSeatDrafts] = useState({})
  const { days, hours, mins, secs } = useCountdown(PREMIERE)

  const isAdmin = profile?.usernameSlug === ADMIN_SLUG
  const mine = user ? rsvps.find(r => r.uid === user.uid) : null

  useEffect(() => {
    if (!db) return
    const q = query(collection(db, 'doomsday_rsvps'), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q,
      snap => setRsvps(snap.docs.map(d => ({ uid: d.id, ...d.data() }))),
      () => {})
    return () => unsub()
  }, [])

  async function confirmGoing() {
    if (!user || busy) return
    setBusy(true)
    try {
      await setDoc(doc(db, 'doomsday_rsvps', user.uid), {
        uid: user.uid,
        profileName: profile?.profileName || user.displayName || user.email?.split('@')[0] || 'Sin nombre',
        username: profile?.username || null,
        photoURL: profile?.photoURL || user.photoURL || null,
        seat: null,
        createdAt: serverTimestamp(),
      })
    } catch (e) { console.error(e) }
    setBusy(false)
  }

  async function cancelGoing() {
    if (!user || busy) return
    setBusy(true)
    try { await deleteDoc(doc(db, 'doomsday_rsvps', user.uid)) } catch (e) { console.error(e) }
    setBusy(false)
  }

  // ── Admin actions ──
  async function saveSeat(uid) {
    const seat = (seatDrafts[uid] ?? '').trim()
    try {
      await updateDoc(doc(db, 'doomsday_rsvps', uid), { seat: seat || null })
      setSeatDrafts(d => ({ ...d, [uid]: undefined }))
    } catch (e) { console.error(e) }
  }

  async function removePerson(uid) {
    try { await deleteDoc(doc(db, 'doomsday_rsvps', uid)) } catch (e) { console.error(e) }
  }

  return (
    <main className="dd-page">
      {/* Ambient glow */}
      <div className="dd-glow" />

      {/* ── Hero ── */}
      <section className="dd-hero">
        <div className="dd-badge">
          <span className="dd-badge-dot" />
          Preventa EE.UU.: 20 de julio · Latam: por anunciar
        </div>

        <div className="dd-logo-wrap">
          <AvengersLogo size={84} style={{ color: '#22c55e', filter: 'drop-shadow(0 0 24px rgba(34,197,94,.5))' }} />
        </div>

        <h1 className="dd-title">
          AVENGERS<span className="dd-title-sep">:</span> <span className="dd-title-green">DOOMSDAY</span>
        </h1>

        <p className="dd-meta">
          Estreno en Colombia: <strong>17 de diciembre de 2026</strong> · 2h 45min<br />
          Dir. Anthony & Joe Russo · Robert Downey Jr. es <strong>Doctor Doom</strong>
        </p>

        {/* Countdown */}
        <div className="dd-countdown">
          {[[days, 'días'], [hours, 'horas'], [mins, 'min'], [secs, 'seg']].map(([v, l]) => (
            <div key={l} className="dd-count-box">
              <span className="dd-count-num">{String(v).padStart(2, '0')}</span>
              <span className="dd-count-label">{l}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── RSVP ── */}
      <section className="dd-card">
        <h2 className="dd-section-title">🎬 ¿Vas a ir al estreno?</h2>
        <p className="dd-section-sub">
          Confirma tu asistencia para coordinar la preventa en grupo. Cuando abra la preventa,
          se disputarán las sillas de la sala — <strong>@fport1</strong> coordina todo.
        </p>

        {loading ? (
          <p className="dd-muted">Cargando…</p>
        ) : !user ? (
          <Link href="/login" className="dd-btn dd-btn-outline">Inicia sesión para confirmar</Link>
        ) : mine ? (
          <div className="dd-confirmed">
            <div className="dd-confirmed-check">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
              <span>Estás en la lista{mine.seat ? <> — silla <strong>{mine.seat}</strong></> : ''}</span>
            </div>
            <button onClick={cancelGoing} disabled={busy} className="dd-btn dd-btn-danger">
              Ya no voy 😔
            </button>
          </div>
        ) : (
          <button onClick={confirmGoing} disabled={busy} className="dd-btn dd-btn-main">
            ¡CONFIRMO, VOY! 🍿
          </button>
        )}
      </section>

      {/* ── Lista ── */}
      <section className="dd-card">
        <h2 className="dd-section-title">
          🦸 Reclutados <span className="dd-count-pill">{rsvps.length}</span>
        </h2>

        {rsvps.length === 0 ? (
          <p className="dd-muted">Nadie ha confirmado todavía. ¡Sé el primero!</p>
        ) : (
          <div className="dd-list">
            {rsvps.map(r => (
              <div key={r.uid} className="dd-person">
                <Avatar photoURL={r.photoURL} name={r.profileName} />
                <div className="dd-person-info">
                  <p className="dd-person-name">{r.profileName}</p>
                  {r.username && <p className="dd-person-user">@{String(r.username).replace(/^@/, '')}</p>}
                </div>
                {r.seat && <span className="dd-seat-badge">💺 {r.seat}</span>}

                {isAdmin && (
                  <div className="dd-admin-controls">
                    <input
                      className="dd-seat-input"
                      placeholder="Silla (ej: F7)"
                      value={seatDrafts[r.uid] ?? r.seat ?? ''}
                      onChange={e => setSeatDrafts(d => ({ ...d, [r.uid]: e.target.value }))}
                      maxLength={8}
                    />
                    <button className="dd-mini-btn" onClick={() => saveSeat(r.uid)} title="Guardar silla">✓</button>
                    <button className="dd-mini-btn dd-mini-danger" onClick={() => removePerson(r.uid)} title="Quitar de la lista">✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {isAdmin && rsvps.length > 0 && (
          <p className="dd-admin-note">
            🛡️ Modo admin — puedes asignar sillas y quitar gente de la lista.
          </p>
        )}
      </section>

      {/* ── Info preventa ── */}
      <section className="dd-card">
        <h2 className="dd-section-title">🎟️ Datos de la preventa</h2>
        <ul className="dd-info-list">
          <li><strong>20 de julio de 2026</strong> — arranca la venta de boletas en EE.UU. (antes del panel en la Comic-Con de San Diego).</li>
          <li><strong>Latinoamérica</strong> — la fecha de preventa aún no está confirmada; se anunciará cerca del estreno. Aquí coordinamos para caerle el día uno.</li>
          <li><strong>17 de diciembre de 2026</strong> — estreno en cines de Colombia y Latam (18 dic internacional).</li>
          <li><strong>Duración:</strong> 2 horas y 45 minutos. Llega con tiempo y con crispetas.</li>
        </ul>
      </section>

      <style>{`
        .dd-page {
          min-height: 100vh;
          max-width: 860px;
          margin: 0 auto;
          padding: 100px 20px 60px;
          position: relative;
          z-index: 1;
        }
        .dd-glow {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background:
            radial-gradient(ellipse 70% 45% at 50% -5%, rgba(34,197,94,.14), transparent 60%),
            radial-gradient(ellipse 45% 35% at 85% 100%, rgba(20,83,45,.18), transparent 65%);
        }
        .dd-hero { text-align: center; margin-bottom: 36px; position: relative; }
        .dd-badge {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
          color: #86efac; background: rgba(34,197,94,.08);
          border: 1px solid rgba(34,197,94,.3); border-radius: 999px;
          padding: 6px 16px; margin-bottom: 26px;
        }
        .dd-badge-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #22c55e;
          box-shadow: 0 0 10px #22c55e; animation: dd-pulse 1.6s infinite;
        }
        @keyframes dd-pulse { 50% { opacity: .35; } }
        .dd-logo-wrap { margin-bottom: 14px; }
        .dd-title {
          font-family: 'Rajdhani', sans-serif;
          font-size: clamp(34px, 7vw, 58px);
          font-weight: 700; letter-spacing: .04em;
          color: var(--text); margin: 0 0 12px; line-height: 1.05;
        }
        .dd-title-sep { color: #22c55e; }
        .dd-title-green {
          color: #22c55e;
          text-shadow: 0 0 34px rgba(34,197,94,.55);
        }
        .dd-meta { color: var(--sub); font-size: 14px; line-height: 1.8; }
        .dd-meta strong { color: #86efac; }
        .dd-countdown { display: flex; justify-content: center; gap: 12px; margin-top: 26px; }
        .dd-count-box {
          background: rgba(10, 22, 14, .85);
          border: 1px solid rgba(34,197,94,.25);
          border-radius: 12px; padding: 12px 0; width: 76px;
          display: flex; flex-direction: column; align-items: center;
          box-shadow: 0 0 24px rgba(34,197,94,.07), inset 0 1px 0 rgba(134,239,172,.08);
        }
        .dd-count-num {
          font-family: 'Rajdhani', sans-serif;
          font-size: 30px; font-weight: 700; color: #4ade80; line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .dd-count-label { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-top: 5px; }
        .dd-card {
          background: rgba(13, 20, 15, .88);
          border: 1px solid rgba(34,197,94,.18);
          border-radius: 18px; padding: 28px;
          margin-bottom: 22px;
          box-shadow: 0 0 40px rgba(34,197,94,.05);
        }
        .dd-section-title {
          font-family: 'Rajdhani', sans-serif;
          font-size: 22px; font-weight: 700; color: var(--text);
          margin: 0 0 8px; display: flex; align-items: center; gap: 10px;
        }
        .dd-count-pill {
          font-size: 13px; font-weight: 700; color: #071b10;
          background: #22c55e; border-radius: 999px; padding: 2px 12px;
          box-shadow: 0 0 14px rgba(34,197,94,.5);
        }
        .dd-section-sub { color: var(--sub); font-size: 14px; line-height: 1.7; margin-bottom: 20px; }
        .dd-section-sub strong { color: #86efac; }
        .dd-muted { color: var(--muted); font-size: 14px; }
        .dd-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          border: none; border-radius: 12px; cursor: pointer;
          font-size: 15px; font-weight: 700; padding: 14px 30px;
          text-decoration: none; transition: all .2s;
          font-family: 'Rajdhani', sans-serif; letter-spacing: .05em;
        }
        .dd-btn-main {
          background: linear-gradient(135deg, #16a34a, #15803d);
          color: #fff; font-size: 17px;
          box-shadow: 0 0 30px rgba(34,197,94,.35);
        }
        .dd-btn-main:hover { box-shadow: 0 0 46px rgba(34,197,94,.6); transform: translateY(-1px); }
        .dd-btn-main:disabled { opacity: .6; cursor: not-allowed; transform: none; }
        .dd-btn-outline {
          background: transparent; border: 1px solid rgba(34,197,94,.45); color: #4ade80;
        }
        .dd-btn-outline:hover { background: rgba(34,197,94,.1); }
        .dd-btn-danger {
          background: transparent; border: 1px solid rgba(239,68,68,.35); color: #f87171;
          font-size: 13px; padding: 9px 18px;
        }
        .dd-btn-danger:hover { background: rgba(239,68,68,.1); }
        .dd-confirmed { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
        .dd-confirmed-check {
          display: flex; align-items: center; gap: 10px;
          color: #86efac; font-size: 15px; font-weight: 600;
          background: rgba(34,197,94,.08); border: 1px solid rgba(34,197,94,.3);
          border-radius: 12px; padding: 12px 20px;
        }
        .dd-list { display: flex; flex-direction: column; gap: 10px; }
        .dd-person {
          display: flex; align-items: center; gap: 14px;
          background: rgba(9, 14, 10, .7);
          border: 1px solid rgba(34,197,94,.12);
          border-radius: 12px; padding: 12px 16px;
          transition: border-color .2s;
        }
        .dd-person:hover { border-color: rgba(34,197,94,.35); }
        .dd-person-info { flex: 1; min-width: 0; }
        .dd-person-name { font-size: 14px; font-weight: 600; color: var(--text); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dd-person-user { font-size: 12px; color: var(--muted); margin: 0; }
        .dd-seat-badge {
          font-size: 12px; font-weight: 700; color: #86efac;
          background: rgba(34,197,94,.12); border: 1px solid rgba(34,197,94,.3);
          border-radius: 8px; padding: 4px 10px; white-space: nowrap;
        }
        .dd-admin-controls { display: flex; align-items: center; gap: 6px; }
        .dd-seat-input {
          width: 90px; background: var(--bg); border: 1px solid var(--border);
          border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--text);
          outline: none;
        }
        .dd-seat-input:focus { border-color: #22c55e; }
        .dd-mini-btn {
          width: 28px; height: 28px; border-radius: 8px; border: 1px solid rgba(34,197,94,.35);
          background: transparent; color: #4ade80; font-size: 13px; cursor: pointer;
          transition: background .15s;
        }
        .dd-mini-btn:hover { background: rgba(34,197,94,.15); }
        .dd-mini-danger { border-color: rgba(239,68,68,.35); color: #f87171; }
        .dd-mini-danger:hover { background: rgba(239,68,68,.12); }
        .dd-admin-note { margin-top: 16px; font-size: 12px; color: var(--muted); }
        .dd-info-list { list-style: none; padding: 0; margin: 14px 0 0; display: flex; flex-direction: column; gap: 12px; }
        .dd-info-list li {
          font-size: 14px; color: var(--sub); line-height: 1.7;
          padding-left: 18px; position: relative;
        }
        .dd-info-list li::before {
          content: ''; position: absolute; left: 0; top: 9px;
          width: 7px; height: 7px; border-radius: 2px;
          background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,.6);
          transform: rotate(45deg);
        }
        .dd-info-list strong { color: #86efac; }
        @media (max-width: 560px) {
          .dd-person { flex-wrap: wrap; }
          .dd-admin-controls { width: 100%; justify-content: flex-end; }
          .dd-count-box { width: 64px; }
        }
      `}</style>
    </main>
  )
}
