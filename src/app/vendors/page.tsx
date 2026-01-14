'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, cn } from '@/lib/utils';
import {
  PlusIcon,
  BuildingOfficeIcon,
  PhoneIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  TableCellsIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import type { Vendor, VendorActivity } from '@/types/database';

type VendorWithRelations = Vendor & {
  activities?: VendorActivity[];
  _count?: { activities: number; linked_actions: number };
};

export default function VendorsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><LoadingSpinner size="lg" /></div>}>
      <VendorsPageContent />
    </Suspense>
  );
}

function VendorsPageContent() {
  const { user } = useAppStore();
  const { canEdit } = usePermission();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<VendorWithRelations[]>([]);
  const [filteredVendors, setFilteredVendors] = useState<VendorWithRelations[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  const fetchVendors = useCallback(async () => {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('vendors')
      .select(`
        *,
        activities:vendor_activities(id, description, status, purchase_order, purchase_order_value, provisional_start_date, confirmed_start_date)
      `)
      .order('name');

    if (error) {
      console.error('Error fetching vendors:', error);
    } else {
      setVendors(data as VendorWithRelations[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // Apply search filter
  useEffect(() => {
    let filtered = [...vendors];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(v =>
        v.name.toLowerCase().includes(query) ||
        v.contact_name?.toLowerCase().includes(query) ||
        v.contact_email?.toLowerCase().includes(query)
      );
    }

    setFilteredVendors(filtered);
  }, [vendors, searchQuery]);

  const getActivityStats = (vendor: VendorWithRelations) => {
    const activities = vendor.activities || [];
    const total = activities.length;
    const confirmed = activities.filter(a => a.status === 'confirmed' || a.status === 'in_progress' || a.status === 'complete').length;
    const inProgress = activities.filter(a => a.status === 'in_progress').length;
    const complete = activities.filter(a => a.status === 'complete').length;
    return { total, confirmed, inProgress, complete };
  };

  const getTotalValue = (vendor: VendorWithRelations) => {
    const activities = vendor.activities || [];
    return activities.reduce((sum, a) => sum + (a.purchase_order_value || 0), 0);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header title="Vendors" />
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Vendors"
        subtitle={`${filteredVendors.length} vendor${filteredVendors.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            {/* View Toggle */}
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'cards' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
                title="Card View"
              >
                <Squares2X2Icon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === 'table' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
                title="Table View"
              >
                <TableCellsIcon className="w-4 h-4" />
              </button>
            </div>
            {canEdit && (
              <Link href="/vendors/new">
                <Button size="sm">
                  <PlusIcon className="w-4 h-4 mr-2" />
                  New Vendor
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {/* Search */}
        <Card padding="sm">
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search vendors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Vendors List */}
        {filteredVendors.length === 0 ? (
          <EmptyState
            icon={<BuildingOfficeIcon className="w-6 h-6" />}
            title="No vendors found"
            description={
              searchQuery
                ? 'Try adjusting your search.'
                : 'Create your first vendor to get started.'
            }
            action={
              !searchQuery && canEdit
                ? {
                    label: 'Create Vendor',
                    onClick: () => window.location.href = '/vendors/new',
                  }
                : undefined
            }
          />
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVendors.map((vendor) => {
              const stats = getActivityStats(vendor);
              const totalValue = getTotalValue(vendor);

              return (
                <Link key={vendor.id} href={`/vendors/${vendor.id}`}>
                  <Card hover className="h-full">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                            <BuildingOfficeIcon className="w-5 h-5 text-blue-600" />
                          </div>
                          <div>
                            <h3 className="font-medium text-gray-900">{vendor.name}</h3>
                            {vendor.contact_name && (
                              <p className="text-sm text-gray-500">{vendor.contact_name}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {(vendor.contact_email || vendor.contact_phone) && (
                        <div className="space-y-1 mb-3 text-sm text-gray-500">
                          {vendor.contact_email && (
                            <div className="flex items-center gap-2">
                              <EnvelopeIcon className="w-4 h-4" />
                              <span className="truncate">{vendor.contact_email}</span>
                            </div>
                          )}
                          {vendor.contact_phone && (
                            <div className="flex items-center gap-2">
                              <PhoneIcon className="w-4 h-4" />
                              <span>{vendor.contact_phone}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <div className="text-sm">
                          <span className="text-gray-500">{stats.total} activities</span>
                          {stats.inProgress > 0 && (
                            <span className="ml-2 text-blue-600">({stats.inProgress} active)</span>
                          )}
                        </div>
                        {totalValue > 0 && (
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(totalValue)}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Vendor
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Contact
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Activities
                    </th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Active
                    </th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">
                      Total Value
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredVendors.map((vendor) => {
                    const stats = getActivityStats(vendor);
                    const totalValue = getTotalValue(vendor);

                    return (
                      <tr
                        key={vendor.id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => window.location.href = `/vendors/${vendor.id}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <BuildingOfficeIcon className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="font-medium text-gray-900">{vendor.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            {vendor.contact_name && (
                              <p className="text-gray-900">{vendor.contact_name}</p>
                            )}
                            {vendor.contact_email && (
                              <p className="text-gray-500 text-xs">{vendor.contact_email}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700">{stats.total}</span>
                        </td>
                        <td className="px-4 py-3">
                          {stats.inProgress > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {stats.inProgress} in progress
                            </span>
                          ) : stats.confirmed > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              {stats.confirmed} confirmed
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {totalValue > 0 ? (
                            <span className="text-sm font-medium text-gray-900">
                              {formatCurrency(totalValue)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
