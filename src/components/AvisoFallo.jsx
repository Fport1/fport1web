"use client";

// Aviso de que UNA parte de la página no cargó, sin tumbar el resto.
//
// Dos formas, según lo que haya en pantalla:
//   - "bloque": la sección está vacía, así que el aviso ocupa su sitio.
//   - "linea":  ya hay contenido viejo a la vista; se avisa en una franja
//               fina encima y se deja lo anterior, como hace X cuando falla
//               el refresco del timeline pero los posts ya cargados siguen ahí.

import { useState } from "react";
import { ExclamationTriangleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

export default function AvisoFallo({ fallo, onReintentar, forma = "bloque", className = "" }) {
    const [reintentando, setReintentando] = useState(false);
    if (!fallo) return null;

    const puedeReintentar = fallo.reintentable && typeof onReintentar === "function";

    async function alReintentar() {
        if (reintentando) return;
        setReintentando(true);
        try {
            await onReintentar();
        } finally {
            // Si el reintento funciona este componente desaparece; el estado solo
            // importa cuando vuelve a fallar y el aviso sigue en pantalla.
            setReintentando(false);
        }
    }

    const BotonReintentar = puedeReintentar ? (
        <button
            type="button"
            onClick={alReintentar}
            disabled={reintentando}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/15 disabled:opacity-50"
        >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${reintentando ? "animate-spin" : ""}`} />
            {reintentando ? "Reintentando…" : "Reintentar"}
        </button>
    ) : null;

    if (forma === "linea") {
        return (
            <div
                role="status"
                className={`flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90 ${className}`}
            >
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">{fallo.detalle}</span>
                {BotonReintentar}
            </div>
        );
    }

    return (
        <div
            role="status"
            className={`rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-center ${className}`}
        >
            <ExclamationTriangleIcon className="mx-auto h-7 w-7 text-amber-400/80" />
            <h3 className="mt-3 text-sm font-semibold text-white">{fallo.titulo}</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-white/55">
                {fallo.detalle}
            </p>
            {puedeReintentar && <div className="mt-4 flex justify-center">{BotonReintentar}</div>}
        </div>
    );
}
