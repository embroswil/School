// Visuels des articles de la boutique : illustrations dessinees (meme style pour tous les etablissements),
// remplacees par la photo de l'etablissement quand il en ajoute une.
const BLEU_CIEL = '#a9d4f5'
const BLEU_CIEL_F = '#7fb6e6'
const MARINE = '#1f3561'
const MARINE_F = '#152645'
const BLANC = '#f8fafc'
const OR = '#f2b93b'

const Ombre = ({ rx = 58 }) => <ellipse cx="100" cy="176" rx={rx} ry="7" fill="#0b1220" opacity="0.16" />

const Ecusson = ({ x, y, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 0h14v9c0 5-3.5 8-7 9.5C3.5 17 0 14 0 9z" fill={MARINE} stroke={OR} strokeWidth="1.4" />
    <path d="M4 6h6M4 9.5h6" stroke={OR} strokeWidth="1.3" strokeLinecap="round" />
  </g>
)

function Chemise({ couleur = BLEU_CIEL, fonce = BLEU_CIEL_F, fille = false }) {
  return (
    <>
      <Ombre />
      <path d="M60 50 82 38q18 12 36 0l22 12 28 32-17 15-11-11v80q0 5-5 5H66q-5 0-5-5V86L50 97 33 82z" fill={couleur} />
      <path d="M140 50l28 32-17 15-11-11z M60 50 33 82l17 15 11-11z" fill={fonce} opacity="0.55" />
      {fille ? (
        <>
          <path d="M82 38q-8 14 2 22 10 4 16 0-8-10-18-22z" fill={BLANC} />
          <path d="M118 38q8 14-2 22-10 4-16 0 8-10 18-22z" fill={BLANC} />
          <path d="M66 120q34 8 68 0" stroke={fonce} strokeWidth="2" fill="none" opacity="0.6" />
        </>
      ) : (
        <>
          <path d="M82 38l18 24-11 9-12-27z" fill={BLANC} />
          <path d="M118 38l-18 24 11 9 12-27z" fill={BLANC} />
        </>
      )}
      <path d="M100 62v114" stroke={fonce} strokeWidth="2" />
      {[82, 102, 122, 142, 162].map((y) => (
        <circle key={y} cx="104.5" cy={y} r="2.2" fill={BLANC} />
      ))}
      {!fille && <rect x="112" y="84" width="20" height="22" rx="2" fill="none" stroke={fonce} strokeWidth="2" />}
      <Ecusson x={fille ? 115 : 115} y={fille ? 84 : 86} s={fille ? 0.9 : 0.85} />
    </>
  )
}

function Pantalon() {
  return (
    <>
      <Ombre rx={48} />
      <path d="M64 34h72l9 138h-36l-9-92-9 92H55z" fill={MARINE} />
      <rect x="64" y="34" width="72" height="11" fill={MARINE_F} />
      {[72, 92, 108, 128].map((x) => (
        <rect key={x} x={x} y="32" width="4" height="15" rx="1" fill={MARINE_F} stroke="#2c4a80" strokeWidth="1" />
      ))}
      <path d="M100 45v35" stroke="#3a5894" strokeWidth="1.6" />
      <path d="M78 52l-4 118M122 52l4 118" stroke="#3a5894" strokeWidth="1.2" opacity="0.7" />
      <path d="M68 52q10 10 20 0M112 52q10 10 20 0" stroke="#3a5894" strokeWidth="1.6" fill="none" />
    </>
  )
}

function Jupe() {
  return (
    <>
      <Ombre rx={62} />
      <rect x="62" y="40" width="76" height="14" rx="3" fill={MARINE_F} />
      <path d="M62 54h76l24 112H38z" fill={MARINE} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const haut = 66 + i * 11
        const bas = 52 + i * 16
        return <path key={i} d={`M${haut} 54 L${bas} 166`} stroke={i % 2 ? '#2c4a80' : MARINE_F} strokeWidth="2.2" />
      })}
      <circle cx="132" cy="47" r="2.4" fill={OR} />
    </>
  )
}

