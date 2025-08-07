import { useEffect, useState, useRef } from 'react';
import SpeedChart from './SpeedChart';

interface RawTestRecord {
  id: number;
  timestamp: string;
  client_ip?: string | null;
  location?: string | null;
  asn?: string | null;
  isp?: string | null;
  ping_ms?: number | null;
  ping_min_ms?: number | null;
  ping_max_ms?: number | null;
  download_mbps?: number | null;
  upload_mbps?: number | null;
  speedtest_type?: string | null;
  mtr_result?: string | null;
  iperf_result?: string | null;
  test_target?: string | null;
}

interface AggregatedRecord {
  id: number;
  timestamp: string;
  client_ip?: string | null;
  location?: string | null;
  asn?: string | null;
  isp?: string | null;
  ping_ms?: number | null;
  ping_min_ms?: number | null;
  ping_max_ms?: number | null;
  download_single_mbps?: number | null;
  upload_single_mbps?: number | null;
  download_multi_mbps?: number | null;
  upload_multi_mbps?: number | null;
}

interface TestsResponse {
  message?: string;
  records: RawTestRecord[];
}

function maskIp(ip?: string | null) {
  if (!ip) return '';
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.***.***.${parts[3]}`;
  }
  return ip;
}

const ASCII_LOGO = [
  "__      _______   _____ _______ ______          ___   _",
  "\\ \\    / /  __ \\ / ____|__   __/ __ \\ \\        / / \\ | |",
  " \\ \\  / /| |__) | (___    | | | |  | \\ \\  /\\  / /|  \\| |",
  "  \\ \\/ / |  ___/ \\___ \\   | | | |  | |\\ \\/  \\/ / | . ` |",
  "   \\  /  | |     ____) |  | | | |__| | \\  /\\  /  | |\\  |",
  "    \\/   |_|    |_____(_) |_|  \\____/   \\/  \\/   |_| \\_|",
  "",
  " _   _           _        _____           _",
  "| \\ | |         | |      |  __ \\         | |",
  "|  \\| | ___   __| | ___  | |__) | __ ___ | |__   ___",
  "| . ` |/ _ \\ / _` |/ _ \\ |  ___/ '__/ _ \\| '_ \\ / _ \\",
  "| |\\  | (_) | (_| |  __/ | |   | | | (_) | |_) |  __/",
  "|_| \\_|\\___/ \\__,_|\\___| |_|   |_|  \\___/|_.__/ \\___|"
].join('\n');

