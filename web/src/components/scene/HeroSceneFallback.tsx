import { HERO_PALETTE } from "@/lib/hero-palette";

const blocks = [
  [-2, -2, .8], [-.9, -2, 1.1], [.4, -2, 1.4], [1.7, -2, .7],
  [-2, -.6, .7], [-.9, -.6, .5], [1.7, -.6, 1.1],
  [-2, .8, .6], [.3, .8, .55],
  [-2, 2, .8], [-.9, 2, .6], [.4, 2, .9], [1.7, 2, .6],
];

// Candidate lots A, B and C; the pin tests A, matching the caption's first site.
const lots = [["A", .4, -.6], ["B", -.9, .8], ["C", 1.7, .8]] as const;

function project(x: number, y: number, z: number) {
  return `${(x - z) * 39},${(x + z) * 17 - y * 44}`;
}

export default function HeroSceneFallback() {
  return (
    <svg className="hero-scene-fallback" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="hero-fallback-fade"><stop stopColor="white" offset=".2" /><stop stopColor="black" offset="1" /></radialGradient>
        <mask id="hero-fallback-mask"><rect width="1280" height="720" fill="url(#hero-fallback-fade)" /></mask>
        <radialGradient id="hero-fallback-heat">
          {[...HERO_PALETTE.heat].reverse().map(({ at, color }) => <stop key={at} stopColor={color} stopOpacity={at === 0 ? 0 : .1 + at * .24} offset={1 - at} />)}
        </radialGradient>
      </defs>
      <g fill="none" stroke={HERO_PALETTE.heat[1].color} strokeWidth=".6" opacity=".3" mask="url(#hero-fallback-mask)">
        {Array.from({ length: 25 }, (_, i) => <path key={`r${i}`} d={`M-50 ${240 + i * 23} Q500 ${175 + i * 17} 1330 ${275 + i * 27}`} />)}
        {Array.from({ length: 29 }, (_, i) => <path key={`c${i}`} d={`M${400 + i * 20} 230 Q${i * 56 - 50} 470 ${i * 86 - 500} 740`} />)}
      </g>
      <g className="hero-fallback-sculpture" transform="translate(940 390)" fill="none" stroke={HERO_PALETTE.building.high} strokeWidth=".9">
        {[-.1, -.7, -1.15].map((height) => <path key={height} opacity={height < -.2 ? .24 : .7} fill={height === -.1 ? HERO_PALETTE.board.slab : "none"} d={`M${project(-3, height, -3)} L${project(3, height, -3)} L${project(3, height, 3)} L${project(-3, height, 3)} Z`} />)}
        <ellipse cx="-40" cy="20" rx="230" ry="100" fill="url(#hero-fallback-heat)" stroke="none" />
        {blocks.map(([x, z, height], i) => <g key={i}>
          <path fill={HERO_PALETTE.building.fill} d={`M${project(x, 0, z)} L${project(x + .7, 0, z)} L${project(x + .7, height, z)} L${project(x, height, z)} Z M${project(x, 0, z)} L${project(x, 0, z + .7)} L${project(x, height, z + .7)} L${project(x, height, z)} Z M${project(x, height, z)} L${project(x + .7, height, z)} L${project(x + .7, height, z + .7)} L${project(x, height, z + .7)} Z`} />
          <circle cx={(x - z) * 39} cy={(x + z) * 17 - height * 44} r="1.5" fill={HERO_PALETTE.building.high} stroke="none" />
        </g>)}
        {lots.map(([label, x, z]) => <g key={label}>
          <path strokeDasharray="4 3" stroke={label === "A" ? HERO_PALETTE.lot.active : HERO_PALETTE.lot.idle} d={`M${project(x, .02, z)} L${project(x + .7, .02, z)} L${project(x + .7, .02, z + .7)} L${project(x, .02, z + .7)} Z`} />
          <text x={(x - z - .7) * 39 - 12} y={(x + z + .7) * 17 + 4} fill={HERO_PALETTE.lot.label} stroke="none" fontSize="10" fontFamily="ui-monospace, monospace">{label}</text>
        </g>)}
        <ellipse cx={(.75 - -.25) * 39} cy={(.75 + -.25) * 17} rx="150" ry="65" stroke={HERO_PALETTE.reach.ring} strokeOpacity=".8" />
        <g transform={`translate(${(.75 - -.25) * 39} ${(.75 + -.25) * 17 - 120})`} stroke={HERO_PALETTE.pin.line} strokeWidth="1.8">
          <path fill={HERO_PALETTE.pin.fill} fillOpacity=".12" d="M0 56 C-14 32 -33 12 -33 -8 A33 33 0 1 1 33 -8 C33 12 14 32 0 56Z" />
          <circle cy="-8" r="13" />
        </g>
      </g>
    </svg>
  );
}
