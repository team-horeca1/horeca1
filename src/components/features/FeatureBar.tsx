'use client';

import React from 'react';
import { Truck, ThumbsUp, ShieldCheck, Headphones } from 'lucide-react';

const FEATURES = [
    {
        icon: Truck,
        title: 'Free Shipping',
        description: 'Doorstep delivery on eligible bulk orders'
    },
    {
        icon: ThumbsUp,
        title: '100% Satisfaction',
        description: 'Quality checked produce from verified vendors'
    },
    {
        icon: ShieldCheck,
        title: 'Secure Payments',
        description: 'Razorpay checkout with invoice-ready GST bills'
    },
    {
        icon: Headphones,
        title: '24/7 Support',
        description: 'Help when you need it for orders and account'
    }
];

export function FeatureBar() {
    return (
        <section className="w-full py-4 md:py-8 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 lg:gap-6">
                    {FEATURES.map((feature, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-4 md:gap-4 bg-[#e9f7ef] rounded-[18px] md:rounded-[20px] p-5 md:p-6 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
                        >
                            <div className="w-14 h-14 md:w-14 md:h-14 bg-[#239a5d] rounded-full flex items-center justify-center shrink-0 shadow-sm">
                                <feature.icon className="w-7 h-7 md:w-7 md:h-7 text-white" />
                            </div>
                            <div className="flex flex-col">
                                <h3 className="text-[17px] md:text-[16px] font-bold text-[#1c2e24] mb-0.5">{feature.title}</h3>
                                <p className="text-[13px] md:text-[12px] text-text-muted font-medium">{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
