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
        <section className="w-full py-6 md:py-10 bg-background overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-5">
                    {FEATURES.map((feature, idx) => (
                        <div
                            key={idx}
                            className="flex items-center gap-4 bg-white border border-divider rounded-xl p-4 md:p-5 shadow-cdl-1 hover:shadow-cdl-2 hover:border-primary/20 transition-all duration-200"
                        >
                            <div className="size-12 rounded-full bg-primary flex items-center justify-center shrink-0">
                                <feature.icon className="size-5 text-white" strokeWidth={1.75} />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <h3 className="text-[14px] md:text-[15px] font-bold text-text mb-0.5">{feature.title}</h3>
                                <p className="text-[12px] text-text-secondary leading-snug">{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
