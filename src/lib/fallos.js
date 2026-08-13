// src/lib/fallos.js
// Traduce un error de Firebase a algo que una persona pueda entender.
//
// Por qué existe: hasta ahora, cuando Firestore fallaba, la sección se quedaba
// en blanco para siempre (los `onSnapshot` tenían el callback de error vacío) o
// mostraba un texto genérico. Ni el usuario sabía qué pasaba ni tenía forma de
// reintentar. La idea es la de X: si se cae UN servicio, cae esa sección y lo
// dice, no la página entera.
//
// TONO (importante al añadir mensajes): explicar sin quedar mal. Un fallo por
// exceso de tráfico se cuenta como lo que es —mucha gente usando el sitio—, no
// como "no damos abasto"; y nada de "se rompió" ni "problema serio", que suenan
// peor de lo que suele ser. Frase corta, y qué puede hacer la persona.

/**
 * @typedef {Object} Fallo
 * @property {string} titulo     qué pasó, en una frase
 * @property {string} detalle    qué puede hacer la persona
 * @property {boolean} reintentable  si tiene sentido ofrecer "Reintentar"
 * @property {string} clave      identificador corto, para telemetría o pruebas
 */

/** ¿El navegador dice que no hay red? */
function sinRed() {
    return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Clasifica un error (de Firestore, Storage o un fetch) en algo mostrable.
 * @param {unknown} e
 * @param {string} que  el nombre de lo que no cargó, en plural: "las propuestas"
 * @returns {Fallo}
 */
export function describirFallo(e, que = "el contenido") {
    const code = String(e?.code || "").replace(/^(firestore|storage|auth)\//, "");

    // La falta de red gana a cualquier otro código: si no hay conexión, el resto
    // del diagnóstico es ruido.
    if (sinRed() || code === "unavailable" || code === "network-request-failed") {
        return {
            clave: "sin-conexion",
            titulo: "Sin conexión",
            detalle: `No pudimos traer ${que}. Revisa tu conexión a internet.`,
            reintentable: true,
        };
    }

    switch (code) {
        // Firestore devuelve esto al pasarse de cuota o de límite de escrituras:
        // es el caso de "alta demanda".
        case "resource-exhausted":
            return {
                clave: "saturado",
                titulo: "Hay muchísima gente ahora mismo",
                detalle: `Estamos con más visitas de lo habitual y esto va más lento. Intenta de nuevo en un momento.`,
                reintentable: true,
            };

        case "deadline-exceeded":
        case "aborted":
            return {
                clave: "lento",
                titulo: "Está tardando más de lo normal",
                detalle: `Seguimos esperando ${que}.`,
                reintentable: true,
            };

        case "unauthenticated":
            return {
                clave: "sesion",
                titulo: "Tu sesión expiró",
                detalle: "Inicia sesión de nuevo para ver esta parte.",
                reintentable: false,
            };

        // Ojo: también sale cuando un bloqueador (Brave, uBlock…) impide que el
        // navegador adjunte el token, así que la petición llega sin credencial.
        case "permission-denied":
            return {
                clave: "permiso",
                titulo: "No se pudo verificar tu sesión",
                detalle: `No tenemos permiso para mostrar ${que}. Si usas un bloqueador de anuncios, intenta desactivarlo en este sitio.`,
                reintentable: true,
            };

        case "failed-precondition":
            return {
                clave: "consulta",
                titulo: "No pudimos hacer esa búsqueda",
                detalle: `Esa combinación de filtros no está disponible por ahora.`,
                reintentable: false,
            };

        case "cancelled":
            return {
                clave: "cancelado",
                titulo: "Carga interrumpida",
                detalle: `La carga de ${que} se cortó antes de terminar.`,
                reintentable: true,
            };

        default:
            return {
                clave: "desconocido",
                titulo: "No pudimos cargar esto",
                detalle: `No pudimos traer ${que}. Suele ser algo momentáneo.`,
                reintentable: true,
            };
    }
}

/**
 * Cuánto esperamos a la primera carga antes de dar la cara.
 * Comprobado: si Firestore no puede conectar, `onSnapshot` NO llama al callback
 * de error — se queda reintentando en silencio, y la sección se queda en
 * "Cargando…" para siempre. Sin este plazo, el aviso de fallo solo aparecería
 * en los casos raros (permisos, índice), no en una caída de verdad.
 */
export const ESPERA_MAX_MS = 12000;

/**
 * Fallo para cuando simplemente no llega respuesta.
 * Los textos se redactan sin concordar en número con `que`, porque llega tanto
 * en singular ("este perfil") como en plural ("las propuestas") y si no salían
 * cosas como "este perfil están tardando".
 */
export function falloPorEspera(que = "el contenido") {
    return {
        clave: "sin-respuesta",
        titulo: "Esto no está cargando",
        detalle: `No pudimos traer ${que}. Puede ser tu conexión.`,
        reintentable: true,
    };
}

/**
 * Mensaje corto para cuando falla una ACCIÓN, no una carga.
 *
 * Es distinto de `describirFallo`: ahí la sección se queda vacía y hay sitio
 * para un aviso con su botón; aquí la persona pulsó algo y no pasó nada, así
 * que lo que hace falta es una frase que quepa en un toast y diga qué acción
 * se cayó. Sin esto, dar me gusta o mandar un mensaje fallaba en silencio y
 * parecía que el botón no funcionaba.
 *
 * @param {unknown} e
 * @param {string} accion  en infinitivo: "dar me gusta", "enviar el mensaje"
 */
export function mensajeDeAccion(e, accion = "completar la acción") {
    const code = String(e?.code || "").replace(/^(firestore|storage|auth)\//, "");

    if (sinRed() || code === "unavailable" || code === "network-request-failed") {
        return `No se pudo ${accion}. Revisa tu conexión.`;
    }
    switch (code) {
        case "resource-exhausted":
            return "Hay muchísima gente ahora mismo. Intenta de nuevo en un momento.";
        case "unauthenticated":
            return "Tu sesión expiró. Inicia sesión de nuevo.";
        case "permission-denied":
            return `No se pudo ${accion}: no pudimos verificar tu sesión. Si usas un bloqueador, desactívalo en este sitio.`;
        case "deadline-exceeded":
        case "aborted":
            return `No se pudo ${accion}: tardó demasiado. Intenta de nuevo.`;
        default:
            return `No se pudo ${accion}. Intenta de nuevo.`;
    }
}

/** Registra la acción fallida y devuelve el mensaje para mostrar. */
export function registrarAccion(donde, e, accion) {
    console.error(`[accion:${donde}]`, e?.code, e?.message);
    return mensajeDeAccion(e, accion);
}

/**
 * Registra el fallo con un prefijo buscable y devuelve el objeto mostrable.
 * Un solo sitio para las dos cosas, para que no se repita el patrón de
 * "muestro el aviso pero se me olvida dejar rastro en consola".
 * @param {string} donde  p. ej. "propuestas"
 */
export function registrarFallo(donde, e, que) {
    console.error(`[fallo:${donde}]`, e?.code, e?.message);
    return describirFallo(e, que);
}
