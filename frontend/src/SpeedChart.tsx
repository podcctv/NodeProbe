interface SpeedChartProps {
  title: string;
  speeds: number[];
  color: string;
}

export default function SpeedChart({ title, speeds, color }: SpeedChartProps) {
  const maxSpeed = Math.max(...speeds, 1);

  return (
    <div className="space-y-1 w-full border border-[rgba(0,255,0,0.2)] p-2 rounded bg-black/50 shadow-[0_0_10px_rgba(0,255,0,0.1)]">
      <div className="flex justify-between items-center">
        <span className="font-bold">{title}</span>
        <span className="text-xs text-gray-300">
          {(speeds[speeds.length - 1] ?? 0).toFixed(2)} Mbps
        </span>
      </div>
      <div className="speedtest__chart">
        <div className="bars">
          {speeds.map((s, i) => (
            <div
              key={i}
              className="bar"
              style={{
                height: `${(s / maxSpeed) * 100}%`,
                background: color,
                borderColor: color,
              }}
            >
              <span className="value">{s.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
