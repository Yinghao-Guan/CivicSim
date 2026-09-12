export default function SceneFallback({ loading = false }: { loading?: boolean }) {
  return (
    <div className="scene-fallback" aria-label={loading ? "Loading city twin" : "City twin fallback"}>
      <svg viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="fallbackGlow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1fe4ff" stopOpacity=".72" />
            <stop offset="1" stopColor="#ffba61" stopOpacity=".2" />
          </linearGradient>
        </defs>
        <g className="fallback-grid">
          {Array.from({ length: 15 }, (_, i) => <path d={`M${i * 90 - 40} 0 400 760`} key={`v${i}`} />)}
          {Array.from({ length: 11 }, (_, i) => <path d={`M0 ${i * 78} 1200 ${i * 42 + 120}`} key={`h${i}`} />)}
        </g>
        <g className="fallback-city">
          {Array.from({ length: 44 }, (_, i) => {
            const x = 170 + (i % 11) * 78;
            const y = 210 + Math.floor(i / 11) * 82 + (i % 3) * 8;
            const height = 24 + (i * 17) % 55;
            return <path d={`M${x} ${y} l34 -16 30 15 0 ${height} -34 18 -30 -17Z`} key={i} />;
          })}
        </g>
        <path className="fallback-route" d="M120 580 C330 520 460 410 590 390 S860 320 1080 160" />
        <path className="fallback-route delay" d="M180 180 C390 240 470 350 590 390 S830 500 1040 570" />
      </svg>
      {loading && <span className="scene-loading-label">INITIALIZING CITY TWIN</span>}
    </div>
  );
}
