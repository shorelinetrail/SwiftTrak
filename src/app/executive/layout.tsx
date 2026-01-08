import { MainLayout } from '@/components/layout/main-layout';

export default function ExecutiveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
