import type { ReactNode } from 'react';

interface CardProps {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export default function Card({ title, children, footer, className = '' }: CardProps) {
  return (
    <section className={`rounded-2xl border border-emerald-900/40 bg-emerald-900/10 backdrop-blur p-4 lg:p-6 shadow-[0_0_30px_rgba(0,128,0,0.12)] ${className}`}>
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-emerald-300 text-sm font-semibold tracking-wide">{title}</h3>
        {footer}
      </header>
      {children}
    </section>
  );
}
