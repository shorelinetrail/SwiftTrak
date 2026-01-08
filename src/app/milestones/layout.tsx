import { MainLayout } from '@/components/layout/main-layout';

export default function MilestonesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
