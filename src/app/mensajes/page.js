// src/app/mensajes/page.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/components/auth-context";
import {
    collection,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    addDoc,
    serverTimestamp,
    onSnapshot,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    writeBatch,
    deleteDoc,
    deleteField,
    setDoc,
    arrayRemove,
    arrayUnion,
    documentId,
} from "firebase/firestore";
import { storage } from "@/lib/firebase";
import { ref as sRef, deleteObject, uploadBytes, getDownloadURL } from "firebase/storage";

import PerfilNav from "@/components/PerfilNav";
import AvisoFallo from "@/components/AvisoFallo";
import { suscribir } from "@/lib/suscribir";
import { registrarAccion } from "@/lib/fallos";
import StartChatDialog from "@/components/StartChatDialog";
import { getUserRanks } from "@/lib/acl";
import { encryptMessage, decryptMessage } from "@/lib/crypto";
import { uploadManyAttachments } from "@/lib/uploads";
import { compressVideo } from "@/lib/videoCompress";
import { guardChatFiles, esDescargaRiesgosa, MAX_VIDEO_SECS } from "@/lib/chatFileGuard";
import { hidratarAdjuntos } from "@/lib/chatMedia";
import clsx from "clsx";
import {
    EllipsisVerticalIcon,
    EyeSlashIcon,
    ClipboardIcon,
    PencilIcon,
    FaceSmileIcon,
    TrashIcon,
    CheckIcon,
    CheckCircleIcon,
    ArrowPathIcon,
    ChevronDownIcon,
    ChevronLeftIcon,
    LinkIcon,
    PaperAirplaneIcon,
    PlusIcon,
    XMarkIcon,
    Cog6ToothIcon,
    CameraIcon,
    FolderOpenIcon,
    DocumentTextIcon,
    PhotoIcon,
    DocumentIcon,
    MusicalNoteIcon,
    VideoCameraIcon,
    ArrowDownTrayIcon,
    GifIcon,
    MicrophoneIcon,
    StarIcon,
    BellSlashIcon,
    NoSymbolIcon,
    FlagIcon,
    ClockIcon,
} from "@heroicons/react/24/outline";
import { Suspense } from "react";
import Badges from "@/components/Badges";
import { resolvePresence } from "@/lib/presence";
import { notificar, notificarVarios } from "@/lib/notify";
import EmojiPicker from "@/components/EmojiPicker";
import GifPicker from "@/components/GifPicker";
import AudioMessage from "@/components/AudioMessage";
import ReportModal from "@/components/ReportModal";
import { PlayIcon as PlayIconSolid, PauseIcon as PauseIconSolid } from "@heroicons/react/24/solid";
import { EmojiText, TwemojiImg } from "@/lib/twemoji";
import Link from "next/link";

/* === Share card (rendered inside Bubble for type:'share') === */
function ShareCard({ meta }) {
    if (!meta) return null;
    const isFolder   = meta.shareType === "folder";
    const href       = isFolder
        ? `/coleccion/${meta.ownerUid}/${meta.folderId}`
        : `/propuestas?id=${meta.id}`;
    const title      = isFolder ? (meta.folderName || "Carpeta") : (meta.titulo || "Propuesta");
    const subtitle   = isFolder ? `${meta.count ?? 0} propuestas` : (meta.norma || "");
    const actionText = isFolder ? "Ver carpeta →" : "Ver propuesta →";

    return (
        <Link href={href}
            className="mt-1 flex items-start gap-2.5 rounded-xl bg-white/8 border border-white/10 p-3 hover:bg-white/12 transition"
            onClick={e => e.stopPropagation()}>
            <div className="shrink-0 p-1.5 bg-white/10 rounded-lg mt-0.5">
                {isFolder
                    ? <FolderOpenIcon className="w-4 h-4 text-white/60" />
                    : <DocumentTextIcon className="w-4 h-4 text-white/60" />}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-medium truncate">{title}</p>
                {subtitle && <p className="text-xs text-white/50">{subtitle}</p>}
                <p className="text-xs text-[var(--accent2)] mt-1">{actionText}</p>
            </div>
        </Link>
    );
}

/* === MENU ITEM (GLOBAL, para cualquier menú contextual) === */
function MenuItem({ icon: Icon, label, onClick, disabled, danger }) {
    return (
        <button
            type="button"
            className={clsx(
                "w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition",
                disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                danger && !disabled ? "hover:bg-red-500/10 text-red-400" : !disabled ? "hover:bg-white/8" : ""
            )}
            onClick={disabled ? undefined : onClick}
        >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{label}</span>
        </button>
    );
}

/* ===== Lightbox (DOM) - sin useState ===== */
const __LB_CSS = `
#chat-lb{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;
  background:rgba(0,0,0,.94);overflow:hidden;touch-action:none}
#chat-lb.open{display:flex}
#chat-lb .canvas{transform-origin:center center;transition:transform .12s ease-out;will-change:transform}
#chat-lb .canvas.arrastrando{transition:none}
#chat-lb img,#chat-lb .shot{max-width:92vw;max-height:84vh;border-radius:12px;display:block;
  box-shadow:0 10px 30px rgba(0,0,0,.6)}
#chat-lb .shot{background-size:contain;background-repeat:no-repeat;background-position:center}
/* Medidas fijas: con solo padding el ancho lo marcaba el carácter y salía ovalado. */
#chat-lb .close{position:absolute;top:14px;right:14px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);
  border-radius:9999px;width:36px;height:36px;display:grid;place-content:center;color:#fff;cursor:pointer;
  backdrop-filter:saturate(140%) blur(6px);font-size:15px;line-height:1;padding:0}
#chat-lb .close:hover{background:rgba(255,255,255,.22)}
#chat-lb .bar{position:absolute;bottom:18px;left:50%;transform:translateX(-50%);display:flex;gap:4px;align-items:center;
  background:rgba(24,24,27,.88);border:1px solid rgba(255,255,255,.14);border-radius:9999px;padding:5px 8px;
  backdrop-filter:blur(8px);user-select:none}
#chat-lb .bar button{background:transparent;border:0;color:rgba(255,255,255,.8);cursor:pointer;border-radius:9999px;
  width:30px;height:30px;font-size:15px;line-height:1;display:grid;place-content:center}
#chat-lb .bar button:hover{background:rgba(255,255,255,.14);color:#fff}
#chat-lb .bar button:disabled{opacity:.35;cursor:default}
#chat-lb .pct{min-width:48px;text-align:center;font-size:12px;color:rgba(255,255,255,.7);
  font-variant-numeric:tabular-nums;padding:0 2px}
/* Modo protegido (ver una vez): sin selección, sin menú contextual, sin arrastrar fuera */
#chat-lb.protegido{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
#chat-lb.protegido .shot{pointer-events:none}
#chat-lb.oculto .canvas{visibility:hidden}
#chat-lb .aviso{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:none;
  color:rgba(255,255,255,.75);font-size:13px;text-align:center;padding:14px 18px;border-radius:12px;
  background:rgba(24,24,27,.9);border:1px solid rgba(255,255,255,.14)}
#chat-lb.oculto .aviso{display:block}
#chat-lb .marca{position:absolute;bottom:64px;left:50%;transform:translateX(-50%);
  font-size:11px;color:rgba(255,255,255,.35);letter-spacing:.03em}
`;

/* ===== CSS de animaciones de chat ===== */
const __CHAT_CSS = `
@keyframes floatHeart{
  0%{opacity:1;transform:scale(1) translateY(0) rotate(-10deg)}
  40%{opacity:1;transform:scale(1.6) translateY(-40px) rotate(8deg)}
  100%{opacity:0;transform:scale(0.8) translateY(-90px) rotate(-5deg)}
}
.chat-float-heart{pointer-events:none;position:absolute;font-size:28px;animation:floatHeart .8s ease-out forwards;z-index:60;user-select:none}

@keyframes swipeHint{
  0%{transform:translateX(0)}
  40%{transform:translateX(18px)}
  100%{transform:translateX(0)}
}
.chat-swipe-anim{animation:swipeHint .25s ease-out}

@keyframes typingDot{
  0%,80%,100%{transform:scale(0.6);opacity:.4}
  40%{transform:scale(1);opacity:1}
}
.typing-dot{display:inline-block;width:6px;height:6px;border-radius:9999px;background:currentColor;animation:typingDot 1.2s infinite ease-in-out}
.typing-dot:nth-child(2){animation-delay:.2s}
.typing-dot:nth-child(3){animation-delay:.4s}

@keyframes slideInUp{
  from{opacity:0;transform:translateY(6px)}
  to{opacity:1;transform:translateY(0)}
}
.chat-slide-in{animation:slideInUp .18s ease-out}

@keyframes popIn{
  0%{transform:scale(0.6);opacity:0}
  70%{transform:scale(1.15)}
  100%{transform:scale(1);opacity:1}
}
.chat-pop-in{animation:popIn .22s cubic-bezier(.34,1.56,.64,1)}

@keyframes msgFlash{
  0%  {background:rgba(250,204,21,.28);border-radius:14px}
  55% {background:rgba(250,204,21,.18);border-radius:14px}
  100%{background:transparent}
}
.msg-flash{animation:msgFlash 1.4s ease-out forwards}
`;
function injectChatCss() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('chat-anim-css')) return;
    const s = document.createElement('style');
    s.id = 'chat-anim-css'; s.textContent = __CHAT_CSS;
    document.head.appendChild(s);
}
if (typeof window !== 'undefined') injectChatCss();

// Corazón flotante en coordenadas de pantalla (para doble-click en adjuntos)
function spawnHeartAt(x, y) {
    if (typeof document === 'undefined') return;
    injectChatCss();
    const el = document.createElement('span');
    el.textContent = '❤️';
    el.className = 'chat-float-heart';
    el.style.position = 'fixed';
    el.style.left = (x - 14) + 'px';
    el.style.top = (y - 16) + 'px';
    el.style.zIndex = '80';
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); }, 850);
}

function injectLbCss() {
    if (document.getElementById('chat-lb-css')) return;
    const s = document.createElement('style');
    s.id = 'chat-lb-css'; s.textContent = __LB_CSS;
    document.head.appendChild(s);
}
function ensureLb() {
    injectLbCss();
    let el = document.getElementById('chat-lb');
    if (!el) {
        el = document.createElement('div');
        el.id = 'chat-lb';
        el.addEventListener('click', (e) => { if (e.target.id === 'chat-lb') closeLb(); }); // click fuera cierra
        document.body.appendChild(el);
    }
    return el;
}
// Estado del visor (zoom y desplazamiento). Se reinicia en cada apertura.
let __lbLimpiar = null;

/**
 * Visor de imágenes con zoom y arrastre.
 * @param {string} src
 * @param {string} alt
 * @param {{protegido?: boolean}} opts  protegido = imagen de "ver una vez":
 *        sin menú contextual, sin arrastrar, sin etiqueta <img> (así el
 *        navegador no ofrece "Guardar imagen como") y se oculta al salir.
 */
export function openLb(src, alt = '', opts = {}) {
    const protegido = !!opts.protegido;
    const el = ensureLb();
    if (__lbLimpiar) { __lbLimpiar(); __lbLimpiar = null; }

    // Se construye con la API del DOM (sin innerHTML) para que `src`/`alt` no
    // puedan inyectar HTML/JS.
    el.textContent = '';
    el.classList.toggle('protegido', protegido);
    el.classList.remove('oculto');

    const canvas = document.createElement('div');
    canvas.className = 'canvas';

    if (protegido) {
        // Sin <img>: un div con background-image no ofrece "Guardar imagen como"
        // ni "Copiar imagen" en el menú contextual.
        const shot = document.createElement('div');
        shot.className = 'shot';
        shot.style.backgroundImage = `url(${JSON.stringify(String(src || ''))})`;
        // Se ajusta al tamaño real de la imagen manteniendo su proporción.
        const probe = new Image();
        probe.onload = () => {
            const maxW = window.innerWidth * 0.92, maxH = window.innerHeight * 0.84;
            const k = Math.min(maxW / probe.naturalWidth, maxH / probe.naturalHeight, 1);
            shot.style.width = Math.round(probe.naturalWidth * k) + 'px';
            shot.style.height = Math.round(probe.naturalHeight * k) + 'px';
        };
        probe.src = src;
        canvas.appendChild(shot);
    } else {
        const img = document.createElement('img');
        img.src = typeof src === 'string' ? src : '';
        img.alt = alt || '';
        img.draggable = false;
        canvas.appendChild(img);
    }
    el.appendChild(canvas);

    // Aviso que aparece si la ventana pierde el foco (modo protegido)
    const aviso = document.createElement('div');
    aviso.className = 'aviso';
    aviso.textContent = 'Vuelve a esta ventana para seguir viendo la foto';
    el.appendChild(aviso);

    if (protegido) {
        const marca = document.createElement('div');
        marca.className = 'marca';
        marca.textContent = 'Foto de una sola vista · no la compartas sin permiso';
        el.appendChild(marca);
    }

    /* ===== Zoom y desplazamiento ===== */
    let escala = 1, tx = 0, ty = 0;
    const MIN = 1, MAX = 6;
    const pct = document.createElement('span');
    pct.className = 'pct';

    const aplicar = () => {
        if (escala <= 1) { tx = 0; ty = 0; }
        canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${escala})`;
        pct.textContent = Math.round(escala * 100) + '%';
        bMenos.disabled = escala <= MIN;
        bMas.disabled = escala >= MAX;
    };
    const zoom = (factor, cx, cy) => {
        const previa = escala;
        escala = Math.min(MAX, Math.max(MIN, escala * factor));
        if (escala === previa) return;
        // Mantiene bajo el cursor el punto sobre el que se hace zoom
        if (cx != null) {
            const r = el.getBoundingClientRect();
            const dx = cx - (r.left + r.width / 2);
            const dy = cy - (r.top + r.height / 2);
            const rel = escala / previa;
            tx = dx - (dx - tx) * rel;
            ty = dy - (dy - ty) * rel;
        }
        aplicar();
    };

    /* ===== Barra de controles ===== */
    const bar = document.createElement('div');
    bar.className = 'bar';
    const mkBtn = (txt, titulo, fn) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = txt; b.title = titulo;
        b.setAttribute('aria-label', titulo);
        b.onclick = (ev) => { ev.stopPropagation(); fn(); };
        return b;
    };
    const bMenos = mkBtn('−', 'Alejar', () => zoom(1 / 1.3));
    const bMas = mkBtn('+', 'Acercar', () => zoom(1.3));
    const bReset = mkBtn('⟲', 'Tamaño original', () => { escala = 1; tx = 0; ty = 0; aplicar(); });
    bar.append(bMenos, pct, bMas, bReset);
    el.appendChild(bar);

    const btn = document.createElement('button');
    btn.className = 'close';
    btn.setAttribute('aria-label', 'Cerrar');
    btn.textContent = '✕';
    btn.onclick = closeLb;
    el.appendChild(btn);

    /* ===== Eventos ===== */
    const onWheel = (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); };

    let arrastrando = false, x0 = 0, y0 = 0, movido = 0;
    const onDown = (e) => {
        if (e.button != null && e.button !== 0) return;
        if (escala <= 1) return;               // sin zoom no hay nada que mover
        arrastrando = true; movido = 0;
        x0 = e.clientX - tx; y0 = e.clientY - ty;
        canvas.classList.add('arrastrando');
        el.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e) => {
        if (!arrastrando) return;
        const nx = e.clientX - x0, ny = e.clientY - y0;
        movido += Math.abs(nx - tx) + Math.abs(ny - ty);
        tx = nx; ty = ny;
        canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${escala})`;
    };
    const onUp = () => {
        if (!arrastrando) return;
        arrastrando = false;
        canvas.classList.remove('arrastrando');
        // Marca el arrastre para que el clic no cierre el visor sin querer
        if (movido > 6) el.dataset.arrastrado = '1';
    };
    // En captura: corta el clic posterior a un arrastre antes de que lleguen
    // los listeners de cierre (incluido el de "ver una vez").
    const onClickCapture = (e) => {
        if (el.dataset.arrastrado === '1') {
            delete el.dataset.arrastrado;
            e.stopPropagation(); e.preventDefault();
            return;
        }
        // Con zoom, la imagen crece VISUALMENTE pero su caja de diseño no: al
        // pulsar sobre la zona ampliada el objetivo sigue siendo el fondo y se
        // cerraba el visor sin querer. Con zoom, el fondo no cierra.
        if (escala > 1 && e.target === el) {
            e.stopPropagation(); e.preventDefault();
        }
    };
    const onDblClick = (e) => { e.preventDefault(); zoom(escala > 1 ? 1 / escala : 2, e.clientX, e.clientY); };
    const onKey = (e) => {
        if (e.key === '+' || e.key === '=') zoom(1.3);
        else if (e.key === '-' || e.key === '_') zoom(1 / 1.3);
        else if (e.key === '0') { escala = 1; tx = 0; ty = 0; aplicar(); }
    };
    const onCtx = (e) => { e.preventDefault(); };   // sin menú contextual
    const onVis = () => { el.classList.toggle('oculto', document.hidden); };
    const onBlur = () => el.classList.add('oculto');
    const onFocus = () => el.classList.remove('oculto');

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('dblclick', onDblClick);
    window.addEventListener('keydown', onKey);
    if (protegido) {
        el.addEventListener('contextmenu', onCtx);
        el.addEventListener('dragstart', onCtx);
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
    }

    __lbLimpiar = () => {
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.removeEventListener('click', onClickCapture, true);
        el.removeEventListener('dblclick', onDblClick);
        window.removeEventListener('keydown', onKey);
        el.removeEventListener('contextmenu', onCtx);
        el.removeEventListener('dragstart', onCtx);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
    };

    aplicar();
    el.classList.add('open');
}

export function closeLb() {
    const el = document.getElementById('chat-lb');
    if (!el) return;
    if (__lbLimpiar) { __lbLimpiar(); __lbLimpiar = null; }
    el.classList.remove('open', 'protegido', 'oculto');
    delete el.dataset.arrastrado;
    el.textContent = '';
}

// Abre la imagen 'ver una vez' y al cerrar borra el archivo de Storage y limpia el mensaje
// Intenta obtener un ref de Storage a partir de path o downloadURL
// Intenta obtener un ref de Storage a partir de path o downloadURL
// Etiqueta amigable para el preview de la lista de chats (no muestra el nombre del archivo)
function attachmentPreviewLabel(att, viewOnce = false) {
    if (!att) return "";
    if (att.isGif) return "🎞️ GIF";
    const k = att.kind;
    if (k === "image") return viewOnce ? "① 📷" : "📷 Foto";
    if (k === "video") return viewOnce ? "① 🎥" : "🎥 Video";
    if (k === "audio") return viewOnce ? "① 🎤" : "🎤 Audio";
    return "📎 Archivo";
}

// Detecta si un texto es ÚNICAMENTE una URL de imagen/GIF, para incrustarla.
const IMG_URL_RE = /^https?:\/\/\S+\.(gif|png|jpe?g|webp|avif)(\?\S*)?$/i;
function imageUrlFromText(t) {
    const s = (t || "").trim();
    if (!s || /\s/.test(s)) return null; // debe ser un único enlace
    if (IMG_URL_RE.test(s)) {
        return { url: s, isGif: /\.gif(\?|$)/i.test(s) };
    }
    // Hosts de GIF comunes sin extensión visible
    if (/^https?:\/\/(media\d*\.giphy\.com|media\d*\.tenor\.com|c\.tenor\.com|i\.giphy\.com)\//i.test(s)) {
        return { url: s, isGif: true };
    }
    return null;
}

function getStorageRefFromAttachment(att) {
    if (att?.path) {
        return sRef(storage, att.path);
    }
    if (att?.url) {
        try {
            // El Web SDK acepta gs:// y https:// directamente
            return sRef(storage, att.url);
        } catch (_) {
            try {
                // Fallback: extraer el path de /o/<path>?alt=media
                const m = att.url.match(/\/o\/([^?]+)/);
                if (m && m[1]) return sRef(storage, decodeURIComponent(m[1]));
            } catch (_) { }
        }
    }
    return null;
}

// Abre la imagen 'ver una vez' y al cerrar borra Storage y limpia el mensaje
async function openViewOnceAndDestroy(convoId, msg) {
    try {
        const imgs = (msg.attachments || []).filter(a => a?.kind === "image");
        if (!imgs.length) return;
        const first = imgs[0];

        // 1) Precargar la imagen ANTES de destruirla: así los bytes ya están en
        //    memoria y la foto sigue visible aunque el archivo deje de existir.
        await new Promise((res) => {
            const probe = new Image();
            probe.onload = res;
            probe.onerror = res;
            probe.src = first.url;
            setTimeout(res, 8000);
        });

        // 2) Abrir visor en modo protegido (sin guardar / sin copiar)
        openLb(first.url, msg.text || "Foto", { protegido: true });

        // 3) Destruir INMEDIATAMENTE, no al cerrar: si se cerrara la pestaña sin
        //    cerrar el visor, el archivo se quedaba y se podía volver a abrir.
        const destruir = async () => {
            try {
                const refToDelete = getStorageRefFromAttachment(first);
                if (refToDelete) {
                    try { await deleteObject(refToDelete); } catch (_) { }
                }
                const mref = doc(db, "conversations", convoId, "messages", msg.id);
                await updateDoc(mref, {
                    attachments: [],                          // quitamos archivos
                    "meta.viewOnceOpenedAt": serverTimestamp(),// marca apertura
                    type: "viewonce_opened",                   // para render "abierta"
                    text: msg.text || "Foto",
                });
            } catch (_) { /* no romper UX */ }
        };
        destruir();

        // 4) Los handlers de cierre ya solo cierran el visor.
        const overlay = document.getElementById("chat-lb");
        if (!overlay) return;

        const btn = overlay.querySelector(".close");

        const closeAndDestroy = async () => {
            try {
                // ya se destruyó al abrir; aquí solo se cierra
            } catch (_) {
                // no romper UX
            }

            // cerrar y soltar listeners
            closeLb();
            btn?.removeEventListener("click", closeAndDestroy);
            overlay?.removeEventListener("click", backdropClose);
            window.removeEventListener("keydown", escClose);
        };

        const backdropClose = (e) => { if (e?.target?.id === "chat-lb") closeAndDestroy(); };
        const escClose = (e) => { if (e.key === "Escape") closeAndDestroy(); };

        if (btn) btn.addEventListener("click", closeAndDestroy);
        overlay.addEventListener("click", backdropClose);
        window.addEventListener("keydown", escClose);
    } catch (_) {
        // fail-safe
    }
}

// Destruye un adjunto de "una vez" (sin visor): borra de Storage y limpia el doc.
// Se usa para audios de "escuchar una vez" cuando el receptor termina de oírlo.
async function destroyViewOnceAttachment(convoId, msg) {
    try {
        const att = (msg.attachments || [])[0];
        const refToDelete = att ? getStorageRefFromAttachment(att) : null;
        if (refToDelete) { try { await deleteObject(refToDelete); } catch (_) { } }
        await updateDoc(doc(db, "conversations", convoId, "messages", msg.id), {
            attachments: [],
            "meta.viewOnceOpenedAt": serverTimestamp(),
            type: "viewonce_opened",
            text: msg.text || "",
        });
    } catch (_) { /* fail-safe */ }
}

// Dejar global (se llama desde burbuja del receptor)
if (typeof window !== "undefined") {
    window.openViewOnceAndDestroy = openViewOnceAndDestroy;
    window.__openVO = openViewOnceAndDestroy;
}

