/**
 * Payout magic-link shell. Marketplace Navbar is also suppressed for `/payout/*`.
 */
export default function PayoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-[#F4F7F6]">{children}</div>;
}
