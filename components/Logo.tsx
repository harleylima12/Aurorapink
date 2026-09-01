/**
 * Alvorada Veículos brandmark, rebuilt as vector art from the official
 * logo so it stays crisp at any size and its curves can be animated
 * (see HeroLoader, where they draw themselves as the frames load).
 *
 * Adapted for dark backgrounds: the original sits on a light grey disc
 * with a black wordmark, which would be invisible on the near-black
 * header. The disc and the black plate are dropped and the lettering is
 * inverted to white — the neon-blue curves, the red target inside the O,
 * the speed lines and the letterspaced VEÍCULOS all carry over.
 */

export const LOGO_AZUL = "#29C5F6";
export const LOGO_VERMELHO = "#E01B24";

/** Path lengths, hardcoded so the draw-on animation needs no measuring. */
export const CURVA_SUPERIOR_LEN = 300;
export const CURVA_INFERIOR_LEN = 210;

export const CURVA_SUPERIOR =
  "M6 116C34 54 94 14 158 12C208 10 240 20 260 32";
export const CURVA_INFERIOR =
  "M196 48C254 40 314 46 348 64C362 72 370 84 372 98";

export default function Logo({
  className,
  /** Drives the draw-on animation; 1 renders the finished mark. */
  progresso = 1,
  /** Dims the lettering while loading, so the curves lead the eye. */
  textoOpacidade = 1,
  title = "Alvorada Veículos",
}: {
  className?: string;
  progresso?: number;
  textoOpacidade?: number;
  title?: string;
}) {
  const p = Math.max(0, Math.min(1, progresso));

  return (
    <svg
      viewBox="0 0 380 152"
      role="img"
      aria-label={title}
      className={className}
    >
      {/* Neon glow, so the blue reads as lit rather than flat. */}
      <defs>
        <filter id="brilho-azul" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g
        fill="none"
        stroke={LOGO_AZUL}
        strokeWidth="9"
        strokeLinecap="round"
        filter="url(#brilho-azul)"
      >
        <path
          d={CURVA_SUPERIOR}
          strokeDasharray={CURVA_SUPERIOR_LEN}
          strokeDashoffset={CURVA_SUPERIOR_LEN * (1 - p)}
        />
        <path
          d={CURVA_INFERIOR}
          strokeWidth="6"
          strokeDasharray={CURVA_INFERIOR_LEN}
          strokeDashoffset={CURVA_INFERIOR_LEN * (1 - p)}
        />
      </g>

      <g opacity={textoOpacidade}>
        <text
          x="150"
          y="112"
          textAnchor="end"
          className="font-display"
          fill="#FFFFFF"
          fontSize="52"
          fontWeight="700"
          letterSpacing="1"
        >
          ALV
        </text>

        {/* The O of ALVORADA, drawn as the logo's red target. */}
        <g transform="translate(170 94)">
          <circle r="18" fill={LOGO_VERMELHO} />
          <circle r="11" fill="#0A0A0A" />
          <circle r="6" fill={LOGO_VERMELHO} />
        </g>

        <text
          x="190"
          y="112"
          textAnchor="start"
          className="font-display"
          fill="#FFFFFF"
          fontSize="52"
          fontWeight="700"
          letterSpacing="1"
        >
          RADA
        </text>

        {/* Speed lines + VEÍCULOS, the logo's lower band without its
            black plate (which would vanish against a dark header). */}
        <g stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round">
          <path d="M96 128h74" />
          <path d="M108 138h62" />
        </g>

        <text
          x="182"
          y="141"
          className="font-display"
          fill="#FFFFFF"
          fontSize="21"
          fontWeight="500"
          letterSpacing="7.5"
        >
          VEÍCULOS
        </text>
      </g>
    </svg>
  );
}
