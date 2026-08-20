'use client';

import React, { useState } from 'react';

export function NewsletterBanner() {
    const [email, setEmail] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Handle subscription
        console.log('Subscribing:', email);
        setEmail('');
    };

    return (
        <section className="w-full pt-1 pb-0 md:py-8 bg-white overflow-hidden">
            <div className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)]">
                <div
                    className="relative rounded-[24px] overflow-hidden min-h-[280px] md:min-h-[320px]"
                    style={{
                        background: 'linear-gradient(135deg, #1a2744 0%, #0f172a 100%)'
                    }}
                >
                    {/* Background Pattern */}
                    <div
                        className="absolute inset-0 opacity-[0.08]"
                        style={{
                            backgroundImage: 'url("/images/poster2/bg pattern.png")',
                            backgroundSize: 'cover',
                            backgroundPosition: 'center'
                        }}
                    />

                    {/* Content Container */}
                    <div className="relative z-10 flex flex-col md:flex-row items-end justify-between min-h-[280px] md:min-h-[320px] px-6 md:px-12 pb-10 md:pb-12">

                        {/* Left Content */}
                        <div className="flex flex-col max-w-lg text-center md:text-left w-full md:w-auto md:max-w-[460px] lg:max-w-lg pt-16 md:pt-24">
                            <h2 className="text-[28px] md:text-[36px] lg:text-[50px] font-bold text-white leading-tight mb-2">
                                Don&apos;t Miss Out on{' '}
                                <br className="md:hidden" />
                                Grocery Deals
                            </h2>
                            <p className="text-[13px] md:text-[15px] text-white/90 uppercase tracking-[2px] mb-8 font-semibold">
                                SIGN UP FOR THE UPDATE NEWSLETTER
                            </p>

                            {/* Email Form */}
                            <form onSubmit={handleSubmit} className="relative flex w-full max-w-[480px] mx-auto md:mx-0">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Your email address..."
                                    className="w-full pl-6 pr-32 py-4 rounded-full bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/30 text-[14px] backdrop-blur-sm"
                                    required
                                />
                                <button
                                    type="submit"
                                    className="absolute right-1.5 top-1.5 bottom-1.5 px-6 bg-[#ff6f00] hover:bg-[#e66300] text-white font-bold rounded-full transition-all text-[14px] whitespace-nowrap"
                                >
                                    Subscribe
                                </button>
                            </form>
                        </div>

                        {/* Right Image */}
                        <div className="hidden md:block absolute right-4 bottom-6 w-[180px] lg:w-[350px] xl:w-[420px]">
                            <img
                                src="/images/poster2/poster-right-img.png"
                                alt="Grocery basket"
                                className="w-full h-auto object-contain pointer-events-none"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
