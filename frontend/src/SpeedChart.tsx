interface SpeedChartProps {
  title: string;
  speeds: number[];
  color: string;
}

export default function SpeedChart({ title, speeds, color }: SpeedChartProps) {
  const width = 300;
  const height = 100;
  const maxSpeed = Math.max(...speeds, 1);
  const points = speeds
    .map((s, i) => {
      const x = (i / Math.max(speeds.length - 1, 1)) * width;
      const y = height - (s / maxSpeed) * height;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <div className="space-y-1">
      <div>{title}</div>
      <svg
        width={width}
        height={height}
        className="bg-black bg-opacity-50 rounded"
      >
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