function App() {
  const [info, setInfo] = useState<AggregatedRecord | null>(null);
  const [records, setRecords] = useState<AggregatedRecord[]>([]);
  const [recordsMessage, setRecordsMessage] = useState<string | null>(null);
  const [pingOutput, setPingOutput] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const loadRecords = async () => {
    try {
      const res = await fetch('/tests');
      const data: TestsResponse = await res.json();
      const filtered = (data.records || []).filter(
        (r) =>
          r.client_ip &&
          (typeof r.ping_ms === 'number' ||
            typeof r.download_mbps === 'number' ||
            typeof r.upload_mbps === 'number')
      );

      const map = new Map<string, AggregatedRecord>();
      filtered.forEach((r) => {
        const key = r.client_ip as string;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, {
            id: r.id,
            timestamp: r.timestamp,
            client_ip: r.client_ip,
            location: r.location,
            asn: r.asn,
            isp: r.isp,
            ping_ms: r.ping_ms,
            ping_min_ms: r.ping_min_ms,
            ping_max_ms: r.ping_max_ms,
            download_single_mbps:
              r.speedtest_type === 'single' ? r.download_mbps : undefined,
            upload_single_mbps:
              r.speedtest_type === 'single' ? r.upload_mbps : undefined,
            download_multi_mbps:
              r.speedtest_type === 'multi' ? r.download_mbps : undefined,
            upload_multi_mbps:
              r.speedtest_type === 'multi' ? r.upload_mbps : undefined,
          });
        } else {
          if (new Date(r.timestamp) > new Date(existing.timestamp)) {
            existing.timestamp = r.timestamp;
            existing.location = r.location;
            existing.asn = r.asn;
            existing.isp = r.isp;
          }
          if (typeof r.ping_ms === 'number') {
            existing.ping_ms = r.ping_ms;
            existing.ping_min_ms = r.ping_min_ms;
            existing.ping_max_ms = r.ping_max_ms;
          }
          if (r.speedtest_type === 'single') {
            existing.download_single_mbps = r.download_mbps;
            existing.upload_single_mbps = r.upload_mbps;
          }
          if (r.speedtest_type === 'multi') {
            existing.download_multi_mbps = r.download_mbps;
            existing.upload_multi_mbps = r.upload_mbps;
          }
        }
      });

      const agg = Array.from(map.values()).sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setRecords(agg);
      if (agg.length > 0) {
        setInfo(agg[0]);
      }
      if (data.message) {
        setRecordsMessage(data.message);
      }
      return agg;
    } catch (err) {
      console.error('Failed to load previous tests', err);
      return [];
    }
  };


  const [traceOutput, setTraceOutput] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({
    transferred: 0,
    size: 0,
  });
  const [uploadProgress, setUploadProgress] = useState({
    transferred: 0,
    size: 0,
  });
  const [speedResult, setSpeedResult] = useState<
    | {
        single?: { down: number; up: number };
        multi?: { down: number; up: number };
      }
    | null
  >(null);
  const [downloadSpeeds, setDownloadSpeeds] = useState<number[]>([]);
  const [uploadSpeeds, setUploadSpeeds] = useState<number[]>([]);
  const [currentDownloadSpeed, setCurrentDownloadSpeed] = useState(0);
  const [currentUploadSpeed, setCurrentUploadSpeed] = useState(0);
  const [speedRunning, setSpeedRunning] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [autoSpeedtestDone, setAutoSpeedtestDone] = useState(false);

  const downloadControllers = useRef<AbortController[]>([]);
  const uploadXhrs = useRef<XMLHttpRequest[]>([]);

    useEffect(() => {
      runInitialTests();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const runInitialTests = async () => {
    setLoading(true);
    setLoadingMsg('正在进行 ping Traceroute 测试...');
    try {
      const res = await fetch('/tests?skip_ping=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data: RawTestRecord = await res.json();
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
        await runPing(data.client_ip);
        await runTraceroute(data.client_ip, true);
      }
    } catch (err) {
      console.error('Failed to run initial tests', err);
    } finally {
      await loadRecords();
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
    const percent = ((p.transferred / p.size) * 100).toFixed(0);
    return `${transferredMB}M/${sizeMB}M ${percent}%`;
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
      let lastTime = start;
      while (true) {
        const { done, value } = await reader.read();
        const now = performance.now();
        if (done) break;
        received += value.length;
        setDownloadProgress({ transferred: received, size });
        const diff = now - lastTime;
        if (diff > 0 && value) {
          const speed = (value.length * 8) / diff / 1000;
          setCurrentDownloadSpeed(speed);
          setDownloadSpeeds((s) => [...s.slice(-99), speed]);
        }
        lastTime = now;
      }
      const end = performance.now();
      return (size * 8) / (end - start) / 1000;
    }

    const chunkSize = Math.floor(size / threads);
    let received = 0;
    const start = performance.now();
    let lastTime = start;
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
            const diff = now - lastTime;
            if (diff > 0 && value) {
              const speed = (value.length * 8) / diff / 1000;
              setCurrentDownloadSpeed(speed);
              setDownloadSpeeds((s) => [...s.slice(-99), speed]);
            }
            lastTime = now;
          }
        })
      );
    }
    await Promise.all(tasks);
    const end = performance.now();
    return (size * 8) / (end - start) / 1000;
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
        let lastTime = start;
        xhr.open('POST', '/speedtest/upload');
        xhr.upload.onprogress = (e) => {
          setUploadProgress({ transferred: e.loaded, size });
          const now = performance.now();
          const diff = now - lastTime;
          const loadedDiff = e.loaded - lastLoaded;
          if (diff > 0 && loadedDiff > 0) {
            const speed = (loadedDiff * 8) / diff / 1000;
            setCurrentUploadSpeed(speed);
            setUploadSpeeds((s) => [...s.slice(-99), speed]);
          }
          lastTime = now;
          lastLoaded = e.loaded;
        };
        xhr.onload = () => {
          const end = performance.now();
          resolve((size * 8) / (end - start) / 1000);
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
      let lastTime = start;
      let lastUploaded = 0;
      let completed = 0;
      for (let i = 0; i < threads; i++) {
        const xhr = new XMLHttpRequest();
        uploadXhrs.current.push(xhr);
        xhr.open('POST', '/speedtest/upload');
        let prev = 0;
        xhr.upload.onprogress = (e) => {
          uploaded += e.loaded - prev;
          prev = e.loaded;
          setUploadProgress({ transferred: uploaded, size });
          const now = performance.now();
          const diff = now - lastTime;
          const loadedDiff = uploaded - lastUploaded;
          if (diff > 0 && loadedDiff > 0) {
            const speed = (loadedDiff * 8) / diff / 1000;
            setCurrentUploadSpeed(speed);
            setUploadSpeeds((s) => [...s.slice(-99), speed]);
          }
          lastTime = now;
          lastUploaded = uploaded;
        };
        xhr.onload = () => {
          completed++;
          if (completed === threads) {
            const end = performance.now();
            resolve((size * 8) / (end - start) / 1000);
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
    setSpeedResult(null);
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
          speedtest_type: threads === 1 ? 'single' : 'multi',
          download_mbps: down,
          upload_mbps: up,
        }),
      });
      setSpeedResult((prev) => ({
        ...(prev || {}),
        [threads === 1 ? 'single' : 'multi']: { down, up },
      }));
      const recs = await loadRecords();
      if (recs.length > 0) {
        setInfo(recs[0]);
      }
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
      setCurrentDownloadSpeed(0);
      setCurrentUploadSpeed(0);
    }
  };

  useEffect(() => {
    if (!loading && info && !autoSpeedtestDone) {
      setAutoSpeedtestDone(true);
      (async () => {
        await runSpeedtest(100 * 1024 * 1024, 50 * 1024 * 1024, 8);
        await runSpeedtest(100 * 1024 * 1024, 50 * 1024 * 1024, 1);
      })();
    }
  }, [loading, info, autoSpeedtestDone]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopSpeedtest = () => {
    downloadControllers.current.forEach((c) => c.abort());
    uploadXhrs.current.forEach((x) => x.abort());
    downloadControllers.current = [];
    uploadXhrs.current = [];
    setSpeedRunning(false);
    setCurrentDownloadSpeed(0);
    setCurrentUploadSpeed(0);
    setDownloadProgress({ transferred: 0, size: 0 });
    setUploadProgress({ transferred: 0, size: 0 });
    setDownloadSpeeds([]);
    setUploadSpeeds([]);
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-green-900 to-black text-green-400 flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <pre className="text-center whitespace-pre font-mono">{ASCII_LOGO}</pre>
          <div className="w-12 h-12 border-4 border-green-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-lg animate-pulse">Loading...</div>
          {loadingMsg && <div className="text-sm animate-pulse">{loadingMsg}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-green-900 to-black text-green-400 p-4">
      <div className="w-full max-w-3xl mx-auto space-y-8">
        <pre className="text-center whitespace-pre font-mono">{ASCII_LOGO}</pre>
        {info ? (
          <div className="space-y-2 text-center">
            <h1 className="text-xl mb-4">Your Connection Info</h1>
            <div>IP: {maskIp(info.client_ip)}</div>
            <div>Location: {info.location || 'Unknown'}</div>
            <div>ASN: {info.asn || 'Unknown'}</div>
            <div>ISP: {info.isp || 'Unknown'}</div>
            {typeof info.ping_ms === 'number' && (
              <div>Ping: {info.ping_ms.toFixed(2)} ms</div>
            )}
            <div className="text-sm text-gray-400">
              Recorded at: {new Date(info.timestamp).toLocaleString()}
            </div>
          </div>
        ) : (
          <div>No info available</div>
        )}

        <div className="space-y-2 bg-black bg-opacity-50 p-4 rounded">
          <h2 className="text-xl mb-2 text-center">Recent Tests</h2>
          {records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left border border-green-600 border-collapse">
                <thead>
                  <tr>
                    <th className="px-2 py-1 border border-green-700">IP</th>
                    <th className="px-2 py-1 border border-green-700">Location</th>
                    <th className="px-2 py-1 border border-green-700">ASN</th>
                    <th className="px-2 py-1 border border-green-700">ISP</th>
                    <th className="px-2 py-1 border border-green-700">Ping</th>
                    <th className="px-2 py-1 border border-green-700">⬇️ 单线程</th>
                    <th className="px-2 py-1 border border-green-700">⬆️ 单线程</th>
                    <th className="px-2 py-1 border border-green-700">⬇️ 八线程</th>
                    <th className="px-2 py-1 border border-green-700">⬆️ 八线程</th>
                    <th className="px-2 py-1 border border-green-700">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 10).map((r) => (
                    <tr key={r.id}>
                      <td className="px-2 py-1 border border-green-700">{maskIp(r.client_ip)}</td>
                      <td className="px-2 py-1 border border-green-700">
                        {r.location && r.location !== 'Unknown' ? r.location : 'Unknown'}
                      </td>
                      <td className="px-2 py-1 border border-green-700">{r.asn || 'Unknown'}</td>
                      <td className="px-2 py-1 border border-green-700">{r.isp || 'Unknown'}</td>
                      <td className="px-2 py-1 border border-green-700">
                        {typeof r.ping_ms === 'number'
                          ? `${(r.ping_min_ms ?? r.ping_ms).toFixed(2)}/${r.ping_ms.toFixed(2)}/${(r.ping_max_ms ?? r.ping_ms).toFixed(2)} ms`
                          : ''}
                      </td>
                      <td className="px-2 py-1 border border-green-700">
                        {typeof r.download_single_mbps === 'number'
                          ? `${r.download_single_mbps.toFixed(2)} Mbps`
                          : ''}
                      </td>
                      <td className="px-2 py-1 border border-green-700">
                        {typeof r.upload_single_mbps === 'number'
                          ? `${r.upload_single_mbps.toFixed(2)} Mbps`
                          : ''}
                      </td>
                      <td className="px-2 py-1 border border-green-700">
                        {typeof r.download_multi_mbps === 'number'
                          ? `${r.download_multi_mbps.toFixed(2)} Mbps`
                          : ''}
                      </td>
                      <td className="px-2 py-1 border border-green-700">
                        {typeof r.upload_multi_mbps === 'number'
                          ? `${r.upload_multi_mbps.toFixed(2)} Mbps`
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
        </div>

        <div className="space-y-2 text-center bg-black bg-opacity-50 p-4 rounded">
          <h2 className="text-xl mb-2">Auto Ping Test</h2>
          {pingOutput && (
            <pre className="whitespace-pre-wrap text-left bg-black bg-opacity-50 p-2 rounded">
              {pingOutput}
            </pre>
          )}
        </div>

        <div className="space-y-2 text-center bg-black bg-opacity-50 p-4 rounded">
          <h2 className="text-xl mb-2">Traceroute</h2>
          {traceOutput && (
            <pre className="whitespace-pre-wrap text-left bg-black bg-opacity-50 p-2 rounded">
              {traceOutput}
            </pre>
          )}
        </div>

        <div className="space-y-2 text-center bg-black bg-opacity-50 p-4 rounded">
          <h2 className="text-xl mb-2">Speed Test</h2>
          <div className="space-y-2">
            <div className="flex justify-center space-x-2">
              <button
                className="px-4 py-1 rounded bg-green-600 text-black"
                disabled={speedRunning}
                onClick={() =>
                  runSpeedtest(100 * 1024 * 1024, 50 * 1024 * 1024, 1)
                }
              >
                [单线程]100M
              </button>
              <button
                className="px-4 py-1 rounded bg-green-600 text-black"
                disabled={speedRunning}
                onClick={() =>
                  runSpeedtest(500 * 1024 * 1024, 200 * 1024 * 1024, 1)
                }
              >
                [单线程]500M
              </button>
              <button
                className="px-4 py-1 rounded bg-green-600 text-black"
                disabled={speedRunning}
                onClick={() =>
                  runSpeedtest(1024 * 1024 * 1024, 500 * 1024 * 1024, 1)
                }
              >
                [单线程]1G
              </button>
            </div>
            <div className="flex justify-center space-x-2">
              <button
                className="px-4 py-1 rounded bg-green-600 text-black"
                disabled={speedRunning}
                onClick={() =>
                  runSpeedtest(100 * 1024 * 1024, 50 * 1024 * 1024, 8)
                }
              >
                [八线程]100M
              </button>
              <button
                className="px-4 py-1 rounded bg-green-600 text-black"
                disabled={speedRunning}
                onClick={() =>
                  runSpeedtest(500 * 1024 * 1024, 200 * 1024 * 1024, 8)
                }
              >
                [八线程]500M
              </button>
              <button
                className="px-4 py-1 rounded bg-green-600 text-black"
                disabled={speedRunning}
                onClick={() =>
                  runSpeedtest(1024 * 1024 * 1024, 500 * 1024 * 1024, 8)
                }
              >
                [八线程]1G
              </button>
            </div>
            <div className="flex justify-center">
              <button
                className="px-4 py-1 rounded bg-red-600 text-black"
                disabled={!speedRunning}
                onClick={stopSpeedtest}
              >
                STOP
              </button>
            </div>
          </div>
          <div>Download Progress: {formatProgress(downloadProgress)}</div>
          <div>Upload Progress: {formatProgress(uploadProgress)}</div>
          <div className="flex justify-center space-x-4">
            <div className="bg-black bg-opacity-50 rounded p-2 w-40">
              <div className="flex items-center justify-center">
                <span className="mr-1">⬇️</span>Download
              </div>
              <div className="text-lg">
                {currentDownloadSpeed.toFixed(2)} Mbps
              </div>
            </div>
            <div className="bg-black bg-opacity-50 rounded p-2 w-40">
              <div className="flex items-center justify-center">
                <span className="mr-1">⬆️</span>Upload
              </div>
              <div className="text-lg">
                {currentUploadSpeed.toFixed(2)} Mbps
              </div>
            </div>
          </div>
          {downloadSpeeds.length > 0 && (
            <SpeedChart
              title="Download Speed (Mbps)"
              speeds={downloadSpeeds}
              color="#00ffff"
            />
          )}
          {uploadSpeeds.length > 0 && (
            <SpeedChart
              title="Upload Speed (Mbps)"
              speeds={uploadSpeeds}
              color="#ff00ff"
            />
          )}
          {speedResult && (
            <pre className="whitespace-pre-wrap text-left bg-black bg-opacity-50 p-2 rounded">
              {speedResult.single
                ? `Single Thread - ⬇️ ${speedResult.single.down.toFixed(2)} Mbps ⬆️ ${speedResult.single.up.toFixed(2)} Mbps\n`
                : ''}
              {speedResult.multi
                ? `Multi Thread (8) - ⬇️ ${speedResult.multi.down.toFixed(2)} Mbps ⬆️ ${speedResult.multi.up.toFixed(2)} Mbps`
                : ''}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

