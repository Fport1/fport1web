// src/lib/twemoji.js
// Renderiza emojis como imágenes Twemoji (el set open-source que usa X/Twitter).
// Soluciona que Windows muestre las banderas como "CO/AR/MX" y da un diseño
// consistente en toda la app (incluida la pistola realista, como en X).
//
// No requiere dependencias: construimos la URL del CDN a partir de los
// codepoints, aplicando la misma regla de nombres que usa la librería oficial.

import React from "react";

const CDN = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg";
const U200D = "‍"; // zero-width joiner
const UFE0Fg = /️/g; // variation selector-16

// Convierte un string de emoji en su nombre de archivo Twemoji (codepoints en hex).
function toCodePoint(str, sep = "-") {
  const r = [];
  let p = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (p) {
      r.push((0x10000 + ((p - 0xd800) << 10) + (c - 0xdc00)).toString(16));
      p = 0;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      p = c;
    } else {
      r.push(c.toString(16));
    }
  }
  return r.join(sep);
}

// Regla oficial de Twemoji: si NO hay ZWJ, se quita el FE0F antes de calcular.
function emojiToFilename(emoji) {
  const s = emoji.indexOf(U200D) < 0 ? emoji.replace(UFE0Fg, "") : emoji;
  return toCodePoint(s);
}

export function twemojiUrl(emoji) {
  return `${CDN}/${emojiToFilename(emoji)}.svg`;
}

// Componente para un emoji suelto (p. ej. en el picker o reacciones).
export function TwemojiImg({ emoji, className = "", size = "1em", alt }) {
  return (
    <img
      src={twemojiUrl(emoji)}
      alt={alt ?? emoji}
      draggable={false}
      loading="lazy"
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        verticalAlign: "-0.125em",
        objectFit: "contain",
      }}
      onError={(e) => {
        // Si Twemoji no tiene ese glifo, mostramos el emoji nativo como respaldo.
        const span = document.createElement("span");
        span.textContent = emoji;
        e.currentTarget.replaceWith(span);
      }}
    />
  );
}

// Detecta secuencias de emoji (pictogramas + ZWJ + banderas/regional indicators + keycaps).
const EMOJI_RE = (() => {
  try {
    return new RegExp(
      "(" +
        // banderas: dos indicadores regionales
        "\\p{Regional_Indicator}\\p{Regional_Indicator}" +
        "|" +
        // keycaps: dígito/#/* + FE0F? + 20E3
        "[0-9#*]\\uFE0F?\\u20E3" +
        "|" +
        // pictograma con posibles modificadores y secuencias ZWJ
        "\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\p{Emoji_Modifier})?" +
        "(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\uFE0E)?(?:\\p{Emoji_Modifier})?)*" +
        ")",
      "gu"
    );
  } catch {
    return null;
  }
})();

// Convierte un texto en nodos React, reemplazando cada emoji por su imagen Twemoji.
// Úsalo para renderizar mensajes/comentarios con emojis consistentes.
export function EmojiText({ children, size = "1.15em", className }) {
  const text = typeof children === "string" ? children : String(children ?? "");
  if (!text || !EMOJI_RE) return <>{text}</>;

  const nodes = [];
  let last = 0;
  let m;
  EMOJI_RE.lastIndex = 0;
  while ((m = EMOJI_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const e = m[0];
    nodes.push(<TwemojiImg key={`${m.index}-${e}`} emoji={e} size={size} className={className} />);
    last = m.index + e.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes.map((n, i) => (typeof n === "string" ? <React.Fragment key={i}>{n}</React.Fragment> : n))}</>;
}
