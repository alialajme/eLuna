type Props = { values: number[]; height?: number };

const WIDTH = 600;

// Hand-rolled inline-SVG line chart (project convention: no chart lib).
export function LineChart({ values, height = 120 }: Props) {
  const max = Math.max(...values, 0);
  const n = values.length;

  // Degenerate cases: no meaningful line — render a flat baseline.
  if (n < 2 || max === 0) {
    return (
      <svg width="100%" height={height} viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
        <line x1="0" y1={height - 1} x2={WIDTH} y2={height - 1} stroke="#e6e2dd" strokeWidth="2" />
      </svg>
    );
  }

  const points = values.map((v, i) => {
    const x = (i / (n - 1)) * WIDTH;
    const y = height - (v / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = points.join(" ");
  const area = `${line} ${WIDTH},${height} 0,${height}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none">
      <polygon points={area} fill="#b3967d" opacity="0.08" />
      <polyline points={line} fill="none" stroke="#b3967d" strokeWidth="2.5" />
    </svg>
  );
}
