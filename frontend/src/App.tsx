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
  const [pingTarget, setPingTarget] = useState('8.8.8.8');
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
      setRecords(filtered);
      if (data.message) {
        setRecordsMessage(data.message);
      }
    } catch (err) {
      console.error('Failed to load previous tests', err);
    }
  };

  useEffect(() => {
    const runTests = async () => {
      try {
        // Create an initial record and gather client info + ping.
        const res = await fetch('/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const data = await res.json();
        setInfo(data);
        if (data.client_ip) {
          setPingTarget(data.client_ip);
          try {
            // Run traceroute but ignore the result for now.
            await fetch(`/traceroute?host=${encodeURIComponent(data.client_ip)}`);
          } catch (err) {
            console.error('Traceroute failed', err);
          }
        }

        try {
          // Run a basic speed test (multi-thread download/upload).
          const downloadSize = 5 * 1024 * 1024; // 5 MB
          const uploadSize = 2 * 1024 * 1024; // 2 MB
          const chunkSize = downloadSize / 4;

          const downloadSpeed = async () => {
            const start = performance.now();
            await Promise.all(
              Array.from({ length: 4 }, () =>
                fetch(`/speedtest/download?size=${chunkSize}`).then((r) => r.arrayBuffer())
              )
            );
            const end = performance.now();
            return ((downloadSize * 8) / (end - start) / 1000).toFixed(2);
          };

          const uploadSpeed = () =>
            new Promise<string>((resolve) => {
              let completed = 0;
              const start = performance.now();
              const part = uploadSize / 4;
              for (let i = 0; i < 4; i++) {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', '/speedtest/upload');
                xhr.onload = () => {
                  completed++;
                  if (completed === 4) {
                    const end = performance.now();
                    resolve(((uploadSize * 8) / (end - start) / 1000).toFixed(2));
                  }
                };
                xhr.send(new Uint8Array(part));
              }
            });

          const down = await downloadSpeed();
          const up = await uploadSpeed();
          await fetch('/tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              test_target: 'speedtest',
              speedtest_type: 'auto',
              download_mbps: parseFloat(down),
              upload_mbps: parseFloat(up),
            }),
          });
        } catch (err) {
          console.error('Speedtest failed', err);
        }

        await loadRecords();
      } catch (err) {
        console.error('Automatic tests failed', err);
      } finally {
        setLoading(false);
      }
    };

    runTests();
  }, []);

  const runPing = async () => {
    if (!pingTarget) return;
    setPingOutput('Running...');
    try {
      const res = await fetch(`/ping?host=${encodeURIComponent(pingTarget)}`);
      const data = await res.json();
      setPingOutput(data.output || data.error || 'No output');
    } catch (err) {
      console.error('Ping failed', err);
      setPingOutput('Ping failed');
    }
  };
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-purple-900 to-indigo-900 text-green-400 flex items-center justify-center p-4">
        <div>Running tests...</div>
      </div>
    );
  }

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
          <div>No info available</div>
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
          <h2 className="text-xl mb-2">Manual Tests</h2>
          <div className="flex justify-center space-x-2">
            <input
              className="px-2 py-1 rounded bg-gray-800 text-green-400"
              value={pingTarget}
              onChange={(e) => setPingTarget(e.target.value)}
              placeholder="Host"
            />
            <button
              className="px-4 py-1 rounded bg-green-600 text-black"
              onClick={runPing}
            >
              Ping
            </button>
          </div>
          {pingOutput && (
            <pre className="whitespace-pre-wrap text-left bg-black bg-opacity-50 p-2 rounded">
              {pingOutput}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

