import { useEffect, useState } from 'react';

interface TestRecord {
  id: number;
  timestamp: string;
  client_ip?: string | null;
  location?: string | null;
  asn?: string | null;
  isp?: string | null;
  ping_ms?: number | null;
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
        if (data.client_ip) {
          setPingTarget(data.client_ip);
        }
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
                    <th className="px-2 py-1 text-left">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {records
                    .slice(-5)
                    .reverse()
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

