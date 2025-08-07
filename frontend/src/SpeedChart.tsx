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
      <div className="flex items-center">
        <svg
          width={width}
          height={height}
          className="bg-black bg-opacity-50 rounded shadow-md"
        >
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'all 1s ease' }}
          />
        </svg>
        <div className="flex items-center ml-2 space-x-1 text-xs text-gray-300">
          <span
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span>{title}</span>
        </div>
      </div>
    </div>
  );
}
