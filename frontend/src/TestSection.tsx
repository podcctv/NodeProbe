import type { PropsWithChildren } from 'react';

interface TestSectionProps {
  title: string;
  className?: string;
}

export default function TestSection({
  title,
  className = '',
  children,
}: PropsWithChildren<TestSectionProps>) {
  return (
    <section className={`card text-center ${className}`}>
      <h2 className="card__title">{title}</h2>
      <div className="card__body space-y-2">{children}</div>
    </section>
  );
}

