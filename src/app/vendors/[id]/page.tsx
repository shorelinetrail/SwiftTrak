'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { LoadingSpinner } from '@/components/ui/loading';
import { StatusBadge, PriorityBadge } from '@/components/ui/badge';
import { formatDate, getRelativeTime, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  PencilIcon,
  TrashIcon,
  PlusIcon,
  ClockIcon,
  LinkIcon,
  BuildingOfficeIcon,
  CurrencyPoundIcon,
  CalendarIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import type { Vendor, VendorActivity, VendorAudit, VendorActivityStatus, Action, User } from '@/types/database';

type VendorWithRelations = Vendor & {
  creator?: User;
};

type VendorActivityWithRelations = VendorActivity & {
  creator?: User;
};

type LinkedAction = Action & {
  owner?: User;
};

export default function VendorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vendorId = params.id as string;

  const { user } = useAppStore();
  const { canEdit, canAdmin } = usePermission();
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<VendorWithRelations | null>(null);
  const [activities, setActivities] = useState<VendorActivityWithRelations[]>([]);
  const [linkedActions, setLinkedActions] = useState<LinkedAction[]>([]);
  const [auditLog, setAuditLog] = useState<(VendorAudit & { user?: User })[]>([]);
  const [allActions, setAllActions] = useState<LinkedAction[]>([]);

  // Modal states
  const [editVendorModalOpen, setEditVendorModalOpen] = useState(false);
  const [deleteVendorModalOpen, setDeleteVendorModalOpen] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<VendorActivityWithRelations | null>(null);
  const [linkActionModalOpen, setLinkActionModalOpen] = useState(false);

  // Form states
  const [vendorForm, setVendorForm] = useState({
    name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    notes: '',
  });

  const [activityForm, setActivityForm] = useState({
    description: '',
    purchase_order: '',
    purchase_order_value: '',
    provisional_start_date: '',
    provisional_end_date: '',
    confirmed_start_date: '',
    confirmed_end_date: '',
    status: 'planned' as VendorActivityStatus,
    notes: '',
  });

  const [selectedActionId, setSelectedActionId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchVendor = useCallback(async () => {
    const supabase = createClient();

    const [vendorRes, activitiesRes, linksRes, auditRes, actionsRes] = await Promise.all([
      supabase
        .from('vendors')
        .select('*, creator:users!vendors_created_by_fkey(id, full_name)')
        .eq('id', vendorId)
        .single(),
      supabase
        .from('vendor_activities')
        .select('*, creator:users!vendor_activities_created_by_fkey(id, full_name)')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false }),
      supabase
        .from('vendor_action_links')
        .select('action_id')
        .eq('vendor_id', vendorId),
      supabase
        .from('vendor_audit')
        .select('*, user:users(id, full_name)')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false }),
      supabase
        .from('actions')
        .select('*, owner:users!actions_owner_id_fkey(id, full_name)')
        .order('created_at', { ascending: false }),
    ]);

    if (vendorRes.error || !vendorRes.data) {
      toast.error('Vendor not found');
      router.push('/vendors');
      return;
    }

    setVendor(vendorRes.data as VendorWithRelations);
    setVendorForm({
      name: vendorRes.data.name,
      contact_name: vendorRes.data.contact_name || '',
      contact_email: vendorRes.data.contact_email || '',
      contact_phone: vendorRes.data.contact_phone || '',
      notes: vendorRes.data.notes || '',
    });

    setActivities((activitiesRes.data || []) as VendorActivityWithRelations[]);
    setAuditLog((auditRes.data || []) as (VendorAudit & { user?: User })[]);
    setAllActions((actionsRes.data || []) as LinkedAction[]);

    // Fetch linked actions
    if (linksRes.data && linksRes.data.length > 0) {
      const actionIds = linksRes.data.map(l => l.action_id);
      const { data: linkedData } = await supabase
        .from('actions')
        .select('*, owner:users!actions_owner_id_fkey(id, full_name)')
        .in('id', actionIds);
      setLinkedActions((linkedData || []) as LinkedAction[]);
    } else {
      setLinkedActions([]);
    }

    setLoading(false);
  }, [vendorId, router]);

  useEffect(() => {
    fetchVendor();
  }, [fetchVendor]);

  const handleSaveVendor = async () => {
    if (!vendorForm.name.trim()) {
      toast.error('Vendor name is required');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // Track changes for audit
      const changes: { field: string; old_value: string; new_value: string }[] = [];
      if (vendor?.name !== vendorForm.name) {
        changes.push({ field: 'name', old_value: vendor?.name || '', new_value: vendorForm.name });
      }
      if (vendor?.contact_name !== vendorForm.contact_name) {
        changes.push({ field: 'contact_name', old_value: vendor?.contact_name || '', new_value: vendorForm.contact_name });
      }
      if (vendor?.contact_email !== vendorForm.contact_email) {
        changes.push({ field: 'contact_email', old_value: vendor?.contact_email || '', new_value: vendorForm.contact_email });
      }
      if (vendor?.contact_phone !== vendorForm.contact_phone) {
        changes.push({ field: 'contact_phone', old_value: vendor?.contact_phone || '', new_value: vendorForm.contact_phone });
      }

      const { error } = await supabase
        .from('vendors')
        .update({
          name: vendorForm.name.trim(),
          contact_name: vendorForm.contact_name.trim() || null,
          contact_email: vendorForm.contact_email.trim() || null,
          contact_phone: vendorForm.contact_phone.trim() || null,
          notes: vendorForm.notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', vendorId);

      if (error) throw error;

      // Create audit entries
      for (const change of changes) {
        await supabase.from('vendor_audit').insert({
          vendor_id: vendorId,
          user_id: user?.id,
          change_type: 'updated',
          field_name: change.field,
          old_value: change.old_value,
          new_value: change.new_value,
        });
      }

      toast.success('Vendor updated');
      setEditVendorModalOpen(false);
      fetchVendor();
    } catch (error) {
      console.error('Error updating vendor:', error);
      toast.error('Failed to update vendor');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVendor = async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from('vendors').delete().eq('id', vendorId);

      if (error) throw error;

      toast.success('Vendor deleted');
      router.push('/vendors');
    } catch (error) {
      console.error('Error deleting vendor:', error);
      toast.error('Failed to delete vendor');
    }
  };

  const handleSaveActivity = async () => {
    if (!activityForm.description.trim()) {
      toast.error('Activity description is required');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      const activityData = {
        vendor_id: vendorId,
        description: activityForm.description.trim(),
        purchase_order: activityForm.purchase_order.trim() || null,
        purchase_order_value: activityForm.purchase_order_value ? parseFloat(activityForm.purchase_order_value) : null,
        provisional_start_date: activityForm.provisional_start_date || null,
        provisional_end_date: activityForm.provisional_end_date || null,
        confirmed_start_date: activityForm.confirmed_start_date || null,
        confirmed_end_date: activityForm.confirmed_end_date || null,
        status: activityForm.status,
        notes: activityForm.notes.trim() || null,
        created_by: user?.id,
      };

      if (editingActivity) {
        const { error } = await supabase
          .from('vendor_activities')
          .update({ ...activityData, updated_at: new Date().toISOString() })
          .eq('id', editingActivity.id);

        if (error) throw error;

        await supabase.from('vendor_activity_audit').insert({
          activity_id: editingActivity.id,
          vendor_id: vendorId,
          user_id: user?.id,
          change_type: 'updated',
        });

        toast.success('Activity updated');
      } else {
        const { data, error } = await supabase.from('vendor_activities').insert(activityData).select().single();

        if (error) throw error;

        await supabase.from('vendor_activity_audit').insert({
          activity_id: data.id,
          vendor_id: vendorId,
          user_id: user?.id,
          change_type: 'created',
          new_value: activityForm.description.trim(),
        });

        toast.success('Activity added');
      }

      setActivityModalOpen(false);
      setEditingActivity(null);
      resetActivityForm();
      fetchVendor();
    } catch (error) {
      console.error('Error saving activity:', error);
      toast.error('Failed to save activity');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    if (!confirm('Are you sure you want to delete this activity?')) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.from('vendor_activities').delete().eq('id', activityId);

      if (error) throw error;

      toast.success('Activity deleted');
      fetchVendor();
    } catch (error) {
      console.error('Error deleting activity:', error);
      toast.error('Failed to delete activity');
    }
  };

  const handleLinkAction = async () => {
    if (!selectedActionId) {
      toast.error('Please select an action');
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.from('vendor_action_links').insert({
        vendor_id: vendorId,
        action_id: selectedActionId,
        created_by: user?.id,
      });

      if (error) {
        if (error.code === '23505') {
          toast.error('This action is already linked');
        } else {
          throw error;
        }
        return;
      }

      await supabase.from('vendor_audit').insert({
        vendor_id: vendorId,
        user_id: user?.id,
        change_type: 'action_linked',
        new_value: selectedActionId,
      });

      toast.success('Action linked');
      setLinkActionModalOpen(false);
      setSelectedActionId('');
      fetchVendor();
    } catch (error) {
      console.error('Error linking action:', error);
      toast.error('Failed to link action');
    }
  };

  const handleUnlinkAction = async (actionId: string) => {
    if (!confirm('Unlink this action from the vendor?')) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('vendor_action_links')
        .delete()
        .eq('vendor_id', vendorId)
        .eq('action_id', actionId);

      if (error) throw error;

      await supabase.from('vendor_audit').insert({
        vendor_id: vendorId,
        user_id: user?.id,
        change_type: 'action_unlinked',
        old_value: actionId,
      });

      toast.success('Action unlinked');
      fetchVendor();
    } catch (error) {
      console.error('Error unlinking action:', error);
      toast.error('Failed to unlink action');
    }
  };

  const openEditActivity = (activity: VendorActivityWithRelations) => {
    setEditingActivity(activity);
    setActivityForm({
      description: activity.description,
      purchase_order: activity.purchase_order || '',
      purchase_order_value: activity.purchase_order_value?.toString() || '',
      provisional_start_date: activity.provisional_start_date || '',
      provisional_end_date: activity.provisional_end_date || '',
      confirmed_start_date: activity.confirmed_start_date || '',
      confirmed_end_date: activity.confirmed_end_date || '',
      status: activity.status,
      notes: activity.notes || '',
    });
    setActivityModalOpen(true);
  };

  const resetActivityForm = () => {
    setActivityForm({
      description: '',
      purchase_order: '',
      purchase_order_value: '',
      provisional_start_date: '',
      provisional_end_date: '',
      confirmed_start_date: '',
      confirmed_end_date: '',
      status: 'planned',
      notes: '',
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
  };

  const getStatusBadgeColor = (status: VendorActivityStatus) => {
    switch (status) {
      case 'planned': return 'bg-gray-100 text-gray-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      case 'complete': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const statusOptions = [
    { value: 'planned', label: 'Planned' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const availableActions = allActions.filter(a => !linkedActions.find(la => la.id === a.id));

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header
          title="Loading..."
          breadcrumbs={[
            { label: 'Vendors', href: '/vendors' },
            { label: 'Loading...' },
          ]}
        />
        <div className="p-6 flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (!vendor) return null;

  const totalValue = activities.reduce((sum, a) => sum + (a.purchase_order_value || 0), 0);

  return (
    <div className="min-h-screen">
      <Header
        title={vendor.name}
        subtitle="Vendor"
        breadcrumbs={[
          { label: 'Vendors', href: '/vendors' },
          { label: vendor.name },
        ]}
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditVendorModalOpen(true)}>
                <PencilIcon className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
            {canAdmin && (
              <Button variant="danger" size="sm" onClick={() => setDeleteVendorModalOpen(true)}>
                <TrashIcon className="w-4 h-4" />
              </Button>
            )}
          </div>
        }
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vendor Info */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                  <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-gray-900">{vendor.name}</h2>
                  {vendor.contact_name && (
                    <p className="text-sm text-gray-500">Contact: {vendor.contact_name}</p>
                  )}
                </div>
                {totalValue > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Total PO Value</p>
                    <p className="text-lg font-semibold text-gray-900">{formatCurrency(totalValue)}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                {vendor.contact_email && (
                  <div>
                    <span className="text-gray-500">Email</span>
                    <p className="mt-1 font-medium">{vendor.contact_email}</p>
                  </div>
                )}
                {vendor.contact_phone && (
                  <div>
                    <span className="text-gray-500">Phone</span>
                    <p className="mt-1 font-medium">{vendor.contact_phone}</p>
                  </div>
                )}
              </div>

              {vendor.notes && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <span className="text-sm text-gray-500">Notes</span>
                  <p className="mt-1 text-sm text-gray-700">{vendor.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activities */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <DocumentTextIcon className="w-5 h-5 text-gray-400" />
                Activities ({activities.length})
              </CardTitle>
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingActivity(null);
                    resetActivityForm();
                    setActivityModalOpen(true);
                  }}
                >
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Add Activity
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No activities yet</p>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-medium text-gray-900">{activity.description}</h4>
                            <span className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                              getStatusBadgeColor(activity.status)
                            )}>
                              {activity.status.replace('_', ' ')}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            {activity.purchase_order && (
                              <div>
                                <span className="text-gray-500">PO Number</span>
                                <p className="font-medium">{activity.purchase_order}</p>
                              </div>
                            )}
                            {activity.purchase_order_value && (
                              <div>
                                <span className="text-gray-500">PO Value</span>
                                <p className="font-medium">{formatCurrency(activity.purchase_order_value)}</p>
                              </div>
                            )}
                            {(activity.provisional_start_date || activity.provisional_end_date) && (
                              <div>
                                <span className="text-gray-500">Provisional Dates</span>
                                <p className="font-medium text-amber-600">
                                  {activity.provisional_start_date && formatDate(activity.provisional_start_date, { month: 'short', day: 'numeric' })}
                                  {activity.provisional_start_date && activity.provisional_end_date && ' - '}
                                  {activity.provisional_end_date && formatDate(activity.provisional_end_date, { month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                            )}
                            {(activity.confirmed_start_date || activity.confirmed_end_date) && (
                              <div>
                                <span className="text-gray-500">Confirmed Dates</span>
                                <p className="font-medium text-green-600">
                                  {activity.confirmed_start_date && formatDate(activity.confirmed_start_date, { month: 'short', day: 'numeric' })}
                                  {activity.confirmed_start_date && activity.confirmed_end_date && ' - '}
                                  {activity.confirmed_end_date && formatDate(activity.confirmed_end_date, { month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                            )}
                          </div>

                          {activity.notes && (
                            <p className="mt-2 text-sm text-gray-600">{activity.notes}</p>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => openEditActivity(activity)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteActivity(activity.id)}
                              className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Linked Actions */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-gray-400" />
                Linked Actions ({linkedActions.length})
              </CardTitle>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setLinkActionModalOpen(true)}>
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Link Action
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {linkedActions.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No linked actions</p>
              ) : (
                <div className="space-y-2">
                  {linkedActions.map((action) => (
                    <div
                      key={action.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <Link href={`/actions/${action.id}`} className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate hover:underline">
                              {action.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <StatusBadge status={action.status} />
                              <PriorityBadge priority={action.priority} />
                              {action.owner && (
                                <span className="text-xs text-gray-500">{action.owner.full_name}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                      {canEdit && (
                        <button
                          onClick={() => handleUnlinkAction(action.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded ml-2"
                          title="Unlink action"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Audit Trail */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClockIcon className="w-5 h-5 text-gray-400" />
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              {auditLog.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No history</p>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {auditLog.map((entry) => (
                    <div key={entry.id} className="relative pl-4 border-l-2 border-gray-200">
                      <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-gray-300" />
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{entry.user?.full_name || 'System'}</span>
                        {' '}
                        {formatAuditEntry(entry)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {getRelativeTime(entry.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Vendor Modal */}
      <Modal
        open={editVendorModalOpen}
        onClose={() => setEditVendorModalOpen(false)}
        title="Edit Vendor"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Vendor Name"
            value={vendorForm.name}
            onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Contact Name"
              value={vendorForm.contact_name}
              onChange={(e) => setVendorForm({ ...vendorForm, contact_name: e.target.value })}
            />
            <Input
              label="Contact Email"
              type="email"
              value={vendorForm.contact_email}
              onChange={(e) => setVendorForm({ ...vendorForm, contact_email: e.target.value })}
            />
          </div>
          <Input
            label="Contact Phone"
            value={vendorForm.contact_phone}
            onChange={(e) => setVendorForm({ ...vendorForm, contact_phone: e.target.value })}
          />
          <Textarea
            label="Notes"
            value={vendorForm.notes}
            onChange={(e) => setVendorForm({ ...vendorForm, notes: e.target.value })}
            rows={3}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => setEditVendorModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveVendor} loading={saving}>
            Save Changes
          </Button>
        </div>
      </Modal>

      {/* Delete Vendor Modal */}
      <Modal
        open={deleteVendorModalOpen}
        onClose={() => setDeleteVendorModalOpen(false)}
        title="Delete Vendor"
      >
        <p className="text-gray-600 mb-4">
          Are you sure you want to delete this vendor? This will also delete all activities and unlink all actions.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setDeleteVendorModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteVendor}>
            <TrashIcon className="w-4 h-4 mr-2" />
            Delete Vendor
          </Button>
        </div>
      </Modal>

      {/* Activity Modal */}
      <Modal
        open={activityModalOpen}
        onClose={() => {
          setActivityModalOpen(false);
          setEditingActivity(null);
          resetActivityForm();
        }}
        title={editingActivity ? 'Edit Activity' : 'Add Activity'}
        size="lg"
      >
        <div className="space-y-4">
          <Textarea
            label="Activity Description"
            value={activityForm.description}
            onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
            placeholder="Describe the vendor activity..."
            rows={2}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Purchase Order Number"
              value={activityForm.purchase_order}
              onChange={(e) => setActivityForm({ ...activityForm, purchase_order: e.target.value })}
              placeholder="PO-12345"
            />
            <Input
              label="PO Value"
              type="number"
              step="0.01"
              value={activityForm.purchase_order_value}
              onChange={(e) => setActivityForm({ ...activityForm, purchase_order_value: e.target.value })}
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Provisional Start Date"
              type="date"
              value={activityForm.provisional_start_date}
              onChange={(e) => setActivityForm({ ...activityForm, provisional_start_date: e.target.value })}
            />
            <Input
              label="Provisional End Date"
              type="date"
              value={activityForm.provisional_end_date}
              onChange={(e) => setActivityForm({ ...activityForm, provisional_end_date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Confirmed Start Date"
              type="date"
              value={activityForm.confirmed_start_date}
              onChange={(e) => setActivityForm({ ...activityForm, confirmed_start_date: e.target.value })}
            />
            <Input
              label="Confirmed End Date"
              type="date"
              value={activityForm.confirmed_end_date}
              onChange={(e) => setActivityForm({ ...activityForm, confirmed_end_date: e.target.value })}
            />
          </div>

          <Select
            label="Status"
            options={statusOptions}
            value={activityForm.status}
            onChange={(value) => setActivityForm({ ...activityForm, status: value as VendorActivityStatus })}
          />

          <Textarea
            label="Notes"
            value={activityForm.notes}
            onChange={(e) => setActivityForm({ ...activityForm, notes: e.target.value })}
            placeholder="Additional notes..."
            rows={2}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button
            variant="outline"
            onClick={() => {
              setActivityModalOpen(false);
              setEditingActivity(null);
              resetActivityForm();
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSaveActivity} loading={saving}>
            {editingActivity ? 'Update Activity' : 'Add Activity'}
          </Button>
        </div>
      </Modal>

      {/* Link Action Modal */}
      <Modal
        open={linkActionModalOpen}
        onClose={() => {
          setLinkActionModalOpen(false);
          setSelectedActionId('');
        }}
        title="Link Action to Vendor"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Select an action to link to this vendor for tracking.
          </p>
          <Select
            label="Action"
            options={[
              { value: '', label: 'Select an action...' },
              ...availableActions.map(a => ({
                value: a.id,
                label: `${a.title}${a.owner ? ` (${a.owner.full_name})` : ''}`,
              })),
            ]}
            value={selectedActionId}
            onChange={setSelectedActionId}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button
            variant="outline"
            onClick={() => {
              setLinkActionModalOpen(false);
              setSelectedActionId('');
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleLinkAction} disabled={!selectedActionId}>
            <LinkIcon className="w-4 h-4 mr-2" />
            Link Action
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function formatAuditEntry(entry: VendorAudit): string {
  switch (entry.change_type) {
    case 'created':
      return `created this vendor`;
    case 'updated':
      if (entry.field_name) {
        return `updated ${entry.field_name.replace('_', ' ')}`;
      }
      return 'updated vendor details';
    case 'action_linked':
      return 'linked an action';
    case 'action_unlinked':
      return 'unlinked an action';
    default:
      return 'made changes';
  }
}
