// App constants
export const APP_NAME = 'Horeca1' as const;
export const APP_TAGLINE = "Bharat's Food & Grocery Distribution OS" as const;
export const APP_SUBTITLE = 'F&B Wholesale Made Easy' as const;
export const APP_DESCRIPTION = "Bharat's Food & Grocery Distribution OS. F&B Wholesale Made Easy." as const;

// Breakpoints matching Tailwind defaults
export const BREAKPOINTS = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    '2xl': 1536,
} as const;

// Animation durations (in ms)
export const ANIMATION = {
    fast: 150,
    normal: 300,
    slow: 500,
} as const;

// API endpoints (to be configured)
export const API = {
    BASE_URL: process.env.NEXT_PUBLIC_API_URL || '',
} as const;

// Pagination defaults
export const PAGINATION = {
    defaultPageSize: 20,
    maxPageSize: 100,
} as const;

// Image placeholders — generic frames (no stock food / face photos)
export const PLACEHOLDERS = {
    product: '/images/placeholders/no-product.svg',
    avatar: '/images/placeholders/no-avatar.svg',
    category: '/images/placeholders/no-category.svg',
    vendor: '/images/placeholders/no-vendor.svg',
} as const;
