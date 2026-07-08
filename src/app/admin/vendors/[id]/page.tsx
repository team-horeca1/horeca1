'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
    ChevronLeft,
    Star,
    MapPin,
    Mail,
    Phone,
    Package,
    ShoppingCart,
    MapPinned,
    CheckCircle2,
    Clock,
    XCircle,
    Loader2,
    ShieldCheck,
    ShieldX,
    User,
    CalendarClock,
    FileText,
    AlertCircle,
    Building2,
    Landmark,
    FileCheck2,
    Truck,
    Edit2,
    Globe,
    X,
    Eye,
    Image as ImageIcon,
    Copy,
    Check,
    Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatVendorTypeSelections,
  normalizeVendorTypeSelections,
} from '@/lib/constants/vendorProfile';
import { resolveVendorCode, formatVendorSku } from '@/lib/sku';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { AdminVendorPlatformFee } from '@/components/features/admin/AdminVendorPlatformFee';
import { AdminUserTeamPanel } from '@/components/features/admin/AdminUserTeamPanel';
import {
    AdminEntityDetailHeader,
    AdminEntityStatsRow,
    AdminImpersonateButton,
    AdminStatusBadge,
    AdminLoginCredentialsPanel,
    AdminEntityContactGrid,
    AdminEntityTabBar,
    AdminEntityTabPanel,
    AdminEntityTabContent,
    AdminEntityHeroCard,
} from '@/components/features/admin/entity';

interface VendorProduct {
    id: string;
    name: string;
    basePrice: number;
    isActive: boolean;
    imageUrl: string | null;
}

interface ServiceArea {
    id: string;
    pincode: string;
    isActive: boolean;
}

interface DeliverySlot {
    id: string;
    dayOfWeek: number | string;
    slotStart: string;
    slotEnd: string;
    cutoffTime: string;
    isActive: boolean;
}

interface VendorUser {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    gstNumber: string | null;
    isActive: boolean;
    createdAt: string;
    adminPassword?: string | null;
}

interface VendorDocument {
    id: string;
    type: string;
    fileUrl: string;
    fileName: string;
    status: string;
    adminNote: string | null;
    uploadedAt: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
    fssai: 'FSSAI License', gst: 'GST Certificate', pan: 'PAN Card',
    bank_proof: 'Bank Proof', other: 'Other',
};

// Documents are served from our droplet (authenticated) — render images inline
// and PDFs in a frame. Type is inferred from the file extension on either field.
function docIsImage(d: { fileUrl: string; fileName: string }): boolean {
    return /\.(jpe?g|png|webp|gif|svg)(\?|$)/i.test(d.fileUrl) || /\.(jpe?g|png|webp|gif|svg)$/i.test(d.fileName);
}
function docIsPdf(d: { fileUrl: string; fileName: string }): boolean {
    return /\.pdf(\?|$)/i.test(d.fileUrl) || /\.pdf$/i.test(d.fileName);
}

interface VendorData {
    id: string;
    businessName: string;
    slug: string;
    vendorCode: string | null;
    logoUrl: string | null;
    description: string | null;
    rating: number;
    isVerified: boolean;
    isActive: boolean;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    addressPincode: string | null;
    minOrderValue: number;
    deliveryFee: number;
    freeDeliveryAbove: number | null;
    // KYC / onboarding fields
    tradeName: string | null;
    vendorType: string | null;
    subType: string | null;
    vendorTypeSelections: unknown;
    gstNumber: string | null;
    panNumber: string | null;
    fssaiNumber: string | null;
    udyamNumber: string | null;
    cinNumber: string | null;
    deliveryCapability: string | null;
    authorizedPersonName: string | null;
    authorizedPersonPhone: string | null;
    authorizedPersonEmail: string | null;
    pickupAddressLine: string | null;
    pickupCity: string | null;
    pickupState: string | null;
    pickupPincode: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    bankIfsc: string | null;
    bankName: string | null;
    bankAccountType: string | null;
    platformFeePct: number | null;
    user: VendorUser;
    products: VendorProduct[];
    serviceAreas: ServiceArea[];
    deliverySlots: DeliverySlot[];
    _count: {
        orders: number;
        products: number;
        creditAccounts: number;
    };
}

function formatPrice(value: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(value);
}

