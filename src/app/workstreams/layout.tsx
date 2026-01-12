import { MainLayout } from '@/components/layout/main-layout';

export default function WorkstreamsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