function Pull() {
  return (
    <>
      <Ombre rx={62} />
      <path d="M60 46l24-8 16 26 16-26 24 8 32 74-17 7-15-34v73H60V93l-15 34-17-7z" fill={MARINE} />
      <path d="M84 38l16 26 16-26-6-1-10 16-10-16z" fill={BLANC} />
      <path d="M84 38l16 30 16-30" stroke="#3a5894" strokeWidth="3" fill="none" />
      <rect x="60" y="156" width="80" height="10" fill={MARINE_F} />
      <path d="M45 127l-4-2M155 127l4-2" stroke={MARINE_F} strokeWidth="6" strokeLinecap="round" />
      {[66, 74, 82, 90, 98, 106, 114, 122, 130].map((x) => (
        <path key={x} d={`M${x} 157v8`} stroke="#3a5894" strokeWidth="1.2" />
      ))}
      <Ecusson x={112} y={82} s={0.85} />
    </>
  )
}

function TeeShirt({ x = 0, y = 0, s = 1, short = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {!short && <Ombre rx={56} />}
      <path d="M62 48l24-10q14 12 28 0l24 10 26 26-17 17-11-10v82H64V81l-11 10-17-17z" fill={BLANC} stroke="#d5dde8" strokeWidth="1.5" />
      <path d="M86 38q14 14 28 0" stroke="#2f6bff" strokeWidth="4" fill="none" />
      <path d="M36 74l17 17M164 74l-17 17" stroke="#2f6bff" strokeWidth="5" />
      <Ecusson x={92} y={70} s={1.1} />
    </g>
  )
}

function Sport() {
  return (
    <>
      <Ombre rx={64} />
      <g transform="translate(-22 -8) scale(0.82)">
        <path d="M62 48l24-10q14 12 28 0l24 10 26 26-17 17-11-10v82H64V81l-11 10-17-17z" fill={BLANC} stroke="#d5dde8" strokeWidth="1.5" />
        <path d="M86 38q14 14 28 0" stroke="#2f6bff" strokeWidth="4" fill="none" />
        <path d="M36 74l17 17M164 74l-17 17" stroke="#2f6bff" strokeWidth="5" />
        <Ecusson x={92} y={70} s={1.1} />
      </g>
      <path d="M104 100h58l8 66h-28l-6-34-6 34h-28z" fill={MARINE} />
      <rect x="104" y="100" width="58" height="9" fill={MARINE_F} />
      <path d="M108 112l-4 50M158 112l5 50" stroke="#2f6bff" strokeWidth="3" />
      <path d="M126 104q7 8 14 0" stroke={BLANC} strokeWidth="1.6" fill="none" />
    </>
  )
}

function BlouseLabo() {
  return (
    <>
      <Ombre rx={56} />
      <path d="M62 40l22-6 16 30 16-30 22 6 26 36-15 12-9-9v93H60V79l-9 9-15-12z" fill={BLANC} stroke="#cfd8e3" strokeWidth="1.5" />
      <path d="M84 34l16 30v110M116 34l-16 30" stroke="#cfd8e3" strokeWidth="2" fill="none" />
      <path d="M84 34l-6 40 22 10M116 34l6 40-22 10" fill="#eef2f7" stroke="#cfd8e3" strokeWidth="1.5" />
      {[100, 124, 148].map((y) => (
        <circle key={y} cx="106" cy={y} r="2.4" fill="#b8c4d3" />
      ))}
      <rect x="68" y="128" width="22" height="20" rx="2" fill="none" stroke="#cfd8e3" strokeWidth="2" />
      <rect x="114" y="92" width="20" height="18" rx="2" fill="none" stroke="#cfd8e3" strokeWidth="2" />
      <path d="M120 86v8l-4 10h16l-4-10v-8" fill="#7dd3c0" stroke="#3aa58f" strokeWidth="1.5" />
    </>
  )
}

function EcussonGrand() {
  return (
    <>
      <Ombre rx={40} />
      <path d="M58 40h84v52c0 34-22 52-42 60-20-8-42-26-42-60z" fill={MARINE} stroke={OR} strokeWidth="6" />
      <path d="M72 70h56M72 86h56" stroke={OR} strokeWidth="4" strokeLinecap="round" />
      <path d="M100 98l6 12 13 2-9 9 2 13-12-6-12 6 2-13-9-9 13-2z" fill={OR} />
    </>
  )
}

