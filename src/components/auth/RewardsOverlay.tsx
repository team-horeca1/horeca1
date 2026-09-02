'use client';

import React, { useState } from 'react';
import { ChevronLeft, Gift, Star, Copy, Check, ShoppingBag, Zap, TrendingUp, X, Share2 } from 'lucide-react';

interface RewardsOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

export function RewardsOverlay({ isOpen, onClose }: RewardsOverlayProps) {
    const [copied, setCopied] = useState(false);
    const referralCode = 'HORECA250';

    if (!isOpen) return null;

    const handleCopy = () => {
        navigator.clipboard?.writeText(referralCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const rewardHistory = [
        { id: '1', title: 'Order #1024 Cashback', points: '+50', date: '12 Mar 2025', type: 'earned' },
        { id: '2', title: 'Referral Bonus', points: '+100', date: '10 Mar 2025', type: 'earned' },
        { id: '3', title: 'Redeemed on Order #1020', points: '-200', date: '8 Mar 2025', type: 'redeemed' },
        { id: '4', title: 'First Order Reward', points: '+150', date: '5 Mar 2025', type: 'earned' },
        { id: '5', title: 'Weekly Shopping Bonus', points: '+75', date: '1 Mar 2025', type: 'earned' },
    ];

    return (
        <div className="fixed inset-0 z-[14000] flex items-start justify-center animate-in fade-in duration-200">
            <div className="hidden md:block fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            <div className="w-full h-full md:h-auto md:max-h-[90vh] md:w-[600px] md:mt-[5vh] md:rounded-2xl md:shadow-2xl md:border md:border-gray-200 bg-[#F2F3F2] md:bg-white flex flex-col animate-in slide-in-from-right md:slide-in-from-bottom md:zoom-in-95 duration-300 relative z-10 overflow-hidden">
                {/* Header */}
                <div className="flex items-center px-4 md:px-6 py-3 md:py-4 shrink-0 relative bg-white border-b border-gray-100">
                    <button onClick={onClose} className="p-1 hover:bg-gray-50 rounded-full transition-colors absolute left-4 md:hidden z-10">
                        <ChevronLeft size={20} className="text-[#181725]" />
                    </button>
                    <h2 className="w-full text-center md:text-left text-[17px] md:text-[20px] font-[700] text-[#181725]">H1 Wallet</h2>
                    <button onClick={onClose} className="hidden md:flex p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4 z-10">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-4 md:pt-6 pb-8">
                    {/* Points Card */}
                    <div className="bg-gradient-to-br from-[#4A141F] via-[#6B1D2E] to-[#8B2C3E] rounded-[16px] md:rounded-2xl p-5 md:p-7 text-white mb-5 md:mb-6 shadow-lg shadow-primary/20 relative overflow-hidden">
                        <div className="absolute -right-6 -top-6 w-24 h-24 md:w-32 md:h-32 rounded-full bg-white/10" />
                        <div className="absolute -right-2 -bottom-8 w-32 h-32 md:w-40 md:h-40 rounded-full bg-white/5" />
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-1">
                                <Gift size={18} strokeWidth={2.5} className="md:w-5 md:h-5 text-amber-200" />
                                <span className="text-[12px] md:text-[13px] font-[600] opacity-90 tracking-wide uppercase">Reward Points</span>
                            </div>
                            <div className="text-[36px] md:text-[44px] font-[800] leading-tight mb-1">175</div>
                            <p className="text-[12px] md:text-[14px] opacity-80 font-[500]">≈ ₹17.50 cashback value</p>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
                        <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl p-3 md:p-5 text-center shadow-sm">
                            <TrendingUp size={18} className="text-primary mx-auto mb-1.5 md:mb-2 md:w-6 md:h-6" />
                            <div className="text-[16px] md:text-[20px] font-[800] text-[#181725]">375</div>
                            <div className="text-[10px] md:text-[12px] text-[#7C7C7C] font-[500]">Total Earned</div>
                        </div>
                        <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl p-3 md:p-5 text-center shadow-sm">
                            <ShoppingBag size={18} className="text-orange-400 mx-auto mb-1.5 md:mb-2 md:w-6 md:h-6" />
                            <div className="text-[16px] md:text-[20px] font-[800] text-[#181725]">200</div>
                            <div className="text-[10px] md:text-[12px] text-[#7C7C7C] font-[500]">Redeemed</div>
                        </div>
                        <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl p-3 md:p-5 text-center shadow-sm">
                            <Zap size={18} className="text-yellow-500 mx-auto mb-1.5 md:mb-2 md:w-6 md:h-6" />
                            <div className="text-[16px] md:text-[20px] font-[800] text-[#181725]">175</div>
                            <div className="text-[10px] md:text-[12px] text-[#7C7C7C] font-[500]">Available</div>
                        </div>
                    </div>

                    {/* Referral Section */}
                    <div className="bg-[#FAF5EC] border border-primary/20 rounded-[16px] md:rounded-2xl p-4 md:p-6 mb-5 md:mb-6">
                        <div className="flex items-center gap-2 mb-2">
                            <Share2 size={18} className="text-primary md:w-5 md:h-5" />
                            <span className="text-[13px] md:text-[15px] font-[700] text-[#181725]">Refer & Earn</span>
                        </div>
                        <p className="text-[11px] md:text-[13px] text-[#7C7C7C] mb-3 md:mb-4 leading-relaxed">Share your code with friends and earn 100 points for each successful referral!</p>
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="flex-1 bg-[#F7F8FA] border border-dashed border-primary/40 rounded-lg md:rounded-xl px-4 py-2.5 md:py-3 text-center">
                                <span className="text-[15px] md:text-[18px] font-[800] text-primary tracking-[3px]">{referralCode}</span>
                            </div>
                            <button
                                onClick={handleCopy}
                                className="px-4 md:px-5 py-2.5 md:py-3 bg-primary rounded-lg md:rounded-xl active:scale-95 hover:bg-primary-dark transition-all"
                            >
                                {copied ? <Check size={18} className="text-white" /> : <Copy size={18} className="text-white" />}
                            </button>
                        </div>
                    </div>

                    {/* Transaction History */}
                    <div>
                        <h4 className="text-[14px] md:text-[16px] font-[700] text-[#181725] mb-2 md:mb-3 px-1">History</h4>
                        <div className="bg-white md:bg-gray-50/80 border border-gray-100 rounded-[12px] md:rounded-2xl overflow-hidden shadow-sm">
                            {rewardHistory.map((item, idx) => (
                                <div
                                    key={item.id}
                                    className={`flex items-center justify-between px-4 md:px-5 py-3.5 md:py-4 hover:bg-gray-50/50 transition-colors ${idx < rewardHistory.length - 1 ? 'border-b border-gray-50/80' : ''}`}
                                >
                                    <div>
                                        <p className="text-[13px] md:text-[14px] font-[500] text-[#181725] mb-0.5">{item.title}</p>
                                        <p className="text-[10px] md:text-[12px] text-[#7C7C7C] font-[500]">{item.date}</p>
                                    </div>
                                    <span className={`text-[14px] md:text-[16px] font-[700] ${item.type === 'earned' ? 'text-success' : 'text-red-400'}`}>
                                        {item.points}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
