import type { PropsWithChildren } from 'react';

interface TestSectionProps {
  title: string;
}

export default function TestSection({ title, children }: PropsWithChildren<TestSectionProps>) {
  return (
    <div className="space-y-2 text-center bg-black bg-opacity-50 p-4 rounded">
      <h2 className="text-xl mb-2">{title}</h2>
      {children}
    </div>
  );
}

