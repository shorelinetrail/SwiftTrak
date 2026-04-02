import { MainLayout } from '@/components/layout/main-layout';

export default function UpdatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
