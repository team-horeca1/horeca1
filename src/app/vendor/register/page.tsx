import { Suspense } from 'react';
import VendorRegisterClient from './VendorRegisterClient';

export default function VendorRegisterPage() {
  return (
    <Suspense fallback={null}>
      <VendorRegisterClient />
    </Suspense>
  );
}
