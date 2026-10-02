# 🚀 HoReCa B2B E-commerce - Development Guidelines

> **IMPORTANT**: Read this file before making ANY changes to the codebase. These guidelines ensure performance, optimization, and code quality.

---

## 📋 Project Overview

**Project**: Horeca1 - Bharat's Food & Grocery Distribution OS (F&B Wholesale Made Easy)  
**Focus**: Speed, Performance, Clean Code, Mobile & Desktop UI  
**Stack**: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4

---

## ⚡ Performance First Philosophy

### 🎯 Rendering Strategy Decision Tree

```
┌─────────────────────────────────────────────────────────────────┐
│                    WHICH RENDERING TO USE?                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ❓ Does the page need SEO?                                      │
│     YES → Use Server Components (SSR/SSG)                        │
│     NO  → Continue ↓                                             │
│                                                                  │
│  ❓ Does data change frequently?                                 │
│     NO  → Use Static Generation (SSG) with revalidation          │
│     YES → Continue ↓                                             │
│                                                                  │
│  ❓ Is data user-specific or real-time?                          │
│     YES → Use Client Components with SWR/React Query             │
│     NO  → Use Server Components with ISR                         │
│                                                                  │
│  ❓ Needs interactivity (clicks, forms, animations)?             │
│     YES → Use Client Components ("use client")                   │
│     NO  → Use Server Components (default)                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 📦 Component Type Guidelines

| Component Type | When to Use | Example |
|---------------|-------------|---------|
| **Server Component** | Static content, SEO pages, data fetching | Product listings, Category pages |
| **Client Component** | Interactivity, forms, real-time updates | Cart, Search, Filters |
| **Hybrid** | Static shell + interactive parts | Product page with add-to-cart |

---

## 🔧 Code Optimization Rules

### ✅ ALWAYS DO:

1. **Lazy Load Components**
   ```tsx
   const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
     loading: () => <Skeleton />,
     ssr: false // if not needed on server
   });
   ```

2. **Use Image Optimization**
   ```tsx
   import Image from 'next/image';
   <Image 
     src="/product.jpg" 
     alt="Product"
     width={400} 
     height={300}
     priority={isAboveFold}
     placeholder="blur"
   />
   ```

3. **Memoize Expensive Computations**
   ```tsx
   const expensiveValue = useMemo(() => computeExpensive(data), [data]);
   const stableCallback = useCallback(() => handleClick(), [deps]);
   ```

4. **Use Proper Keys in Lists**
   ```tsx
   {items.map(item => <Item key={item.id} {...item} />)}
   ```

5. **Code Split Routes**
   - Each page in `/app` is automatically code-split
   - Use `loading.tsx` for Suspense boundaries

### ❌ NEVER DO:

1. ❌ Fetch data in Client Components if Server Components can do it
2. ❌ Use `useEffect` for data that can be fetched on server
3. ❌ Import large libraries without tree-shaking
4. ❌ Use inline functions in render without memoization
5. ❌ Store derived state (compute it instead)
6. ❌ Use `index` as key in dynamic lists

---

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── (marketing)/        # Public pages (home, about)
│   ├── (shop)/            # Shop pages (products, categories)
│   ├── (auth)/            # Auth pages (login, register)
│   ├── api/               # API routes
│   ├── layout.tsx         # Root layout
│   └── globals.css        # Global styles
│
├── components/
│   ├── ui/                # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   └── ...
│   ├── layout/            # Layout components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── Sidebar.tsx
│   └── features/          # Feature-specific components
│       ├── cart/
│       ├── products/
│       └── checkout/
│
├── lib/                   # Utilities and helpers
│   ├── utils.ts
│   ├── constants.ts
│   └── api.ts
│
├── hooks/                 # Custom React hooks
│   ├── useCart.ts
│   └── useProducts.ts
│
├── types/                 # TypeScript types
│   └── index.ts
│
└── styles/                # Additional styles
    └── components/
```

---

## 🎨 UI/UX Reference Reminders

### Design Principles:
- **Mobile-First**: Always design for mobile, then enhance for desktop
- **Fast Loading**: Skeleton screens, progressive loading
- **Visual Hierarchy**: Clear CTAs, proper spacing
- **Consistent**: Use design tokens and component library

