'use client';

import React, { useState } from 'react';
import { ChevronLeft, X, Bell, Mail, Smartphone, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

interface NotificationSetting {
    id: string;
    label: string;
    description: string;
    enabled: boolean;
}

export function NotificationOverlay({ isOpen, onClose }: NotificationOverlayProps) {
    const [settings, setSettings] = useState<NotificationSetting[]>([
        { id: 'order-updates', label: 'Order Updates', description: 'Get notified about order status changes', enabled: true },
        { id: 'promotions', label: 'Promotions & Offers', description: 'Receive deals and discount notifications', enabled: true },
        { id: 'price-alerts', label: 'Price Alerts', description: 'Get notified when prices drop on saved products', enabled: false },
        { id: 'delivery', label: 'Delivery Updates', description: 'Real-time delivery tracking notifications', enabled: true },
        { id: 'rewards', label: 'Reward Points', description: 'Points earned and redemption updates', enabled: true },
        { id: 'new-products', label: 'New Products', description: 'Get notified about new arrivals', enabled: false },
        { id: 'newsletter', label: 'Newsletter', description: 'Weekly newsletter with tips and recipes', enabled: false },
    ]);

    if (!isOpen) return null;

    const toggleSetting = (id: string) => {
        setSettings(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
    };

    return (
        <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
            {/* Backdrop */}
            <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[640px] md:mt-[5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-[#F2F3F2] md:bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
                {/* Header */}
                <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative bg-white border-b border-gray-100">
                    <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10">
                        <ChevronLeft size={20} className="text-[#181725]" />
                    </button>
                    <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">Notification Settings</h2>
                    <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-6 pb-24 md:pb-8">
                    {/* Push Notifications Section */}
                    <div className="mb-6 md:mb-8">
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <Smartphone size={18} className="text-primary" />
                            <h4 className="text-[14px] md:text-[16px] font-[700] text-[#181725]">Push Notifications</h4>
                        </div>
                        <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl overflow-hidden shadow-sm">
                            {settings.slice(0, 4).map((setting, idx) => (
                                <div
                                    key={setting.id}
                                    className={cn(
                                        "flex items-center justify-between px-4 py-4 md:px-5 md:py-5 hover:bg-white transition-colors",
                                        idx < 3 && "border-b border-gray-50/80"
                                    )}
                                >
                                    <div className="flex-1 mr-4">
                                        <p className="text-[13px] md:text-[15px] font-[600] text-[#181725] mb-0.5">{setting.label}</p>
                                        <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[400] leading-relaxed">{setting.description}</p>
                                    </div>
                                    <button
                                        onClick={() => toggleSetting(setting.id)}
                                        className={cn(
                                            "w-[44px] md:w-[52px] h-[24px] md:h-[28px] rounded-full relative transition-colors duration-300 shrink-0",
                                            setting.enabled ? "bg-primary" : "bg-gray-200"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "w-[20px] md:w-[24px] h-[20px] md:h-[24px] bg-white rounded-full shadow-md absolute top-[2px] transition-all duration-300",
                                                setting.enabled ? "left-[22px] md:left-[26px]" : "left-[2px]"
                                            )}
                                        />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Email & Other Section */}
                    <div>
                        <div className="flex items-center gap-2 mb-3 px-1">
                            <Mail size={18} className="text-orange-400" />
                            <h4 className="text-[14px] md:text-[16px] font-[700] text-[#181725]">Email & Updates</h4>
                        </div>
                        <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl overflow-hidden shadow-sm">
                            {settings.slice(4).map((setting, idx) => (
                                <div
                                    key={setting.id}
                                    className={cn(
                                        "flex items-center justify-between px-4 py-4 md:px-5 md:py-5 hover:bg-white transition-colors",
                                        idx < settings.slice(4).length - 1 && "border-b border-gray-50/80"
                                    )}
                                >
                                    <div className="flex-1 mr-4">
                                        <p className="text-[13px] md:text-[15px] font-[600] text-[#181725] mb-0.5">{setting.label}</p>
                                        <p className="text-[11px] md:text-[13px] text-[#7C7C7C] font-[400] leading-relaxed">{setting.description}</p>
                                    </div>
                                    <button
                                        onClick={() => toggleSetting(setting.id)}
                                        className={cn(
                                            "w-[44px] md:w-[52px] h-[24px] md:h-[28px] rounded-full relative transition-colors duration-300 shrink-0",
                                            setting.enabled ? "bg-primary" : "bg-gray-200"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "w-[20px] md:w-[24px] h-[20px] md:h-[24px] bg-white rounded-full shadow-md absolute top-[2px] transition-all duration-300",
                                                setting.enabled ? "left-[22px] md:left-[26px]" : "left-[2px]"
                                            )}
                                        />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Desktop Save Button (Static at bottom of modal) */}
                <div className="hidden md:block p-6 bg-white border-t border-gray-100">
                    <button 
                        onClick={onClose}
                        className="w-full bg-primary hover:bg-primary-dark text-white font-bold py-4 rounded-xl active:scale-[0.98] transition-all text-[16px] shadow-lg shadow-green-100"
                    >
                        Save Preferences
                    </button>
                </div>
            </div>
        </div>
    );
}
