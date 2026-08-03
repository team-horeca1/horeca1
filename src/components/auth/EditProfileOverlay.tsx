'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, Pencil, X, Loader2, Check } from 'lucide-react';
import { AddressAutocomplete, type AddressPickPayload } from '@/components/ui/AddressAutocomplete';
import { FormErrorBanner } from '@/components/ui/form';
import { cn } from '@/lib/utils';

export interface EditProfileFormData {
    fullName: string;
    phone: string;
    businessName: string;
    address: string;
    address2: string;
    pincode: string;
    city: string;
    image?: string;
    shortAddress?: string;
    state?: string;
    latitude?: number | null;
    longitude?: number | null;
    placeId?: string;
}

interface EditProfileOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    userData: EditProfileFormData;
    onSave: (data: EditProfileFormData) => void | Promise<void>;
}

const RESEND_COOLDOWN = 60;
const PHONE_RE = /^[6-9]\d{9}$/;

// Reduce any stored phone (e.g. "+919999900000") to the editable 10-digit local part.
const toLocalPhone = (p: string) => (p || '').replace(/\D/g, '').slice(-10);

export function EditProfileOverlay({ isOpen, onClose, userData, onSave }: EditProfileOverlayProps) {
    const [fullName, setFullName] = useState(userData.fullName);
    const [businessName, setBusinessName] = useState(userData.businessName);
    const [phone, setPhone] = useState(toLocalPhone(userData.phone));
    const [originalPhone, setOriginalPhone] = useState(toLocalPhone(userData.phone));
    const [address, setAddress] = useState(userData.address);
    const [address2, setAddress2] = useState(userData.address2);
    const [pincode, setPincode] = useState(userData.pincode);
    const [city, setCity] = useState(userData.city);
    const [shortAddress, setShortAddress] = useState(userData.shortAddress || '');
    const [state, setState] = useState(userData.state || '');
    const [latitude, setLatitude] = useState<number | null>(userData.latitude ?? null);
    const [longitude, setLongitude] = useState<number | null>(userData.longitude ?? null);
    const [placeId, setPlaceId] = useState(userData.placeId || '');
    const [image, setImage] = useState(userData.image || '');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Phone-change OTP state
    const [otpSent, setOtpSent] = useState(false);
    const [phoneVerified, setPhoneVerified] = useState(false);
    const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '']);
    const [otpLoading, setOtpLoading] = useState(false);
    const [resendTimer, setResendTimer] = useState(0);

    const fileRef = useRef<HTMLInputElement>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const otpRefs = [
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
        useRef<HTMLInputElement>(null),
    ];

    const resetOtpState = useCallback(() => {
        setOtpSent(false);
        setPhoneVerified(false);
        setOtpDigits(['', '', '', '']);
        setResendTimer(0);
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    const startResendTimer = useCallback(() => {
        setResendTimer(RESEND_COOLDOWN);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setResendTimer((prev) => {
                if (prev <= 1) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    useEffect(() => () => {
        if (timerRef.current) clearInterval(timerRef.current);
    }, []);

    // Sync props → state whenever overlay opens or userData changes (API fetch completes after mount)
    useEffect(() => {
        if (!isOpen) return;
        const local = toLocalPhone(userData.phone);
        setFullName(userData.fullName);
        setBusinessName(userData.businessName);
        setPhone(local);
        setOriginalPhone(local);
        setAddress(userData.address);
        setAddress2(userData.address2);
        setPincode(userData.pincode);
        setCity(userData.city);
        setShortAddress(userData.shortAddress || '');
        setState(userData.state || '');
        setLatitude(userData.latitude ?? null);
        setLongitude(userData.longitude ?? null);
        setPlaceId(userData.placeId || '');
        setImage(userData.image || '');
        setError('');
        setSaving(false);
        resetOtpState();
    }, [isOpen, userData, resetOtpState]);

    if (!isOpen) return null;

    const phoneChanged = phone !== originalPhone;

    const buildFormData = (): EditProfileFormData => ({
        fullName,
        phone,
        businessName,
        address,
        address2,
        pincode,
        city,
        image,
        shortAddress: shortAddress || address.split(',').slice(0, 2).join(', '),
        state,
        latitude,
        longitude,
        placeId: placeId || undefined,
    });

    const persistSave = async () => {
        setSaving(true);
        setError('');
        try {
            await onSave(buildFormData());
            onClose();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to save changes. Please try again.';
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleSendOtp = async () => {
        setError('');
        if (!PHONE_RE.test(phone)) {
            setError('Enter a valid 10-digit mobile number');
            return;
        }
        setOtpLoading(true);
        try {
            const checkRes = await fetch('/api/v1/auth/check-phone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, intent: 'customer' }),
            });
            const checkData = await checkRes.json();
            if (!checkData.success) {
                setError(checkData.error || 'Could not verify phone number');
                return;
            }
            if (checkData.data?.exists) {
                setError('This number is already registered');
                return;
            }

            const res = await fetch('/api/v1/auth/otp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to send OTP');
                return;
            }
            setOtpSent(true);
            setOtpDigits(['', '', '', '']);
            startResendTimer();
            setTimeout(() => otpRefs[0].current?.focus(), 100);
        } catch {
            setError('Failed to send OTP. Please try again.');
        } finally {
            setOtpLoading(false);
        }
    };

    const handleVerifyOtp = async (code: string) => {
        if (code.length !== 4 || otpLoading) return;
        setOtpLoading(true);
        setError('');
        try {
            const res = await fetch('/api/v1/auth/otp/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, code }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Invalid or expired OTP');
                setOtpDigits(['', '', '', '']);
                setTimeout(() => otpRefs[0].current?.focus(), 50);
                return;
            }
            setPhoneVerified(true);
            // Verified — persist profile including the new phone
            await persistSave();
        } catch {
            setError('Verification failed. Please try again.');
        } finally {
            setOtpLoading(false);
        }
    };

    const handleOtpChange = (index: number, value: string) => {
        if (value.length > 1) {
            const digits = value.replace(/\D/g, '').slice(0, 4);
            const next = ['', '', '', ''];
            for (let i = 0; i < digits.length; i++) next[i] = digits[i];
            setOtpDigits(next);
            setError('');
            otpRefs[Math.min(digits.length, 3)]?.current?.focus();
            if (digits.length === 4) handleVerifyOtp(digits);
            return;
        }
        const digit = value.replace(/\D/g, '');
        const next = [...otpDigits];
        next[index] = digit;
        setOtpDigits(next);
        setError('');
        if (digit && index < 3) otpRefs[index + 1].current?.focus();
        if (digit && next.every((d) => d)) handleVerifyOtp(next.join(''));
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
            otpRefs[index - 1].current?.focus();
        }
    };

    const handlePick = (place: AddressPickPayload) => {
        setAddress(place.fullAddress);
        setShortAddress(place.shortAddress);
        setPincode(place.pincode);
        setCity(place.city);
        setState(place.state);
        setLatitude(place.latitude);
        setLongitude(place.longitude);
        setPlaceId(place.placeId);
        if (place.businessName) {
            setBusinessName(place.businessName);
        }
    };

    const handleSave = async () => {
        if (saving || otpLoading) return;
        setError('');

        if (phoneChanged) {
            if (!PHONE_RE.test(phone)) {
                setError('Enter a valid 10-digit mobile number');
                return;
            }
            if (!phoneVerified) {
                // Uniqueness check + OTP before saving a new number
                await handleSendOtp();
                return;
            }
        }

        await persistSave();
    };

    const handlePickImage = () => fileRef.current?.click();

    const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('folder', 'misc');
            const res = await fetch('/api/v1/upload', { method: 'POST', body: fd, credentials: 'include' });
            const json = await res.json();
            if (json?.success && json.data?.url) {
                setImage(json.data.url);
                // Persist immediately so it survives even if user closes without Save
                await fetch('/api/v1/auth/me', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ image: json.data.url }),
                });
            }
        } catch { /* silent */ }
        finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const avatarSrc = image || '/images/profile/sample-profile.png';
    const busy = saving || otpLoading;
    const saveLabel = phoneChanged && !phoneVerified
        ? (otpSent ? 'Verify & Save' : 'Verify Phone & Save')
        : 'Save Changes';

    return (
        <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
            {/* Desktop backdrop */}
            <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[560px] md:mt-[5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
                {/* Header */}
                <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative border-b border-gray-100">
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10"
                    >
                        <ChevronLeft size={22} className="text-[#181725]" />
                    </button>
                    <h2 className="w-full text-center md:text-left text-[16px] md:text-[20px] font-[800] text-[#181725]">Edit Profile</h2>
                    <button
                        onClick={onClose}
                        className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Avatar Section */}
                <div className="flex flex-col items-center pt-6 pb-4 md:pt-8 md:pb-6">
                    <div className="relative mb-2">
                        <div className="w-[85px] h-[85px] md:w-[100px] md:h-[100px] rounded-full overflow-hidden border-[2.5px] border-[#53B175]">
                            <img
                                src={avatarSrc}
                                alt="Profile"
                                className="w-full h-full object-cover"
                            />
                            {uploading && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                                    <Loader2 size={20} className="text-white animate-spin" />
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={handlePickImage}
                            disabled={uploading}
                            className="absolute bottom-0 right-0 w-7 h-7 md:w-8 md:h-8 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                            <Pencil size={14} className="text-gray-400" />
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handleImageChange}
                            className="hidden"
                        />
                    </div>
                    <h3 className="text-[16px] md:text-[18px] font-[800] text-[#181725] mb-0.5">{fullName || 'User'}</h3>
                    <p className="text-[12px] md:text-[13px] text-gray-400 font-medium">{phone ? `+91 ${phone}` : '+91'}</p>
                </div>

                {/* Form Fields */}
                <div className="flex-1 overflow-y-auto px-5 md:px-8 pb-28 md:pb-6">
                    <FormErrorBanner message={error || null} className="mb-4" />

                    <div className="space-y-4 md:space-y-5">
                        <div>
                            <label className="text-[12px] md:text-[13px] font-semibold text-[#181725] ml-0.5 mb-1.5 block">Full name</label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full px-3.5 py-2.5 md:px-4 md:py-3 bg-white border border-gray-200 rounded-lg md:rounded-xl text-[13px] md:text-[14px] font-medium text-gray-500 outline-none focus:border-[#53B175] focus:ring-2 focus:ring-[#53B175]/10 transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[12px] md:text-[13px] font-semibold text-[#181725] ml-0.5 mb-1.5 block">Business Name</label>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                className="w-full px-3.5 py-2.5 md:px-4 md:py-3 bg-white border border-gray-200 rounded-lg md:rounded-xl text-[13px] md:text-[14px] font-medium text-gray-500 outline-none focus:border-[#53B175] focus:ring-2 focus:ring-[#53B175]/10 transition-all"
                            />
                        </div>
                        <div>
                            <label className="text-[12px] md:text-[13px] font-semibold text-[#181725] ml-0.5 mb-1.5 block">
                                Phone number
                                {phoneVerified && (
                                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#53B175]">
                                        <Check size={12} /> Verified
                                    </span>
                                )}
                            </label>
                            <div className={cn(
                                'flex items-center w-full bg-white border border-gray-200 rounded-lg md:rounded-xl overflow-hidden focus-within:border-[#53B175] focus-within:ring-2 focus-within:ring-[#53B175]/10 transition-all',
                                phoneVerified && 'border-[#53B175] bg-green-50/40',
                            )}>
                                <span className="px-3 md:px-3.5 py-2.5 md:py-3 text-[13px] md:text-[14px] font-medium text-gray-500 bg-gray-50 border-r border-gray-200 select-none">+91</span>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    maxLength={10}
                                    value={phone}
                                    disabled={phoneVerified}
                                    onChange={(e) => {
                                        const next = e.target.value.replace(/\D/g, '').slice(0, 10);
                                        if (next !== phone && (otpSent || phoneVerified)) resetOtpState();
                                        setPhone(next);
                                        setError('');
                                    }}
                                    placeholder="10-digit mobile number"
                                    className="flex-1 px-3.5 py-2.5 md:px-4 md:py-3 bg-white text-[13px] md:text-[14px] font-medium text-gray-700 placeholder:text-gray-400 outline-none disabled:bg-transparent disabled:text-gray-600"
                                />
                            </div>
                            {phoneChanged && !phoneVerified && (
                                <p className="mt-1.5 text-[11px] md:text-[12px] text-gray-400 ml-0.5">
                                    Changing your number requires OTP verification.
                                </p>
                            )}
                        </div>

                        {otpSent && !phoneVerified && (
                            <div>
                                <p className="text-[12px] md:text-[13px] text-gray-400 text-center mb-3">
                                    Code sent to{' '}
                                    <span className="font-bold text-gray-700">
                                        +91 {phone.slice(0, 5)} {phone.slice(5)}
                                    </span>
                                </p>
                                <div className="flex gap-2.5 md:gap-3 justify-center mb-3">
                                    {otpDigits.map((digit, i) => (
                                        <input
                                            key={i}
                                            ref={otpRefs[i]}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={4}
                                            value={digit}
                                            onChange={(e) => handleOtpChange(i, e.target.value)}
                                            onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                            disabled={otpLoading}
                                            className={cn(
                                                'w-12 h-12 md:w-14 md:h-14 text-center text-[18px] md:text-[22px] font-[800] border-2 rounded-xl md:rounded-2xl outline-none transition-all',
                                                digit ? 'border-[#53B175] bg-green-50 text-[#53B175]' : 'border-gray-200 bg-[#F7F8FA]',
                                                'focus:border-[#53B175]',
                                                otpLoading && 'opacity-60',
                                            )}
                                        />
                                    ))}
                                </div>
                                <div className="text-center">
                                    {resendTimer > 0 ? (
                                        <p className="text-[12px] text-gray-400">
                                            Resend in <span className="font-bold">{resendTimer}s</span>
                                        </p>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={handleSendOtp}
                                            disabled={otpLoading}
                                            className="text-[13px] text-[#53B175] font-bold hover:underline disabled:opacity-50"
                                        >
                                            Resend OTP
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div>
                            <AddressAutocomplete
                                label="Search delivery address"
                                placeholder="Search area, street, or business name…"
                                businessMode
                                hint="Pick a place from search — this sets pincode, city and map pin."
                                initialValue={address}
                                onPick={handlePick}
                            />
                        </div>
                        <div>
                            <label className="text-[12px] md:text-[13px] font-semibold text-[#181725] ml-0.5 mb-1.5 block">Address line 2 <span className="text-gray-400 font-normal">(optional)</span></label>
                            <input
                                type="text"
                                value={address2}
                                onChange={(e) => setAddress2(e.target.value)}
                                placeholder="Apartment, suite, landmark"
                                className="w-full px-3.5 py-2.5 md:px-4 md:py-3 bg-white border border-gray-200 rounded-lg md:rounded-xl text-[13px] md:text-[14px] font-medium text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#53B175] focus:ring-2 focus:ring-[#53B175]/10 transition-all"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:gap-4">
                            <div>
                                <label className="text-[12px] md:text-[13px] font-semibold text-[#181725] ml-0.5 mb-1.5 block">Pincode</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={6}
                                    value={pincode}
                                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="e.g. 400076"
                                    className="w-full px-3.5 py-2.5 md:px-4 md:py-3 bg-white border border-gray-200 rounded-lg md:rounded-xl text-[13px] md:text-[14px] font-medium text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#53B175] focus:ring-2 focus:ring-[#53B175]/10 transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[12px] md:text-[13px] font-semibold text-[#181725] ml-0.5 mb-1.5 block">City</label>
                                <input
                                    type="text"
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    placeholder="e.g. Mumbai"
                                    className="w-full px-3.5 py-2.5 md:px-4 md:py-3 bg-white border border-gray-200 rounded-lg md:rounded-xl text-[13px] md:text-[14px] font-medium text-gray-700 placeholder:text-gray-400 outline-none focus:border-[#53B175] focus:ring-2 focus:ring-[#53B175]/10 transition-all"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <div className="fixed md:static bottom-0 left-0 right-0 px-5 md:px-8 pt-3 pb-5 md:pb-6 bg-white md:border-t md:border-gray-100">
                    <button
                        type="button"
                        onClick={() => {
                            if (otpSent && !phoneVerified) {
                                handleVerifyOtp(otpDigits.join(''));
                            } else {
                                handleSave();
                            }
                        }}
                        disabled={busy || (otpSent && !phoneVerified && otpDigits.join('').length !== 4)}
                        className={cn(
                            'w-full bg-[#53B175] hover:bg-[#48a068] text-white font-bold py-3.5 md:py-4 rounded-xl md:rounded-2xl active:scale-[0.98] transition-all text-[14px] md:text-[16px] shadow-lg shadow-green-100 flex items-center justify-center gap-2',
                            (busy || (otpSent && !phoneVerified && otpDigits.join('').length !== 4)) && 'opacity-60 cursor-not-allowed hover:bg-[#53B175]',
                        )}
                    >
                        {busy && <Loader2 size={18} className="animate-spin" />}
                        {otpSent && !phoneVerified ? 'Verify & Save' : saveLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
