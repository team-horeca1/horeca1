'use client';

/**
 * ProductImportModal (admin) — thin wrapper over the shared ProductImportModal,
 * pre-configured for the admin portal: shows a vendor selector so an admin can
 * import on behalf of any vendor (or catalog-level with none). The UI/logic
 * lives in features/shared/ProductImportModal so admin and vendor imports can
 * never drift apart.
 */

import SharedProductImportModal from '@/components/features/shared/ProductImportModal';

interface VendorOption { id: string; businessName: string; displayName?: string | null }

interface Props {
  open: boolean;
  onClose: () => void;
  vendors: VendorOption[];
  onComplete: () => void;
}

export default function ProductImportModal({ open, onClose, vendors, onComplete }: Props) {
  return (
    <SharedProductImportModal
      open={open}
      onClose={onClose}
      onComplete={onComplete}
      config={{
        importEndpoint: '/api/v1/admin/products/import',
        templateUrl: '/api/v1/admin/products/export?template=true&format=xlsx',
        productPatchBase: '/api/v1/admin/products',
        categoriesEndpoint: '/api/v1/admin/categories',
        vendors,
      }}
    />
  );
}
