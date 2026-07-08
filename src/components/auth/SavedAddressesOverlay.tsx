'use client';

import React, { useEffect, useState } from 'react';
import {
    ChevronLeft,
    MapPin,
    Plus,
    Home,
    Briefcase,
    MoreVertical,
    Pencil,
    Trash2,
    X,
    Store,
    Loader2,
    Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAddress, type Address } from '@/context/AddressContext';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useSession } from 'next-auth/react';
import { useBusinessAccountSwitcher } from '@/hooks/useBusinessAccountSwitcher';
import { syncAddressToOutlet, prepareAccountForOutletSync } from '@/lib/syncAddressToOutlet';
import { toast } from 'sonner';
import { AddNewAddressOverlay } from '@/components/layout/AddNewAddressOverlay';
import { EditAddressOverlay } from '@/components/layout/EditAddressOverlay';
import { CreateBusinessAccountModal } from './CreateBusinessAccountModal';

interface SavedAddressesOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

const LABEL_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
    Business: Store,
    Home,
    Work: Briefcase,
    Other: MapPin,
};

export function SavedAddressesOverlay({ isOpen, onClose }: SavedAddressesOverlayProps) {
    const {
        savedAddresses,
        isLoadingAddresses,
        addAddress,
        removeAddress,
        updateAddress,
        refreshAddresses,
    } = useAddress();
    const confirm = useConfirm();
    const { status } = useSession();
    const { currentAccount, accounts, switchAccount, switchOutlet, refresh: refreshAccounts } = useBusinessAccountSwitcher();

    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [isAddNewOpen, setIsAddNewOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState<Address | null>(null);
    const [isCreateBusinessOpen, setIsCreateBusinessOpen] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        void refreshAddresses();
        setMenuOpenId(null);
    }, [isOpen, refreshAddresses]);

    if (!isOpen) return null;

    const syncToOutlet = async (addr: Address) => {
        if (status !== 'authenticated') return;
        try {
            const accountId = await prepareAccountForOutletSync(accounts, currentAccount, switchAccount);
            if (!accountId) return;
            await syncAddressToOutlet({
                accountId,
                addr,
                switchOutlet,
                refreshAccounts,
            });
        } catch (err) {
            console.error('Outlet sync failed:', err);
        }
    };

    const handleSaveNewAddress = async (address: Omit<Address, 'id'>) => {
        const saved = await addAddress(address);
        setIsAddNewOpen(false);
        if (saved) {
            await syncToOutlet(saved);
            toast.success('Delivery address added');
        }
    };

    const handleSetDefault = async (addr: Address) => {
        try {
            await updateAddress(addr.id, { isDefault: true });
            await refreshAddresses();
            toast.success('Default delivery address updated');
        } catch {
            toast.error('Could not update default address');
        }
        setMenuOpenId(null);
    };

    const handleDelete = async (addr: Address) => {
        setMenuOpenId(null);
        const ok = await confirm({
            title: 'Remove delivery address?',
            message: `This will permanently remove "${addr.businessName || addr.shortAddress}" from your delivery locations.`,
            confirmText: 'Remove',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await removeAddress(addr.id);
            await refreshAddresses();
            refreshAccounts();
            toast.success('Address removed');
        } catch {
            toast.error('Could not remove address');
        }
    };

    const displayName = (addr: Address) => addr.businessName || addr.label || 'Address';
    const displayLine = (addr: Address) => {
        const parts = [
            addr.flatInfo,
            addr.shortAddress || addr.fullAddress,
            addr.pincode,
        ].filter(Boolean);
        return parts.join(' · ');
    };

    return (
        <>
            <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
                <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

                <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[600px] md:mt-[5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-[#F2F3F2] md:bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
                    <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative bg-white border-b border-gray-100">
                        <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10">
                            <ChevronLeft size={20} className="text-[#181725]" />
                        </button>
                        <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">Delivery Addresses</h2>
                        <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10">
                            <X size={20} className="text-gray-500" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-5 pb-36 md:pb-6">
                        <p className="text-[12px] text-[#7C7C7C] mb-4 leading-relaxed">
                            Manage where your orders are delivered. Add your restaurant, hotel, or outlet — or register a new business account.
                        </p>

                        {isLoadingAddresses ? (
                            <div className="flex items-center justify-center py-10 gap-2 text-[#AEAEAE]">
                                <Loader2 size={18} className="animate-spin" />
                                <span className="text-[13px]">Loading delivery addresses...</span>
                            </div>
                        ) : savedAddresses.length === 0 ? (
                            <div className="text-center py-10 px-4 bg-white md:bg-gray-50/80 border border-dashed border-gray-200 rounded-[12px]">
                                <Store size={28} className="text-[#AEAEAE] mx-auto mb-2" />
                                <p className="text-[14px] font-bold text-[#374151]">No delivery addresses yet</p>
                                <p className="text-[12px] text-[#AEAEAE] mt-1">Add your business location or register a new business below</p>
                            </div>
                        ) : (
                            <div className="space-y-3 md:space-y-4">
                                {savedAddresses.map((addr) => {
                                    const Icon = LABEL_ICONS[addr.label] || MapPin;
                                    return (
                                        <div
                                            key={addr.id}
                                            className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl p-4 md:p-5 shadow-sm relative"
                                        >
                                            <div className="flex items-start gap-3 md:gap-4">
                                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#E8F5E9] flex items-center justify-center shrink-0 mt-0.5">
                                                    <Icon size={18} className="text-[#53B175] md:w-5 md:h-5" />
                                                </div>
                                                <div className="flex-1 min-w-0 pr-8">
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        <span className="text-[14px] md:text-[16px] font-[700] text-[#181725]">{displayName(addr)}</span>
                                                        {addr.isDefault && (
                                                            <span className="text-[9px] md:text-[10px] font-[700] text-[#53B175] bg-[#E8F5E9] px-2 py-0.5 rounded-full uppercase tracking-wide">Default</span>
                                                        )}
                                                    </div>
                                                    {addr.businessName && addr.label && addr.label !== addr.businessName && (
                                                        <p className="text-[11px] font-semibold text-[#AEAEAE] mb-0.5">{addr.label}</p>
                                                    )}
                                                    <p className="text-[12px] md:text-[13px] text-[#7C7C7C] leading-relaxed">{displayLine(addr)}</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setMenuOpenId(menuOpenId === addr.id ? null : addr.id)}
                                                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0 absolute right-4 top-4"
                                                    aria-label="Address options"
                                                >
                                                    <MoreVertical size={16} className="text-gray-400" />
                                                </button>
                                            </div>

                                            {menuOpenId === addr.id && (
                                                <div className="absolute right-4 top-14 bg-white border border-gray-100 rounded-xl shadow-xl z-10 overflow-hidden min-w-[180px]">
                                                    {!addr.isDefault && (
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleSetDefault(addr)}
                                                            className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50"
                                                        >
                                                            <MapPin size={14} className="text-[#53B175]" />
                                                            <span className="text-[12px] md:text-[13px] font-[600] text-[#181725]">Set as default</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingAddress(addr);
                                                            setMenuOpenId(null);
                                                        }}
                                                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50"
                                                    >
                                                        <Pencil size={14} className="text-gray-400" />
                                                        <span className="text-[12px] md:text-[13px] font-[600] text-[#181725]">Edit</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDelete(addr)}
                                                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-red-50 transition-colors"
                                                    >
                                                        <Trash2 size={14} className="text-red-400" />
                                                        <span className="text-[12px] md:text-[13px] font-[600] text-red-500">Delete</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={() => setIsCreateBusinessOpen(true)}
                            className={cn(
                                'w-full mt-4 flex items-center gap-3 p-4 rounded-[12px] border border-[#EEEEEE] bg-white hover:border-[#53B175]/30 hover:bg-[#F8FFF9] transition-colors text-left',
                            )}
                        >
                            <div className="w-10 h-10 rounded-full bg-[#EEF2FF] flex items-center justify-center shrink-0">
                                <Building2 size={18} className="text-[#6366F1]" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[13px] font-bold text-[#181725]">Register new business</p>
                                <p className="text-[11px] text-[#7C7C7C] mt-0.5">Create another business account with delivery location</p>
                            </div>
                        </button>
                    </div>

                    <div className="fixed md:static bottom-0 left-0 right-0 px-5 md:px-6 pt-3 pb-5 md:py-5 bg-white border-t border-gray-100 space-y-2">
                        <button
                            type="button"
                            onClick={() => setIsAddNewOpen(true)}
                            className="w-full bg-[#53B175] hover:bg-[#48a068] text-white font-bold py-3.5 md:py-4 rounded-xl md:rounded-2xl active:scale-[0.98] transition-all text-[14px] md:text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-green-100"
                        >
                            <Plus size={18} />
                            Add delivery address
                        </button>
                    </div>
                </div>
            </div>

            <AddNewAddressOverlay
                isOpen={isAddNewOpen}
                onClose={() => setIsAddNewOpen(false)}
                onSave={handleSaveNewAddress}
                defaultMode="business"
            />

            <EditAddressOverlay
                address={editingAddress}
                onClose={() => {
                    setEditingAddress(null);
                    void refreshAddresses();
                }}
            />

            <CreateBusinessAccountModal
                isOpen={isCreateBusinessOpen}
                onClose={() => setIsCreateBusinessOpen(false)}
                onCreated={() => {
                    setIsCreateBusinessOpen(false);
                    void refreshAddresses();
                }}
            />
        </>
    );
}