### Required for Every UI Component:
1. ✅ Responsive (mobile + desktop)
2. ✅ Loading states
3. ✅ Error states
4. ✅ Empty states
5. ✅ Accessibility (ARIA labels, keyboard nav)
6. ✅ Animations (subtle, performant)

---

## 📐 Fluid Responsive Design (CRITICAL!)

> **GOAL**: The website must look **EXACTLY THE SAME** proportionally on ALL screen sizes - mobile, tablet, desktop. No broken layouts, no different-looking pages!

### 🎯 The Golden Rule: Use Fluid Units

**NEVER use fixed `px` values for:**
- Font sizes
- Padding/Margins
- Heights/Widths (unless for icons/specific elements)
- Gaps/Spacing

### ✅ ALWAYS USE These Units:

| Unit | When to Use | Example |
|------|-------------|---------|
| **`clamp()`** | Font sizes, spacing, widths | `clamp(1rem, 2.5vw, 2rem)` |
| **`vh`** | Full-height sections, hero | `height: 100vh` |
| **`vw`** | Width-based sizing | `width: 90vw` |
| **`%`** | Relative to parent | `width: 100%` |
| **`rem`** | Base unit for scaling | `padding: 1.5rem` |
| **`dvh`** | Dynamic viewport (mobile) | `min-height: 100dvh` |

### 📝 clamp() Syntax & Examples

```css
/* clamp(minimum, preferred, maximum) */

/* Font Sizes */
font-size: clamp(1rem, 2.5vw + 0.5rem, 2.5rem);      /* Headings */
font-size: clamp(0.875rem, 1.5vw + 0.25rem, 1rem);   /* Body text */
font-size: clamp(2rem, 5vw + 1rem, 4rem);            /* Hero title */

/* Spacing */
padding: clamp(1rem, 3vw, 3rem);                     /* Container padding */
gap: clamp(0.5rem, 2vw, 2rem);                       /* Grid/Flex gaps */
margin-bottom: clamp(2rem, 5vh, 5rem);               /* Section margins */

/* Widths */
max-width: clamp(300px, 90vw, 1200px);               /* Container width */
width: clamp(250px, 30vw, 400px);                    /* Cards */
```

### 🎨 Tailwind CSS Examples

```tsx
// ❌ BAD - Fixed sizes, looks different on screens
<h1 className="text-4xl md:text-5xl lg:text-6xl">Title</h1>
<div className="p-4 md:p-8 lg:p-12">Content</div>

// ✅ GOOD - Fluid sizes, looks SAME on all screens
<h1 className="text-[clamp(2rem,5vw+1rem,4rem)]">Title</h1>
<div className="p-[clamp(1rem,3vw,3rem)]">Content</div>

// ✅ GOOD - Full viewport sections
<section className="min-h-[100dvh] w-full">Hero</section>
<div className="h-[clamp(300px,50vh,600px)]">Feature</div>
```

### 📏 Standard Fluid Values (Use These!)

```css
/* Save in globals.css as CSS variables */
:root {
  /* Typography Scale */
  --text-xs: clamp(0.75rem, 1vw + 0.25rem, 0.875rem);
  --text-sm: clamp(0.875rem, 1.25vw + 0.25rem, 1rem);
  --text-base: clamp(1rem, 1.5vw + 0.25rem, 1.125rem);
  --text-lg: clamp(1.125rem, 2vw + 0.25rem, 1.5rem);
  --text-xl: clamp(1.25rem, 2.5vw + 0.25rem, 2rem);
  --text-2xl: clamp(1.5rem, 3vw + 0.5rem, 2.5rem);
  --text-3xl: clamp(2rem, 4vw + 0.5rem, 3rem);
  --text-4xl: clamp(2.5rem, 5vw + 1rem, 4rem);
  --text-hero: clamp(3rem, 8vw + 1rem, 6rem);

  /* Spacing Scale */
  --space-xs: clamp(0.25rem, 0.5vw, 0.5rem);
  --space-sm: clamp(0.5rem, 1vw, 1rem);
  --space-md: clamp(1rem, 2vw, 2rem);
  --space-lg: clamp(1.5rem, 3vw, 3rem);
  --space-xl: clamp(2rem, 4vw, 4rem);
  --space-2xl: clamp(3rem, 6vw, 6rem);
  --space-section: clamp(4rem, 10vh, 8rem);

  /* Container */
  --container-padding: clamp(1rem, 5vw, 3rem);
  --container-max: min(90vw, 1400px);
}
```

