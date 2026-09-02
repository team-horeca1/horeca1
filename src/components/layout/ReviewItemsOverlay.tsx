'use client';

import React from 'react';
import { ArrowLeft, Search, Plus, Minus, ReceiptText, TicketPercent, ChevronRight, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReviewItemsOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

const ITEMS = [
    { id: 1, name: 'Bell Pepper Red', weight: '200 gms', price: 1.10, originalPrice: 7.99, quantity: 1 },
    { id: 2, name: 'Banana Madras', weight: '6 pcs', price: 3.99, originalPrice: 7.99, quantity: 1 },
    { id: 3, name: 'Amul Tond Milk', weight: '500 ml', price: 2.22, originalPrice: 7.99, quantity: 2 },
    { id: 4, name: 'Ness Coffee Jar', weight: '100 gms', price: 5.00, originalPrice: 7.99, quantity: 1 },
    { id: 5, name: 'Gemini Sunflower Oil', weight: '1 litre', price: 9.99, originalPrice: 7.99, quantity: 1 },
];

export function ReviewItemsOverlay({ isOpen, onClose }: ReviewItemsOverlayProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[11000] bg-white flex flex-col md:hidden animate-in fade-in slide-in-from-right duration-300">
            {/* Persistent Top Green Line */}
            <div className="w-full h-2 bg-primary shrink-0 sticky top-0 z-[10002]" />

            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-white sticky top-2 z-10 border-b border-gray-50/50">
                <button onClick={onClose} className="p-1 -ml-1">
                    <ArrowLeft size={24} className="text-gray-700" />
                </button>
                <h2 className="text-xl font-bold text-gray-800">Review items</h2>
                <button className="p-1 -mr-1">
                    <Search size={22} className="text-gray-700" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32 space-y-4">
                {/* Items Card */}
                <div className="bg-white border border-gray-100 rounded-lg shadow-sm overflow-hidden divide-y divide-gray-50/80">
                    {ITEMS.map((item) => (
                        <div key={item.id} className="p-4 flex items-center justify-between group">
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                <div className="mt-2 w-2 h-2 rounded-full bg-primary shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-[15px] font-bold text-gray-800 leading-tight">{item.name}</h3>
                                    <p className="text-[11px] text-gray-400 font-medium mt-0.5">{item.weight}</p>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                                <div className="flex items-center gap-4 bg-white border border-gray-100 rounded-full px-2 py-0.5 shadow-sm scale-90">
                                    <button className="text-gray-400 p-1"><Minus size={14} /></button>
                                    <span className="text-[13px] font-bold text-gray-800">{item.quantity}</span>
                                    <button className="text-primary p-1"><Plus size={14} /></button>
                                </div>
                                <div className="text-right">
                                    <div className="text-[13px] font-bold text-gray-800">$ {item.price.toFixed(2)} {item.weight.split(' ')[1]}</div>
                                    <div className="text-[10px] text-gray-400 line-through">$ {item.originalPrice.toFixed(2)} {item.weight.split(' ')[1]}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Coupon Code */}
                <div className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-lg shadow-sm active:scale-[0.98] transition-transform cursor-pointer">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full border border-gray-50 flex items-center justify-center text-primary">
                            <TicketPercent size={24} />
                        </div>
                        <div className="border-l border-gray-100 pl-4">
                            <div className="flex items-center gap-2">
                                <h4 className="text-[15px] font-bold text-gray-800">Add a coupan code</h4>
                                <span className="bg-primary text-white text-[8px] px-1.5 py-0.5 rounded font-black uppercase">New</span>
                            </div>
                            <p className="text-[10px] text-gray-400 font-medium">* apply coupan code to get discount</p>
                        </div>
                    </div>
                    <ChevronRight size={20} className="text-gray-400" />
                </div>

                {/* Bill Summary */}
                <div className="bg-white border border-gray-100 rounded-lg shadow-sm p-4">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-10 h-10 rounded-lg border border-gray-50 flex items-center justify-center text-gray-400">
                            <ReceiptText size={24} />
                        </div>
                        <div className="border-l border-gray-100 pl-4">
                            <h4 className="text-[15px] font-bold text-gray-800">Bill Summary</h4>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-[13px] font-bold text-gray-500">
                            <span>Item Total</span>
                            <span>$ 22.3</span>
                        </div>
                        <div className="flex justify-between items-center text-[13px] font-bold text-gray-500">
                            <span>Delivery Fee</span>
                            <span>$ 2.99</span>
                        </div>
                        <div className="flex justify-between items-center text-[13px] font-bold text-gray-500 pb-4">
                            <span>Handling Fee</span>
                            <span>$ 1.99</span>
                        </div>
                        <div className="pt-4 border-t border-dashed border-gray-200">
                            <div className="flex justify-between items-end">
                                <span className="text-[16px] font-black text-gray-800 uppercase tracking-tight">To Pay</span>
                                <div className="text-right">
                                    <div className="text-[20px] font-black text-gray-800">$ 27.27</div>
                                    <div className="text-[12px] text-gray-400 line-through font-bold">$ 39.95</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Savings Banner */}
                <div className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                    <span className="text-[13px] font-bold text-gray-700">Saving on this order</span>
                    <span className="bg-primary text-white text-[15px] px-3 py-1 rounded-md font-black">$ 12.68</span>
                </div>
            </div>

            {/* Bottom Button */}
            <div className="p-4 bg-white border-t border-gray-50 sticky bottom-0">
                <button className="w-full bg-[#5cb85c] hover:bg-[#4cae4c] text-white font-black py-4 rounded-lg shadow-lg active:scale-[0.98] transition-all text-xl">
                    Proceed to pay
                </button>
            </div>
        </div>
    );
}
