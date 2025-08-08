import type { PropsWithChildren } from 'react';

interface TestSectionProps {
  title: string;
}

export default function TestSection({ title, children }: PropsWithChildren<TestSectionProps>) {
  return (
    <section className="my-5 text-center rounded-lg border border-[rgba(0,255,0,0.2)] bg-black/50 shadow-[0_0_10px_rgba(0,255,0,0.1)]">
      <h2 className="text-2xl font-bold border-b border-[rgba(0,255,0,0.2)] bg-[rgb(0,50,0)] px-4 py-2 rounded-t-lg">
        {title}
      </h2>
      <div className="p-4 space-y-2">{children}</div>
    </section>
  );
}

