/**
 * Return-pickup magic-link shell. Marketplace Navbar should also suppress `/r/*`
 * (same as `/d/*`) so the boy page stays clean.
 */
export default function ReturnPickupLinkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[#F4F7F6]">{children}</div>;
}
