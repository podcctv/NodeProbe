import type { PropsWithChildren, ReactNode } from 'react';
import Card from './Card';

interface TestSectionProps {
  title: string;
  className?: string;
  footer?: ReactNode;
}

export default function TestSection({
  title,
  className = '',
  children,
  footer,
}: PropsWithChildren<TestSectionProps>) {
  return (
    <Card title={title} className={className} footer={footer}>
      {children}
    </Card>
  );
}