function Cahier({ couleur, w = 78, h = 104, titre, lignes = true }) {
  const x = 100 - w / 2
  const y = 92 - h / 2
  return (
    <>
      <Ombre rx={w / 2 + 12} />
      <g transform="rotate(-6 100 100)">
        <rect x={x + 8} y={y + 8} width={w} height={h} rx="5" fill="#e9edf3" />
        <rect x={x + 4} y={y + 4} width={w} height={h} rx="5" fill="#f6f8fb" />
        <rect x={x} y={y} width={w} height={h} rx="5" fill={couleur} />
        <rect x={x} y={y} width="9" height={h} rx="3" fill="#000" opacity="0.14" />
        <rect x={x + 18} y={y + 16} width={w - 30} height={h * 0.3} rx="4" fill={BLANC} />
        {lignes && [0.11, 0.19, 0.27].map((p) => <path key={p} d={`M${x + 23} ${y + 16 + h * p}h${w - 40}`} stroke="#c9d3e0" strokeWidth="1.6" />)}
        {titre && (
          <text x={x + w / 2 + 3} y={y + h - 14} textAnchor="middle" fill={BLANC} fontFamily="Inter, Arial, sans-serif" fontWeight="800" fontSize={w > 85 ? 15 : 13}>
            {titre}
          </text>
        )}
      </g>
    </>
  )
}

function Protege() {
  return (
    <>
      <Ombre rx={56} />
      {[
        ['#ff5d73', -14, -10],
        ['#ffc53d', 0, -4],
        ['#38bdf8', 14, 2],
        ['#4ade80', 28, 8],
      ].map(([c, dx, r]) => (
        <rect key={c} x={58 + dx} y={44} width="70" height="98" rx="5" fill={c} opacity="0.62" transform={`rotate(${r} ${93 + dx} 93)`} stroke={c} strokeWidth="2" />
      ))}
    </>
  )
}

function Stylo({ couleur, x, y, r }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M-4 -60h8v104l-4 12-4-12z" fill="#e8eef6" stroke="#c4cfdc" strokeWidth="1" />
      <path d="M-1.4 -56h2.8v96h-2.8z" fill={couleur} opacity="0.9" />
      <path d="M-5 -66h10v26H-5z" fill={couleur} rx="2" />
      <path d="M3 -62h4v22l-2 3-2-3z" fill={couleur} />
      <path d="M-1 56l1 6 1-6z" fill="#334155" />
    </g>
  )
}
function Stylos() {
  return (
    <>
      <Ombre rx={50} />
      <Stylo couleur="#2563eb" x={74} y={110} r={-18} />
      <Stylo couleur="#111827" x={92} y={104} r={-6} />
      <Stylo couleur="#e11d48" x={110} y={104} r={6} />
      <Stylo couleur="#16a34a" x={128} y={110} r={18} />
    </>
  )
}

function Crayon() {
  return (
    <>
      <Ombre rx={56} />
      <g transform="rotate(-38 100 100)">
        <rect x="40" y="90" width="104" height="20" fill="#fbbf24" />
        <path d="M40 90h104v6H40z" fill="#fcd34d" />
        <path d="M40 104h104v6H40z" fill="#f59e0b" />
        <rect x="26" y="90" width="16" height="20" fill="#cbd5e1" />
        <rect x="14" y="90" width="14" height="20" rx="4" fill="#fb7185" />
        <path d="M144 90l26 10-26 10z" fill="#f5d0a9" />
        <path d="M162 97l8 3-8 3z" fill="#334155" />
        <text x="76" y="104.5" fill="#7c4a03" fontFamily="Inter, Arial" fontWeight="800" fontSize="9">HB</text>
      </g>
    </>
  )
}

