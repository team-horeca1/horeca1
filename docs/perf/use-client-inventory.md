# use-client inventory (priority subset)

| File | Why client | Key imports | Push-down / isolation |
|------|------------|-------------|------------------------|
| `providers/AuthProvider.tsx` | SessionProvider | next-auth/react | Keep root |
| `providers/GoogleMapsProvider.tsx` | Maps JS | @googlemaps/js-api-loader | **Storefront only** |
| `context/CartContext.tsx` | cart state | dalClient | **Storefront only** |
| `context/AddressContext.tsx` | address state | Maps | **Storefront only** |
| `layout/Navbar.tsx` | UI | dalClient, overlays | **Storefront only** |
| `layout/Footer.tsx` | UI | lucide | **Storefront only** |
| `layout/StorefrontShell.tsx` | composes above | dynamic gates | Storefront layout |
| `auth/MandatoryAddressGate.tsx` | gate | AddNewAddressOverlay | dynamic ssr:false |
| `auth/OutletCompletionBanner.tsx` | banner | useBusinessAccountSwitcher | dynamic ssr:false |
| Homepage sections | interactive | various | below-fold dynamic() |
| `admin/layout.tsx` | portal shell | lucide, permissions | stays portal-only |
| `vendor/(dashboard)/layout.tsx` | portal shell | lucide, switcher | stays portal-only |

Full app ~330+ client files; mega vendor product pages deferred (not on `/` path).
