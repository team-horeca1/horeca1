'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';

export function NewsletterBanner() {
    const [email, setEmail] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (email.trim()) {
            toast.success('Thank you for subscribing to Horeca1 Supply Alerts!');
            setEmail('');
        }
    };

    return (
        <section className="w-full pt-2 pb-6 md:py-8 bg-background overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-4 md:px-[var(--container-padding)]">
                <div className="relative rounded-2xl md:rounded-[24px] overflow-hidden min-h-[240px] md:min-h-[300px] shadow-cdl-2 bg-[linear-gradient(115deg,#2D0912_0%,#4A141F_38%,#6B1D2E_100%)]">
                    <div
                        className="absolute inset-0 pointer-events-none opacity-40"
                        aria-hidden
                        style={{
                            backgroundImage:
                                'radial-gradient(ellipse 70% 80% at 88% 70%, rgba(255,247,240,0.10), transparent 55%), radial-gradient(ellipse 45% 50% at 8% 20%, rgba(255,255,255,0.07), transparent 60%)',
                        }}
                    />
                    <svg
                        className="absolute inset-x-0 bottom-0 w-full h-[90px] text-white/5 pointer-events-none"
                        viewBox="0 0 1440 90"
                        preserveAspectRatio="none"
                        aria-hidden
                    >
                        <path
                            fill="currentColor"
                            d="M0,50 C240,90 480,10 720,40 C960,70 1200,20 1440,55 L1440,90 L0,90 Z"
                        />
                    </svg>

                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between min-h-[240px] md:min-h-[300px] px-6 md:px-12 lg:px-16 py-8 md:py-10 gap-6">
                        <div className="flex flex-col max-w-lg text-center md:text-left w-full md:w-auto">
                            <p className="text-[11px] md:text-[12px] text-white/75 uppercase tracking-[0.16em] mb-2 font-semibold">
                                Restaurant supply alerts
                            </p>
                            <h2 className="text-[24px] md:text-[34px] lg:text-[40px] font-bold text-white leading-[1.12] mb-3 text-balance">
                                Don&apos;t miss kitchen-ready deals
                            </h2>
                            <p className="text-[13px] md:text-[15px] text-white/80 mb-6 max-w-md">
                                Weekly price drops on staples, oils, dairy and wholesale essentials — straight to your inbox.
                            </p>

                            <form onSubmit={handleSubmit} className="relative flex w-full max-w-[460px] mx-auto md:mx-0">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Your business email..."
                                    className="w-full min-h-12 pl-5 pr-32 rounded-full bg-[#1C1C1C]/45 border border-white/15 text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-white/35 text-[13px] backdrop-blur-sm"
                                    required
                                />
                                <button
                                    type="submit"
                                    className="absolute right-1 top-1 bottom-1 min-h-10 px-6 bg-white hover:bg-ivory text-primary font-semibold rounded-full transition-all text-[13px] whitespace-nowrap active:scale-95"
                                >
                                    Subscribe
                                </button>
                            </form>
                        </div>

                        <div className="hidden md:block relative w-[240px] lg:w-[340px] h-[220px] lg:h-[260px] shrink-0">
                            <img
                                src="/images/hero-right1.png"
                                alt=""
                                className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-2xl"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