function Gomme() {
  return (
    <>
      <Ombre rx={46} />
      <g transform="rotate(-12 100 110)">
        <rect x="58" y="88" width="86" height="44" rx="8" fill={BLANC} stroke="#d5dde8" strokeWidth="2" />
        <rect x="88" y="86" width="58" height="48" rx="4" fill="#2f6bff" />
        <path d="M98 100h38M98 110h28" stroke="#fff" strokeWidth="4" strokeLinecap="round" opacity="0.85" />
      </g>
    </>
  )
}

function TailleCrayon() {
  return (
    <>
      <Ombre rx={42} />
      <rect x="62" y="92" width="76" height="66" rx="12" fill="#93c5fd" opacity="0.55" stroke="#60a5fa" strokeWidth="2" />
      <path d="M70 140c10-6 20 2 30-4s22 4 30-2v16H70z" fill="#d6a97a" opacity="0.8" />
      <rect x="74" y="58" width="52" height="40" rx="8" fill="#2f6bff" />
      <circle cx="100" cy="78" r="9" fill="#1e3a8a" />
      <rect x="104" y="64" width="16" height="6" rx="1.5" fill="#cbd5e1" />
    </>
  )
}

function Regle() {
  return (
    <>
      <Ombre rx={64} />
      <g transform="rotate(-24 100 100)">
        <rect x="22" y="84" width="156" height="32" rx="4" fill="#bfe3ff" opacity="0.8" stroke="#7cc0f2" strokeWidth="2" />
        {Array.from({ length: 31 }, (_, i) => (
          <path key={i} d={`M${28 + i * 4.8} 84v${i % 5 === 0 ? 12 : 6}`} stroke="#1f3561" strokeWidth="1.2" />
        ))}
        <text x="100" y="110" textAnchor="middle" fill="#1f3561" fontFamily="Inter, Arial" fontWeight="700" fontSize="9">30 cm</text>
      </g>
    </>
  )
}

function BoiteMaths() {
  return (
    <>
      <Ombre rx={62} />
      <rect x="40" y="96" width="120" height="66" rx="8" fill="#334155" />
      <rect x="46" y="102" width="108" height="54" rx="5" fill="#1e293b" />
      <path d="M56 148l40-38v38z" fill="#bfe3ff" opacity="0.85" stroke="#7cc0f2" strokeWidth="1.5" />
      <path d="M104 148a24 24 0 0 1 48 0z" fill="#fde68a" opacity="0.9" stroke="#f59e0b" strokeWidth="1.5" />
      <g transform="rotate(14 120 70)">
        <path d="M120 30l-16 80M120 30l16 80" stroke="#cbd5e1" strokeWidth="5" strokeLinecap="round" />
        <circle cx="120" cy="30" r="7" fill="#94a3b8" />
        <path d="M136 110l2 8" stroke="#334155" strokeWidth="3" />
      </g>
      <rect x="40" y="62" width="120" height="30" rx="6" fill="#475569" transform="rotate(-10 40 92)" />
    </>
  )
}

function Couleurs() {
  const c = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']
  return (
    <>
      <Ombre rx={56} />
      {c.map((k, i) => (
        <g key={k} transform={`translate(${56 + i * 12} 0)`}>
          <rect x="0" y="44" width="10" height="70" fill={k} />
          <path d="M0 44l5-16 5 16z" fill="#f5d0a9" />
          <path d="M3.3 33.5l1.7-5.5 1.7 5.5z" fill={k} />
        </g>
      ))}
      <rect x="48" y="96" width="104" height="68" rx="6" fill="#2f6bff" />
      <rect x="58" y="112" width="84" height="34" rx="5" fill={BLANC} />
      <text x="100" y="134" textAnchor="middle" fill="#2f6bff" fontFamily="Inter, Arial" fontWeight="800" fontSize="13">12 couleurs</text>
    </>
  )
}

