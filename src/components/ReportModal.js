"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/auth-context";
import { XMarkIcon, FlagIcon } from "@heroicons/react/24/outline";

const REASONS = [
    { value: "spam", label: "Spam o publicidad" },
    { value: "hate", label: "Discurso de odio o contenido ofensivo" },
    { value: "misinformation", label: "Información falsa o engañosa" },
    { value: "harassment", label: "Acoso o amenazas" },
    { value: "illegal", label: "Contenido ilegal" },
    { value: "other", label: "Otro" },
];

export default function ReportModal({ type, targetId, targetTitle, onClose }) {
    const { user } = useAuth();
    const [reason, setReason] = useState("");
    const [details, setDetails] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");

    async function submit() {
        if (!reason || !user) return;
        setSubmitting(true);
        setError("");
        try {
            await addDoc(collection(db, "reports"), {
                type,
                targetId,
                targetTitle: (targetTitle ?? "").slice(0, 200),
                reason,
                details: details.trim().slice(0, 500),
                reportedBy: user.uid,
                createdAt: serverTimestamp(),
                status: "pending",
            });
            setDone(true);
        } catch {
            setError("No se pudo enviar el reporte. Inténtalo de nuevo.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-sm p-6 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-white flex items-center gap-2">
                        <FlagIcon className="h-4 w-4 text-red-400" />
                        Reportar contenido
                    </h2>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition">
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {done ? (
                    <div className="text-center py-4">
                        <div className="text-4xl mb-3">✅</div>
                        <p className="text-white/80 text-sm mb-4">
                            Reporte enviado. Nuestro equipo lo revisará pronto.
                        </p>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm transition"
                        >
                            Cerrar
                        </button>
                    </div>
                ) : (
                    <>
                        {targetTitle && (
                            <p className="text-xs text-white/45 mb-4 line-clamp-2 italic">
                                &ldquo;{targetTitle}&rdquo;
                            </p>
                        )}
                        <div className="space-y-2.5 mb-4">
                            {REASONS.map(r => (
                                <label key={r.value} className="flex items-center gap-3 cursor-pointer group">
                                    <input
                                        type="radio"
                                        name="report-reason"
                                        value={r.value}
                                        checked={reason === r.value}
                                        onChange={() => setReason(r.value)}
                                        className="accent-red-500"
                                    />
                                    <span className="text-sm text-white/65 group-hover:text-white transition">
                                        {r.label}
                                    </span>
                                </label>
                            ))}
                        </div>
                        {reason === "other" && (
                            <textarea
                                value={details}
                                onChange={e => setDetails(e.target.value)}
                                maxLength={500}
                                placeholder="Describe el problema (opcional)"
                                rows={3}
                                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/25 resize-none outline-none focus:ring-2 focus:ring-red-500/40 mb-3"
                            />
                        )}
                        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
                        <div className="flex gap-2">
                            <button
                                onClick={onClose}
                                className="flex-1 px-4 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-sm transition"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={submit}
                                disabled={!reason || submitting}
                                className="flex-1 px-4 py-2 rounded-xl bg-red-500/80 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition"
                            >
                                {submitting ? "Enviando…" : "Reportar"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
