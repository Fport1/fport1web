'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/auth-context'
import { db } from '@/lib/firebase'
import {
  collection, doc, getDocs, onSnapshot, orderBy, query,
  setDoc, deleteDoc, updateDoc, serverTimestamp, limit, increment,
} from 'firebase/firestore'
import AvengersLogo from '@/components/AvengersLogo'
import { useDoomsdayAccess, DOOMSDAY_ADMIN_SLUG } from '@/lib/useDoomsdayAccess'
import { notificar } from '@/lib/notify'

// ── Datos de la función ─────────────────────────────────────
// Estreno en Colombia: ventana del 16 al 18 de diciembre de 2026.
// La función exacta (noche) se define cuando abra la preventa.
const PREMIERE = new Date('2026-12-16T20:00:00')
const LEAVE_WAIT_S = 3 // segundos de espera antes de poder confirmar la salida

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

/**
 * Confirmación de salida: el botón se desbloquea tras unos segundos.
 * Un solo toque — pensado para que funcione igual de bien desde el celular.
 */
function LeaveConfirm({ onConfirm, onCancel }) {
  const [left, setLeft] = useState(LEAVE_WAIT_S)
  const [going, setGoing] = useState(false)

  useEffect(() => {
    if (left <= 0) return
    const id = setTimeout(() => setLeft(l => l - 1), 1000)
    return () => clearTimeout(id)
  }, [left])

  const ready = left <= 0

  return (
    <div className="dd-leave-box">
      <p className="dd-leave-text">
        ¿Seguro que ya no vas? Se libera tu cupo y tendrías que volver a confirmar.
      </p>
      <div className="dd-leave-actions">
        <button
          className="dd-leave-confirm"
          disabled={!ready || going}
          onClick={() => { setGoing(true); onConfirm() }}
          type="button"
        >
          {going ? 'Saliendo…' : ready ? 'Sí, ya no voy' : `Espera ${left}s…`}
        </button>
        <button className="dd-btn-ghost" onClick={onCancel} type="button">Mejor me quedo</button>
      </div>
    </div>
  )
}

