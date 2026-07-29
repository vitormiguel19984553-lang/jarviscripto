export function Sparkline({
  data,
  positive,
}: {
  data: number[];
  positive: boolean;
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data
    .map((p, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 30 - ((p - min) / span) * 28 - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const stroke = positive ? "var(--success)" : "var(--destructive)";

  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-12 w-full">
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
      <polygon
        points={`0,30 ${pts} 100,30`}
        fill={stroke}
        opacity={0.12}
      />
    </svg>
  );
}
