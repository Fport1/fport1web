"use client";

// Notificaciones de chat (foreground): mientras la app está abierta, muestra
// una notificación del navegador cuando llega un mensaje nuevo en un chat que
// NO estás viendo, respetando los chats silenciados. También actualiza el
// título de la pestaña con el número de chats no leídos.
//
// Para notificaciones con la app CERRADA haría falta FCM (service worker +
// VAPID key + envío desde el servidor); esto cubre el caso de app abierta.

import { useEffect, useRef } from "react";
import { collection, query, where, onSnapshot, doc, setDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-context";
import { registrarFallo } from "@/lib/fallos";

const BASE_TITLE = "Fport1";

export default function ChatNotifier() {
    const { user, profile: userDoc } = useAuth();
    const prevLastAt = useRef(null); // Map cid -> millis (null = aún no inicializado)
    const namesRef = useRef({});     // cache de nombres de remitentes

    useEffect(() => {
        if (!user?.uid) {
            prevLastAt.current = null;
            if (typeof document !== "undefined") document.title = BASE_TITLE;
            return;
        }

        const muted = Array.isArray(userDoc?.mutedChats) ? userDoc.mutedChats : [];

        const q = query(
            collection(db, "conversations"),
            where("participantUids", "array-contains", user.uid)
        );

        const unsub = onSnapshot(q, (snap) => {
            let unread = 0;
            const firstRun = prevLastAt.current === null;
            const map = prevLastAt.current || new Map();

            snap.forEach((d) => {
                const c = d.data();
                const cid = d.id;
                const lastAt = c.lastMessage?.at?.toMillis?.() ?? 0;
                const myReadAt = c.readAt?.[user.uid]?.toMillis?.() ?? 0;
                const sender = c.lastMessage?.senderUid;
                const incoming = sender && sender !== user.uid;

                if (lastAt && lastAt > myReadAt && incoming) unread++;

                // ¿Mensaje nuevo entrante desde la última vez?
                if (!firstRun && incoming && lastAt > (map.get(cid) || 0)) {
                    maybeNotify(c, cid, muted);
                }
                map.set(cid, lastAt);
            });

            prevLastAt.current = map;

            // Título de la pestaña
            if (typeof document !== "undefined") {
                document.title = unread > 0 ? `(${unread}) ${BASE_TITLE}` : BASE_TITLE;
            }
        }, err => registrarFallo("chat:no-leidos", err, "los mensajes sin leer"));

        return () => unsub();
    }, [user?.uid, userDoc?.mutedChats]);

    // Registra el token FCM para push en background (app cerrada).
    useEffect(() => {
        if (!user?.uid || typeof window === "undefined") return;
        if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
        if (Notification.permission !== "granted") return;
        const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
        if (!vapidKey) return; // sin VAPID key no hay push en background
        let cancelled = false;
        (async () => {
            try {
                const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
                if (!(await isSupported())) return;
                // El worker no ve las variables de entorno: se las pasamos en su URL.
                const cfg = new URLSearchParams({
                    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
                    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
                    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
                    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
                    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
                    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
                });
                const reg = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${cfg}`);
                const messaging = getMessaging();
                const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
                if (token && !cancelled) {
                    // fport1web guarda todo plano en users/{uid}; la API de notify
                    // ya contempla este caso además del subdocumento privado.
                    await setDoc(doc(db, "users", user.uid), { fcmTokens: arrayUnion(token) }, { merge: true });
                }
            } catch (_) { /* sin push: el foreground sigue funcionando */ }
        })();
        return () => { cancelled = true; };
    }, [user?.uid]);

    function maybeNotify(c, cid, muted) {
        if (typeof window === "undefined") return;
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        if (muted.includes(cid)) return;
        // No molestar si estás viendo justo ese chat y la pestaña está enfocada
        const viewingThis = window.__fpActiveCid === cid && document.hasFocus?.();
        if (viewingThis) return;

        const title = c.isGroup ? (c.groupName || "Grupo") : (c.lastMessage?.senderName || "Nuevo mensaje");
        const body = c.lastMessage?.text || "📎 Adjunto";
        try {
            const n = new Notification(title, {
                body,
                icon: "/favicon.ico",
                tag: `dc-chat-${cid}`,
                renotify: true,
            });
            n.onclick = () => {
                window.focus();
                window.location.href = `/mensajes?c=${cid}`;
                n.close();
            };
        } catch (_) { /* noop */ }
    }

    return null;
}
