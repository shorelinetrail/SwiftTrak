'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import toast from 'react-hot-toast';

export default function NewVendorPage() {
  const router = useRouter();
  const { user } = useAppStore();
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Vendor name is required');
      return;
    }

    setSaving(true);

    try {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('vendors')
        .insert({
          name: formData.name.trim(),
          contact_name: formData.contact_name.trim() || null,
          contact_email: formData.contact_email.trim() || null,
          contact_phone: formData.contact_phone.trim() || null,
          notes: formData.notes.trim() || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Create audit entry
      await supabase.from('vendor_audit').insert({
        vendor_id: data.id,
        user_id: user?.id,
        change_type: 'created',
        new_value: formData.name.trim(),
      });

      toast.success('Vendor created successfully');
      router.push(`/vendors/${data.id}`);
    } catch (error) {
      console.error('Error creating vendor:', error);
      toast.error('Failed to create vendor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="New Vendor"
        breadcrumbs={[
          { label: 'Vendors', href: '/vendors' },
          { label: 'New Vendor' },
        ]}
      />

      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Input
                label="Vendor Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter vendor name"
                required
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Contact Name"
                  value={formData.contact_name}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  placeholder="Primary contact"
                />
                <Input
                  label="Contact Email"
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  placeholder="contact@vendor.com"
                />
              </div>

              <Input
                label="Contact Phone"
                value={formData.contact_phone}
                onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                placeholder="+44 123 456 7890"
              />

              <Textarea
                label="Notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes about this vendor..."
                rows={4}
              />

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={saving}
                  disabled={saving}
                  className="flex-1"
                >
                  Create Vendor
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
