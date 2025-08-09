import { useEffect, useState, useRef, useMemo } from 'react';
import SpeedChart from './SpeedChart';
import TestSection from './TestSection';

interface TestRecord {
  id: number;
  timestamp: string;
  client_ip?: string | null;
  location?: string | null;
  asn?: string | null;
  isp?: string | null;
  ping_ms?: number | null;
  ping_min_ms?: number | null;
  ping_max_ms?: number | null;
  single_dl_mbps?: number | null;
  single_ul_mbps?: number | null;
  multi_dl_mbps?: number | null;
  multi_ul_mbps?: number | null;
  mtr_result?: string | null;
  iperf_result?: string | null;
  test_target?: string | null;
}

interface TestsResponse {
  message?: string;
  records: TestRecord[];
}

function maskIp(ip?: string | null) {
  if (!ip) return '';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.***.***.${parts[3]}`;
  }
  return ip;
}

function maskIpMd(ip?: string | null) {
  if (!ip) return '';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.xx.xx.${parts[3]}`;
  }
  return ip;
}

function maskIpsInText(text: string) {
  return text.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/g, (_m, a, _b, _c, d) => `${a}.xx.xx.${d}`);
}

function getPingColor(ping: number) {
  if (ping < 50) return 'text-green-400';
  if (ping < 100) return 'text-yellow-400';
  return 'text-red-400';
}

function getSpeedColor(speed: number) {
  if (speed < 100) return 'text-red-400';
  if (speed < 500) return 'text-yellow-400';
  return 'text-green-400';
}

const RISKY = /[\u0300-\u036F]|\u3000|[\uFF00-\uFF65]/g;
function sanitizeBanner(s: string): string {
  return s.normalize('NFKC').replace(RISKY, '');
}

const ASCII_LOGO = sanitizeBanner([
  "__      _______   _____ _______ ______          ___   _",
  "\\ \\    / /  __ \\ / ____|__   __/ __ \\ \\        / / \\ | |",
  " \\ \\  / /| |__) | (___    | | | |  | \\ \\  /\\  / /|  \\| |",
  "  \\ \\/ / |  ___/ \\___ \\   | | | |  | |\\ \\/  \\/ / | . ` |",
  "   \\  /  | |     ____) |  | | | |__| | \\  /\\  /  | |\\  |",
  "    \\/   |_|    |_____(_) |_|  \\____/   \\/  \\/   |_| \\_|",
  "",
  "_   _           _        _____           _",
  "| \\ | |         | |      |  __ \\         | |",
  "|  \\| | ___   __| | ___  | |__) | __ ___ | |__   ___",
  "| . ` |/ _ \\ / _` |/ _ \\ |  ___/ '__/ _ \\| '_ \\ / _ \\",
  "| |\\  | (_) | (_| |  __/ | |   | | | (_) | |_) |  __/",
  "|_| \\_|\\___/ \\__,_|\\___| |_|   |_|  \\___/|_.__/ \\___|"
].join('\n'));

function AsciiLogo() {
    return (
      <pre
        className="mb-2 overflow-hidden whitespace-pre font-mono w-[80ch] mx-auto text-left"
        style={{
        textShadow: '0 0 6px rgba(0,255,0,0.25)',
        fontVariantLigatures: 'none',
        fontKerning: 'none',
        letterSpacing: 0,
        tabSize: 4,
        fontSize: '28px',
        lineHeight: '28px',
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'geometricPrecision',
        WebkitTextSizeAdjust: '100%',
        textSizeAdjust: '100%',
      }}
    >
      {ASCII_LOGO}
    </pre>
  );
}

