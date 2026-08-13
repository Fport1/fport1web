// Envía una notificación push (FCM) a los demás participantes de una conversación
// cuando se manda un mensaje. Respeta silenciados y bloqueos del destinatario.
import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { getMessaging } from "firebase-admin/messaging";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req) {
    const authz = req.headers.get("authorization") || "";
    const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
    if (!idToken) return NextResponse.json({ error: "no_token" }, { status: 401 });

    let decoded;
    try {
        decoded = await getAdminAuth().verifyIdToken(idToken);
    } catch {
        return NextResponse.json({ error: "invalid_token" }, { status: 401 });
    }
    const fromUid = decoded.uid;

    let cid, title, body;
    try { ({ cid, title, body } = await req.json()); }
    catch { return NextResponse.json({ error: "bad_body" }, { status: 400 }); }
    if (!cid) return NextResponse.json({ error: "no_cid" }, { status: 400 });

    const adminDb = getAdminDb();
    const convSnap = await adminDb.doc(`conversations/${cid}`).get();
    if (!convSnap.exists) return NextResponse.json({ error: "no_conv" }, { status: 404 });

    const conv = convSnap.data();
    const parts = conv.participantUids || [];
    if (!parts.includes(fromUid)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    const recipients = parts.filter((u) => u !== fromUid);
    const tokenOwners = []; // { uid, token }
    for (const uid of recipients) {
        // Datos sensibles ahora viven en users/{uid}/private/settings.
        // Compat: si aún no se migró, caer al doc principal.
        const privSnap = await adminDb.doc(`users/${uid}/private/settings`).get();
        const priv = privSnap.data() || {};
        const uSnap = await adminDb.doc(`users/${uid}`).get();
        const ud = uSnap.data() || {};
        const mutedChats = Array.isArray(priv.mutedChats) ? priv.mutedChats : (ud.mutedChats || []);
        const blockedUsers = Array.isArray(priv.blockedUsers) ? priv.blockedUsers : (ud.blockedUsers || []);
        const fcmTokens = Array.isArray(priv.fcmTokens) ? priv.fcmTokens : (ud.fcmTokens || []);
        const muted = mutedChats.includes(cid);
        const blocked = blockedUsers.includes(fromUid);
        if (muted || blocked) continue;
        for (const t of fcmTokens) tokenOwners.push({ uid, token: t });
    }

    if (!tokenOwners.length) return NextResponse.json({ sent: 0 });

    const messaging = getMessaging();
    const res = await messaging.sendEachForMulticast({
        tokens: tokenOwners.map((t) => t.token),
        notification: { title: title || "Nuevo mensaje", body: body || "" },
        data: { cid: String(cid) },
        webpush: { fcmOptions: { link: `/mensajes?c=${cid}` } },
    });

    // Limpia tokens inválidos (desinstalados / expirados)
    const toRemove = {}; // uid -> [tokens]
    res.responses.forEach((r, i) => {
        if (!r.success) {
            const code = r.error?.code || "";
            if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
                const { uid, token } = tokenOwners[i];
                (toRemove[uid] = toRemove[uid] || []).push(token);
            }
        }
    });
    for (const uid of Object.keys(toRemove)) {
        try { await adminDb.doc(`users/${uid}/private/settings`).set({ fcmTokens: FieldValue.arrayRemove(...toRemove[uid]) }, { merge: true }); }
        catch { /* noop */ }
        // Compat: limpia también posibles tokens legados en el doc principal.
        try { await adminDb.doc(`users/${uid}`).update({ fcmTokens: FieldValue.arrayRemove(...toRemove[uid]) }); }
        catch { /* noop */ }
    }

    return NextResponse.json({ sent: res.successCount });
}
