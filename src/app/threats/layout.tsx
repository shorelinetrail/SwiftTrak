import { MainLayout } from '@/components/layout/main-layout';

export default function ThreatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
