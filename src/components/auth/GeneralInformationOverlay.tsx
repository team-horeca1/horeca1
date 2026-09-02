'use client';

import React from 'react';
import { ChevronLeft, ChevronRight, FileText, Shield, HelpCircle, Info, MessageSquare, Star, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeneralInformationOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

export function GeneralInformationOverlay({ isOpen, onClose }: GeneralInformationOverlayProps) {
    if (!isOpen) return null;

    const infoItems = [
        { id: 'about', label: 'About horeca1', description: 'Learn more about us', icon: Info, color: 'bg-blue-50 text-blue-500' },
        { id: 'terms', label: 'Terms & Conditions', description: 'Our terms of service', icon: FileText, color: 'bg-orange-50 text-orange-500' },
        { id: 'privacy', label: 'Privacy Policy', description: 'How we handle your data', icon: Shield, color: 'bg-primary-light text-primary' },
        { id: 'faq', label: 'FAQ', description: 'Frequently asked questions', icon: HelpCircle, color: 'bg-purple-50 text-purple-500' },
        { id: 'feedback', label: 'Send Feedback', description: 'Help us improve', icon: MessageSquare, color: 'bg-pink-50 text-pink-500' },
        { id: 'rate', label: 'Rate Us', description: 'Rate us on the app store', icon: Star, color: 'bg-yellow-50 text-yellow-500' },
    ];

    return (
        <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
            {/* Backdrop */}
            <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="w-full h-full md:h-auto md:max-h-[85vh] md:w-[600px] md:mt-[7.5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-[#F2F3F2] md:bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
                {/* Header */}
                <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative bg-white border-b border-gray-100">
                    <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10">
                        <ChevronLeft size={20} className="text-[#181725]" />
                    </button>
                    <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">General Information</h2>
                    <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-6 pb-8">
                    <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl overflow-hidden shadow-sm mb-6">
                        {infoItems.map((item, idx) => {
                            const Icon = item.icon;
                            return (
                                <button
                                    key={item.id}
                                    className={cn(
                                        "w-full flex items-center gap-3.5 px-4 py-4 active:bg-gray-100 md:hover:bg-white transition-colors text-left",
                                        idx < infoItems.length - 1 && "border-b border-gray-50/80"
                                    )}
                                >
                                    <div className={cn("w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0", item.color)}>
                                        <Icon size={18} className="md:w-5 md:h-5" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] md:text-[15px] font-[600] text-[#181725] mb-0.5">{item.label}</p>
                                        <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[400]">{item.description}</p>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-300 shrink-0" />
                                </button>
                            );
                        })}
                    </div>

                    {/* App Version */}
                    <div className="text-center pt-2 md:pt-4">
                        <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[500]">horeca1 v2.1.0</p>
                        <p className="text-[10px] md:text-[11px] text-[#BABABA] font-[400] mt-1">© 2025 horeca1. All rights reserved.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
