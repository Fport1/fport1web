"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import {
    collection, query, where, onSnapshot,
    addDoc, doc, updateDoc, getDoc, serverTimestamp, increment,
} from "firebase/firestore";
import {
    XMarkIcon, PaperAirplaneIcon, CheckIcon,
    FolderOpenIcon, DocumentTextIcon, MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import { registrarFallo } from "@/lib/fallos";

export default function ShareToChatModal({ user, shareType, shareData, onClose }) {
    const [convos, setConvos]     = useState([]);
    const [userMap, setUserMap]   = useState({});
    const [search, setSearch]     = useState("");
    const [selected, setSelected] = useState(new Set());
    const [sending, setSending]   = useState(false);
    const [sent, setSent]         = useState(false);

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(collection(db, "conversations"), where("participantUids", "array-contains", user.uid));
        return onSnapshot(q, async snap => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            docs.sort((a, b) => (b.lastMessage?.at?.toMillis?.() ?? 0) - (a.lastMessage?.at?.toMillis?.() ?? 0));
            setConvos(docs);

            const uids = new Set();
            docs.forEach(c => { if (!c.isGroup) c.participantUids?.forEach(u => { if (u !== user.uid) uids.add(u); }); });
            const entries = await Promise.allSettled([...uids].map(async uid => {
                const s = await getDoc(doc(db, "users", uid));
                return [uid, s.exists() ? s.data() : {}];
            }));
            const m = {};
            entries.forEach(r => { if (r.status === "fulfilled") { const [uid, data] = r.value; m[uid] = data; } });
            setUserMap(m);
        }, err => registrarFallo("compartir:conversaciones", err, "tus conversaciones"));
    }, [user?.uid]);

    function convoName(c) {
        if (c.isGroup) return c.groupName || "Grupo";
        const other = c.participantUids?.find(u => u !== user.uid);
        const u = userMap[other];
        return u?.profile?.profileName || u?.profileName || u?.displayName || "Usuario";
    }

    function convoAvatar(c) {
        if (c.isGroup) return c.groupPhotoURL || null;
        const other = c.participantUids?.find(u => u !== user.uid);
        const u = userMap[other];
        return u?.profile?.photoURL || u?.photoURL || null;
    }

    function toggleSelect(cid) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(cid)) next.delete(cid); else next.add(cid);
            return next;
        });
    }

    const filtered = convos.filter(c => !search || convoName(c).toLowerCase().includes(search.toLowerCase()));

    async function handleSend() {
        if (selected.size === 0 || !user?.uid) return;
        setSending(true);
        try {
            const text = shareType === "proposal"
                ? `Compartió: "${shareData.titulo || "Propuesta"}"`
                : `Compartió una carpeta: "${shareData.folderName || "Carpeta"}"`;

            await Promise.all([...selected].map(async cid => {
                await addDoc(collection(db, "conversations", cid, "messages"), {
                    type: "share",
                    senderUid: user.uid,
                    text,
                    meta: { shareType, ...shareData },
                    at: serverTimestamp(),
                    reactions: {},
                });
                await updateDoc(doc(db, "conversations", cid), {
                    lastMessage: { text, at: new Date(), senderUid: user.uid },
                    [`readAt.${user.uid}`]: new Date(),
                });
            }));

            // Señal de interés (ligera): al compartir una propuesta, suma afinidad a sus etiquetas.
            // No lee chats: solo registra el interés en el momento de compartir.
            const tags = Array.isArray(shareData?.topicTags) ? shareData.topicTags : [];
            if (shareType === "proposal" && tags.length) {
                const patch = {};
                for (const t of tags) patch[`tagInterests.${t}`] = increment(1);
                updateDoc(doc(db, "users", user.uid), patch).catch(() => {});
            }

            setSent(true);
            setTimeout(onClose, 900);
        } catch {
            setSending(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full sm:w-80 bg-neutral-900 border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
                    <h3 className="font-semibold text-sm">Enviar al chat</h3>
                    <button onClick={onClose} className="p-1 text-white/40 hover:text-white"><XMarkIcon className="w-5 h-5" /></button>
                </div>

                {/* Preview */}
                <div className="mx-4 mt-3 mb-2 p-3 rounded-xl bg-white/5 border border-white/10 flex items-start gap-2.5">
                    <div className="shrink-0 p-1.5 bg-white/10 rounded-lg">
                        {shareType === "folder"
                            ? <FolderOpenIcon className="w-4 h-4 text-white/60" />
                            : <DocumentTextIcon className="w-4 h-4 text-white/60" />}
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                            {shareType === "proposal" ? (shareData.titulo || "Propuesta") : (shareData.folderName || "Carpeta")}
                        </p>
                        <p className="text-xs text-white/40">
                            {shareType === "proposal" ? (shareData.norma || "") : `${shareData.count ?? 0} propuestas`}
                        </p>
                    </div>
                </div>

                {/* Search */}
                <div className="px-4 mb-2 relative">
                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-7 top-1/2 -translate-y-1/2 text-white/30" />
                    <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar conversación..."
                        className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-white/30" />
                </div>

                {/* Conversations */}
                <div className="max-h-52 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <p className="text-center text-white/30 text-sm py-6">Sin conversaciones</p>
                    ) : filtered.map(c => {
                        const name      = convoName(c);
                        const avatar    = convoAvatar(c);
                        const isSelected = selected.has(c.id);
                        return (
                            <button key={c.id} onClick={() => toggleSelect(c.id)}
                                className={clsx("w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition", isSelected && "bg-white/8")}>
                                <div className="relative w-9 h-9 rounded-full bg-neutral-700 border border-white/10 flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
                                    {avatar
                                        ? <img src={avatar} alt="" className="w-full h-full object-cover" />
                                        : (name[0]?.toUpperCase() || "?")}
                                    {isSelected && (
                                        <div className="absolute inset-0 bg-sky-500/90 flex items-center justify-center">
                                            <CheckIcon className="w-4 h-4 text-white" />
                                        </div>
                                    )}
                                </div>
                                <span className="text-sm truncate flex-1 text-left">{name}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Send button */}
                <div className="px-4 py-3 border-t border-white/8">
                    <button onClick={handleSend} disabled={selected.size === 0 || sending || sent}
                        className="w-full flex items-center justify-center gap-2 py-2.5 text-sm bg-white text-black rounded-xl font-medium disabled:opacity-40 transition">
                        {sent ? (
                            <><CheckIcon className="w-4 h-4" /> Enviado</>
                        ) : sending ? (
                            <div className="h-4 w-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                        ) : (
                            <><PaperAirplaneIcon className="w-4 h-4" /> Enviar{selected.size > 1 ? ` (${selected.size})` : ""}</>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
