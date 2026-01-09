'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const router = useRouter();
  const { user, setUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState(user?.full_name || '');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('users')
        .update({ full_name: fullName })
        .eq('id', user.id);

      if (error) throw error;

      setUser({ ...user, full_name: fullName });
      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen">
      <Header title="Profile" subtitle="Manage your account settings" />

      <div className="p-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Your Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <Avatar src={user.avatar_url} name={user.full_name} size="lg" />
              <div>
                <h3 className="text-lg font-medium text-gray-900">{user.full_name}</h3>
                <p className="text-sm text-gray-500">{user.email}</p>
                <p className="text-xs text-gray-400 mt-1">Role: {user.role}</p>
              </div>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <Input
                label="Full Name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />

              <Input
                label="Email"
                value={user.email}
                disabled
                hint="Email cannot be changed"
              />

              <div className="flex gap-3">
                <Button type="submit" loading={loading}>
                  Update Profile
                </Button>
                <Button type="button" variant="danger" onClick={handleSignOut}>
                  Sign Out
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
