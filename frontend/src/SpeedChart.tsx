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
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderWidth: 1.5,
            borderRadius: 5,
            barPercentage: 0.5,
            categoryPercentage: 0.55,
          },
        ],
      },
      options: {
        indexAxis: 'y',
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
            align: 'right',
            offset: 4,
            font: { size: 10, weight: 600 },
            formatter: (value: number, context) => {
              const x = context.chart.scales.x.getPixelForValue(value);
              return x > context.chart.width - 20 ? '' : value.toFixed(2);
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(26,255,122,.10)' },
            ticks: { color: '#8deabf', font: { size: 11 } },
          },
          y: {
            type: 'category',
            grid: { display: false },
            ticks: { color: '#9fffcf', font: { size: 11 } },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const canvas = canvasRef.current;
    if (!chart || !canvas) return;
    const ctx = chart.ctx;

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    if (multi) {
      gradient.addColorStop(0, 'rgba(229,58,214,0.95)');
      gradient.addColorStop(1, 'rgba(229,58,214,0.25)');
    } else {
      gradient.addColorStop(0, 'rgba(39,232,229,0.95)');
      gradient.addColorStop(1, 'rgba(39,232,229,0.25)');
    }

    const borderColor = multi ? '#b824a9' : '#16c3bf';

    chart.data.labels = speeds.map((_, i) => `${i + 1}`);
    const dataset = chart.data.datasets[0];
    dataset.data = speeds;
    dataset.backgroundColor = gradient;
    dataset.borderColor = borderColor;
    chart.update();
  }, [speeds, multi]);

  return <canvas ref={canvasRef} className="chart w-full h-full" />;
}

