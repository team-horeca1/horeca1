'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AccountTypeSelectionProps {
    isOpen: boolean;
    onClose: () => void;
    onContinue: (role: 'customer' | 'vendor') => void;
}

export function AccountTypeSelection({ isOpen, onClose, onContinue }: AccountTypeSelectionProps) {
    const [selectedType, setSelectedType] = useState<'customer' | 'vendor' | null>(null);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[12000] bg-white flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
            {/* Logo Section */}
            <div className="flex flex-col items-center pt-20 pb-12">
                <h1 className="text-[34px] font-[900] tracking-tight flex items-center justify-center">
                    <span className="text-[#ee2c2c]">Horeca</span>
                    <span className="text-[#1a237e]">1</span>
                </h1>
            </div>

            <div className="flex-1 flex flex-col px-6">
                {/* Title Section */}
                <div className="text-center mb-10">
                    <h2 className="text-[24px] font-[700] text-gray-800 mb-2">Choose your Account Type</h2>
                    <p className="text-[14px] text-gray-500 font-medium tracking-tight">Select how you want to use the app</p>
                </div>

                {/* Options */}
                <div className="w-full space-y-4 max-w-sm mx-auto">
                    {/* Customer Option */}
                    <button
                        onClick={() => setSelectedType('customer')}
                        className={cn(
                            "w-full flex items-center gap-5 p-4 rounded-lg border transition-all duration-300 text-left",
                            selectedType === 'customer'
                                ? "bg-primary border-primary text-white"
                                : "bg-white border-gray-100 text-gray-500 hover:border-gray-200 hover:bg-gray-50 active:bg-gray-100"
                        )}
                    >
                        <div className="flex items-center justify-center shrink-0">
                            <img
                                src="/images/login/carbon_customer.png"
                                alt="Customer Icon"
                                className={cn(
                                    "w-10 h-10 object-contain transition-all",
                                    selectedType === 'customer' ? "brightness-0 invert" : "opacity-70"
                                )}
                            />
                        </div>
                        <span className="text-[18px] font-bold">Customer</span>
                    </button>

                    {/* Vendor Option */}
                    <button
                        onClick={() => setSelectedType('vendor')}
                        className={cn(
                            "w-full flex items-center gap-5 p-4 rounded-lg border transition-all duration-300 text-left",
                            selectedType === 'vendor'
                                ? "bg-primary border-primary text-white"
                                : "bg-white border-gray-100 text-gray-500 hover:border-gray-200 hover:bg-gray-50 active:bg-gray-100"
                        )}
                    >
                        <div className="flex items-center justify-center shrink-0">
                            <img
                                src="/images/login/vendor.png"
                                alt="Supplier Icon"
                                className={cn(
                                    "w-10 h-10 object-contain transition-all",
                                    selectedType === 'vendor' ? "brightness-0 invert" : "opacity-70"
                                )}
                            />
                        </div>
                        <span className="text-[18px] font-bold">Supplier</span>
                    </button>
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="p-6 pb-12 max-w-sm mx-auto w-full">
                <button
                    disabled={!selectedType}
                    onClick={() => {
                        if (selectedType) {
                            onContinue(selectedType);
                        }
                    }}
                    className={cn(
                        "w-full font-bold py-4 rounded-lg active:scale-[0.98] transition-all text-[18px]",
                        selectedType
                            ? "bg-primary text-white shadow-lg shadow-green-100 hover:bg-primary-dark"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    )}
                >
                    Continue
                </button>
            </div>

            {/* Back/Close button */}
            <button
                onClick={onClose}
                className="absolute top-6 left-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
                <X size={24} />
            </button>
        </div>
    );
}
