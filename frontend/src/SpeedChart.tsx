interface SpeedChartProps {
  title: string;
  speeds: number[];
  color: string;
}

export default function SpeedChart({ title, speeds, color }: SpeedChartProps) {
  const width = 320;
  const height = 100;
  const maxSpeed = Math.max(...speeds, 1);
  const barWidth = width / Math.max(speeds.length, 1);

  return (
    <div className="space-y-1 w-full">
      <div className="flex justify-between items-end">
        <span>{title}</span>
        <span className="text-xs text-gray-300">
          {(speeds[speeds.length - 1] ?? 0).toFixed(2)} Mbps
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-24 bg-black bg-opacity-50 rounded shadow-md"
      >
        {speeds.map((s, i) => {
          const h = (s / maxSpeed) * height;
          return (
            <rect
              key={i}
              x={i * barWidth}
              y={height - h}
              width={Math.max(barWidth - 1, 1)}
              height={h}
              fill={color}
            />
          );
        })}
      </svg>
    </div>
  );
}