function Surligneurs() {
  return (
    <>
      <Ombre rx={52} />
      {[
        ['#facc15', 70, -14],
        ['#f472b6', 100, 0],
        ['#4ade80', 130, 14],
      ].map(([c, x, r]) => (
        <g key={c} transform={`translate(${x} 104) rotate(${r})`}>
          <rect x="-13" y="-48" width="26" height="80" rx="7" fill={c} />
          <rect x="-13" y="-48" width="26" height="26" rx="7" fill="#0f172a" opacity="0.18" />
          <path d="M-8 32h16l-4 16h-8z" fill={c} />
          <rect x="-9" y="-8" width="18" height="22" rx="3" fill="#fff" opacity="0.55" />
        </g>
      ))}
    </>
  )
}

function Colle() {
  return (
    <>
      <Ombre rx={34} />
      <rect x="78" y="70" width="44" height="98" rx="8" fill={BLANC} stroke="#d5dde8" strokeWidth="2" />
      <rect x="76" y="40" width="48" height="36" rx="8" fill="#f97316" />
      <rect x="84" y="96" width="32" height="44" rx="4" fill="#f97316" opacity="0.85" />
      <text x="100" y="122" textAnchor="middle" fill="#fff" fontFamily="Inter, Arial" fontWeight="800" fontSize="11">COLLE</text>
    </>
  )
}

function Ciseaux() {
  return (
    <>
      <Ombre rx={50} />
      <g transform="rotate(-30 100 100)">
        <path d="M100 96L176 82l-2 8z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="1" />
        <path d="M100 104L176 118l-2-8z" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" />
        <circle cx="100" cy="100" r="4" fill="#64748b" />
        <ellipse cx="66" cy="84" rx="24" ry="16" fill="none" stroke="#2f6bff" strokeWidth="9" />
        <ellipse cx="66" cy="118" rx="24" ry="16" fill="none" stroke="#2f6bff" strokeWidth="9" />
      </g>
    </>
  )
}

function Calculatrice() {
  return (
    <>
      <Ombre rx={44} />
      <rect x="62" y="30" width="76" height="140" rx="12" fill="#1f2937" />
      <rect x="72" y="42" width="56" height="26" rx="4" fill="#bbd7b4" />
      <text x="122" y="61" textAnchor="end" fill="#1f2937" fontFamily="Courier New, monospace" fontWeight="700" fontSize="13">3,14</text>
      {Array.from({ length: 20 }, (_, i) => {
        const col = i % 4
        const row = Math.floor(i / 4)
        return <rect key={i} x={72 + col * 14.5} y={78 + row * 17} width="11" height="12" rx="3" fill={i === 19 ? '#2f6bff' : row === 0 ? '#6b7280' : '#374151'} />
      })}
    </>
  )
}

function Copies() {
  return (
    <>
      <Ombre rx={62} />
      {[8, 4, 0].map((d) => (
        <g key={d} transform={`rotate(${d - 4} 100 100)`}>
          <rect x={46 + d} y={36 + d} width="104" height="132" rx="3" fill={BLANC} stroke="#d5dde8" strokeWidth="1.5" />
        </g>
      ))}
      <g transform="rotate(-4 100 100)">
        <path d="M64 36v132" stroke="#ef4444" strokeWidth="1.6" />
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d={`M46 ${50 + i * 10}h104`} stroke="#93c5fd" strokeWidth="1" />
        ))}
      </g>
    </>
  )
}

function Millimetre() {
  return (
    <>
      <Ombre rx={56} />
      <g transform="rotate(5 100 100)">
        <rect x="48" y="32" width="104" height="136" rx="2" fill="#fffaf0" stroke="#fed7aa" strokeWidth="1.5" />
        {Array.from({ length: 21 }, (_, i) => (
          <path key={`v${i}`} d={`M${48 + i * 5.2} 32v136`} stroke="#fb923c" strokeWidth={i % 5 === 0 ? 1 : 0.4} />
        ))}
        {Array.from({ length: 27 }, (_, i) => (
          <path key={`h${i}`} d={`M48 ${32 + i * 5.2}h104`} stroke="#fb923c" strokeWidth={i % 5 === 0 ? 1 : 0.4} />
        ))}
        <path d="M58 150q30-10 46-50t42-56" stroke="#2f6bff" strokeWidth="2.4" fill="none" />
      </g>
    </>
  )
}

