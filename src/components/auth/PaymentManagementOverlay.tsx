'use client';

import React, { useState } from 'react';
import { ChevronLeft, CreditCard, Plus, Trash2, Smartphone, Building2, CheckCircle2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaymentMethod {
    id: string;
    type: 'upi' | 'card' | 'bank';
    label: string;
    detail: string;
    isDefault: boolean;
}

interface PaymentManagementOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

export function PaymentManagementOverlay({ isOpen, onClose }: PaymentManagementOverlayProps) {
    const [methods, setMethods] = useState<PaymentMethod[]>([
        { id: '1', type: 'upi', label: 'Google Pay', detail: 'alex@okaxis', isDefault: true },
        { id: '2', type: 'card', label: 'HDFC Debit Card', detail: '•••• •••• •••• 4582', isDefault: false },
        { id: '3', type: 'bank', label: 'SBI Net Banking', detail: 'State Bank of India', isDefault: false },
    ]);
    const [isAdding, setIsAdding] = useState(false);
    const [newMethod, setNewMethod] = useState({ type: 'upi' as PaymentMethod['type'], label: '', detail: '' });

    if (!isOpen) return null;

    const getIcon = (type: PaymentMethod['type']) => {
        switch (type) {
            case 'upi': return Smartphone;
            case 'card': return CreditCard;
            case 'bank': return Building2;
        }
    };

    const getIconBg = (type: PaymentMethod['type']) => {
        switch (type) {
            case 'upi': return 'bg-purple-50 text-purple-500';
            case 'card': return 'bg-blue-50 text-blue-500';
            case 'bank': return 'bg-orange-50 text-orange-500';
        }
    };

    const handleSetDefault = (id: string) => {
        setMethods(prev => prev.map(m => ({ ...m, isDefault: m.id === id })));
    };

    const handleDelete = (id: string) => {
        setMethods(prev => prev.filter(m => m.id !== id));
    };

    const handleAdd = () => {
        if (!newMethod.label || !newMethod.detail) return;
        setMethods(prev => [...prev, { ...newMethod, id: Date.now().toString(), isDefault: false }]);
        setNewMethod({ type: 'upi', label: '', detail: '' });
        setIsAdding(false);
    };

    return (
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
                    <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">Payment Management</h2>
                    <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-6 pb-28 md:pb-6">
                    {/* Payment Methods */}
                    <h4 className="text-[14px] md:text-[16px] font-[700] text-[#181725] mb-2 md:mb-3 px-1">Saved Methods</h4>
                    <div className="space-y-3 mb-6">
                        {methods.map((method) => {
                            const Icon = method ? getIcon(method.type) : CreditCard;
                            const iconStyle = method ? getIconBg(method.type) : 'bg-gray-50';
                            return (
                                <div key={method.id} className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex items-center gap-3 md:gap-4">
                                        <div className={cn("w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center shrink-0", iconStyle)}>
                                            <Icon size={18} className="md:w-5 md:h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <span className="text-[14px] md:text-[16px] font-[700] text-[#181725]">{method.label}</span>
                                                {method.isDefault && (
                                                    <CheckCircle2 size={14} className="text-primary fill-[#E8F5E9] md:w-4 md:h-4" />
                                                )}
                                            </div>
                                            <p className="text-[12px] md:text-[13px] text-[#7C7C7C] font-[500]">{method.detail}</p>
                                        </div>
                                        <div className="flex items-center gap-1 md:gap-2">
                                            {!method.isDefault && (
                                                <button
                                                    onClick={() => handleSetDefault(method.id)}
                                                    className="text-[10px] md:text-[11px] font-[600] text-primary bg-primary-light px-2.5 py-1 md:px-3 md:py-1.5 rounded-full active:scale-95 transition-all hover:bg-primary hover:text-white"
                                                >
                                                    Set Default
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDelete(method.id)}
                                                className="p-1.5 md:p-2 hover:bg-red-50 rounded-full transition-colors text-red-400"
                                            >
                                                <Trash2 size={14} className="md:w-5 md:h-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Add New Method Form */}
                    {isAdding && (
                        <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl p-4 md:p-6 shadow-sm space-y-3 md:space-y-4">
                            <h4 className="text-[13px] md:text-[15px] font-[700] text-[#181725]">Add Payment Method</h4>
                            <div className="flex gap-2">
                                {(['upi', 'card', 'bank'] as const).map((type) => (
                                    <button
                                        key={type}
                                        onClick={() => setNewMethod(prev => ({ ...prev, type }))}
                                        className={cn(
                                            "px-4 py-2 md:px-5 md:py-2.5 rounded-full text-[11px] md:text-[12px] font-[700] uppercase transition-all border",
                                            newMethod.type === type
                                                ? "bg-primary text-white border-primary"
                                                : "bg-white text-[#181725] border-gray-200 hover:border-gray-300"
                                        )}
                                    >
                                        {type}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                placeholder={newMethod.type === 'upi' ? 'UPI App Name' : newMethod.type === 'card' ? 'Card Name' : 'Bank Name'}
                                value={newMethod.label}
                                onChange={(e) => setNewMethod(prev => ({ ...prev, label: e.target.value }))}
                                className="w-full px-3.5 py-2.5 md:px-4 md:py-3 bg-[#F7F8FA] border border-gray-100 rounded-lg md:rounded-xl text-[13px] md:text-[14px] font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                            />
                            <input
                                type="text"
                                placeholder={newMethod.type === 'upi' ? 'UPI ID (e.g. name@upi)' : newMethod.type === 'card' ? 'Card number (last 4 digits)' : 'Account details'}
                                value={newMethod.detail}
                                onChange={(e) => setNewMethod(prev => ({ ...prev, detail: e.target.value }))}
                                className="w-full px-3.5 py-2.5 md:px-4 md:py-3 bg-[#F7F8FA] border border-gray-100 rounded-lg md:rounded-xl text-[13px] md:text-[14px] font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all"
                            />
                            <div className="flex gap-2 md:gap-3 pt-1">
                                <button onClick={() => setIsAdding(false)} className="flex-1 py-2.5 md:py-3 border border-gray-200 rounded-xl md:rounded-2xl text-[13px] md:text-[14px] font-[600] text-[#181725] hover:bg-gray-50 transition-colors">Cancel</button>
                                <button onClick={handleAdd} className="flex-1 py-2.5 md:py-3 bg-primary rounded-xl md:rounded-2xl text-[13px] md:text-[14px] font-[700] text-white active:bg-primary-dark hover:bg-primary-dark transition-colors">Save</button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Add Button */}
                <div className="fixed md:static bottom-0 left-0 right-0 px-5 md:px-6 pt-3 pb-5 md:py-5 bg-white border-t border-gray-100">
                    <button
                        onClick={() => setIsAdding(true)}
                        className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-3.5 md:py-4 rounded-xl md:rounded-2xl active:scale-[0.98] transition-all text-[14px] md:text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-green-100"
                    >
                        <Plus size={18} />
                        Add Payment Method
                    </button>
                </div>
            </div>
        </div>
    );
}
