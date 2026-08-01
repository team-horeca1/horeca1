/**
 * Delivery-boy magic-link shell. Marketplace Navbar is also suppressed for
 * `/d/*` in Navbar.tsx so print/picklist UX stays clean.
 */
export default function DeliveryLinkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[#F4F7F6]">{children}</div>;
}