function ChemiseCarton() {
  return (
    <>
      <Ombre rx={60} />
      <path d="M44 56h48l8 10h56v100H44z" fill="#f59e0b" />
      <path d="M44 74h112v92H44z" fill="#fbbf24" />
      <path d="M44 166l14-84h112l-14 84z" fill="#fcd34d" />
      <path d="M60 140l8-44" stroke="#111827" strokeWidth="4" strokeLinecap="round" opacity="0.7" />
    </>
  )
}

function Rame() {
  return (
    <>
      <Ombre rx={62} />
      <path d="M40 92l60-26 60 26v46l-60 26-60-26z" fill={BLANC} stroke="#d5dde8" strokeWidth="1.5" />
      <path d="M40 92l60 26 60-26" stroke="#d5dde8" strokeWidth="1.5" fill="none" />
      <path d="M100 118v46" stroke="#d5dde8" strokeWidth="1.5" />
      <path d="M68 80l60 26v46l-60-26z" fill="#2f6bff" opacity="0.92" />
      <path d="M40 92l28-12 60 26-28 12z" fill="#5b8cff" />
      <text x="0" y="0" transform="translate(81 117) skewY(23)" fill="#fff" fontFamily="Inter, Arial" fontWeight="800" fontSize="16">A4</text>
      <text x="0" y="0" transform="translate(80 132) skewY(23)" fill="#fff" fontFamily="Inter, Arial" fontWeight="700" fontSize="9">500 feuilles</text>
    </>
  )
}

function Dictionnaire({ couleur, accent, code }) {
  return (
    <>
      <Ombre rx={48} />
      <path d="M58 40h76a6 6 0 0 1 6 6v118a6 6 0 0 1-6 6H58z" fill={couleur} />
      <path d="M140 46v118a6 6 0 0 1-6 6h8a6 6 0 0 0 6-6V52a6 6 0 0 0-6-6z" fill="#f1f5f9" />
      <path d="M58 40h12v130H58z" fill="#000" opacity="0.18" />
      <rect x="78" y="58" width="48" height="5" rx="2.5" fill={accent} />
      <rect x="78" y="146" width="48" height="5" rx="2.5" fill={accent} />
      <text x="102" y="118" textAnchor="middle" fill="#fff" fontFamily="Inter, Arial" fontWeight="900" fontSize="30">{code}</text>
    </>
  )
}

function Sac() {
  return (
    <>
      <Ombre rx={52} />
      <path d="M78 46q22-26 44 0" stroke={MARINE_F} strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d="M56 70q0-26 44-26t44 26v92q0 8-8 8H64q-8 0-8-8z" fill={MARINE} />
      <path d="M70 116h60q6 0 6 6v34q0 6-6 6H70q-6 0-6-6v-34q0-6 6-6z" fill="#2c4a80" />
      <path d="M64 128h72" stroke={OR} strokeWidth="2" />
      <rect x="94" y="122" width="12" height="12" rx="2" fill={OR} />
      <Ecusson x={93} y={72} s={1} />
    </>
  )
}

