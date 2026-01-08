import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SwiftTrak - Crisis Management System',
  description: 'Swift and precise tracking of work fronts during crisis situations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
