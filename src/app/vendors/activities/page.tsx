'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, MultiSelect } from '@/components/ui/select';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { TableWrapper } from '@/components/ui/table';
import { formatDate, cn } from '@/lib/utils';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  BuildingOfficeIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { VendorActivity, Vendor, User, VendorActivityStatus } from '@/types/database';

type VendorActivityWithRelations = VendorActivity & {
  vendor?: Vendor;
  creator?: User;
};

type SortField = 'vendor' | 'description' | 'purchase_requisition' | 'purchase_order' | 'purchase_order_value' | 'start_date' | 'status' | 'created_at';
type SortDirection = 'asc' | 'desc';

const statusOptions = [
  { value: 'planned', label: 'Planned' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'cancelled', label: 'Cancelled' },
];

const getStatusStyle = (status: VendorActivityStatus): string => {
  const styles: Record<VendorActivityStatus, string> = {
    planned: 'bg-gray-100 text-gray-800',
    confirmed: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-amber-100 text-amber-800',
    complete: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return styles[status] || 'bg-gray-100 text-gray-800';
};

const getStatusLabel = (status: VendorActivityStatus): string => {
  const labels: Record<VendorActivityStatus, string> = {
    planned: 'Planned',
    confirmed: 'Confirmed',
    in_progress: 'In Progress',
    complete: 'Complete',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
};

export default function VendorActivitiesPage() {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<VendorActivityWithRelations[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Sort states
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const supabase = createClient();

    const [activitiesRes, vendorsRes] = await Promise.all([
      supabase
        .from('vendor_activities')
        .select(`
          *,
          vendor:vendors(id, name, vendor_number),
          creator:users!vendor_activities_created_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false }),
      supabase
        .from('vendors')
        .select('id, name, vendor_number')
        .order('name'),
    ]);

    if (activitiesRes.data) {
      setActivities(activitiesRes.data);
    }
    if (vendorsRes.data) {
      setVendors(vendorsRes.data);
    }
    setLoading(false);
  };

  const vendorOptions = useMemo(() =>
    vendors.map(v => ({
      value: v.id,
      label: v.vendor_number ? `${v.vendor_number} - ${v.name}` : v.name,
    })),
    [vendors]
  );

  // Filter and sort activities
  const filteredActivities = useMemo(() => {
    let result = [...activities];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(a =>
        a.description.toLowerCase().includes(query) ||
        a.purchase_requisition?.toLowerCase().includes(query) ||
        a.purchase_order?.toLowerCase().includes(query) ||
        a.vendor?.name.toLowerCase().includes(query) ||
        a.vendor?.vendor_number?.toLowerCase().includes(query) ||
        a.notes?.toLowerCase().includes(query)
      );
    }

    // Vendor filter
    if (selectedVendors.length > 0) {
      result = result.filter(a => selectedVendors.includes(a.vendor_id));
    }

    // Status filter
    if (selectedStatuses.length > 0) {
      result = result.filter(a => selectedStatuses.includes(a.status));
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number | null = null;
      let bVal: string | number | null = null;

      switch (sortField) {
        case 'vendor':
          aVal = a.vendor?.name?.toLowerCase() || '';
          bVal = b.vendor?.name?.toLowerCase() || '';
          break;
        case 'description':
          aVal = a.description.toLowerCase();
          bVal = b.description.toLowerCase();
          break;
        case 'purchase_requisition':
          aVal = a.purchase_requisition?.toLowerCase() || '';
          bVal = b.purchase_requisition?.toLowerCase() || '';
          break;
        case 'purchase_order':
          aVal = a.purchase_order?.toLowerCase() || '';
          bVal = b.purchase_order?.toLowerCase() || '';
          break;
        case 'purchase_order_value':
          aVal = a.purchase_order_value || 0;
          bVal = b.purchase_order_value || 0;
          break;
        case 'start_date':
          aVal = a.confirmed_start_date || a.provisional_start_date || '';
          bVal = b.confirmed_start_date || b.provisional_start_date || '';
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'created_at':
          aVal = a.created_at;
          bVal = b.created_at;
          break;
      }

      if (aVal === null || aVal === '') return sortDirection === 'asc' ? 1 : -1;
      if (bVal === null || bVal === '') return sortDirection === 'asc' ? -1 : 1;

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [activities, searchQuery, selectedVendors, selectedStatuses, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc'
      ? <ArrowUpIcon className="w-4 h-4 ml-1 inline" />
      : <ArrowDownIcon className="w-4 h-4 ml-1 inline" />;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedVendors([]);
    setSelectedStatuses([]);
  };

  const hasActiveFilters = searchQuery || selectedVendors.length > 0 || selectedStatuses.length > 0;

  // Calculate summary stats
  const stats = useMemo(() => {
    const total = filteredActivities.length;
    const totalValue = filteredActivities.reduce((sum, a) => sum + (a.purchase_order_value || 0), 0);
    const byStatus = filteredActivities.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return { total, totalValue, byStatus };
  }, [filteredActivities]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="flex items-center justify-center h-[60vh]">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />

      <div className="p-4 sm:p-6 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vendor Activities</h1>
            <p className="text-gray-500 mt-1">All activities across vendors</p>
          </div>
          <Link href="/vendors">
            <Button variant="secondary" size="sm">
              <BuildingOfficeIcon className="w-4 h-4 mr-2" />
              View Vendors
            </Button>
          </Link>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card padding="sm">
            <CardContent>
              <p className="text-sm text-gray-500">Total Activities</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </CardContent>
          </Card>
          <Card padding="sm">
            <CardContent>
              <p className="text-sm text-gray-500">Total PO Value</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(stats.totalValue)}</p>
            </CardContent>
          </Card>
          <Card padding="sm">
            <CardContent>
              <p className="text-sm text-gray-500">In Progress</p>
              <p className="text-2xl font-bold text-amber-600">{stats.byStatus['in_progress'] || 0}</p>
            </CardContent>
          </Card>
          <Card padding="sm">
            <CardContent>
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.byStatus['complete'] || 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent>
            <div className="space-y-4">
              {/* Search and Filter Toggle */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search activities, PR/PO numbers, vendors..."
                    className="pl-10"
                  />
                </div>
                <Button
                  variant={showFilters ? 'primary' : 'secondary'}
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <FunnelIcon className="w-4 h-4 mr-2" />
                  Filters
                  {hasActiveFilters && (
                    <span className="ml-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {(selectedVendors.length > 0 ? 1 : 0) + (selectedStatuses.length > 0 ? 1 : 0)}
                    </span>
                  )}
                </Button>
                {hasActiveFilters && (
                  <Button variant="secondary" onClick={clearFilters}>
                    <XMarkIcon className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                )}
              </div>

              {/* Filter Options */}
              {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                  <MultiSelect
                    label="Vendor"
                    options={vendorOptions}
                    value={selectedVendors}
                    onChange={setSelectedVendors}
                    placeholder="All vendors"
                  />
                  <MultiSelect
                    label="Status"
                    options={statusOptions}
                    value={selectedStatuses}
                    onChange={setSelectedStatuses}
                    placeholder="All statuses"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activities Table */}
        <Card padding="none">
          {filteredActivities.length === 0 ? (
            <EmptyState
              icon={<DocumentTextIcon className="w-12 h-12" />}
              title="No activities found"
              description={hasActiveFilters ? "Try adjusting your filters" : "No vendor activities have been created yet"}
            />
          ) : (
            <TableWrapper>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('vendor')}
                    >
                      Vendor <SortIcon field="vendor" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('description')}
                    >
                      Description <SortIcon field="description" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('purchase_requisition')}
                    >
                      PR # <SortIcon field="purchase_requisition" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('purchase_order')}
                    >
                      PO # <SortIcon field="purchase_order" />
                    </th>
                    <th
                      className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('purchase_order_value')}
                    >
                      PO Value <SortIcon field="purchase_order_value" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('start_date')}
                    >
                      Dates <SortIcon field="start_date" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort('status')}
                    >
                      Status <SortIcon field="status" />
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredActivities.map((activity) => {
                    const startDate = activity.confirmed_start_date || activity.provisional_start_date;
                    const endDate = activity.confirmed_end_date || activity.provisional_end_date;
                    const isConfirmed = !!(activity.confirmed_start_date || activity.confirmed_end_date);

                    return (
                      <tr
                        key={activity.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link
                            href={`/vendors/${activity.vendor_id}`}
                            className="text-sm font-medium text-gray-900 hover:text-red-600"
                          >
                            {activity.vendor?.vendor_number && (
                              <span className="text-xs font-mono text-gray-500 block">
                                {activity.vendor.vendor_number}
                              </span>
                            )}
                            {activity.vendor?.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-900 max-w-xs truncate" title={activity.description}>
                            {activity.description}
                          </p>
                          {activity.notes && (
                            <p className="text-xs text-gray-500 truncate max-w-xs" title={activity.notes}>
                              {activity.notes}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {activity.purchase_requisition ? (
                            <span className="text-sm font-mono text-gray-700">{activity.purchase_requisition}</span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {activity.purchase_order ? (
                            <span className="text-sm font-mono text-gray-700">{activity.purchase_order}</span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {activity.purchase_order_value ? (
                            <span className="text-sm font-medium text-gray-900">
                              {formatCurrency(activity.purchase_order_value)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {startDate || endDate ? (
                            <div className="text-sm">
                              <span className={isConfirmed ? 'text-green-600' : 'text-amber-600'}>
                                {startDate && formatDate(startDate, { month: 'short', day: 'numeric' })}
                                {startDate && endDate && ' - '}
                                {endDate && formatDate(endDate, { month: 'short', day: 'numeric' })}
                              </span>
                              <span className="text-xs text-gray-500 ml-1">
                                ({isConfirmed ? 'confirmed' : 'provisional'})
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
                            getStatusStyle(activity.status)
                          )}>
                            {getStatusLabel(activity.status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </Card>

        {/* Results count */}
        {filteredActivities.length > 0 && (
          <p className="text-sm text-gray-500 text-center">
            Showing {filteredActivities.length} of {activities.length} activities
          </p>
        )}
      </div>
    </div>
  );
}
