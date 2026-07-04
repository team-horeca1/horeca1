'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Loader2, Save, MapPin, Clock, User, Store, Plus, X, Trash2, Pencil, Users, Eye, EyeOff, FileText, CheckCircle2, AlertCircle, Settings2, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ImageUploadField } from '@/components/ui/ImageUploadField';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { toast } from 'sonner';
import { useSession } from 'next-auth/react';

interface ServiceArea {
    id: string;
    pincode: string;
    isActive: boolean;
}

interface DeliverySlot {
    id: string;
    dayOfWeek: number;
    slotStart: string;
    slotEnd: string;
    cutoffTime: string;
    isActive: boolean;
}

interface VendorSettings {
    id: string;
    businessName: string;
    description: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    minOrderValue: number;
    creditEnabled: boolean;
    vendorType: string | null;
    multiWarehouseEnabled: boolean;
    deliveryFee: number;
    freeDeliveryAbove: number | null;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    addressPincode: string | null;
    gstNumber: string | null;
    serviceAreas: ServiceArea[];
    deliverySlots: DeliverySlot[];
    user: { email: string; phone: string | null; fullName: string };
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankIfsc: string | null;
    bankName: string | null;
    bankAccountType: string | null;
}

const DOC_TYPE_LABELS: Record<string, string> = {
    fssai: 'FSSAI License',
    gst: 'GST Certificate',
    pan: 'PAN Card',
    bank_proof: 'Bank Proof',
    other: 'Other Document',
};

