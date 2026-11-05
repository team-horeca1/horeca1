'use client';

import { useSearchParams } from 'next/navigation';
import OrderWorkspace from '@/components/features/vendor/OrderWorkspace';
import VendorOrderList from './VendorOrderList';

export default function VendorOrdersPage() {
    const params = useSearchParams();
    if (params.get('view') === 'workspace') return <OrderWorkspace />;
    return <VendorOrderList />;
}