const DESSINS = {
  chemise: () => <Chemise />,
  corsage: () => <Chemise fille />,
  pantalon: () => <Pantalon />,
  jupe: () => <Jupe />,
  pull: () => <Pull />,
  sport: () => <Sport />,
  teeshirt: () => <TeeShirt />,
  blouse: () => <BlouseLabo />,
  ecusson: () => <EcussonGrand />,
  c100: () => <Cahier couleur="#16a34a" titre="100 p." w={70} h={94} />,
  c200: () => <Cahier couleur="#e11d48" titre="200 p." w={74} h={98} />,
  g200: () => <Cahier couleur="#2563eb" titre="200 p." w={92} h={118} />,
  g300: () => <Cahier couleur="#7c3aed" titre="300 p." w={94} h={120} />,
  tp: () => <Cahier couleur="#ea580c" titre="TP" w={84} h={110} />,
  dessin: () => <Cahier couleur="#ca8a04" titre="Dessin" w={110} h={84} lignes={false} />,
  textes: () => <Cahier couleur="#0d9488" titre="Textes" w={78} h={104} />,
  cahier: () => <Cahier couleur="#2563eb" w={80} h={106} />,
  protege: () => <Protege />,
  stylos: () => <Stylos />,
  crayon: () => <Crayon />,
  gomme: () => <Gomme />,
  taille: () => <TailleCrayon />,
  regle: () => <Regle />,
  maths: () => <BoiteMaths />,
  couleurs: () => <Couleurs />,
  surligneurs: () => <Surligneurs />,
  colle: () => <Colle />,
  ciseaux: () => <Ciseaux />,
  calc: () => <Calculatrice />,
  copies: () => <Copies />,
  milli: () => <Millimetre />,
  classeur: () => <ChemiseCarton />,
  rame: () => <Rame />,
  dico_fr: () => <Dictionnaire couleur="#dc2626" accent="#fde047" code="FR" />,
  dico_en: () => <Dictionnaire couleur="#1d4ed8" accent="#f8fafc" code="EN" />,
  dico_de: () => <Dictionnaire couleur="#111827" accent="#facc15" code="DE" />,
  dico_es: () => <Dictionnaire couleur="#b91c1c" accent="#facc15" code="ES" />,
  livre: () => <Dictionnaire couleur="#7c3aed" accent="#f8fafc" code="Aa" />,
  sac: () => <Sac />,
}

const sansAccent = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

// Le dessin qui correspond le mieux au nom de l'article
export function visuelDe(nom, categorie) {
  const n = sansAccent(nom)
  const regles = [
    [/blouse|labo/, 'blouse'],
    [/protege/, 'protege'],
    [/corsage/, 'corsage'],
    [/chemise carton|chemise a rabat|classeur|pochette carton/, 'classeur'],
    [/chemise/, 'chemise'],
    [/pantalon/, 'pantalon'],
    [/jupe|robe/, 'jupe'],
    [/pull|gilet/, 'pull'],
    [/tenue de sport|survetement|jogging/, 'sport'],
    [/tee|t-shirt|polo|maillot/, 'teeshirt'],
    [/ecusson|badge|insigne/, 'ecusson'],
    [/travaux pratiques|\btp\b/, 'tp'],
    [/dessin/, 'dessin'],
    [/cahier de texte|agenda/, 'textes'],
    [/300 pages|400 pages/, 'g300'],
    [/grand format/, 'g200'],
    [/200 pages/, 'c200'],
    [/100 pages|50 pages|cahier/, 'c100'],
    [/stylo|bic/, 'stylos'],
    [/crayons? de couleur|feutre/, 'couleurs'],
    [/taille/, 'taille'],
    [/crayon/, 'crayon'],
    [/gomme/, 'gomme'],
    [/regle/, 'regle'],
    [/math|compas|equerre|rapporteur|geometrie/, 'maths'],
    [/surligneur|fluo/, 'surligneurs'],
    [/colle/, 'colle'],
    [/ciseau/, 'ciseaux'],
    [/calcul/, 'calc'],
    [/millimetr/, 'milli'],
    [/copie|feuille/, 'copies'],
    [/rame|ramette|papier a4|papier/, 'rame'],
    [/allemand/, 'dico_de'],
    [/espagnol/, 'dico_es'],
    [/anglais/, 'dico_en'],
    [/dictionnaire|larousse|francais/, 'dico_fr'],
    [/sac|cartable/, 'sac'],
  ]
  for (const [re, k] of regles) if (re.test(n)) return k
  return categorie === 'tenue' ? 'teeshirt' : categorie === 'livres' ? 'livre' : categorie === 'autre' ? 'sac' : 'cahier'
}

// Image d'un article : la photo de l'etablissement, sinon l'illustration
export function VisuelArticle({ article, className = '' }) {
  const cat = article.categorie || 'fournitures'
  if (article.image)
    return (
      <span className={`bq-visuel photo ${className}`}>
        <img src={article.image} alt="" loading="lazy" />
      </span>
    )
  const D = DESSINS[visuelDe(article.nom, cat)] || DESSINS.cahier
  return (
    <span className={`bq-visuel fond-${cat} ${className}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <D />
      </svg>
    </span>
  )
}
