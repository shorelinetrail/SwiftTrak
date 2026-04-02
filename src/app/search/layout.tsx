import { MainLayout } from '@/components/layout/main-layout';

export default function SearchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
