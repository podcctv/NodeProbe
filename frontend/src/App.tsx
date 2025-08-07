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
  const [tests, setTests] = useState<TestRecord[]>([]);

  const loadTests = async () => {
    try {
      const res = await fetch('/tests');
      setTests(await res.json());
    } catch (err) {
      console.error('Failed to load tests', err);
    }
  };

  useEffect(() => {
    loadTests();
  }, []);

  const startTest = async () => {
    try {
      await fetch('/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // For now send minimal mock data. Real implementation should
        // collect actual network diagnostics here.
        body: JSON.stringify({ ping_ms: Math.random() * 100 }),
      });
      await loadTests();
    } catch (err) {
      console.error('Failed to create test record', err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-purple-900 to-indigo-900 text-green-400 flex flex-col items-center justify-center gap-4 p-4">
      <button
        onClick={startTest}
        className="px-6 py-3 border border-green-400 hover:bg-green-400 hover:text-black transition"
      >
        Start Test
      </button>
      <pre className="w-full max-w-3xl bg-black/50 p-4 overflow-auto rounded-md">
        {JSON.stringify(tests, null, 2)}
      </pre>
    </div>
  );
}

export default App;
