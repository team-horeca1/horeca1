'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    Users,
    Package,
    Loader2,
    UserCheck,
    UserX,
    Trash2,
    Plus,
    X,
    SlidersHorizontal,
    Upload,
    UserCircle,
    ArrowUpRight,
    Mail,
    Phone,
    Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import CustomerFormModal from '@/components/features/admin/CustomerFormModal';
import { FormErrorBanner } from '@/components/ui/form';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminImpersonate } from '@/hooks/useAdminImpersonate';
import {
    AdminStatusBadge,
    AdminRegistryPageHeader,
    AdminRegistryStatsGrid,
    AdminRegistryFilterBar,
    registryFilterPillClass,
    AdminRegistryLoadingState,
    AdminRegistryEmptyState,
    AdminRegistryTableShell,
    AdminRegistryTableHead,
    AdminRegistryTableBody,
    AdminRegistryRowActions,
    AdminRegistryOverflowMenu,
    AdminRegistryOverflowMenuItem,
    AdminRegistryViewToggle,
    useAdminDesktop,
} from '@/components/features/admin/entity';

interface AdminUser {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    role: string;
    businessName: string | null;
    isActive: boolean;
    createdAt: string;
}

export default function CustomersPage() {
    const router = useRouter();
    const { has: can } = usePermissions();
    const canEditCustomers = can('customers.edit');
    const { start: startCustomerView, loading: impersonateLoading } = useAdminImpersonate('customer');
    const [searchQuery, setSearchQuery] = useState('');
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [initialLoad, setInitialLoad] = useState(true);
    const [activeMenu, setActiveMenu] = useState<{ id: string; top: number; right: number } | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const confirm = useConfirm();

    // View Mode switcher
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    const isDesktop = useAdminDesktop();
    const effectiveView = isDesktop ? viewMode : 'grid';

    // Filters state
    const [showFilters, setShowFilters] = useState(false);
    const [filterRole, setFilterRole] = useState('customer'); // Default to customer
    const [filterPincode, setFilterPincode] = useState('');
    const [filterSalespersonId, setFilterSalespersonId] = useState('');
    const [salespersons, setSalespersons] = useState<Array<{ id: string; name: string; code: string | null; vendor: { businessName: string } }>>([]);
    const [filterCreditStatus, setFilterCreditStatus] = useState('');
    const [filterArea, setFilterArea] = useState('');
    const [filterTag, setFilterTag] = useState('');

    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [vendors, setVendors] = useState<{ id: string; businessName: string }[]>([]);
    const [bulkVendorId, setBulkVendorId] = useState('');
    const [bulkSalesExecutive, setBulkSalesExecutive] = useState('');
    const [bulkTerritory, setBulkTerritory] = useState('');
    const [bulkTags, setBulkTags] = useState('');
    const [bulkTagsAction, setBulkTagsAction] = useState<'add' | 'remove' | 'set'>('add');

    const refetch = useCallback(() => {
        setLoading(true);
        const url = new URL('/api/v1/admin/users', window.location.origin);
        url.searchParams.set('limit', '50');
        if (searchQuery.trim()) url.searchParams.set('search', searchQuery.trim());
        if (filterRole !== 'all') url.searchParams.set('role', filterRole);
        if (filterPincode.trim()) url.searchParams.set('pincode', filterPincode.trim());
        if (filterSalespersonId) url.searchParams.set('salespersonId', filterSalespersonId);
        if (filterCreditStatus) url.searchParams.set('creditStatus', filterCreditStatus);
        if (filterArea.trim()) url.searchParams.set('area', filterArea.trim());
        if (filterTag.trim()) url.searchParams.set('tag', filterTag.trim());

        // Don't silently treat API failures (401/403/500) as "no users yet".
        // Surface the real reason via toast and clear the list so the admin
        // can see something went wrong (most commonly a stale JWT after a
        // role change — fix: sign out + sign back in).
        fetch(url.toString())
            .then(async (res) => {
                const json = await res.json().catch(() => null);
                if (!res.ok || !json?.success) {
                    const msg = json?.error?.message
                        ?? json?.error
                        ?? (res.status === 401 ? 'Session expired — please sign in again'
                            : res.status === 403 ? 'Your account does not have admin access. If you just changed roles, sign out and sign back in to refresh the session.'
                            : `Failed to load users (HTTP ${res.status})`);
                    setUsers([]);
                    toast.error(typeof msg === 'string' ? msg : 'Failed to load users');
                    return;
                }
                setUsers(json.data.users);
            })
            .catch((err) => {
                console.error(err);
                setUsers([]);
                toast.error('Network error loading users');
            })
            .finally(() => { setLoading(false); setInitialLoad(false); });
    }, [searchQuery, filterRole, filterPincode, filterSalespersonId, filterCreditStatus, filterArea, filterTag]);

    useEffect(() => {
        fetch('/api/v1/admin/salespersons')
            .then((r) => r.json())
            .then((json) => { if (json.success) setSalespersons(json.data ?? []); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            if (cancelled) return;
            refetch();
        }, searchQuery ? 300 : 0);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [searchQuery, refetch]);

    // Fetch vendors for bulk mappings dropdown
    useEffect(() => {
        fetch('/api/v1/admin/vendors')
            .then(res => res.json())
            .then(json => {
                if (json.success) setVendors(json.data.vendors);
            })
            .catch(console.error);
    }, []);

    const filteredUsers = users;

    const totalCustomers = users.filter(u => u.role === 'customer').length;
    const activeCustomers = users.filter(u => u.role === 'customer' && u.isActive).length;
    const inactiveUsers = users.filter(u => !u.isActive).length;

    const registryStats = [
        { label: 'Total Customers', value: totalCustomers, icon: UserCheck, iconBg: 'bg-[#F8E8EC]', iconColor: 'text-[#6B1D2E]' },
        { label: 'Active Customers', value: activeCustomers, icon: Users, iconBg: 'bg-[#EFF6FF]', iconColor: 'text-[#3B82F6]' },
        { label: 'Inactive Users', value: inactiveUsers, icon: UserX, iconBg: 'bg-[#FDF2F2]', iconColor: 'text-[#EF4444]' },
        { label: 'All Users', value: users.length, icon: Package, iconBg: 'bg-[#FFF8EB]', iconColor: 'text-[#D97706]' },
    ];

    const openDetails = (userId: string) => router.push(`/admin/customers/${userId}`);

    const deleteUser = async (userId: string, name: string) => {
        setActiveMenu(null);
        const ok = await confirm({
            title: 'Delete permanently?',
            message: `${name} will be removed completely along with their team memberships, saved addresses and other personal data. This cannot be undone.`,
            confirmText: 'Delete permanently',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/v1/admin/users/${userId}?force=true`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) {
                toast.error(json.error?.message || json.error || 'Failed to delete');
                return;
            }
            setUsers(prev => prev.filter(u => u.id !== userId));
            setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
            toast.success(`${name} deleted permanently`);
        } catch {
            toast.error('Failed to delete');
        }
    };

    const toggleUserActive = async (userId: string, isActive: boolean) => {
        setActiveMenu(null);
        try {
            const res = await fetch(`/api/v1/admin/users/${userId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !isActive }),
            });
            const json = await res.json();
            if (json.success) {
                setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !isActive } : u));
                toast.success(isActive ? 'User deactivated' : 'User activated');
            } else {
                toast.error(json.error?.message || 'Failed to update');
            }
        } catch {
            toast.error('Failed to update');
        }
    };

    // Bulk action handlers
    const handleBulkActiveToggle = async (active: boolean) => {
        try {
            const res = await fetch('/api/v1/admin/users/bulk-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userIds: Array.from(selectedIds),
                    isActive: active,
                }),
            });
            const json = await res.json();
            if (json.success) {
                toast.success(json.message || `Successfully updated ${selectedIds.size} users.`);
                setSelectedIds(new Set());
                refetch();
            } else {
                toast.error(json.error?.message || 'Failed to update users');
            }
        } catch {
            toast.error('Failed to update users');
        }
    };

    const handleBulkSubmit = async () => {
        if (!bulkVendorId) {
            toast.error('Select a vendor first');
            return;
        }

        try {
            const payload: Record<string, unknown> = {
                userIds: Array.from(selectedIds),
                vendorId: bulkVendorId,
            };
            if (bulkSalesExecutive.trim()) payload.salesExecutive = bulkSalesExecutive.trim();
            if (bulkTerritory.trim()) payload.territory = bulkTerritory.trim();
            if (bulkTags.trim()) {
                payload.tagsAction = bulkTagsAction;
                payload.tags = bulkTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
            }

            const res = await fetch('/api/v1/admin/users/bulk-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (json.success) {
                toast.success(json.message || `Successfully updated mapping for ${selectedIds.size} users.`);
                setSelectedIds(new Set());
                setBulkSalesExecutive('');
                setBulkTerritory('');
                setBulkTags('');
                refetch();
            } else {
                toast.error(json.error?.message || 'Failed to update mappings');
            }
        } catch {
            toast.error('Failed to update mappings');
        }
    };

    // Close menu when clicking anywhere else
    useEffect(() => {
        const handleClickOutside = () => setActiveMenu(null);
        if (activeMenu !== null) {
            window.addEventListener('click', handleClickOutside);
        }
        return () => window.removeEventListener('click', handleClickOutside);
    }, [activeMenu]);

    // Close the menu on scroll/resize because the portal coords would otherwise drift.
    useEffect(() => {
        if (!activeMenu) return;
        const close = () => setActiveMenu(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [activeMenu]);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(new Set(filteredUsers.map(u => u.id)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleSelectRow = (userId: string, checked: boolean) => {
        const next = new Set(selectedIds);
        if (checked) {
            next.add(userId);
        } else {
            next.delete(userId);
        }
        setSelectedIds(next);
    };

    if (initialLoad) {
        return <AdminRegistryLoadingState message="Loading customers registry..." />;
    }

    return (
        <div className={cn('space-y-8 px-4 md:px-0', selectedIds.size > 0 ? 'pb-24' : 'pb-10')}>
            <AdminRegistryPageHeader
                title="Customers Registry"
                subtitle="Manage buyer accounts, audit profiles, and bulk-update customer mappings"
                actions={
                    <>
                        <button
                            onClick={() => setShowImportModal(true)}
                            className="h-[44px] px-4 bg-white border border-[#E5E7EB] hover:bg-gray-50 text-[#374151] rounded-[12px] text-[13px] font-bold flex items-center gap-2 transition-colors shadow-sm"
                        >
                            <Upload size={16} /> Import Customers
                        </button>
                        <button
                            onClick={() => setShowAddModal(true)}
                            className="h-[44px] px-5 bg-[#6B1D2E] text-white rounded-[12px] text-[13px] font-bold hover:bg-[#5A1926] active:scale-95 transition-all shadow-md shadow-[#6B1D2E]/10 flex items-center gap-2 shrink-0"
                        >
                            <Plus size={16} /> Add Customer
                        </button>
                    </>
                }
            />

            <AdminRegistryStatsGrid stats={registryStats} />

            <AdminRegistryFilterBar
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search name, email, phone, business..."
                searching={loading && !initialLoad}
                leftSlot={
                    <div className="flex items-center gap-2 flex-wrap">
                        {(
                            [
                                { id: 'all' as const, label: 'All Roles' },
                                { id: 'customer' as const, label: 'Customers' },
                                { id: 'vendor' as const, label: 'Vendors' },
                                { id: 'admin' as const, label: 'Admins' },
                            ] as const
                        ).map((f) => (
                            <button
                                key={f.id}
                                type="button"
                                onClick={() => setFilterRole(f.id)}
                                className={registryFilterPillClass(filterRole === f.id)}
                            >
                                {f.label}
                            </button>
                        ))}

                        <button
                            type="button"
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn(
                                'min-h-12 lg:min-h-[34px] lg:h-[34px] px-3 rounded-[12px] lg:rounded-[8px] text-[13px] lg:text-[12px] font-semibold flex items-center gap-1.5 transition-all border ml-1',
                                showFilters
                                    ? 'bg-[#6B1D2E] text-white border-[#6B1D2E]'
                                    : 'bg-[#F9FAFB] text-[#6B7280] border-[#D1D5DB] hover:text-[#111827] hover:bg-[#F3F4F6]',
                            )}
                        >
                            <SlidersHorizontal size={14} /> More Filters
                        </button>
                    </div>
                }
                trailingSlot={
                    <AdminRegistryViewToggle viewMode={viewMode} onChange={setViewMode} />
                }
            />

            {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 p-4 bg-white rounded-[16px] border border-[#D1D5DB] shadow-sm animate-in slide-in-from-top-4 duration-200">
                    <div>
                        <label className="block text-[11px] font-bold text-[#9CA3AF] uppercase mb-1">Pincode</label>
                        <input
                            type="text"
                            placeholder="e.g. 560001"
                            value={filterPincode}
                            onChange={(e) => setFilterPincode(e.target.value)}
                            className="h-[42px] w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-[10px] px-3 text-[13px] outline-none font-medium focus:border-[#6B1D2E]/50"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-[#9CA3AF] uppercase mb-1">Salesperson</label>
                        <select
                            value={filterSalespersonId}
                            onChange={(e) => setFilterSalespersonId(e.target.value)}
                            className="h-[42px] w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-[10px] px-3 text-[13px] outline-none font-medium focus:border-[#6B1D2E]/50"
                        >
                            <option value="">All salespersons</option>
                            {salespersons.map((sp) => (
                                <option key={sp.id} value={sp.id}>
                                    {sp.name}{sp.code ? ` (${sp.code})` : ''} — {sp.vendor.businessName}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-[#9CA3AF] uppercase mb-1">Credit Status</label>
                        <select
                            value={filterCreditStatus}
                            onChange={(e) => setFilterCreditStatus(e.target.value)}
                            className="h-[42px] w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-[10px] px-3 text-[13px] outline-none font-medium focus:border-[#6B1D2E]/50"
                        >
                            <option value="">All Statuses</option>
                            <option value="active">Active</option>
                            <option value="pending">Pending</option>
                            <option value="suspended">Suspended</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-[#9CA3AF] uppercase mb-1">Area/City</label>
                        <input
                            type="text"
                            placeholder="e.g. Bangalore"
                            value={filterArea}
                            onChange={(e) => setFilterArea(e.target.value)}
                            className="h-[42px] w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-[10px] px-3 text-[13px] outline-none font-medium focus:border-[#6B1D2E]/50"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold text-[#9CA3AF] uppercase mb-1">Tag</label>
                        <input
                            type="text"
                            placeholder="e.g. VIP"
                            value={filterTag}
                            onChange={(e) => setFilterTag(e.target.value)}
                            className="h-[42px] w-full bg-[#F9FAFB] border border-[#D1D5DB] rounded-[10px] px-3 text-[13px] outline-none font-medium focus:border-[#6B1D2E]/50"
                        />
                    </div>
                </div>
            )}

            {filteredUsers.length === 0 ? (
                <AdminRegistryEmptyState
                    icon={Users}
                    title={searchQuery || filterRole !== 'all' ? 'No matched results' : 'No customers registered yet'}
                    subtitle="Try adjusting your filters or add a new customer."
                />
            ) : effectiveView === 'grid' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredUsers.map((user) => (
                        <div
                            key={user.id}
                            className="bg-white rounded-[16px] border border-[#D1D5DB] shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md hover:border-[#6B1D2E]/30 hover:-translate-y-0.5 transition-all w-full relative"
                        >
                            {/* Checkbox at top left */}
                            <div className="absolute top-4 left-4 z-10" onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="checkbox"
                                    checked={selectedIds.has(user.id)}
                                    onChange={(e) => handleSelectRow(user.id, e.target.checked)}
                                    className="w-4 h-4 rounded border-gray-300 text-[#6B1D2E] focus:ring-[#6B1D2E] cursor-pointer"
                                />
                            </div>

                            {/* Upper Section — click to view details */}
                            <div
                                onClick={() => openDetails(user.id)}
                                className="p-5 flex-1 flex flex-col cursor-pointer"
                            >
                                {/* Visual Avatar Container */}
                                <div className="bg-[#F9FAFB] rounded-[12px] h-[100px] relative flex items-center justify-center p-4 border border-[#F3F4F6] mb-4">
                                    <AdminStatusBadge
                                        variant={user.isActive ? 'active' : 'inactive'}
                                        className="absolute top-2.5 right-2.5 shadow-sm normal-case text-[10px]"
                                    />

                                    <div className="w-[60px] h-[60px] rounded-full bg-[#6B1D2E]/10 flex items-center justify-center border border-[#6B1D2E]/20">
                                        <span className="text-[22px] font-black text-[#6B1D2E]">
                                            {(user.fullName || 'U').charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                </div>

                                {/* Name & Role */}
                                <div className="mb-3">
                                    <h3 className="text-[16px] font-extrabold text-[#111827] line-clamp-1 group-hover:text-[#6B1D2E]">{user.fullName}</h3>
                                    <span className={cn(
                                        'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold capitalize mt-1.5',
                                        user.role === 'admin' ? 'bg-purple-50 text-purple-600' :
                                        user.role === 'vendor' ? 'bg-blue-50 text-blue-600' :
                                        'bg-[#F8E8EC] text-[#6B1D2E]',
                                    )}>
                                        {user.role}
                                    </span>
                                </div>

                                {/* Details Fields */}
                                <div className="space-y-2 mt-auto pt-2 border-t border-[#F3F4F6]">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Mail size={13} className="text-[#9CA3AF] shrink-0" />
                                        <span className="text-[12px] font-semibold text-[#4B5563] truncate">{user.email}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone size={13} className="text-[#9CA3AF] shrink-0" />
                                        <span className="text-[12px] font-semibold text-[#4B5563]">{user.phone || '—'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Building2 size={13} className="text-[#9CA3AF] shrink-0" />
                                        <span className="text-[12px] font-semibold text-[#4B5563] truncate">{user.businessName || '—'}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="p-4 border-t border-[#D1D5DB] bg-white flex flex-col gap-2 rounded-b-[16px]">
                                {canEditCustomers && user.role !== 'admin' && (
                                    <button
                                        type="button"
                                        disabled={impersonateLoading}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            void startCustomerView(user.id);
                                        }}
                                        className="w-full min-h-12 bg-[#6B1D2E] text-white rounded-[12px] text-[13px] font-semibold hover:bg-[#5A1926] active:scale-98 transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-[#6B1D2E]/10 disabled:opacity-60"
                                    >
                                        <UserCircle size={13} />
                                        Impersonate
                                    </button>
                                )}
                                <div className="flex items-center gap-2">
                                    <Link
                                        href={`/admin/customers/${user.id}`}
                                        className="flex-1 min-h-12 bg-[#F3F4F6] text-[#374151] hover:bg-[#E5E7EB] rounded-[12px] text-[13px] font-semibold transition-all flex items-center justify-center border border-[#E5E7EB]"
                                    >
                                        Details
                                    </Link>
                                    {canEditCustomers && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); toggleUserActive(user.id, user.isActive); }}
                                            className={cn(
                                                "min-h-12 px-3 rounded-[12px] text-[13px] font-semibold transition-all border",
                                                user.isActive
                                                    ? "bg-[#FFF0F0] border-transparent text-[#DC2626] hover:bg-red-100"
                                                    : "bg-[#F8E8EC] border-transparent text-[#6B1D2E] hover:bg-[#F8E8EC]"
                                            )}
                                        >
                                            {user.isActive ? 'Deactivate' : 'Activate'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <AdminRegistryTableShell minWidth="1100px">
                    <AdminRegistryTableHead>
                        <th className="px-6 py-3.5 font-bold text-center w-[52px] border-r border-[#D1D5DB]">
                            <input
                                type="checkbox"
                                checked={filteredUsers.length > 0 && selectedIds.size === filteredUsers.length}
                                onChange={handleSelectAll}
                                onClick={(e) => e.stopPropagation()}
                                className="w-4 h-4 rounded border-gray-300 text-[#6B1D2E] focus:ring-[#6B1D2E] cursor-pointer"
                            />
                        </th>
                        <th className="px-6 py-3.5 font-bold min-w-[240px] border-r border-[#D1D5DB]">Customer</th>
                        <th className="px-6 py-3.5 font-bold min-w-[180px] border-r border-[#D1D5DB]">Email</th>
                        <th className="px-6 py-3.5 font-bold min-w-[120px] border-r border-[#D1D5DB]">Phone</th>
                        <th className="px-6 py-3.5 font-bold min-w-[100px] border-r border-[#D1D5DB]">Business</th>
                        <th className="px-6 py-3.5 font-bold text-center w-[100px] border-r border-[#D1D5DB]">Status</th>
                        <th className="px-6 py-3.5 font-bold text-center w-[100px] border-r border-[#D1D5DB]">Joined</th>
                        <th className="px-6 py-3.5 font-bold text-left min-w-[240px]">Actions</th>
                    </AdminRegistryTableHead>
                    <AdminRegistryTableBody>
                        {filteredUsers.map((user) => (
                            <tr
                                key={user.id}
                                onClick={() => openDetails(user.id)}
                                className="group hover:bg-[#F9FAFB]/60 transition-colors cursor-pointer"
                            >
                                <td className="px-6 py-3 text-center align-middle border-r border-[#D1D5DB]" onClick={(e) => e.stopPropagation()}>
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.has(user.id)}
                                        onChange={(e) => handleSelectRow(user.id, e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-[#6B1D2E] focus:ring-[#6B1D2E] cursor-pointer"
                                    />
                                </td>
                                <td className="px-6 py-3 align-middle border-r border-[#D1D5DB]">
                                    <div className="flex items-center gap-3">
                                        <div className="w-[42px] h-[42px] rounded-[10px] bg-[#F3F4F6] overflow-hidden shrink-0 border border-[#E5E7EB] flex items-center justify-center">
                                            <span className="text-[15px] font-black text-[#6B1D2E]">
                                                {(user.fullName || 'U').charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[14px] font-bold text-[#111827] truncate group-hover:text-[#6B1D2E] transition-colors">
                                                {user.fullName}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className={cn(
                                                    'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold capitalize',
                                                    user.role === 'admin' ? 'bg-purple-50 text-purple-600' :
                                                    user.role === 'vendor' ? 'bg-blue-50 text-blue-600' :
                                                    'bg-[#F8E8EC] text-[#6B1D2E]',
                                                )}>
                                                    {user.role}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-[13px] font-medium text-[#4B5563] truncate max-w-[200px] align-middle border-r border-[#D1D5DB]">{user.email}</td>
                                <td className="px-6 py-3 text-[11px] text-[#9CA3AF] font-semibold font-mono align-middle border-r border-[#D1D5DB]">{user.phone || '—'}</td>
                                <td className="px-6 py-3 text-[13px] font-medium text-[#4B5563] truncate max-w-[160px] align-middle border-r border-[#D1D5DB]">{user.businessName || '—'}</td>
                                <td className="px-6 py-3 text-center align-middle border-r border-[#D1D5DB]">
                                    <AdminStatusBadge variant={user.isActive ? 'active' : 'inactive'} />
                                </td>
                                <td className="px-6 py-3 text-center text-[12px] font-bold text-[#6B7280] align-middle border-r border-[#D1D5DB]">
                                    {new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </td>
                                <td className="px-6 py-3 text-left align-middle" onClick={(e) => e.stopPropagation()}>
                                    <AdminRegistryRowActions
                                        detailsHref={`/admin/customers/${user.id}`}
                                        onDetailsClick={(e) => e.stopPropagation()}
                                        impersonateButton={
                                            canEditCustomers && user.role !== 'admin' ? (
                                                <button
                                                    type="button"
                                                    disabled={impersonateLoading}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        void startCustomerView(user.id);
                                                    }}
                                                    className="h-[34px] px-3 bg-[#6B1D2E] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#5A1926] transition-all flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                                                >
                                                    <UserCircle size={12} />
                                                    Impersonate
                                                    <ArrowUpRight size={12} className="opacity-70" />
                                                </button>
                                            ) : undefined
                                        }
                                        menuOpen={activeMenu?.id === user.id}
                                        onMenuToggle={(e) => {
                                            e.stopPropagation();
                                            if (activeMenu?.id === user.id) {
                                                setActiveMenu(null);
                                                return;
                                            }
                                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                            setActiveMenu({
                                                id: user.id,
                                                top: rect.bottom + 6,
                                                right: window.innerWidth - rect.right,
                                            });
                                        }}
                                    />
                                </td>
                            </tr>
                        ))}
                    </AdminRegistryTableBody>
                </AdminRegistryTableShell>
            )}

            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-[#D1D5DB] shadow-lg rounded-[16px] px-6 py-4 flex flex-wrap items-center gap-4 z-[9999] max-w-[92%] animate-in slide-in-from-bottom-8 duration-200">
                    <div className="flex items-center gap-2 border-r pr-4 border-[#F3F4F6] shrink-0">
                        <span className="bg-[#F8E8EC] text-[#6B1D2E] font-black text-[12px] px-2.5 py-1 rounded-full">
                            {selectedIds.size} Selected
                        </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => handleBulkActiveToggle(true)}
                            className="min-h-12 px-4 bg-[#6B1D2E] hover:bg-[#5A1926] text-white font-semibold rounded-[12px] text-[13px] transition-colors"
                        >
                            Activate
                        </button>
                        <button
                            onClick={() => handleBulkActiveToggle(false)}
                            className="min-h-12 px-4 bg-white border border-[#E5E7EB] hover:bg-[#F9FAFB] text-[#374151] font-semibold rounded-[12px] text-[13px] transition-colors"
                        >
                            Deactivate
                        </button>
                    </div>

                    <div className="h-6 w-px bg-[#EEEEEE] shrink-0 hidden sm:block" />

                    <div className="flex items-center gap-2.5 flex-wrap">
                        <select
                            value={bulkVendorId}
                            onChange={(e) => setBulkVendorId(e.target.value)}
                            className="h-[36px] px-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-[10px] text-[12px] font-bold outline-none cursor-pointer focus:border-[#6B1D2E]/50"
                        >
                            <option value="">Vendor Mappings</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.businessName}</option>
                            ))}
                        </select>

                        {bulkVendorId && (
                            <>
                                <input
                                    type="text"
                                    placeholder="Sales Exec"
                                    value={bulkSalesExecutive}
                                    onChange={(e) => setBulkSalesExecutive(e.target.value)}
                                    className="h-[36px] px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-[12px] outline-none w-28 focus:border-[#6B1D2E]/50"
                                />
                                <input
                                    type="text"
                                    placeholder="Territory"
                                    value={bulkTerritory}
                                    onChange={(e) => setBulkTerritory(e.target.value)}
                                    className="h-[36px] px-3 bg-white border border-[#E5E7EB] rounded-[10px] text-[12px] outline-none w-28 focus:border-[#6B1D2E]/50"
                                />
                                <div className="flex items-center border border-[#E5E7EB] rounded-[10px] bg-white overflow-hidden h-[36px]">
                                    <select
                                        value={bulkTagsAction}
                                        onChange={(e) => setBulkTagsAction(e.target.value as 'add' | 'remove' | 'set')}
                                        className="h-full px-2 bg-[#F9FAFB] text-[11px] font-bold border-r border-[#E5E7EB] outline-none"
                                    >
                                        <option value="add">Add Tag</option>
                                        <option value="remove">Del Tag</option>
                                        <option value="set">Set Tag</option>
                                    </select>
                                    <input
                                        type="text"
                                        placeholder="Tag csv"
                                        value={bulkTags}
                                        onChange={(e) => setBulkTags(e.target.value)}
                                        className="h-full px-3 text-[12px] outline-none w-24 border-none"
                                    />
                                </div>
                                <button
                                    onClick={handleBulkSubmit}
                                    className="min-h-12 px-4 bg-[#6B1D2E] hover:bg-[#5A1926] text-white font-semibold rounded-[12px] text-[13px] transition-colors"
                                >
                                    Apply
                                </button>
                            </>
                        )}
                    </div>

                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-[#9CA3AF] hover:text-[#374151] transition-colors ml-auto p-1.5 shrink-0"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <AdminRegistryOverflowMenu active={activeMenu}>
                {(() => {
                    const u = users.find(x => x.id === activeMenu?.id);
                    if (!u) return null;
                    return (
                        <>
                            <AdminRegistryOverflowMenuItem
                                onClick={() => toggleUserActive(u.id, u.isActive)}
                                icon={u.isActive ? <UserX size={14} className="text-red-400" /> : <UserCheck size={14} className="text-green-400" />}
                                label={u.isActive ? 'Deactivate' : 'Activate'}
                            />
                            <AdminRegistryOverflowMenuItem
                                onClick={() => deleteUser(u.id, u.fullName)}
                                icon={<Trash2 size={14} />}
                                label="Delete permanently"
                                danger
                            />
                        </>
                    );
                })()}
            </AdminRegistryOverflowMenu>

            {showAddModal && (
                <CustomerFormModal
                    mode="create"
                    onClose={() => setShowAddModal(false)}
                    onSaved={() => { setShowAddModal(false); refetch(); }}
                />
            )}

            {showImportModal && (
                <ImportCustomersModal
                    onClose={() => setShowImportModal(false)}
                    onImported={() => { setShowImportModal(false); refetch(); }}
                />
            )}
        </div>
    );
}


function ImportCustomersModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<{
        creates: number;
        updates: number;
        errors?: Array<{ row?: number; field?: string; message?: string }>;
        items?: Array<{ row?: number; action?: string; name?: string; phone?: string; email?: string; businessName?: string }>;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [vendors, setVendors] = useState<{ id: string; businessName: string }[]>([]);
    const [vendorId, setVendorId] = useState('');

    useEffect(() => {
        fetch('/api/v1/admin/vendors')
            .then(res => res.json())
            .then(json => { if (json.success) setVendors(json.data.vendors); })
            .catch(console.error);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setPreview(null);
            setError(null);
        }
    };

    const handlePreview = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('mode', 'preview');
            if (vendorId) formData.append('vendorId', vendorId);

            const res = await fetch('/api/v1/admin/users/import', {
                method: 'POST',
                body: formData,
            });
            const json = await res.json();
            if (json.success) {
                setPreview(json.data);
            } else {
                setError(json.error?.message || json.error || 'Failed to fetch preview');
            }
        } catch {
            setError('Failed to fetch preview');
        } finally {
            setLoading(false);
        }
    };

    const handleCommit = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('mode', 'commit');
            if (vendorId) formData.append('vendorId', vendorId);

            const res = await fetch('/api/v1/admin/users/import', {
                method: 'POST',
                body: formData,
            });
            const json = await res.json();
            if (json.success) {
                const data = json.data;
                const errCount = data.errors?.length || 0;
                if (errCount > 0) {
                    toast.warning(`Imported with ${errCount} errors.`);
                } else {
                    toast.success(`Successfully imported ${data.created} new and updated ${data.updated} customers.`);
                }
                onImported();
            } else {
                setError(json.error?.message || json.error || 'Failed to import customers');
                toast.error(json.error?.message || json.error || 'Failed to import customers');
            }
        } catch {
            setError('Failed to import customers');
            toast.error('Failed to import customers');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-[640px] max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 border-b border-[#EEEEEE] flex items-center justify-between shrink-0">
                    <h2 className="text-[18px] font-[800] text-[#181725]">Bulk Import Customers</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
                        <X size={18} />
                    </button>
                </div>

                <FormErrorBanner message={error} className="mx-6" />

                <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">

                    <div className="space-y-1.5">
                        <label className="text-[12px] font-bold text-gray-700">Link mappings to Vendor (Optional)</label>
                        <select
                            value={vendorId}
                            onChange={(e) => setVendorId(e.target.value)}
                            disabled={!!preview}
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-[14px] outline-none focus:border-[#6B1D2E] disabled:bg-gray-50"
                        >
                            <option value="">Do not map (Platform catalog import)</option>
                            {vendors.map(v => (
                                <option key={v.id} value={v.id}>{v.businessName}</option>
                            ))}
                        </select>
                    </div>

                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-gray-50/50 hover:bg-gray-50 transition-colors">
                        <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleFileChange}
                            className="hidden"
                            id="import-file-input"
                        />
                        <label htmlFor="import-file-input" className="cursor-pointer space-y-2 block">
                            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#6B1D2E]/10 text-[#6B1D2E] mb-2">
                                <Users size={24} />
                            </span>
                            <div className="text-[14px] font-bold text-gray-700">
                                {file ? file.name : 'Select Customer Spreadsheet'}
                            </div>
                            <div className="text-[12px] text-gray-400 font-medium">
                                Supports Excel (.xlsx) and CSV templates.
                            </div>
                        </label>
                    </div>

                    {file && !preview && (
                        <button
                            onClick={handlePreview}
                            disabled={loading}
                            className="w-full h-[44px] bg-[#6B1D2E] hover:bg-[#5A1926] text-white rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                        >
                            {loading && <Loader2 size={16} className="animate-spin" />}
                            Generate Preview & Check Errors
                        </button>
                    )}

                    {preview && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 bg-green-50 border border-green-100 rounded-lg text-center">
                                    <div className="text-[20px] font-black text-green-700">{preview.creates}</div>
                                    <div className="text-[11px] font-bold text-green-600 uppercase">To Create</div>
                                </div>
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-center">
                                    <div className="text-[20px] font-black text-blue-700">{preview.updates}</div>
                                    <div className="text-[11px] font-bold text-blue-600 uppercase">To Update</div>
                                </div>
                                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-center">
                                    <div className="text-[20px] font-black text-red-700">{preview.errors?.length || 0}</div>
                                    <div className="text-[11px] font-bold text-red-600 uppercase">Row Errors</div>
                                </div>
                            </div>

                            {preview.errors && preview.errors.length > 0 && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2 max-h-[150px] overflow-y-auto">
                                    <div className="text-[12px] font-bold text-red-700">Formatting Issues found:</div>
                                    {preview.errors.map((e, idx: number) => (
                                        <div key={idx} className="text-[11px] font-medium text-red-600">
                                            Row {e.row}: {e.field ? `[${e.field}] ` : ''}{e.message}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {preview.items && preview.items.length > 0 && (
                                <div className="border border-gray-100 rounded-xl overflow-hidden">
                                    <table className="w-full text-left border-collapse text-[12px]">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100">
                                                <th className="p-2 font-bold text-gray-500">Row</th>
                                                <th className="p-2 font-bold text-gray-500">Action</th>
                                                <th className="p-2 font-bold text-gray-500">Name / Co.</th>
                                                <th className="p-2 font-bold text-gray-500">Contact</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {preview.items.slice(0, 5).map((item) => (
                                                <tr key={item.row}>
                                                    <td className="p-2 font-bold text-gray-400">{item.row}</td>
                                                    <td className="p-2">
                                                        <span className={cn(
                                                            "px-1.5 py-0.5 rounded text-[10px] font-bold capitalize",
                                                            item.action === 'create' ? "bg-green-50 text-green-600" : "bg-blue-50 text-blue-600"
                                                        )}>
                                                            {item.action}
                                                        </span>
                                                    </td>
                                                    <td className="p-2">
                                                        <div className="font-bold text-gray-800">{item.name}</div>
                                                        <div className="text-gray-400 text-[10px]">{item.businessName}</div>
                                                    </td>
                                                    <td className="p-2 text-gray-500">{item.phone}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {preview.items.length > 5 && (
                                        <div className="p-2 bg-gray-50 border-t border-gray-100 text-center text-[10px] text-gray-400 font-bold">
                                            and {preview.items.length - 5} more rows...
                                        </div>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={handleCommit}
                                disabled={loading}
                                className="w-full h-[44px] bg-[#6B1D2E] hover:bg-[#5A1926] text-white rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
                            >
                                {loading && <Loader2 size={16} className="animate-spin" />}
                                Commit import (Write to DB)
                            </button>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-[#EEEEEE] flex justify-end">
                    <button onClick={onClose} disabled={loading}
                        className="px-4 py-2 text-[13px] font-bold text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

