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
  DocumentTextIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import type { Vendor, VendorActivity, VendorAudit, VendorActivityStatus, VendorContact, Action, User } from '@/types/database';

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
  const [contacts, setContacts] = useState<VendorContact[]>([]);
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
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<VendorContact | null>(null);

  // Form states
  const [vendorForm, setVendorForm] = useState({
    name: '',
    vendor_number: '',
    notes: '',
  });

  const [contactForm, setContactForm] = useState({
    name: '',
    job_title: '',
    email: '',
    phone: '',
    is_primary: false,
  });

  const [activityForm, setActivityForm] = useState({
    description: '',
    purchase_order: '',
    purchase_order_value: '',
    start_date: '',
    end_date: '',
    dates_confirmed: false,
    status: 'in_progress' as VendorActivityStatus,
    notes: '',
  });

  const [selectedActionId, setSelectedActionId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchVendor = useCallback(async () => {
    const supabase = createClient();

    const [vendorRes, contactsRes, activitiesRes, linksRes, auditRes, actionsRes] = await Promise.all([
      supabase
        .from('vendors')
        .select('*, creator:users!vendors_created_by_fkey(id, full_name)')
        .eq('id', vendorId)
        .single(),
      supabase
        .from('vendor_contacts')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('is_primary', { ascending: false })
        .order('name'),
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
      vendor_number: vendorRes.data.vendor_number || '',
      notes: vendorRes.data.notes || '',
    });

    setContacts((contactsRes.data || []) as VendorContact[]);
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
      if (vendor?.vendor_number !== vendorForm.vendor_number) {
        changes.push({ field: 'vendor_number', old_value: vendor?.vendor_number || '', new_value: vendorForm.vendor_number });
      }

      const { error } = await supabase
        .from('vendors')
        .update({
          name: vendorForm.name.trim(),
          vendor_number: vendorForm.vendor_number.trim() || null,
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

  const handleSaveContact = async () => {
    if (!contactForm.name.trim()) {
      toast.error('Contact name is required');
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();

      // If setting as primary, unset other primary contacts first
      if (contactForm.is_primary) {
        await supabase
          .from('vendor_contacts')
          .update({ is_primary: false })
          .eq('vendor_id', vendorId);
      }

      if (editingContact) {
        const { error } = await supabase
          .from('vendor_contacts')
          .update({
            name: contactForm.name.trim(),
            job_title: contactForm.job_title.trim() || null,
            email: contactForm.email.trim() || null,
            phone: contactForm.phone.trim() || null,
            is_primary: contactForm.is_primary,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingContact.id);

        if (error) throw error;
        toast.success('Contact updated');
      } else {
        const { error } = await supabase.from('vendor_contacts').insert({
          vendor_id: vendorId,
          name: contactForm.name.trim(),
          job_title: contactForm.job_title.trim() || null,
          email: contactForm.email.trim() || null,
          phone: contactForm.phone.trim() || null,
          is_primary: contactForm.is_primary,
          created_by: user?.id,
        });

        if (error) throw error;
        toast.success('Contact added');
      }

      setContactModalOpen(false);
      setEditingContact(null);
      resetContactForm();
      fetchVendor();
    } catch (error) {
      console.error('Error saving contact:', error);
      toast.error('Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.from('vendor_contacts').delete().eq('id', contactId);

      if (error) throw error;

      toast.success('Contact deleted');
      fetchVendor();
    } catch (error) {
      console.error('Error deleting contact:', error);
      toast.error('Failed to delete contact');
    }
  };

  const openEditContact = (contact: VendorContact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name,
      job_title: contact.job_title || '',
      email: contact.email || '',
      phone: contact.phone || '',
      is_primary: contact.is_primary,
    });
    setContactModalOpen(true);
  };

  const resetContactForm = () => {
    setContactForm({
      name: '',
      job_title: '',
      email: '',
      phone: '',
      is_primary: false,
    });
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
        provisional_start_date: activityForm.dates_confirmed ? null : (activityForm.start_date || null),
        provisional_end_date: activityForm.dates_confirmed ? null : (activityForm.end_date || null),
        confirmed_start_date: activityForm.dates_confirmed ? (activityForm.start_date || null) : null,
        confirmed_end_date: activityForm.dates_confirmed ? (activityForm.end_date || null) : null,
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
    const hasConfirmedDates = !!(activity.confirmed_start_date || activity.confirmed_end_date);
    setActivityForm({
      description: activity.description,
      purchase_order: activity.purchase_order || '',
      purchase_order_value: activity.purchase_order_value?.toString() || '',
      start_date: hasConfirmedDates
        ? (activity.confirmed_start_date || '')
        : (activity.provisional_start_date || ''),
      end_date: hasConfirmedDates
        ? (activity.confirmed_end_date || '')
        : (activity.provisional_end_date || ''),
      dates_confirmed: hasConfirmedDates,
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
      start_date: '',
      end_date: '',
      dates_confirmed: false,
      status: 'in_progress',
      notes: '',
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
  };

  // Compute activity status from dates
  const getComputedStatus = (activity: VendorActivityWithRelations): { label: string; color: string } => {
    // Manual overrides take precedence
    if (activity.status === 'complete') {
      return { label: 'Complete', color: 'bg-green-100 text-green-800' };
    }
    if (activity.status === 'cancelled') {
      return { label: 'Cancelled', color: 'bg-red-100 text-red-800' };
    }

    const hasConfirmedDates = !!(activity.confirmed_start_date || activity.confirmed_end_date);

    if (!hasConfirmedDates) {
      return { label: 'Provisional', color: 'bg-gray-100 text-gray-800' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = activity.confirmed_start_date ? new Date(activity.confirmed_start_date) : null;
    const endDate = activity.confirmed_end_date ? new Date(activity.confirmed_end_date) : null;

    if (startDate && today < startDate) {
      return { label: 'Pending', color: 'bg-blue-100 text-blue-800' };
    }

    if (endDate && today > endDate) {
      return { label: 'Complete', color: 'bg-green-100 text-green-800' };
    }

    return { label: 'In Progress', color: 'bg-yellow-100 text-yellow-800' };
  };

  const statusOptions = [
    { value: 'complete', label: 'Complete' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const availableActions = allActions.filter(a => !linkedActions.find(la => la.id === a.id));

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header
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
        breadcrumbs={[
          { label: 'Vendors', href: '/vendors' },
          { label: vendor.name },
        ]}
      />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vendor Info */}
          <Card>
            <CardContent className="pt-6">
              {/* Title and Actions Row */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  {vendor.vendor_number && (
                    <span className="text-sm font-mono text-gray-500 block mb-1">{vendor.vendor_number}</span>
                  )}
                  <h1 className="text-2xl font-bold text-gray-900">{vendor.name}</h1>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
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
              </div>

              {/* Value Badge */}
              {totalValue > 0 && (
                <div className="flex items-center flex-wrap gap-2 mb-6">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Total PO: {formatCurrency(totalValue)}
                  </span>
                </div>
              )}

              {/* Notes */}
              {vendor.notes && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Notes</h3>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{vendor.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Contacts */}
          <Card>
            <CardHeader
              actions={
                canEdit && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingContact(null);
                      resetContactForm();
                      setContactModalOpen(true);
                    }}
                  >
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Add Contact
                  </Button>
                )
              }
            >
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-gray-400" />
                Contacts ({contacts.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {contacts.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No contacts yet</p>
              ) : (
                <div className="space-y-3">
                  {contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{contact.name}</p>
                          {contact.is_primary && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              Primary
                            </span>
                          )}
                        </div>
                        {contact.job_title && (
                          <p className="text-sm text-gray-600">{contact.job_title}</p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-500">
                          {contact.email && <span>{contact.email}</span>}
                          {contact.phone && <span>{contact.phone}</span>}
                        </div>
                      </div>
                      {canEdit && (
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={() => openEditContact(contact)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteContact(contact.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activities */}
          <Card>
            <CardHeader
              actions={
                canEdit && (
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
                )
              }
            >
              <CardTitle className="flex items-center gap-2">
                <DocumentTextIcon className="w-5 h-5 text-gray-400" />
                Activities ({activities.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No activities yet</p>
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
                            {(() => {
                              const status = getComputedStatus(activity);
                              return (
                                <span className={cn(
                                  'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                                  status.color
                                )}>
                                  {status.label}
                                </span>
                              );
                            })()}
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
                            {(activity.confirmed_start_date || activity.confirmed_end_date) ? (
                              <div>
                                <span className="text-gray-500">Dates (Confirmed)</span>
                                <p className="font-medium text-green-600">
                                  {activity.confirmed_start_date && formatDate(activity.confirmed_start_date, { month: 'short', day: 'numeric' })}
                                  {activity.confirmed_start_date && activity.confirmed_end_date && ' - '}
                                  {activity.confirmed_end_date && formatDate(activity.confirmed_end_date, { month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                            ) : (activity.provisional_start_date || activity.provisional_end_date) ? (
                              <div>
                                <span className="text-gray-500">Dates (Provisional)</span>
                                <p className="font-medium text-amber-600">
                                  {activity.provisional_start_date && formatDate(activity.provisional_start_date, { month: 'short', day: 'numeric' })}
                                  {activity.provisional_start_date && activity.provisional_end_date && ' - '}
                                  {activity.provisional_end_date && formatDate(activity.provisional_end_date, { month: 'short', day: 'numeric' })}
                                </p>
                              </div>
                            ) : null}
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
            <CardHeader
              actions={
                canEdit && (
                  <Button size="sm" variant="outline" onClick={() => setLinkActionModalOpen(true)}>
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Link Action
                  </Button>
                )
              }
            >
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-gray-400" />
                Linked Actions ({linkedActions.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {linkedActions.length === 0 ? (
                <p className="text-center text-gray-500 py-4">No linked actions</p>
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
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Vendor Name"
              value={vendorForm.name}
              onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })}
              required
            />
            <Input
              label="Vendor Number"
              value={vendorForm.vendor_number}
              onChange={(e) => setVendorForm({ ...vendorForm, vendor_number: e.target.value })}
              placeholder="e.g., V-001"
            />
          </div>
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

      {/* Contact Modal */}
      <Modal
        open={contactModalOpen}
        onClose={() => {
          setContactModalOpen(false);
          setEditingContact(null);
          resetContactForm();
        }}
        title={editingContact ? 'Edit Contact' : 'Add Contact'}
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={contactForm.name}
            onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
            required
          />
          <Input
            label="Job Title"
            value={contactForm.job_title}
            onChange={(e) => setContactForm({ ...contactForm, job_title: e.target.value })}
            placeholder="e.g. Account Manager"
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Email"
              type="email"
              value={contactForm.email}
              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
            />
            <Input
              label="Phone"
              value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={contactForm.is_primary}
              onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })}
              className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">Primary contact</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button
            variant="outline"
            onClick={() => {
              setContactModalOpen(false);
              setEditingContact(null);
              resetContactForm();
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSaveContact} loading={saving}>
            {editingContact ? 'Update Contact' : 'Add Contact'}
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
              label="Start Date"
              type="date"
              value={activityForm.start_date}
              onChange={(e) => setActivityForm({ ...activityForm, start_date: e.target.value })}
            />
            <Input
              label="End Date"
              type="date"
              value={activityForm.end_date}
              onChange={(e) => setActivityForm({ ...activityForm, end_date: e.target.value })}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={activityForm.dates_confirmed}
              onChange={(e) => setActivityForm({ ...activityForm, dates_confirmed: e.target.checked })}
              className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">Dates confirmed</span>
          </label>

          <Select
            label="Status Override (optional)"
            options={[
              { value: '', label: 'Auto (based on dates)' },
              ...statusOptions,
            ]}
            value={activityForm.status === 'in_progress' ? '' : activityForm.status}
            onChange={(value) => setActivityForm({ ...activityForm, status: (value || 'in_progress') as VendorActivityStatus })}
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
