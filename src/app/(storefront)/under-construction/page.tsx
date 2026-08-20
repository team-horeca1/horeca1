'use client';

import React from 'react';
import Link from 'next/link';
import { Construction, Home, MessageCircle, Mail } from 'lucide-react';

export default function UnderConstructionPage() {
    return (
        <div className="flex-1 min-h-[70vh] flex items-center justify-center p-6 py-20 bg-[#F7F8FA]">
            <div className="max-w-[600px] w-full bg-white rounded-[40px] p-8 md:p-16 text-center shadow-[0_20px_60px_rgba(0,0,0,0.05)] border border-gray-100 relative overflow-hidden">
                {/* Background Decorative Elements */}
                <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#53B175]/5 rounded-full blur-3xl" />
                <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl" />

                <div className="relative z-10">
                    {/* Icon Container */}
                    <div className="w-24 h-24 md:w-32 md:h-32 bg-[#53B175]/10 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
                        <Construction size={48} className="text-[#53B175] md:size-[64px]" />
                    </div>

                    {/* Text Content */}
                    <h1 className="text-[28px] md:text-[40px] font-black text-[#181725] mb-4 leading-tight">
                        Under Construction
                    </h1>
                    <p className="text-[14px] md:text-[16px] text-gray-500 font-medium mb-10 leading-relaxed max-w-[400px] mx-auto">
                        We&apos;re currently working hard to bring you something amazing. This page will be live very soon!
                    </p>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
                        <Link
                            href="/"
                            className="flex items-center gap-2 px-8 py-4 bg-[#53B175] text-white rounded-2xl font-bold hover:bg-[#48a068] transition-all shadow-lg shadow-[#53B175]/20 active:scale-95 w-full sm:w-auto"
                        >
                            <Home size={20} />
                            Back to Home
                        </Link>
                        <Link
                            href="/vendors"
                            className="flex items-center gap-2 px-8 py-4 bg-white text-[#181725] border-2 border-gray-100 rounded-2xl font-bold hover:bg-gray-50 transition-all active:scale-95 w-full sm:w-auto"
                        >
                            Browse Vendors
                        </Link>
                    </div>

                    {/* Contact Info */}
                    <div className="mt-16 pt-8 border-t border-gray-50 flex flex-col md:flex-row items-center justify-center gap-8">
                        <div className="flex items-center gap-3 text-gray-400">
                            <Mail size={18} />
                            <span className="text-[13px] font-semibold">support@horeca1.com</span>
                        </div>
                        {/* <div className="flex items-center gap-3 text-gray-400">
                            <MessageCircle size={18} />
                            <span className="text-[13px] font-semibold">Live Chat Available</span>
                        </div> */}
                    </div>
                </div>
            </div>
        </div>
    );
}
