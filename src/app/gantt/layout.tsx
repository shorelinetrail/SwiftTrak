import { MainLayout } from '@/components/layout/main-layout';

export default function GanttLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