interface VendorDocument {
    id: string;
    type: 'fssai' | 'gst' | 'pan' | 'bank_proof' | 'other';
    fileUrl: string;
    fileName: string;
    status: string;
    adminNote: string | null;
    uploadedAt: string;
}

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatTime(t: string): string {
    const [hours, minutes] = t.split(':');
    const h = parseInt(hours, 10);
    return `${h % 12 || 12}:${minutes} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function VendorSettingsPage() {
    const confirm = useConfirm();
    const { data: session } = useSession();
    const activeBusinessAccountId = (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId;
    const [settings, setSettings] = useState<VendorSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // Profile fields
    const [businessName, setBusinessName] = useState('');
    const [description, setDescription] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [bannerUrl, setBannerUrl] = useState('');
    const [minOrderValue, setMinOrderValue] = useState('');
    const [creditEnabled, setCreditEnabled] = useState(false);

    // Registered business address — shown on tax invoices
    const [addressLine, setAddressLine] = useState('');
    const [city, setCity] = useState('');
    const [stateName, setStateName] = useState('');
    const [addressPincode, setAddressPincode] = useState('');
    const [gstNumber, setGstNumber] = useState('');

    // Service area add form
    const [newPincode, setNewPincode] = useState('');
    const [addingArea, setAddingArea] = useState(false);

    // Delivery slot add/edit form
    const [showSlotForm, setShowSlotForm] = useState(false);
    const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
    const [slotDay, setSlotDay] = useState(1);
    const [slotStart, setSlotStart] = useState('');
    const [slotEnd, setSlotEnd] = useState('');
    const [slotCutoff, setSlotCutoff] = useState('');
    const [savingSlot, setSavingSlot] = useState(false);

    // Payment modes
    const [paymentModes, setPaymentModes] = useState<string[]>(['cod', 'prepaid']);
    const [vendorType, setVendorType] = useState<'distributor' | 'wholesaler' | 'dark_store'>('distributor');
    const [multiWarehouseEnabled, setMultiWarehouseEnabled] = useState(false);

    // Bank account details
    const [bankAccountName, setBankAccountName] = useState('');
    const [bankAccountNumber, setBankAccountNumber] = useState('');
    const [bankShowNumber, setBankShowNumber] = useState(false);
    const [bankIfsc, setBankIfsc] = useState('');
    const [bankName, setBankName] = useState('');
    const [bankAccountType, setBankAccountType] = useState<'current' | 'savings' | ''>('');

    // Ordering defaults + policies
    const [defaultMOQ, setDefaultMOQ] = useState('');
    const [defaultTaxPercent, setDefaultTaxPercent] = useState('');
    const [deliveryFeeVal, setDeliveryFeeVal] = useState('');
    const [freeDeliveryAbove, setFreeDeliveryAbove] = useState('');
    const [returnPolicy, setReturnPolicy] = useState('');
    const [cancellationPolicy, setCancellationPolicy] = useState('');

    // Documents state — direct file upload (file is sent to our droplet, not ImageKit)
    const [documents, setDocuments] = useState<VendorDocument[]>([]);
    const [docType, setDocType] = useState<VendorDocument['type']>('fssai');
    const [docFile, setDocFile] = useState<File | null>(null);
    const docFileRef = useRef<HTMLInputElement>(null);
    const [uploadingDoc, setUploadingDoc] = useState(false);

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/v1/vendor/settings');
            const json = await res.json();
            if (json.success) {
                const data = json.data;
                setSettings(data);
                setBusinessName(data.businessName);
                setDescription(data.description || '');
                setLogoUrl(data.logoUrl || '');
                setBannerUrl(data.bannerUrl || '');
                setMinOrderValue(String(data.minOrderValue));
                setCreditEnabled(data.creditEnabled);
                setAddressLine(data.addressLine || '');
                setCity(data.city || '');
                setStateName(data.state || '');
                setAddressPincode(data.addressPincode || '');
                setGstNumber(data.gstNumber || '');
                setDefaultMOQ(data.defaultMOQ != null ? String(data.defaultMOQ) : '');
                setDefaultTaxPercent(data.defaultTaxPercent != null ? String(data.defaultTaxPercent) : '');
                setDeliveryFeeVal(data.deliveryFee != null ? String(data.deliveryFee) : '');
                setFreeDeliveryAbove(data.freeDeliveryAbove != null ? String(data.freeDeliveryAbove) : '');
                setReturnPolicy(data.returnPolicy || '');
                setCancellationPolicy(data.cancellationPolicy || '');
                if (Array.isArray(data.paymentModes) && data.paymentModes.length > 0) {
                    setPaymentModes(data.paymentModes);
                }
                if (data.vendorType === 'distributor' || data.vendorType === 'wholesaler' || data.vendorType === 'dark_store') {
                    setVendorType(data.vendorType);
                }
                setMultiWarehouseEnabled(!!data.multiWarehouseEnabled);
                setBankAccountName(data.bankAccountName || '');
                setBankAccountNumber(data.bankAccountNumber || '');
                setBankIfsc(data.bankIfsc || '');
                setBankName(data.bankName || '');
                setBankAccountType((data.bankAccountType as 'current' | 'savings' | '') || '');
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchDocuments = useCallback(async () => {
        try {
            const res = await fetch('/api/v1/vendor/documents');
            const json = await res.json();
            if (json.success) setDocuments(json.data);
        } catch (err) {
            console.error('Failed to load documents:', err);
        }
    }, []);

    useEffect(() => { fetchSettings(); fetchDocuments(); }, [fetchSettings, fetchDocuments]);

    const handleUploadDoc = async () => {
        if (!docFile) return;
        // Guard mirrors the server allow-list so we fail fast with a clear message.
        const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
        if (!ALLOWED.includes(docFile.type)) {
            toast.error('Unsupported file. Use PDF, JPG, PNG or WebP.');
            return;
        }
        if (docFile.size > 10 * 1024 * 1024) {
            toast.error('File too large. Max size is 10MB.');
            return;
        }
        try {
            setUploadingDoc(true);
            const fd = new FormData();
            fd.append('file', docFile);
            fd.append('type', docType);
            const res = await fetch('/api/v1/vendor/documents/upload', {
                method: 'POST',
                body: fd,
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Upload failed');
            await fetchDocuments();
            setDocFile(null);
            setDocType('fssai');
            if (docFileRef.current) docFileRef.current.value = '';
            toast.success('Document uploaded');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setUploadingDoc(false);
        }
    };

    // ── Profile Save ──
    const handleSave = async () => {
        try {
            setSaving(true);
            setSaved(false);
            const res = await fetch('/api/v1/vendor/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    businessName,
                    // The API now accepts null/empty values and relative/absolute URLs.
                    // Sending null allows the vendor to clear these fields in the database.
                    description: description || null,
                    logoUrl: logoUrl || null,
                    bannerUrl: bannerUrl || null,
                    minOrderValue: parseFloat(minOrderValue) || 0,
                    creditEnabled,
                    addressLine: addressLine || undefined,
                    city: city || undefined,
                    state: stateName || undefined,
                    addressPincode: addressPincode || undefined,
                    gstNumber: gstNumber || undefined,
                    defaultMOQ: defaultMOQ ? parseInt(defaultMOQ, 10) : undefined,
                    defaultTaxPercent: defaultTaxPercent ? parseFloat(defaultTaxPercent) : undefined,
                    deliveryFee: deliveryFeeVal ? parseFloat(deliveryFeeVal) : undefined,
                    freeDeliveryAbove: freeDeliveryAbove ? parseFloat(freeDeliveryAbove) : undefined,
                    returnPolicy: returnPolicy || undefined,
                    cancellationPolicy: cancellationPolicy || undefined,
                    bankAccountName: bankAccountName || null,
                    bankAccountNumber: bankAccountNumber || null,
                    bankIfsc: bankIfsc || null,
                    bankName: bankName || null,
                    bankAccountType: bankAccountType || null,
                    paymentModes,
                    vendorType,
                    multiWarehouseEnabled,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Save failed');
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    // ── Service Area CRUD ──
    const handleAddArea = async () => {
        if (!newPincode.trim()) return;
        try {
            setAddingArea(true);
            const res = await fetch('/api/v1/vendor/settings/service-areas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pincode: newPincode.trim() }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed to add');
            setSettings(prev => prev ? { ...prev, serviceAreas: [...prev.serviceAreas, json.data] } : prev);
            setNewPincode('');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to add service area');
        } finally {
            setAddingArea(false);
        }
    };

    const handleToggleArea = async (area: ServiceArea) => {
        try {
            const res = await fetch('/api/v1/vendor/settings/service-areas', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: area.id, isActive: !area.isActive }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed to update');
            setSettings(prev => prev ? {
                ...prev,
                serviceAreas: prev.serviceAreas.map(a => a.id === area.id ? json.data : a),
            } : prev);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update');
        }
    };

    const handleDeleteArea = async (area: ServiceArea) => {
        const ok = await confirm({
            title: 'Remove service area?',
            message: `Customers in pincode ${area.pincode} will no longer be able to order from you.`,
            confirmText: 'Remove',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            const res = await fetch('/api/v1/vendor/settings/service-areas', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: area.id }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed to delete');
            setSettings(prev => prev ? {
                ...prev,
                serviceAreas: prev.serviceAreas.filter(a => a.id !== area.id),
            } : prev);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    // ── Delivery Slot CRUD ──
    const resetSlotForm = () => {
        setShowSlotForm(false);
        setEditingSlotId(null);
        setSlotDay(1);
        setSlotStart('');
        setSlotEnd('');
        setSlotCutoff('');
    };

    const openAddSlot = () => { resetSlotForm(); setShowSlotForm(true); };

    const openEditSlot = (slot: DeliverySlot) => {
        setEditingSlotId(slot.id);
        setSlotDay(slot.dayOfWeek);
        setSlotStart(slot.slotStart);
        setSlotEnd(slot.slotEnd);
        setSlotCutoff(slot.cutoffTime);
        setShowSlotForm(true);
    };

    const handleSaveSlot = async () => {
        if (!slotStart || !slotEnd || !slotCutoff) { toast.error('Please fill all time fields'); return; }
        try {
            setSavingSlot(true);
            if (editingSlotId) {
                const res = await fetch('/api/v1/vendor/settings/delivery-slots', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: editingSlotId, dayOfWeek: slotDay, slotStart, slotEnd, cutoffTime: slotCutoff }),
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error?.message || 'Failed to update');
                setSettings(prev => prev ? { ...prev, deliverySlots: prev.deliverySlots.map(s => s.id === editingSlotId ? json.data : s) } : prev);
            } else {
                const res = await fetch('/api/v1/vendor/settings/delivery-slots', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dayOfWeek: slotDay, slotStart, slotEnd, cutoffTime: slotCutoff }),
                });
                const json = await res.json();
                if (!json.success) throw new Error(json.error?.message || 'Failed to add');
                setSettings(prev => prev ? { ...prev, deliverySlots: [...prev.deliverySlots, json.data] } : prev);
            }
            resetSlotForm();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to save slot');
        } finally {
            setSavingSlot(false);
        }
    };

    const handleToggleSlot = async (slot: DeliverySlot) => {
        try {
            const res = await fetch('/api/v1/vendor/settings/delivery-slots', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: slot.id, isActive: !slot.isActive }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed to update');
            setSettings(prev => prev ? { ...prev, deliverySlots: prev.deliverySlots.map(s => s.id === slot.id ? json.data : s) } : prev);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update');
        }
    };

    const handleDeleteSlot = async (slot: DeliverySlot) => {
        const ok = await confirm({
            title: 'Delete delivery slot?',
            message: `${DAY_NAMES[slot.dayOfWeek]} ${formatTime(slot.slotStart)} – ${formatTime(slot.slotEnd)} will be removed. If it's linked to existing orders, try deactivating instead.`,
            confirmText: 'Delete',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            const res = await fetch('/api/v1/vendor/settings/delivery-slots', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: slot.id }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error?.message || 'Failed to delete');
            setSettings(prev => prev ? { ...prev, deliverySlots: prev.deliverySlots.filter(s => s.id !== slot.id) } : prev);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete. It may be linked to existing orders — try deactivating instead.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 size={36} className="animate-spin text-[#299E60]" />
            </div>
        );
    }

    if (!settings) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <p className="text-[16px] font-bold text-[#7C7C7C]">Failed to load settings</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-10 max-w-[800px]">
            <div>
                <h1 className="text-[28px] font-bold text-[#000000] leading-none mb-1">Settings</h1>
                <p className="text-[#000000] text-[13px] font-medium opacity-70">Manage your store settings</p>
            </div>

            {activeBusinessAccountId && (
                <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Building2 size={20} className="text-[#299E60]" />
                        <div>
                            <h2 className="text-[16px] font-bold text-[#181725]">Outlets & branches</h2>
                            <p className="text-[12px] text-[#AEAEAE]">Manage warehouse and delivery locations for multi-outlet ops</p>
                        </div>
                    </div>
                    <Link
                        href={`/account/${activeBusinessAccountId}/outlets`}
                        className="h-[40px] px-4 rounded-[10px] bg-[#181725] text-white text-[13px] font-bold flex items-center"
                    >
                        Manage outlets
                    </Link>
                </div>
            )}

            {/* Business Profile */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#EEEEEE] flex items-center gap-2">
                    <Store size={20} className="text-[#299E60]" />
                    <h2 className="text-[18px] font-bold text-[#181725]">Business Profile</h2>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Business Name</label>
                        <input
                            type="text"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40"
                        />
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#299E60]/40 resize-none"
                        />
                    </div>
                    <div className="space-y-5">
                        <ImageUploadField
                            label="Store Logo"
                            aspectHint="Square — shown on the vendor detail page (200×200 recommended)"
                            value={logoUrl || null}
                            onChange={(url) => setLogoUrl(url ?? '')}
                            folder="vendors"
                            variant="brand-logo"
                        />
                        <ImageUploadField
                            label="Store Card Image"
                            aspectHint="Shows on the vendor card (280×160 recommended)"
                            value={bannerUrl || null}
                            onChange={(url) => setBannerUrl(url ?? '')}
                            folder="vendors"
                            variant="vendor-cover"
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Business type</label>
                            <select
                                value={vendorType}
                                onChange={(e) => setVendorType(e.target.value as typeof vendorType)}
                                className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40 bg-white"
                            >
                                <option value="distributor">Distributor</option>
                                <option value="wholesaler">Wholesaler</option>
                                <option value="dark_store">Dark store</option>
                            </select>
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={multiWarehouseEnabled}
                                    onChange={(e) => setMultiWarehouseEnabled(e.target.checked)}
                                    className="w-5 h-5 accent-[#299E60]"
                                />
                                <span className="text-[14px] font-bold text-[#181725]">Enable multi-warehouse inventory</span>
                            </label>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Minimum Order Value (₹)</label>
                            <input
                                type="number"
                                value={minOrderValue}
                                onChange={(e) => setMinOrderValue(e.target.value)}
                                className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40"
                            />
                        </div>
                        <div className="flex items-end pb-1">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input type="checkbox" checked={creditEnabled} onChange={(e) => setCreditEnabled(e.target.checked)} className="w-5 h-5 accent-[#299E60]" />
                                <span className="text-[14px] font-bold text-[#181725]">Enable credit for customers</span>
                            </label>
                        </div>
                    </div>

                    {/* Registered business address — appears on tax invoices */}
                    <div className="pt-4 mt-2 border-t border-[#EEEEEE]">
                        <h3 className="text-[15px] font-bold text-[#181725] mb-1">Registered Business Address</h3>
                        <p className="text-[12px] text-[#7C7C7C] mb-4">Used as the &quot;Bill From / Shipped From&quot; on every tax invoice you issue.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Street / Building / Locality</label>
                                <textarea
                                    value={addressLine}
                                    onChange={(e) => setAddressLine(e.target.value)}
                                    placeholder="e.g. Shop 12, Sai Plaza, Andheri Kurla Road, Marol"
                                    rows={2}
                                    className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#299E60]/40 resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-[13px] font-bold text-[#181725] mb-1.5">City</label>
                                    <input
                                        type="text"
                                        value={city}
                                        onChange={(e) => setCity(e.target.value)}
                                        placeholder="Mumbai"
                                        className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-[#181725] mb-1.5">State</label>
                                    <input
                                        type="text"
                                        value={stateName}
                                        onChange={(e) => setStateName(e.target.value)}
                                        placeholder="Maharashtra"
                                        className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Pincode</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={addressPincode}
                                        onChange={(e) => setAddressPincode(e.target.value.replace(/[^\d]/g, ''))}
                                        placeholder="400069"
                                        className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-[13px] font-bold text-[#181725] mb-1.5">GSTIN</label>
                                <input
                                    type="text"
                                    value={gstNumber}
                                    onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                                    placeholder="27AAACZ8867B1Z7"
                                    maxLength={15}
                                    className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-mono outline-none focus:border-[#299E60]/40"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex items-center gap-3">
                        <button onClick={handleSave} disabled={saving}
                            className="h-[48px] px-8 bg-[#299E60] text-white rounded-[12px] text-[14px] font-bold hover:bg-[#238a54] transition-all shadow-sm flex items-center gap-2 disabled:opacity-50">
                            <Save size={16} />
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                        {saved && <span className="text-[14px] font-bold text-[#299E60] animate-pulse">Saved successfully!</span>}
                    </div>
                </div>
            </div>

            {/* Account Info */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#EEEEEE] flex items-center gap-2">
                    <User size={20} className="text-[#3B82F6]" />
                    <h2 className="text-[18px] font-bold text-[#181725]">Account Information</h2>
                </div>
                <div className="p-6 space-y-3">
                    <div className="flex items-center justify-between py-2">
                        <span className="text-[14px] text-[#7C7C7C]">Name</span>
                        <span className="text-[14px] font-bold text-[#181725]">{settings.user.fullName}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-t border-[#F5F5F5]">
                        <span className="text-[14px] text-[#7C7C7C]">Email</span>
                        <span className="text-[14px] font-bold text-[#181725]">{settings.user.email}</span>
                    </div>
                    {settings.user.phone && (
                        <div className="flex items-center justify-between py-2 border-t border-[#F5F5F5]">
                            <span className="text-[14px] text-[#7C7C7C]">Phone</span>
                            <span className="text-[14px] font-bold text-[#181725]">{settings.user.phone}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Service Areas */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#EEEEEE] flex items-center gap-2">
                    <MapPin size={20} className="text-[#F59E0B]" />
                    <h2 className="text-[18px] font-bold text-[#181725]">Service Areas</h2>
                    <span className="text-[14px] text-[#AEAEAE]">({settings.serviceAreas.length})</span>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <input
                            type="text"
                            value={newPincode}
                            onChange={(e) => setNewPincode(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
                            placeholder="Enter pincode..."
                            className="h-[40px] w-[180px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40"
                        />
                        <button onClick={handleAddArea} disabled={addingArea || !newPincode.trim()}
                            className="h-[40px] px-5 bg-[#299E60] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#238a54] transition-colors flex items-center gap-1.5 disabled:opacity-50">
                            <Plus size={14} />
                            {addingArea ? 'Adding...' : 'Add Area'}
                        </button>
                    </div>
                    {settings.serviceAreas.length === 0 ? (
                        <p className="text-[14px] text-[#AEAEAE]">No service areas configured. Add a pincode above.</p>
                    ) : (
                        <div className="flex flex-wrap gap-3">
                            {settings.serviceAreas.map((area) => (
                                <div key={area.id} className={cn(
                                    'flex items-center gap-2 pl-4 pr-2 py-2 rounded-[10px] border text-[13px] font-bold group',
                                    area.isActive ? 'bg-[#FFF8E1] border-[#F59E0B]/20 text-[#976538]' : 'bg-[#F5F5F5] border-[#EEEEEE] text-[#AEAEAE]'
                                )}>
                                    <MapPin size={14} />
                                    <span>{area.pincode}</span>
                                    <button onClick={() => handleToggleArea(area)}
                                        className="relative ml-1 inline-flex h-[18px] w-[32px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                                        style={{ backgroundColor: area.isActive ? '#299E60' : '#D1D5DB' }}>
                                        <span className="inline-block h-[13px] w-[13px] rounded-full bg-white shadow-sm transition-transform duration-200" style={{ transform: area.isActive ? 'translateX(16px)' : 'translateX(3px)' }} />
                                    </button>
                                    <button onClick={() => handleDeleteArea(area)} className="p-1 rounded hover:bg-red-50 transition-colors">
                                        <X size={14} className="text-[#E74C3C]" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Delivery Slots */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#EEEEEE] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Clock size={20} className="text-[#8B5CF6]" />
                        <h2 className="text-[18px] font-bold text-[#181725]">Delivery Slots</h2>
                        <span className="text-[14px] text-[#AEAEAE]">({settings.deliverySlots.length})</span>
                    </div>
                    <button onClick={openAddSlot}
                        className="h-[36px] px-4 bg-[#8B5CF6] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#7C3AED] transition-colors flex items-center gap-1.5">
                        <Plus size={14} /> Add Slot
                    </button>
                </div>
                {showSlotForm && (
                    <div className="p-6 border-b border-[#EEEEEE] bg-[#FAFAFA]">
                        <h3 className="text-[14px] font-bold text-[#181725] mb-4">{editingSlotId ? 'Edit Delivery Slot' : 'New Delivery Slot'}</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div>
                                <label className="block text-[12px] font-bold text-[#7C7C7C] mb-1">Day</label>
                                <select value={slotDay} onChange={(e) => setSlotDay(Number(e.target.value))}
                                    className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px] outline-none focus:border-[#8B5CF6]/40 bg-white">
                                    {[1,2,3,4,5,6,7].map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[12px] font-bold text-[#7C7C7C] mb-1">Start Time</label>
                                <input type="time" value={slotStart} onChange={(e) => setSlotStart(e.target.value)}
                                    className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px] outline-none focus:border-[#8B5CF6]/40" />
                            </div>
                            <div>
                                <label className="block text-[12px] font-bold text-[#7C7C7C] mb-1">End Time</label>
                                <input type="time" value={slotEnd} onChange={(e) => setSlotEnd(e.target.value)}
                                    className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px] outline-none focus:border-[#8B5CF6]/40" />
                            </div>
                            <div>
                                <label className="block text-[12px] font-bold text-[#7C7C7C] mb-1">Cutoff Time</label>
                                <input type="time" value={slotCutoff} onChange={(e) => setSlotCutoff(e.target.value)}
                                    className="w-full h-[40px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px] outline-none focus:border-[#8B5CF6]/40" />
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <button onClick={handleSaveSlot} disabled={savingSlot}
                                className="h-[40px] px-6 bg-[#8B5CF6] text-white rounded-[10px] text-[13px] font-bold hover:bg-[#7C3AED] transition-colors flex items-center gap-1.5 disabled:opacity-50">
                                <Save size={14} /> {savingSlot ? 'Saving...' : editingSlotId ? 'Update Slot' : 'Add Slot'}
                            </button>
                            <button onClick={resetSlotForm}
                                className="h-[40px] px-6 bg-gray-100 text-[#7C7C7C] rounded-[10px] text-[13px] font-bold hover:bg-gray-200 transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
                <div className="divide-y divide-[#F5F5F5]">
                    {settings.deliverySlots.length === 0 && !showSlotForm ? (
                        <div className="p-6">
                            <p className="text-[14px] text-[#AEAEAE]">No delivery slots configured. Click &quot;Add Slot&quot; to create one.</p>
                        </div>
                    ) : (
                        settings.deliverySlots.map((slot) => (
                            <div key={slot.id} className={cn('px-6 py-4 flex items-center justify-between transition-colors', !slot.isActive && 'opacity-60')}>
                                <div>
                                    <p className="text-[14px] font-bold text-[#181725]">{DAY_NAMES[slot.dayOfWeek] || `Day ${slot.dayOfWeek}`}</p>
                                    <p className="text-[12px] text-[#7C7C7C]">{formatTime(slot.slotStart)} - {formatTime(slot.slotEnd)} (Cutoff: {formatTime(slot.cutoffTime)})</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={cn('text-[11px] font-[900] px-2.5 py-1.5 rounded-[6px] uppercase', slot.isActive ? 'bg-[#EEF8F1] text-[#299E60]' : 'bg-[#F5F5F5] text-[#AEAEAE]')}>
                                        {slot.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                    <button onClick={() => handleToggleSlot(slot)}
                                        className="relative inline-flex h-[20px] w-[36px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200"
                                        style={{ backgroundColor: slot.isActive ? '#299E60' : '#D1D5DB' }}>
                                        <span className="inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform duration-200" style={{ transform: slot.isActive ? 'translateX(18px)' : 'translateX(3px)' }} />
                                    </button>
                                    <button onClick={() => openEditSlot(slot)} className="p-1.5 rounded-[6px] hover:bg-blue-50 transition-colors">
                                        <Pencil size={14} className="text-[#3B82F6]" />
                                    </button>
                                    <button onClick={() => handleDeleteSlot(slot)} className="p-1.5 rounded-[6px] hover:bg-red-50 transition-colors">
                                        <Trash2 size={14} className="text-[#E74C3C]" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* ── TEAM MEMBERS REDIRECT ── */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#EEF8F1] flex items-center justify-center text-[#299E60] shrink-0">
                        <Users size={20} />
                    </div>
                    <div>
                        <h2 className="text-[16px] font-bold text-[#181725]">Team Management</h2>
                        <p className="text-[13px] text-[#7C7C7C] mt-0.5">Invite staff, manage permissions and roles</p>
                    </div>
                </div>
                <Link href="/vendor/team" className="h-[36px] px-4 bg-[#EEF8F1] hover:bg-[#E2F4E7] text-[#299E60] rounded-[10px] text-[13px] font-bold transition-colors flex items-center justify-center shrink-0">
                    Manage Team
                </Link>
            </div>

            {/* Payment Modes */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#EEEEEE] flex items-center gap-2">
                    <div className="w-[32px] h-[32px] rounded-[8px] bg-orange-50 flex items-center justify-center text-orange-500"><Settings2 size={16} /></div>
                    <h2 className="text-[18px] font-bold text-[#181725]">Accepted Payment Modes</h2>
                </div>
                <div className="p-6 space-y-4">
                    {[
                        { value: 'cod',     label: 'COD',           description: 'Cash on Delivery' },
                        { value: 'prepaid', label: 'Prepaid',       description: 'Online payment (UPI, card, net banking)' },
                        { value: 'credit',  label: 'Vendor Credit', description: 'Allow customers to purchase on credit' },
                        { value: 'cheque',  label: 'Cheque',        description: 'Accept cheque payments' },
                    ].map(({ value, label, description }) => {
                        const enabled = paymentModes.includes(value);
                        return (
                            <div key={value} className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-[14px] font-bold text-[#181725]">{label}</p>
                                    <p className="text-[12px] text-[#7C7C7C]">{description}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPaymentModes(prev =>
                                        prev.includes(value) ? prev.filter(m => m !== value) : [...prev, value]
                                    )}
                                    className={`relative inline-flex h-[24px] w-[44px] shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${enabled ? 'bg-orange-500' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
                                </button>
                            </div>
                        );
                    })}
                    {/* DiSCCO — coming soon */}
                    <div className="flex items-center justify-between gap-4 opacity-40">
                        <div>
                            <p className="text-[14px] font-bold text-[#181725]">DiSCCO <span className="text-[11px] font-normal text-[#AEAEAE] ml-1">coming soon</span></p>
                            <p className="text-[12px] text-[#7C7C7C]">B2B credit via DiSCCO platform</p>
                        </div>
                        <div className="relative inline-flex h-[24px] w-[44px] shrink-0 items-center rounded-full bg-gray-200 cursor-not-allowed">
                            <span className="inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm translate-x-[3px]" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Ordering Defaults */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-[32px] h-[32px] rounded-[8px] bg-[#EEF8F1] flex items-center justify-center text-[#299E60]"><Settings2 size={16} /></div>
                    <h3 className="text-[16px] font-bold text-[#181725]">Ordering Defaults</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Default MOQ</label>
                        <input type="number" min={1} value={defaultMOQ} onChange={e => setDefaultMOQ(e.target.value)} placeholder="e.g. 1" className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40 bg-white" />
                        <p className="text-[11px] text-[#AEAEAE] mt-1">Minimum order qty for new products</p>
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Default Tax %</label>
                        <select value={defaultTaxPercent} onChange={e => setDefaultTaxPercent(e.target.value)} className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40 bg-white appearance-none">
                            <option value="">Not set</option>
                            <option value="0">0% (Exempt)</option>
                            <option value="5">5% GST</option>
                            <option value="12">12% GST</option>
                            <option value="18">18% GST</option>
                            <option value="28">28% GST</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Delivery Fee (₹)</label>
                        <input type="number" min={0} step={0.01} value={deliveryFeeVal} onChange={e => setDeliveryFeeVal(e.target.value)} placeholder="0 = free" className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40 bg-white" />
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Free Delivery Above (₹)</label>
                        <input type="number" min={0} step={0.01} value={freeDeliveryAbove} onChange={e => setFreeDeliveryAbove(e.target.value)} placeholder="Leave blank to always charge" className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40 bg-white" />
                    </div>
                </div>
            </div>

            {/* Store Policies */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm p-6">
                <div className="flex items-center gap-2.5 mb-5">
                    <div className="w-[32px] h-[32px] rounded-[8px] bg-[#EEF8F1] flex items-center justify-center text-[#299E60]"><FileText size={16} /></div>
                    <h3 className="text-[16px] font-bold text-[#181725]">Store Policies</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Return Policy</label>
                        <textarea rows={3} value={returnPolicy} onChange={e => setReturnPolicy(e.target.value)} maxLength={2000} placeholder="e.g. Returns accepted within 48 hours of delivery for damaged or incorrect goods..." className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#299E60]/40 transition-colors resize-none bg-white" />
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Cancellation Policy</label>
                        <textarea rows={3} value={cancellationPolicy} onChange={e => setCancellationPolicy(e.target.value)} maxLength={2000} placeholder="e.g. Orders can be cancelled before they are accepted. No cancellations after dispatch." className="w-full border border-[#EEEEEE] rounded-[10px] px-4 py-3 text-[14px] outline-none focus:border-[#299E60]/40 transition-colors resize-none bg-white" />
                    </div>
                </div>
            </div>

            {/* Bank Account Details */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#EEEEEE] flex items-center gap-2">
                    <Building2 size={20} className="text-[#299E60]" />
                    <h2 className="text-[18px] font-bold text-[#181725]">Bank Account Details</h2>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-[13px] text-[#7C7C7C]">Used for settlement payouts. Ensure the details match your registered business bank account.</p>
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Account Holder Name</label>
                        <input
                            type="text"
                            value={bankAccountName}
                            onChange={e => setBankAccountName(e.target.value)}
                            placeholder="e.g. Sharma Foods Pvt Ltd"
                            className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40"
                        />
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Account Number</label>
                        <div className="relative">
                            <input
                                type={bankShowNumber ? 'text' : 'password'}
                                value={bankAccountNumber}
                                onChange={e => setBankAccountNumber(e.target.value)}
                                placeholder="Enter account number"
                                maxLength={30}
                                className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 pr-12 text-[14px] font-mono outline-none focus:border-[#299E60]/40"
                            />
                            <button
                                type="button"
                                onClick={() => setBankShowNumber(v => !v)}
                                aria-label={bankShowNumber ? 'Hide account number' : 'Show account number'}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#AEAEAE] hover:text-[#181725] transition-colors"
                                tabIndex={-1}
                            >
                                {bankShowNumber ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">IFSC Code</label>
                            <input
                                type="text"
                                value={bankIfsc}
                                onChange={e => setBankIfsc(e.target.value.toUpperCase())}
                                placeholder="e.g. HDFC0001234"
                                maxLength={11}
                                className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] font-mono outline-none focus:border-[#299E60]/40"
                            />
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-[#181725] mb-1.5">Bank Name</label>
                            <input
                                type="text"
                                value={bankName}
                                onChange={e => setBankName(e.target.value)}
                                placeholder="e.g. HDFC Bank"
                                className="w-full h-[44px] border border-[#EEEEEE] rounded-[10px] px-4 text-[14px] outline-none focus:border-[#299E60]/40"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[13px] font-bold text-[#181725] mb-2">Account Type</label>
                        <div className="flex items-center gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="bankAccountType"
                                    value="current"
                                    checked={bankAccountType === 'current'}
                                    onChange={() => setBankAccountType('current')}
                                    className="accent-[#299E60] w-4 h-4"
                                />
                                <span className="text-[14px] font-medium text-[#181725]">Current</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="bankAccountType"
                                    value="savings"
                                    checked={bankAccountType === 'savings'}
                                    onChange={() => setBankAccountType('savings')}
                                    className="accent-[#299E60] w-4 h-4"
                                />
                                <span className="text-[14px] font-medium text-[#181725]">Savings</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            {/* Verification Documents */}
            <div className="bg-white rounded-[14px] border border-[#EEEEEE] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[#EEEEEE] flex items-center gap-2">
                    <FileText size={20} className="text-[#299E60]" />
                    <h2 className="text-[18px] font-bold text-[#181725]">Verification Documents</h2>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-[13px] text-[#7C7C7C]">Upload FSSAI license, GST certificate, PAN card, and bank proof so our team can verify your store.</p>

                    {/* Uploaded docs */}
                    {documents.length > 0 && (
                        <div className="divide-y divide-[#F5F5F5] border border-[#EEEEEE] rounded-[10px] overflow-hidden">
                            {documents.map(doc => (
                                <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                                    <FileText size={16} className="text-[#AEAEAE] shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-bold text-[#181725] truncate">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</p>
                                        <p className="text-[11px] text-[#AEAEAE] truncate">{doc.fileName}</p>
                                    </div>
                                    {doc.status === 'verified' ? (
                                        <span className="flex items-center gap-1 text-[11px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-[5px] shrink-0">
                                            <CheckCircle2 size={11} /> Verified
                                        </span>
                                    ) : doc.status === 'rejected' ? (
                                        <span className="flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-[5px] shrink-0">
                                            <AlertCircle size={11} /> Rejected
                                        </span>
                                    ) : (
                                        <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-[5px] shrink-0">Pending</span>
                                    )}
                                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                        className="text-[12px] font-bold text-[#299E60] hover:underline shrink-0">View</a>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Upload form — pick a file straight from the computer */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <select
                            value={docType}
                            onChange={e => setDocType(e.target.value as VendorDocument['type'])}
                            className="h-[44px] border border-[#EEEEEE] rounded-[10px] px-3 text-[14px] outline-none focus:border-[#299E60]/40 bg-white"
                        >
                            {Object.entries(DOC_TYPE_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                            ))}
                        </select>

                        {/* Hidden native input + styled trigger so it matches the rest of the form */}
                        <input
                            ref={docFileRef}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            onChange={e => setDocFile(e.target.files?.[0] ?? null)}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => docFileRef.current?.click()}
                            className="h-[44px] flex items-center gap-2 border border-dashed border-[#299E60]/40 rounded-[10px] px-4 text-[14px] text-left outline-none hover:bg-[#EEF8F1]/40 transition-colors"
                        >
                            <FileText size={15} className="text-[#299E60] shrink-0" />
                            <span className={cn('truncate', docFile ? 'text-[#181725] font-bold' : 'text-[#AEAEAE]')}>
                                {docFile ? docFile.name : 'Choose file from computer…'}
                            </span>
                        </button>
                    </div>
                    <p className="text-[11px] text-[#AEAEAE]">Accepted: PDF, JPG, PNG, WebP · up to 10MB. Files are stored securely on our servers.</p>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleUploadDoc}
                            disabled={uploadingDoc || !docFile}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[#299E60] text-white text-[13px] font-bold rounded-[10px] disabled:opacity-50 hover:bg-[#22844f] transition-colors"
                        >
                            {uploadingDoc ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Upload Document
                        </button>
                        {docFile && !uploadingDoc && (
                            <button
                                type="button"
                                onClick={() => { setDocFile(null); if (docFileRef.current) docFileRef.current.value = ''; }}
                                className="flex items-center gap-1 text-[12px] font-bold text-[#AEAEAE] hover:text-[#EF4444] transition-colors"
                            >
                                <X size={13} /> Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
