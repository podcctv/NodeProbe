import { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(...registerables, ChartDataLabels);

interface SpeedChartProps {
  speeds: number[];
  multi: boolean;
}

export default function SpeedChart({ speeds, multi }: SpeedChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, canvasRef.current.height);
    if (multi) {
      gradient.addColorStop(0, 'rgba(229,58,214,0.95)');
      gradient.addColorStop(1, 'rgba(229,58,214,0.25)');
    } else {
      gradient.addColorStop(0, 'rgba(39,232,229,0.95)');
      gradient.addColorStop(1, 'rgba(39,232,229,0.25)');
    }

    const borderColor = multi ? '#b824a9' : '#16c3bf';

    const labels = speeds.map((_, i) => `${i + 1}`);

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: speeds,
            backgroundColor: gradient,
            borderColor,
            borderWidth: 1.5,
            borderRadius: 5,
            barPercentage: 0.5,
            categoryPercentage: 0.55,
          },
        ],
      },
      options: {
        indexAxis: 'x',
        maintainAspectRatio: false,
        layout: { padding: { left: 8, right: 8, top: 8, bottom: 6 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(0,0,0,.75)',
            borderColor: '#2f9e68',
            borderWidth: 1,
          },
          datalabels: {
            color: '#d7ffe9',
            anchor: 'end',
            align: 'end',
            offset: 4,
            font: { size: 10, weight: 600 },
            formatter: (value: number, context) => {
              const y = context.chart.scales.y.getPixelForValue(value);
              return y < 20 ? '' : value;
            },
          },
        },
        scales: {
          x: {
            type: 'category',
            grid: { display: false },
            ticks: { color: '#9fffcf', font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(26,255,122,.10)' },
            ticks: { color: '#8deabf', font: { size: 11 } },
          },
        },
      },
    });

    return () => chart.destroy();
  }, [speeds, multi]);

  return <canvas ref={canvasRef} className="chart" />;
}