function App() {
  const [info, setInfo] = useState<TestRecord | null>(null);
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [recordsMessage, setRecordsMessage] = useState<string | null>(null);
  const [pingOutput, setPingOutput] = useState<string | null>(null);
  const [traceOutput, setTraceOutput] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<keyof TestRecord | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [showPingFull, setShowPingFull] = useState(false);
  const [showTraceFull, setShowTraceFull] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const html = document.documentElement;
    if (loading) {
      html.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      html.style.overflow = 'auto';
      document.body.style.overflow = 'auto';
    }
  }, [loading]);

  const sortedRecords = useMemo(() => {
    const arr = [...records];
    if (sortKey) {
      arr.sort((a, b) => {
        const av = (a[sortKey] as number | string | null) ?? 0;
        const bv = (b[sortKey] as number | string | null) ?? 0;
        if (av < bv) return sortAsc ? -1 : 1;
        if (av > bv) return sortAsc ? 1 : -1;
        return 0;
      });
    }
    return arr;
  }, [records, sortKey, sortAsc]);

  const handleSort = (key: keyof TestRecord) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const loadRecords = async () => {
    try {
      const res = await fetch('/tests');
      const data: TestsResponse = await res.json();
      const filtered = (data.records || []).filter(
        (r) =>
          r.client_ip &&
          (typeof r.ping_ms === 'number' ||
            typeof r.single_dl_mbps === 'number' ||
            typeof r.single_ul_mbps === 'number' ||
            typeof r.multi_dl_mbps === 'number' ||
            typeof r.multi_ul_mbps === 'number')
      );

      const sorted = filtered.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setRecords(sorted);
      if (sorted.length > 0) {
        setInfo(sorted[0]);
      }
      if (data.message) {
        setRecordsMessage(data.message);
      }
      return sorted;
    } catch (err) {
      console.error('Failed to load previous tests', err);
      return [];
    }
  };


  const [downloadProgress, setDownloadProgress] = useState({
    transferred: 0,
    size: 0,
  });
  const [uploadProgress, setUploadProgress] = useState({
    transferred: 0,
    size: 0,
  });
  type SpeedEntry = { down: number; up: number };
  interface SpeedResult {
    single: SpeedEntry | null;
    multi: SpeedEntry | null;
  }
  const [speedResult, setSpeedResult] = useState<SpeedResult>({
    single: null,
    multi: null,
  });
  const [downloadSpeeds, setDownloadSpeeds] = useState<number[]>([]);
  const [uploadSpeeds, setUploadSpeeds] = useState<number[]>([]);
  const [currentDownloadSpeed, setCurrentDownloadSpeed] = useState(0);
  const [currentUploadSpeed, setCurrentUploadSpeed] = useState(0);
  const [speedRunning, setSpeedRunning] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [currentThreads, setCurrentThreads] = useState(1);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const generateMarkdown = () => {
    const maskedIp = maskIpMd(info?.client_ip);
    const pingText = pingOutput ? maskIpsInText(pingOutput) : '';
    const traceText = traceOutput ? maskIpsInText(traceOutput) : '';
    const singleDown = info?.single_dl_mbps?.toFixed(2) ?? '';
    const singleUp = info?.single_ul_mbps?.toFixed(2) ?? '';
    const multiDown = info?.multi_dl_mbps?.toFixed(2) ?? '';
    const multiUp = info?.multi_ul_mbps?.toFixed(2) ?? '';
    return `#VPS.TOWN NODE Probe\n\n##Your Connection Info\nIP: ${maskedIp}\nLocation: ${info?.location || 'Unknown'}\nASN: ${info?.asn || 'Unknown'}\nISP: ${info?.isp || 'Unknown'}\n\n##Auto Ping Test\n\n\u0060\u0060\u0060\n${pingText}\n\u0060\u0060\u0060\n\n##Traceroute\n\n\u0060\u0060\u0060\n${traceText}\n\u0060\u0060\u0060\n\n##Speed TEST\n\n|Type|Download (Mbps)|Upload (Mbps)|\n|---|---|---|\n|Single Thread|${singleDown}|${singleUp}|\n|Eight Threads|${multiDown}|${multiUp}|\n`;
  };

  const copyMarkdown = async () => {
    try {
      const md = generateMarkdown();
      await navigator.clipboard.writeText(md);
      alert('Markdown copied to clipboard');
    } catch (err) {
      console.error('Copy failed', err);
      alert('Copy failed');
    }
  };

  const downloadControllers = useRef<AbortController[]>([]);
  const uploadXhrs = useRef<XMLHttpRequest[]>([]);

  const hasRunInitial = useRef(false);
  useEffect(() => {
    if (hasRunInitial.current) return;
    hasRunInitial.current = true;
    runInitialTests();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const runInitialTests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/tests?skip_ping=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data: TestRecord = await res.json();
      setInfo({
        id: data.id,
        timestamp: data.timestamp,
        client_ip: data.client_ip,
        location: data.location,
        asn: data.asn,
        isp: data.isp,
        ping_ms: data.ping_ms,
        ping_min_ms: data.ping_min_ms,
        ping_max_ms: data.ping_max_ms,
      });
      if (data?.client_ip) {
        const steps = [
          { msg: 'Ping', fn: () => runPing(data.client_ip!) },
          { msg: 'Traceroute', fn: () => runTraceroute(data.client_ip!, true) },
          {
            msg: 'Speedtest',
            fn: async () => {
              await runSpeedtest(100 * 1024 * 1024, 50 * 1024 * 1024, 8);
              await runSpeedtest(100 * 1024 * 1024, 50 * 1024 * 1024, 1);
            },
          },
        ];
        for (let i = 0; i < steps.length; i++) {
          setLoadingMsg(`正在进行 ${steps[i].msg} 测试 (${i + 1}/${steps.length})...`);
          await steps[i].fn();
        }
      }
    } catch (err) {
      console.error('Failed to run initial tests', err);
    } finally {
      loadRecords().catch((err) => console.error('Failed to load previous tests', err));
      setLoading(false);
    }
  };



  const runPing = async (host: string) => {
    setPingOutput('Running...');
    try {
      const res = await fetch(`/ping?host=${encodeURIComponent(host)}&count=10`);
      const data = await res.json();
      setPingOutput(data.output || data.error || 'No output');
      if (typeof data.ping_ms === 'number') {
        try {
          await fetch('/tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ping_ms: data.ping_ms,
              ping_min_ms: data.ping_min_ms,
              ping_max_ms: data.ping_max_ms,
            }),
          });
        } catch (e) {
          console.error('Failed to record ping result', e);
        }
        setInfo((prev) =>
          prev
            ? {
                ...prev,
                ping_ms: data.ping_ms,
                ping_min_ms: data.ping_min_ms,
                ping_max_ms: data.ping_max_ms,
              }
            : prev
        );
      }
    } catch (err) {
      console.error('Ping failed', err);
      setPingOutput('Ping failed');
    }
  };
  const runTraceroute = async (host: string, record = false) => {
    setTraceOutput('Running...');
    try {
      const res = await fetch(`/traceroute?host=${encodeURIComponent(host)}`);
      const data = await res.json();
      const output = data.output || data.error || 'No output';
      setTraceOutput(output);
      if (record) {
        await fetch('/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test_target: host, mtr_result: output }),
        });
      }
    } catch (err) {
      console.error('Traceroute failed', err);
      setTraceOutput('Traceroute failed');
    }
  };

  function formatProgress(p: { transferred: number; size: number }) {
    if (!p.size) return '';
    const transferredMB = (p.transferred / 1024 / 1024).toFixed(2);
    const sizeMB = (p.size / 1024 / 1024).toFixed(0);
    const fraction = p.transferred / p.size;
    const percent = (fraction * 100).toFixed(0);
    const barLen = 20;
    const filled = Math.round(fraction * barLen);
    const bar = `[${'#'.repeat(filled)}${'-'.repeat(barLen - filled)}]`;
    return `${bar} ${transferredMB}M/${sizeMB}M ${percent}%`;
  }

  async function downloadWithProgress(size: number, threads = 1) {
    setDownloadProgress({ transferred: 0, size });
    setDownloadSpeeds([]);
    setCurrentDownloadSpeed(0);
    if (threads === 1) {
      const controller = new AbortController();
      downloadControllers.current.push(controller);
      const res = await fetch(`/speedtest/download?size=${size}`, {
        signal: controller.signal,
      });
      const reader = res.body?.getReader();
      if (!reader) return 0;
      let received = 0;
      const start = performance.now();
      let intervalStart = start;
      let intervalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        const now = performance.now();
        if (done) break;
        received += value.length;
        setDownloadProgress({ transferred: received, size });
        intervalBytes += value.length;
        if (now - intervalStart >= 1000) {
          const speed = (intervalBytes * 8) / (now - intervalStart) / 1000;
          setCurrentDownloadSpeed((p) => p * 0.5 + speed * 0.5);
          setDownloadSpeeds((s) => [...s.slice(-99), speed]);
          intervalBytes = 0;
          intervalStart = now;
        }
      }
      const end = performance.now();
      const speed = (size * 8) / (end - start) / 1000;
      setCurrentDownloadSpeed(speed);
      setDownloadSpeeds((s) => [...s.slice(-99), speed]);
      return speed;
    }

    const chunkSize = Math.floor(size / threads);
    let received = 0;
    const start = performance.now();
    let intervalStart = start;
    let intervalBytes = 0;
    const tasks = [] as Promise<void>[];
    for (let i = 0; i < threads; i++) {
      const controller = new AbortController();
      downloadControllers.current.push(controller);
      tasks.push(
        fetch(`/speedtest/download?size=${chunkSize}`, {
          signal: controller.signal,
        }).then(async (res) => {
          const reader = res.body?.getReader();
          if (!reader) return;
          while (true) {
            const { done, value } = await reader.read();
            const now = performance.now();
            if (done) break;
            received += value.length;
            setDownloadProgress({ transferred: received, size });
            intervalBytes += value.length;
            if (now - intervalStart >= 1000) {
              const speed = (intervalBytes * 8) / (now - intervalStart) / 1000;
              setCurrentDownloadSpeed((p) => p * 0.5 + speed * 0.5);
              setDownloadSpeeds((s) => [...s.slice(-99), speed]);
              intervalBytes = 0;
              intervalStart = now;
            }
          }
        })
      );
    }
    await Promise.all(tasks);
    const end = performance.now();
    const speed = (size * 8) / (end - start) / 1000;
    setCurrentDownloadSpeed(speed);
    setDownloadSpeeds((s) => [...s.slice(-99), speed]);
    return speed;
  }

  function uploadWithProgress(size: number, threads = 1) {
    setUploadProgress({ transferred: 0, size });
    setUploadSpeeds([]);
    setCurrentUploadSpeed(0);
    if (threads === 1) {
      return new Promise<number>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        uploadXhrs.current.push(xhr);
        const start = performance.now();
        let lastLoaded = 0;
        let intervalStart = start;
        let intervalBytes = 0;
        xhr.open('POST', '/speedtest/upload');
        xhr.upload.onprogress = (e) => {
          setUploadProgress({ transferred: e.loaded, size });
          const now = performance.now();
          const loadedDiff = e.loaded - lastLoaded;
          intervalBytes += loadedDiff;
          if (now - intervalStart >= 1000 && intervalBytes > 0) {
            const speed = (intervalBytes * 8) / (now - intervalStart) / 1000;
            setCurrentUploadSpeed((p) => p * 0.5 + speed * 0.5);
            setUploadSpeeds((s) => [...s.slice(-99), speed]);
            intervalBytes = 0;
            intervalStart = now;
          }
          lastLoaded = e.loaded;
        };
        xhr.onload = () => {
          const end = performance.now();
          const speed = (size * 8) / (end - start) / 1000;
          setCurrentUploadSpeed(speed);
          setUploadSpeeds((s) => [...s.slice(-99), speed]);
          resolve(speed);
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
        xhr.send(new Uint8Array(size));
      });
    }

    return new Promise<number>((resolve, reject) => {
      const chunkSize = Math.floor(size / threads);
      let uploaded = 0;
      const start = performance.now();
      let intervalStart = start;
      let intervalBytes = 0;
      let completed = 0;
      for (let i = 0; i < threads; i++) {
        const xhr = new XMLHttpRequest();
        uploadXhrs.current.push(xhr);
        xhr.open('POST', '/speedtest/upload');
        let prev = 0;
        xhr.upload.onprogress = (e) => {
          const delta = e.loaded - prev;
          uploaded += delta;
          prev = e.loaded;
          setUploadProgress({ transferred: uploaded, size });
          const now = performance.now();
          intervalBytes += delta;
          if (now - intervalStart >= 1000 && intervalBytes > 0) {
            const speed = (intervalBytes * 8) / (now - intervalStart) / 1000;
            setCurrentUploadSpeed((p) => p * 0.5 + speed * 0.5);
            setUploadSpeeds((s) => [...s.slice(-99), speed]);
            intervalBytes = 0;
            intervalStart = now;
          }
        };
        xhr.onload = () => {
          completed++;
          if (completed === threads) {
            const end = performance.now();
            const speed = (size * 8) / (end - start) / 1000;
            setCurrentUploadSpeed(speed);
            setUploadSpeeds((s) => [...s.slice(-99), speed]);
            resolve(speed);
          }
        };
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
        xhr.send(new Uint8Array(chunkSize));
      }
    });
  }

  const runSpeedtest = async (
    downloadSize: number,
    uploadSize: number,
    threads: number
  ) => {
    setSpeedRunning(true);
    const key = threads === 1 ? 'single' : 'multi';
    setSpeedResult((prev) => ({ ...prev, [key]: null }));
    downloadControllers.current = [];
    uploadXhrs.current = [];

    const speedtestPromise = (async () => {
      const down = await downloadWithProgress(downloadSize, threads);
      const up = await uploadWithProgress(uploadSize, threads);
      await fetch('/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_target: 'speedtest',
          speedtest_type: key,
          download_mbps: down,
          upload_mbps: up,
        }),
      });
      setSpeedResult((prev) => ({
        ...prev,
        [key]: { down, up },
      }));
      loadRecords()
        .then((recs) => {
          if (recs.length > 0) {
            setInfo(recs[0]);
          }
        })
        .catch((err) => console.error('Failed to load previous tests', err));
    })();

    speedtestPromise.catch((err) => {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error('Speedtest failed', err);
      }
    });

    try {
      await Promise.race([
        speedtestPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Speedtest timeout')), 30000)
        ),
      ]);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        console.error('Speedtest timed out', err);
      }
    } finally {
      setSpeedRunning(false);
    }
  };


  const handleSpeedPreset = (
    preset: string,
    downloadSize: number,
    uploadSize: number,
    threads: number
  ) => {
    setActivePreset(preset);
    setCurrentThreads(threads);
    runSpeedtest(downloadSize, uploadSize, threads);
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-green-900 to-black text-green-400 flex items-center justify-center p-4 leading-[1.4]">
        <div
          className="flex flex-col items-center space-y-4 p-5 rounded-lg shadow-[0_0_40px_rgba(0,255,0,0.05)] max-w-[min(90vw,960px)] text-center"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <AsciiLogo />
          <span className="sr-only">正在加载，请稍候</span>
          <div className="w-12 h-12 border-4 border-green-400/30 border-t-green-400 rounded-full animate-spin will-change-[transform] motion-reduce:animate-none" />
          <div className="text-lg animate-pulse motion-reduce:animate-none">测试中，请不要关闭或刷新。</div>
          {loadingMsg && (
            <div className="text-sm animate-pulse motion-reduce:animate-none">{loadingMsg}</div>
          )}
          {downloadProgress.size > 0 && (
            <div className="text-sm">
              ⬇️ Download: {formatProgress(downloadProgress)} {currentDownloadSpeed.toFixed(2)} Mbps
            </div>
          )}
          {uploadProgress.size > 0 && (
            <div className="text-sm">
              ⬆️ Upload: {formatProgress(uploadProgress)} {currentUploadSpeed.toFixed(2)} Mbps
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-green-900 to-black text-green-400 p-4 leading-[1.4]">
      <div className="app space-y-8">
      <AsciiLogo />
      <div className="text-center">
        <button
          className="px-4 py-2 bg-green-800 text-green-100 rounded"
          onClick={copyMarkdown}
        >
          Copy Markdown
        </button>
      </div>
      <div className="dashboard">
          {info ? (
            <TestSection title="Your Connection Info" className="card--info">
              <div>IP: {maskIp(info.client_ip)}</div>
              <div>Location: {info.location || 'Unknown'}</div>
              <div>ASN: {info.asn || 'Unknown'}</div>
              <div>ISP: {info.isp || 'Unknown'}</div>
              {typeof info.ping_ms === 'number' && (
                <div className={getPingColor(info.ping_ms)}>
                  Ping: {info.ping_ms.toFixed(2)} ms
                </div>
              )}
              <div className="text-sm text-gray-400">
                Recorded at: {new Date(info.timestamp).toLocaleString()}
              </div>
            </TestSection>
          ) : (
            <TestSection title="Your Connection Info" className="card--info">
              <div>No info available</div>
            </TestSection>
          )}

          <TestSection title="Recent Tests" className="card--recent">
          {sortedRecords.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left border border-green-600 border-collapse">
                <thead className="bg-[rgb(0,50,0)] sticky top-0">
                  <tr>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('client_ip')}>
                      IP
                    </th>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('location')}>
                      Location
                    </th>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('asn')}>
                      ASN
                    </th>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('isp')}>
                      ISP
                    </th>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('ping_ms')}>
                      Ping (min/avg/max)
                    </th>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('single_dl_mbps')}>
                      ⬇️ 单线程
                    </th>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('single_ul_mbps')}>
                      ⬆️ 单线程
                    </th>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('multi_dl_mbps')}>
                      ⬇️ 八线程
                    </th>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('multi_ul_mbps')}>
                      ⬆️ 八线程
                    </th>
                    <th className="px-2 py-1 border border-green-700 font-bold cursor-pointer" onClick={() => handleSort('timestamp')}>
                      Recorded
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.slice(0, 10).map((r) => (
                    <tr key={r.id} className="odd:bg-green-950 even:bg-green-900 hover:bg-green-800">
                      <td className="px-2 py-1 border border-green-700" title={r.client_ip || undefined}>{maskIp(r.client_ip)}</td>
                      <td className="px-2 py-1 border border-green-700" title={r.location || undefined}>
                        {r.location && r.location !== 'Unknown' ? r.location : 'Unknown'}
                      </td>
                      <td className="px-2 py-1 border border-green-700" title={r.asn || undefined}>{r.asn || 'Unknown'}</td>
                      <td className="px-2 py-1 border border-green-700" title={r.isp || undefined}>{r.isp || 'Unknown'}</td>
                      <td className={`px-2 py-1 border border-green-700 ${typeof r.ping_ms === 'number' ? getPingColor(r.ping_ms) : ''}`}>
                        {typeof r.ping_ms === 'number'
                          ? `${(r.ping_min_ms ?? r.ping_ms).toFixed(2)}/${r.ping_ms.toFixed(2)}/${(r.ping_max_ms ?? r.ping_ms).toFixed(2)} ms`
                          : ''}
                      </td>
                      <td className={`px-2 py-1 border border-green-700 ${typeof r.single_dl_mbps === 'number' ? getSpeedColor(r.single_dl_mbps) : ''}`}>
                        {typeof r.single_dl_mbps === 'number'
                          ? `${r.single_dl_mbps.toFixed(2)}`
                          : ''}
                      </td>
                      <td className={`px-2 py-1 border border-green-700 ${typeof r.single_ul_mbps === 'number' ? getSpeedColor(r.single_ul_mbps) : ''}`}>
                        {typeof r.single_ul_mbps === 'number'
                          ? `${r.single_ul_mbps.toFixed(2)}`
                          : ''}
                      </td>
                      <td className={`px-2 py-1 border border-green-700 ${typeof r.multi_dl_mbps === 'number' ? getSpeedColor(r.multi_dl_mbps) : ''}`}>
                        {typeof r.multi_dl_mbps === 'number'
                          ? `${r.multi_dl_mbps.toFixed(2)}`
                          : ''}
                      </td>
                      <td className={`px-2 py-1 border border-green-700 ${typeof r.multi_ul_mbps === 'number' ? getSpeedColor(r.multi_ul_mbps) : ''}`}>
                        {typeof r.multi_ul_mbps === 'number'
                          ? `${r.multi_ul_mbps.toFixed(2)}`
                          : ''}
                      </td>
                      <td className="px-2 py-1 border border-green-700">
                        {new Date(r.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-center text-gray-400">
              {recordsMessage || 'No test records found.'}
            </div>
          )}
        </TestSection>

        <TestSection title="Auto Ping Test" className="card--ping">
          {pingOutput && (
            <div>
              <pre className="whitespace-pre-wrap text-left font-mono bg-[rgb(0,40,0)] bg-opacity-70 p-4 rounded">
                {showPingFull
                  ? pingOutput
                  : pingOutput.split('\n').slice(0, 5).join('\n')}
              </pre>
              {pingOutput.split('\n').length > 5 && (
                <button
                  className="mt-2 underline"
                  onClick={() => setShowPingFull(!showPingFull)}
                >
                  {showPingFull ? 'Hide' : 'Show More'}
                </button>
              )}
            </div>
          )}
        </TestSection>

        <TestSection title="Traceroute" className="card--trace">
          {traceOutput && (
            <div>
              <pre className="whitespace-pre-wrap text-left font-mono bg-[rgb(0,40,0)] bg-opacity-70 p-4 rounded">
                {showTraceFull
                  ? traceOutput
                  : traceOutput.split('\n').slice(0, 5).join('\n')}
              </pre>
              {traceOutput.split('\n').length > 5 && (
                <button
                  className="mt-2 underline"
                  onClick={() => setShowTraceFull(!showTraceFull)}
                >
                  {showTraceFull ? 'Hide' : 'Show More'}
                </button>
              )}
            </div>
          )}
        </TestSection>

        <section className="card card--speed">
          <header className="speed__header">
            <h2 className="card__title">Speed Test</h2>
            <div className="seg">
              <button
                className={`seg__btn ${activePreset === 's100' ? 'is-active' : ''}`}
                disabled={speedRunning}
                onClick={() =>
                  handleSpeedPreset('s100', 100 * 1024 * 1024, 50 * 1024 * 1024, 1)
                }
              >
                单线程100M
              </button>
              <button
                className={`seg__btn ${activePreset === 's500' ? 'is-active' : ''}`}
                disabled={speedRunning}
                onClick={() =>
                  handleSpeedPreset('s500', 500 * 1024 * 1024, 200 * 1024 * 1024, 1)
                }
              >
                单线程500M
              </button>
              <button
                className={`seg__btn ${activePreset === 's1000' ? 'is-active' : ''}`}
                disabled={speedRunning}
                onClick={() =>
                  handleSpeedPreset('s1000', 1024 * 1024 * 1024, 500 * 1024 * 1024, 1)
                }
              >
                单线程1G
              </button>
              <button
                className={`seg__btn ${activePreset === 'm100' ? 'is-active' : ''}`}
                disabled={speedRunning}
                onClick={() =>
                  handleSpeedPreset('m100', 100 * 1024 * 1024, 50 * 1024 * 1024, 8)
                }
              >
                八线程100M
              </button>
              <button
                className={`seg__btn ${activePreset === 'm500' ? 'is-active' : ''}`}
                disabled={speedRunning}
                onClick={() =>
                  handleSpeedPreset('m500', 500 * 1024 * 1024, 200 * 1024 * 1024, 8)
                }
              >
                八线程500M
              </button>
              <button
                className={`seg__btn ${activePreset === 'm1000' ? 'is-active' : ''}`}
                disabled={speedRunning}
                onClick={() =>
                  handleSpeedPreset('m1000', 1024 * 1024 * 1024, 500 * 1024 * 1024, 8)
                }
              >
                八线程1G
              </button>
            </div>
            <div className="speed__progress">
              <div>
                ⬇️ Download:
                <span className="mono"> {formatProgress(downloadProgress)}</span>{' '}
                <span className="mono"> {currentDownloadSpeed.toFixed(2)} Mbps</span>
              </div>
              <div>
                ⬆️ Upload:
                <span className="mono"> {formatProgress(uploadProgress)}</span>{' '}
                <span className="mono"> {currentUploadSpeed.toFixed(2)} Mbps</span>
              </div>
            </div>
          </header>

          <div className="speed__grid">
            {downloadSpeeds.length > 0 && (
              <div className="panel">
                <div className="panel__title">Download</div>
                <SpeedChart
                  speeds={downloadSpeeds}
                  multi={currentThreads > 1}
                />
                <div className="panel__peak">
                  {Math.max(...downloadSpeeds).toFixed(2)} Mbps
                </div>
              </div>
            )}
            {uploadSpeeds.length > 0 && (
              <div className="panel">
                <div className="panel__title">Upload</div>
                <SpeedChart
                  speeds={uploadSpeeds}
                  multi={currentThreads > 1}
                />
                <div className="panel__peak">
                  {Math.max(...uploadSpeeds).toFixed(2)} Mbps
                </div>
              </div>
            )}
          </div>

          <pre className="whitespace-pre-wrap text-left font-mono bg-[rgb(0,40,0)] bg-opacity-70 p-4 rounded mt-4">
            {speedResult.single
              ? `Single Thread - ⬇️ ${speedResult.single.down.toFixed(2)} ⬆️ ${speedResult.single.up.toFixed(2)}\n`
              : 'Single Thread - ⬇️ - ⬆️ -\n'}
            {speedResult.multi
              ? `Multi Thread (8) - ⬇️ ${speedResult.multi.down.toFixed(2)} ⬆️ ${speedResult.multi.up.toFixed(2)}`
              : 'Multi Thread (8) - ⬇️ - ⬆️ -'}
          </pre>

          <footer className="speed__legend">
            <div className="legend">
              <span className="dot dot--single" /> Single Thread
              <span className="sep">·</span>
              <span className="dot dot--multi" /> Multi Thread (8)
            </div>
          </footer>
        </section>
      </div>
    </div>
  </div>
  );
}

export default App;

