interface SpeedChartProps {
  speeds: number[];
  color: string;
}

export default function SpeedChart({ speeds, color }: SpeedChartProps) {
  const maxSpeed = Math.max(...speeds, 1);

  return (
    <div className="chart">
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
            {(s / maxSpeed) * 100 > 5 && (
              <span className="value">{s.toFixed(0)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
