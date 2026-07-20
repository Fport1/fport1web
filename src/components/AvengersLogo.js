// Stylized Avengers "A" logo (circle + slanted A + arrow) as inline SVG.
// Inherits color via currentColor so hover states can recolor it.
export default function AvengersLogo({ size = 22, style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden="true"
    >
      {/* Circle with a gap in the upper-left where the A breaks through */}
      <path
        d="M60 14 A52 52 0 1 1 23 30"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        transform="rotate(8 60 66)"
      />
      {/* Left leg of the A (extends past the circle) */}
      <path d="M72 2 L16 118" stroke="currentColor" strokeWidth="13" strokeLinecap="round" />
      {/* Right leg */}
      <path d="M72 2 L90 112" stroke="currentColor" strokeWidth="13" strokeLinecap="round" />
      {/* Crossbar + arrowhead pointing right */}
      <path d="M38 80 L88 80" stroke="currentColor" strokeWidth="11" strokeLinecap="round" />
      <path d="M86 66 L112 80 L86 94 Z" fill="currentColor" />
    </svg>
  )
}
