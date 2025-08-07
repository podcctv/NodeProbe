import { useEffect, useState } from 'react';

interface TestRecord {
  id: number;
  timestamp: string;
  client_ip?: string | null;
  location?: string | null;
  asn?: string | null;
  isp?: string | null;
  ping_ms?: number | null;
  download_mbps?: number | null;
  upload_mbps?: number | null;
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

function App() {
  const [info, setInfo] = useState<TestRecord | null>(null);
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [recordsMessage, setRecordsMessage] = useState<string | null>(null);
  const [pingOutput, setPingOutput] = useState<string | null>(null);
  const [traceOutput, setTraceOutput] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState({
    transferred: 0,
    size: 0,
  });
  const [uploadProgress, setUploadProgress] = useState({
    transferred: 0,
    size: 0,
  });
  const [speedResult, setSpeedResult] = useState<{ down: number; up: number } | null>(
    null,
  );
  const [speedRunning, setSpeedRunning] = useState(false);

  useEffect(() => {
    const collect = async () => {
      try {
        const res = await fetch('/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const data = await res.json();
        setInfo(data);
      } catch (err) {
        console.error('Failed to collect info', err);
      }
    };

    const loadRecords = async () => {
      try {
        const res = await fetch('/tests');
        const data: TestsResponse = await res.json();
        setRecords(data.records || []);
        if (data.message) {
          setRecordsMessage(data.message);
        }
      } catch (err) {
        console.error('Failed to load previous tests', err);
      }
    };

    collect();
    setTimeout(loadRecords, 0);
  }, []);

  useEffect(() => {
    if (info?.client_ip) {
      runPing(info.client_ip);
      runTraceroute(info.client_ip);
    }
  }, [info]);

  const runPing = async (host: string) => {
    setPingOutput('Running...');
    try {
      const res = await fetch(`/ping?host=${encodeURIComponent(host)}&count=10`);
      const data = await res.json();
      setPingOutput(data.output || data.error || 'No output');
    } catch (err) {
      console.error('Ping failed', err);
      setPingOutput('Ping failed');
    }
  };

  const runTraceroute = async (host: string) => {
    setTraceOutput('Running...');
    try {
      const res = await fetch(`/traceroute?host=${encodeURIComponent(host)}`);
      const data = await res.json();
      setTraceOutput(data.output || data.error || 'No output');
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

  async function downloadWithProgress(size: number) {
    setDownloadProgress({ transferred: 0, size });
    const res = await fetch(`/speedtest/download?size=${size}`);
    const reader = res.body?.getReader();
    if (!reader) return 0;
    let received = 0;
    const start = performance.now();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      setDownloadProgress({ transferred: received, size });
    }
    const end = performance.now();
    return ((size * 8) / (end - start) / 1000);
  }

  function uploadWithProgress(size: number) {
    setUploadProgress({ transferred: 0, size });
    return new Promise<number>((resolve) => {
      const xhr = new XMLHttpRequest();
      const start = performance.now();
      xhr.open('POST', '/speedtest/upload');
      xhr.upload.onprogress = (e) => {
        setUploadProgress({ transferred: e.loaded, size });
      };
      xhr.onload = () => {
        const end = performance.now();
        resolve((size * 8) / (end - start) / 1000);
      };
      xhr.send(new Uint8Array(size));
    });
  }

  const runSpeedtest = async (downloadSize: number, uploadSize: number) => {
    setSpeedRunning(true);
    setSpeedResult(null);
    const down = await downloadWithProgress(downloadSize);
    const up = await uploadWithProgress(uploadSize);
    setSpeedResult({ down, up });
    await fetch('/tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test_target: 'speedtest',
        speedtest_type: `${downloadSize / 1024 / 1024}M`,
        download_mbps: down,
        upload_mbps: up,
      }),
    });
    setSpeedRunning(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-900 to-indigo-900 text-green-400 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-8">
        {info ? (
          <div className="space-y-2 text-center">
            <h1 className="text-xl mb-4">Your Connection Info</h1>
            <div>IP: {maskIp(info.client_ip)}</div>
            {info.location && info.location !== 'Unknown' && (
              <div>Location: {info.location}</div>
            )}
            {info.asn && <div>ASN: {info.asn}</div>}
            {info.isp && <div>ISP: {info.isp}</div>}
            {typeof info.ping_ms === 'number' && (
              <div>Ping: {info.ping_ms.toFixed(2)} ms</div>
            )}
            <div className="text-sm text-gray-400">
              Recorded at: {new Date(info.timestamp).toLocaleString()}
            </div>
          </div>
        ) : (
          <div>Loading...</div>
        )}

        <div className="space-y-2">
          <h2 className="text-xl mb-2 text-center">Recent Tests</h2>
          {records.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-2 py-1 text-left">IP</th>
                    <th className="px-2 py-1 text-left">Location</th>
                    <th className="px-2 py-1 text-left">ASN</th>
                    <th className="px-2 py-1 text-left">ISP</th>
                    <th className="px-2 py-1 text-left">Ping</th>
                    <th className="px-2 py-1 text-left">Download</th>
                    <th className="px-2 py-1 text-left">Upload</th>
                    <th className="px-2 py-1 text-left">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {records
                    .slice(0, 5)
                    .map((r) => (
                      <tr key={r.id}>
                        <td className="px-2 py-1">{maskIp(r.client_ip)}</td>
                        <td className="px-2 py-1">
                          {r.location && r.location !== 'Unknown' ? r.location : ''}
                        </td>
                        <td className="px-2 py-1">{r.asn || ''}</td>
                        <td className="px-2 py-1">{r.isp || ''}</td>
                        <td className="px-2 py-1">
                          {typeof r.ping_ms === 'number' ? `${r.ping_ms.toFixed(2)} ms` : ''}
                        </td>
                        <td className="px-2 py-1">
                          {typeof r.download_mbps === 'number'
                            ? `${r.download_mbps.toFixed(2)} Mbps`
                            : ''}
                        </td>
                        <td className="px-2 py-1">
                          {typeof r.upload_mbps === 'number'
                            ? `${r.upload_mbps.toFixed(2)} Mbps`
                            : ''}
                        </td>
                        <td className="px-2 py-1">
                          {new Date(r.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-center text-gray-400">
              {recordsMessage || 'No test records found. Run a test to get started.'}
            </div>
          )}
        </div>

        <div className="space-y-2 text-center">
          <h2 className="text-xl mb-2">Auto Ping Test</h2>
          {pingOutput && (
            <pre className="whitespace-pre-wrap text-left bg-black bg-opacity-50 p-2 rounded">
              {pingOutput}
            </pre>
          )}
        </div>

        <div className="space-y-2 text-center">
          <h2 className="text-xl mb-2">Traceroute</h2>
          {traceOutput && (
            <pre className="whitespace-pre-wrap text-left bg-black bg-opacity-50 p-2 rounded">
              {traceOutput}
            </pre>
          )}
        </div>

        <div className="space-y-2 text-center">
          <h2 className="text-xl mb-2">Speed Test</h2>
          <div className="flex justify-center space-x-2">
            <button
              className="px-4 py-1 rounded bg-green-600 text-black"
              disabled={speedRunning}
              onClick={() => runSpeedtest(100 * 1024 * 1024, 50 * 1024 * 1024)}
            >
              100M
            </button>
            <button
              className="px-4 py-1 rounded bg-green-600 text-black"
              disabled={speedRunning}
              onClick={() => runSpeedtest(500 * 1024 * 1024, 200 * 1024 * 1024)}
            >
              500M
            </button>
            <button
              className="px-4 py-1 rounded bg-green-600 text-black"
              disabled={speedRunning}
              onClick={() => runSpeedtest(1024 * 1024 * 1024, 500 * 1024 * 1024)}
            >
              1G
            </button>
          </div>
          <div>Download Progress: {formatProgress(downloadProgress)}</div>
          <div>Upload Progress: {formatProgress(uploadProgress)}</div>
          {speedResult && (
            <pre className="whitespace-pre-wrap text-left bg-black bg-opacity-50 p-2 rounded">
              {`Download: ${speedResult.down.toFixed(2)} Mbps\nUpload: ${speedResult.up.toFixed(2)} Mbps`}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

