import { SupplierPayableDetail } from '@/components/features/admin/finance/SupplierPayableDetail';

export default async function SupplierPayableVendorPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = await params;
  return <SupplierPayableDetail vendorId={vendorId} />;
}