### 🔧 Implementation Pattern

```tsx
// Component with fluid design
export function HeroSection() {
  return (
    <section 
      className="
        min-h-[100dvh] 
        w-full 
        flex items-center justify-center
        px-[var(--container-padding)]
      "
    >
      <div className="max-w-[var(--container-max)] w-full">
        <h1 className="text-[var(--text-hero)] font-bold">
          Welcome
        </h1>
        <p className="text-[var(--text-lg)] mt-[var(--space-md)]">
          Description text here
        </p>
      </div>
    </section>
  );
}
```

### ❌ NEVER DO:

1. ❌ Use breakpoint-only responsive (`md:text-lg lg:text-xl`)
2. ❌ Use fixed pixel values for layout (`padding: 32px`)
3. ❌ Use different layouts for mobile vs desktop (keep same structure!)
4. ❌ Forget `dvh` for mobile viewport issues
5. ❌ Skip testing on multiple screen sizes

### ✅ ALWAYS DO:

1. ✅ Use `clamp()` for ALL typography
2. ✅ Use `clamp()` for ALL spacing
3. ✅ Use `vh/dvh` for full-height sections  
4. ✅ Use `vw` or `%` for widths
5. ✅ Test on 320px, 768px, 1024px, 1440px, 1920px
6. ✅ Keep the SAME visual hierarchy across all sizes

---

## 🔄 Before Every Commit Checklist

```
□ Is this the BEST rendering approach for this component?
□ Are heavy components lazy-loaded?
□ Are images optimized with next/image?
□ Is the code properly typed (no 'any')?
□ Are there unnecessary re-renders?
□ Is the component accessible?
□ Does it work on mobile AND desktop?
□ Are loading/error states handled?
□ Is the code clean and well-organized?
□ Could this be refactored to be simpler?
```

---

## 🚀 Performance Targets

| Metric | Target | Tools to Measure |
|--------|--------|-----------------|
| **LCP** | < 2.5s | Lighthouse, Web Vitals |
| **FID** | < 100ms | Chrome DevTools |
| **CLS** | < 0.1 | Lighthouse |
| **TTI** | < 3.5s | Lighthouse |
| **Bundle Size** | Minimize | next/bundle-analyzer |

---

## 🛠️ Common Patterns

### Data Fetching (Server Component)
```tsx
// app/products/page.tsx
async function ProductsPage() {
  const products = await getProducts(); // Server-side fetch
  return <ProductList products={products} />;
}
```

### Interactive Component (Client)
```tsx
// components/features/cart/AddToCart.tsx
'use client';

export function AddToCart({ productId }: { productId: string }) {
  const [isPending, startTransition] = useTransition();
  
  return (
    <button 
      onClick={() => startTransition(() => addToCart(productId))}
      disabled={isPending}
    >
      {isPending ? 'Adding...' : 'Add to Cart'}
    </button>
  );
}
```

### Hybrid Approach
```tsx
// Server Component wrapper
async function ProductPage({ id }: { id: string }) {
  const product = await getProduct(id); // SSR
  return (
    <div>
      <ProductDetails product={product} /> {/* Server */}
      <AddToCart productId={id} /> {/* Client */}
    </div>
  );
}
```

---

## 📝 When Working on This Project

**REMEMBER:**
1. 🏃 Speed is KING - every millisecond matters
2. 📱 Mobile-first - design for small screens first
3. 🧹 Clean code - refactor as you go
4. 🎯 Right rendering - use the decision tree above
5. 🔍 Test performance - use Lighthouse regularly
6. 📦 Bundle size - keep it small

---

*Last Updated: February 2026*
