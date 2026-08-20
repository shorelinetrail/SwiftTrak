import { MainLayout } from '@/components/layout/main-layout';

export default function VendorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