export default function DoomsdayPage() {
  const router = useRouter()
  const { user, profile, loading, switching } = useAuth()
  const { isAdmin, hasAccess, checking } = useDoomsdayAccess(user?.uid, profile?.usernameSlug)

  const [rsvps, setRsvps]     = useState([])
  const [access, setAccess]   = useState([])
  const [goingCount, setGoingCount] = useState(null)
  const [busy, setBusy]       = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Admin: búsqueda de usuarios
  const [allUsers, setAllUsers]   = useState(null)
  const [term, setTerm]           = useState('')
  const [loadingUsers, setLoadingUsers] = useState(false)

  // Admin: borradores de los campos por persona
  const [drafts, setDrafts] = useState({})

  const { days, hours, mins, secs } = useCountdown(PREMIERE)
  const mine = user ? rsvps.find(r => r.uid === user.uid) : null
  const locked = !!mine?.bought // si ya compró boleta no puede salirse

  // ── Acceso: sin sesión al login; con sesión pero sin permiso, a la home ──
  useEffect(() => {
    if (loading || switching || checking) return
    if (!user) { router.push('/login'); return }
    if (!hasAccess) router.push('/')
  }, [loading, switching, checking, user, hasAccess, router])

  // ── Lista de asistentes ──
  // Solo el admin ve quién está. Los demás únicamente leen su propio registro
  // (y las reglas de Firestore tampoco les dejan listar la colección).
  useEffect(() => {
    if (!db || !user || !hasAccess) return

    if (isAdmin) {
      const q = query(collection(db, 'doomsday_rsvps'), orderBy('createdAt', 'asc'))
      const unsub = onSnapshot(q,
        snap => setRsvps(snap.docs.map(d => ({ uid: d.id, ...d.data() }))),
        () => {})
      return () => unsub()
    }

    const unsub = onSnapshot(doc(db, 'doomsday_rsvps', user.uid),
      snap => setRsvps(snap.exists() ? [{ uid: snap.id, ...snap.data() }] : []),
      () => {})
    return () => unsub()
  }, [user, hasAccess, isAdmin])

  // Cuántos van. Va en un documento aparte porque la colección de asistentes
  // no se puede listar: así se ve el número sin poder ver los nombres.
  useEffect(() => {
    if (!db || !user || !hasAccess) return
    const unsub = onSnapshot(doc(db, 'doomsday_meta', 'stats'),
      snap => setGoingCount(snap.exists() ? (snap.data().count ?? 0) : 0),
      () => setGoingCount(null))
    return () => unsub()
  }, [user, hasAccess])

  // ── Accesos concedidos (solo admin) ──
  useEffect(() => {
    if (!db || !isAdmin) return
    const unsub = onSnapshot(collection(db, 'doomsday_access'),
      snap => setAccess(snap.docs.map(d => ({ uid: d.id, ...d.data() }))),
      () => {})
    return () => unsub()
  }, [isAdmin])

  async function confirmGoing() {
    if (!user || busy) return
    setBusy(true)
    try {
      await setDoc(doc(db, 'doomsday_rsvps', user.uid), {
        uid: user.uid,
        profileName: profile?.profileName || user.displayName || user.email?.split('@')[0] || 'Sin nombre',
        username: profile?.username || null,
        email: user.email || null,
        photoURL: profile?.photoURL || user.photoURL || null,
        seat: null,
        bought: false,
        tickets: 0,
        boughtFor: null,
        createdAt: serverTimestamp(),
      })
      await bumpCount(1)
    } catch (e) { console.error(e) }
    setBusy(false)
  }

  async function leaveList() {
    if (!user || locked) return
    try {
      await deleteDoc(doc(db, 'doomsday_rsvps', user.uid))
      await bumpCount(-1)
    } catch (e) { console.error(e) }
    setLeaving(false)
  }

  /** Ajusta el contador público en ±1. Si falla, no se pierde nada: el admin
   *  siempre ve la lista real y puede recalcularlo. */
  async function bumpCount(delta) {
    try {
      await setDoc(doc(db, 'doomsday_meta', 'stats'), { count: increment(delta) }, { merge: true })
    } catch (e) { console.warn('[doomsday:contador]', e?.code) }
  }

  // ── Admin: búsqueda de usuarios ──
  async function loadUsers() {
    if (allUsers || loadingUsers) return
    setLoadingUsers(true)
    try {
      const snap = await getDocs(query(collection(db, 'users'), limit(300)))
      setAllUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
    } catch (e) { console.error(e) }
    setLoadingUsers(false)
  }

  const t = term.trim().toLowerCase()
  const results = !t ? [] : (allUsers || []).filter(u => {
    const hay = [u.profileName, u.username, u.usernameSlug, u.email]
      .filter(Boolean).join(' ').toLowerCase()
    return hay.includes(t)
  }).slice(0, 8)

  async function grantAccess(u) {
    try {
      await setDoc(doc(db, 'doomsday_access', u.uid), {
        uid: u.uid,
        profileName: u.profileName || u.usernameSlug || 'Sin nombre',
        username: u.username || null,
        email: u.email || null,
        photoURL: u.photoURL || null,
        grantedAt: serverTimestamp(),
      })
      notificar({ toUid: u.uid, fromUid: user.uid, type: 'doomsday_access', from: profile })
      setTerm('')
    } catch (e) { console.error(e) }
  }

  async function revokeAccess(uid) {
    try { await deleteDoc(doc(db, 'doomsday_access', uid)) } catch (e) { console.error(e) }
  }

  // ── Admin: control de boletas ──
  function draftOf(r) {
    return drafts[r.uid] ?? {
      seat: r.seat ?? '', tickets: r.tickets ?? 0, boughtFor: r.boughtFor ?? '',
    }
  }

  function setDraft(uid, patch) {
    setDrafts(d => ({ ...d, [uid]: { ...(d[uid] ?? {}), ...patch } }))
  }

  async function toggleBought(r) {
    const next = !r.bought
    try {
      await updateDoc(doc(db, 'doomsday_rsvps', r.uid), {
        bought: next,
        tickets: next ? Math.max(1, Number(draftOf(r).tickets) || 1) : 0,
      })
    } catch (e) { console.error(e) }
  }

  async function saveRow(r) {
    const d = draftOf(r)
    try {
      await updateDoc(doc(db, 'doomsday_rsvps', r.uid), {
        seat: String(d.seat).trim() || null,
        tickets: Math.max(0, Number(d.tickets) || 0),
        boughtFor: String(d.boughtFor).trim() || null,
      })
      setDrafts(x => ({ ...x, [r.uid]: undefined }))
    } catch (e) { console.error(e) }
  }

  async function removePerson(uid) {
    try {
      await deleteDoc(doc(db, 'doomsday_rsvps', uid))
      await bumpCount(-1)
    } catch (e) { console.error(e) }
  }

  /** Recalcula el contador con la lista real (solo admin, que sí puede verla). */
  async function resyncCount() {
    try {
      await setDoc(doc(db, 'doomsday_meta', 'stats'), { count: rsvps.length }, { merge: true })
    } catch (e) { console.error(e) }
  }

  // Sin sesión o sin permiso no se muestra nada
  if (loading || switching || checking || !user || !hasAccess) {
    return (
      <main className="dd-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Cargando…</p>
      </main>
    )
  }

  const totalTickets = rsvps.reduce((n, r) => n + (Number(r.tickets) || 0), 0)
  const boughtCount  = rsvps.filter(r => r.bought).length

  return (
    <main className="dd-page">
      <div className="dd-glow" />

      {/* ── Hero ── */}
      <section className="dd-hero">
        <div className="dd-badge">
          <span className="dd-badge-dot" />
          Preventa Latam: se rumora que mañana
        </div>

        <div className="dd-logo-wrap">
          <AvengersLogo size={84} style={{ color: '#22c55e', filter: 'drop-shadow(0 0 24px rgba(34,197,94,.5))' }} />
        </div>

        <h1 className="dd-title">
          AVENGERS<span className="dd-title-sep">:</span> <span className="dd-title-green">DOOMSDAY</span>
        </h1>

        <p className="dd-meta">
          Estreno en Colombia: <strong>16 al 18 de diciembre de 2026</strong><br />
          Dir. Anthony &amp; Joe Russo · Robert Downey Jr. es <strong>Doctor Doom</strong>
        </p>

        {/* Sinopsis y código de vestir */}
        <div className="dd-hero-facts">
          <div className="dd-fact">
            <span className="dd-fact-label">Sinopsis</span>
            <span className="dd-fact-value dd-fact-big">3 Universos</span>
          </div>
          <div className="dd-fact">
            <span className="dd-fact-label">Código de vestir</span>
            <span className="dd-fact-value">🎭 Gala y túnica verde</span>
          </div>
        </div>

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

        {mine ? (
          <>
            <div className="dd-confirmed">
              <div className="dd-status-pill">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                <span>Estás en la lista{mine.seat ? <> — silla <strong>{mine.seat}</strong></> : ''}</span>
              </div>

              {locked ? (
                <div className="dd-status-pill dd-status-locked">
                  <span>🔒</span>
                  <span>Boleta comprada — ya no puedes salirte</span>
                </div>
              ) : !leaving ? (
                <button className="dd-status-pill dd-status-danger" onClick={() => setLeaving(true)}>
                  Ya no voy 😔
                </button>
              ) : null}
            </div>

            {leaving && !locked && (
              <LeaveConfirm onConfirm={leaveList} onCancel={() => setLeaving(false)} />
            )}
          </>
        ) : (
          <button onClick={confirmGoing} disabled={busy} className="dd-btn dd-btn-main">
            ¡CONFIRMO, VOY! 🍿
          </button>
        )}
      </section>

      {/* ── Reclutados: se ve cuántos van, nunca quiénes ── */}
      {!isAdmin && (
        <section className="dd-card">
          <h2 className="dd-section-title">🦸 Reclutados</h2>
          <div className="dd-recruited">
            <span className="dd-recruited-num">{goingCount ?? '—'}</span>
            <span className="dd-recruited-label">
              {goingCount === 1 ? 'persona confirmada' : 'personas confirmadas'}
            </span>
          </div>
          <p className="dd-section-sub" style={{ marginTop: 18, marginBottom: 0 }}>
            🔒 Solo se muestra el número. Quién va y quién no lo maneja <strong>@fport1</strong>.
          </p>
        </section>
      )}

      {/* ── Info de la función ── */}
      <section className="dd-card">
        <h2 className="dd-section-title">🎟️ Datos de la función</h2>
        <ul className="dd-info-list">
          <li><strong>Preventa:</strong> según rumores abre <strong>mañana</strong>. Nada oficial todavía — hay que estar pendientes para caerle apenas abra.</li>
          <li><strong>Nuestra función:</strong> será entre el <strong>16 y el 18 de diciembre, por la noche</strong>. El día exacto se define cuando abra la preventa.</li>
          <li><strong>El día de la función:</strong> llegar <strong>2 horas antes</strong> al <strong>Centro Comercial Buenavista</strong>.</li>
          <li><strong>Código de vestir:</strong> gala y túnica verde. Sin excusas.</li>
        </ul>
      </section>

      {/* ══════════ ZONA ADMIN (dorada) ══════════ */}
      {isAdmin && (
        <>
          <div className="dd-admin-divider">
            <span className="dd-admin-divider-line" />
            <span className="dd-admin-divider-text">🛡️ Zona de administración — solo tú ves esto</span>
            <span className="dd-admin-divider-line" />
          </div>

          {/* Resumen */}
          <section className="dd-card dd-gold">
            <h2 className="dd-gold-title">📊 Resumen</h2>
            <div className="dd-stats">
              <div className="dd-stat">
                <span className="dd-stat-num">{rsvps.length}</span>
                <span className="dd-stat-label">confirmados</span>
              </div>
              <div className="dd-stat">
                <span className="dd-stat-num">{boughtCount}</span>
                <span className="dd-stat-label">con boleta</span>
              </div>
              <div className="dd-stat">
                <span className="dd-stat-num">{totalTickets}</span>
                <span className="dd-stat-label">boletas totales</span>
              </div>
              <div className="dd-stat">
                <span className="dd-stat-num">{access.length}</span>
                <span className="dd-stat-label">con acceso</span>
              </div>
            </div>

            {/* El contador que ve el resto vive en un documento aparte; si se
                descuadra, aquí se vuelve a cuadrar con la lista real. */}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="dd-gold-sub" style={{ margin: 0 }}>
                Los demás ven <strong>{goingCount ?? '—'}</strong> confirmados
                {goingCount !== null && goingCount !== rsvps.length && ' (no cuadra con la lista real)'}
              </span>
              {goingCount !== rsvps.length && (
                <button className="dd-gold-btn" onClick={resyncCount}>Cuadrar contador</button>
              )}
            </div>
          </section>

          {/* Accesos */}
          <section className="dd-card dd-gold">
            <h2 className="dd-gold-title">🔑 Dar acceso a la página</h2>
            <p className="dd-gold-sub">
              Busca por nombre, usuario o correo. Al darle acceso, a esa persona le aparece
              el botón de Avengers en el menú y puede entrar aquí.
            </p>

            <input
              className="dd-search"
              placeholder="Buscar por nombre, @usuario o correo…"
              value={term}
              onFocus={loadUsers}
              onChange={e => setTerm(e.target.value)}
            />
            {loadingUsers && <p className="dd-muted" style={{ marginTop: 10 }}>Cargando usuarios…</p>}

            {t && results.length === 0 && !loadingUsers && (
              <p className="dd-muted" style={{ marginTop: 10 }}>Sin resultados para “{term}”.</p>
            )}

            {results.length > 0 && (
              <div className="dd-list" style={{ marginTop: 12 }}>
                {results.map(u => {
                  const already = access.some(a => a.uid === u.uid) || u.usernameSlug === DOOMSDAY_ADMIN_SLUG
                  return (
                    <div key={u.uid} className="dd-person dd-person-gold">
                      <Avatar photoURL={u.photoURL} name={u.profileName} size={36} />
                      <div className="dd-person-info">
                        <p className="dd-person-name">{u.profileName || u.usernameSlug}</p>
                        <p className="dd-person-user">
                          {u.username ? `@${String(u.username).replace(/^@/, '')}` : ''}
                          {u.email ? ` · ${u.email}` : ''}
                        </p>
                      </div>
                      {already ? (
                        <span className="dd-tag dd-tag-gold">Ya tiene acceso</span>
                      ) : (
                        <button className="dd-gold-btn" onClick={() => grantAccess(u)}>Dar acceso</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <h3 className="dd-gold-subtitle">Personas con acceso ({access.length})</h3>
            {access.length === 0 ? (
              <p className="dd-muted">Todavía nadie más tiene acceso.</p>
            ) : (
              <div className="dd-list">
                {access.map(a => (
                  <div key={a.uid} className="dd-person dd-person-gold">
                    <Avatar photoURL={a.photoURL} name={a.profileName} size={36} />
                    <div className="dd-person-info">
                      <p className="dd-person-name">{a.profileName}</p>
                      <p className="dd-person-user">
                        {a.username ? `@${String(a.username).replace(/^@/, '')}` : ''}
                        {a.email ? ` · ${a.email}` : ''}
                      </p>
                    </div>
                    <button className="dd-mini-btn dd-mini-danger" onClick={() => revokeAccess(a.uid)} title="Quitar acceso">✕</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Control de boletas */}
          <section className="dd-card dd-gold">
            <h2 className="dd-gold-title">
              🎫 Reclutados, boletas y sillas <span className="dd-count-pill">{rsvps.length}</span>
            </h2>
            <p className="dd-gold-sub">
              Marca quién ya compró. Al marcar <strong>Comprada</strong> esa persona queda bloqueada
              y no puede salirse de la lista.
            </p>

            {rsvps.length === 0 ? (
              <p className="dd-muted">Nadie en la lista todavía.</p>
            ) : (
              <div className="dd-list">
                {rsvps.map(r => {
                  const d = draftOf(r)
                  const dirty = !!drafts[r.uid]
                  return (
                    <div key={r.uid} className="dd-ticket-row">
                      <div className="dd-ticket-head">
                        <Avatar photoURL={r.photoURL} name={r.profileName} size={36} />
                        <div className="dd-person-info">
                          <p className="dd-person-name">{r.profileName}</p>
                          <p className="dd-person-user">
                            {r.username ? `@${String(r.username).replace(/^@/, '')}` : ''}
                            {r.email ? ` · ${r.email}` : ''}
                          </p>
                        </div>
                        <button
                          className={`dd-bought-toggle ${r.bought ? 'on' : ''}`}
                          onClick={() => toggleBought(r)}
                        >
                          {r.bought ? '🎟️ Comprada' : 'Sin comprar'}
                        </button>
                        <button className="dd-mini-btn dd-mini-danger" onClick={() => removePerson(r.uid)} title="Quitar de la lista">✕</button>
                      </div>

                      <div className="dd-ticket-fields">
                        <label className="dd-field">
                          <span>Boletas</span>
                          <input type="number" min="0" max="20" value={d.tickets}
                            onChange={e => setDraft(r.uid, { tickets: e.target.value })} />
                        </label>
                        <label className="dd-field">
                          <span>Silla</span>
                          <input placeholder="F7" maxLength={8} value={d.seat}
                            onChange={e => setDraft(r.uid, { seat: e.target.value })} />
                        </label>
                        <label className="dd-field dd-field-wide">
                          <span>Le compró a (opcional)</span>
                          <input placeholder="Nombre de a quién le compró" value={d.boughtFor}
                            onChange={e => setDraft(r.uid, { boughtFor: e.target.value })} />
                        </label>
                        <button className="dd-gold-btn" disabled={!dirty} onClick={() => saveRow(r)}>
                          Guardar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </>
      )}

      <style>{`
        .dd-page {
          min-height: 100vh; max-width: 860px; margin: 0 auto;
          padding: 100px 20px 60px; position: relative; z-index: 1;
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
        .dd-title-green { color: #22c55e; text-shadow: 0 0 34px rgba(34,197,94,.55); }
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
          border-radius: 18px; padding: 28px; margin-bottom: 22px;
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

        /* Contador de reclutados (vista de todos) */
        .dd-recruited {
          display: flex; align-items: baseline; justify-content: center; gap: 12px;
          background: rgba(34,197,94,.06);
          border: 1px solid rgba(34,197,94,.25);
          border-radius: 14px; padding: 24px 20px; margin-top: 14px;
        }
        .dd-recruited-num {
          font-family: 'Rajdhani', sans-serif;
          font-size: 54px; font-weight: 700; line-height: 1;
          color: #4ade80; text-shadow: 0 0 30px rgba(34,197,94,.45);
          font-variant-numeric: tabular-nums;
        }
        .dd-recruited-label { font-size: 14px; color: var(--sub); }

        /* Sinopsis y código de vestir, dentro del hero */
        .dd-hero-facts {
          display: flex; justify-content: center; gap: 12px;
          flex-wrap: wrap; margin-top: 20px;
        }
        .dd-fact {
          display: flex; flex-direction: column; align-items: center; gap: 5px;
          background: rgba(34,197,94,.06);
          border: 1px solid rgba(34,197,94,.22);
          border-radius: 12px; padding: 12px 22px; min-width: 170px;
        }
        .dd-fact-label {
          font-size: 10px; letter-spacing: .14em; text-transform: uppercase;
          color: var(--muted);
        }
        .dd-fact-value { font-size: 15px; font-weight: 600; color: #86efac; }
        .dd-fact-big {
          font-family: 'Rajdhani', sans-serif;
          font-size: 24px; font-weight: 700; letter-spacing: .06em;
          color: #4ade80; text-shadow: 0 0 22px rgba(34,197,94,.35);
        }

        /* Botones */
        .dd-btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          border: none; border-radius: 12px; cursor: pointer;
          font-size: 15px; font-weight: 700; padding: 14px 30px;
          text-decoration: none; transition: all .2s;
          font-family: 'Rajdhani', sans-serif; letter-spacing: .05em;
        }
        .dd-btn-main {
          background: linear-gradient(135deg, #16a34a, #15803d);
          color: #fff; font-size: 17px; box-shadow: 0 0 30px rgba(34,197,94,.35);
        }
        .dd-btn-main:hover { box-shadow: 0 0 46px rgba(34,197,94,.6); transform: translateY(-1px); }
        .dd-btn-main:disabled { opacity: .6; cursor: not-allowed; transform: none; }

        /* Fila de estado — ambas pastillas del mismo tamaño */
        .dd-confirmed { display: flex; align-items: stretch; gap: 12px; flex-wrap: wrap; }
        .dd-status-pill {
          display: flex; align-items: center; gap: 10px;
          font-size: 14px; font-weight: 600; line-height: 1;
          padding: 14px 20px; border-radius: 12px;
          background: rgba(34,197,94,.08); border: 1px solid rgba(34,197,94,.3);
          color: #86efac; margin: 0;
        }
        .dd-status-danger {
          background: transparent; border-color: rgba(239,68,68,.35); color: #f87171;
          cursor: pointer; transition: background .2s;
        }
        .dd-status-danger:hover { background: rgba(239,68,68,.1); }
        .dd-status-locked { border-color: rgba(250,204,21,.35); color: #fde68a; background: rgba(250,204,21,.06); }

        /* Mantener pulsado para salir */
        .dd-leave-box {
          margin-top: 16px; padding: 18px;
          background: rgba(239,68,68,.05);
          border: 1px solid rgba(239,68,68,.25); border-radius: 12px;
        }
        .dd-leave-text { font-size: 13px; color: var(--sub); margin: 0 0 14px; line-height: 1.6; }
        .dd-leave-text strong { color: #f87171; }
        .dd-leave-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .dd-leave-confirm {
          padding: 12px 26px; border-radius: 10px;
          border: 1px solid rgba(239,68,68,.5); background: rgba(239,68,68,.12);
          color: #fca5a5; font-size: 13px; font-weight: 700; cursor: pointer;
          transition: background .2s, border-color .2s, opacity .2s;
        }
        .dd-leave-confirm:hover:not(:disabled) { background: rgba(239,68,68,.22); border-color: rgba(239,68,68,.8); }
        .dd-leave-confirm:disabled {
          opacity: .5; cursor: not-allowed;
          border-color: rgba(239,68,68,.25); background: transparent;
          font-variant-numeric: tabular-nums;
        }
        .dd-btn-ghost {
          background: none; border: none; color: var(--sub);
          font-size: 13px; cursor: pointer; text-decoration: underline;
        }
        .dd-btn-ghost:hover { color: var(--text); }

        /* Lista de personas */
        .dd-list { display: flex; flex-direction: column; gap: 10px; }
        .dd-person {
          display: flex; align-items: center; gap: 14px;
          background: rgba(9, 14, 10, .7);
          border: 1px solid rgba(34,197,94,.12);
          border-radius: 12px; padding: 12px 16px; transition: border-color .2s;
        }
        .dd-person:hover { border-color: rgba(34,197,94,.35); }
        .dd-person-info { flex: 1; min-width: 0; }
        .dd-person-name { font-size: 14px; font-weight: 600; color: var(--text); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dd-person-user { font-size: 12px; color: var(--muted); margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dd-tag {
          font-size: 12px; font-weight: 700; color: #86efac;
          background: rgba(34,197,94,.12); border: 1px solid rgba(34,197,94,.3);
          border-radius: 8px; padding: 4px 10px; white-space: nowrap;
        }
        .dd-tag-ok { color: #fde68a; background: rgba(250,204,21,.1); border-color: rgba(250,204,21,.3); }
        .dd-mini-btn {
          width: 28px; height: 28px; flex-shrink: 0;
          border-radius: 8px; border: 1px solid rgba(34,197,94,.35);
          background: transparent; color: #4ade80; font-size: 13px; cursor: pointer;
          transition: background .15s;
        }
        .dd-mini-btn:hover { background: rgba(34,197,94,.15); }
        .dd-mini-danger { border-color: rgba(239,68,68,.35); color: #f87171; }
        .dd-mini-danger:hover { background: rgba(239,68,68,.12); }

        .dd-info-list { list-style: none; padding: 0; margin: 14px 0 0; display: flex; flex-direction: column; gap: 12px; }
        .dd-info-list li { font-size: 14px; color: var(--sub); line-height: 1.7; padding-left: 18px; position: relative; }
        .dd-info-list li::before {
          content: ''; position: absolute; left: 0; top: 9px;
          width: 7px; height: 7px; border-radius: 2px;
          background: #22c55e; box-shadow: 0 0 8px rgba(34,197,94,.6);
          transform: rotate(45deg);
        }
        .dd-info-list strong { color: #86efac; }

        /* ══ Zona admin — dorada ══ */
        .dd-admin-divider {
          display: flex; align-items: center; gap: 14px;
          margin: 44px 0 22px;
        }
        .dd-admin-divider-line {
          flex: 1; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(250,204,21,.4), transparent);
        }
        .dd-admin-divider-text {
          font-size: 11px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
          color: #fbbf24; white-space: nowrap;
        }
        .dd-gold {
          background: rgba(26, 20, 8, .9);
          border-color: rgba(250,204,21,.28);
          box-shadow: 0 0 40px rgba(250,204,21,.06);
        }
        .dd-gold-title {
          font-family: 'Rajdhani', sans-serif;
          font-size: 21px; font-weight: 700; color: #fbbf24;
          margin: 0 0 8px; display: flex; align-items: center; gap: 10px;
        }
        .dd-gold-subtitle {
          font-family: 'Rajdhani', sans-serif;
          font-size: 16px; font-weight: 700; color: #fcd34d;
          margin: 26px 0 12px;
        }
        .dd-gold-sub { color: #d6c8a0; font-size: 13px; line-height: 1.7; margin-bottom: 18px; }
        .dd-gold-sub strong { color: #fbbf24; }
        .dd-gold .dd-muted { color: #9c8f6d; }
        .dd-gold .dd-person, .dd-person-gold {
          background: rgba(18, 14, 5, .8);
          border-color: rgba(250,204,21,.15);
        }
        .dd-gold .dd-person:hover { border-color: rgba(250,204,21,.4); }
        .dd-gold .dd-mini-btn { border-color: rgba(250,204,21,.35); color: #fbbf24; }
        .dd-gold .dd-mini-btn:hover { background: rgba(250,204,21,.15); }
        .dd-gold .dd-mini-danger { border-color: rgba(239,68,68,.35); color: #f87171; }
        .dd-tag-gold { color: #fde68a; background: rgba(250,204,21,.1); border-color: rgba(250,204,21,.3); }
        .dd-gold-btn {
          flex-shrink: 0;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: #1a1405; border: none; border-radius: 9px;
          padding: 8px 16px; font-size: 12px; font-weight: 700; cursor: pointer;
          transition: filter .2s, opacity .2s;
        }
        .dd-gold-btn:hover { filter: brightness(1.12); }
        .dd-gold-btn:disabled { opacity: .35; cursor: not-allowed; filter: none; }
        .dd-search {
          width: 100%; background: rgba(10, 8, 3, .8);
          border: 1px solid rgba(250,204,21,.28); border-radius: 10px;
          padding: 12px 16px; font-size: 14px; color: var(--text); outline: none;
          transition: border-color .2s;
        }
        .dd-search::placeholder { color: #8a7d5e; }
        .dd-search:focus { border-color: #fbbf24; }

        .dd-stats { display: flex; gap: 12px; flex-wrap: wrap; }
        .dd-stat {
          flex: 1; min-width: 110px;
          background: rgba(18, 14, 5, .8);
          border: 1px solid rgba(250,204,21,.18);
          border-radius: 12px; padding: 16px;
          display: flex; flex-direction: column; align-items: center; gap: 4px;
        }
        .dd-stat-num {
          font-family: 'Rajdhani', sans-serif; font-size: 30px; font-weight: 700;
          color: #fbbf24; line-height: 1;
        }
        .dd-stat-label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #9c8f6d; }

        .dd-ticket-row {
          background: rgba(18, 14, 5, .8);
          border: 1px solid rgba(250,204,21,.15);
          border-radius: 12px; padding: 14px 16px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .dd-ticket-head { display: flex; align-items: center; gap: 14px; }
        .dd-bought-toggle {
          flex-shrink: 0;
          background: transparent; border: 1px solid rgba(250,204,21,.3);
          color: #9c8f6d; border-radius: 9px; padding: 7px 14px;
          font-size: 12px; font-weight: 700; cursor: pointer; transition: all .2s;
        }
        .dd-bought-toggle:hover { border-color: #fbbf24; color: #fbbf24; }
        .dd-bought-toggle.on {
          background: rgba(250,204,21,.15); border-color: #fbbf24; color: #fde68a;
        }
        .dd-ticket-fields { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
        .dd-field { display: flex; flex-direction: column; gap: 5px; }
        .dd-field span { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #9c8f6d; }
        .dd-field input {
          width: 92px; background: rgba(10, 8, 3, .8);
          border: 1px solid rgba(250,204,21,.22); border-radius: 8px;
          padding: 8px 10px; font-size: 13px; color: var(--text); outline: none;
        }
        .dd-field input:focus { border-color: #fbbf24; }
        .dd-field-wide { flex: 1; min-width: 180px; }
        .dd-field-wide input { width: 100%; }

        @media (max-width: 560px) {
          .dd-person { flex-wrap: wrap; }
          .dd-count-box { width: 64px; }
          .dd-confirmed { flex-direction: column; align-items: stretch; }
          .dd-status-pill { justify-content: center; }
          .dd-ticket-head { flex-wrap: wrap; }
          .dd-admin-divider-text { font-size: 10px; white-space: normal; text-align: center; }
        }
      `}</style>
    </main>
  )
}