function getInitials(name: string): string {
    return name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_MAP: Record<number, string> = {
    1: 'MONDAY',
    2: 'TUESDAY',
    3: 'WEDNESDAY',
    4: 'THURSDAY',
    5: 'FRIDAY',
    6: 'SATURDAY',
    7: 'SUNDAY',
};

function formatDayOfWeek(day: string | number): string {
    const dayStr = typeof day === 'number' ? DAY_MAP[day] || 'UNKNOWN' : day.toString();
    if (!dayStr) return 'Unknown';
    return dayStr.charAt(0).toUpperCase() + dayStr.slice(1).toLowerCase();
}

function formatTime(time: string): string {
    const [hours, minutes] = time.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
}

export default function VendorDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { has: can } = usePermissions();
    const canDeleteVendors = can('vendors.delete');
    const confirm = useConfirm();
    const vendorId = params.id as string;
    const isInitialEdit = searchParams.get('edit') === 'true';

    const [vendor, setVendor] = useState<VendorData | null>(null);
    const [ownerPassword, setOwnerPassword] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [globalDefaultFeePct, setGlobalDefaultFeePct] = useState(10);
    const [togglingVerification, setTogglingVerification] = useState(false);
    const [documents, setDocuments] = useState<VendorDocument[]>([]);
    const [updatingDoc, setUpdatingDoc] = useState<string | null>(null);
    const [reviewDoc, setReviewDoc] = useState<VendorDocument | null>(null);
    // Blob preview: the docs are served from an authenticated route, and the app
    // sets X-Frame-Options: DENY globally — so a PDF can't render in an <iframe>
    // pointed at that URL. We fetch the file as a blob (cookies sent same-origin)
    // and frame the object URL instead, which is exempt from X-Frame-Options.
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState(false);

    // Active tab
    const [activeTab, setActiveTab] = useState<'overview' | 'kyc_bank' | 'documents' | 'products' | 'delivery'>('overview');

    // Edit states
    const [isEditing, setIsEditing] = useState(false);
    const [savingEdits, setSavingEdits] = useState(false);

    const [businessName, setBusinessName] = useState('');
    const [vendorCode, setVendorCode] = useState('');
    const [description, setDescription] = useState('');
    const [address, setAddress] = useState('');
    const [city, setCity] = useState('');
    const [stateVal, setStateVal] = useState('');
    const [pincode, setPincode] = useState('');
    const [minOrderValue, setMinOrderValue] = useState('');
    const [deliveryFee, setDeliveryFee] = useState('');
    const [freeDeliveryAbove, setFreeDeliveryAbove] = useState('');
    const [isActive, setIsActive] = useState(true);

    // KYC fields
    const [tradeName, setTradeName] = useState('');
    const [vendorType, setVendorType] = useState('');
    const [gstNumber, setGstNumber] = useState('');
    const [panNumber, setPanNumber] = useState('');
    const [fssaiNumber, setFssaiNumber] = useState('');
    const [udyamNumber, setUdyamNumber] = useState('');
    const [cinNumber, setCinNumber] = useState('');
    const [deliveryCapability, setDeliveryCapability] = useState('');
    const [authorizedPersonName, setAuthorizedPersonName] = useState('');
    const [authorizedPersonPhone, setAuthorizedPersonPhone] = useState('');
    const [authorizedPersonEmail, setAuthorizedPersonEmail] = useState('');
    const [pickupAddressLine, setPickupAddressLine] = useState('');
    const [pickupCity, setPickupCity] = useState('');
    const [pickupState, setPickupState] = useState('');
    const [pickupPincode, setPickupPincode] = useState('');

    // Bank details
    const [bankAccountName, setBankAccountName] = useState('');
    const [bankAccountNumber, setBankAccountNumber] = useState('');
    const [bankIfsc, setBankIfsc] = useState('');
    const [bankName, setBankName] = useState('');
    const [bankAccountType, setBankAccountType] = useState('');

    // User details
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [userGstNumber, setUserGstNumber] = useState('');

    // Service Area and Delivery Slot states
    const [serviceAreas, setServiceAreas] = useState<ServiceArea[]>([]);
    const [deliverySlots, setDeliverySlots] = useState<DeliverySlot[]>([]);

    // Service Area forms
    const [newPincode, setNewPincode] = useState('');

    // Delivery Slot forms
    const [showSlotForm, setShowSlotForm] = useState(false);
    const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
    const [slotDay, setSlotDay] = useState(1);
    const [slotStart, setSlotStart] = useState('');
    const [slotEnd, setSlotEnd] = useState('');
    const [slotCutoff, setSlotCutoff] = useState('');

    const handleAddAreaLocal = () => {
        const pin = newPincode.trim();
        if (!pin) return;
        if (pin.length < 4) {
            toast.error('Invalid pincode');
            return;
        }
        if (serviceAreas.some(sa => sa.pincode === pin)) {
            toast.error('Pincode already exists in list');
            return;
        }
        setServiceAreas(prev => [...prev, { id: `temp-${Date.now()}`, pincode: pin, isActive: true }]);
        setNewPincode('');
    };

    const handleSaveSlotLocal = () => {
        if (!slotStart || !slotEnd || !slotCutoff) {
            toast.error('Please fill all time fields');
            return;
        }

        const slotData: DeliverySlot = {
            id: editingSlotId || `temp-${Date.now()}`,
            dayOfWeek: slotDay,
            slotStart,
            slotEnd,
            cutoffTime: slotCutoff,
            isActive: true,
        };

        if (editingSlotId) {
            setDeliverySlots(prev => prev.map(s => s.id === editingSlotId ? slotData : s));
        } else {
            const duplicate = deliverySlots.some(s => s.dayOfWeek === slotDay && s.slotStart === slotStart && s.id !== editingSlotId);
            if (duplicate) {
                toast.error('A slot for this day and start time already exists');
                return;
            }
            setDeliverySlots(prev => [...prev, slotData]);
        }
        resetSlotForm();
    };

    const resetSlotForm = () => {
        setShowSlotForm(false);
        setEditingSlotId(null);
        setSlotDay(1);
        setSlotStart('');
        setSlotEnd('');
        setSlotCutoff('');
    };

    useEffect(() => {
        if (isInitialEdit) {
            setIsEditing(true);
        }
    }, [isInitialEdit]);

    useEffect(() => {
        if (vendor) {
            setBusinessName(vendor.businessName || '');
            setVendorCode(vendor.vendorCode || '');
            setDescription(vendor.description || '');
            setAddress(vendor.addressLine || '');
            setCity(vendor.city || '');
            setStateVal(vendor.state || '');
            setPincode(vendor.addressPincode || '');
            setMinOrderValue(vendor.minOrderValue != null ? String(vendor.minOrderValue) : '0');
            setDeliveryFee(vendor.deliveryFee != null ? String(vendor.deliveryFee) : '0');
            setFreeDeliveryAbove(vendor.freeDeliveryAbove != null ? String(vendor.freeDeliveryAbove) : '');
            setIsActive(vendor.isActive);
            setTradeName(vendor.tradeName || '');
            setVendorType(vendor.vendorType || '');
            setGstNumber(vendor.gstNumber || '');
            setPanNumber(vendor.panNumber || '');
            setFssaiNumber(vendor.fssaiNumber || '');
            setUdyamNumber(vendor.udyamNumber || '');
            setCinNumber(vendor.cinNumber || '');
            setDeliveryCapability(vendor.deliveryCapability || '');
            setAuthorizedPersonName(vendor.authorizedPersonName || '');
            setAuthorizedPersonPhone(vendor.authorizedPersonPhone || '');
            setAuthorizedPersonEmail(vendor.authorizedPersonEmail || '');
            setPickupAddressLine(vendor.pickupAddressLine || '');
            setPickupCity(vendor.pickupCity || '');
            setPickupState(vendor.pickupState || '');
            setPickupPincode(vendor.pickupPincode || '');
            setBankAccountName(vendor.bankAccountName || '');
            setBankAccountNumber(vendor.bankAccountNumber || '');
            setBankIfsc(vendor.bankIfsc || '');
            setBankName(vendor.bankName || '');
            setBankAccountType(vendor.bankAccountType || '');
            setFullName(vendor.user.fullName || '');
            setEmail(vendor.user.email || '');
            setPhone(vendor.user.phone || '');
            setUserGstNumber(vendor.user.gstNumber || '');
            setServiceAreas(vendor.serviceAreas || []);
            setDeliverySlots(vendor.deliverySlots || []);
        }
    }, [vendor]);

    const handleSaveVendor = async () => {
        try {
            setSavingEdits(true);
            const res = await fetch(`/api/v1/admin/vendors/${vendorId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    businessName,
                    vendorCode: vendorCode.trim() || null,
                    description,
                    addressLine: address,
                    city,
                    state: stateVal,
                    addressPincode: pincode,
                    minOrderValue: parseFloat(minOrderValue) || 0,
                    deliveryFee: parseFloat(deliveryFee) || 0,
                    freeDeliveryAbove: freeDeliveryAbove ? parseFloat(freeDeliveryAbove) : null,
                    isActive,
                    tradeName,
                    vendorType,
                    gstNumber,
                    panNumber,
                    fssaiNumber,
                    udyamNumber,
                    cinNumber,
                    deliveryCapability,
                    authorizedPersonName,
                    authorizedPersonPhone,
                    authorizedPersonEmail,
                    pickupAddressLine,
                    pickupCity,
                    pickupState,
                    pickupPincode,
                    bankAccountName,
                    bankAccountNumber,
                    bankIfsc,
                    bankName,
                    bankAccountType,
                    fullName,
                    email,
                    phone,
                    userGstNumber,
                    serviceAreas,
                    deliverySlots,
                }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.message || 'Failed to update vendor');
            }
            toast.success('Vendor details updated successfully');
            setIsEditing(false);
            await fetchVendor();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to save changes');
        } finally {
            setSavingEdits(false);
        }
    };

    const fetchVendor = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch(`/api/v1/admin/vendors/${vendorId}`);
            if (!res.ok) {
                throw new Error(`Failed to fetch vendor (${res.status})`);
            }
            const json = await res.json();
            if (!json.success) {
                throw new Error(json.message || 'Failed to fetch vendor');
            }
            setVendor(json.data);
            setOwnerPassword(json.data.user?.adminPassword ?? null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }, [vendorId]);

    const deleteVendor = async () => {
        if (!vendor) return;
        const ok = await confirm({
            title: 'Delete permanently?',
            message: `${vendor.businessName} will be removed completely along with products, orders, team memberships and vendor data. This cannot be undone.`,
            confirmText: 'Delete permanently',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/v1/admin/vendors/${vendor.id}?force=true`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) {
                toast.error(json.error?.message || json.error || 'Failed to delete');
                return;
            }
            toast.success(`${vendor.businessName} deleted permanently`);
            router.push('/admin/vendors');
        } catch {
            toast.error('Failed to delete');
        }
    };

    useEffect(() => {
        if (vendorId) {
            fetchVendor();
            fetch(`/api/v1/admin/vendors/${vendorId}/documents`)
                .then(r => r.json())
                .then(json => { if (json.success) setDocuments(json.data ?? []); })
                .catch(() => {});
            fetch('/api/v1/admin/settings', { credentials: 'include' })
                .then((r) => (r.ok ? r.json() : null))
                .then((json) => {
                    const pct = json?.data?.defaultCommissionPct;
                    if (pct != null) setGlobalDefaultFeePct(Number(pct));
                })
                .catch(() => {});
        }
    }, [vendorId, fetchVendor]);

    // When the review popup opens, pull the file as a blob and frame the object
    // URL (bypasses the global X-Frame-Options: DENY). Cleaned up on close.
    useEffect(() => {
        if (!reviewDoc) { setPreviewUrl(null); setPreviewError(false); setPreviewLoading(false); return; }
        let cancelled = false;
        let objUrl: string | null = null;
        setPreviewUrl(null);
        setPreviewError(false);
        setPreviewLoading(true);
        fetch(reviewDoc.fileUrl, { credentials: 'same-origin' })
            .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.blob(); })
            .then(blob => {
                if (cancelled) return;
                objUrl = URL.createObjectURL(blob);
                setPreviewUrl(objUrl);
            })
            .catch(() => { if (!cancelled) setPreviewError(true); })
            .finally(() => { if (!cancelled) setPreviewLoading(false); });
        return () => { cancelled = true; if (objUrl) URL.revokeObjectURL(objUrl); };
    }, [reviewDoc]);

    const handleDocStatus = async (docId: string, status: 'verified' | 'rejected', adminNote?: string) => {
        setUpdatingDoc(docId);
        try {
            await fetch(`/api/v1/admin/vendors/${vendorId}/documents/${docId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status, adminNote }),
            });
            setDocuments(prev => prev.map(d => d.id === docId ? { ...d, status, adminNote: adminNote ?? d.adminNote } : d));
            // Keep the open review popup in sync with the new status.
            setReviewDoc(prev => prev && prev.id === docId ? { ...prev, status, adminNote: adminNote ?? prev.adminNote } : prev);
            toast.success(`Document marked as ${status}`);
        } catch {
            toast.error('Failed to update document');
        } finally {
            setUpdatingDoc(null);
        }
    };

    const handleToggleVerification = async () => {
        if (!vendor || togglingVerification) return;
        try {
            setTogglingVerification(true);
            const res = await fetch(`/api/v1/admin/vendors/${vendorId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isVerified: !vendor.isVerified }),
            });
            if (!res.ok) {
                throw new Error(`Failed to update vendor (${res.status})`);
            }
            const json = await res.json();
            if (json.success && json.data) {
                setVendor((prev) => (prev ? { ...prev, isVerified: json.data.isVerified } : prev));
                toast.success(json.data.isVerified ? 'Vendor verified successfully' : 'Vendor verification revoked');
            } else {
                await fetchVendor();
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to toggle verification');
        } finally {
            setTogglingVerification(false);
        }
    };

    // Small clickable icon shown beside a KYC field. If the vendor uploaded a
    // document of the matching type, clicking it opens the review popup scoped
    // to that document. Renders nothing when no such document exists.
    const renderDocReviewIcon = (type: string) => {
        const doc = documents.find(d => d.type === type);
        if (!doc) return null;
        return (
            <button
                type="button"
                onClick={() => setReviewDoc(doc)}
                title={`Review uploaded ${DOC_TYPE_LABELS[type] ?? 'document'}`}
                className={cn(
                    'shrink-0 w-[38px] h-[38px] rounded-[8px] border flex items-center justify-center transition-colors',
                    doc.status === 'verified' ? 'border-[#299E60]/30 bg-[#EEF8F1] text-[#299E60] hover:bg-[#D1FAE5]' :
                    doc.status === 'rejected' ? 'border-[#EF4444]/30 bg-[#FDF2F2] text-[#EF4444] hover:bg-[#FCE4E4]' :
                    'border-[#D1D5DB] bg-white text-[#6B7280] hover:bg-[#F9FAFB] hover:text-[#299E60]'
                )}
            >
                <ImageIcon size={16} />
            </button>
        );
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
                <Loader2 size={36} className="animate-spin text-[#299E60]" />
                <p className="text-[14px] font-bold text-[#7C7C7C]">Loading vendor details...</p>
            </div>
        );
    }

    if (error || !vendor) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
                <XCircle size={36} className="text-red-400" />
                <p className="text-[16px] font-bold text-[#7C7C7C]">{error || 'Vendor not found'}</p>
                <button
                    onClick={() => router.back()}
                    className="mt-2 text-[14px] font-bold text-[#299E60] hover:underline"
                >
                    Go Back
                </button>
            </div>
        );
    }

    const fullAddress = [vendor.addressLine, vendor.city, vendor.state, vendor.addressPincode]
        .filter(Boolean)
        .join(', ');

    const sortedSlots = [...deliverySlots].sort((a, b) => {
        const orderA = typeof a.dayOfWeek === 'number' ? a.dayOfWeek : DAY_ORDER.indexOf(a.dayOfWeek.toUpperCase()) + 1;
        const orderB = typeof b.dayOfWeek === 'number' ? b.dayOfWeek : DAY_ORDER.indexOf(b.dayOfWeek.toUpperCase()) + 1;
        return orderA - orderB;
    });

    const stats = [
        { label: 'Products Listed', value: vendor._count.products, icon: Package, color: '#299E60' },
        { label: 'Total Orders', value: vendor._count.orders, icon: ShoppingCart, color: '#F59E0B' },
        { label: 'Coverage Areas', value: serviceAreas.length, icon: MapPinned, color: '#3B82F6' },
        {
            label: 'KYC Status',
            value: vendor.isVerified ? 'VERIFIED' : 'PENDING',
            icon: vendor.isVerified ? ShieldCheck : ShieldX,
            color: vendor.isVerified ? '#299E60' : '#F59E0B',
        },
    ];

    return (
        <div className="space-y-6 pb-12 px-4 md:px-0">
            {/* Header Breadcrumbs Row */}
            <AdminEntityDetailHeader
                onBack={() => router.back()}
                breadcrumbs={[
                    { label: 'Sellers Registry', href: '/admin/vendors' },
                    { label: vendor.businessName },
                ]}
                actions={
                    <>
                        <AdminImpersonateButton
                            target="vendor"
                            entityId={vendor.id}
                            label="View as Vendor"
                        />
                        <button
                            type="button"
                            onClick={() => setIsEditing(!isEditing)}
                            className={cn(
                                "h-[38px] px-4 rounded-[10px] text-[12px] font-bold border active:scale-97 transition-all flex items-center gap-1.5 shadow-sm",
                                isEditing
                                    ? "bg-[#EF4444] border-[#EF4444] text-white hover:bg-[#DC2626]"
                                    : "bg-white border-[#D1D5DB] text-[#374151] hover:bg-[#F9FAFB]"
                            )}
                        >
                            <Edit2 size={13} />
                            {isEditing ? "Cancel Editing" : "Edit Details"}
                        </button>
                        {canDeleteVendors && (
                            <button
                                type="button"
                                onClick={() => void deleteVendor()}
                                className="h-[38px] px-4 rounded-[10px] text-[12px] font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 active:scale-97 transition-all flex items-center gap-1.5 shadow-sm"
                            >
                                <Trash2 size={13} />
                                Delete permanently
                            </button>
                        )}
                    </>
                }
            />

            {/* Editing Warning Banner */}
            {isEditing && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-[12px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                    <div className="flex items-center gap-2.5 text-[14px] font-bold text-[#B45309]">
                        <AlertCircle size={18} className="shrink-0" />
                        You have enabled Editing Mode. Make your updates in the tabs below and press Save.
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-4 py-1.5 bg-white border border-[#D1D5DB] text-[#374151] rounded-[8px] text-[12px] font-bold hover:bg-[#F9FAFB] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveVendor}
                            disabled={savingEdits}
                            className="px-4 py-1.5 bg-[#299E60] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#238a54] transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {savingEdits ? (
                                <>
                                    <Loader2 size={12} className="animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save Changes"
                            )}
                        </button>
                    </div>
                </div>
            )}

            <AdminEntityHeroCard
                avatar={
                    <div className="w-[140px] h-[140px] rounded-[16px] bg-[#F9FAFB] border border-[#E5E7EB] flex items-center justify-center p-4 shadow-inner">
                        {vendor.logoUrl ? (
                            <img
                                src={vendor.logoUrl}
                                alt={vendor.businessName}
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <span className="text-[42px] font-black text-[#299E60]">
                                {getInitials(vendor.businessName)}
                            </span>
                        )}
                    </div>
                }
                avatarFooter={
                    <AdminStatusBadge
                        variant={vendor.isActive ? 'active' : 'inactive'}
                        label={vendor.isActive ? 'Active' : 'Inactive'}
                    />
                }
                title={vendor.businessName}
                badges={
                    vendor.isVerified ? (
                        <AdminStatusBadge variant="verified" label="Verified Vendor" className="normal-case" />
                    ) : undefined
                }
                subtitle={
                    vendor.description ? (
                        <p className="text-[13px] text-[#6B7280] font-medium mt-2 leading-relaxed max-w-[600px] mx-auto lg:mx-0">
                            {vendor.description}
                        </p>
                    ) : undefined
                }
                meta={
                    <div className="flex items-center justify-center lg:justify-start gap-1.5 mt-3">
                        <div className="flex items-center">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                    key={star}
                                    size={14}
                                    fill={star <= Math.round(vendor.rating) ? '#F59E0B' : 'none'}
                                    className={star <= Math.round(vendor.rating) ? 'text-[#F59E0B]' : 'text-[#D1D5DB]'}
                                />
                            ))}
                        </div>
                        <span className="text-[12px] font-extrabold text-[#111827]">
                            {Number(vendor.rating).toFixed(1)} / 5.0 Rating
                        </span>
                    </div>
                }
                contact={
                    <AdminEntityContactGrid
                        accent="#299E60"
                        accentBg="#EEF8F1"
                        items={[
                            { icon: User, label: 'Authorized Owner', value: vendor.user.fullName },
                            { icon: Mail, label: 'Billing Email', value: vendor.user.email },
                            ...(vendor.user.phone ? [{ icon: Phone, label: 'Mobile Phone', value: vendor.user.phone }] : []),
                            ...(fullAddress ? [{ icon: MapPin, label: 'Registered Office', value: fullAddress }] : []),
                        ]}
                    />
                }
                sidebar={
                    <>
                        {vendor.user && (
                            <AdminLoginCredentialsPanel
                                user={vendor.user}
                                adminPassword={ownerPassword}
                                permission="vendors.edit"
                                accent="#299E60"
                                onPasswordUpdated={setOwnerPassword}
                            />
                        )}
                        <div className="flex flex-col gap-2.5">
                            <span className="text-[11px] font-bold text-[#9CA3AF] uppercase text-center lg:text-left">Verification Actions</span>
                            <button
                                onClick={handleToggleVerification}
                                disabled={togglingVerification}
                                className={cn(
                                    'w-full py-2.5 rounded-[10px] text-[12px] font-bold transition-all shadow-sm flex items-center justify-center gap-2 border',
                                    vendor.isVerified
                                        ? 'bg-amber-500 border-amber-500 text-white hover:bg-amber-600'
                                        : 'bg-[#299E60] border-[#299E60] text-white hover:bg-[#238a54]'
                                )}
                            >
                                {togglingVerification ? (
                                    <Loader2 size={13} className="animate-spin" />
                                ) : vendor.isVerified ? (
                                    <ShieldX size={13} />
                                ) : (
                                    <ShieldCheck size={13} />
                                )}
                                {togglingVerification
                                    ? 'Updating State...'
                                    : vendor.isVerified
                                      ? 'Revoke Verification'
                                      : 'Approve & Verify'}
                            </button>
                            {!vendor.isVerified && (
                                <button
                                    onClick={() => {
                                        const reason = window.prompt('Reason for rejection (will be sent to vendor):');
                                        if (!reason || !reason.trim()) return;
                                        fetch(`/api/v1/admin/vendors/${vendor.id}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ isActive: false, rejectionReason: reason.trim() }),
                                        }).then(r => { if (r.ok) window.location.reload(); });
                                    }}
                                    className="w-full py-2.5 rounded-[10px] text-[12px] font-bold transition-all shadow-sm flex items-center justify-center gap-2 bg-[#EF4444] border border-[#EF4444] text-white hover:bg-[#DC2626]"
                                >
                                    <XCircle size={13} />
                                    Reject Partner
                                </button>
                            )}
                        </div>
                    </>
                }
            />

            <AdminEntityStatsRow stats={stats} />

            <AdminVendorPlatformFee
                vendorId={vendor.id}
                platformFeePct={vendor.platformFeePct != null ? Number(vendor.platformFeePct) : null}
                globalDefaultPct={globalDefaultFeePct}
                onSaved={fetchVendor}
            />

            <AdminEntityTabPanel>
                <AdminEntityTabBar
                    activeTab={activeTab}
                    onTabChange={(id) => setActiveTab(id as typeof activeTab)}
                    tabs={[
                        { id: 'overview', label: 'Company Overview', icon: Building2 },
                        { id: 'kyc_bank', label: 'KYC & Settlement Bank', icon: Landmark },
                        {
                            id: 'documents',
                            label: 'Verification Records',
                            icon: FileCheck2,
                            badge: documents.length > 0 ? (
                                <span className="ml-1 bg-gray-200 text-gray-700 text-[10px] px-1.5 py-0.5 rounded-full font-black">
                                    {documents.length}
                                </span>
                            ) : undefined,
                        },
                        {
                            id: 'products',
                            label: 'Catalog Products',
                            icon: Package,
                            badge: vendor.products.length > 0 ? (
                                <span className="ml-1 bg-[#EEF8F1] text-[#299E60] text-[10px] px-1.5 py-0.5 rounded-full font-black border border-[#299E60]/10">
                                    {vendor.products.length}
                                </span>
                            ) : undefined,
                        },
                        { id: 'delivery', label: 'Slots & Coverage', icon: Truck },
                    ]}
                />
                <AdminEntityTabContent>
                    {/* TAB 1: COMPANY OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left Side: Profile Information */}
                                <div className="space-y-6">
                                    <div className="border-b border-[#F3F4F6] pb-2">
                                        <h3 className="text-[15px] font-black text-[#111827]">Business Profile</h3>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Vendor ID */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1.5">Vendor ID</label>
                                            <div className="flex items-center justify-between bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6] gap-2">
                                                <span className="text-[13px] font-bold font-mono text-[#374151] block truncate">{truncateId(vendor.id)}</span>
                                                <CopyButton text={vendor.id} label="Vendor ID" />
                                            </div>
                                        </div>

                                        {/* Vendor Code (SKU prefix) */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1.5">
                                                Vendor Code
                                            </label>
                                            {isEditing ? (
                                                <div className="space-y-1.5">
                                                    <input
                                                        type="text"
                                                        value={vendorCode}
                                                        onChange={(e) => setVendorCode(e.target.value.toUpperCase())}
                                                        placeholder="e.g. MAN"
                                                        maxLength={20}
                                                        className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] focus:ring-1 focus:ring-[#299E60]/20 font-mono font-bold uppercase tracking-wide"
                                                    />
                                                    <p className="text-[11px] text-[#6B7280] leading-relaxed">
                                                        Short code used as the SKU prefix for this vendor&apos;s products.
                                                        {vendorCode.trim() ? (
                                                            <> Example: {formatVendorSku(vendorCode.trim(), 'POS123')}</>
                                                        ) : (
                                                            <> Leave blank to use slug-derived code ({resolveVendorCode(vendor)}).</>
                                                        )}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">
                                                    <span className="text-[13px] font-bold font-mono text-[#374151] block">
                                                        {vendor.vendorCode || resolveVendorCode(vendor)}
                                                    </span>
                                                    {!vendor.vendorCode && (
                                                        <p className="text-[11px] text-[#9CA3AF] mt-1">
                                                            Derived from slug — assign a code before the vendor publishes products.
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Business Name */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1.5">Commercial Business Name</label>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={businessName}
                                                    onChange={(e) => setBusinessName(e.target.value)}
                                                    className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] focus:ring-1 focus:ring-[#299E60]/20 font-medium"
                                                />
                                            ) : (
                                                <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">{vendor.businessName}</span>
                                            )}
                                        </div>

                                        {/* Description */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1.5">Business Description</label>
                                            {isEditing ? (
                                                <textarea
                                                    value={description}
                                                    onChange={(e) => setDescription(e.target.value)}
                                                    rows={3}
                                                    className="w-full border border-[#D1D5DB] rounded-[8px] p-3 text-[13px] outline-none focus:border-[#299E60] focus:ring-1 focus:ring-[#299E60]/20 font-medium resize-none"
                                                />
                                            ) : (
                                                <span className="text-[13px] font-medium text-[#4B5563] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6] whitespace-pre-line leading-relaxed min-h-[70px]">
                                                    {vendor.description || 'No description provided.'}
                                                </span>
                                            )}
                                        </div>

                                        {/* Office Address */}
                                        <div>
                                            <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1.5">Registered Office Address</label>
                                            {isEditing ? (
                                                <div className="space-y-2 bg-[#FAFAFA] border border-[#EEEEEE] p-3 rounded-[8px]">
                                                    <input
                                                        type="text"
                                                        placeholder="Street Address Line"
                                                        value={address}
                                                        onChange={(e) => setAddress(e.target.value)}
                                                        className="w-full h-[36px] border border-[#D1D5DB] rounded-[6px] px-3 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                                    />
                                                    <div className="grid grid-cols-3 gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder="City"
                                                            value={city}
                                                            onChange={(e) => setCity(e.target.value)}
                                                            className="w-full h-[36px] border border-[#D1D5DB] rounded-[6px] px-2 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="State"
                                                            value={stateVal}
                                                            onChange={(e) => setStateVal(e.target.value)}
                                                            className="w-full h-[36px] border border-[#D1D5DB] rounded-[6px] px-2 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                                        />
                                                        <input
                                                            type="text"
                                                            placeholder="Pincode"
                                                            value={pincode}
                                                            onChange={(e) => setPincode(e.target.value)}
                                                            className="w-full h-[36px] border border-[#D1D5DB] rounded-[6px] px-2 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">{fullAddress || 'Not provided'}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Side: Commercial settings */}
                                <div className="space-y-6">
                                    <div className="border-b border-[#F3F4F6] pb-2">
                                        <h3 className="text-[15px] font-black text-[#111827]">Order & Commercial Settings</h3>
                                    </div>

                                    <div className="space-y-4 bg-[#F9FAFB] p-5 rounded-[12px] border border-[#E5E7EB]/50">
                                        {/* Min Order Value */}
                                        <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3.5">
                                            <span className="text-[12px] font-bold text-[#4B5563] uppercase">Minimum Order Value</span>
                                            {isEditing ? (
                                                <div className="relative">
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[12px] font-bold">₹</span>
                                                    <input
                                                        type="number"
                                                        value={minOrderValue}
                                                        onChange={(e) => setMinOrderValue(e.target.value)}
                                                        className="w-[120px] h-[34px] border border-[#D1D5DB] rounded-[8px] pl-6 pr-2.5 text-[13px] outline-none focus:border-[#299E60] font-bold text-right"
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-[13px] font-extrabold text-[#111827]">{formatPrice(vendor.minOrderValue)}</span>
                                            )}
                                        </div>

                                        {/* Delivery Fee */}
                                        <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3.5">
                                            <span className="text-[12px] font-bold text-[#4B5563] uppercase">Delivery Surcharge Fee</span>
                                            {isEditing ? (
                                                <div className="relative">
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[12px] font-bold">₹</span>
                                                    <input
                                                        type="number"
                                                        value={deliveryFee}
                                                        onChange={(e) => setDeliveryFee(e.target.value)}
                                                        className="w-[120px] h-[34px] border border-[#D1D5DB] rounded-[8px] pl-6 pr-2.5 text-[13px] outline-none focus:border-[#299E60] font-bold text-right"
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-[13px] font-extrabold text-[#111827]">
                                                    {vendor.deliveryFee === 0 ? 'Free' : formatPrice(vendor.deliveryFee)}
                                                </span>
                                            )}
                                        </div>

                                        {/* Free Delivery Threshold */}
                                        <div className="flex items-center justify-between border-b border-[#EEEEEE] pb-3.5">
                                            <span className="text-[12px] font-bold text-[#4B5563] uppercase">Free Delivery Above</span>
                                            {isEditing ? (
                                                <div className="relative">
                                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-[12px] font-bold">₹</span>
                                                    <input
                                                        type="number"
                                                        placeholder="optional"
                                                        value={freeDeliveryAbove}
                                                        onChange={(e) => setFreeDeliveryAbove(e.target.value)}
                                                        className="w-[120px] h-[34px] border border-[#D1D5DB] rounded-[8px] pl-6 pr-2.5 text-[13px] outline-none focus:border-[#299E60] font-bold text-right"
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-[13px] font-extrabold text-[#111827]">
                                                    {vendor.freeDeliveryAbove ? formatPrice(vendor.freeDeliveryAbove) : 'N/A'}
                                                </span>
                                            )}
                                        </div>

                                        {/* Onboarding Time */}
                                        <div className="flex items-center justify-between pt-1">
                                            <span className="text-[12px] font-bold text-[#4B5563] uppercase">Partner Registration</span>
                                            <span className="text-[13px] font-extrabold text-[#374151]">
                                                {new Date(vendor.user.createdAt).toLocaleDateString('en-IN', {
                                                    day: '2-digit',
                                                    month: 'long',
                                                    year: 'numeric',
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Owner Profile Panel */}
                            <div className="border-t border-[#F3F4F6] pt-6">
                                <h3 className="text-[15px] font-black text-[#111827] mb-4">Onboarding Account User</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Owner User ID</label>
                                        <div className="flex items-center justify-between bg-[#F9FAFB] h-[36px] px-3 rounded-[8px] border border-[#F3F4F6] gap-2">
                                            <span className="text-[13px] font-bold font-mono text-[#374151] block truncate">{truncateId(vendor.user.id)}</span>
                                            <CopyButton text={vendor.user.id} label="Owner User ID" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Full Legal Name</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">{vendor.user.fullName}</span>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Account Email Address</label>
                                        {isEditing ? (
                                            <input
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6] truncate">{vendor.user.email}</span>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Mobile Phone Number</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={phone}
                                                onChange={(e) => setPhone(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">{vendor.user.phone || 'Not provided'}</span>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">User GSTIN (Registered)</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={userGstNumber}
                                                onChange={(e) => setUserGstNumber(e.target.value.toUpperCase())}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] font-mono uppercase"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6] font-mono uppercase">{vendor.user.gstNumber || 'Not provided'}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: KYC & BANK DETAILS */}
                    {activeTab === 'kyc_bank' && (
                        <div className="space-y-8">
                            {/* Corporate Registry */}
                            <div>
                                <div className="border-b border-[#F3F4F6] pb-2 mb-4">
                                    <h3 className="text-[15px] font-black text-[#111827]">Compliance Identifiers</h3>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Trade/Entity Name</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={tradeName}
                                                onChange={(e) => setTradeName(e.target.value)}
                                                className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">{vendor.tradeName || 'Not provided'}</span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Vendor Entity Type</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={vendorType}
                                                onChange={(e) => setVendorType(e.target.value)}
                                                className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">
                                              {formatVendorTypeSelections(normalizeVendorTypeSelections(vendor.vendorTypeSelections))
                                                || vendor.vendorType
                                                || 'Not provided'}
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Corporate GSTIN</label>
                                        <div className="flex items-center gap-2">
                                            {renderDocReviewIcon('gst')}
                                            <div className="flex-1 min-w-0">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={gstNumber}
                                                        onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                                                        className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] font-mono"
                                                    />
                                                ) : (
                                                    <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6] font-mono uppercase">{vendor.gstNumber || 'Not provided'}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Corporate PAN</label>
                                        <div className="flex items-center gap-2">
                                            {renderDocReviewIcon('pan')}
                                            <div className="flex-1 min-w-0">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={panNumber}
                                                        onChange={(e) => setPanNumber(e.target.value.toUpperCase())}
                                                        className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] font-mono"
                                                    />
                                                ) : (
                                                    <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6] font-mono uppercase">{vendor.panNumber || 'Not provided'}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">FSSAI License No.</label>
                                        <div className="flex items-center gap-2">
                                            {renderDocReviewIcon('fssai')}
                                            <div className="flex-1 min-w-0">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        value={fssaiNumber}
                                                        onChange={(e) => setFssaiNumber(e.target.value)}
                                                        className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                                    />
                                                ) : (
                                                    <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">{vendor.fssaiNumber || 'Not provided'}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">MSME Udyam Registration No.</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={udyamNumber}
                                                onChange={(e) => setUdyamNumber(e.target.value)}
                                                className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">{vendor.udyamNumber || 'Not provided'}</span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">CIN (Corporate Identity Number)</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={cinNumber}
                                                onChange={(e) => setCinNumber(e.target.value.toUpperCase())}
                                                className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] font-mono"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6] font-mono uppercase">{vendor.cinNumber || 'Not provided'}</span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Delivery Capacity (Vehicles)</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={deliveryCapability}
                                                onChange={(e) => setDeliveryCapability(e.target.value)}
                                                className="w-full h-[38px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">{vendor.deliveryCapability || 'Not provided'}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Authorized Signatory Contacts */}
                            <div className="border-t border-[#F3F4F6] pt-6">
                                <div className="pb-2 mb-4">
                                    <h3 className="text-[15px] font-black text-[#111827]">Authorized Signatory / Contacts</h3>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Authorized Person Name</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={authorizedPersonName}
                                                onChange={(e) => setAuthorizedPersonName(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6]">{vendor.authorizedPersonName || 'Not provided'}</span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Authorized Person Phone</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={authorizedPersonPhone}
                                                onChange={(e) => setAuthorizedPersonPhone(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6] font-mono">{vendor.authorizedPersonPhone || 'Not provided'}</span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Authorized Person Email</label>
                                        {isEditing ? (
                                            <input
                                                type="email"
                                                value={authorizedPersonEmail}
                                                onChange={(e) => setAuthorizedPersonEmail(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60]"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-2.5 rounded-lg border border-[#F3F4F6] truncate">{vendor.authorizedPersonEmail || 'Not provided'}</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Logistics / Pickup Address */}
                            <div className="border-t border-[#F3F4F6] pt-6">
                                <div className="pb-2 mb-4">
                                    <h3 className="text-[15px] font-black text-[#111827]">Logistics / Pickup Address</h3>
                                </div>

                                <div className="max-w-[600px]">
                                    {isEditing ? (
                                        <div className="space-y-2 bg-[#FAFAFA] border border-[#EEEEEE] p-3 rounded-[8px]">
                                            <input
                                                type="text"
                                                placeholder="Street Address Line"
                                                value={pickupAddressLine}
                                                onChange={(e) => setPickupAddressLine(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[6px] px-3 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                            />
                                            <div className="grid grid-cols-3 gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="City"
                                                    value={pickupCity}
                                                    onChange={(e) => setPickupCity(e.target.value)}
                                                    className="w-full h-[36px] border border-[#D1D5DB] rounded-[6px] px-2 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="State"
                                                    value={pickupState}
                                                    onChange={(e) => setPickupState(e.target.value)}
                                                    className="w-full h-[36px] border border-[#D1D5DB] rounded-[6px] px-2 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Pincode"
                                                    value={pickupPincode}
                                                    onChange={(e) => setPickupPincode(e.target.value)}
                                                    className="w-full h-[36px] border border-[#D1D5DB] rounded-[6px] px-2 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <span className="text-[13px] font-bold text-[#374151] block bg-[#F9FAFB] p-3 rounded-lg border border-[#F3F4F6] leading-relaxed">
                                            {[vendor.pickupAddressLine, vendor.pickupCity, vendor.pickupState, vendor.pickupPincode].filter(Boolean).join(', ') || 'Not configured'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Settlement Bank details */}
                            <div className="border-t border-[#F3F4F6] pt-6 bg-[#FAFAFA] -mx-6 md:-mx-8 px-6 md:px-8 py-6 rounded-b-[16px]">
                                <div className="pb-2 mb-4 flex items-center justify-between gap-3">
                                    <h3 className="text-[15px] font-black text-[#111827]">Settlement Bank Details</h3>
                                    {renderDocReviewIcon('bank_proof')}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Beneficiary Account Name</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={bankAccountName}
                                                onChange={(e) => setBankAccountName(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-white p-2.5 rounded-lg border border-[#E5E7EB]">{vendor.bankAccountName || 'Not configured'}</span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Account Number</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={bankAccountNumber}
                                                onChange={(e) => setBankAccountNumber(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-white p-2.5 rounded-lg border border-[#E5E7EB] font-mono">{vendor.bankAccountNumber || 'Not configured'}</span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">IFSC Code (Indian Financial System)</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={bankIfsc}
                                                onChange={(e) => setBankIfsc(e.target.value.toUpperCase())}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] bg-white font-mono uppercase"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-white p-2.5 rounded-lg border border-[#E5E7EB] font-mono uppercase">{vendor.bankIfsc || 'Not configured'}</span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Bank Name</label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={bankName}
                                                onChange={(e) => setBankName(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] bg-white"
                                            />
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-white p-2.5 rounded-lg border border-[#E5E7EB]">{vendor.bankName || 'Not configured'}</span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-[#9CA3AF] uppercase tracking-wider mb-1">Account Category/Type</label>
                                        {isEditing ? (
                                            <select
                                                value={bankAccountType}
                                                onChange={(e) => setBankAccountType(e.target.value)}
                                                className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-3 text-[13px] outline-none focus:border-[#299E60] bg-white font-medium"
                                            >
                                                <option value="">Select account type...</option>
                                                <option value="current">Current Account</option>
                                                <option value="savings">Savings Account</option>
                                            </select>
                                        ) : (
                                            <span className="text-[13px] font-bold text-[#374151] block bg-white p-2.5 rounded-lg border border-[#E5E7EB] uppercase">{vendor.bankAccountType || 'Not configured'}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: VERIFICATION COMPLIANCE DOCUMENTS */}
                    {activeTab === 'documents' && (
                        <div className="space-y-6">
                            <div className="border-b border-[#F3F4F6] pb-2 mb-4 flex items-center justify-between">
                                <h3 className="text-[15px] font-black text-[#111827]">Compliance Documentation Checklist</h3>
                            </div>

                            {documents.length === 0 ? (
                                <div className="p-12 text-center bg-[#F9FAFB] rounded-[16px] border border-dashed border-[#D1D5DB]">
                                    <FileText size={40} className="text-[#AEAEAE] mx-auto mb-3" />
                                    <h4 className="text-[14px] font-bold text-[#374151]">No Documents Uploaded</h4>
                                    <p className="text-[12px] text-[#9CA3AF] mt-1">The vendor has not uploaded any verification records for onboarding.</p>
                                </div>
                            ) : (
                                <div className="border border-[#EEEEEE] rounded-[12px] overflow-hidden bg-white divide-y divide-[#F3F4F6]">
                                    {documents.map((doc, idx) => (
                                        <div key={doc.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#F9FAFB]/50 transition-colors">
                                            <div className="flex items-start gap-4">
                                                {/* Thumbnail — image preview or file glyph; click to review in popup */}
                                                <button
                                                    type="button"
                                                    onClick={() => setReviewDoc(doc)}
                                                    title="Click to review"
                                                    className="w-[44px] h-[44px] rounded-[10px] bg-[#EEF2F6] flex items-center justify-center text-[#4B5563] shrink-0 border border-[#E5E7EB] overflow-hidden hover:ring-2 hover:ring-[#299E60]/40 transition-all"
                                                >
                                                    {docIsImage(doc) ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={doc.fileUrl} alt={doc.fileName} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <FileText size={18} />
                                                    )}
                                                </button>

                                                <div className="min-w-0">
                                                    <span className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-wider block">Record #{idx + 1}</span>
                                                    <h4 className="text-[14px] font-bold text-[#111827] mt-0.5">{DOC_TYPE_LABELS[doc.type] ?? doc.type}</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setReviewDoc(doc)}
                                                            className="text-[12px] text-[#299E60] font-bold hover:underline inline-flex items-center gap-1 shrink-0"
                                                        >
                                                            <Eye size={12} />
                                                            <span>Review</span>
                                                        </button>
                                                        <span className="text-gray-300">|</span>
                                                        <span className="text-[11px] text-[#9CA3AF] font-medium">Uploaded: {new Date(doc.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                    </div>
                                                    {doc.adminNote && (
                                                        <div className="mt-2.5 bg-[#FFF8EB] border border-[#FDE68A]/60 px-3 py-1.5 rounded-lg text-[11px] text-[#B45309] font-medium leading-relaxed max-w-[500px]">
                                                            <strong className="font-extrabold uppercase text-[9px] mr-1 block sm:inline">Admin Auditor Note:</strong>
                                                            {doc.adminNote}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Doc statuses and actions */}
                                            <div className="flex items-center gap-3 self-end md:self-auto border-t md:border-t-0 pt-3 md:pt-0 border-[#F3F4F6] w-full md:w-auto justify-end">
                                                <span className={cn(
                                                    'text-[10px] font-black px-2.5 py-1 rounded-full uppercase border tracking-wider',
                                                    doc.status === 'verified' ? 'bg-[#EEF8F1] border-[#299E60]/15 text-[#299E60]' :
                                                    doc.status === 'rejected' ? 'bg-[#FDF2F2] border-[#EF4444]/15 text-[#EF4444]' :
                                                    'bg-[#FFF8EB] border-[#D97706]/15 text-[#D97706]'
                                                )}>
                                                    Status: {doc.status}
                                                </span>

                                                <div className="flex items-center gap-2">
                                                    {doc.status !== 'verified' && (
                                                        <button 
                                                            onClick={() => handleDocStatus(doc.id, 'verified')}
                                                            disabled={updatingDoc === doc.id}
                                                            className="h-[32px] px-3 bg-[#299E60] hover:bg-[#238a54] text-white text-[11px] font-bold rounded-[8px] disabled:opacity-50 flex items-center gap-1 shadow-sm transition-colors"
                                                        >
                                                            {updatingDoc === doc.id ? (
                                                                <Loader2 size={11} className="animate-spin" />
                                                            ) : (
                                                                <CheckCircle2 size={12} />
                                                            )}
                                                            Verify
                                                        </button>
                                                    )}
                                                    {doc.status !== 'rejected' && (
                                                        <button 
                                                            onClick={() => {
                                                                const note = window.prompt('Provide rejection reason (will be visible to vendor):');
                                                                if (note === null) return;
                                                                handleDocStatus(doc.id, 'rejected', note.trim() || undefined);
                                                            }}
                                                            disabled={updatingDoc === doc.id}
                                                            className="h-[32px] px-3 bg-white border border-[#E5E7EB] hover:bg-[#FDF2F2] hover:text-[#EF4444] text-[#4B5563] text-[11px] font-bold rounded-[8px] disabled:opacity-50 flex items-center gap-1 transition-colors"
                                                        >
                                                            {updatingDoc === doc.id ? (
                                                                <Loader2 size={11} className="animate-spin" />
                                                            ) : (
                                                                <XCircle size={12} />
                                                            )}
                                                            Reject
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 4: VENDOR PRODUCTS CATALOG */}
                    {activeTab === 'products' && (
                        <div className="space-y-6">
                            <div className="border-b border-[#F3F4F6] pb-2 mb-4 flex items-center justify-between">
                                <h3 className="text-[15px] font-black text-[#111827]">Products Inventory List</h3>
                            </div>

                            {vendor.products.length === 0 ? (
                                <div className="p-12 text-center bg-[#F9FAFB] rounded-[16px] border border-dashed border-[#D1D5DB]">
                                    <Package size={40} className="text-[#AEAEAE] mx-auto mb-3" />
                                    <h4 className="text-[14px] font-bold text-[#374151]">No Registered Products</h4>
                                    <p className="text-[12px] text-[#9CA3AF] mt-1">This seller partner has not added any products to the marketplace catalogue yet.</p>
                                </div>
                            ) : (
                                <div className="w-full overflow-x-auto rounded-[12px] border border-[#EEEEEE] bg-white">
                                    <table className="w-full border-collapse text-left text-[13px] min-w-[700px]">
                                        <thead>
                                            <tr className="bg-[#FAFAFA] border-b border-[#EEEEEE] text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                                                <th className="px-5 py-3.5 font-bold w-[60px] text-center">#</th>
                                                <th className="px-5 py-3.5 font-bold min-w-[280px]">Product Information</th>
                                                <th className="px-5 py-3.5 font-bold">Base Price (INR)</th>
                                                <th className="px-5 py-3.5 font-bold w-[120px]">Marketplace Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#F3F4F6]">
                                            {vendor.products.map((product, i) => (
                                                <tr key={product.id} className="hover:bg-[#F9FAFB]/50 transition-colors">
                                                    <td className="px-5 py-3 text-center text-[12px] font-bold text-[#9CA3AF]">
                                                        {i + 1}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-[42px] h-[42px] rounded-[8px] bg-[#F3F4F6] overflow-hidden shrink-0 border border-[#E5E7EB] flex items-center justify-center">
                                                                {product.imageUrl ? (
                                                                    <img
                                                                        src={product.imageUrl}
                                                                        alt={product.name}
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <Package size={16} className="text-[#9CA3AF]" />
                                                                )}
                                                            </div>
                                                            <span className="text-[13px] font-bold text-[#111827] truncate block max-w-[350px]">
                                                                {product.name}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3 font-bold text-[#111827]">
                                                        {formatPrice(product.basePrice)}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        {product.isActive ? (
                                                            <span className="inline-flex items-center gap-1 bg-[#EEF8F1] text-[#299E60] text-[10px] font-black px-2 py-0.5 rounded-full border border-[#D1FAE5] uppercase tracking-wide">
                                                                Active
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 bg-[#FDF2F2] text-[#EF4444] text-[10px] font-black px-2 py-0.5 rounded-full border border-[#FEE2E2] uppercase tracking-wide">
                                                                Inactive
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 5: DELIVERY SLOTS & COVERAGE AREAS */}
                    {activeTab === 'delivery' && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                {/* Left column: Slots */}
                                <div className="space-y-4">
                                    <div className="border-b border-[#F3F4F6] pb-2 mb-2 flex items-center justify-between">
                                        <h3 className="text-[15px] font-black text-[#111827] flex items-center gap-1.5">
                                            <CalendarClock size={16} className="text-[#299E60]" />
                                            Active Schedule Delivery Slots
                                        </h3>
                                        {isEditing && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    resetSlotForm();
                                                    setShowSlotForm(true);
                                                }}
                                                className="h-[30px] px-3 bg-[#299E60] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#238a54] transition-colors flex items-center gap-1"
                                            >
                                                + Add Slot
                                            </button>
                                        )}
                                    </div>

                                    {isEditing && showSlotForm && (
                                        <div className="p-4 border border-[#EEEEEE] bg-[#FAFAFA] rounded-[12px] space-y-4">
                                            <h4 className="text-[13px] font-bold text-[#111827]">
                                                {editingSlotId ? 'Edit Delivery Slot' : 'New Delivery Slot'}
                                            </h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[11px] font-bold text-[#6B7280] mb-1">Day of Week</label>
                                                    <select
                                                        value={slotDay}
                                                        onChange={(e) => setSlotDay(Number(e.target.value))}
                                                        className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-2 text-[13px] outline-none bg-white font-medium"
                                                    >
                                                        <option value={1}>Monday</option>
                                                        <option value={2}>Tuesday</option>
                                                        <option value={3}>Wednesday</option>
                                                        <option value={4}>Thursday</option>
                                                        <option value={5}>Friday</option>
                                                        <option value={6}>Saturday</option>
                                                        <option value={7}>Sunday</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-[#6B7280] mb-1">Start Time</label>
                                                    <input
                                                        type="time"
                                                        value={slotStart}
                                                        onChange={(e) => setSlotStart(e.target.value)}
                                                        className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-2 text-[13px] outline-none font-medium"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-[#6B7280] mb-1">End Time</label>
                                                    <input
                                                        type="time"
                                                        value={slotEnd}
                                                        onChange={(e) => setSlotEnd(e.target.value)}
                                                        className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-2 text-[13px] outline-none font-medium"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-[#6B7280] mb-1">Cutoff Time</label>
                                                    <input
                                                        type="time"
                                                        value={slotCutoff}
                                                        onChange={(e) => setSlotCutoff(e.target.value)}
                                                        className="w-full h-[36px] border border-[#D1D5DB] rounded-[8px] px-2 text-[13px] outline-none font-medium"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 pt-2">
                                                <button
                                                    type="button"
                                                    onClick={handleSaveSlotLocal}
                                                    className="h-[32px] px-4 bg-[#299E60] text-white rounded-[8px] text-[12px] font-bold hover:bg-[#238a54]"
                                                >
                                                    Save Slot
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={resetSlotForm}
                                                    className="h-[32px] px-4 bg-gray-100 text-[#6B7280] rounded-[8px] text-[12px] font-bold hover:bg-gray-200"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {sortedSlots.length === 0 ? (
                                        <div className="p-8 text-center bg-[#F9FAFB] rounded-[12px] border border-dashed border-[#D1D5DB]">
                                            <CalendarClock size={32} className="text-[#AEAEAE] mx-auto mb-2" />
                                            <h4 className="text-[13px] font-bold text-[#374151]">No slots configured</h4>
                                        </div>
                                    ) : (
                                        <div className="border border-[#EEEEEE] rounded-[12px] overflow-hidden bg-white divide-y divide-[#F3F4F6]">
                                            {sortedSlots.map((slot) => (
                                                <div
                                                    key={slot.id}
                                                    className="px-5 py-3.5 flex items-center justify-between hover:bg-[#F9FAFB]/50 transition-colors"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-[32px] h-[32px] rounded-[8px] bg-[#EEF8F1] flex items-center justify-center text-[#299E60] shrink-0 border border-[#D1FAE5]">
                                                            <Clock size={14} />
                                                        </div>
                                                        <div>
                                                            <p className="text-[13px] font-bold text-[#111827]">
                                                                {formatDayOfWeek(slot.dayOfWeek)}
                                                            </p>
                                                            <p className="text-[11px] text-[#6B7280] font-medium mt-0.5">
                                                                Hours: {formatTime(slot.slotStart)} - {formatTime(slot.slotEnd)}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-[11px] font-bold text-[#6B7280]">
                                                            Cutoff: {formatTime(slot.cutoffTime)}
                                                        </span>
                                                        <span className={cn(
                                                            "text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider",
                                                            slot.isActive 
                                                                ? "bg-[#EEF8F1] border-[#299E60]/10 text-[#299E60]" 
                                                                : "bg-[#FDF2F2] border-[#EF4444]/10 text-[#EF4444]"
                                                        )}>
                                                            {slot.isActive ? 'Active' : 'Inactive'}
                                                        </span>
                                                        {isEditing && (
                                                            <div className="flex items-center gap-1 ml-1.5 border-l border-[#EEEEEE] pl-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingSlotId(slot.id);
                                                                        setSlotDay(typeof slot.dayOfWeek === 'number' ? slot.dayOfWeek : DAY_ORDER.indexOf(slot.dayOfWeek.toUpperCase()) + 1);
                                                                        setSlotStart(slot.slotStart);
                                                                        setSlotEnd(slot.slotEnd);
                                                                        setSlotCutoff(slot.cutoffTime);
                                                                        setShowSlotForm(true);
                                                                    }}
                                                                    className="p-1 text-[#3B82F6] hover:bg-blue-50 rounded"
                                                                    title="Edit Slot"
                                                                >
                                                                    <Edit2 size={13} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setDeliverySlots(prev => prev.map(s => s.id === slot.id ? { ...s, isActive: !s.isActive } : s));
                                                                    }}
                                                                    className="px-1.5 py-0.5 text-[9px] font-bold text-gray-500 hover:bg-gray-100 rounded border border-gray-200"
                                                                >
                                                                    {slot.isActive ? 'Deactivate' : 'Activate'}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setDeliverySlots(prev => prev.filter(s => s.id !== slot.id));
                                                                    }}
                                                                    className="p-1 text-[#EF4444] hover:bg-red-50 rounded"
                                                                    title="Delete Slot"
                                                                >
                                                                    <XCircle size={13} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Right column: Coverage */}
                                <div className="space-y-4">
                                    <div className="border-b border-[#F3F4F6] pb-2 mb-2 flex items-center justify-between">
                                        <h3 className="text-[15px] font-black text-[#111827] flex items-center gap-1.5">
                                            <MapPinned size={16} className="text-[#3B82F6]" />
                                            Commercial Dispatch Service Areas
                                        </h3>
                                        {isEditing && (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Pincode"
                                                    value={newPincode}
                                                    onChange={(e) => setNewPincode(e.target.value.replace(/\D/g, ''))}
                                                    maxLength={10}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            handleAddAreaLocal();
                                                        }
                                                    }}
                                                    className="w-[100px] h-[30px] border border-[#D1D5DB] rounded-[6px] px-2 text-[12px] outline-none focus:border-[#3B82F6] font-medium"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleAddAreaLocal}
                                                    className="h-[30px] px-3 bg-[#3B82F6] text-white rounded-[6px] text-[12px] font-bold hover:bg-[#2563EB]"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {serviceAreas.length === 0 ? (
                                        <div className="p-8 text-center bg-[#F9FAFB] rounded-[12px] border border-dashed border-[#D1D5DB]">
                                            <MapPinned size={32} className="text-[#AEAEAE] mx-auto mb-2" />
                                            <h4 className="text-[13px] font-bold text-[#374151]">No coverage pincodes</h4>
                                        </div>
                                    ) : (
                                        <div className="bg-[#FAFAFA] p-5 rounded-[12px] border border-[#E5E7EB]/50">
                                            <p className="text-[11px] font-bold text-[#9CA3AF] uppercase mb-3.5">Eligible Delivery Pincodes</p>
                                            <div className="flex flex-wrap gap-2.5">
                                                {serviceAreas.map((area) => (
                                                    <div
                                                        key={area.id}
                                                        className={cn(
                                                            'flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] border text-[12px] font-bold shadow-sm transition-all',
                                                            area.isActive
                                                                ? 'bg-[#EFF6FF] border-[#3B82F6]/20 text-[#2563EB]'
                                                                : 'bg-[#F3F4F6] border-[#E5E7EB] text-[#6B7280]'
                                                        )}
                                                    >
                                                        <MapPin size={12} className="opacity-75" />
                                                        <span>{area.pincode}</span>
                                                        {!area.isActive && (
                                                            <span className="text-[9px] uppercase font-black text-[#9CA3AF]">
                                                                (disabled)
                                                            </span>
                                                        )}
                                                        {isEditing && (
                                                            <div className="flex items-center gap-1 border-l border-current pl-1.5 ml-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setServiceAreas(prev => prev.map(sa => sa.id === area.id ? { ...sa, isActive: !sa.isActive } : sa));
                                                                    }}
                                                                    className="hover:scale-110 transition-transform text-[10px]"
                                                                    title={area.isActive ? "Deactivate" : "Activate"}
                                                                >
                                                                    ●
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setServiceAreas(prev => prev.filter(sa => sa.id !== area.id));
                                                                    }}
                                                                    className="hover:scale-110 transition-transform font-bold text-[#EF4444]"
                                                                    title="Delete Area"
                                                                >
                                                                    ×
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </AdminEntityTabContent>

                {/* Save edits bottom actions toolbar */}
                {isEditing && (
                    <div className="p-6 bg-[#FAFAFA] border-t border-[#EEEEEE] flex justify-end gap-3 rounded-b-[16px]">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-5 py-2 bg-white border border-[#D1D5DB] text-[#374151] rounded-[10px] text-[13px] font-bold hover:bg-[#F9FAFB] active:scale-97 transition-colors shadow-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveVendor}
                            disabled={savingEdits}
                            className="px-6 py-2 bg-[#299E60] hover:bg-[#238a54] text-white rounded-[10px] text-[13px] font-bold active:scale-97 transition-colors flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-[#299E60]/10"
                        >
                            {savingEdits ? (
                                <>
                                    <Loader2 size={13} className="animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save Changes"
                            )}
                        </button>
                    </div>
                )}
            </AdminEntityTabPanel>

            <AdminUserTeamPanel
                teamEndpoint={`/api/v1/admin/vendors/${vendorId}/team`}
                editPermission="vendors.edit"
                accent="#299E60"
            />

            {/* ── Document Review Popup ──────────────────────────────────── */}
            {reviewDoc && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={() => setReviewDoc(null)}
                >
                    <div
                        className="bg-white rounded-[16px] shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEEEEE]">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-[8px] bg-[#EEF8F1] flex items-center justify-center text-[#299E60] shrink-0">
                                    <FileCheck2 size={16} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-[14px] font-black text-[#111827] truncate">{DOC_TYPE_LABELS[reviewDoc.type] ?? reviewDoc.type}</h3>
                                    <p className="text-[11px] text-[#9CA3AF] truncate">{reviewDoc.fileName}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={cn(
                                    'text-[10px] font-black px-2.5 py-1 rounded-full uppercase border tracking-wider',
                                    reviewDoc.status === 'verified' ? 'bg-[#EEF8F1] border-[#299E60]/15 text-[#299E60]' :
                                    reviewDoc.status === 'rejected' ? 'bg-[#FDF2F2] border-[#EF4444]/15 text-[#EF4444]' :
                                    'bg-[#FFF8EB] border-[#D97706]/15 text-[#D97706]'
                                )}>{reviewDoc.status}</span>
                                <a
                                    href={reviewDoc.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open in new tab"
                                    className="w-8 h-8 rounded-[8px] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:bg-[#F9FAFB]"
                                >
                                    <Eye size={14} />
                                </a>
                                <button
                                    onClick={() => setReviewDoc(null)}
                                    className="w-8 h-8 rounded-[8px] border border-[#E5E7EB] flex items-center justify-center text-[#6B7280] hover:bg-[#FDF2F2] hover:text-[#EF4444]"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Preview body — rendered from a blob object URL (see effect above) */}
                        <div className="flex-1 overflow-auto bg-[#F3F4F6] flex items-center justify-center p-4 min-h-[300px]">
                            {previewLoading ? (
                                <div className="flex flex-col items-center gap-2 text-[#9CA3AF] py-12">
                                    <Loader2 size={28} className="animate-spin text-[#299E60]" />
                                    <p className="text-[12px] font-bold">Loading document…</p>
                                </div>
                            ) : previewError || !previewUrl ? (
                                <div className="text-center py-12">
                                    <FileText size={40} className="text-[#9CA3AF] mx-auto mb-3" />
                                    <p className="text-[13px] text-[#6B7280] font-bold">Couldn&apos;t load preview.</p>
                                    <a href={reviewDoc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#299E60] font-bold hover:underline mt-2 inline-block">Open in new tab</a>
                                </div>
                            ) : docIsImage(reviewDoc) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={previewUrl} alt={reviewDoc.fileName} className="max-w-full max-h-[60vh] object-contain rounded-[8px] shadow-sm" />
                            ) : docIsPdf(reviewDoc) ? (
                                <iframe src={previewUrl} title={reviewDoc.fileName} className="w-full h-[60vh] rounded-[8px] bg-white border border-[#E5E7EB]" />
                            ) : (
                                <div className="text-center py-12">
                                    <FileText size={40} className="text-[#9CA3AF] mx-auto mb-3" />
                                    <p className="text-[13px] text-[#6B7280] font-bold">Preview not available for this file type.</p>
                                    <a href={reviewDoc.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#299E60] font-bold hover:underline mt-2 inline-block">Open in new tab</a>
                                </div>
                            )}
                        </div>

                        {reviewDoc.adminNote && (
                            <div className="px-5 py-2.5 bg-[#FFF8EB] border-t border-[#FDE68A]/60 text-[11px] text-[#B45309] font-medium">
                                <strong className="font-extrabold uppercase text-[9px] mr-1">Note:</strong>{reviewDoc.adminNote}
                            </div>
                        )}

                        {/* Footer actions — verify / reject right here in the popup */}
                        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-[#EEEEEE] bg-white">
                            <button
                                onClick={() => {
                                    const note = window.prompt('Provide rejection reason (will be visible to vendor):');
                                    if (note === null) return;
                                    handleDocStatus(reviewDoc.id, 'rejected', note.trim() || undefined);
                                }}
                                disabled={updatingDoc === reviewDoc.id || reviewDoc.status === 'rejected'}
                                className="h-[38px] px-4 bg-white border border-[#E5E7EB] hover:bg-[#FDF2F2] hover:text-[#EF4444] text-[#4B5563] text-[12px] font-bold rounded-[10px] disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                            >
                                <XCircle size={14} /> Reject
                            </button>
                            <button
                                onClick={() => handleDocStatus(reviewDoc.id, 'verified')}
                                disabled={updatingDoc === reviewDoc.id || reviewDoc.status === 'verified'}
                                className="h-[38px] px-4 bg-[#299E60] hover:bg-[#238a54] text-white text-[12px] font-bold rounded-[10px] disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-colors"
                            >
                                {updatingDoc === reviewDoc.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                Verify Document
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function truncateId(id: string): string {
    if (!id || id.length <= 12) return id;
    return id.slice(0, 6) + '...' + id.slice(-4);
}

function CopyButton({ text, label }: { text: string; label: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast.success(`${label} copied to clipboard`);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast.error('Failed to copy to clipboard');
        }
    };
    return (
        <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-gray-100 text-[#7C7C7C] hover:text-[#181725] transition-colors inline-flex items-center justify-center cursor-pointer shrink-0"
            title={`Copy ${label}`}
        >
            {copied ? (
                <Check size={12} className="text-[#299E60]" />
            ) : (
                <Copy size={12} />
            )}
        </button>
    );
}