/* ===== utilidades ===== */
function tsToDate(x) {
    if (!x) return null;
    if (x.toDate) return x.toDate();
    if (x instanceof Date) return x;
    const n = +x;
    return Number.isFinite(n) ? new Date(n) : null;
}
function formatRelativeEs(date, now = new Date()) {
    if (!date) return "";
    const diff = date - now,
        s = Math.round(diff / 1000);
    const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
    if (Math.abs(s) < 60) return rtf.format(Math.round(s), "second");
    const m = Math.round(s / 60);
    if (Math.abs(m) < 60) return rtf.format(m, "minute");
    const h = Math.round(m / 60);
    if (Math.abs(h) < 24) return rtf.format(h, "hour");
    const d = Math.round(h / 24);
    if (Math.abs(d) < 30) return rtf.format(d, "day");
    const mo = Math.round(d / 30);
    if (Math.abs(mo) < 12) return rtf.format(mo, "month");
    return rtf.format(Math.round(mo / 12), "year");
}
function formatDayLabel(d) {
    const dias = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."],
        m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${dias[d.getDay()]}., ${d.getDate()} ${m[d.getMonth()]}`;
}
function sameYMD(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

/** Wrapper de diagnóstico */
async function run(name, fn) {
    try {
        return await fn();
    } catch (e) {
        console.error(`[FIRESTORE ERROR] ${name}`, e?.code, e?.message);
        alert(`Error en ${name}: ${e?.code || "desconocido"}`);
        throw e;
    }
}

/* ===== UI básicos ===== */
const IconSearch = (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" {...p}>
        <path
            d="M21 21l-4.3-4.3m1.6-4.7a7 7 0 11-14 0 7 7 0 0114 0z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
        />
    </svg>
);
const IconMore = (p) => (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" {...p}>
        <circle cx="12" cy="5" r="2" fill="currentColor" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
        <circle cx="12" cy="19" r="2" fill="currentColor" />
    </svg>
);

// Indicador de estado de lectura (✓ enviado, ✓✓ azul leído, spinner enviando)
function Tick({ state }) {
    if (!state) return null;
    if (state === "sending") return <ArrowPathIcon className="w-3.5 h-3.5 ml-1 animate-spin opacity-70 inline" />;
    if (state === "read") return <span className="ml-1 text-[11px] text-[var(--accent2)] leading-none select-none">✓✓</span>;
    return <span className="ml-1 text-[11px] opacity-60 leading-none select-none">✓</span>;
}

// Chips de reacciones para mensajes de adjunto (imagen/audio/etc.)
function MsgReactions({ msg, userUid, onToggle, mine }) {
    const reactions = msg?.reactions || {};
    const present = EMOJI_REACTIONS.filter(r => reactions[r.key] && Object.keys(reactions[r.key]).length > 0);
    if (!present.length) return null;
    return (
        <div className={`mt-1 flex gap-0.5 ${mine ? "justify-end" : "justify-start"}`}>
            {present.map(({ key, emoji }) => {
                const count = Object.keys(reactions[key]).length;
                const myReact = !!reactions[key]?.[userUid];
                return (
                    <button key={key} type="button" onClick={() => onToggle(msg, key)}
                        title={myReact ? "Quitar reacción" : "Reaccionar"}
                        className={`flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full border transition cursor-pointer ${myReact ? "bg-[var(--accent)]/30 border-[var(--accent)]/40 text-white" : "bg-[var(--bg3)]/80 border-white/10 text-[var(--sub)] hover:bg-white/10"}`}>
                        <TwemojiImg emoji={emoji} size="0.95rem" />
                        {count > 1 && <span>{count}</span>}
                    </button>
                );
            })}
        </div>
    );
}

function Avatar({ src, alt = "", size = 36 }) {
    // Sin foto se muestra la inicial del nombre, no el logo del sitio: así se
    // distingue a cada persona de un vistazo.
    if (!src) {
        const inicial = (String(alt).trim()[0] || "?").toUpperCase();
        return (
            <div
                className="rounded-full border border-white/10 bg-white/10 grid place-content-center font-semibold text-white/80 select-none shrink-0"
                style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
                title={alt}
                aria-label={alt}
            >
                {inicial}
            </div>
        );
    }
    return (
        <img
            src={src}
            alt={alt}
            className="rounded-full border border-white/10 object-cover shrink-0"
            style={{ width: size, height: size }}
        />
    );
}
function Chip({ active, children, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`px-3 py-1 rounded-full text-xs border border-white/10 cursor-pointer transition ${active ? "bg-white/10" : "hover:bg-white/10"
                }`}
        >
            {children}
        </button>
    );
}
function DateDivider({ date }) {
    return (
        <div className="text-center my-6">
            <span className="text-xs opacity-70">{formatDayLabel(date)}</span>
        </div>
    );
}
// ─────────────────────────────────────────────────────────────────────────────
// Burbuja con menú ⋮ al hover: copiar, reaccionar, editar (si es mío), eliminar
// - Si es mío: "Eliminar para ambos" (deleteDoc en Firestore si hay ids)
// - Si es de otro: "Eliminar para mí" (se oculta localmente)
// - Hora alineada a la derecha dentro de la burbuja
// - Ancho dinámico hasta un tope tipo WhatsApp/IG/ChatGPT
// ─────────────────────────────────────────────────────────────────────────────
const EMOJI_REACTIONS = [
    { key: "heart", emoji: "❤️" },
    { key: "laugh", emoji: "😂" },
    { key: "wow",   emoji: "😮" },
    { key: "sad",   emoji: "😢" },
    { key: "angry", emoji: "😡" },
    { key: "like",  emoji: "👍" },
];

function Bubble({ mine, children, time, msgId, msgType, convoId, db, userUid, reactions, editedAt, forwarded, status = "sent", onRetry, errorMessage, replyTo, onReply, onJumpToReply, onForward, selectMode, selected, onSelect, canDeleteForEveryone = false, confirmDelete }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [hiddenForMe, setHiddenForMe] = useState(false);
    const [showError, setShowError] = useState(false);
    const [editing, setEditing] = useState(false);
    const [editText, setEditText] = useState("");
    const editRef = useRef(null);

    const [reactOpen, setReactOpen] = useState(false);
    const [reactCoords, setReactCoords] = useState({ top: 0, left: 0 });

    // --- floating hearts state ---
    const [floatingHearts, setFloatingHearts] = useState([]);
    const bubbleRef = useRef(null);

    // --- swipe-to-reply ---
    const swipeRef = useRef({ startX: 0, startY: 0, swiping: false });
    const [swipeOffset, setSwipeOffset] = useState(0);

    function myReaction(key) { return !!reactions?.[key]?.[userUid]; }
    function reactionCount(key) { return reactions?.[key] ? Object.keys(reactions[key]).length : 0; }
    const hasAnyReaction = EMOJI_REACTIONS.some(r => reactionCount(r.key) > 0);

    function openReactPopover() {
        const btn = menuBtnRef.current;
        if (!btn) return;

        const br = btn.getBoundingClientRect();
        const vw = window.innerWidth;
        const popW = 292;  // 6 emojis × ~44px + padding
        const popH = 54;
        const gap = 10;

        let left = mine ? br.right - popW : br.left;
        left = Math.max(8, Math.min(left, vw - popW - 8));

        let top = br.top - popH - gap;
        if (top < 8) top = br.bottom + gap;

        setReactCoords({ top, left });
        setReactOpen(true);
        setMenuOpen(false);
    }

    async function toggleReaction(key) {
        setReactOpen(false);
        if (!db || !convoId || !msgId) return;
        if (!userUid) return;
        if (String(msgId).startsWith("local-")) return;
        try {
            const mref = doc(db, "conversations", convoId, "messages", msgId);
            const field = `reactions.${key}.${userUid}`;
            await updateDoc(mref, { [field]: myReaction(key) ? deleteField() : true });
        } catch (e) {
            console.error("Error reaccionando:", e);
        }
    }

    function spawnFloatingHeart(e) {
        injectChatCss();
        const rect = bubbleRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = (e?.clientX ?? rect.left + rect.width / 2) - rect.left;
        const y = (e?.clientY ?? rect.top + rect.height / 2) - rect.top;
        const id = Date.now() + Math.random();
        setFloatingHearts(prev => [...prev, { id, x, y }]);
        setTimeout(() => setFloatingHearts(prev => prev.filter(h => h.id !== id)), 850);
    }

    function handleDoubleClick(e) {
        if (selectMode) return;
        spawnFloatingHeart(e);
        toggleReaction("heart");
    }

    function onTouchStart(e) {
        if (selectMode) return;
        const t = e.touches[0];
        swipeRef.current = { startX: t.clientX, startY: t.clientY, swiping: true, triggered: false };
    }
    function onTouchMove(e) {
        if (!swipeRef.current.swiping) return;
        const t = e.touches[0];
        const dx = t.clientX - swipeRef.current.startX;
        const dy = Math.abs(t.clientY - swipeRef.current.startY);
        if (dy > 20) { swipeRef.current.swiping = false; setSwipeOffset(0); return; }
        if (dx > 0 && dx < 80) {
            setSwipeOffset(dx * 0.5);
        }
        if (dx >= 65 && !swipeRef.current.triggered) {
            swipeRef.current.triggered = true;
            onReply?.();
            setSwipeOffset(0);
            swipeRef.current.swiping = false;
            if (navigator.vibrate) navigator.vibrate(30);
        }
    }
    function onTouchEnd() {
        swipeRef.current.swiping = false;
        setSwipeOffset(0);
    }

    const canEdit = mine && !String(msgId || "").startsWith("local-") && !!db && msgType !== "share";

    function startEdit() {
        setEditText(textToCopy);
        setEditing(true);
        setMenuOpen(false);
    }

    async function submitEdit() {
        const newText = editText.trim();
        if (!newText || !canEdit) { setEditing(false); return; }
        if (newText === textToCopy) { setEditing(false); return; }
        try {
            await updateDoc(doc(db, "conversations", convoId, "messages", msgId), {
                text: newText,
                editedAt: serverTimestamp(),
            });
        } catch (e) {
            console.error("Error editando:", e);
        }
        setEditing(false);
    }

    useEffect(() => {
        if (editing && editRef.current) {
            editRef.current.focus();
            const len = editRef.current.value.length;
            editRef.current.setSelectionRange(len, len);
        }
    }, [editing]);

    // --- MENÚ ⋮: refs + efectos (bloque completo) ---
    const menuBtnRef = useRef(null);
    const menuRef = useRef(null);
    // coords del menú (en viewport) y cálculo dinámico según lado
    const [menuCoords, setMenuCoords] = useState({ top: 0, left: 0 });

    // — cierre global: al abrir un menú, cerramos los demás; y cerrar con ESC / click fuera
    useEffect(() => {
        const onCloseOther = (e) => {
            const key = e.detail?.key;
            if (key !== msgId && menuOpen) setMenuOpen(false);
        };
        const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };

        window.addEventListener("dc-close-other-menus", onCloseOther);
        document.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("dc-close-other-menus", onCloseOther);
            document.removeEventListener("keydown", onKey);
        };
    }, [menuOpen, msgId]);

    useEffect(() => {
        if (!menuOpen) return;

        const place = () => {
            const btn = menuBtnRef.current;
            const pop = menuRef.current;
            if (!btn) return;

            const br = btn.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const gap = 8;

            const menuW = pop?.offsetWidth || 176; // ~ w-44
            const menuH = pop?.offsetHeight || 160;

            // Mensajes del otro (mine === false) → abrir a la DERECHA del botón
            // Mensajes tuyos (mine === true)    → abrir a la IZQUIERDA del botón
            const openRight = !mine;

            let left = openRight ? (br.right + gap) : (br.left - menuW - gap);

            // clamp para no salir del viewport (pero SIN cambiar el lado elegido)
            if (openRight) {
                // si no hay espacio a la derecha, pegalo al borde derecho
                if (left + menuW > vw - 8) left = vw - menuW - 8;
                if (left < 8) left = 8; // seguridad mínima
            } else {
                // si no hay espacio a la izquierda, pegalo al borde izquierdo
                if (left < 8) left = 8;
                if (left + menuW > vw - 8) left = vw - menuW - 8; // seguridad
            }

            let top;
            if (vh - br.bottom < menuH + gap) {
                top = Math.max(8, br.top - menuH - gap);       // arriba
            } else {
                top = Math.min(vh - menuH - 8, br.bottom + gap); // abajo
            }

            setMenuCoords({ top, left });
        };

        const raf = requestAnimationFrame(place);
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", place);
            window.removeEventListener("scroll", place, true);
        };
    }, [menuOpen, mine]);
    // --- FIN MENÚ ⋮ ---

    if (hiddenForMe) return null;

    const textToCopy =
        typeof children === "string"
            ? children
            : (Array.isArray(children) ? children.join("") : String(children ?? ""));

    // --- Emoji detect (WhatsApp-like) ---
    function countEmojiSeqs(str = "") {
        try {
            // Cuenta secuencias de pictogramas (incluye ZWJ)
            const re = /\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*/gu;
            const m = str.match(re);
            return m ? m.length : 0;
        } catch {
            // Fallback básico si el motor no soporta \p{Extended_Pictographic}
            const re = /([\u231A-\u231B]|\u23E9|\u23EA|\u23EB|\u23EC|\u23F0|\u23F3|[\u25FD-\u25FE]|\u2614|\u2615|[\u2648-\u2653]|\u267F|\u2693|[\u26A1\u26AA\u26AB]|\u26BD|\u26BE|\u26C4|\u26C5|\u26CE|\u26D4|\u26EA|\u26F2|\u26F3|\u26F5|\u26FA|\u26FD|[\u2702\u2705]|\u2708|\u2709|[\u270A-\u270B]|\u2728|\u2733|\u2734|\u2744|\u2747|\u2753|\u2757|\u2764|\u27A1|[\u2B05-\u2B07]|\u2B50|\u2B55|[\uD83C\uD000-\uD83D\uDEFF])/g;
            const m = str.match(re);
            return m ? m.length : 0;
        }
    }
    function isEmojiOnlyText(str = "") {
        const s = (str || "").trim();
        if (!s) return false;
        try {
            // Permite pictogramas, VS, ZWJ y espacios
            return /^[\p{Extended_Pictographic}\uFE0F\uFE0E\u200D\s]+$/u.test(s);
        } catch {
            // Fallback: si la cuenta de emojis cubre casi todo el texto
            const emojiCount = countEmojiSeqs(s);
            // si hay al menos 1 emoji y no hay letras/dígitos visibles
            return emojiCount > 0 && !/[A-Za-z0-9]/.test(s);
        }
    }

    const onlyEmoji = isEmojiOnlyText(textToCopy);
    const emojiCount = onlyEmoji ? countEmojiSeqs(textToCopy) : 0;

    // Escalonado más agresivo para 2 y 3 emojis (sin tocar la burbuja)
    // 1 emoji: grande; 2: más chico; 3: aún más chico; 4+: normal
    let emojiSizeClass = "";
    if (onlyEmoji) {
        if (emojiCount === 1) {
            emojiSizeClass = "text-[52px] sm:text-[60px]";
        } else if (emojiCount === 2) {
            emojiSizeClass = "text-[40px] sm:text-[46px]";
        } else if (emojiCount === 3) {
            emojiSizeClass = "text-[32px] sm:text-[32px]";
        } else {
            emojiSizeClass = "";
        }
    }

    // layout para mantenerlos en UNA sola línea cuando son ≤ 3
    const emojiLayoutClass =
        onlyEmoji && emojiCount <= 3 ? "whitespace-nowrap text-center leading-[1.05]" : "";

    async function handleCopy() {
        try {
            await navigator.clipboard.writeText(textToCopy);
            setMenuOpen(false);
        } catch (e) {
            console.error("No se pudo copiar:", e);
        }
    }

    const isLocalMsg = String(msgId || "").startsWith("local-");

    // Eliminar para todos (mensaje propio, o admin de grupo sobre cualquiera)
    async function deleteForEveryone() {
        setMenuOpen(false);
        if (isLocalMsg || !db || !convoId || !msgId) { setHiddenForMe(true); return; }
        const ok = confirmDelete
            ? await confirmDelete({ title: "Eliminar para todos", message: "¿Eliminar este mensaje para todos? No se puede deshacer.", confirmLabel: "Eliminar", danger: true })
            : window.confirm("¿Eliminar este mensaje para todos? No se puede deshacer.");
        if (!ok) return;
        try {
            await deleteDoc(doc(db, "conversations", convoId, "messages", msgId));
        } catch (e) {
            console.error("Error eliminando mensaje:", e);
        }
    }

    // Eliminar solo para mí (persistente vía deletedFor)
    async function deleteForMe() {
        setMenuOpen(false);
        if (isLocalMsg || !db || !convoId || !msgId || !userUid) { setHiddenForMe(true); return; }
        try {
            await updateDoc(doc(db, "conversations", convoId, "messages", msgId), {
                deletedFor: arrayUnion(userUid),
            });
        } catch (e) {
            console.error("Error ocultando mensaje:", e);
            setHiddenForMe(true);
        }
    }

    function MenuItem({ icon: Icon, label, onClick, disabled }) {
        return (
            <button
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md
                    ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-white/5"}`}
                onClick={disabled ? undefined : onClick}
            >
                <Icon className="w-4 h-4" />
                <span>{label}</span>
            </button>
        );
    }

    function StatusIcon() {
        if (!mine) return null;
        if (status === "sending") {
            return <ArrowPathIcon className="w-3.5 h-3.5 ml-1 animate-spin opacity-80" />;
        }
        if (status === "error") {
            // Círculo rojo relleno con la exclamación en blanco, como en WhatsApp:
            // el icono de línea anterior se perdía sobre la burbuja y no invitaba
            // a tocarlo. Al pulsarlo se abre el motivo y el botón de reintentar.
            return (
                <button
                    type="button"
                    className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-400 cursor-pointer"
                    title="No se envió. Toca para reintentar"
                    aria-label="No se envió. Toca para reintentar"
                    onClick={() => setShowError((v) => !v)}
                >
                    <span className="text-[11px] font-bold leading-none">!</span>
                </button>
            );
        }
        if (status === "read") {
            return (
                <span className="ml-1 text-[11px] text-[var(--accent2)] leading-none select-none">✓✓</span>
            );
        }
        return <CheckIcon className="w-3.5 h-3.5 ml-1 opacity-50" />;
    }

    return (
        <div
            className={`w-full flex ${hasAnyReaction ? "mb-6" : "mb-2"} ${mine ? "justify-end" : "justify-start"} ${selectMode ? "cursor-pointer" : ""}`}
            onClick={selectMode ? onSelect : undefined}
        >
            {/* checkbox de selección */}
            {selectMode && (
                <div className={`flex items-center ${mine ? "order-last ml-2" : "mr-2"}`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${selected ? "bg-[var(--accent)] border-[var(--accent)]" : "border-white/30"}`}>
                        {selected && <CheckIcon className="w-3 h-3 text-white" />}
                    </div>
                </div>
            )}
            <div className="relative flex items-start">
                {/* Burbuja */}
                <div
                    ref={bubbleRef}
                    data-bubble="true"
                    /* Un mensaje que no salió se pinta en rojo, no en el azul de los
                       enviados: de un vistazo se distingue lo que sí llegó. */
                    className={`relative group inline-flex flex-col whitespace-pre-wrap ${mine
                        ? (status === "error" ? "bg-red-700 text-white ml-auto" : "bg-[var(--accent)] text-white ml-auto")
                        : "bg-[var(--bg3)] text-[var(--text)] mr-auto"
                        } w-fit text-[14px] leading-5 ${selected ? "ring-2 ring-[var(--accent2)]" : ""} chat-slide-in`}
                    onDoubleClick={handleDoubleClick}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    style={{
                        borderRadius: mine ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                        maxWidth: "min(520px, 70%)",
                        minWidth: editing ? "270px" : "120px",
                        overflowWrap: "break-word",
                        wordBreak: "normal",
                        hyphens: "none",
                        transform: swipeOffset ? `translateX(${mine ? -swipeOffset : swipeOffset}px)` : undefined,
                        transition: swipeOffset ? "none" : "transform .18s ease-out",
                    }}
                >
                    {/* corazones flotantes */}
                    {floatingHearts.map(h => (
                        <span
                            key={h.id}
                            className="chat-float-heart"
                            style={{ left: h.x - 14, top: h.y - 14 }}
                            aria-hidden
                        >❤️</span>
                    ))}

                    {/* ⋮ botón — anclado al centro vertical del borde de la burbuja */}
                    <button
                        ref={menuBtnRef}
                        className={clsx(
                            "absolute top-1/2 -translate-y-1/2 z-20 rounded-full p-1.5",
                            "hover:bg-white/10 focus:bg-white/10 cursor-pointer",
                            // móvil: siempre visible; desktop: aparece al hover de la burbuja
                            "opacity-100 lg:opacity-0 lg:group-hover:opacity-100",
                            // lado según autor
                            mine ? "-left-8" : "-right-8"
                        )}
                        onClick={() => {
                            setMenuOpen((v) => {
                                const next = !v;
                                if (next) {
                                    // cerrar otros menús abiertos
                                    window.dispatchEvent(
                                        new CustomEvent("dc-close-other-menus", { detail: { key: msgId } })
                                    );
                                }
                                return next;
                            });
                        }}
                        aria-label="Más opciones"
                    >
                        <EllipsisVerticalIcon className="w-5 h-5" />
                    </button>

                    {/* label "Reenviado" */}
                    {forwarded && (
                        <div className={`flex items-center gap-1 px-4 pt-2 pb-0 text-[11px] ${mine ? "opacity-60" : "opacity-50"}`}>
                            <ArrowPathIcon className="w-3 h-3" />
                            <span>Reenviado</span>
                        </div>
                    )}

                    {/* quote (reply) — clickeable para saltar al mensaje original */}
                    {replyTo && (
                        <button
                            type="button"
                            className={clsx(
                                "flex items-stretch rounded-t-xl overflow-hidden -mx-0 border-b w-full text-left",
                                "transition-opacity hover:opacity-80 active:opacity-60 cursor-pointer",
                                mine ? "border-[var(--accent)]/30" : "border-white/10"
                            )}
                            onClick={() => onJumpToReply?.(replyTo.id)}
                        >
                            <div className={`w-1 flex-shrink-0 ${mine ? "bg-white/60" : "bg-[var(--accent2)]"}`} />
                            <div className="px-3 py-2 text-[12px] opacity-75 leading-snug max-h-10 overflow-hidden">
                                <span className="font-semibold block">{replyTo.senderName}</span>
                                <span className="truncate block">{replyTo.text || "📎 adjunto"}</span>
                            </div>
                        </button>
                    )}

                    {/* contenido */}
                    <div className="px-4 py-2 flex flex-col">
                    {editing ? (
                        <div className="flex flex-col gap-2 min-w-[230px]">
                            <textarea
                                ref={editRef}
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                                className="bg-black/20 rounded-xl px-3 py-2 w-full outline-none resize-none text-[14px] leading-5 min-h-[44px] border border-white/20 focus:border-white/40 transition-colors placeholder-white/40"
                                onKeyDown={e => {
                                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); }
                                    if (e.key === "Escape") setEditing(false);
                                }}
                            />
                            <div className="flex gap-2 justify-end">
                                <button type="button" onClick={() => setEditing(false)}
                                    className="cursor-pointer px-3 py-1 rounded-lg text-[12px] font-medium opacity-70 hover:opacity-100 hover:bg-white/10 transition">
                                    Cancelar
                                </button>
                                <button type="button" onClick={submitEdit}
                                    className="cursor-pointer px-3 py-1 rounded-lg text-[12px] font-semibold bg-white/20 hover:bg-white/30 transition">
                                    Guardar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={clsx(emojiLayoutClass, emojiSizeClass)}>
                            {typeof children === "string"
                                ? <EmojiText size={onlyEmoji ? "1em" : "1.2em"}>{children}</EmojiText>
                                : children}
                        </div>
                    )}

                    {/* hora + estado */}
                    <div className="mt-1 self-end text-[11px] opacity-70 leading-none whitespace-nowrap flex items-center gap-1">
                        {editedAt && <span className="opacity-60 italic">editado ·</span>}
                        {time}
                        <StatusIcon />
                    </div>
                    </div>
                </div>

                {/* Popover menú ⋮ */}
                {menuOpen && (
                    <>
                        {/* Backdrop transparente debajo del menú: captura cualquier click fuera */}
                        <div
                            className="fixed inset-0 z-40 cursor-default"
                            aria-hidden="true"
                            onClick={() => setMenuOpen(false)}
                        />

                        {/* Menú */}
                        <div
                            ref={menuRef}
                            className={clsx(
                                "fixed z-50 w-44 rounded-xl border border-white/10 bg-[var(--bg2)]/95 backdrop-blur shadow-lg p-1",
                                "transform-gpu transition-[opacity,transform] duration-150",
                                mine ? "origin-right" : "origin-left"
                            )}
                            role="menu"
                            aria-orientation="vertical"
                            tabIndex={-1}
                            style={{ top: menuCoords.top, left: menuCoords.left }}
                        >
                            <MenuItem icon={ClipboardIcon} label="Copiar" onClick={handleCopy} />
                            <MenuItem icon={FaceSmileIcon} label="Reaccionar" onClick={openReactPopover} />
                            {onReply && <MenuItem icon={ChevronLeftIcon} label="Responder" onClick={() => { onReply(); setMenuOpen(false); }} />}
                            {onForward && <MenuItem icon={ArrowPathIcon} label="Reenviar" onClick={() => { onForward(); setMenuOpen(false); }} />}
                            <MenuItem icon={PencilIcon} label="Editar" onClick={startEdit} disabled={!canEdit} />
                            <div className="h-px bg-white/10 my-1" />
                            <MenuItem
                                icon={TrashIcon}
                                label="Eliminar para mí"
                                onClick={deleteForMe}
                                danger
                            />
                            {canDeleteForEveryone && (
                                <MenuItem
                                    icon={TrashIcon}
                                    label="Eliminar para todos"
                                    onClick={deleteForEveryone}
                                    danger
                                />
                            )}
                        </div>
                    </>
                )}

                {/* Popover reacciones — 6 emojis */}
                {reactOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            aria-hidden="true"
                            onClick={() => setReactOpen(false)}
                        />
                        <div
                            className="fixed z-50 rounded-full border border-white/10 bg-[var(--bg2)]/95 backdrop-blur shadow-lg px-2 py-1 flex items-center gap-0.5"
                            style={{ top: reactCoords.top, left: reactCoords.left }}
                        >
                            {EMOJI_REACTIONS.map(({ key, emoji }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleReaction(key)}
                                    className={clsx(
                                        "w-10 h-10 rounded-full flex items-center justify-center text-[22px] transition-transform hover:scale-125",
                                        myReaction(key) ? "bg-white/15 scale-110" : "hover:bg-white/10"
                                    )}
                                    title={emoji}
                                >
                                    <TwemojiImg emoji={emoji} size="1.4rem" />
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {/* Reacciones bajo la burbuja */}
                {hasAnyReaction && (
                    <div className={`absolute -bottom-5 flex gap-0.5 ${mine ? "right-1" : "left-1"}`}>
                        {EMOJI_REACTIONS.filter(r => reactionCount(r.key) > 0).map(({ key, emoji }) => (
                            <button
                                key={key}
                                type="button"
                                title={myReaction(key) ? "Quitar reacción" : "Reaccionar"}
                                onClick={() => toggleReaction(key)}
                                className={clsx(
                                    "flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-full border transition",
                                    myReaction(key)
                                        ? "bg-[var(--accent)]/30 border-[var(--accent)]/40 text-white"
                                        : "bg-[var(--bg3)]/80 border-white/10 text-[var(--sub)] hover:bg-white/10"
                                )}
                            >
                                <TwemojiImg emoji={emoji} size="0.95rem" />
                                {reactionCount(key) > 1 && <span>{reactionCount(key)}</span>}
                            </button>
                        ))}
                    </div>
                )}

                {/* Motivo del fallo + reintento, al pulsar el círculo rojo */}
                {showError && status === "error" && mine && (
                    <div className="absolute right-0 -bottom-1 translate-y-full z-30 w-64 rounded-xl border border-red-500/30 bg-[var(--bg2)]/95 backdrop-blur shadow-lg p-3">
                        <div className="mb-2 text-sm text-red-200">
                            {errorMessage || "No se pudo enviar el mensaje."}
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                className="px-3 py-1.5 text-sm rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer"
                                onClick={() => setShowError(false)}
                            >
                                Cerrar
                            </button>
                            <button
                                className="px-3 py-1.5 text-sm rounded-lg bg-red-600 hover:bg-red-500 cursor-pointer"
                                onClick={() => {
                                    setShowError(false);
                                    onRetry?.();
                                }}
                            >
                                Reintentar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* ===== composer ===== */
function ChatComposer({ disabled, onSend, draftKey, onTyping, onRecording }) {
    const [text, setText] = useState("");
    const typingTimerRef = useRef(null);
    // ===== BORRADOR (WhatsApp-like) =====
    useEffect(() => {
        if (typeof window === "undefined") return;

        // si no hay chat activo (o no hay key), limpiar el texto
        if (!draftKey) {
            setText("");
            return;
        }

        try {
            const saved = window.localStorage.getItem(draftKey);

            // si hay borrador para ESTE chat, cargarlo; si no, vaciar
            if (typeof saved === "string" && saved.length) {
                setText(saved);
            } else {
                setText("");
            }
        } catch (_) {
            setText("");
        }
    }, [draftKey]);

    // NUEVO: preview de imágenes + panel de emoji
    const [pendingImages, setPendingImages] = useState([]); // [{id,file,url}]
    const [showEmojiPanel, setShowEmojiPanel] = useState(false);
    const [showGif, setShowGif] = useState(false);
    const [gifAnchor, setGifAnchor] = useState(null); // botón que abrió el picker

    // === View-once flag (NECESARIO para sendPendingImages)
    const [viewOnce, setViewOnce] = useState(false);

    // ←←← FIX: mantener el valor de viewOnce disponible en handlers asíncronos
    const viewOnceRef = useRef(false);
    useEffect(() => {
        viewOnceRef.current = viewOnce;
    }, [viewOnce]);

    // === Toast efímero (2s, aparece sobre el composer)
    function toastOnce(msg) {
        const id = "composer-toast";
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement("div");
            el.id = id;
            el.style.position = "fixed";
            el.style.bottom = "110px";
            el.style.left = "50%";
            el.style.transform = "translateX(-50%)";
            el.style.padding = "8px 12px";
            el.style.borderRadius = "10px";
            el.style.background = "rgba(0,0,0,.85)";
            el.style.color = "#fff";
            el.style.fontSize = "12px";
            el.style.zIndex = "1000";
            el.style.pointerEvents = "none";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.style.opacity = "1";
        setTimeout(() => { if (el) el.style.opacity = "0"; }, 1800);
    }

    const [openMenu, setOpenMenu] = useState(false);
    const imgRef = useRef(null), fileRef = useRef(null), audioRef = useRef(null), videoRef = useRef(null);
    const [prepping, setPrepping] = useState(false); // comprimiendo/preparando video
    const [attachError, setAttachError] = useState(""); // adjuntos rechazados por seguridad
    const taRef = useRef(null);

    // ===== Grabación de notas de voz =====
    const [recording, setRecording] = useState(false);
    const [recSecs, setRecSecs] = useState(0);
    const [recVO, setRecVO] = useState(false); // grabar como "escuchar una vez"
    const recVORef = useRef(false);
    useEffect(() => { recVORef.current = recVO; }, [recVO]);
    const [recPaused, setRecPaused] = useState(false);

    function togglePauseRecording() {
        const mr = mediaRecRef.current;
        if (!mr) return;
        try {
            if (mr.state === "recording") { mr.pause(); setRecPaused(true); }
            else if (mr.state === "paused") { mr.resume(); setRecPaused(false); }
        } catch (_) { }
    }
    const mediaRecRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const recTimerRef = useRef(null);
    const recCanceledRef = useRef(false);

    function pickMime() {
        const opts = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
        for (const m of opts) {
            try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; } catch (_) { }
        }
        return "";
    }

    function stopStream() {
        try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch (_) { }
        streamRef.current = null;
    }

    function fmtRec(s) {
        const m = Math.floor(s / 60), ss = s % 60;
        return `${m}:${String(ss).padStart(2, "0")}`;
    }

    async function startRecording() {
        if (disabled || recording) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mime = pickMime();
            const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
            chunksRef.current = [];
            recCanceledRef.current = false;
            mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
            mr.onstop = async () => {
                stopStream();
                clearInterval(recTimerRef.current);
                onRecording?.(false);
                const canceled = recCanceledRef.current;
                const secs = recSecsRef.current;
                setRecording(false);
                setRecSecs(0);
                setRecPaused(false);
                if (canceled || !chunksRef.current.length || secs < 1) return;
                const type = mr.mimeType || "audio/webm";
                const blob = new Blob(chunksRef.current, { type });
                const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
                const file = new File([blob], `audio-${Date.now()}.${ext}`, { type });
                const vo = recVORef.current;
                setRecVO(false);
                await onSend?.({ text: "", attachments: [{ kind: "audio", file, durationSecs: secs }], viewOnce: vo });
            };
            mr.start();
            mediaRecRef.current = mr;
            setRecording(true);
            setRecSecs(0);
            setRecPaused(false);
            onRecording?.(true);
            // el cronómetro solo avanza cuando NO está en pausa
            recTimerRef.current = setInterval(() => {
                if (mediaRecRef.current?.state === "recording") setRecSecs(s => s + 1);
            }, 1000);
        } catch (e) {
            console.warn("No se pudo acceder al micrófono:", e);
            alert("No se pudo acceder al micrófono. Revisa los permisos del navegador.");
        }
    }

    // mantener recSecs accesible dentro de onstop
    const recSecsRef = useRef(0);
    useEffect(() => { recSecsRef.current = recSecs; }, [recSecs]);

    function finishRecording(cancel) {
        recCanceledRef.current = !!cancel;
        try { mediaRecRef.current?.stop(); } catch (_) { stopStream(); setRecording(false); onRecording?.(false); }
    }

    useEffect(() => () => { // limpieza al desmontar
        clearInterval(recTimerRef.current);
        stopStream();
    }, []);

    const MAX_HEIGHT_PX = 160; // ~5-6 líneas
    const canSendText = !disabled && text.trim().length > 0;
    const canSendImgs = !disabled && pendingImages.length > 0;

    function autoGrow() {
        const el = taRef.current;
        if (!el) return;
        el.style.height = "auto";
        const next = Math.min(el.scrollHeight, MAX_HEIGHT_PX);
        el.style.height = next + "px";
        el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
    }
    useEffect(() => { autoGrow(); }, [text]);

    function pick(type) {
        if (type === "image") imgRef.current?.click();
        if (type === "file") fileRef.current?.click();
        if (type === "audio") audioRef.current?.click();
        if (type === "video") videoRef.current?.click();
        setOpenMenu(false);
    }

    // Inserta un emoji en la posición del cursor del textarea
    function insertEmoji(emoji) {
        const el = taRef.current;
        if (!el) { setText(t => t + emoji); return; }
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const v = el.value ?? "";
        const next = v.slice(0, start) + emoji + v.slice(end);
        setText(next);
        // reubicar el cursor tras el emoji
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + emoji.length;
            try { el.setSelectionRange(pos, pos); } catch (_) { }
        });
    }

    // ===== Helpers de preview =====
    function addPendingFiles(fileList) {
        const files = Array.from(fileList || []).filter(f => f && f.type?.startsWith("image/"));
        if (!files.length) return;
        const items = files.map((f) => ({
            id: crypto.randomUUID(),
            file: f,
            url: URL.createObjectURL(f),
        }));
        setPendingImages(prev => [...prev, ...items]);
    }
    function removePending(id) { setPendingImages(prev => prev.filter(x => x.id !== id)); }
    function clearPending() { setPendingImages([]); }

    // ===== Inputs ocultos =====
    async function handleFiles(list, kind) {
        if (disabled || !list?.length) return;

        // Validación previa: comprueba la firma real del archivo (no la extensión)
        // y la duración de los videos. Impide colar ejecutables renombrados.
        setPrepping(true);
        let ok, errores;
        try {
            ({ ok, errores } = await guardChatFiles(list, kind));
        } finally {
            setPrepping(false);
        }
        if (errores.length) setAttachError(errores.join("\n"));
        if (!ok.length) return;

        if (kind === "image") {
            // imágenes → van al preview (NO se envían aún)
            addPendingFiles(ok);
            return;
        }
        if (kind === "video") {
            try {
                setPrepping(true);
                // Comprimir (best-effort) y enviar uno por uno
                for (const f of ok) {
                    const out = await compressVideo(f);
                    await onSend?.({ text: "", attachments: [{ kind: "video", file: out }] });
                }
            } finally {
                setPrepping(false);
            }
            return;
        }
        // otros tipos (archivo/audio) se envían de inmediato como adjuntos
        await onSend?.({ text: "", attachments: ok.map((f) => ({ kind, file: f })) });
    }

    // ===== Pegar desde portapapeles =====
    async function handlePaste(e) {
        if (!e.clipboardData) return;
        const items = Array.from(e.clipboardData.items || []);
        const imgs = items
            .filter(i => i.kind === "file" && i.type.startsWith("image/"))
            .map(i => i.getAsFile())
            .filter(Boolean);
        if (imgs.length) {
            e.preventDefault();
            // Se valida igual que al elegir desde el selector de archivos.
            const { ok, errores } = await guardChatFiles(imgs, "image");
            if (errores.length) setAttachError(errores.join("\n"));
            if (ok.length) addPendingFiles(ok);
        }
    }

    // ===== Envíos =====
    async function submitText(e) {
        e?.preventDefault?.();
        if (!canSendText) return;
        const t = text.trim();
        await onSend?.({ text: t, attachments: [] });
        setText("");
        // limpiar borrador al enviar
        if (typeof window !== "undefined" && draftKey) {
            try { window.localStorage.removeItem(draftKey); } catch (_) { }
        }
        const el = taRef.current;
        if (el) { el.style.height = "auto"; el.style.overflowY = "hidden"; }
    }

    async function sendPendingImages(currentViewOnce) {
        if (!pendingImages.length) return;
        const caption = (text || "").trim();
        const payload = pendingImages.map(x => ({ kind: "image", file: x.file }));
        await onSend?.({ text: caption, attachments: payload, viewOnce: viewOnceRef?.current ?? viewOnce });
        clearPending();
        setViewOnce(false); // reset del toggle
        setText("");
        // limpiar borrador al enviar
        if (typeof window !== "undefined" && draftKey) {
            try { window.localStorage.removeItem(draftKey); } catch (_) { }
        }
        const el = taRef.current;
        if (el) { el.style.height = "auto"; el.style.overflowY = "hidden"; }
    }

    // Enter = enviar texto si NO hay imágenes en preview; Shift+Enter = nueva línea
    function handleKeyDown(e) {
        if (disabled) return;
        if (e.key === "Enter" && !e.shiftKey && pendingImages.length === 0) {
            e.preventDefault();
            submitText(e);
        }
        // Si hay imágenes en preview, el Enter manda texto solo con Shift+Enter.
        // El envío de imágenes+caption se hace con el botón "Enviar" del preview.
    }

    return (
        <div className="p-4 relative">
            {/* ===== BANDEJA DE PREVIEW (cuando hay imágenes) ===== */}
            {pendingImages.length > 0 && (
                <div className="mb-3 rounded-2xl border border-white/10 bg-[var(--bg)]/90 backdrop-blur p-3 shadow-lg">
                    {/* Header: título + acciones */}
                    <div className="flex items-center justify-between mb-2.5">
                        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
                            <PhotoIcon className="w-4 h-4 text-white/50" />
                            {pendingImages.length === 1 ? "1 imagen" : `${pendingImages.length} imágenes`}
                        </div>
                        <div className="flex items-center gap-1">
                            {/* Ver una vez */}
                            <button
                                type="button"
                                onClick={() => {
                                    setViewOnce(v => {
                                        const nv = !v;
                                        toastOnce(nv ? "Se podrá ver una sola vez" : "Se podrá ver siempre");
                                        return nv;
                                    });
                                }}
                                className={clsx(
                                    "h-8 px-3 inline-flex items-center gap-1.5 rounded-full border text-xs font-medium transition cursor-pointer",
                                    viewOnce ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white/8 border-white/10 hover:bg-white/12 text-white/70"
                                )}
                                title="Enviar para ver una sola vez"
                                aria-pressed={viewOnce}
                            >
                                <span className="grid place-content-center w-4 h-4 rounded-full border border-current text-[10px] leading-none">1</span>
                                Ver una vez
                            </button>
                            {/* Descartar todo */}
                            <button
                                type="button"
                                onClick={clearPending}
                                className="w-8 h-8 grid place-content-center rounded-full hover:bg-red-500/15 text-white/50 hover:text-red-400 transition cursor-pointer"
                                title="Descartar todo"
                                aria-label="Descartar adjuntos"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Tira de thumbnails */}
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {pendingImages.map(img => (
                            <div key={img.id} className="relative shrink-0 group">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={img.url}
                                    alt=""
                                    className="h-24 w-24 object-cover rounded-xl border border-white/10"
                                />
                                <button
                                    onClick={() => removePending(img.id)}
                                    className="absolute top-1 right-1 h-6 w-6 grid place-content-center rounded-full bg-black/70 border border-white/15 hover:bg-black text-white/90 cursor-pointer transition"
                                    title="Quitar"
                                    aria-label="Quitar imagen"
                                >
                                    <XMarkIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Footer: emoji + enviar */}
                    <div className="mt-2.5 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={() => { taRef.current?.focus(); setShowEmojiPanel(v => !v); }}
                            className={clsx("w-9 h-9 grid place-content-center rounded-full transition cursor-pointer hover:bg-white/10", showEmojiPanel && "bg-white/10 text-yellow-300")}
                            title="Emojis"
                            aria-label="Abrir emojis"
                        >
                            <FaceSmileIcon className="w-5 h-5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => sendPendingImages(viewOnce)}
                            className="inline-flex items-center gap-2 pl-4 pr-3 py-2 rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white text-sm font-medium cursor-pointer transition active:scale-95"
                            title="Enviar"
                        >
                            Enviar
                            <PaperAirplaneIcon className="w-4 h-4 -rotate-45 translate-x-px" />
                        </button>
                    </div>

                    {/* Panel de emojis (componente global) */}
                    {showEmojiPanel && (
                        <div className="mt-2">
                            <EmojiPicker
                                className="w-full"
                                onPick={insertEmoji}
                                onClose={() => setShowEmojiPanel(false)}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Panel de emojis sin imágenes pendientes — FLOTA sobre el chat */}
            {showEmojiPanel && pendingImages.length === 0 && (
                <>
                    <div className="fixed inset-0 z-20" aria-hidden onClick={() => setShowEmojiPanel(false)} />
                    <div className="absolute left-3 bottom-full mb-2 z-30">
                        <EmojiPicker
                            onPick={insertEmoji}
                            onClose={() => setShowEmojiPanel(false)}
                        />
                    </div>
                </>
            )}

            {/* ===== COMPOSER ===== */}
            {prepping && (
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 text-xs text-white/70">
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Revisando archivo…
                </div>
            )}
            {attachError && (
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    <span className="whitespace-pre-line flex-1">{attachError}</span>
                    <button type="button" onClick={() => setAttachError("")}
                        className="shrink-0 text-amber-200/60 hover:text-amber-100 cursor-pointer" title="Cerrar">✕</button>
                </div>
            )}
            <form onSubmit={submitText}>
                <div className="flex items-center gap-2">
                    {/* + FUERA DE LA PÍLDORA */}
                    <div className="relative">
                        <button
                            type="button"
                            className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center transition hover:bg-white/10 active:scale-95"
                            disabled={disabled}
                            onClick={() => setOpenMenu(v => !v)}
                            title="Adjuntar"
                            style={{ cursor: disabled ? "default" : "pointer" }}
                        >
                            <PlusIcon className="w-5 h-5" />
                        </button>

                        {openMenu && !disabled && (
                            <>
                                <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpenMenu(false)} />
                                <div className="absolute left-0 bottom-12 z-20 w-52 rounded-2xl border border-white/10 bg-[var(--bg)]/95 backdrop-blur p-1.5 shadow-xl">
                                    <button type="button" onClick={() => pick("image")}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition cursor-pointer text-left">
                                        <span className="grid place-content-center w-9 h-9 rounded-full bg-[var(--accent)]/15 text-[var(--accent2)] shrink-0">
                                            <PhotoIcon className="w-5 h-5" />
                                        </span>
                                        <span>
                                            <span className="block text-sm font-medium">Imagen</span>
                                            <span className="block text-xs text-white/45">Fotos de tu galería</span>
                                        </span>
                                    </button>
                                    <button type="button" onClick={() => pick("video")}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition cursor-pointer text-left">
                                        <span className="grid place-content-center w-9 h-9 rounded-full bg-rose-500/15 text-rose-300 shrink-0">
                                            <VideoCameraIcon className="w-5 h-5" />
                                        </span>
                                        <span>
                                            <span className="block text-sm font-medium">Video</span>
                                            <span className="block text-xs text-white/45">Se comprime antes de enviar</span>
                                        </span>
                                    </button>
                                    <button type="button" onClick={() => pick("file")}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition cursor-pointer text-left">
                                        <span className="grid place-content-center w-9 h-9 rounded-full bg-[var(--accent)]/15 text-[var(--accent2)] shrink-0">
                                            <DocumentIcon className="w-5 h-5" />
                                        </span>
                                        <span>
                                            <span className="block text-sm font-medium">Archivo</span>
                                            <span className="block text-xs text-white/45">Documentos y otros</span>
                                        </span>
                                    </button>
                                    <button type="button" onClick={() => pick("audio")}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/8 transition cursor-pointer text-left">
                                        <span className="grid place-content-center w-9 h-9 rounded-full bg-violet-500/15 text-violet-300 shrink-0">
                                            <MusicalNoteIcon className="w-5 h-5" />
                                        </span>
                                        <span>
                                            <span className="block text-sm font-medium">Audio</span>
                                            <span className="block text-xs text-white/45">Notas de voz o música</span>
                                        </span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* INPUTS OCULTOS */}
                    <input ref={imgRef} type="file" accept="image/*" multiple className="hidden"
                        onChange={(e) => handleFiles(e.target.files, "image")} />
                    <input ref={videoRef} type="file" accept="video/*" multiple className="hidden"
                        onChange={(e) => { handleFiles(e.target.files, "video"); e.target.value = ""; }} />
                    <input ref={fileRef} type="file" multiple className="hidden"
                        onChange={(e) => handleFiles(e.target.files, "file")} />
                    <input ref={audioRef} type="file" accept="audio/*" multiple className="hidden"
                        onChange={(e) => handleFiles(e.target.files, "audio")} />

                    {/* PÍLDORA o BARRA DE GRABACIÓN */}
                    {recording ? (
                        <div className="flex items-center gap-3 rounded-3xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 flex-1">
                            <span className={clsx("w-3 h-3 rounded-full bg-red-500 shrink-0", !recPaused && "animate-pulse")} />
                            <span className="text-sm text-white/80 flex-1">{recPaused ? "En pausa" : "Grabando…"} <span className="tabular-nums opacity-70">{fmtRec(recSecs)}</span></span>
                            <button
                                type="button"
                                onClick={togglePauseRecording}
                                className="w-9 h-9 grid place-content-center rounded-full hover:bg-white/10 text-white/70 cursor-pointer transition shrink-0"
                                title={recPaused ? "Continuar" : "Pausar"}
                                aria-label={recPaused ? "Continuar grabación" : "Pausar grabación"}
                            >
                                {recPaused ? <PlayIconSolid className="w-5 h-5" /> : <PauseIconSolid className="w-5 h-5" />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setRecVO(v => !v)}
                                className={clsx(
                                    "w-9 h-9 grid place-content-center rounded-full border transition cursor-pointer shrink-0",
                                    recVO ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "bg-white/8 border-white/10 hover:bg-white/12 text-white/70"
                                )}
                                title={recVO ? "Escuchar una vez: activado" : "Escuchar una sola vez"}
                                aria-pressed={recVO}
                            >
                                <span className="grid place-content-center w-5 h-5 rounded-full border border-current text-[11px] leading-none font-semibold">1</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => finishRecording(true)}
                                className="w-9 h-9 grid place-content-center rounded-full hover:bg-white/10 text-white/60 hover:text-red-400 cursor-pointer transition"
                                title="Cancelar"
                                aria-label="Cancelar grabación"
                            >
                                <TrashIcon className="w-5 h-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => finishRecording(false)}
                                className="w-9 h-9 grid place-content-center rounded-full bg-[var(--accent)] hover:bg-[var(--accent)] text-white cursor-pointer transition active:scale-90"
                                title="Enviar audio"
                                aria-label="Enviar audio"
                            >
                                <PaperAirplaneIcon className="w-4 h-4 -rotate-45 translate-x-px" />
                            </button>
                        </div>
                    ) : (
                    <div className="relative flex items-end gap-2 rounded-3xl border border-white/10 px-2 py-1.5 flex-1 overflow-hidden">
                        {/* EMOJI A LA IZQUIERDA */}
                        <button
                            type="button"
                            onClick={() => {
                                taRef.current?.focus();
                                setShowEmojiPanel(v => !v);
                            }}
                            className={clsx("shrink-0 w-9 h-9 grid place-content-center rounded-full transition cursor-pointer hover:bg-white/10", showEmojiPanel && "bg-white/10 text-yellow-300")}
                            title="Emojis"
                            aria-label="Abrir emojis"
                        >
                            <FaceSmileIcon className="w-5 h-5" />
                        </button>

                        {/* GIF (mismo picker que en comentarios) */}
                        <button
                            type="button"
                            onClick={(e) => { setGifAnchor(e.currentTarget); setShowGif((v) => !v); }}
                            disabled={disabled}
                            className="shrink-0 w-9 h-9 grid place-content-center rounded-full transition cursor-pointer hover:bg-white/10 disabled:opacity-40 disabled:cursor-default"
                            title="GIF"
                            aria-label="Buscar GIF"
                        >
                            <GifIcon className="w-5 h-5" />
                        </button>

                        {/* TEXTAREA con onPaste para imágenes */}
                        <textarea
                            ref={taRef}
                            className="flex-1 bg-transparent outline-none text-sm resize-none leading-5 py-2 px-2 md:px-3 mr-1"
                            placeholder={disabled ? "No puedes enviar en esta conversación" : "Mensaje"}
                            value={text}
                            onChange={(e) => {
                                const v = e.target.value;
                                setText(v);

                                // guardar borrador por conversación
                                if (typeof window !== "undefined" && draftKey) {
                                    try {
                                        if (v && v.trim().length) window.localStorage.setItem(draftKey, v);
                                        else window.localStorage.removeItem(draftKey);
                                    } catch (_) { }
                                }

                                // typing indicator: dispara onTyping, luego silencia tras 3s de inactividad
                                if (onTyping && v.trim().length) {
                                    onTyping(true);
                                    clearTimeout(typingTimerRef.current);
                                    typingTimerRef.current = setTimeout(() => onTyping(false), 3000);
                                } else if (onTyping) {
                                    clearTimeout(typingTimerRef.current);
                                    onTyping(false);
                                }
                            }}
                            onInput={autoGrow}
                            onKeyDown={handleKeyDown}
                            onPaste={handlePaste}
                            disabled={disabled}
                            rows={1}
                            inputMode="text"
                            enterKeyHint="send"
                            style={{
                                height: "auto",
                                overflowY: "hidden",
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                scrollbarGutter: "stable",
                                paddingRight: "0.75rem",
                                paddingLeft: "0.75rem",
                            }}
                        />

                        {/* ENVIAR (texto) o MICRÓFONO (si no hay texto) */}
                        {canSendText ? (
                            <button
                                type="submit"
                                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 bg-[var(--accent)] hover:bg-[var(--accent)] cursor-pointer"
                                title="Enviar"
                            >
                                <PaperAirplaneIcon className="w-4 h-4 -rotate-45 translate-x-px" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={startRecording}
                                disabled={disabled}
                                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 hover:bg-white/10 text-white/70 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                                title="Grabar nota de voz"
                                aria-label="Grabar nota de voz"
                            >
                                <MicrophoneIcon className="w-5 h-5" />
                            </button>
                        )}
                    </div>
                    )}
                </div>
            </form>

            {/* GIF picker global (Giphy) — al elegir, se envía como mensaje */}
            <GifPicker
                open={showGif}
                anchorEl={gifAnchor}
                onClose={() => setShowGif(false)}
                onPick={(url) => {
                    setShowGif(false);
                    if (url) onSend?.({ text: "", attachments: [{ kind: "image", url, name: "gif.gif", isGif: true }] });
                }}
            />
        </div>
    );
}

/* ===== helpers datos ===== */
function isDeletedUser(u) {
    return u?.status === "deleted" || u?.profile?.status === "deleted";
}
function displayNameFromUser(u) {
    if (isDeletedUser(u)) return "Cuenta eliminada";
    return (
        u?.profile?.profileName ||
        u?.profileName ||
        u?.displayName ||
        (typeof u?.username === "string" ? u.username.replace(/^@/, "") : "") ||
        u?.usernameSlug ||
        "Usuario"
    );
}
function avatarFromUser(u) {
    if (isDeletedUser(u)) return "";
    return u?.avatarUrl || u?.photoURL || "";
}
function uidPair(a, b) {
    return [a, b].sort().join("__");
}

async function markConversationRead(cid, user, db) {
    if (!user?.uid || !cid) return;
    try {
        await updateDoc(doc(db, "conversations", cid), {
            [`readAt.${user.uid}`]: serverTimestamp(),
        });
    } catch (_) { }
}

/* ===== ConfirmDialog (reemplaza window.confirm) ===== */
function ConfirmDialog({ title, message, confirmLabel = "Aceptar", cancelLabel = "Cancelar", danger = false, onResolve }) {
    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => onResolve(false)} />
            <div className="relative z-10 w-[min(380px,92vw)] rounded-2xl border border-white/10 bg-[var(--bg2)] p-5 shadow-xl">
                {title && <h3 className="font-semibold text-base mb-1.5">{title}</h3>}
                <p className="text-sm text-white/70">{message}</p>
                <div className="mt-5 flex justify-end gap-2">
                    <button onClick={() => onResolve(false)}
                        className="px-4 py-2 rounded-xl text-sm hover:bg-white/10 cursor-pointer transition">{cancelLabel}</button>
                    <button onClick={() => onResolve(true)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition ${danger ? "bg-red-600 hover:bg-red-500 text-white" : "bg-[var(--accent)] hover:bg-[var(--accent)] text-white"}`}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ===== Toggle reutilizable ===== */
function Toggle({ checked, onChange }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={clsx(
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition cursor-pointer",
                checked ? "bg-[var(--accent)]" : "bg-white/15"
            )}
        >
            <span className={clsx(
                "inline-block h-5 w-5 transform rounded-full bg-white shadow transition",
                checked ? "translate-x-5" : "translate-x-0.5"
            )} />
        </button>
    );
}

/* ===== ChatSearchOverlay (buscar mensajes: texto / fecha / miembro) ===== */
function ChatSearchOverlay({ messages, userMap, isGroup, participants, currentUid, onJump, onClose }) {
    const [q, setQ] = useState("");
    const [sender, setSender] = useState("");
    const [date, setDate] = useState("");

    const results = useMemo(() => {
        const term = q.trim().toLowerCase();
        return messages.filter(m => {
            const text = (m.text || "").toLowerCase();
            if (term && !text.includes(term)) return false;
            if (sender && m.senderUid !== sender) return false;
            if (date) {
                const d = tsToDate(m.at);
                if (!d) return false;
                const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                if (ymd !== date) return false;
            }
            return !!(m.text || m.attachments?.length);
        }).slice().reverse();
    }, [messages, q, sender, date]);

    return (
        <div className="absolute inset-0 z-[45] flex flex-col bg-[var(--bg)]">
            <div className="p-3 border-b border-white/10 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer"><ChevronLeftIcon className="w-5 h-5" /></button>
                    <div className="flex-1 flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5">
                        <IconSearch className="opacity-60" />
                        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el chat" className="bg-transparent outline-none text-sm w-full" />
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <input type="date" value={date} onChange={e => setDate(e.target.value)}
                        className="rounded-lg border border-white/10 bg-transparent px-2 py-1 text-xs text-white/80 [color-scheme:dark]" />
                    {isGroup && (
                        <select value={sender} onChange={e => setSender(e.target.value)}
                            className="rounded-lg border border-white/10 bg-[var(--bg2)] px-2 py-1 text-xs text-white/80">
                            <option value="">Todos los miembros</option>
                            {(participants || []).map(uid => (
                                <option key={uid} value={uid}>{uid === currentUid ? "Tú" : (displayNameFromUser(userMap[uid]) || "Usuario")}</option>
                            ))}
                        </select>
                    )}
                    {(q || date || sender) && (
                        <button onClick={() => { setQ(""); setDate(""); setSender(""); }} className="text-xs text-white/50 hover:text-white cursor-pointer">Limpiar</button>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {results.length === 0 ? (
                    <div className="p-6 text-center text-sm text-white/40">Sin resultados.</div>
                ) : results.map(m => {
                    const d = tsToDate(m.at);
                    const who = m.senderUid === currentUid ? "Tú" : (displayNameFromUser(userMap[m.senderUid]) || "Usuario");
                    const preview = m.text || (m.attachments?.some(a => a.kind === "image") ? "📷 Foto" : m.attachments?.some(a => a.kind === "video") ? "🎥 Video" : m.attachments?.some(a => a.kind === "audio") ? "🎤 Audio" : "📎 Adjunto");
                    return (
                        <button key={m.id} onClick={() => { onJump(m.id); onClose(); }}
                            className="w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 cursor-pointer">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-white/70 truncate">{who}</span>
                                <span className="text-[11px] text-white/40 shrink-0">{d ? d.toLocaleString([], { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</span>
                            </div>
                            <div className="text-sm text-white/85 truncate mt-0.5">{preview}</div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/* ===== ContactInfoModal (info de contacto 1:1, estilo WhatsApp) ===== */
const DISAPPEAR_OPTIONS = [
    { secs: 0, label: "No" },
    { secs: 86400, label: "24 horas" },
    { secs: 604800, label: "7 días" },
    { secs: 7776000, label: "90 días" },
];
function ContactInfoModal({ otherUser, otherUid, conv, muted, blocked, disappearingSecs, sharedImages,
    onToggleMute, onToggleBlock, onSetDisappearing, onClear, onDelete, onReport, onSearch, onClose, onOpenImage }) {
    const name = displayNameFromUser(otherUser) || otherUid || "Usuario";
    const handle = otherUser?.usernameSlug;
    const bio = otherUser?.profile?.bio || otherUser?.bio || "";
    const avatar = avatarFromUser(otherUser);

    return (
        <div className="fixed inset-0 z-[70]">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="absolute right-0 top-0 bottom-0 w-[min(420px,100vw)] bg-[var(--bg)] border-l border-white/10 overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 sticky top-0 bg-[var(--bg)]/95 backdrop-blur z-10">
                    <h3 className="font-semibold">Información</h3>
                    <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer"><XMarkIcon className="w-5 h-5" /></button>
                </div>

                {/* Cabecera de perfil */}
                <div className="flex flex-col items-center gap-2 px-4 py-6 border-b border-white/8">
                    <div className="h-28 w-28 rounded-full bg-[var(--bg3)] ring-1 ring-white/10 overflow-hidden grid place-content-center text-4xl font-bold text-white/70">
                        {avatar
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                            : (name[0] || "?").toUpperCase()}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xl font-semibold">{name}</span>
                        {otherUid && <Badges uid={otherUid} size="sm" />}
                    </div>
                    {handle && <span className="text-sm text-white/50">@{handle}</span>}
                    {bio && <p className="text-sm text-white/70 text-center mt-1 max-w-xs">{bio}</p>}
                    {handle && (
                        <Link href={`/perfil/${handle}`} className="mt-2 text-sm text-[var(--accent2)] hover:text-[var(--accent2)]">
                            Ver perfil completo →
                        </Link>
                    )}
                </div>

                {/* Archivos compartidos (imágenes) */}
                <div className="px-4 py-4 border-b border-white/8">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Archivos e imágenes</span>
                        <span className="text-xs text-white/40">{sharedImages.length}</span>
                    </div>
                    {sharedImages.length ? (
                        <div className="grid grid-cols-4 gap-1.5">
                            {sharedImages.slice(0, 12).map((it, i) => (
                                <button key={i} onClick={() => onOpenImage(it)} title="Ir al mensaje"
                                    className="aspect-square rounded-lg overflow-hidden border border-white/10 cursor-pointer hover:ring-2 hover:ring-[var(--accent2)] transition">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={it.url} alt="" className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    ) : <p className="text-xs text-white/40">Aún no han compartido archivos.</p>}
                </div>

                {/* Silenciar */}
                <div className="px-4 py-4 border-b border-white/8 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <BellSlashIcon className="w-5 h-5 text-white/60" />
                        <span className="text-sm">Silenciar notificaciones</span>
                    </div>
                    <Toggle checked={muted} onChange={() => onToggleMute()} />
                </div>

                {/* Mensajes temporales */}
                <div className="px-4 py-4 border-b border-white/8">
                    <div className="flex items-center gap-2.5 mb-2">
                        <ClockIcon className="w-5 h-5 text-white/60" />
                        <span className="text-sm">Mensajes temporales</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {DISAPPEAR_OPTIONS.map(o => (
                            <button key={o.secs} onClick={() => onSetDisappearing(o.secs)}
                                className={`px-3 py-1.5 rounded-full text-xs border cursor-pointer transition ${(disappearingSecs || 0) === o.secs ? "bg-[var(--accent)] text-white border-[var(--accent)]" : "border-white/10 hover:bg-white/10"}`}>
                                {o.label}
                            </button>
                        ))}
                    </div>
                    {!!disappearingSecs && <p className="text-[11px] text-white/40 mt-2">Los mensajes se ocultan tras ese tiempo para ambos.</p>}
                </div>

                {/* Acciones */}
                <div className="px-2 py-2">
                    <button onClick={onSearch} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/8 cursor-pointer text-left text-sm">
                        <IconSearch className="opacity-70" /> Buscar en el chat
                    </button>
                    <button onClick={onClear} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/8 cursor-pointer text-left text-sm">
                        <TrashIcon className="w-5 h-5 text-white/60" /> Vaciar chat
                    </button>
                    <button onClick={() => onToggleBlock()} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/8 cursor-pointer text-left text-sm text-red-400">
                        <NoSymbolIcon className="w-5 h-5" /> {blocked ? "Desbloquear" : "Bloquear"}
                    </button>
                    <button onClick={onReport} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/8 cursor-pointer text-left text-sm text-red-400">
                        <FlagIcon className="w-5 h-5" /> Reportar
                    </button>
                    <button onClick={onDelete} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-red-500/10 cursor-pointer text-left text-sm text-red-400">
                        <TrashIcon className="w-5 h-5" /> Eliminar chat
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ===== ListEditorModal (crear/editar lista de chats) ===== */
function ListEditorModal({ list, convos, userMap, userUid, onClose, onSave, onDelete }) {
    const [name, setName] = useState(list.name || "");
    const [emoji, setEmoji] = useState(list.emoji || "");
    const [cids, setCids] = useState(list.cids || []);
    const [showEmoji, setShowEmoji] = useState(false);
    const [q, setQ] = useState("");

    function toggle(cid) { setCids(p => p.includes(cid) ? p.filter(x => x !== cid) : [...p, cid]); }

    const options = convos.map(c => {
        const isGroup = !!c.isGroup;
        const other = isGroup ? null : (c.participantUids || []).find(u => u !== userUid);
        const u = other ? userMap[other] : null;
        const nm = isGroup ? (c.groupName || "Grupo") : (displayNameFromUser(u) || other || "Usuario");
        const avatar = isGroup ? (c.groupPhotoURL || "") : avatarFromUser(u);
        return { id: c.id, name: nm, avatar, isGroup };
    }).filter(o => o.name.toLowerCase().includes(q.trim().toLowerCase()));

    return (
        <div className="fixed inset-0 z-[70]">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(460px,94vw)] max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-black overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <h3 className="font-semibold">{list.id ? "Editar lista" : "Nueva lista"}</h3>
                    <button onClick={onClose} className="text-sm text-white/50 hover:text-white cursor-pointer">Cerrar</button>
                </div>
                <div className="p-4 space-y-3 overflow-y-auto">
                    {/* nombre + emoji */}
                    <div className="flex items-center gap-2 relative">
                        <button type="button" onClick={() => setShowEmoji(v => !v)}
                            className="w-11 h-11 shrink-0 grid place-content-center rounded-xl border border-white/10 hover:bg-white/10 cursor-pointer text-xl">
                            {emoji || <FaceSmileIcon className="w-5 h-5 text-white/50" />}
                        </button>
                        {showEmoji && (
                            <div className="absolute left-0 top-12 z-10">
                                <EmojiPicker onPick={(e) => { setEmoji(e); setShowEmoji(false); }} onClose={() => setShowEmoji(false)} />
                            </div>
                        )}
                        <input value={name} onChange={e => setName(e.target.value)} maxLength={40}
                            placeholder="Nombre de la lista"
                            className="flex-1 rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-sm outline-none focus:border-white/30" />
                    </div>

                    {/* buscador de conversaciones */}
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar personas o grupos…"
                        className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-white/30" />

                    <div className="text-xs text-white/40">{cids.length} seleccionada(s)</div>

                    <div className="divide-y divide-white/8 max-h-[40vh] overflow-y-auto rounded-xl border border-white/8">
                        {options.map(o => {
                            const sel = cids.includes(o.id);
                            return (
                                <button key={o.id} type="button" onClick={() => toggle(o.id)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 cursor-pointer text-left">
                                    <div className="h-9 w-9 rounded-full bg-[var(--bg3)] ring-1 ring-white/10 overflow-hidden grid place-content-center shrink-0">
                                        {o.avatar
                                            // eslint-disable-next-line @next/next/no-img-element
                                            ? <img src={o.avatar} alt="" className="h-full w-full object-cover" />
                                            : <span className="text-sm">{(o.name[0] || "?").toUpperCase()}</span>}
                                    </div>
                                    <span className="flex-1 truncate text-sm">{o.name}{o.isGroup ? <span className="text-white/40"> · grupo</span> : ""}</span>
                                    <span className={`w-5 h-5 rounded-full border-2 grid place-content-center ${sel ? "bg-[var(--accent)] border-[var(--accent)]" : "border-white/30"}`}>
                                        {sel && <CheckIcon className="w-3 h-3 text-white" />}
                                    </span>
                                </button>
                            );
                        })}
                        {options.length === 0 && <div className="px-3 py-4 text-sm text-white/40">Sin resultados.</div>}
                    </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-3 border-t border-white/10">
                    {list.id && (
                        <button onClick={() => onDelete(list.id)}
                            className="px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-500/10 cursor-pointer">Eliminar lista</button>
                    )}
                    <button onClick={() => onSave({ id: list.id, name, emoji, cids })}
                        disabled={!name.trim()}
                        className="ml-auto px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent)] text-sm disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
                        {list.id ? "Guardar" : "Crear lista"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ===== ChatSettingsModal ===== */
function ChatSettingsModal({ readReceipts, onToggleReadReceipts, onClose }) {
    const [notifPerm, setNotifPerm] = useState(
        typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
    );
    async function requestNotif() {
        if (!("Notification" in window)) return;
        try {
            const p = await Notification.requestPermission();
            setNotifPerm(p);
        } catch (_) { }
    }
    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(440px,92vw)] rounded-2xl border border-white/10 bg-black overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <h3 className="font-semibold">Ajustes de chat</h3>
                    <button onClick={onClose} className="text-sm text-white/50 hover:text-white cursor-pointer transition">Cerrar</button>
                </div>
                <div className="p-4 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-sm font-medium">Confirmaciones de lectura</div>
                            <p className="text-xs text-white/50 mt-0.5">
                                Si las desactivas, no verás el doble check azul de los demás y ellos tampoco sabrán cuándo leíste sus mensajes. No aplica a grupos.
                            </p>
                        </div>
                        <Toggle checked={readReceipts} onChange={onToggleReadReceipts} />
                    </div>

                    <div className="h-px bg-white/10" />

                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-sm font-medium">Notificaciones del navegador</div>
                            <p className="text-xs text-white/50 mt-0.5">
                                Recibe un aviso cuando te escriban y no estés viendo el chat. Respeta los chats silenciados.
                                {notifPerm === "denied" && " Están bloqueadas en los permisos del navegador."}
                            </p>
                        </div>
                        {notifPerm === "granted" ? (
                            <span className="shrink-0 text-xs text-[#4ade80] mt-1">Activadas ✓</span>
                        ) : notifPerm === "unsupported" ? (
                            <span className="shrink-0 text-xs text-white/40 mt-1">No disponible</span>
                        ) : (
                            <button onClick={requestNotif} disabled={notifPerm === "denied"}
                                className="shrink-0 px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)] text-xs disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed">
                                Activar
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ===== GroupMembersModal ===== */
function GroupMembersModal({ open, conv, userUid, db, onClose }) {
    const [members, setMembers] = useState([]);
    const adminList = Array.isArray(conv?.admins) ? conv.admins : (conv?.startedBy ? [conv.startedBy] : []);
    const isAdmin = adminList.includes(userUid);
    const isCreatorMe = conv?.startedBy === userUid;

    useEffect(() => {
        if (!open || !conv?.participantUids?.length) { setMembers([]); return; }
        let active = true;
        (async () => {
            const acc = [];
            for (let i = 0; i < conv.participantUids.length; i += 10) {
                const chunk = conv.participantUids.slice(i, i + 10);
                const snap = await getDocs(query(collection(db, "users"), where(documentId(), "in", chunk)));
                snap.forEach(d => acc.push({ id: d.id, ...d.data() }));
            }
            if (active) setMembers(acc);
        })();
        return () => { active = false; };
    }, [open, conv?.participantUids, db]);

    if (!open) return null;

    async function kickMember(uid) {
        if (!isAdmin || uid === userUid) return;
        try {
            await updateDoc(doc(db, "conversations", conv.id), {
                participantUids: arrayRemove(uid),
                admins: arrayRemove(uid),
            });
        } catch (e) { console.error("kick:", e); }
    }

    async function promote(uid) {
        if (!isAdmin) return;
        try {
            await updateDoc(doc(db, "conversations", conv.id), { admins: arrayUnion(uid) });
        } catch (e) { console.error("promote:", e); }
    }

    async function demote(uid) {
        // Solo el creador puede degradar a otros admins; nadie puede degradar al creador
        if (!isCreatorMe || uid === conv?.startedBy) return;
        try {
            await updateDoc(doc(db, "conversations", conv.id), { admins: arrayRemove(uid) });
        } catch (e) { console.error("demote:", e); }
    }

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(480px,92vw)] max-h-[80vh] overflow-hidden rounded-2xl border border-white/10 bg-black">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div>
                        <h3 className="font-semibold">{conv?.groupName || "Grupo"}</h3>
                        <p className="text-xs text-white/50">{conv?.participantUids?.length ?? 0} participantes</p>
                    </div>
                    <button onClick={onClose} className="text-sm text-white/50 hover:text-white cursor-pointer transition">Cerrar</button>
                </div>
                <div className="divide-y divide-white/8 overflow-auto max-h-[calc(80vh-60px)]">
                    {members.map(u => {
                        const name = u?.profile?.profileName || u?.profileName || u?.displayName || u?.usernameSlug || "Usuario";
                        const slug = u?.usernameSlug || "";
                        const avatar = u?.profile?.photoURL || u?.photoURL || "";
                        const isSelf = u.id === userUid;
                        const isCreator = u.id === conv?.startedBy;
                        const memberIsAdmin = adminList.includes(u.id);
                        return (
                            <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="h-9 w-9 rounded-full bg-[var(--bg3)] ring-1 ring-white/10 overflow-hidden flex items-center justify-center shrink-0">
                                    {avatar
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                                        : <span className="text-sm">{(name[0] || "?").toUpperCase()}</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-medium">{name}</span>
                                        {isCreator
                                            ? <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full px-2 py-0.5">Creador</span>
                                            : memberIsAdmin && <span className="text-[10px] bg-[var(--accent)]/20 text-[var(--accent2)] border border-[var(--accent)]/30 rounded-full px-2 py-0.5">Admin</span>}
                                        {isSelf && <span className="text-[10px] text-white/40">Tú</span>}
                                    </div>
                                    {slug && <div className="text-xs text-white/45 truncate">@{slug}</div>}
                                </div>
                                {isAdmin && !isSelf && !isCreator && (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {memberIsAdmin
                                            ? (isCreatorMe && (
                                                <button onClick={() => demote(u.id)}
                                                    className="text-xs text-amber-400/70 hover:text-amber-400 cursor-pointer transition px-2 py-1 rounded-lg hover:bg-amber-500/10">
                                                    Quitar admin
                                                </button>
                                            ))
                                            : (
                                                <button onClick={() => promote(u.id)}
                                                    className="text-xs text-[var(--accent2)]/70 hover:text-[var(--accent2)] cursor-pointer transition px-2 py-1 rounded-lg hover:bg-[var(--accent)]/10">
                                                    Hacer admin
                                                </button>
                                            )}
                                        <button onClick={() => kickMember(u.id)}
                                            className="text-xs text-red-400/70 hover:text-red-400 cursor-pointer transition px-2 py-1 rounded-lg hover:bg-red-500/10">
                                            Quitar
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

/* ===== GroupSettingsModal ===== */
function GroupSettingsModal({ open, conv, userUid, db, storage: st, onClose }) {
    const [uploading, setUploading] = useState(false);
    const [editName, setEditName] = useState("");
    const [savingName, setSavingName] = useState(false);
    const fileRef = useRef(null);
    const adminList = Array.isArray(conv?.admins) ? conv.admins : (conv?.startedBy ? [conv.startedBy] : []);
    const isAdmin = adminList.includes(userUid);

    useEffect(() => {
        if (open) setEditName(conv?.groupName || "");
    }, [open, conv?.groupName]);

    if (!open) return null;

    async function handlePhoto(file) {
        if (!file || !conv?.id) return;
        setUploading(true);
        try {
            // Bajo uploads/{miUid}/ para que solo el que sube pueda escribir/borrar
            // (Storage no puede verificar membresía del grupo desde reglas).
            const me = auth.currentUser?.uid;
            if (!me) return;
            // Carpeta propia: uploads/ tiene la lectura cerrada (los adjuntos se
            // sirven con enlaces temporales) y aquí sí hace falta una URL estable.
            const r = sRef(st, `groupPhotos/${me}/${conv.id}_${Date.now()}.jpg`);
            await uploadBytes(r, file, { contentType: "image/jpeg" });
            const url = await getDownloadURL(r);
            await updateDoc(doc(db, "conversations", conv.id), { groupPhotoURL: url });
        } catch (e) { console.error("group photo:", e); }
        finally { setUploading(false); }
    }

    async function saveName() {
        const name = editName.trim();
        if (!name || name === conv?.groupName) return;
        setSavingName(true);
        try { await updateDoc(doc(db, "conversations", conv.id), { groupName: name }); }
        catch (e) { console.error(e); }
        setSavingName(false);
    }

    const photoURL = conv?.groupPhotoURL || "";

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,92vw)] rounded-2xl border border-white/10 bg-black overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <h3 className="font-semibold">Ajustes del grupo</h3>
                    <button onClick={onClose} className="text-sm text-white/50 hover:text-white cursor-pointer transition">Cerrar</button>
                </div>
                <div className="p-5 space-y-5">
                    <div className="flex flex-col items-center gap-2">
                        <div className="relative">
                            <div className="h-24 w-24 rounded-full bg-[var(--bg3)] border border-white/10 overflow-hidden flex items-center justify-center text-3xl font-bold text-white/70">
                                {photoURL
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={photoURL} alt="" className="h-full w-full object-cover" />
                                    : (conv?.groupName?.[0] || "G").toUpperCase()}
                            </div>
                            {isAdmin && (
                                <label className="absolute inset-0 grid place-content-center rounded-full bg-black/50 opacity-0 hover:opacity-100 transition cursor-pointer">
                                    <CameraIcon className="w-7 h-7 text-white" />
                                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/jpg" className="hidden"
                                        onChange={async (e) => {
                                            const f = e.target.files?.[0];
                                            if (f) await handlePhoto(f);
                                            if (fileRef.current) fileRef.current.value = "";
                                        }} />
                                </label>
                            )}
                        </div>
                        <div className="text-xs text-white/40">
                            {uploading ? "Subiendo foto…" : isAdmin ? "Toca la foto para cambiarla" : ""}
                        </div>
                    </div>

                    {isAdmin ? (
                        <div>
                            <label className="text-xs text-white/50 mb-1.5 block">Nombre del grupo</label>
                            <div className="flex gap-2">
                                <input value={editName} onChange={e => setEditName(e.target.value)} maxLength={60}
                                    className="flex-1 rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm outline-none focus:border-white/30 transition" />
                                <button onClick={saveName}
                                    disabled={savingName || !editName.trim() || editName.trim() === conv?.groupName}
                                    className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent)] text-sm disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition">
                                    {savingName ? "…" : "Guardar"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center font-semibold text-lg">{conv?.groupName || "Grupo"}</div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ===== ForwardModal ===== */
function ForwardModal({ msg, convos, userMap, userUid, db, onClose }) {
    const [search, setSearch] = useState("");
    const [sending, setSending] = useState(null);
    const [sent, setSent] = useState(new Set());

    const filtered = (convos || []).filter(c => {
        if (!search) return true;
        const otherId = (c.participantUids || []).find(u => u !== userUid) || "";
        const u = userMap?.[otherId];
        const name = (u?.profileName || u?.displayName || u?.usernameSlug || otherId || "").toLowerCase();
        return name.includes(search.toLowerCase());
    });

    async function forward(targetCid) {
        if (!msg || !targetCid || !userUid || !db) return;
        setSending(targetCid);
        try {
            const textCipher = await encryptMessage(msg.text || "", targetCid, userUid);
            await addDoc(collection(db, "conversations", targetCid, "messages"), {
                type: "text",
                textCipher,
                attachments: [],
                meta: { forwarded: true },
                senderUid: userUid,
                at: serverTimestamp(),
            });
            await updateDoc(doc(db, "conversations", targetCid), {
                updatedAt: serverTimestamp(),
                lastMessage: { text: msg.text || "", senderUid: userUid, at: serverTimestamp() },
                [`readAt.${userUid}`]: serverTimestamp(),
            });
            setSent(prev => new Set([...prev, targetCid]));
        } catch (e) {
            console.error("Error reenviando:", e);
        } finally {
            setSending(null);
        }
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-[var(--bg2)] border border-white/10 rounded-2xl w-full max-w-sm p-4 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <span className="font-semibold">Reenviar a...</span>
                    <button type="button" onClick={onClose} className="opacity-50 hover:opacity-100 p-1 rounded-full hover:bg-white/10">✕</button>
                </div>
                <input
                    autoFocus
                    placeholder="Buscar conversación..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-[var(--bg3)] rounded-xl px-3 py-2 text-sm outline-none border border-white/10"
                />
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                    {filtered.map(c => {
                        const otherId = (c.participantUids || []).find(u => u !== userUid) || "";
                        const u = userMap?.[otherId];
                        const name = u?.profileName || u?.displayName || u?.usernameSlug || otherId || "Usuario";
                        const avatar = u?.avatarUrl || u?.photoURL || "/favicon.ico";
                        const isSent = sent.has(c.id);
                        return (
                            <button
                                key={c.id}
                                type="button"
                                disabled={sending === c.id || isSent}
                                onClick={() => !isSent && forward(c.id)}
                                className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-sm text-left disabled:opacity-50"
                            >
                                <img src={avatar} alt={name} className="w-8 h-8 rounded-full border border-white/10 object-cover flex-shrink-0" />
                                <span className="flex-1 truncate">{name}</span>
                                {sending === c.id
                                    ? <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                    : isSent
                                        ? <CheckIcon className="w-4 h-4 text-green-400" />
                                        : <span className="text-[var(--accent2)] text-xs">Enviar</span>}
                            </button>
                        );
                    })}
                    {!filtered.length && <div className="text-sm opacity-50 text-center py-4">Sin conversaciones</div>}
                </div>
                {sent.size > 0 && (
                    <button type="button" onClick={onClose} className="w-full py-2 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent)] text-sm font-medium transition">Listo</button>
                )}
            </div>
        </div>
    );
}

/* ===== página ===== */
function MensajesPageContent() {
    const { user, profile: userDoc } = useAuth();
    const router = useRouter();

    const [openNew, setOpenNew] = useState(false);
    const [convos, setConvos] = useState([]);
    const [convosErr, setConvosErr] = useState(null);   // objeto de @/lib/fallos
    const [reintentoConvos, setReintentoConvos] = useState(0);
    const [activeCid, setActiveCid] = useState(null);
    const [convFilter, setConvFilter] = useState("all"); // 'all' | 'unread' | 'groups' | 'chats' | 'favorites' | 'list-xxx'
    const [showListsMenu, setShowListsMenu] = useState(false);
    const [listModal, setListModal] = useState(null); // null | {id?, name, emoji, cids}
    const [inboxView, setInboxView] = useState("chats"); // 'chats' | 'requests'

    // Sistema de solicitudes (estilo IG/TikTok): una conversación 'pending' dirigida a
    // mí (requestTo == yo) es una SOLICITUD; no entra a la bandeja principal.
    const isRequestToMe = (c) => c?.status === "pending" && c?.requestTo === user?.uid;
    const requestConvos = useMemo(
        () => convos.filter(isRequestToMe),
        [convos, user?.uid]
    );
    // Rangos "importantes" para apartar sus solicitudes
    const IMPORTANT_RANKS = new Set([
        "verified", "vip", "politico", "partido", "fundador",
        "valentina", "mod", "mod_supremo", "admin", "creator",
    ]);
    const isImportantUser = (u) =>
        getUserRanks(u || {}).some((r) => {
            const k = String(r || "").toLowerCase().replace(/^partido:.*/, "partido");
            return IMPORTANT_RANKS.has(k);
        });

    // Aceptar una solicitud: pasa a 'accepted' y guardo al emisor como contacto aceptado
    async function acceptRequest(c) {
        if (!user?.uid || !c?.id) return;
        try {
            await updateDoc(doc(db, "conversations", c.id), { status: "accepted", updatedAt: serverTimestamp() });
            if (c.requestFrom) {
                try { await setDoc(doc(db, "users", user.uid, "dmAccepted", c.requestFrom), { at: serverTimestamp() }); } catch (_) { }
            }
            setInboxView("chats");
            setActiveCid(c.id);
            setMobileView("thread");
        } catch (e) {
            console.error("aceptar solicitud:", e);
            alert("No se pudo aceptar la solicitud.");
        }
    }
    // Rechazar: elimina la conversación (deja de molestar)
    async function rejectRequest(c) {
        if (!user?.uid || !c?.id) return;
        try { await deleteDoc(doc(db, "conversations", c.id)); }
        catch (e) { console.error("rechazar solicitud:", e); alert("No se pudo rechazar la solicitud."); }
    }

    const favoriteChats = Array.isArray(userDoc?.chatFavorites) ? userDoc.chatFavorites : [];
    const chatLists = Array.isArray(userDoc?.chatLists) ? userDoc.chatLists : [];

    function convUnread(c) {
        const lastAt = tsToDate(c?.lastMessage?.at);
        const myReadAt = tsToDate(c?.readAt?.[user?.uid]);
        return !!lastAt && (!myReadAt || lastAt > myReadAt) &&
            c?.lastMessage?.senderUid && c.lastMessage.senderUid !== user?.uid;
    }
    function convMatchesFilter(c) {
        // Las solicitudes entrantes nunca aparecen en la bandeja principal
        if (isRequestToMe(c)) return false;
        if (convFilter === "groups") return !!c.isGroup;
        if (convFilter === "chats") return !c.isGroup;
        if (convFilter === "favorites") return favoriteChats.includes(c.id);
        if (convFilter === "unread") return convUnread(c);
        if (typeof convFilter === "string" && convFilter.startsWith("list-")) {
            const l = chatLists.find(x => x.id === convFilter);
            return l ? (l.cids || []).includes(c.id) : true;
        }
        return true; // 'all'
    }
    async function toggleFavoriteChat(cid) {
        if (!user?.uid) return;
        const isFav = favoriteChats.includes(cid);
        try {
            await updateDoc(doc(db, "users", user.uid), { chatFavorites: isFav ? arrayRemove(cid) : arrayUnion(cid) });
        } catch (e) { console.error("favorito:", e); }
    }
    async function saveChatList({ id, name, emoji, cids }) {
        if (!user?.uid || !name?.trim()) return;
        const lists = chatLists.slice();
        if (id) {
            const idx = lists.findIndex(l => l.id === id);
            if (idx >= 0) lists[idx] = { id, name: name.trim(), emoji: emoji || "", cids: cids || [] };
        } else {
            lists.push({ id: "list-" + Math.random().toString(36).slice(2, 9), name: name.trim(), emoji: emoji || "", cids: cids || [] });
        }
        try {
            await updateDoc(doc(db, "users", user.uid), { chatLists: lists });
        } catch (e) { console.error("guardar lista:", e); }
    }
    async function deleteChatList(listId) {
        if (!user?.uid) return;
        const lists = chatLists.filter(l => l.id !== listId);
        try {
            await updateDoc(doc(db, "users", user.uid), { chatLists: lists });
            if (convFilter === listId) setConvFilter("all");
        } catch (e) { console.error("borrar lista:", e); }
    }
    const activeListLabel = (() => {
        if (convFilter === "favorites") return "⭐ Favoritos";
        if (convFilter === "chats") return "💬 Solo chats";
        if (typeof convFilter === "string" && convFilter.startsWith("list-")) {
            const l = chatLists.find(x => x.id === convFilter);
            return l ? `${l.emoji ? l.emoji + " " : ""}${l.name}` : "Listas";
        }
        return null;
    })();

    // ── Diálogo de confirmación integrado (en vez de window.confirm) ──
    const [confirmState, setConfirmState] = useState(null);
    function askConfirm(opts) {
        return new Promise((resolve) => {
            setConfirmState({ ...opts, resolve });
        });
    }

    // ── Info de contacto (1:1) ──
    const [showContactInfo, setShowContactInfo] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [reportTarget, setReportTarget] = useState(null);
    const mutedChats = Array.isArray(userDoc?.mutedChats) ? userDoc.mutedChats : [];
    const blockedUsers = Array.isArray(userDoc?.blockedUsers) ? userDoc.blockedUsers : [];

    async function toggleMuteChat(cid) {
        if (!user?.uid) return;
        const isMuted = mutedChats.includes(cid);
        // Datos sensibles → doc privado (no legible por el público).
        try { await setDoc(doc(db, "users", user.uid, "private", "settings"), { mutedChats: isMuted ? arrayRemove(cid) : arrayUnion(cid) }, { merge: true }); }
        catch (e) { console.error("mute:", e); }
    }
    async function toggleBlockUser(uid) {
        if (!user?.uid || !uid) return;
        const isBlocked = blockedUsers.includes(uid);
        try { await setDoc(doc(db, "users", user.uid, "private", "settings"), { blockedUsers: isBlocked ? arrayRemove(uid) : arrayUnion(uid) }, { merge: true }); }
        catch (e) { console.error("block:", e); }
    }
    async function setDisappearing(cid, secs) {
        if (!cid) return;
        try { await updateDoc(doc(db, "conversations", cid), { disappearingSecs: secs || deleteField() }); }
        catch (e) { console.error("disappearing:", e); }
    }
    // Vaciar chat: borra los mensajes pero conserva la conversación
    async function clearChatMessages(cid) {
        if (!cid) return;
        const ok = await askConfirm({ title: "Vaciar chat", message: "¿Vaciar todos los mensajes de este chat? No se puede deshacer.", confirmLabel: "Vaciar", danger: true });
        if (!ok) return;
        try {
            const snap = await getDocs(query(collection(db, "conversations", cid, "messages"), limit(300)));
            const batch = writeBatch(db);
            snap.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
            await updateDoc(doc(db, "conversations", cid), { lastMessage: null });
        } catch (e) { console.error("vaciar chat:", e); }
    }

    // Al cambiar de conversación, en el próximo render de mensajes bajamos al final
    useEffect(() => {
        if (activeCid) setWantAutoScrollNext(true);
    }, [activeCid]);

    // Marcar como leída al abrir cualquier conversación (read receipts)
    useEffect(() => {
        if (activeCid && user?.uid) markConversationRead(activeCid, user, db);
    }, [activeCid, user?.uid]);

    // ---- estados de mensajes ----
    const [pendingMsgs, setPendingMsgs] = useState([]); // ← debe ir ANTES del useMemo
    const [serverMsgs, setServerMsgs] = useState([]);   // ventana viva (más recientes)
    const [olderMsgs, setOlderMsgs] = useState([]);     // páginas antiguas cargadas a demanda
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [hasMoreOlder, setHasMoreOlder] = useState(false);
    const initialMoreRef = useRef(false); // ¿ya fijamos hasMoreOlder en la 1ª ventana?
    const MSGS_PAGE = 40; // cuántos mensajes por página

    const [mobileView, setMobileView] = useState("list"); // "list" | "thread"

    // === ENLACE PERSONAL DE CHAT (mensajes/<token>) ===
    const [myChatLinkToken, setMyChatLinkToken] = useState(null);
    const [myChatLinkLoading, setMyChatLinkLoading] = useState(false);
    const [myChatLinkError, setMyChatLinkError] = useState(null);
    // -- visibilidad del botón de invitación por roles permitidos --
    const INVITE_RANKS = ["admin", "creador", "fundador", "fundadores", "mod", "mods", "mod_supremo", "valentina", "politico", "partido"];
    const myRanks = useMemo(() => getUserRanks(userDoc), [userDoc]);
    const SHOW_INVITE = (myRanks || []).some(r => INVITE_RANKS.includes(r));

    const [showToast, setShowToast] = useState(false);

    function genToken() {
        return Math.random().toString(36).slice(2, 12);
    }

    function chatLinkUrl(token) {
        if (!token) return "";
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        // Enlace de invitación SIN depender de rewrites:
        return `${origin}/mensajes?i=${token}`;
    }

    async function fetchOrCreateMyChatLink() {
        if (!user?.uid) return null;
        setMyChatLinkLoading(true);
        setMyChatLinkError(null);
        try {
            const q = query(
                collection(db, "chatLinks"),
                where("ownerUid", "==", user.uid),
                limit(1)
            );
            const snap = await getDocs(q);
            if (!snap.empty) {
                const token = snap.docs[0].id;
                setMyChatLinkToken(token);
                return token;
            }
            const token = genToken();
            await setDoc(doc(db, "chatLinks", token), {
                ownerUid: user.uid,
                enabled: true,
                createdAt: serverTimestamp(),
            });
            setMyChatLinkToken(token);
            return token;
        } catch (e) {
            console.warn("[myChatLink] fetchOrCreate error", e);
            setMyChatLinkError(e?.message || "No se pudo crear/leer tu enlace.");
            return null;
        } finally {
            setMyChatLinkLoading(false);
        }
    }

    async function regenerateMyChatLink() {
        if (!user?.uid) return null;
        setMyChatLinkLoading(true);
        setMyChatLinkError(null);
        try {
            const token = genToken();
            await setDoc(doc(db, "chatLinks", token), {
                ownerUid: user.uid,
                enabled: true,
                createdAt: serverTimestamp(),
            });
            setMyChatLinkToken(token);
            return token;
        } catch (e) {
            console.warn("[myChatLink] regenerate error", e);
            setMyChatLinkError(e?.message || "No se pudo regenerar tu enlace.");
            return null;
        } finally {
            setMyChatLinkLoading(false);
        }
    }

    // --- INVITACIÓN POR LINK ---
    // token crudo (viene como ?i=xxxxx por la rewrite)
    const searchParams = useSearchParams();
    const inviteToken = searchParams?.get("i") || null;

    // --- ENLACE DE CONVERSACIÓN (token -> cid, viene como ?v=xxxxx por rewrite) ---
    const convToken = searchParams?.get("v") || null;
    
    // --- PERFIL -> "Enviar mensaje": objetivo directo (?u=<uid>) ---
    const userTarget = searchParams?.get("u") || null;

    useEffect(() => {
        let cancelled = false;
        async function resolveConvToken() {
            if (!convToken || !user?.uid) return;
            try {
                const snap = await getDoc(doc(db, "convLinks", convToken));
                if (!snap.exists()) return;
                const cid = snap.data()?.cid;
                if (!cid || cancelled) return;
                setActiveCid(cid);
                setMobileView("thread");
            } catch (e) {
                console.warn("[convLink] error", e?.code, e?.message);
            }
        }
        resolveConvToken();
        return () => { cancelled = true; };
    }, [convToken, user?.uid]);

    // Si llegan con ?u=<uid>, reusamos/creamos SOLO si NO hay ?i= (bypass) ni ?v= ni hilo activo
    useEffect(() => {
        let cancelled = false;
        async function go() {
            if (!user?.uid) return;
            if (!userTarget) return;

            // ⚠️ Guardas para evitar doble flujo y carreras:
            if (inviteToken) return;      // si venimos por ?i=<token>, NO dispares ?u=
            if (convToken) return;        // si venimos por ?v=<token>, tampoco
            if (activeCid) return;        // si ya hay conversación activa, nada que hacer
            if (userTarget === user.uid) return;

            if (creatingRef.current) return; // mutex anti-duplicados
            creatingRef.current = true;

            try {
                await startConversationWith(userTarget); // reusa o crea
                if (!cancelled) setMobileView("thread");
            } finally {
                creatingRef.current = false;
            }
        }
        go();
        return () => { cancelled = true; };
        // 👇 importante: agregamos más deps para que las guardas funcionen bien
    }, [userTarget, user?.uid, inviteToken, convToken, activeCid]);

    // dueño del enlace (el usuario que compartió su link)
    const [inviteOwnerUid, setInviteOwnerUid] = useState(null);
    // bandera para saber si ya resolvimos el enlace
    const [inviteResolved, setInviteResolved] = useState(false);
    // bypass de permiso para iniciar conversación (otorga permiso por enlace)
    const [inviteBypass, setInviteBypass] = useState(false);

    // mezcla server + pendientes SIN resuscribir el snapshot
    const messages = useMemo(() => {
        // ids cliente confirmados por el server
        const acked = new Set(serverMsgs.map(m => m.clientId).filter(Boolean));

        // pendientes de este chat que NO estén confirmados
        const locals = pendingMsgs
            .filter(p => p.cid === activeCid && !acked.has(p.clientId))
            .map(p => ({
                id: p.id,
                clientId: p.clientId,
                senderUid: user?.uid,
                type: p.attachments?.length ? (p.attachments[0]?.kind || "file") : "text",
                text: p.text,
                attachments: p.attachments || [],
                at: new Date(p.atMs),
                __localStatus: p.status,
                __localError: p.error,
                __retryPayload: { text: p.text, attachments: p.attachments },
            }));

        // Combinar páginas antiguas + ventana viva, evitando duplicados por id
        const seen = new Set();
        const serverAll = [];
        for (const m of [...olderMsgs, ...serverMsgs]) {
            if (m.id && seen.has(m.id)) continue;
            if (m.id) seen.add(m.id);
            serverAll.push(m);
        }
        const all = [...serverAll, ...locals];
        all.sort((a, b) => tsToDate(a.at) - tsToDate(b.at));
        // Ocultar los mensajes que YO eliminé solo para mí
        return all.filter(m => !(Array.isArray(m.deletedFor) && m.deletedFor.includes(user?.uid)));
    }, [serverMsgs, olderMsgs, pendingMsgs, activeCid, user?.uid]);

    // --- Scroll control ---
    const scrollRef = useRef(null);

    // === Scroll-to-bottom (config + estado) ===
    const [showDownArrow, setShowDownArrow] = useState(false);

    // Mostrar el botón si estamos a más de X px del fondo
    const SHOW_ARROW_PX = 220;

    // Si estamos MUY lejos (más de Y px), saltar instantáneo
    const FAR_JUMP_PX = 1500;

    function distanceFromBottom(el) {
        return el.scrollHeight - el.scrollTop - el.clientHeight;
    }

    const [showJumpDown, setShowJumpDown] = useState(false);
    const [wantAutoScrollNext, setWantAutoScrollNext] = useState(false);

    function getDistanceToBottom(el) {
        return el.scrollHeight - (el.scrollTop + el.clientHeight);
    }

    function isNearBottom(el, px = 200) {
        return getDistanceToBottom(el) <= px;
    }

    function scrollToBottom(mode = "smooth") {
        const el = scrollRef.current;
        if (!el) return;
        if (mode === "instant") {
            el.scrollTop = el.scrollHeight;
        } else {
            el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
        }
    }

    // listener de scroll para mostrar/ocultar el botón flotante
    function handleScroll() {
        const el = scrollRef.current;
        if (!el) return;
        const d = distanceFromBottom(el);

        // Mostrar/ocultar flecha según cuán lejos del fondo estemos
        setShowDownArrow(d > SHOW_ARROW_PX);

        // Cerca del tope → cargar mensajes más antiguos automáticamente
        if (el.scrollTop < 120 && hasMoreOlder && !loadingOlder) {
            loadOlder();
        }
    }

    function goToBottomSmart() {
        const el = scrollRef.current;
        if (!el) return;

        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        const FAR_JUMP_PX = 1500; // si estás muy lejos → TP instantáneo

        el.scrollTo({
            top: el.scrollHeight,
            behavior: distance > FAR_JUMP_PX ? "auto" : "smooth",
        });
    }

    // Cargar mensajes más antiguos (paginación hacia arriba)
    async function loadOlder() {
        if (loadingOlder || !hasMoreOlder || !activeCid) return;
        const known = [...olderMsgs, ...serverMsgs];
        if (!known.length) return;
        // cursor = el `at` del mensaje más antiguo ya cargado
        let oldest = known[0];
        for (const m of known) {
            if (tsToDate(m.at) < tsToDate(oldest.at)) oldest = m;
        }
        const cursorAt = oldest?.at;
        if (!cursorAt) return;

        setLoadingOlder(true);
        const el = scrollRef.current;
        const prevH = el ? el.scrollHeight : 0;
        try {
            const qy = query(
                collection(db, "conversations", activeCid, "messages"),
                orderBy("at", "desc"),
                startAfter(cursorAt),
                limit(MSGS_PAGE)
            );
            const snap = await getDocs(qy);
            const rows = [];
            for (const d of snap.docs) {
                const m = { id: d.id, ...d.data({ serverTimestamps: "estimate" }) };
                const text = await decryptMessage(m.textCipher, activeCid, user?.uid);
                rows.push({ ...m, text });
            }
            rows.reverse(); // desc → asc
            // Mismo tratamiento que en el listener: rutas → enlaces temporales
            let filas = rows;
            try { filas = await hidratarAdjuntos(activeCid, rows); } catch { /* sin adjuntos visibles */ }
            setOlderMsgs((prev) => {
                const seen = new Set(prev.map((m) => m.id));
                const merged = [...filas.filter((r) => !seen.has(r.id)), ...prev];
                merged.sort((a, b) => tsToDate(a.at) - tsToDate(b.at));
                return merged;
            });
            setHasMoreOlder(snap.docs.length === MSGS_PAGE);
            // preservar la posición de scroll tras anteponer mensajes
            requestAnimationFrame(() => {
                const el2 = scrollRef.current;
                if (el2) el2.scrollTop += (el2.scrollHeight - prevH);
            });
        } catch (e) {
            console.warn("No se pudieron cargar mensajes más antiguos:", e);
        } finally {
            setLoadingOlder(false);
        }
    }

    // cuando llegan mensajes nuevos: si estamos cerca del final o venimos de un envío, bajar
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;

        const dist = getDistanceToBottom(el);
        const longJump = dist > 1000; // si está MUY lejos, teletransportamos

        if (wantAutoScrollNext || isNearBottom(el, 200)) {
            scrollToBottom(longJump ? "instant" : "smooth");
            setWantAutoScrollNext(false);
        }
        // si no estamos cerca, no auto-bajamos (para respetar lectura hacia arriba)
    }, [messages]);

    const [loadingMessages, setLoadingMessages] = useState(false);
    const [messagesErr, setMessagesErr] = useState(null);
    // Flag para detectar transición de "cargando" -> "listo"
    const wasLoadingRef = useRef(false);
    const [userMap, setUserMap] = useState({});
    const [presenceMap, setPresenceMap] = useState({});
    const [menuCid, setMenuCid] = useState(null);
    const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

    // Presencia (propio de fport1web): punto verde si está jugando, azul si
    // solo está conectado. Solo para chats de dos, no para grupos.
    useEffect(() => {
        if (!user?.uid || !convos.length) return;
        const others = new Set();
        convos.forEach(c => {
            if (!c.isGroup) (c.participantUids || []).forEach(p => { if (p !== user.uid) others.add(p); });
        });
        const pMap = {};
        const unsubs = [...others].map(uid =>
            onSnapshot(doc(db, "presence", uid), snap => {
                pMap[uid] = snap.exists() ? snap.data() : null;
                setPresenceMap({ ...pMap });
            }, () => {})
        );
        return () => unsubs.forEach(u => u());
    }, [convos, user?.uid]);

    // Cuando dejamos de "cargar mensajes" por primera vez tras abrir el chat, saltamos al fondo
    useEffect(() => {
        if (loadingMessages) {
            wasLoadingRef.current = true;
            return;
        }
        if (wasLoadingRef.current) {
            wasLoadingRef.current = false;
            // Fin de la primera carga -> salto instantáneo al último mensaje
            scrollToBottom("instant");
        }
    }, [loadingMessages]);

    // habilitación del composer (permiso de envío calculado)
    const [canSendHere, setCanSendHere] = useState(false);

    // reply / forward / multi-select
    const [replyingTo, setReplyingTo] = useState(null); // { id, text, senderName }
    const [forwardingMsg, setForwardingMsg] = useState(null); // { id, text }
    const [showGroupMembers, setShowGroupMembers] = useState(false);
    const [showGroupSettings, setShowGroupSettings] = useState(false);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState(new Set());

    // typing indicator: ¿está el otro escribiendo?
    const [typingName, setTypingName] = useState(null); // nombre de quien está escribiendo (o null)
    const [recordingName, setRecordingName] = useState(null); // nombre de quien está grabando audio (o null)
    const typingWriteTimerRef = useRef(null);

    // === IMG MENU STATE (BEGIN)
    const [imgMenu, setImgMenu] = useState({
        open: false,
        x: 0,
        y: 0,
        msg: null,
        url: "",
        isVO: false
    });

    function openImgMenu(e, msg, url, isVO) {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        setImgMenu({
            open: true,
            x: r.left,
            y: r.bottom + 8,
            msg,
            url,
            isVO: !!isVO
        });
    }

    function closeImgMenu() {
        setImgMenu({ open: false, x: 0, y: 0, msg: null, url: "", isVO: false });
    }

    async function copyImageToClipboard(url) {
        try {
            // vía proxy de mismo origen para evitar el bloqueo de CORS del bucket
            const proxied = `/api/download?url=${encodeURIComponent(url)}&name=imagen`;
            const res = await fetch(proxied, { cache: "no-store" });
            const blob = await res.blob();

            // Fuerzo PNG para máxima compatibilidad (algunos navegadores rechazan webp/jpg)
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(bitmap, 0, 0);

            const pngBlob = await new Promise((resolve, reject) =>
                canvas.toBlob(b => b ? resolve(b) : reject(new Error("toBlob failed")), "image/png")
            );

            if (!window.ClipboardItem) throw new Error("ClipboardItem unsupported");
            await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);

            // feedback
            if (typeof toastOnce === "function") toastOnce("Imagen copiada ✅");
        } catch (err) {
            console.warn("No se pudo copiar la imagen al portapapeles, copio enlace:", err);
            try {
                await navigator.clipboard.writeText(url);
                if (typeof toastOnce === "function") toastOnce("Copié el enlace de la imagen");
            } catch (_) { /* no-op */ }
        } finally {
            closeImgMenu();
        }
    }

    function downloadImage(url, name) {
        try {
            if (!url) return;
            const fname = name || `descarga-${Date.now()}`;
            // Comprimidos, Office con macros, SVG y HTML pueden traer sorpresas:
            // se avisa antes de descargar. No los bloqueamos (son legítimos),
            // pero quien descarga debe saber lo que abre.
            if (esDescargaRiesgosa(fname)) {
                const ok = window.confirm(
                    `⚠️ "${fname}"\n\n` +
                    "Este tipo de archivo puede contener programas dañinos. " +
                    "Descárgalo solo si conoces a quien te lo envió y esperabas recibirlo.\n\n" +
                    "Ábrelo con un antivirus activo. ¿Descargar de todos modos?"
                );
                if (!ok) { closeImgMenu(); return; }
            }
            // Descarga vía proxy de mismo origen → el navegador abre su diálogo de descarga
            const href = `/api/download?url=${encodeURIComponent(url)}&name=${encodeURIComponent(fname)}`;
            const a = document.createElement("a");
            a.href = href;
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            try { window.open(url, "_blank", "noopener"); } catch (_) { }
        } finally {
            closeImgMenu();
        }
    }

    // Eliminar imagen solo para mí (persistente)
    async function hideImageForMe(convoId, msg) {
        try {
            if (msg?.id && !String(msg.id).startsWith("local-") && user?.uid) {
                await updateDoc(doc(db, "conversations", convoId, "messages", msg.id), {
                    deletedFor: arrayUnion(user.uid),
                });
            }
        } catch (_) { }
        closeImgMenu();
    }

    async function deleteImageMessage(convoId, msg) {
        try {
            const imgs = (msg.attachments || []).filter(a => a?.kind === "image");
            const first = imgs[0];
            if (first) {
                const r = getStorageRefFromAttachment(first); // esta función ya existe en tu archivo
                if (r) { try { await deleteObject(r); } catch (_) { } }
            }
            const mref = doc(db, "conversations", convoId, "messages", msg.id);
            await updateDoc(mref, { attachments: [], type: "deleted", text: "" });
        } catch (_) { }
        closeImgMenu();
    }
    // === IMG MENU STATE (END)

    const scrollerRef = useRef(null);
    const creatingRef = useRef(false); // ← evita doble creación por carreras

    /* conversaciones del usuario */
    useEffect(() => {
        if (!user?.uid) return;
        const qConvos = query(
            collection(db, "conversations"),
            where("participantUids", "array-contains", user.uid),
            orderBy("updatedAt", "desc"),
            limit(50)
        );
        // Antes solo se contemplaba la falta de índice; con cualquier otro fallo la
        // lista quedaba vacía y muda, sin decir siquiera que algo iba mal.
        return suscribir({
            consulta: qConvos,
            donde: "conversaciones",
            que: "tus conversaciones",
            alLlegar: (snap) => {
                setConvosErr(null);
                const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                setConvos(list);

                // si hay ?c=<id> en la URL, priorizarlo; si no hay, NO abras nada
                const cidParam = searchParams?.get("c");
                if (!activeCid && list.length && cidParam && list.some(x => x.id === cidParam)) {
                    setActiveCid(cidParam);
                }
            },
            alFallar: setConvosErr,
        });
    }, [user?.uid, activeCid, reintentoConvos]);

    /* perfiles de participantes */
    useEffect(() => {
        async function fetchMissing(uids) {
            const next = { ...userMap };
            for (const uid of uids) {
                if (next[uid]) continue;
                const s = await run("getUserProfile(" + uid + ")", () =>
                    getDoc(doc(db, "users", uid))
                );
                if (s.exists()) next[uid] = { uid, ...s.data() };
            }
            setUserMap(next);
        }
        if (!user?.uid || !convos.length) return;
        const others = new Set();
        convos.forEach((c) =>
            (c.participantUids || []).forEach((p) => {
                if (p !== user.uid) others.add(p);
            })
        );
        fetchMissing([...others]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [convos, user?.uid]);

    /* añadir el perfil propio a userMap para mostrar avatar/nombre propios en grupos */
    useEffect(() => {
        if (!user?.uid || !userDoc) return;
        setUserMap(prev => {
            if (prev[user.uid]) return prev;
            return { ...prev, [user.uid]: { uid: user.uid, ...userDoc } };
        });
    }, [user?.uid, userDoc]);

    /* INVITE: resolver token -> ownerUid -> reusar o crear conversación */
    useEffect(() => {
        let cancelled = false;

        async function runInviteFlow() {
            if (!inviteToken || !user?.uid) {
                setInviteResolved(true);
                return;
            }

            try {
                // 1) obtener doc del enlace
                const snap = await getDoc(doc(db, "chatLinks", inviteToken));
                if (!snap.exists()) {
                    setInviteResolved(true);
                    return;
                }
                const data = snap.data();
                const ownerUid = data?.ownerUid || null;

                // si el dueño no existe o soy yo mismo: no forzar nada
                if (!ownerUid || ownerUid === user.uid) {
                    setInviteOwnerUid(null);
                    setInviteResolved(true);
                    return;
                }

                setInviteOwnerUid(ownerUid);

                // 2) ¿ya hay conversación entre viewer y owner?
                const pk = uidPair(user.uid, ownerUid);
                const ex = await getDocs(
                    query(
                        collection(db, "conversations"),
                        where("participantUids", "array-contains", user.uid),
                        where("pairKey", "==", pk),
                        limit(1)
                    )
                );

                if (!cancelled) {
                    // 3) si existe, activarla; si no, crearla
                    if (!ex.empty) {
                        const cid = ex.docs[0].id;
                        setActiveCid(cid);
                        setInviteBypass(true);  // el enlace otorga permiso a escribir
                        setMobileView("thread");
                    } else {
                        // crear conversación. Aunque venga por enlace, respeta el
                        // sistema de solicitudes: directo solo si el dueño me sigue.
                        let invTrusted = false;
                        try {
                            const fs = await getDoc(doc(db, "users", ownerUid, "following", user.uid));
                            invTrusted = fs.exists();
                        } catch (_) { }
                        const payload = {
                            participantUids: [user.uid, ownerUid],
                            pairKey: pk,
                            startedBy: user.uid,           // la inicia el visitante
                            status: invTrusted ? "accepted" : "pending",
                            requestTo: ownerUid,
                            requestFrom: user.uid,
                            createdAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                            lastMessage: null,
                            createdByInviteToken: inviteToken, // opcional: auditar
                        };
                        const ref = await addDoc(collection(db, "conversations"), payload);
                        setActiveCid(ref.id);
                        setInviteBypass(true);
                        setMobileView("thread");
                    }
                }
            } catch (e) {
                console.warn("[inviteFlow]", e?.code, e?.message);
            } finally {
                if (!cancelled) setInviteResolved(true);
            }
        }

        runInviteFlow();
        return () => { cancelled = true; };
    }, [inviteToken, user?.uid]);

    // Al abrir Mensajes, busca (o crea) mi enlace personal si estoy logueado
    useEffect(() => {
        if (!user?.uid) return;
        fetchOrCreateMyChatLink();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    // Sincroniza la barra de direcciones con la conversación activa (?c=<cid>) y limpia ?u / ?i / ?v
    useEffect(() => {
        if (typeof window === "undefined") return;

        const url = new URL(window.location.href);

        if (activeCid) {
            url.searchParams.set("c", activeCid);
        } else {
            url.searchParams.delete("c");
        }

        // Evitar re-disparos y flujos dobles
        url.searchParams.delete("u"); // target directo
        url.searchParams.delete("i"); // invite token (bypass)
        url.searchParams.delete("v"); // link de conversación

        window.history.replaceState({}, "", url.toString());
    }, [activeCid]);

    // ¿soy participante de la conversación activa?
    const iAmParticipant = useMemo(() => {
        if (!activeCid) return false;
        const c = convos.find((x) => x.id === activeCid);
        return !!c && (c.participantUids || []).includes(user?.uid);
    }, [convos, activeCid, user?.uid]);

    /* mensajes de la conversación activa (con preflight para evitar permission-denied) */
    useEffect(() => {
        let unsub = null;
        let cancelled = false;

        async function attach() {
            // limpia y corta si no hay contexto suficiente
            setServerMsgs([]);
            setOlderMsgs([]);
            setHasMoreOlder(false);
            initialMoreRef.current = false;
            if (!activeCid || !user?.uid) return;

            setLoadingMessages(true);

            // 1) Preflight: verifica que seas participante del chat ANTES de abrir el listener
            try {
                const snap = await getDoc(doc(db, "conversations", activeCid));
                const data = snap.exists() ? snap.data() : null;
                const isMember =
                    !!data &&
                    Array.isArray(data.participantUids) &&
                    data.participantUids.includes(user.uid);

                if (!isMember || cancelled) return; // no escuches si no eres participante
            } catch (err) {
                console.warn("[preflight messages]", err?.code, err?.message);
                setMessagesErr(err);
                setLoadingMessages(false);
                return;
            }

            // 2) Listener de mensajes — solo la ventana más reciente (orderBy at desc + limit).
            //    Las páginas más antiguas se cargan a demanda con "cargar más antiguos".
            setMessagesErr(null);
            const qMsgs = query(
                collection(db, "conversations", activeCid, "messages"),
                orderBy("at", "desc"),
                limit(MSGS_PAGE)
            );

            unsub = onSnapshot(
                qMsgs,
                async (snap) => {
                    if (cancelled) return;
                    const rows = [];
                    for (const d of snap.docs) {
                        const m = { id: d.id, ...d.data({ serverTimestamps: "estimate" }) };
                        const text = await decryptMessage(m.textCipher, activeCid, user?.uid);
                        rows.push({ ...m, text });
                    }
                    // venían en desc → ascendente para mostrar
                    rows.reverse();
                    // Los mensajes nuevos guardan solo la RUTA del adjunto: aquí se
                    // cambia por un enlace temporal (lo pide /api/chat-media, que
                    // comprueba que participas en la conversación). Se hace en un
                    // único punto para que todo lo que pinta siga leyendo `url`.
                    setServerMsgs(rows);      // pinta ya, sin esperar a los enlaces
                    try {
                        const conUrls = await hidratarAdjuntos(activeCid, rows);
                        if (!cancelled && conUrls !== rows) setServerMsgs(conUrls);
                    } catch { /* si falla, quedan los mensajes sin adjunto visible */ }
                    // Fijar "hay más antiguos" SOLO en la primera ventana (no en cada mensaje nuevo)
                    if (!initialMoreRef.current) {
                        initialMoreRef.current = true;
                        setHasMoreOlder(snap.docs.length === MSGS_PAGE);
                    }
                    setLoadingMessages(false);
                },
                (err) => {
                    if (cancelled) return;
                    console.warn("[messages listener]", err?.code, err?.message);
                    setServerMsgs([]);
                    setLoadingMessages(false);
                    setMessagesErr(err);      // ← mostramos aviso en la UI
                }
            );
        }

        attach();

        return () => {
            cancelled = true;
            if (unsub) unsub();
        };
        // 👇 Importante: NO incluyas pendingMsgs acá o parpadea
    }, [activeCid, user?.uid]);

    /* crear conversación o reusar existente */
    async function startConversationWith(otherUid) {
        if (!user?.uid || !otherUid) return;

        // ⚠️ Si venimos por enlace de invitación (?i=...) o ya hay bypass,
        // no intentes crear por este camino (el flujo de invitación se encarga).
        if (inviteToken || inviteBypass) return;

        // 1) Asegurar userDoc fresco antes de decidir
        let selfDoc = userDoc || null;
        try {
            if (
                !selfDoc ||
                (!Array.isArray(selfDoc.ranks) &&
                    !Array.isArray(selfDoc.roles) &&
                    !Array.isArray(selfDoc?.profile?.ranks))
            ) {
                const snap = await getDoc(doc(db, "users", user.uid));
                if (snap.exists()) selfDoc = { uid: user.uid, ...snap.data() };
            }
        } catch (e) {
            console.warn("[startConversation] refresh userDoc:", e?.code, e?.message);
        }

        // 2) Log de diagnóstico (todos los usuarios autenticados pueden iniciar)
        const ranks = getUserRanks(selfDoc || {});
        console.log("[startConversation]", { me: user?.uid, otherUid, ranks });

        // 3) Reusar si ya existe (participantUids + pairKey)
        const pk = uidPair(user.uid, otherUid);
        try {
            const ex = await getDocs(
                query(
                    collection(db, "conversations"),
                    where("participantUids", "array-contains", user.uid),
                    where("pairKey", "==", pk),
                    limit(1)
                )
            );
            if (!ex.empty) {
                setActiveCid(ex.docs[0].id);
                return;
            }
        } catch (e) {
            console.error("[checkExistingConversation]", e?.code, e?.message);
            alert("Error verificando conversaciones existentes: " + (e?.code || "desconocido"));
            return;
        }

        // 4) Crear — sistema de solicitudes: entra directo solo si el destinatario
        //    me sigue (o ya me aceptó); si no, queda como 'pending' (solicitud).
        let trusted = false;
        try {
            const fs = await getDoc(doc(db, "users", otherUid, "following", user.uid));
            trusted = fs.exists();
        } catch (_) { }
        const payload = {
            participantUids: [user.uid, otherUid],
            pairKey: pk,
            startedBy: user.uid,
            status: trusted ? "accepted" : "pending",
            requestTo: otherUid,
            requestFrom: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: null,
        };

        try {
            const ref = await addDoc(collection(db, "conversations"), payload);

            const convTokenNew = genToken();
            await setDoc(doc(db, "convLinks", convTokenNew), {
                cid: ref.id,
                createdAt: serverTimestamp(),
                createdBy: user.uid,
            });
            await updateDoc(doc(db, "conversations", ref.id), { linkToken: convTokenNew });

            setActiveCid(ref.id);
        } catch (e) {
            if (e?.code === "permission-denied") {
                // Puede estar creándose desde el flujo por enlace (?i=) → reintento suave de lectura
                try {
                    const ex2 = await getDocs(
                        query(
                            collection(db, "conversations"),
                            where("participantUids", "array-contains", user.uid),
                            where("pairKey", "==", pk),
                            limit(1)
                        )
                    );
                    if (!ex2.empty) {
                        setActiveCid(ex2.docs[0].id);
                        return; // listo, sin alert ni log rojo
                    }
                } catch (_) { /* noop */ }

                // Si venimos con bypass por enlace, no alertamos (el otro flujo se encarga)
                if (inviteBypass || inviteToken) return;

                // Sin bypass y no se encontró: avisar sin log rojo
                alert("No se pudo iniciar la conversación: permission-denied");
                return;
            }

            // Otros errores reales sí se loguean y avisan
            console.error("[createConversation]", e?.code, e?.message);
            alert("No se pudo iniciar la conversación: " + (e?.code || "error"));
        }
    }

    /* crear conversación de grupo */
    async function createGroupConversation({ groupName, uids, anonymous = false }) {
        if (!user?.uid || !groupName || uids.length === 0) return;
        // El grupo anónimo es exclusivo de @fport1; las reglas lo verifican también.
        const anon = anonymous && userDoc?.usernameSlug === "fport1";
        try {
            const ref = await addDoc(collection(db, "conversations"), {
                isGroup: true,
                anonymous: anon,
                groupName: groupName.trim(),
                participantUids: [user.uid, ...uids],
                startedBy: user.uid,
                admins: [user.uid],
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                lastMessage: null,
            });
            // Avisamos a quienes entran, ya que en un grupo anónimo no pueden
            // deducirlo mirando la lista de miembros.
            notificarVarios(uids, {
                fromUid: user.uid,
                type: "group_added",
                context: { cid: ref.id, groupName: groupName.trim() },
                from: userDoc,
            });
            setActiveCid(ref.id);
            setMobileView("thread");
        } catch (e) {
            console.error("[createGroupConversation]", e?.code, e?.message);
            alert("No se pudo crear el grupo: " + (e?.code || "error"));
        }
    }

    /* enviar mensaje */
    async function sendMessage(cid, text, attachments = [], options = {}) {
        const { viewOnce = false, replyTo = null } = options;
        if (!user?.uid) return;
        if (!canSendHere) {
            alert("No tienes permiso para enviar mensajes en esta conversación.");
            return;
        }
        const conv = convos.find((c) => c.id === cid);
        if (!conv) return;

        // Si el mensaje es solo una URL de imagen/GIF, la incrustamos como adjunto.
        if ((!attachments || attachments.length === 0)) {
            const img = imageUrlFromText(text);
            if (img) {
                attachments = [{ kind: "image", url: img.url, name: img.isGif ? "gif.gif" : "image", ...(img.isGif ? { isGif: true } : {}) }];
                text = "";
            }
        }

        setWantAutoScrollNext(true);
        queueMicrotask(() => scrollToBottom("smooth")); // feedback inmediato mientras aparece el pending

        const tempId = "local-" + Math.random().toString(36).slice(2);
        const clientId =
            (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
            ("cid-" + Math.random().toString(36).slice(2));
        const atMs = Date.now();

        // Preview local inmediato para imágenes (blob URL) mientras se sube
        const attachmentsPreview = (attachments || []).map((a) =>
            (a?.kind === "image" || a?.kind === "video") && a.file
                ? { ...a, url: URL.createObjectURL(a.file), name: a.file?.name }
                : a
        );

        // 1) Inserto mensaje local "enviando"
        setPendingMsgs((arr) => [
            ...arr,
            {
                id: tempId,
                cid,
                clientId,
                text: text || "",
                attachments: attachmentsPreview,
                atMs,
                status: "sending",
                error: null,
            },
        ]);

        try {
            // 2) Subo adjuntos (si hay). Los que ya traen URL (p. ej. GIFs de Giphy)
            //    no se suben: se pasan tal cual.
            let uploaded = [];
            if (attachments?.length) {
                const toUpload = attachments.filter((a) => a.file);
                const passthrough = attachments
                    .filter((a) => !a.file && a.url)
                    .map((a) => ({ kind: a.kind || "image", name: a.name || "gif", url: a.url, ...(a.isGif ? { isGif: true } : {}) }));
                // Cupo de subidas por usuario (evita bucles que llenen el almacenamiento)
                if (toUpload.length) {
                    try {
                        const res = await fetch("/api/chat-upload-check", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${await user.getIdToken()}`,
                            },
                            body: JSON.stringify({ cantidad: toUpload.length }),
                        });
                        if (res.status === 429) {
                            const d = await res.json().catch(() => ({}));
                            throw new Error(d.reason || "Has enviado demasiados archivos seguidos.");
                        }
                    } catch (e) {
                        if (e?.message && !/fetch|network/i.test(e.message)) throw e;
                        // Si el chequeo no responde, no bloqueamos al usuario legítimo.
                    }
                }
                const uploadedNew = toUpload.length
                    ? await uploadManyAttachments(cid, toUpload.map((a) => ({ kind: a.kind, file: a.file })), { viewOnce })
                    : [];
                uploaded = [...uploadedNew, ...passthrough];
            }

            // 3) Cifro y creo el doc en Firestore con clientId
            const textCipher = await encryptMessage(text || "", cid, user.uid);

            await addDoc(collection(db, "conversations", cid, "messages"), {
                clientId,
                type: uploaded.length ? uploaded[0].kind : "text",
                textCipher,
                attachments: uploaded,
                meta: { viewOnce },
                senderUid: user.uid,
                ...(conv.isGroup ? { senderProfileName: userDoc?.profile?.profileName || userDoc?.profileName || user.displayName || "" } : {}),
                at: serverTimestamp(),
                ...(replyTo ? { replyToId: replyTo.id, replyToText: replyTo.text, replyToSenderName: replyTo.senderName } : {}),
            });

            // 4) Actualizo preview de la conversación
            await updateDoc(doc(db, "conversations", cid), {
                updatedAt: serverTimestamp(),
                lastMessage: {
                    text: text || (uploaded.length ? attachmentPreviewLabel(uploaded[0], viewOnce) : ""),
                    senderUid: user.uid,
                    at: serverTimestamp(),
                },
                [`readAt.${user.uid}`]: serverTimestamp(),
            });

            // 5) NO borramos por timeout: el pending desaparece solo
            setPendingMsgs((arr) =>
                arr.map((m) => (m.id === tempId ? { ...m, status: "sent" } : m))
            );

            // 6) Push a los demás participantes (best-effort, no bloquea)
            try {
                const idToken = await auth.currentUser?.getIdToken?.();
                if (idToken) {
                    const myName = userDoc?.profile?.profileName || userDoc?.profileName || user.displayName || "Mensaje nuevo";
                    const pushTitle = conv.isGroup ? (conv.groupName || "Grupo") : myName;
                    const pushBody = conv.isGroup ? `${myName}: ${text || "📎 Adjunto"}` : (text || "📎 Adjunto");
                    fetch("/api/notify", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
                        body: JSON.stringify({ cid, title: pushTitle, body: pushBody }),
                    }).catch(() => {});
                }
            } catch (_) { /* noop */ }
        } catch (e) {
            // 6) Error → mostrar ⚠ con opción de reintento.
            // El popover enseñaba e.message tal cual, o sea el texto de Firebase en
            // inglés ("Missing or insufficient permissions"). Ahora explica la causa
            // en castellano, y el fallo queda registrado en vez de morir en el estado.
            setPendingMsgs((arr) =>
                arr.map((m) =>
                    m.id === tempId
                        ? { ...m, status: "error", error: registrarAccion("enviar-mensaje", e, "enviar el mensaje") }
                        : m
                )
            );
        }
    }

    /* eliminar chat (por ahora: borrar todo) */
    async function deleteConversation(cid) {
        if (!cid) return;
        const ok = await askConfirm({ title: "Eliminar chat", message: "¿Eliminar el chat completo? Esta acción no se puede deshacer.", confirmLabel: "Eliminar", danger: true });
        if (!ok) return;
        try {
            while (true) {
                const snap = await run("listMessagesForDelete", () =>
                    getDocs(query(collection(db, "conversations", cid, "messages"), limit(100)))
                );
                if (snap.empty) break;
                const batch = writeBatch(db);
                snap.docs.forEach((d) => batch.delete(d.ref));
                await run("commitDeleteBatch", () => batch.commit());
            }
            await run("deleteConversation", () => deleteDoc(doc(db, "conversations", cid)));
            if (activeCid === cid) setActiveCid(null);
        } catch {
            /* ya avisó run */
        }
    }

    const activeConversation = convos.find((c) => c.id === activeCid) || null;
    const otherUid = useMemo(
        () =>
            (activeConversation?.participantUids || []).find((u) => u !== user?.uid) ||
            null,
        [activeConversation, user?.uid]
    );
    const otherUser = otherUid ? userMap[otherUid] : null;
    const isGroupConv = !!activeConversation?.isGroup;
    const groupParticipantCount = isGroupConv ? (activeConversation?.participantUids?.length ?? 0) : 0;
    // Grupo anónimo: nadie ve la lista de miembros ni cuántos son. Quien escribe
    // sí aparece con su nombre. El creador del grupo sí puede ver la lista.
    const isAnonGroup = isGroupConv && !!activeConversation?.anonymous;
    // Admin de grupo: quien lo creó (startedBy) o quien esté en la lista admins
    const isGroupAdmin = isGroupConv && !!user?.uid && (
        activeConversation?.startedBy === user.uid ||
        (Array.isArray(activeConversation?.admins) && activeConversation.admins.includes(user.uid))
    );

    // Confirmaciones de lectura (read receipts): por defecto activas.
    // Se muestran solo si AMBOS las tienen activas (como en WhatsApp).
    const readReceiptsOn = userDoc?.settings?.readReceipts !== false;
    const otherReadReceiptsOn = otherUid
        ? (userMap[otherUid]?.settings?.readReceipts !== false)
        : true;
    const [showChatSettings, setShowChatSettings] = useState(false);

    async function setReadReceipts(value) {
        if (!user?.uid) return;
        try {
            await updateDoc(doc(db, "users", user.uid), { "settings.readReceipts": value });
        } catch (e) { console.error("read receipts:", e); }
    }

    // Estado de lectura para CUALQUIER mensaje mío (texto, imagen, audio, etc.)
    function readTickFor(m) {
        if (m.senderUid !== user?.uid) return null;
        if (m.__localStatus === "sending") return "sending";
        if (!readReceiptsOn || !otherReadReceiptsOn) return "sent";
        const otherReadAt = activeConversation?.readAt?.[otherUid];
        const msgAt = m.at?.toDate?.() || (m.at instanceof Date ? m.at : null);
        if (otherReadAt && msgAt && (otherReadAt?.toDate?.() || otherReadAt) >= msgAt) return "read";
        return "sent";
    }

    // ── Reacciones para imágenes/audios/etc. (mismas 6 que en texto) ──
    const [reactBar, setReactBar] = useState({ open: false, x: 0, y: 0, msg: null });
    function closeReactBar() { setReactBar({ open: false, x: 0, y: 0, msg: null }); }

    // ── Modal de audio (para "escuchar una vez": controles completos, destruye al cerrar) ──
    const [audioModal, setAudioModal] = useState({ open: false, src: "", msg: null, consume: false });
    function openAudioModal(m, consume) {
        const url = (m.attachments || []).find(a => a?.kind === "audio")?.url;
        if (!url) return;
        setAudioModal({ open: true, src: url, msg: m, consume });
    }
    function closeAudioModal() {
        const { consume, msg } = audioModal;
        setAudioModal({ open: false, src: "", msg: null, consume: false });
        // el receptor consume (destruye) al cerrar el modal
        if (consume && msg && msg?.meta?.viewOnce && !msg?.meta?.viewOnceOpenedAt) {
            destroyViewOnceAttachment(activeCid, msg);
        }
    }

    // Doble click = reaccionar con ❤️ (igual que en mensajes de texto).
    // El click simple se retrasa un poco para poder distinguir el doble click.
    const clickTimers = useRef({});
    function dblReactHandlers(m, singleAction) {
        return {
            onClick: (e) => {
                if (!singleAction) return;
                clearTimeout(clickTimers.current[m.id]);
                const ev = e;
                clickTimers.current[m.id] = setTimeout(() => singleAction(ev), 230);
            },
            onDoubleClick: (e) => {
                clearTimeout(clickTimers.current[m.id]);
                spawnHeartAt(e.clientX, e.clientY);
                toggleMsgReaction(m, "heart");
            },
        };
    }
    async function toggleMsgReaction(msg, key) {
        if (!msg?.id || String(msg.id).startsWith("local-") || !user?.uid) return;
        try {
            const has = !!msg?.reactions?.[key]?.[user.uid];
            await updateDoc(doc(db, "conversations", activeCid, "messages", msg.id), {
                [`reactions.${key}.${user.uid}`]: has ? deleteField() : true,
            });
        } catch (e) { console.error("reaccion:", e); }
    }
    // Responder a un mensaje de adjunto (imagen/audio/etc.)
    function replyToAttachment(m) {
        const att = (m.attachments || [])[0];
        const label = m.text || attachmentPreviewLabel(att, m?.meta?.viewOnce);
        setReplyingTo({ id: m.id, text: label, senderName: m.senderUid === user?.uid ? "Tú" : (displayNameFromUser(otherUser) || "Ellos") });
        closeImgMenu();
    }

    // ── Indicador en vivo: "escribiendo…" / "grabando audio…" (1:1 y grupos) ──
    useEffect(() => {
        if (!activeCid || !user?.uid) { setTypingName(null); setRecordingName(null); return; }
        let hideTimer;
        const FRESH_MS = 6000;
        const freshWho = (map) => {
            const now = Date.now();
            for (const uid of Object.keys(map || {})) {
                if (uid === user.uid) continue;
                const ts = map[uid];
                const date = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
                if (date && now - date.getTime() < FRESH_MS) return uid;
            }
            return null;
        };
        const unsub = onSnapshot(doc(db, "conversations", activeCid), (snap) => {
            const d = snap.data() || {};
            const recWho = freshWho(d.recording);
            const typeWho = freshWho(d.typing);
            clearTimeout(hideTimer);
            // grabar tiene prioridad sobre escribir
            if (recWho) {
                setRecordingName(displayNameFromUser(userMap[recWho]) || "Alguien");
                setTypingName(null);
                hideTimer = setTimeout(() => setRecordingName(null), FRESH_MS);
            } else if (typeWho) {
                setTypingName(displayNameFromUser(userMap[typeWho]) || "Alguien");
                setRecordingName(null);
                hideTimer = setTimeout(() => setTypingName(null), FRESH_MS);
            } else {
                setTypingName(null);
                setRecordingName(null);
            }
        });
        return () => { unsub(); clearTimeout(hideTimer); };
    }, [activeCid, user?.uid, userMap]);

    // ── Saltar al mensaje original al hacer click en un quote block ──
    function jumpToMessage(msgId) {
        if (!msgId) return;
        const el = document.getElementById(`msg-${msgId}`);
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const bubble = el.querySelector("[data-bubble]");
        setTimeout(() => {
            if (!bubble) return;
            bubble.style.transition = "box-shadow 0.15s ease";
            bubble.style.boxShadow = "0 0 0 2px #3ea6ff, 0 0 18px rgba(62,166,255,0.5)";
            setTimeout(() => {
                bubble.style.transition = "box-shadow 0.7s ease";
                bubble.style.boxShadow = "0 0 0 0 rgba(62,166,255,0)";
                setTimeout(() => { bubble.style.boxShadow = ""; bubble.style.transition = ""; }, 750);
            }, 450);
        }, 350);
    }

    // ── Typing indicator: escribir mi estado a Firestore (llamado desde ChatComposer) ──
    function handleTyping(isTyping) {
        if (!activeCid || !user?.uid) return;
        clearTimeout(typingWriteTimerRef.current);
        const field = `typing.${user.uid}`;
        if (isTyping) {
            updateDoc(doc(db, "conversations", activeCid), { [field]: serverTimestamp() }).catch(() => {});
            typingWriteTimerRef.current = setTimeout(() => {
                updateDoc(doc(db, "conversations", activeCid), { [field]: deleteField() }).catch(() => {});
            }, 5000);
        } else {
            updateDoc(doc(db, "conversations", activeCid), { [field]: deleteField() }).catch(() => {});
        }
    }

    // Marcar el chat activo a nivel global para que ChatNotifier no notifique el que estás viendo
    useEffect(() => {
        if (typeof window !== "undefined") window.__dcActiveCid = activeCid || null;
        return () => { if (typeof window !== "undefined") window.__dcActiveCid = null; };
    }, [activeCid]);

    // ── Indicador "grabando audio…": escribir mi estado a Firestore ──
    const recordingWriteTimerRef = useRef(null);
    function handleRecording(isRec) {
        if (!activeCid || !user?.uid) return;
        clearTimeout(recordingWriteTimerRef.current);
        const field = `recording.${user.uid}`;
        if (isRec) {
            updateDoc(doc(db, "conversations", activeCid), { [field]: serverTimestamp() }).catch(() => {});
            // refrescar cada 4s mientras dure la grabación
            recordingWriteTimerRef.current = setInterval(() => {
                updateDoc(doc(db, "conversations", activeCid), { [field]: serverTimestamp() }).catch(() => {});
            }, 4000);
        } else {
            updateDoc(doc(db, "conversations", activeCid), { [field]: deleteField() }).catch(() => {});
        }
    }

    // Habilita/inhabilita el composer con doc fresco y reglas de negocio + bypass por enlace
    useEffect(() => {
        let cancelled = false;

        async function compute() {
            if (!user?.uid || !activeConversation) {
                if (!cancelled) setCanSendHere(false);
                return;
            }

            // Si vengo por enlace válido hacia el dueño, BYPASS total:
            if (inviteBypass && inviteOwnerUid && otherUid === inviteOwnerUid) {
                if (!cancelled) setCanSendHere(true);
                return;
            }

            // Si la conversación NO la inicié yo, siempre puedo responder
            if (activeConversation.startedBy !== user.uid) {
                if (!cancelled) setCanSendHere(true);
                return;
            }

            // Si la inicié yo (flujo normal), necesito rango habilitado
            let docData = userDoc;
            try {
                if (
                    !docData ||
                    (!Array.isArray(docData.ranks) &&
                        !Array.isArray(docData.roles) &&
                        !Array.isArray(docData?.profile?.ranks))
                ) {
                    const s = await getDoc(doc(db, "users", user.uid));
                    if (s.exists()) docData = { uid: user.uid, ...s.data() };
                }
            } catch (_) { }

            if (!cancelled) setCanSendHere(true);
        }

        compute();
        return () => { cancelled = true; };
    }, [user?.uid, userDoc, activeConversation, inviteBypass, inviteOwnerUid, otherUid]);

    return (
        <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4">
            <aside className="hidden md:block md:sticky md:top-4 h-fit">
                <PerfilNav />
            </aside>

            <div className="grid grid-cols-[340px_1fr] gap-4 h-[calc(100vh-140px)] min-h-0">
                {/* lista */}
                <aside
                    className={clsx(
                        "border border-white/10 rounded-2xl p-3 flex flex-col h-full overflow-hidden",
                        mobileView === "list" ? "block" : "hidden",
                        "lg:block"
                    )}
                >
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xl font-semibold">Chats</h2>
                        <button
                            type="button"
                            onClick={() => setShowChatSettings(true)}
                            className="w-9 h-9 grid place-content-center rounded-full hover:bg-white/10 text-white/70 hover:text-white transition cursor-pointer"
                            title="Ajustes de chat"
                            aria-label="Ajustes de chat"
                        >
                            <Cog6ToothIcon className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1 relative">
                            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 opacity-60" />
                            <input
                                className="w-full rounded-full border border-white/10 pl-9 pr-4 py-2 text-sm bg-transparent"
                                placeholder="Buscar"
                            />
                        </div>
                        <button
                            onClick={() => setOpenNew(true)}
                            className="w-10 h-10 rounded-full border border-white/10 text-xl leading-none cursor-pointer transition hover:bg-white/10"
                            title="Nuevo chat"
                        >
                            +
                        </button>
                    </div>

                    {/* Toggle Chats / Solicitudes */}
                    <div className="flex items-center gap-2 mb-3">
                        <button onClick={() => setInboxView("chats")}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${inboxView === "chats" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"}`}>
                            Chats
                        </button>
                        <button onClick={() => setInboxView("requests")}
                            className={`relative px-3 py-1.5 rounded-full text-sm font-medium transition cursor-pointer ${inboxView === "requests" ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"}`}>
                            Solicitudes
                            {requestConvos.length > 0 && (
                                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-[var(--accent)] text-white text-[10px] font-bold px-1">
                                    {requestConvos.length > 99 ? "99+" : requestConvos.length}
                                </span>
                            )}
                        </button>
                    </div>

                    {inboxView === "chats" && (
                    <div className="flex items-center gap-1.5 mb-3">
                        <Chip active={convFilter === "all"} onClick={() => setConvFilter("all")}>Todos</Chip>
                        <Chip active={convFilter === "unread"} onClick={() => setConvFilter("unread")}>No leídos</Chip>
                        <Chip active={convFilter === "groups"} onClick={() => setConvFilter("groups")}>Grupos</Chip>
                        {/* 4º chip: desplegable de listas */}
                        <div className="relative">
                            <button
                                onClick={() => setShowListsMenu(v => !v)}
                                className={`px-3 py-1 rounded-full text-xs border border-white/10 cursor-pointer transition inline-flex items-center gap-1 ${activeListLabel ? "bg-white/10" : "hover:bg-white/10"}`}
                            >
                                <span className="truncate max-w-[90px]">{activeListLabel || "Listas"}</span>
                                <ChevronDownIcon className="w-3.5 h-3.5" />
                            </button>
                            {showListsMenu && (
                                <>
                                    <div className="fixed inset-0 z-20" aria-hidden onClick={() => setShowListsMenu(false)} />
                                    <div className="absolute right-0 top-9 z-30 w-56 rounded-2xl border border-white/10 bg-[var(--bg)]/95 backdrop-blur p-1.5 shadow-xl">
                                        <button onClick={() => { setConvFilter("favorites"); setShowListsMenu(false); }}
                                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-white/8 cursor-pointer text-left ${convFilter === "favorites" ? "bg-white/10" : ""}`}>
                                            ⭐ Favoritos
                                        </button>
                                        <button onClick={() => { setConvFilter("chats"); setShowListsMenu(false); }}
                                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-white/8 cursor-pointer text-left ${convFilter === "chats" ? "bg-white/10" : ""}`}>
                                            💬 Solo chats
                                        </button>
                                        {chatLists.length > 0 && <div className="h-px bg-white/10 my-1" />}
                                        {chatLists.map(l => (
                                            <div key={l.id} className={`group/list flex items-center rounded-xl ${convFilter === l.id ? "bg-white/10" : "hover:bg-white/8"}`}>
                                                <button onClick={() => { setConvFilter(l.id); setShowListsMenu(false); }}
                                                    className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer text-left truncate">
                                                    {l.emoji && <span>{l.emoji}</span>}<span className="truncate">{l.name}</span>
                                                    <span className="ml-auto text-[10px] text-white/40">{(l.cids || []).length}</span>
                                                </button>
                                                <button onClick={() => setListModal({ id: l.id, name: l.name, emoji: l.emoji, cids: l.cids || [] })}
                                                    className="px-1.5 text-white/40 hover:text-white cursor-pointer" title="Editar lista">
                                                    <PencilIcon className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <div className="h-px bg-white/10 my-1" />
                                        <button onClick={() => { setShowListsMenu(false); setListModal({ name: "", emoji: "", cids: [] }); }}
                                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm hover:bg-white/8 cursor-pointer text-left text-[var(--accent2)]">
                                            <PlusIcon className="w-4 h-4" /> Nueva lista
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    )}

                    {/* ===== Bandeja de SOLICITUDES (segmentada por rango) ===== */}
                    {inboxView === "requests" && (
                        <div className="flex-1 overflow-y-auto overflow-x-hidden">
                            {requestConvos.length === 0 ? (
                                <div className="px-3 py-10 text-center text-sm text-white/40">No tienes solicitudes de mensaje.</div>
                            ) : (() => {
                                const important = requestConvos.filter((c) => isImportantUser(userMap[c.requestFrom]));
                                const normal = requestConvos.filter((c) => !isImportantUser(userMap[c.requestFrom]));
                                const renderItem = (c) => {
                                    const u = userMap[c.requestFrom];
                                    const name = displayNameFromUser(u) || c.requestFrom || "Usuario";
                                    const avatar = avatarFromUser(u);
                                    const lm = c.lastMessage?.text || (c.lastMessage ? "📎 Adjunto" : "Nueva solicitud");
                                    return (
                                        <div key={c.id} className="px-3 py-2.5 rounded-xl hover:bg-white/5 transition">
                                            <button onClick={() => { setActiveCid(c.id); setMobileView("thread"); }}
                                                className="w-full flex items-center gap-3 text-left cursor-pointer">
                                                <div className="h-10 w-10 rounded-full bg-[var(--bg3)] overflow-hidden shrink-0 flex items-center justify-center">
                                                    {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : <span>{(name[0] || "U").toUpperCase()}</span>}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-sm font-medium truncate">{name}</div>
                                                    <div className="text-xs text-white/45 truncate">{lm}</div>
                                                </div>
                                            </button>
                                            <div className="flex gap-2 mt-2">
                                                <button onClick={() => acceptRequest(c)}
                                                    className="flex-1 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white py-1.5 hover:bg-[var(--accent2)] cursor-pointer">Aceptar</button>
                                                <button onClick={() => rejectRequest(c)}
                                                    className="flex-1 text-xs font-semibold rounded-lg border border-white/15 text-white/70 py-1.5 hover:bg-white/10 cursor-pointer">Rechazar</button>
                                            </div>
                                        </div>
                                    );
                                };
                                return (
                                    <div className="space-y-1">
                                        {important.length > 0 && (
                                            <>
                                                <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-amber-300/80">✦ Destacadas (verificados, políticos, rangos)</div>
                                                {important.map(renderItem)}
                                            </>
                                        )}
                                        {normal.length > 0 && (
                                            <>
                                                <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wide text-white/35">Otras solicitudes</div>
                                                {normal.map(renderItem)}
                                            </>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    <div className={inboxView === "requests" ? "hidden" : "flex-1 overflow-y-auto overflow-x-hidden space-y-0.5"}>
                        {convos.filter(convMatchesFilter).map((c) => {
                            const isGroup = !!c.isGroup;
                            const other = isGroup ? null : (c.participantUids || []).find((u) => u !== user?.uid);
                            const u = other ? userMap[other] : null;
                            const name = isGroup ? (c.groupName || "Grupo") : (displayNameFromUser(u) || other || "Usuario");
                            const avatar = isGroup ? null : avatarFromUser(u);

                            // SOLO último mensaje → si no hay, no mostramos tiempo
                            const whenDate = tsToDate(c?.lastMessage?.at);
                            const whenRaw = whenDate ? formatRelativeEs(whenDate) : "";
                            // sin prefijos tipo "hace", "en", "dentro de"
                            const when = whenRaw.replace(/^hace\s+/i, "").replace(/^en\s+/i, "").replace(/^dentro de\s+/i, "");

                            let _lmRaw = c.lastMessage?.text || (c.lastMessage?.attachments?.length ? "📎 Archivo" : c.lastMessage?.type === "image" ? "📷 Imagen" : "");
                            // normalizar etiquetas viejas de "una vez" a círculo ①
                            _lmRaw = _lmRaw
                                .replace(/📷\s*Foto\s*\(ver una vez\)/i, "① 📷")
                                .replace(/🎤\s*Audio\s*\(escuchar una vez\)/i, "① 🎤")
                                .replace(/\s*\(ver una vez\)|\s*\(escuchar una vez\)/gi, " ①");
                            const _lmPrefix = c.lastMessage?.senderName ? `${c.lastMessage.senderName}: ` : "";
                            const lm = _lmPrefix + _lmRaw;
                            const selected = activeCid === c.id;
                            const showMenu = menuCid === c.id;

                            const lastAt = tsToDate(c?.lastMessage?.at);
                            const myReadAt = tsToDate(c?.readAt?.[user?.uid]);

                            const unread =
                                !!lastAt &&
                                (!myReadAt || lastAt > myReadAt) &&
                                c?.lastMessage?.senderUid &&
                                c.lastMessage.senderUid !== user?.uid;

                            return (
                                <div key={c.id} className="relative group">
                                    <div
                                        onClick={() => {
                                            setActiveCid(c.id);
                                            setMobileView("thread");
                                            markConversationRead(c.id, user, db);
                                            router.replace(`/mensajes?c=${c.id}`, { scroll: false });
                                        }}
                                        className={`flex items-center gap-3 px-3 py-3 rounded-xl transition cursor-pointer ${selected ? "bg-white/8" : "hover:bg-white/5"}`}
                                    >
                                        {isGroup ? (
                                            c.groupPhotoURL ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={c.groupPhotoURL} alt={name} className="h-[46px] w-[46px] shrink-0 rounded-full object-cover border border-white/10" />
                                            ) : (
                                                <div className="h-[46px] w-[46px] shrink-0 rounded-full bg-[var(--bg3)] border border-white/10 flex items-center justify-center text-base font-semibold text-white/70">
                                                    {(c.groupName?.[0] || "G").toUpperCase()}
                                                </div>
                                            )
                                        ) : (() => {
                                            const pres = resolvePresence(other ? presenceMap[other] : null, true);
                                            return (
                                                <div className="relative shrink-0">
                                                    <Avatar src={avatar} alt={name} size={46} />
                                                    {pres?.playing && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#4ade80] border-2 border-[var(--bg2)]" />}
                                                    {!pres?.playing && pres?.online && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#60a5fa] border-2 border-[var(--bg2)]" />}
                                                </div>
                                            );
                                        })()}
                                        <div className="flex-1 min-w-0 pr-8">
                                            {/* Fila 1: nombre + tiempo */}
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className={`truncate text-[14px] ${isDeletedUser(u) ? "text-white/30 italic font-normal" : unread ? "font-semibold text-white" : "font-medium text-white/85"}`}>{name}</span>
                                                    {favoriteChats.includes(c.id) && <StarIcon className="w-3.5 h-3.5 shrink-0 text-amber-300 fill-amber-300" />}
                                                    {!isGroup && other && !isDeletedUser(u) && <Badges uid={other} size="xs" />}
                                                </div>
                                                {when && (
                                                    <span className={`text-[11px] shrink-0 ${unread ? "text-[var(--accent2)] font-medium" : "opacity-45"}`}>{when}</span>
                                                )}
                                            </div>
                                            {/* Fila 2: preview + indicador no leído */}
                                            <div className="flex items-center justify-between gap-2 mt-0.5">
                                                <div className={`text-xs truncate ${unread ? "text-white/75" : "opacity-45"}`}>{lm || " "}</div>
                                                {unread && (
                                                    <span className="shrink-0 w-2 h-2 rounded-full bg-[var(--accent2)]" />
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Botón ⋯ flotante visible al hover */}
                                    <button
                                        className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition"
                                        title="Opciones"
                                        onClick={(e) => {
                                            if (showMenu) { setMenuCid(null); return; }
                                            const r = e.currentTarget.getBoundingClientRect();
                                            setMenuPos({ x: r.right, y: r.bottom });
                                            setMenuCid(c.id);
                                        }}
                                    >
                                        <IconMore />
                                    </button>

                                    {showMenu && (
                                        <>
                                            {/* backdrop para cerrar sin mover nada */}
                                            <div className="fixed inset-0 z-[55]" aria-hidden onClick={() => setMenuCid(null)} />
                                            <div
                                                style={{ top: menuPos.y + 4, left: Math.max(8, menuPos.x - 190) }}
                                                className="fixed z-[60] w-[190px] rounded-xl border border-white/10 bg-[var(--bg2)]/95 backdrop-blur-md p-1 text-sm shadow-xl">
                                                <button
                                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/8 cursor-pointer text-left transition"
                                                    onClick={() => { setMenuCid(null); toggleFavoriteChat(c.id); }}
                                                >
                                                    <StarIcon className={`w-4 h-4 shrink-0 ${favoriteChats.includes(c.id) ? "text-amber-300 fill-amber-300" : ""}`} />
                                                    {favoriteChats.includes(c.id) ? "Quitar de favoritos" : "Añadir a favoritos"}
                                                </button>
                                                <button
                                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/8 cursor-pointer text-left transition"
                                                    onClick={() => { setMenuCid(null); setListModal({ name: "", emoji: "", cids: [c.id] }); }}
                                                >
                                                    <PlusIcon className="w-4 h-4 shrink-0" />
                                                    Añadir a una lista
                                                </button>
                                                <div className="h-px bg-white/10 my-1" />
                                                <button
                                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-400 cursor-pointer text-left transition"
                                                    onClick={() => {
                                                        setMenuCid(null);
                                                        deleteConversation(c.id);
                                                    }}
                                                >
                                                    <TrashIcon className="w-4 h-4 shrink-0" />
                                                    Eliminar chat
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                        {!convos.length && !convosErr && (
                            <div className="text-sm opacity-70 p-3">No tienes conversaciones.</div>
                        )}
                        {convosErr && (
                            <AvisoFallo
                                fallo={convosErr}
                                onReintentar={() => setReintentoConvos(n => n + 1)}
                                forma={convos.length ? "linea" : "bloque"}
                                className="m-2"
                            />
                        )}
                    </div>
                </aside>

                {/* conversación */}
                <section
                    className={clsx(
                        "relative border border-white/10 rounded-2xl flex flex-col h-full overflow-hidden lg:flex",
                        mobileView === "thread" ? "fixed inset-0 z-40 bg-[var(--bg)]" : "hidden lg:flex"
                    )}
                >
                    {searchOpen && activeCid && (
                        <ChatSearchOverlay
                            messages={messages}
                            userMap={userMap}
                            isGroup={isGroupConv}
                            participants={activeConversation?.participantUids || []}
                            currentUid={user?.uid}
                            onJump={jumpToMessage}
                            onClose={() => setSearchOpen(false)}
                        />
                    )}
                    <div className="p-3 border-b border-white/10 sticky top-0 bg-[var(--bg)]/95 backdrop-blur z-10">
                        <div className="flex items-center gap-3">
                            {/* botón volver solo en móvil */}
                            <button
                                type="button"
                                aria-label="Volver"
                                onClick={() => setMobileView("list")}
                                className="lg:hidden rounded-full p-2 hover:bg-white/10 active:scale-95 transition"
                            >
                                <ChevronLeftIcon className="w-5 h-5" />
                            </button>

                            {!activeCid ? (
                                <div className="text-sm opacity-70">Elige una conversación.</div>
                            ) : (
                                <>
                                    {isGroupConv ? (
                                        activeConversation?.groupPhotoURL ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={activeConversation.groupPhotoURL} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover border border-white/10" />
                                        ) : (
                                            <div className="h-10 w-10 shrink-0 rounded-full bg-[var(--bg3)] border border-white/10 flex items-center justify-center text-base font-semibold text-white/70">
                                                {(activeConversation?.groupName?.[0] || "G").toUpperCase()}
                                            </div>
                                        )
                                    ) : (
                                        <Avatar
                                            src={avatarFromUser(otherUser)}
                                            alt={displayNameFromUser(otherUser)}
                                            size={40}
                                        />
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className="font-semibold truncate flex items-center gap-2">
                                            {isGroupConv ? (
                                                <button
                                                    type="button"
                                                    onClick={() => { if (!isAnonGroup || isGroupAdmin) setShowGroupMembers(true); }}
                                                    title={isAnonGroup && !isGroupAdmin ? "Grupo anónimo: no se puede ver quién está" : "Ver información del grupo"}
                                                    className={`truncate text-left transition ${isAnonGroup && !isGroupAdmin ? "cursor-default" : "hover:opacity-80 cursor-pointer"}`}
                                                >
                                                    {activeConversation?.groupName || "Grupo"}
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowContactInfo(true)}
                                                    title="Ver información del contacto"
                                                    className={`truncate text-left hover:opacity-80 cursor-pointer transition ${isDeletedUser(otherUser) ? "text-white/30 italic font-normal" : ""}`}
                                                >
                                                    {displayNameFromUser(otherUser) || otherUid}
                                                </button>
                                            )}
                                            {!isGroupConv && !isDeletedUser(otherUser) && <Badges uid={otherUid} size="sm" />}
                                        </div>
                                        {isGroupConv ? (
                                            isAnonGroup && !isGroupAdmin ? (
                                                <span className="text-xs opacity-60 flex items-center gap-1" title="En este grupo no se puede ver quién está">
                                                    🕵️ Grupo anónimo
                                                </span>
                                            ) : (
                                                <button onClick={() => setShowGroupMembers(true)} className="text-xs opacity-60 hover:opacity-90 cursor-pointer transition text-left">
                                                    {isAnonGroup ? `🕵️ Anónimo · ${groupParticipantCount} participantes` : `${groupParticipantCount} participantes`}
                                                </button>
                                            )
                                        ) : (
                                            <>
                                                {inviteBypass && inviteOwnerUid && otherUid === inviteOwnerUid && (
                                                    <div className="text-[11px] opacity-70">
                                                        Conversación iniciada por enlace: <span className="opacity-90">mensajes/{inviteToken}</span>
                                                    </div>
                                                )}
                                                {otherUser?.usernameSlug && (
                                                    <div className="text-xs opacity-70 truncate">
                                                        @{otherUser.usernameSlug}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="ml-auto flex items-center gap-0.5">
                                        <button
                                            type="button"
                                            title="Buscar en el chat"
                                            onClick={() => setSearchOpen(true)}
                                            className="rounded-full p-2 transition hover:bg-white/10 cursor-pointer"
                                        >
                                            <IconSearch className="opacity-90" />
                                        </button>
                                        <button
                                            type="button"
                                            title={selectMode ? "Cancelar selección" : "Seleccionar mensajes"}
                                            onClick={() => { setSelectMode(v => !v); setSelectedMsgIds(new Set()); }}
                                            className={clsx("rounded-full p-2 transition hover:bg-white/10 cursor-pointer", selectMode && "bg-white/10 text-[var(--accent2)]")}
                                        >
                                            <CheckCircleIcon className="w-5 h-5" />
                                        </button>
                                        {isGroupConv && (
                                            <button
                                                type="button"
                                                title="Ajustes del grupo"
                                                onClick={() => setShowGroupSettings(true)}
                                                className="rounded-full p-2 transition hover:bg-white/10 cursor-pointer"
                                            >
                                                <Cog6ToothIcon className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div
                        ref={scrollRef}
                        onScroll={handleScroll}
                        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 max-w-3xl mx-auto w-full"
                    >
                        {/* === IMG MENU RENDER (BEGIN) */}
                        {imgMenu.open && (
                            <>
                                {/* BACKDROP: cierra al clickear afuera */}
                                <div
                                    className="fixed inset-0 z-[55]"
                                    onClick={closeImgMenu}
                                />

                                {/* MENÚ de imagen */}
                                {(() => {
                                    const msg = imgMenu.msg;
                                    const mineImg = msg?.senderUid === user?.uid;
                                    const canAllImg = mineImg || isGroupAdmin;
                                    const vo = imgMenu.isVO;
                                    const isAudioMsg = (msg?.attachments || []).some(a => a?.kind === "audio");
                                    return (
                                <div
                                    style={{ left: imgMenu.x, top: imgMenu.y }}
                                    className="fixed z-[60] w-48 rounded-xl border border-white/10 bg-[var(--bg2)]/95 backdrop-blur shadow-lg p-1"
                                    role="menu"
                                    aria-orientation="vertical"
                                    tabIndex={-1}
                                >
                                    <MenuItem icon={FaceSmileIcon} label="Reaccionar"
                                        onClick={() => { const r = imgMenu; closeImgMenu(); setReactBar({ open: true, x: Math.max(8, Math.min(r.x, (typeof window !== "undefined" ? window.innerWidth : 400) - 300)), y: Math.max(8, r.y - 8), msg: r.msg }); }} />
                                    <MenuItem icon={ChevronLeftIcon} label="Responder"
                                        onClick={() => replyToAttachment(imgMenu.msg)} />
                                    <div className="h-px bg-white/10 my-1" />
                                    {/* Lo de "ver una vez" no se copia, descarga ni reenvía */}
                                    {!vo && (
                                        <>
                                            {!isAudioMsg && (
                                                <MenuItem icon={ClipboardIcon} label="Copiar"
                                                    onClick={() => copyImageToClipboard(imgMenu.url)} />
                                            )}
                                            <MenuItem icon={ArrowDownTrayIcon} label="Guardar como…"
                                                onClick={() => downloadImage(imgMenu.url, imgMenu.msg?.attachments?.[0]?.name)} />
                                            <MenuItem icon={ArrowPathIcon} label="Reenviar"
                                                onClick={() => { setForwardingMsg(imgMenu.msg); closeImgMenu(); }} />
                                            <div className="h-px bg-white/10 my-1" />
                                        </>
                                    )}
                                    <MenuItem icon={TrashIcon} label="Eliminar para mí" danger
                                        onClick={() => hideImageForMe(activeCid, imgMenu.msg)} />
                                    {canAllImg && (
                                        <MenuItem icon={TrashIcon} label="Eliminar para todos" danger
                                            onClick={() => deleteImageMessage(activeCid, imgMenu.msg)} />
                                    )}
                                </div>
                                    );
                                })()}
                            </>
                        )}

                        {/* === IMG MENU RENDER (END) */}

                        {/* Popover de reacciones para adjuntos (imagen/audio/etc.) */}
                        {reactBar.open && (
                            <>
                                <div className="fixed inset-0 z-[55]" onClick={closeReactBar} />
                                <div className="fixed z-[60] rounded-full border border-white/10 bg-[var(--bg2)]/95 backdrop-blur shadow-lg px-2 py-1 flex items-center gap-0.5"
                                    style={{ left: reactBar.x, top: reactBar.y }}>
                                    {EMOJI_REACTIONS.map(({ key, emoji }) => {
                                        const myReact = !!reactBar.msg?.reactions?.[key]?.[user?.uid];
                                        return (
                                            <button key={key} type="button"
                                                onClick={() => { toggleMsgReaction(reactBar.msg, key); closeReactBar(); }}
                                                className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-125 ${myReact ? "bg-white/15 scale-110" : "hover:bg-white/10"}`}
                                                title={emoji}>
                                                <TwemojiImg emoji={emoji} size="1.4rem" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* Modal de audio (escuchar una vez): controles completos; destruye al cerrar */}
                        {audioModal.open && (
                            <div className="fixed inset-0 z-[80] flex items-center justify-center">
                                <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={closeAudioModal} />
                                <div className="relative z-10 w-[min(420px,92vw)] rounded-2xl border border-white/10 bg-[var(--bg2)] p-5 shadow-xl">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2 text-sm font-medium">
                                            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full border border-white/30 text-xs">1</span>
                                            Nota de voz (una vez)
                                        </div>
                                        <button onClick={closeAudioModal} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer" title="Cerrar">
                                            <XMarkIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                    <div className="rounded-2xl bg-white/5 px-3 py-3">
                                        <AudioMessage src={audioModal.src} mine={false} />
                                    </div>
                                    <p className="mt-3 text-[11px] text-white/45">
                                        {audioModal.consume
                                            ? "Al cerrar este audio se eliminará y no podrás volver a escucharlo."
                                            : "Solo tú (emisor) puedes revisarlo hasta que la otra persona lo abra."}
                                    </p>
                                </div>
                            </div>
                        )}

                        {loadingMessages && (
                            <div className="flex items-center justify-center h-full min-h-[200px]">
                                <div className="text-sm opacity-60">Cargando…</div>
                            </div>
                        )}

                        {!loadingMessages && messagesErr && (
                            <div className="text-xs p-3 rounded-lg border border-white/10">
                                No tienes permiso para leer este hilo todavía.
                                {canSendHere ? (
                                    <span className="opacity-70"> Puedes escribir y el otro usuario verá tus mensajes.</span>
                                ) : null}
                                <div className="mt-1 opacity-60">{messagesErr?.code || "permission-denied"}</div>
                            </div>
                        )}
                        {!loadingMessages && activeCid && !messagesErr && (
                            <div className="relative h-full min-w-0">
                                {/* área scrolleable */}
                                <div
                                    className="min-h-0 w-full overflow-x-hidden pr-1"
                                >
                                    <div className="space-y-3">
                                        {/* Autocarga hacia arriba: indicador (no requiere click).
                                            Al hacer scroll cerca del tope se cargan más solos. */}
                                        {hasMoreOlder && (
                                            <div className="flex justify-center py-2">
                                                {loadingOlder ? (
                                                    <span className="inline-flex items-center gap-2 text-xs text-white/50">
                                                        <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                                        Cargando mensajes anteriores…
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-white/30">Sube para ver mensajes anteriores</span>
                                                )}
                                            </div>
                                        )}
                                        {(() => {
                                            const out = [];
                                            let lastDay = null;
                                            const _disSecs = activeConversation?.disappearingSecs || 0;
                                            const _now = Date.now();
                                            for (const m of messages) {
                                                // mensajes temporales: ocultar los más viejos que el TTL
                                                if (_disSecs) {
                                                    const at = tsToDate(m.at);
                                                    if (at && (_now - at.getTime()) / 1000 > _disSecs) continue;
                                                }
                                                const d = tsToDate(m.at);
                                                if (d && (!lastDay || !sameYMD(d, lastDay))) {
                                                    out.push(<DateDivider key={`day-${d?.toISOString()}`} date={d} />);
                                                    lastDay = d;
                                                }
                                                // ── MENSAJE CON VIDEO ───────────────────────────────────────────
                                                if (Array.isArray(m.attachments) && m.attachments.some(a => a?.kind === "video")) {
                                                    const isSender = m.senderUid === user?.uid;
                                                    const vid = m.attachments.find(a => a?.kind === "video");
                                                    const uploading = m.__localStatus === "sending";
                                                    out.push(
                                                        <div
                                                            key={m.id}
                                                            id={`msg-${m.id}`}
                                                            className={`w-full flex mb-2 ${isSender ? "justify-end" : "justify-start"}`}
                                                        >
                                                            <div className="relative inline-flex flex-col max-w-[min(520px,92vw)]">
                                                                <div className={`${isSender ? "ml-auto" : "mr-auto"} relative`}>
                                                                    <video
                                                                        src={vid?.url}
                                                                        controls
                                                                        preload="metadata"
                                                                        playsInline
                                                                        className={clsx(
                                                                            "rounded-2xl border border-white/10 max-w-[min(420px,90vw)] max-h-[60vh] bg-black",
                                                                            uploading && "opacity-70"
                                                                        )}
                                                                        {...dblReactHandlers(m, () => { })}
                                                                    />
                                                                    {uploading && (
                                                                        <div className="absolute inset-0 grid place-content-center rounded-2xl bg-black/30 pointer-events-none">
                                                                            <div className="flex flex-col items-center gap-2">
                                                                                <ArrowPathIcon className="w-7 h-7 animate-spin text-white drop-shadow" />
                                                                                <span className="text-[11px] text-white/90 bg-black/50 rounded-full px-2 py-0.5">Subiendo…</span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {m.text ? (
                                                                    <div className={`mt-1 px-3 py-2 rounded-2xl text-sm ${isSender ? "bg-[var(--accent)] text-white ml-auto" : "bg-[var(--bg3)] text-[var(--text)] mr-auto"}`}>
                                                                        <div className="whitespace-pre-wrap break-words">{m.text}</div>
                                                                        <div className="mt-1 text-[11px] opacity-70 leading-none text-right">
                                                                            {(tsToDate(m.at) || new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                                            <Tick state={readTickFor(m)} />
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <div className={`mt-0.5 text-[11px] opacity-60 leading-none ${isSender ? "text-right" : "text-left"}`}>
                                                                        {(tsToDate(m.at) || new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                                        <Tick state={readTickFor(m)} />
                                                                    </div>
                                                                )}
                                                                <MsgReactions msg={m} userUid={user?.uid} mine={isSender} onToggle={toggleMsgReaction} />
                                                            </div>
                                                        </div>
                                                    );
                                                } else
                                                // ── MENSAJE CON IMAGEN ───────────────────────────────────────────
                                                if (Array.isArray(m.attachments) && m.attachments.some(a => a?.kind === "image")) {
                                                    const isSender = m.senderUid === user?.uid;
                                                    const imgs = m.attachments.filter(a => a?.kind === "image");
                                                    const first = imgs[0];

                                                    // flags de "ver una vez"
                                                    const isVO = m?.meta?.viewOnce === true;
                                                    const alreadyOpened = !!m?.meta?.viewOnceOpenedAt || (m.attachments || []).length === 0;

                                                    if (isVO) {
                                                        // ===== VER-UNA-VEZ: SIN PREVIEW, SOLO BURBUJA + "1"
                                                        out.push(
                                                            <div
                                                                key={m.id}
                                                                id={`msg-${m.id}`}
                                                                className={`w-full flex mb-2 ${isSender ? "justify-end" : "justify-start"}`}
                                                            >
                                                                <div className={`group inline-flex items-center gap-1 max-w-[min(520px,92vw)] ${isSender ? "flex-row" : "flex-row-reverse"}`}>
                                                                    {/* 3 puntos al estilo del menú normal: aparece al hover, al lado de la burbuja */}
                                                                    {!alreadyOpened && !String(m.id).startsWith("local-") ? (
                                                                        <button
                                                                            type="button"
                                                                            className="shrink-0 h-7 w-7 rounded-full hover:bg-white/10 text-white/60 hover:text-white grid place-content-center cursor-pointer opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                if (imgMenu.open) { closeImgMenu(); return; }
                                                                                openImgMenu(e, m, first?.url || "", true);
                                                                            }}
                                                                            title="Opciones"
                                                                        >
                                                                            <EllipsisVerticalIcon className="w-5 h-5" />
                                                                        </button>
                                                                    ) : <span className="w-0" />}

                                                                    <div className="flex flex-col">
                                                                    {alreadyOpened ? (
                                                                        /* Ya abierta: como en Telegram, solo "expirada". A propósito SIN
                                                                           hora ni confirmación de lectura: mostrarlas dejaría deducir al
                                                                           remitente cuándo la vio la otra persona. */
                                                                        <div className="select-none inline-flex items-center gap-2 px-3 py-2 rounded-2xl border border-dashed border-white/20 bg-white/[0.04] text-white/45">
                                                                            <EyeSlashIcon className="h-4 w-4 shrink-0" />
                                                                            <span className="text-[13px] italic">Foto expirada</span>
                                                                        </div>
                                                                    ) : (
                                                                        <div
                                                                            className={`select-none px-3 py-2 rounded-2xl cursor-pointer ${isSender ? "bg-[var(--accent)] text-white" : "bg-[var(--bg3)] text-[var(--text)]"}`}
                                                                            title={isSender ? "Tocar para revisar" : "Tocar para ver una vez"}
                                                                            {...dblReactHandlers(m, () => {
                                                                                if (isSender) {
                                                                                    if (first?.url) openLb(first.url, m.text || "Foto", { protegido: true });
                                                                                    return;
                                                                                }
                                                                                openViewOnceAndDestroy(activeCid, m);
                                                                            })}
                                                                        >
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-white/40 bg-black/20 text-sm">1</span>
                                                                                <span className="text-[13px] leading-none">Foto</span>
                                                                                <span className="text-[11px] opacity-70 leading-none whitespace-nowrap">
                                                                                    {(tsToDate(m.at) || new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                                                    <Tick state={readTickFor(m)} />
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    <MsgReactions msg={m} userUid={user?.uid} mine={isSender} onToggle={toggleMsgReaction} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    } else {
                                                        // ===== IMAGEN NORMAL (PERMANENTE): MOSTRAR IMAGEN + TRES PUNTOS, y abrir visor al click
                                                        out.push(
                                                            <div
                                                                key={m.id}
                                                                id={`msg-${m.id}`}
                                                                className={`w-full flex mb-2 ${isSender ? "justify-end" : "justify-start"}`}
                                                            >
                                                                <div className="relative inline-flex flex-col max-w-[min(520px,92vw)]">
                                                                    {(() => { const uploading = m.__localStatus === "sending"; return (
                                                                    <div className={`${isSender ? "ml-auto" : "mr-auto"} relative`}>
                                                                        {/* imagen visible como preview */}
                                                                        <img
                                                                            src={first?.url}
                                                                            alt={m.text || "Imagen"}
                                                                            className={clsx(
                                                                                "rounded-2xl border border-white/10 max-w-[min(420px,90vw)] max-h-[60vh] object-contain transition select-none",
                                                                                uploading ? "opacity-70 blur-[1px] cursor-default" : "cursor-pointer"
                                                                            )}
                                                                            {...dblReactHandlers(m, () => { if (!uploading && first?.url) openLb(first.url, m.text || ""); })}
                                                                        />

                                                                        {/* overlay de carga mientras se sube */}
                                                                        {uploading && (
                                                                            <div className="absolute inset-0 grid place-content-center rounded-2xl bg-black/30">
                                                                                <div className="flex flex-col items-center gap-2">
                                                                                    <ArrowPathIcon className="w-7 h-7 animate-spin text-white drop-shadow" />
                                                                                    <span className="text-[11px] text-white/90 bg-black/50 rounded-full px-2 py-0.5">Subiendo…</span>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* tres puntitos (oculto mientras sube) */}
                                                                        <div className={clsx("absolute top-2 right-2", uploading && "hidden")}>
                                                                            <button
                                                                                type="button"
                                                                                className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80 flex items-center justify-center cursor-pointer"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (imgMenu.open) {
                                                                                        closeImgMenu();
                                                                                        return;
                                                                                    }
                                                                                    openImgMenu(e, m, first?.url || "", false);
                                                                                }}
                                                                                title="Opciones"
                                                                            >
                                                                                <EllipsisVerticalIcon className="w-4 h-4" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    ); })()}

                                                                    {/* pie: caption + hora (solo si el usuario escribió algo) */}
                                                                    {m.text ? (
                                                                        <div
                                                                            className={`mt-1 px-3 py-2 rounded-2xl text-sm ${isSender ? "bg-[var(--accent)] text-white ml-auto" : "bg-[var(--bg3)] text-[var(--text)] mr-auto"
                                                                                }`}
                                                                        >
                                                                            <div className="whitespace-pre-wrap break-words">
                                                                                {m.text}
                                                                            </div>
                                                                            <div className="mt-1 text-[11px] opacity-70 leading-none text-right">
                                                                                {(tsToDate(m.at) || new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                                                <Tick state={readTickFor(m)} />
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className={`mt-0.5 text-[11px] opacity-60 leading-none ${isSender ? "text-right" : "text-left"}`}>
                                                                            {(tsToDate(m.at) || new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                                            <Tick state={readTickFor(m)} />
                                                                        </div>
                                                                    )}
                                                                    <MsgReactions msg={m} userUid={user?.uid} mine={isSender} onToggle={toggleMsgReaction} />
                                                                </div>
                                                            </div>
                                                        );
                                                    }
                                                } else if (Array.isArray(m.attachments) && m.attachments.some(a => a?.kind === "audio")) {
                                                    // ── MENSAJE DE AUDIO (nota de voz) ──
                                                    const isMine = m.senderUid === user?.uid;
                                                    const au = m.attachments.find(a => a?.kind === "audio");
                                                    const uploading = m.__localStatus === "sending";
                                                    const isVOaudio = m?.meta?.viewOnce === true;
                                                    const audioOpened = !!m?.meta?.viewOnceOpenedAt || (m.attachments || []).length === 0;
                                                    // El menú de 3 puntos: en audios normales para todos; en "una vez" solo el emisor (para arrepentirse).
                                                    const showAudioMenu = !uploading && (!isVOaudio || !audioOpened);
                                                    const senderInGroup = isGroupConv
                                                        ? (userMap[m.senderUid] ? displayNameFromUser(userMap[m.senderUid]) : m.senderProfileName || null)
                                                        : null;
                                                    const MenuBtn = () => (
                                                        <button type="button"
                                                            className="shrink-0 h-7 w-7 rounded-full hover:bg-white/10 text-white/60 hover:text-white grid place-content-center cursor-pointer opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition"
                                                            onClick={(e) => { e.stopPropagation(); if (imgMenu.open) { closeImgMenu(); return; } openImgMenu(e, m, au?.url || "", isVOaudio); }}
                                                            title="Opciones">
                                                            <EllipsisVerticalIcon className="w-5 h-5" />
                                                        </button>
                                                    );
                                                    out.push(
                                                        <div key={m.id} id={`msg-${m.id}`}>
                                                            {isGroupConv && senderInGroup && (
                                                                <div className={`text-[11px] text-white/45 mb-0.5 ${isMine ? "text-right pr-2" : "pl-2"}`}>{senderInGroup}</div>
                                                            )}
                                                            <div className={`group w-full flex items-center gap-1 mb-2 ${isMine ? "justify-end" : "justify-start"}`}>
                                                                {isMine && showAudioMenu && <MenuBtn />}
                                                                <div className="flex flex-col">
                                                                <div
                                                                    className={`px-3 py-2 rounded-2xl select-none ${isMine ? "bg-[var(--accent)] text-white" : "bg-[var(--bg3)] text-[var(--text)]"}`}
                                                                    onDoubleClick={(e) => { if (!uploading) { spawnHeartAt(e.clientX, e.clientY); toggleMsgReaction(m, "heart"); } }}
                                                                >
                                                                    {uploading ? (
                                                                        <div className="flex items-center gap-2 text-sm min-w-[180px]">
                                                                            <ArrowPathIcon className="w-4 h-4 animate-spin" /> Enviando audio…
                                                                        </div>
                                                                    ) : isVOaudio ? (
                                                                        audioOpened ? (
                                                                            <div className="flex items-center gap-2 text-sm min-w-[170px] opacity-70">
                                                                                <span className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-white/20 opacity-50 line-through text-sm">1</span>
                                                                                Audio (escuchado)
                                                                            </div>
                                                                        ) : (
                                                                            <button type="button" onClick={() => openAudioModal(m, !isMine)}
                                                                                className="flex items-center gap-2.5 text-sm min-w-[190px] cursor-pointer"
                                                                                title={isMine ? "Escuchar (revisar)" : "Escuchar una vez"}>
                                                                                <span className={`shrink-0 w-9 h-9 grid place-content-center rounded-full ${isMine ? "bg-white/20" : "bg-white/10"}`}>
                                                                                    <PlayIconSolid className="w-5 h-5 translate-x-px" />
                                                                                </span>
                                                                                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full border border-white/40 text-[11px]">1</span>
                                                                                <span>{isMine ? "Audio (una vez)" : "Escuchar una vez"}</span>
                                                                            </button>
                                                                        )
                                                                    ) : (
                                                                        <AudioMessage src={au?.url} mine={isMine} durationHint={au?.durationSecs || 0} />
                                                                    )}
                                                                    <div className="mt-1 text-[11px] opacity-70 leading-none text-right">
                                                                        {(tsToDate(m.at) || new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                                        <Tick state={readTickFor(m)} />
                                                                    </div>
                                                                </div>
                                                                <MsgReactions msg={m} userUid={user?.uid} mine={isMine} onToggle={toggleMsgReaction} />
                                                                </div>
                                                                {!isMine && showAudioMenu && <MenuBtn />}
                                                            </div>
                                                        </div>
                                                    );
                                                } else {
                                                    // ── MENSAJE NORMAL (SIN IMAGEN) → conserva tu Bubble actual ──
                                                    const isMine = m.senderUid === user?.uid;
                                                    const senderInGroup = isGroupConv
                                                        ? (userMap[m.senderUid] ? displayNameFromUser(userMap[m.senderUid]) : m.senderProfileName || null)
                                                        : null;
                                                    const senderAvatar = isGroupConv
                                                        ? (isMine
                                                            ? (userDoc?.profile?.photoURL || userDoc?.photoURL || user?.photoURL || avatarFromUser(userMap[m.senderUid]))
                                                            : avatarFromUser(userMap[m.senderUid]))
                                                        : null;
                                                    out.push(
                                                        <div key={m.id} id={`msg-${m.id}`}>
                                                        {isGroupConv && senderInGroup && (
                                                            <div className={`text-[11px] text-white/45 mb-0.5 ${isMine ? "text-right pr-9" : "pl-9"}`}>{senderInGroup}</div>
                                                        )}
                                                        <div className={`flex items-end gap-1.5 ${isMine ? "flex-row-reverse" : ""}`}>
                                                        {isGroupConv && (
                                                            <div className="w-7 h-7 rounded-full bg-[var(--bg3)] ring-1 ring-white/10 overflow-hidden flex items-center justify-center shrink-0 text-xs self-end mb-1">
                                                                {senderAvatar
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    ? <img src={senderAvatar} alt="" className="w-full h-full object-cover" />
                                                                    : <span>{(senderInGroup?.[0] || "?").toUpperCase()}</span>}
                                                            </div>
                                                        )}
                                                        <Bubble
                                                            mine={isMine}
                                                            time={(tsToDate(m.at) || new Date()).toLocaleTimeString([], {
                                                                hour: "2-digit",
                                                                minute: "2-digit",
                                                            })}
                                                            msgId={m.id}
                                                            msgType={m.type}
                                                            convoId={activeCid}
                                                            db={db}
                                                            userUid={user?.uid}
                                                            reactions={m.reactions}
                                                            editedAt={m.editedAt}
                                                            forwarded={!!m.meta?.forwarded}
                                                            replyTo={m.replyToId ? { id: m.replyToId, text: m.replyToText, senderName: m.replyToSenderName || "↩" } : null}
                                                            onReply={() => setReplyingTo({ id: m.id, text: m.text, senderName: m.senderUid === user?.uid ? "Tú" : (displayNameFromUser(otherUser) || "Ellos") })}
                                                            onJumpToReply={jumpToMessage}
                                                            onForward={() => setForwardingMsg(m)}
                                                            selectMode={selectMode}
                                                            selected={selectedMsgIds.has(m.id)}
                                                            canDeleteForEveryone={isMine || isGroupAdmin}
                                                            confirmDelete={askConfirm}
                                                            onSelect={() => setSelectedMsgIds(prev => {
                                                                const next = new Set(prev);
                                                                next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                                                                return next;
                                                            })}
                                                            status={
                                                                m.__localStatus
                                                                    ? m.__localStatus
                                                                    : (() => {
                                                                        if (m.senderUid !== user?.uid) return undefined;
                                                                        // Read receipts: solo se muestran si YO y el otro los tenemos activos
                                                                        if (!readReceiptsOn || !otherReadReceiptsOn) return "sent";
                                                                        const otherReadAt = activeConversation?.readAt?.[otherUid];
                                                                        const msgAt = m.at?.toDate?.() || (m.at instanceof Date ? m.at : null);
                                                                        if (otherReadAt && msgAt && (otherReadAt?.toDate?.() || otherReadAt) >= msgAt) return "read";
                                                                        return "sent";
                                                                    })()
                                                            }
                                                            errorMessage={m.__localError}
                                                            onRetry={
                                                                m.__localStatus === "error"
                                                                    ? () => {
                                                                        setPendingMsgs((arr) =>
                                                                            arr.map((x) =>
                                                                                x.id === m.id ? { ...x, status: "sending", error: null } : x
                                                                            )
                                                                        );
                                                                        sendMessage(
                                                                            activeCid,
                                                                            m.__retryPayload?.text || "",
                                                                            m.__retryPayload?.attachments || []
                                                                        );
                                                                    }
                                                                    : undefined
                                                            }
                                                        >
                                                            {m.type === "viewonce_opened"
                                                                ? "Foto (ver una vez) • abierta"
                                                                : m.type === "share"
                                                                    ? <ShareCard meta={m.meta} />
                                                                    : (m.type === "text"
                                                                        ? (m.text || "")
                                                                        : (m.attachments?.[0]?.name || m.type))}
                                                        </Bubble>
                                                        </div>
                                                        </div>
                                                    );
                                                }
                                            }
                                            return out.length ? (
                                                out
                                            ) : (
                                                <div className="flex items-center justify-center h-full min-h-[200px] text-sm opacity-60">No hay mensajes aún.</div>
                                            );
                                        })()}
                                        {/* ancla */}
                                        <div aria-hidden className="h-1" />
                                    </div>
                                </div>

                                {/* botón flotante centrado con flecha hacia abajo */}
                                {showJumpDown && (
                                    <button
                                        type="button"
                                        title="Ir al final"
                                        onClick={goToBottomSmart}
                                        className="pointer-events-auto absolute bottom-4 right-4 z-40
             rounded-full p-3 bg-[var(--bg2)]/80 backdrop-blur border border-white/10
             hover:bg-[var(--bg3)] shadow-lg cursor-pointer
             transition-transform duration-150 hover:scale-110 active:scale-95"
                                    >
                                        <ChevronDownIcon className="w-6 h-6" />
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {activeCid && (
                        <div className="max-w-3xl mx-auto w-full flex flex-col">
                            {/* barra de respuesta */}
                            {replyingTo && (
                                <div className="flex items-center gap-3 px-4 py-2.5 bg-[var(--bg2)]/80 border-t border-white/10 backdrop-blur">
                                    <div className="w-1 h-9 bg-[var(--accent2)] rounded-full flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[var(--accent2)] text-xs font-semibold mb-0.5">{replyingTo.senderName}</div>
                                        <div className="truncate text-xs text-white/60">{replyingTo.text || "📎 adjunto"}</div>
                                    </div>
                                    <button type="button" onClick={() => setReplyingTo(null)}
                                        className="cursor-pointer shrink-0 p-1.5 rounded-full hover:bg-white/10 transition text-white/50 hover:text-white/90">
                                        <XMarkIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {/* barra de selección */}
                            {selectMode && (
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--bg2)]/80 border-t border-white/10 backdrop-blur">
                                    <span className="text-sm text-white/60 flex-1">
                                        {selectedMsgIds.size > 0 ? `${selectedMsgIds.size} seleccionado${selectedMsgIds.size !== 1 ? "s" : ""}` : "Selecciona mensajes"}
                                    </span>
                                    {selectedMsgIds.size > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const msgs = messages.filter(m => selectedMsgIds.has(m.id));
                                                    if (msgs.length === 1) setForwardingMsg(msgs[0]);
                                                    setSelectMode(false); setSelectedMsgIds(new Set());
                                                }}
                                                className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--accent2)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/10 transition"
                                            >Reenviar</button>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const n = selectedMsgIds.size;
                                                    const ok = await askConfirm({ title: "Eliminar para mí", message: `¿Eliminar ${n} mensaje${n !== 1 ? "s" : ""} para ti? Seguirán visibles para los demás.`, confirmLabel: "Eliminar", danger: true });
                                                    if (!ok) return;
                                                    for (const id of selectedMsgIds) {
                                                        if (String(id).startsWith("local-")) continue;
                                                        try {
                                                            await updateDoc(
                                                                doc(db, "conversations", activeCid, "messages", id),
                                                                { deletedFor: arrayUnion(user.uid) }
                                                            );
                                                        } catch (_) { }
                                                    }
                                                    setSelectMode(false); setSelectedMsgIds(new Set());
                                                }}
                                                className="cursor-pointer px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 transition"
                                            >Eliminar para mí</button>
                                        </>
                                    )}
                                    <button type="button" onClick={() => { setSelectMode(false); setSelectedMsgIds(new Set()); }}
                                        className="cursor-pointer p-1.5 rounded-full hover:bg-white/10 transition text-white/50 hover:text-white/90">
                                        <XMarkIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {/* indicador en vivo: grabando audio (prioridad) o escribiendo */}
                            {recordingName ? (
                                <div className="flex items-center gap-2 px-4 pb-1 text-[12px] text-red-400/80 chat-slide-in select-none">
                                    <MicrophoneIcon className="w-3.5 h-3.5 animate-pulse" />
                                    <span>{isGroupConv ? `${recordingName} está grabando audio…` : "grabando audio…"}</span>
                                </div>
                            ) : typingName ? (
                                <div className="flex items-center gap-2 px-4 pb-1 text-[12px] opacity-60 chat-slide-in select-none">
                                    <div className="flex items-center gap-1">
                                        <span className="typing-dot" />
                                        <span className="typing-dot" />
                                        <span className="typing-dot" />
                                    </div>
                                    <span>{isGroupConv ? `${typingName} está escribiendo…` : "está escribiendo…"}</span>
                                </div>
                            ) : null}

                            {!isGroupConv && otherUid && blockedUsers.includes(otherUid) && (
                                <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                                    <span>Bloqueaste a este usuario. No puedes enviarle mensajes.</span>
                                    <button onClick={() => toggleBlockUser(otherUid)} className="underline hover:text-red-200 cursor-pointer shrink-0">Desbloquear</button>
                                </div>
                            )}

                            <ChatComposer
                                key={activeCid || "no-chat"}
                                disabled={!canSendHere || selectMode || (!isGroupConv && otherUid && blockedUsers.includes(otherUid))}
                                draftKey={activeCid ? `dc_draft_${activeCid}` : null}
                                onTyping={handleTyping}
                                onRecording={handleRecording}
                                onSend={({ text, attachments, viewOnce }) => {
                                    sendMessage(activeCid, text, attachments, { viewOnce, replyTo: replyingTo });
                                    setReplyingTo(null);
                                    handleTyping(false);
                                }}
                            />
                        </div>
                    )}
                </section>
            </div>

            {/* modal nuevo chat */}
            <StartChatDialog
                open={openNew}
                onClose={() => setOpenNew(false)}
                onPick={(uid) => {
                    setOpenNew(false);
                    startConversationWith(uid);
                }}
                onPickGroup={({ groupName, uids }) => {
                    setOpenNew(false);
                    createGroupConversation({ groupName, uids });
                }}
            />

            {/* diálogo de confirmación integrado */}
            {confirmState && (
                <ConfirmDialog
                    title={confirmState.title}
                    message={confirmState.message}
                    confirmLabel={confirmState.confirmLabel}
                    cancelLabel={confirmState.cancelLabel}
                    danger={confirmState.danger}
                    onResolve={(ok) => { confirmState.resolve(ok); setConfirmState(null); }}
                />
            )}

            {/* panel info de contacto (1:1) */}
            {showContactInfo && !isGroupConv && activeConversation && (
                <ContactInfoModal
                    otherUser={otherUser}
                    otherUid={otherUid}
                    conv={activeConversation}
                    muted={mutedChats.includes(activeCid)}
                    blocked={blockedUsers.includes(otherUid)}
                    disappearingSecs={activeConversation?.disappearingSecs || 0}
                    sharedImages={messages.flatMap(m => (m.attachments || []).filter(a => a?.kind === "image" && a.url && !m?.meta?.viewOnce).map(a => ({ url: a.url, msgId: m.id }))).reverse()}
                    onToggleMute={() => toggleMuteChat(activeCid)}
                    onToggleBlock={() => toggleBlockUser(otherUid)}
                    onSetDisappearing={(s) => setDisappearing(activeCid, s)}
                    onClear={() => { clearChatMessages(activeCid); }}
                    onDelete={() => { setShowContactInfo(false); deleteConversation(activeCid); }}
                    onReport={() => { setShowContactInfo(false); setReportTarget({ id: otherUid, name: displayNameFromUser(otherUser) || "Usuario" }); }}
                    onSearch={() => { setShowContactInfo(false); setSearchOpen(true); }}
                    onClose={() => setShowContactInfo(false)}
                    onOpenImage={(it) => { setShowContactInfo(false); jumpToMessage(it.msgId); }}
                />
            )}

            {reportTarget && (
                <ReportModal
                    type="user"
                    targetId={reportTarget.id}
                    targetTitle={reportTarget.name}
                    onClose={() => setReportTarget(null)}
                />
            )}

            {/* modal crear/editar lista */}
            {listModal && (
                <ListEditorModal
                    list={listModal}
                    convos={convos}
                    userMap={userMap}
                    userUid={user?.uid}
                    onClose={() => setListModal(null)}
                    onSave={async (data) => { await saveChatList(data); setListModal(null); }}
                    onDelete={async (id) => { await deleteChatList(id); setListModal(null); }}
                />
            )}

            {/* modal ajustes de chat */}
            {showChatSettings && (
                <ChatSettingsModal
                    readReceipts={readReceiptsOn}
                    onToggleReadReceipts={(v) => setReadReceipts(v)}
                    onClose={() => setShowChatSettings(false)}
                />
            )}

            {/* modal miembros del grupo — en un grupo anónimo solo lo abre su admin */}
            <GroupMembersModal
                open={showGroupMembers && (!isAnonGroup || isGroupAdmin)}
                conv={activeConversation}
                userUid={user?.uid}
                db={db}
                onClose={() => setShowGroupMembers(false)}
            />

            {/* modal ajustes del grupo */}
            <GroupSettingsModal
                open={showGroupSettings}
                conv={activeConversation}
                userUid={user?.uid}
                db={db}
                storage={storage}
                onClose={() => setShowGroupSettings(false)}
            />

            {/* modal reenviar mensaje */}
            {forwardingMsg && (
                <ForwardModal
                    msg={forwardingMsg}
                    convos={convos}
                    userMap={userMap}
                    userUid={user?.uid}
                    db={db}
                    onClose={() => setForwardingMsg(null)}
                />
            )}

        </div>
    );
}

export default function MensajesPage() {
    return (
        <Suspense fallback={<div className="p-4 text-sm opacity-70">Cargando…</div>}>
            <MensajesPageContent />
        </Suspense>
    );
}
