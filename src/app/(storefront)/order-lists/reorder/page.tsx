'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronLeft, ShoppingCart, Zap, Plus, Minus, Store, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '@/context/CartContext';
import { dal } from '@/lib/dal';
import type { VendorProduct } from '@/types';

interface ReorderItem {
    productId: string;
    productName: string;
    lastOrderedQty: number;
    currentQty: number;
    unitPrice: number;
    image: string;
    packSize: string;
    vendorId: string;
}

export default function ReorderPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { addToCart, groups } = useCart();
    const [items, setItems] = useState<ReorderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<VendorProduct[]>([]);
    const vendorId = searchParams?.get('vendorId') || '';
    const vendorName = searchParams?.get('vendorName') || 'Vendor';

    useEffect(() => {
        const load = async () => {
            try {
                // Parse items from URL
                const itemsParam = searchParams?.get('items');
                if (!itemsParam) { setLoading(false); return; }

                const rawItems = JSON.parse(decodeURIComponent(itemsParam)) as Array<{
                    productId: string; productName: string; quantity: number;
                    unitPrice: number; image: string; packSize: string;
                }>;

                // Fetch vendor products to get minOrderQuantity info
                if (vendorId) {
                    const p = await dal.vendors.getProducts(vendorId, { limit: 200 });
                    setProducts(p.products);
                }

                setItems(rawItems.map(item => ({
                    productId: item.productId,
                    productName: item.productName,
                    lastOrderedQty: item.quantity,
                    currentQty: 0,
                    unitPrice: item.unitPrice,
                    image: item.image || '/images/recom-product/product-img10.png',
                    packSize: item.packSize || '',
                    vendorId,
                })));
            } catch (e) {
                console.error('Failed to load reorder items', e);
                toast.error('Failed to load items');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [searchParams]);

    const handleQtyChange = (productId: string, delta: number) => {
        setItems(prev => prev.map(item => {
            if (item.productId !== productId) return item;
            const newQty = Math.max(0, item.currentQty + delta);
            return { ...item, currentQty: newQty };
        }));
    };

    const handleRefillLast = (productId: string) => {
        setItems(prev => prev.map(item => {
            if (item.productId !== productId) return item;
            return { ...item, currentQty: item.lastOrderedQty };
        }));
    };

    const handleAddToCart = () => {
        const itemsToAdd = items.filter(i => i.currentQty > 0);
        if (itemsToAdd.length === 0) {
            toast.error('Select at least one item quantity');
            return;
        }
        let added = 0;
        for (const item of itemsToAdd) {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                addToCart(product, item.currentQty);
                added++;
            }
        }
        if (added > 0) {
            toast.success(`${added} items added to cart`);
            router.push('/cart');
        } else {
            toast.error('Could not add items');
        }
    };

    const handlePayNow = async () => {
        // Quick buy: add to cart then navigate to checkout
        const itemsToAdd = items.filter(i => i.currentQty > 0);
        if (itemsToAdd.length === 0) {
            toast.error('Select at least one item quantity');
            return;
        }
        let added = 0;
        for (const item of itemsToAdd) {
            const product = products.find(p => p.id === item.productId);
            if (product) {
                addToCart(product, item.currentQty);
                added++;
            }
        }
        if (added > 0) {
            toast.success(`${added} items added`);
            router.push(`/checkout?vendor=${vendorId}`);
        } else {
            toast.error('Could not add items');
        }
    };

    const selectedCount = items.filter(i => i.currentQty > 0).length;
    const totalAmount = items.reduce((sum, i) => sum + i.currentQty * i.unitPrice, 0);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <Loader2 size={32} className="animate-spin text-[#53B175]" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F2F3F2] flex flex-col pb-24">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-4">
                    <button onClick={() => router.back()} className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-700 mb-2">
                        <ChevronLeft size={16} /> Back
                    </button>
                    <div className="flex items-center gap-3">
                        <Store size={22} className="text-[#53B175]" />
                        <div>
                            <h1 className="text-[20px] font-black text-[#181725]">Reorder from {vendorName}</h1>
                            <p className="text-[12px] text-gray-400 font-medium">{items.length} items · Set quantities and add to cart</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Items list */}
            <div className="flex-1 max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] py-4 w-full">
                <div className="space-y-3">
                    {items.map((item) => (
                        <div key={item.productId} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
                            {/* Product image */}
                            <div className="w-14 h-14 rounded-xl bg-gray-50 overflow-hidden shrink-0 relative">
                                <Image src={item.image} alt={item.productName} fill className="object-cover" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-black text-[#181725] line-clamp-2 leading-snug">{item.productName}</p>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[11px] font-black text-[#53B175]">₹{item.unitPrice}/unit</span>
                                    <span className="text-[10px] text-gray-400 font-medium">
                                        Last ordered: {item.lastOrderedQty} units
                                    </span>
                                </div>
                                <button onClick={() => handleRefillLast(item.productId)}
                                    className="text-[10px] font-black text-[#53B175] hover:text-[#489d67] transition-colors mt-0.5">
                                    Re-fill Last Qty
                                </button>
                            </div>

                            {/* Qty stepper */}
                            <div className="flex items-center gap-2 shrink-0">
                                <button onClick={() => handleQtyChange(item.productId, -1)} disabled={item.currentQty === 0}
                                    className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:border-red-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                                    <Minus size={14} strokeWidth={3} />
                                </button>
                                <span className="text-[16px] font-black text-[#181725] w-8 text-center tabular-nums">{item.currentQty}</span>
                                <button onClick={() => handleQtyChange(item.productId, 1)}
                                    className="w-8 h-8 rounded-lg bg-[#53B175]/10 border border-[#53B175]/20 flex items-center justify-center text-[#53B175] hover:bg-[#53B175]/20 transition-colors">
                                    <Plus size={14} strokeWidth={3} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Fixed bottom bar */}
            <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 bg-gradient-to-t from-white via-white to-transparent z-50">
                <div className="max-w-[var(--container-max)] mx-auto flex items-center gap-3">
                    <button
                        onClick={handleAddToCart}
                        disabled={selectedCount === 0}
                        className="flex-1 bg-[#53B175] text-white py-4 rounded-2xl font-black text-[15px] shadow-lg shadow-green-200/50 hover:bg-[#489d67] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <ShoppingCart size={18} />
                        Add {selectedCount > 0 ? `${selectedCount} items` : 'to Cart'}
                    </button>
                    <button
                        onClick={handlePayNow}
                        disabled={selectedCount === 0}
                        className="flex-1 bg-[#181725] text-white py-4 rounded-2xl font-black text-[15px] shadow-lg hover:bg-[#2a2a3a] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Zap size={18} />
                        Pay Now
                        {totalAmount > 0 && <span className="text-[11px] opacity-80">₹{totalAmount.toLocaleString('en-IN')}</span>}
                    </button>
                </div>
            </div>
        </div>
    );
}
