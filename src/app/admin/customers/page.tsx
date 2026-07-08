'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
    Users,
    Package,
    Search,
    MoreVertical,
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import CustomerFormModal from '@/components/features/admin/CustomerFormModal';
import { FormErrorBanner } from '@/components/ui/form';
import { usePermissions } from '@/hooks/usePermissions';
import { useAdminImpersonate } from '@/hooks/useAdminImpersonate';
import { AdminStatusBadge } from '@/components/features/admin/entity';

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
    const totalVendors = users.filter(u => u.role === 'vendor').length;
    const inactiveUsers = users.filter(u => !u.isActive).length;

    const stats = [
        { label: 'All Users', value: users.length.toString(), icon: Users, bgColor: 'bg-[#299E60]/10', iconColor: 'text-[#299E60]' },
        { label: 'Customers', value: totalCustomers.toString(), icon: UserCheck, bgColor: 'bg-blue-50', iconColor: 'text-blue-600' },
        { label: 'Vendors', value: totalVendors.toString(), icon: Package, bgColor: 'bg-purple-50', iconColor: 'text-purple-600' },
        { label: 'Inactive', value: inactiveUsers.toString(), icon: UserX, bgColor: 'bg-red-50', iconColor: 'text-red-500' },
    ];

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

    return (
        <div className="space-y-8 pb-24">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-[28px] font-bold text-[#000000] leading-none mb-1">Customers</h1>
                    <p className="text-[#000000] text-[13px] font-medium opacity-70">Whole data about your Customers</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className="h-[40px] px-4 bg-white border border-[#DCDCDC] hover:bg-gray-50 text-[#4B4B4B] rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                        <Upload size={16} /> Import Customers
                    </button>
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="h-[40px] px-4 bg-[#299E60] hover:bg-[#238a53] text-white rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
                    >
                        <Plus size={16} /> Add User
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-[14px] border border-[#EEEEEE] shadow-sm hover:shadow-md transition-all h-[130px] flex flex-col justify-between">
                        <div className="flex items-center gap-3">
                            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", stat.bgColor)}>
                                <stat.icon size={20} className={stat.iconColor} />
                            </div>
                            <span className="text-[14px] font-bold text-[#4B4B4B]">{stat.label}</span>
                        </div>
                        <h4 className="text-[22px] font-[800] text-[#181725] leading-none">{stat.value}</h4>
                    </div>
                ))}
            </div>

            {/* Users Table Section */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#EEEEEE] flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h3 className="text-[18px] font-bold text-[#181725]">All Users List</h3>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn(
                                "h-[40px] px-3 border rounded-[10px] text-[13px] font-bold flex items-center gap-1.5 transition-colors shadow-sm",
                                showFilters ? "border-[#299E60] bg-[#299E60]/5 text-[#299E60]" : "border-[#DCDCDC] bg-white text-[#4B4B4B] hover:bg-gray-50"
                            )}
                        >
                            <SlidersHorizontal size={16} /> Filters
                        </button>
                        <div className="relative group w-full md:w-[240px]">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#AEAEAE]" size={16} />
                            <input
                                type="text"
                                placeholder="Search name, email, phone, business"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-[40px] w-full bg-white border border-[#DCDCDC] rounded-[10px] pl-10 pr-9 text-[13px] outline-none transition-all placeholder:text-[#AEAEAE] font-medium focus:border-[#299E60]/40 shadow-sm"
                            />
                            {loading && !initialLoad && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AEAEAE] animate-spin" size={14} />
                            )}
                        </div>
                    </div>
                </div>

                {/* Collapsible Filter Panel */}
                {showFilters && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-6 bg-gray-50 border-b border-[#EEEEEE] animate-in slide-in-from-top-4 duration-200">
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Role</label>
                            <select
                                value={filterRole}
                                onChange={(e) => setFilterRole(e.target.value)}
                                className="h-[38px] w-full bg-white border border-[#DCDCDC] rounded-[8px] px-3 text-[13px] outline-none font-medium focus:border-[#299E60]/40"
                            >
                                <option value="all">All Roles</option>
                                <option value="customer">Customer</option>
                                <option value="vendor">Vendor</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Pincode</label>
                            <input
                                type="text"
                                placeholder="e.g. 560001"
                                value={filterPincode}
                                onChange={(e) => setFilterPincode(e.target.value)}
                                className="h-[38px] w-full bg-white border border-[#DCDCDC] rounded-[8px] px-3 text-[13px] outline-none font-medium focus:border-[#299E60]/40"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Salesperson</label>
                            <select
                                value={filterSalespersonId}
                                onChange={(e) => setFilterSalespersonId(e.target.value)}
                                className="h-[38px] w-full bg-white border border-[#DCDCDC] rounded-[8px] px-3 text-[13px] outline-none font-medium focus:border-[#299E60]/40"
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
                            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Credit Status</label>
                            <select
                                value={filterCreditStatus}
                                onChange={(e) => setFilterCreditStatus(e.target.value)}
                                className="h-[38px] w-full bg-white border border-[#DCDCDC] rounded-[8px] px-3 text-[13px] outline-none font-medium focus:border-[#299E60]/40"
                            >
                                <option value="">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="pending">Pending</option>
                                <option value="suspended">Suspended</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Area/City</label>
                            <input
                                type="text"
                                placeholder="e.g. Bangalore"
                                value={filterArea}
                                onChange={(e) => setFilterArea(e.target.value)}
                                className="h-[38px] w-full bg-white border border-[#DCDCDC] rounded-[8px] px-3 text-[13px] outline-none font-medium focus:border-[#299E60]/40"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Tag</label>
                            <input
                                type="text"
                                placeholder="e.g. VIP"
                                value={filterTag}
                                onChange={(e) => setFilterTag(e.target.value)}
                                className="h-[38px] w-full bg-white border border-[#DCDCDC] rounded-[8px] px-3 text-[13px] outline-none font-medium focus:border-[#299E60]/40"
                            />
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto relative">
                    {initialLoad && (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="animate-spin text-[#299E60]" size={32} />
                        </div>
                    )}
                    {!initialLoad && (
                        <table className="w-full">
                            <thead>
                                <tr className="bg-white">
                                    <th className="p-4 w-12 text-center">
                                        <input
                                            type="checkbox"
                                            checked={filteredUsers.length > 0 && selectedIds.size === filteredUsers.length}
                                            onChange={handleSelectAll}
                                            className="w-4 h-4 rounded border-gray-300 text-[#299E60] focus:ring-[#299E60] cursor-pointer"
                                        />
                                    </th>
                                    <th className="p-4 text-left text-[14px] font-[800] text-[#4B4B4B]">Name</th>
                                    <th className="p-4 text-left text-[14px] font-[800] text-[#4B4B4B]">Email</th>
                                    <th className="p-4 text-left text-[14px] font-[800] text-[#4B4B4B]">Phone</th>
                                    <th className="p-4 text-left text-[14px] font-[800] text-[#4B4B4B]">Role</th>
                                    <th className="p-4 text-left text-[14px] font-[800] text-[#4B4B4B]">Business</th>
                                    <th className="p-4 text-left text-[14px] font-[800] text-[#4B4B4B]">Status</th>
                                    <th className="p-4 text-left text-[14px] font-[800] text-[#4B4B4B]">Joined</th>
                                    <th className="p-4 text-center text-[14px] font-[800] text-[#4B4B4B]">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EEEEEE]">
                                {filteredUsers.length > 0 ? (
                                    filteredUsers.map((user) => (
                                        <tr key={user.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="p-4 w-12 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(user.id)}
                                                    onChange={(e) => handleSelectRow(user.id, e.target.checked)}
                                                    className="w-4 h-4 rounded border-gray-300 text-[#299E60] focus:ring-[#299E60] cursor-pointer"
                                                />
                                            </td>
                                            <td className="p-4">
                                                <Link href={`/admin/customers/${user.id}`} className="flex items-center gap-3 group/name cursor-pointer w-fit">
                                                    <div className="w-9 h-9 rounded-full overflow-hidden bg-[#53B175]/10 shrink-0 border border-transparent group-hover/name:border-[#299E60]/30 transition-all flex items-center justify-center">
                                                        <span className="text-[13px] font-black text-[#299E60]">
                                                            {(user.fullName || 'U').charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <span className="text-[14px] font-[800] text-[#181725] tracking-tight hover:text-[#299E60] transition-colors">
                                                        {user.fullName}
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="p-4 text-[13px] font-medium text-[#7C7C7C]">{user.email}</td>
                                            <td className="p-4 text-[13px] font-medium text-[#7C7C7C]">{user.phone || '—'}</td>
                                            <td className="p-4">
                                                <span className={cn(
                                                    "inline-flex items-center px-3 py-1 rounded-md text-[11px] font-bold capitalize",
                                                    user.role === 'admin' ? "bg-purple-50 text-purple-600" :
                                                    user.role === 'vendor' ? "bg-blue-50 text-blue-600" :
                                                    "bg-[#EEF8F1] text-[#299E60]"
                                                )}>
                                                    {user.role}
                                                </span>
                                            </td>
                                            <td className="p-4 text-[13px] font-medium text-[#7C7C7C]">{user.businessName || '—'}</td>
                                            <td className="p-4">
                                                <AdminStatusBadge
                                                    variant={user.isActive ? 'active' : 'inactive'}
                                                />
                                            </td>
                                            <td className="p-4 text-[13px] font-medium text-[#7C7C7C]">
                                                {new Date(user.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex items-center justify-end gap-2 relative">
                                                    {canEditCustomers && user.role === 'customer' && (
                                                        <button
                                                            type="button"
                                                            disabled={impersonateLoading}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                void startCustomerView(user.id);
                                                            }}
                                                            className="h-[34px] px-3 bg-[#299E60] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#238a54] transition-all flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                                                        >
                                                            <UserCircle size={12} />
                                                            View as Customer
                                                            <ArrowUpRight size={12} className="opacity-70" />
                                                        </button>
                                                    )}
                                                    <Link
                                                        href={`/admin/customers/${user.id}`}
                                                        className="h-[34px] px-3 bg-white border border-[#E5E7EB] text-[#374151] rounded-[8px] text-[12px] font-bold hover:bg-[#F9FAFB] transition-all flex items-center justify-center whitespace-nowrap"
                                                    >
                                                        Details
                                                    </Link>
                                                    <button
                                                        onClick={(e) => {
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
                                                        className={cn(
                                                            "w-[34px] h-[34px] flex items-center justify-center rounded-[10px] transition-all shadow-sm",
                                                            activeMenu?.id === user.id ? "bg-gray-100 text-gray-900 border border-gray-200" : "bg-white border border-[#EEEEEE] text-[#7C7C7C] hover:bg-gray-50"
                                                        )}
                                                    >
                                                        <MoreVertical size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={9} className="py-20 text-center text-[#AEAEAE] font-medium">
                                            {searchQuery ? `No users found matching "${searchQuery}"` : 'No users yet'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Sticky Bottom Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-2xl rounded-[16px] px-6 py-4 flex flex-wrap items-center gap-4 z-[9999] max-w-[92%] animate-in slide-in-from-bottom-8 duration-200">
                    <div className="flex items-center gap-2 border-r pr-4 border-gray-100 shrink-0">
                        <span className="bg-[#299E60]/10 text-[#299E60] font-black text-[12px] px-2.5 py-1 rounded-full">
                            {selectedIds.size} Selected
                        </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => handleBulkActiveToggle(true)}
                            className="h-[36px] px-3 bg-green-50 hover:bg-green-100 text-green-700 font-bold rounded-lg text-[12px] transition-colors"
                        >
                            Activate
                        </button>
                        <button
                            onClick={() => handleBulkActiveToggle(false)}
                            className="h-[36px] px-3 bg-red-50 hover:bg-red-100 text-red-700 font-bold rounded-lg text-[12px] transition-colors"
                        >
                            Deactivate
                        </button>
                    </div>

                    <div className="h-6 w-px bg-gray-200 shrink-0 hidden sm:block" />

                    {/* Vendor specific mappings */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <select
                            value={bulkVendorId}
                            onChange={(e) => setBulkVendorId(e.target.value)}
                            className="h-[36px] px-3 bg-gray-50 border border-gray-200 rounded-lg text-[12px] font-bold outline-none cursor-pointer focus:border-[#299E60]"
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
                                    className="h-[36px] px-3 bg-white border border-gray-200 rounded-lg text-[12px] outline-none w-28 focus:border-[#299E60]"
                                />

                                <input
                                    type="text"
                                    placeholder="Territory"
                                    value={bulkTerritory}
                                    onChange={(e) => setBulkTerritory(e.target.value)}
                                    className="h-[36px] px-3 bg-white border border-gray-200 rounded-lg text-[12px] outline-none w-28 focus:border-[#299E60]"
                                />

                                <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden h-[36px]">
                                    <select
                                        value={bulkTagsAction}
                                        onChange={(e) => setBulkTagsAction(e.target.value as 'add' | 'remove' | 'set')}
                                        className="h-full px-2 bg-gray-50 text-[11px] font-bold border-r border-gray-200 outline-none"
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
                                    className="h-[36px] px-4 bg-[#299E60] hover:bg-[#238a53] text-white font-bold rounded-lg text-[12px] transition-colors"
                                >
                                    Apply
                                </button>
                            </>
                        )}
                    </div>

                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="text-gray-400 hover:text-gray-600 transition-colors ml-auto p-1.5 shrink-0"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            {/* Action menu rendered as a portal */}
            {activeMenu && typeof window !== 'undefined' && createPortal(
                <div
                    style={{ position: 'fixed', top: activeMenu.top, right: activeMenu.right, zIndex: 12000 }}
                    className="w-44 bg-white rounded-[8px] shadow-xl border border-gray-100 py-1 overflow-hidden animate-in fade-in zoom-in duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {(() => {
                        const u = users.find(x => x.id === activeMenu.id);
                        if (!u) return null;
                        return (
                            <>
                                <button
                                    onClick={() => toggleUserActive(u.id, u.isActive)}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-semibold text-[#4B4B4B] hover:bg-gray-50 transition-colors text-left"
                                >
                                    {u.isActive ? <UserX size={14} className="text-red-400" /> : <UserCheck size={14} className="text-green-400" />}
                                    {u.isActive ? 'Deactivate' : 'Activate'}
                                </button>
                                <button
                                    onClick={() => deleteUser(u.id, u.fullName)}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-[13px] font-semibold text-red-500 hover:bg-red-50 transition-colors text-left"
                                >
                                    <Trash2 size={14} />
                                    Delete permanently
                                </button>
                            </>
                        );
                    })()}
                </div>,
                document.body,
            )}

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
                            className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-[14px] outline-none focus:border-[#299E60] disabled:bg-gray-50"
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
                            <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#299E60]/10 text-[#299E60] mb-2">
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
                            className="w-full h-[44px] bg-[#299E60] hover:bg-[#238a53] text-white rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
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
                                className="w-full h-[44px] bg-[#299E60] hover:bg-[#238a53] text-white rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-60 transition-colors"
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

