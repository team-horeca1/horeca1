'use client';

import React from 'react';
import Link from 'next/link';
import {
    MapPin,
    Phone,
    Mail,
    Facebook,
    Twitter,
    Instagram,
    Linkedin,
    PhoneCall,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/** Only ship links that resolve to real storefront routes (no dead /under-construction stubs). */
const FOOTER_LINKS: Record<string, Array<{ label: string; href: string }>> = {
    information: [
        { label: 'Become a Supplier', href: '/vendor/register' },
        { label: 'Our Suppliers', href: '/vendors' },
        { label: 'Brands', href: '/brands' },
        { label: 'Deals', href: '/deals' },
        { label: 'Collections', href: '/collections' },
    ],
    support: [
        { label: 'Help Center', href: 'mailto:sales@horeca1.com' },
        { label: 'Contact Us', href: 'mailto:sales@horeca1.com' },
        { label: 'Order Lists', href: '/order-lists' },
    ],
    account: [
        { label: 'My Account', href: '/profile' },
        { label: 'Order History', href: '/orders' },
        { label: 'Shopping Cart', href: '/cart' },
        { label: 'Wallet', href: '/rewards' },
        { label: 'DiSCCO Credit', href: '/wallet' },
    ],
    groceries: [
        { label: 'Fresh Produce', href: '/category/fresh-produce' },
        { label: 'Dairy & Eggs', href: '/category/dairy-cheese-eggs' },
        { label: 'Pantry Staples', href: '/category/pantry-staples' },
        { label: 'Meat & Seafood', href: '/category/meat-poultry-seafood' },
        { label: 'Beverages', href: '/category/beverages-drinks' },
        { label: 'Bakery & Frozen', href: '/category/bakery-frozen' },
    ],
};

const SOCIAL_LINKS = [
    { icon: Facebook, href: '#' },
    { icon: Twitter, href: '#' },
    { icon: Instagram, href: '#' },
    { icon: Linkedin, href: '#' }
];

export function Footer() {
    const pathname = usePathname();

    if (pathname !== '/') return null;

    return (
        <footer className={cn(
            "w-full bg-white relative overflow-hidden pb-20 lg:pb-0"
        )}>
            <div className="max-w-[var(--container-max)] mx-auto px-5 md:px-[var(--container-padding)] relative z-10">
                {/* Main Footer Section */}
                <div className=" pb-8 md:py-16 flex flex-col lg:flex-row justify-between gap-10 lg:gap-0">

                    {/* Column 1: Logo & Contact */}
                    <div className="w-full lg:w-[28%] space-y-6">
                        <Link href="/" className="inline-block">
                            <img src="/Horeca1.png" alt="Horeca1" className="h-8 md:h-10 w-auto object-contain" />
                        </Link>
                        <p className="text-[14px] text-[#7C7C7C] leading-[1.6] max-w-[320px]">
                            HoReCa Hub — bulk food and supplies for restaurants, hotels, and caterers.
                        </p>
                        <ul className="space-y-5 pt-2">
                            <li className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                                    <MapPin size={18} className="text-white" />
                                </div>
                                <span className="text-[14px] text-[#181725] font-medium leading-[1.4] pt-1">
                                    C-003, Sanpada Station Complex,<br />
                                    Navi Mumbai, Maharashtra 400705
                                </span>
                            </li>
                            <li className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                                    <Phone size={18} className="text-white" />
                                </div>
                                <span className="text-[14px] text-[#181725] font-medium">
                                    7710920002
                                </span>
                            </li>
                            <li className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                                    <Mail size={18} className="text-white" />
                                </div>
                                <span className="text-[14px] text-[#181725] font-medium">
                                    sales@horeca1.com
                                </span>
                            </li>
                        </ul>
                    </div>

                    {/* Links Columns - 2x2 Grid on Mobile, 4 columns on Tablet, row on Desktop */}
                    <div className="w-full lg:flex-1 grid grid-cols-2 md:grid-cols-4 lg:flex lg:flex-row lg:justify-around gap-x-4 gap-y-10 lg:gap-4 lg:px-6">
                        <div className="min-w-fit">
                            <h4 className="text-[16px] md:text-[18px] font-bold text-[#181725] mb-5">Information</h4>
                            <ul className="space-y-4">
                                {FOOTER_LINKS.information.map((link) => (
                                    <li key={link.href + link.label}>
                                        <Link href={link.href} className="text-[14px] text-[#7C7C7C] hover:text-primary transition-colors">
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="min-w-fit">
                            <h4 className="text-[16px] md:text-[18px] font-bold text-[#181725] mb-5">Customer Support</h4>
                            <ul className="space-y-4">
                                <li>
                                    <a
                                        href="tel:7710920002"
                                        className="flex items-center gap-2 text-[14px] text-primary font-semibold hover:text-primary-dark transition-colors"
                                    >
                                        <PhoneCall size={15} />
                                        7710920002
                                    </a>
                                </li>
                                {FOOTER_LINKS.support.map((link) => (
                                    <li key={link.href + link.label}>
                                        {link.href.startsWith('mailto:') ? (
                                            <a href={link.href} className="text-[14px] text-[#7C7C7C] hover:text-primary transition-colors">
                                                {link.label}
                                            </a>
                                        ) : (
                                            <Link href={link.href} className="text-[14px] text-[#7C7C7C] hover:text-primary transition-colors">
                                                {link.label}
                                            </Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="min-w-fit">
                            <h4 className="text-[16px] md:text-[18px] font-bold text-[#181725] mb-5">My Account</h4>
                            <ul className="space-y-4">
                                {FOOTER_LINKS.account.map((link) => (
                                    <li key={link.href + link.label}>
                                        <Link href={link.href} className="text-[14px] text-[#7C7C7C] hover:text-primary transition-colors">
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className="min-w-fit">
                            <h4 className="text-[16px] md:text-[18px] font-bold text-[#181725] mb-5">Daily Groceries</h4>
                            <ul className="space-y-4">
                                {FOOTER_LINKS.groceries.map((link) => (
                                    <li key={link.href + link.label}>
                                        <Link href={link.href} className="text-[14px] text-[#7C7C7C] hover:text-primary transition-colors">
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="py-6 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6">
                    <p className="text-[14px] text-[#7C7C7C] text-center md:text-left">
                        Horeca1 eCommerce © 2026. All Rights Reserved
                    </p>
                    <div className="flex items-center gap-4">
                        {SOCIAL_LINKS.map((social, idx) => (
                            <Link
                                key={idx}
                                href={social.href}
                                className="size-11 rounded-full bg-primary-light text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all"
                            >
                                <social.icon size={18} />
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </footer>
    );
}
