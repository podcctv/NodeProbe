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

function App() {
  const [info, setInfo] = useState<TestRecord | null>(null);

  useEffect(() => {
    const collect = async () => {
      try {
        const res = await fetch('/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        setInfo(await res.json());
      } catch (err) {
        console.error('Failed to collect info', err);
      }
    };
    collect();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-900 to-indigo-900 text-green-400 flex items-center justify-center p-4">
      {info ? (
        <div className="space-y-2 text-center">
          <h1 className="text-xl mb-4">Your Connection Info</h1>
          <div>IP: {info.client_ip}</div>
          {info.location && <div>Location: {info.location}</div>}
          {info.asn && <div>ASN: {info.asn}</div>}
          {info.isp && <div>ISP: {info.isp}</div>}
          <div className="text-sm text-gray-400">Recorded at: {new Date(info.timestamp).toLocaleString()}</div>
        </div>
      ) : (
        <div>Loading...</div>
      )}
    </div>
  );
}

export default App;
