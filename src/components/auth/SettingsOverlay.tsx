'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Globe, Moon, Type, Trash2, LogOut, ShieldCheck, X, AlertTriangle, Loader2, Building2 } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DELETE_MY_ACCOUNT_PHRASE } from '@/lib/accountDeletion';
import { ACCOUNTS_REFRESH_EVENT } from '@/lib/addressUsability';
import { clearAllAdminImpersonation, isAdminCustomerImpersonationActive } from '@/lib/clearImpersonation';

interface SettingsOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    /** Active business account — used for the "delete business account only" path. */
    activeBusinessAccountId?: string;
    onBusinessAccountDeleted?: (deletedAccountId: string) => void;
}

type DeleteStep = 'choose' | 'business-account' | 'full-login';

interface BusinessAccountSummary {
    id: string;
    legalName: string;
}

export function SettingsOverlay({
    isOpen,
    onClose,
    activeBusinessAccountId,
    onBusinessAccountDeleted,
}: SettingsOverlayProps) {
    const { data: session } = useSession();
    const router = useRouter();
    const sessionActiveBaId = (session?.user as { activeBusinessAccountId?: string } | undefined)?.activeBusinessAccountId;
    const effectiveBaId = activeBusinessAccountId ?? sessionActiveBaId;
    const adminDeletingCustomer = isAdminCustomerImpersonationActive();

    const [language, setLanguage] = useState('English');
    const [darkMode, setDarkMode] = useState(false);
    const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');
    const [showLangPicker, setShowLangPicker] = useState(false);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteStep, setDeleteStep] = useState<DeleteStep>('choose');
    const [baSummary, setBaSummary] = useState<BusinessAccountSummary | null>(null);
    const [baLoading, setBaLoading] = useState(false);
    const [baConfirmText, setBaConfirmText] = useState('');
    const [baDeleting, setBaDeleting] = useState(false);
    const [baDeleteError, setBaDeleteError] = useState<string | null>(null);

    const [password, setPassword] = useState('');
    const [fullConfirmText, setFullConfirmText] = useState('');
    const [fullDeleting, setFullDeleting] = useState(false);
    const [fullDeleteError, setFullDeleteError] = useState<string | null>(null);

    const [businessAccountCount, setBusinessAccountCount] = useState<number | null>(null);
    const [accountsLoading, setAccountsLoading] = useState(false);

    const canDeleteBusinessAccountOnly = (businessAccountCount ?? 0) > 1;

    const resetDeleteState = () => {
        setDeleteStep('choose');
        setBaSummary(null);
        setBaConfirmText('');
        setBaDeleteError(null);
        setPassword('');
        setFullConfirmText('');
        setFullDeleteError(null);
        setBusinessAccountCount(null);
    };

    const openDeleteFlow = () => {
        resetDeleteState();
        setDeleteOpen(true);
        setAccountsLoading(true);
        fetch('/api/v1/account')
            .then((r) => r.json())
            .then((j) => {
                const count = j.success && Array.isArray(j.data) ? j.data.length : 0;
                setBusinessAccountCount(count);
                setDeleteStep(count > 1 ? 'choose' : 'full-login');
            })
            .catch(() => {
                setBusinessAccountCount(0);
                setDeleteStep('full-login');
            })
            .finally(() => setAccountsLoading(false));
    };

    const closeDeleteModal = () => {
        setDeleteOpen(false);
        resetDeleteState();
    };

    useEffect(() => {
        if (!deleteOpen || deleteStep !== 'business-account' || !effectiveBaId) return;
        Promise.resolve().then(() => setBaLoading(true));
        fetch(`/api/v1/account/${effectiveBaId}`)
            .then((r) => r.json())
            .then((j) => {
                if (j.success) {
                    setBaSummary({ id: j.data.id, legalName: j.data.legalName });
                } else {
                    setBaDeleteError(j.error?.message || 'Could not load business account');
                }
            })
            .catch(() => setBaDeleteError('Could not load business account'))
            .finally(() => setBaLoading(false));
    }, [deleteOpen, deleteStep, effectiveBaId]);

    const handleBusinessAccountDelete = async () => {
        if (!baSummary) return;
        setBaDeleting(true);
        setBaDeleteError(null);
        try {
            const res = await fetch(`/api/v1/account/${baSummary.id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: baConfirmText }),
            });
            const json = await res.json();
            if (!json.success) {
                setBaDeleteError(json.error?.message || 'Failed to delete business account');
                return;
            }
            toast.success(`Deleted ${baSummary.legalName}`);
            window.dispatchEvent(new CustomEvent(ACCOUNTS_REFRESH_EVENT));
            onBusinessAccountDeleted?.(baSummary.id);
            closeDeleteModal();
            onClose();
        } catch (err) {
            setBaDeleteError(err instanceof Error ? err.message : 'Failed to delete business account');
        } finally {
            setBaDeleting(false);
        }
    };

    const handleFullLoginDelete = async () => {
        setFullDeleting(true);
        setFullDeleteError(null);
        try {
            const res = await fetch('/api/v1/me', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(
                    adminDeletingCustomer
                        ? { confirm: fullConfirmText }
                        : { password, confirm: fullConfirmText },
                ),
            });
            const json = await res.json();
            if (!json.success) {
                setFullDeleteError(json.error?.message || 'Failed to delete account');
                return;
            }
            if (adminDeletingCustomer) {
                toast.success('Customer account permanently deleted');
                closeDeleteModal();
                onClose();
                await clearAllAdminImpersonation();
                router.push('/admin/customers');
                return;
            }
            toast.success('Your account has been permanently deleted');
            closeDeleteModal();
            onClose();
            await signOut({ callbackUrl: '/' });
        } catch (err) {
            setFullDeleteError(err instanceof Error ? err.message : 'Failed to delete account');
        } finally {
            setFullDeleting(false);
        }
    };

    if (!isOpen) return null;

    const languages = ['English', 'हिन्दी', 'मराठी', 'தமிழ்', 'తెలుగు'];
    const isActiveBa = effectiveBaId && baSummary?.id === effectiveBaId && effectiveBaId === sessionActiveBaId;

    return (
        <>
            <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
                {/* Backdrop */}
                <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

                {/* Panel */}
                <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[600px] md:mt-[5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-[#F2F3F2] md:bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative bg-white border-b border-gray-100">
                        <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10">
                            <ChevronLeft size={20} className="text-[#181725]" />
                        </button>
                        <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">Settings</h2>
                        <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10">
                            <X size={20} className="text-gray-500" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-6 pb-8">
                        {/* Appearance Section */}
                        <div className="mb-8">
                            <h4 className="text-[14px] md:text-[16px] font-[700] text-[#181725] mb-2 px-1">Appearance</h4>
                            <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl overflow-hidden shadow-sm">
                                {/* Dark Mode */}
                                <div className="flex items-center justify-between px-4 py-4 md:px-5 md:py-5 border-b border-gray-50/80">
                                    <div className="flex items-center gap-3 md:gap-4">
                                        <div className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-gray-800 flex items-center justify-center">
                                            <Moon size={16} className="text-white md:w-5 md:h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[13px] md:text-[15px] font-[600] text-[#181725]">Dark Mode</p>
                                            <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[400]">Reduce eye strain at night</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setDarkMode(!darkMode)}
                                        className={cn(
                                            "w-[44px] md:w-[52px] h-[24px] md:h-[28px] rounded-full relative transition-colors duration-300 shrink-0",
                                            darkMode ? "bg-primary" : "bg-gray-200"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "w-[20px] md:w-[24px] h-[20px] md:h-[24px] bg-white rounded-full shadow-md absolute top-[2px] transition-all duration-300",
                                                darkMode ? "left-[22px] md:left-[26px]" : "left-[2px]"
                                            )}
                                        />
                                    </button>
                                </div>

                                {/* Font Size */}
                                <div className="px-4 py-4 md:px-5 md:py-5 border-b border-gray-50/80">
                                    <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
                                        <div className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-blue-50 flex items-center justify-center">
                                            <Type size={16} className="text-blue-500 md:w-5 md:h-5" />
                                        </div>
                                        <div>
                                            <p className="text-[13px] md:text-[15px] font-[600] text-[#181725]">Font Size</p>
                                            <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[400]">Adjust text size for readability</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 ml-12 md:ml-15">
                                        {(['small', 'medium', 'large'] as const).map((size) => (
                                            <button
                                                key={size}
                                                onClick={() => setFontSize(size)}
                                                className={cn(
                                                    "flex-1 py-1.5 md:py-2.5 rounded-lg md:rounded-xl text-[11px] md:text-[13px] font-[700] capitalize transition-all border",
                                                    fontSize === size
                                                        ? "bg-primary text-white border-primary"
                                                        : "bg-white text-[#181725] border-gray-200 md:hover:border-gray-300"
                                                )}
                                            >
                                                {size}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Language */}
                                <div className="px-4 py-4 md:px-5 md:py-5">
                                    <button
                                        onClick={() => setShowLangPicker(!showLangPicker)}
                                        className="w-full flex items-center justify-between"
                                    >
                                        <div className="flex items-center gap-3 md:gap-4">
                                            <div className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-primary-light flex items-center justify-center">
                                                <Globe size={16} className="text-primary md:w-5 md:h-5" />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-[13px] md:text-[15px] font-[600] text-[#181725]">Language</p>
                                                <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[400]">Language: {language}</p>
                                            </div>
                                        </div>
                                        <ChevronRight size={16} className={cn("text-gray-300 transition-transform", showLangPicker && "rotate-90")} />
                                    </button>

                                    {showLangPicker && (
                                        <div className="mt-3 md:mt-4 ml-12 md:ml-15 space-y-1 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
                                            {languages.map((lang) => (
                                                <button
                                                    key={lang}
                                                    onClick={() => { setLanguage(lang); setShowLangPicker(false); }}
                                                    className={cn(
                                                        "w-full text-left px-3 py-2 md:px-4 md:py-3 rounded-lg md:rounded-xl text-[12px] md:text-[14px] font-[600] transition-colors",
                                                        language === lang
                                                            ? "bg-primary-light text-primary"
                                                            : "text-[#181725] md:hover:bg-white"
                                                    )}
                                                >
                                                    {lang}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Security */}
                        <div>
                            <h4 className="text-[12px] md:text-[14px] font-[700] text-[#7C7C7C] uppercase tracking-wider mb-2 md:mb-3 px-1">Security</h4>
                            <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl overflow-hidden shadow-sm">
                                <button className="w-full flex items-center gap-3 md:gap-4 px-4 py-4 md:px-5 md:py-5 active:bg-gray-100 md:hover:bg-white transition-colors text-left border-b border-gray-50/80">
                                    <div className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-primary-light flex items-center justify-center">
                                        <ShieldCheck size={16} className="text-primary md:w-5 md:h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[13px] md:text-[15px] font-[600] text-[#181725]">Change Password</p>
                                        <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[400]">Update your security credentials</p>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-300" />
                                </button>
                                <button className="w-full flex items-center gap-3 md:gap-4 px-4 py-4 md:px-5 md:py-5 active:bg-gray-100 md:hover:bg-white transition-colors text-left border-b border-gray-50/80">
                                    <div className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-orange-50 flex items-center justify-center">
                                        <Trash2 size={16} className="text-orange-500 md:w-5 md:h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[13px] md:text-[15px] font-[600] text-[#181725]">Clear Cache</p>
                                        <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[400]">Free up storage space</p>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-300" />
                                </button>
                                <button
                                    onClick={openDeleteFlow}
                                    className="w-full flex items-center gap-3 md:gap-4 px-4 py-4 md:px-5 md:py-5 active:bg-red-50/30 md:hover:bg-red-50/20 transition-colors text-left"
                                >
                                    <div className="w-9 h-9 md:w-11 md:h-11 rounded-full bg-red-50 flex items-center justify-center">
                                        <LogOut size={16} className="text-red-500 md:w-5 md:h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[13px] md:text-[15px] font-[600] text-red-500">Delete Account</p>
                                        <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[400]">Remove a business account or your entire login</p>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-300" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete confirmation modal */}
            {deleteOpen && (
                <div className="fixed inset-0 z-[15000] flex items-end md:items-center justify-center animate-in fade-in duration-200">
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeDeleteModal} />
                    <div className="relative w-full md:max-w-[480px] bg-white rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom md:zoom-in-95 duration-300">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h3 className="text-[17px] font-[700] text-[#181725]">
                                {deleteStep === 'choose' && 'Delete Account'}
                                {deleteStep === 'business-account' && 'Delete Business Account'}
                                {deleteStep === 'full-login' && (adminDeletingCustomer ? 'Delete Customer Account' : 'Delete Entire Login')}
                            </h3>
                            <button onClick={closeDeleteModal} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <X size={18} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">
                            {accountsLoading && deleteStep === 'choose' && (
                                <div className="flex items-center justify-center py-10">
                                    <Loader2 size={24} className="animate-spin text-primary" />
                                </div>
                            )}

                            {deleteStep === 'choose' && !accountsLoading && (
                                <>
                                    <p className="text-[13px] text-[#7C7C7C] leading-relaxed">
                                        Choose what you want to remove. These actions are permanent and cannot be undone.
                                    </p>

                                    {canDeleteBusinessAccountOnly && (
                                        <button
                                            onClick={() => setDeleteStep('business-account')}
                                            disabled={!effectiveBaId}
                                            className="w-full text-left p-4 rounded-xl border border-gray-200 hover:border-primary/40 hover:bg-primary-light/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                                                    <Building2 size={18} className="text-blue-600" />
                                                </div>
                                                <div>
                                                    <p className="text-[14px] font-[700] text-[#181725]">Delete business account only</p>
                                                    <p className="text-[12px] text-[#7C7C7C] mt-1 leading-relaxed">
                                                        Removes one business account, its outlets, and vendor/brand data. Your login and other business accounts stay active.
                                                    </p>
                                                    {!effectiveBaId && (
                                                        <p className="text-[11.5px] text-amber-700 mt-2">No business account is selected.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    )}

                                    <button
                                        onClick={() => setDeleteStep('full-login')}
                                        className="w-full text-left p-4 rounded-xl border border-red-200 hover:border-red-300 hover:bg-red-50/30 transition-colors"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                                                <LogOut size={18} className="text-red-600" />
                                            </div>
                                            <div>
                                                <p className="text-[14px] font-[700] text-red-600">Delete entire login</p>
                                                <p className="text-[12px] text-[#7C7C7C] mt-1 leading-relaxed">
                                                    Permanently wipes your user account, all business accounts, orders, and saved data. You will be signed out.
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                </>
                            )}

                            {deleteStep === 'business-account' && (
                                <>
                                    {baLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 size={24} className="animate-spin text-primary" />
                                        </div>
                                    ) : baSummary ? (
                                        <>
                                            <p className="text-[13px] text-[#7C7C7C] leading-relaxed">
                                                Permanently deletes <strong className="text-[#181725]">{baSummary.legalName}</strong> and everything attached — outlets, members, roles, products, and inventory.
                                            </p>

                                            {isActiveBa && (
                                                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                                    <AlertTriangle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                                                    <p className="text-[12px] text-amber-800 leading-relaxed">
                                                        This is your currently active business account. Switch to a different account from the navbar before deleting.
                                                    </p>
                                                </div>
                                            )}

                                            {!isActiveBa && (
                                                <>
                                                    <p className="text-[12px] text-[#181725]">
                                                        Type <code className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded font-mono text-[11.5px]">{baSummary.legalName}</code> to confirm.
                                                    </p>
                                                    <input
                                                        type="text"
                                                        autoFocus
                                                        value={baConfirmText}
                                                        onChange={(e) => { setBaConfirmText(e.target.value); if (baDeleteError) setBaDeleteError(null); }}
                                                        placeholder={baSummary.legalName}
                                                        className="w-full h-[44px] border border-red-200 rounded-xl px-3 text-[13px] font-mono outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                                                    />
                                                </>
                                            )}

                                            {baDeleteError && (
                                                <p className="text-[12px] text-red-600">{baDeleteError}</p>
                                            )}

                                            <div className="flex items-center gap-2 pt-1">
                                                <button
                                                    onClick={handleBusinessAccountDelete}
                                                    disabled={baDeleting || isActiveBa || baConfirmText !== baSummary.legalName}
                                                    className="h-[42px] px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-[13px] font-bold flex items-center gap-2"
                                                >
                                                    {baDeleting && <Loader2 size={14} className="animate-spin" />}
                                                    {baDeleting ? 'Deleting…' : 'Delete business account'}
                                                </button>
                                                <button
                                                    onClick={() => { setDeleteStep('choose'); setBaConfirmText(''); setBaDeleteError(null); }}
                                                    disabled={baDeleting}
                                                    className="h-[42px] px-4 text-[#7C7C7C] hover:text-[#181725] text-[13px] font-bold"
                                                >
                                                    Back
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <p className="text-[13px] text-red-600">{baDeleteError || 'Business account not found'}</p>
                                    )}
                                </>
                            )}

                            {deleteStep === 'full-login' && !accountsLoading && (
                                <>
                                    <p className="text-[13px] text-[#7C7C7C] leading-relaxed">
                                        {adminDeletingCustomer
                                            ? 'You are in admin view mode. This permanently deletes the customer account you are viewing — their login, business account, and all saved data. Type the confirmation phrase below.'
                                            : canDeleteBusinessAccountOnly
                                                ? 'This removes your login and all associated data across every business account. Enter your password and type the confirmation phrase below.'
                                                : 'This permanently deletes your login and your business account. Enter your password and type the confirmation phrase below.'}
                                    </p>

                                    {!adminDeletingCustomer && (
                                        <div>
                                            <label className="text-[12px] font-semibold text-[#181725] mb-1.5 block">Password</label>
                                            <input
                                                type="password"
                                                autoFocus
                                                value={password}
                                                onChange={(e) => { setPassword(e.target.value); if (fullDeleteError) setFullDeleteError(null); }}
                                                className="w-full h-[44px] border border-gray-200 rounded-xl px-3 text-[13px] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                                                placeholder="Your current password"
                                            />
                                        </div>
                                    )}

                                    <div>
                                        <label className="text-[12px] font-semibold text-[#181725] mb-1.5 block">
                                            Type <code className="px-1 py-0.5 bg-red-50 text-red-700 rounded font-mono text-[11px]">{DELETE_MY_ACCOUNT_PHRASE}</code>
                                        </label>
                                        <input
                                            type="text"
                                            autoFocus={adminDeletingCustomer}
                                            value={fullConfirmText}
                                            onChange={(e) => { setFullConfirmText(e.target.value); if (fullDeleteError) setFullDeleteError(null); }}
                                            placeholder={DELETE_MY_ACCOUNT_PHRASE}
                                            className="w-full h-[44px] border border-red-200 rounded-xl px-3 text-[13px] font-mono outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                                        />
                                    </div>

                                    {fullDeleteError && (
                                        <p className="text-[12px] text-red-600">{fullDeleteError}</p>
                                    )}

                                    <div className="flex items-center gap-2 pt-1">
                                        <button
                                            onClick={handleFullLoginDelete}
                                            disabled={
                                                fullDeleting
                                                || (!adminDeletingCustomer && !password)
                                                || fullConfirmText !== DELETE_MY_ACCOUNT_PHRASE
                                            }
                                            className="h-[42px] px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl text-[13px] font-bold flex items-center gap-2"
                                        >
                                            {fullDeleting && <Loader2 size={14} className="animate-spin" />}
                                            {fullDeleting
                                                ? 'Deleting…'
                                                : adminDeletingCustomer
                                                    ? 'Delete customer permanently'
                                                    : 'Delete my account permanently'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (canDeleteBusinessAccountOnly) {
                                                    setDeleteStep('choose');
                                                    setPassword('');
                                                    setFullConfirmText('');
                                                    setFullDeleteError(null);
                                                } else {
                                                    closeDeleteModal();
                                                }
                                            }}
                                            disabled={fullDeleting}
                                            className="h-[42px] px-4 text-[#7C7C7C] hover:text-[#181725] text-[13px] font-bold"
                                        >
                                            {canDeleteBusinessAccountOnly ? 'Back' : 'Cancel'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
