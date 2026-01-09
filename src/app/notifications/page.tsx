'use client';

import { redirect } from 'next/navigation';

export default function NotificationsPage() {
  // Redirect to dashboard - notifications are shown in the header
  redirect('/dashboard');
}
