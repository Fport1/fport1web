// src/lib/suscribir.js
// onSnapshot con red de seguridad. Se separa de `fallos.js` para que aquel siga
// sin depender de Firestore y se pueda probar en Node a secas.
//
// Resuelve dos cosas que había que repetir en cada página:
//   1. El plazo máximo. Firestore NO llama al callback de error cuando no puede
//      conectar: reintenta en silencio, así que sin plazo la sección se queda
//      en "Cargando…" para siempre. Comprobado apuntando a un proyecto
//      inexistente: nunca llegó ni un error.
//   2. Dejar rastro en consola, que es lo que faltaba cuando los callbacks de
//      error estaban vacíos y las cosas fallaban sin que nadie se enterara.

import { onSnapshot } from "firebase/firestore";
import { ESPERA_MAX_MS, falloPorEspera, registrarFallo } from "@/lib/fallos";

/**
 * @param {object} opciones
 * @param {import("firebase/firestore").Query} opciones.consulta
 * @param {string} opciones.donde   etiqueta para el log, p. ej. "guardadas"
 * @param {string} opciones.que     qué no cargó, en plural: "tus carpetas"
 * @param {(snap) => void} opciones.alLlegar
 * @param {(fallo) => void} opciones.alFallar  recibe un objeto de fallos.js
 * @returns {() => void} función para cancelar, lista para devolver en useEffect
 */
export function suscribir({ consulta, donde, que, alLlegar, alFallar }) {
    const plazo = setTimeout(() => alFallar(falloPorEspera(que)), ESPERA_MAX_MS);

    const cancelar = onSnapshot(
        consulta,
        (snap) => {
            clearTimeout(plazo);
            alLlegar(snap);
        },
        (err) => {
            clearTimeout(plazo);
            alFallar(registrarFallo(donde, err, que));
        }
    );

    return () => {
        clearTimeout(plazo);
        cancelar();
    };
}
