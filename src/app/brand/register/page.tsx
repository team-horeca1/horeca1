import { Suspense } from 'react';
import BrandRegisterClient from './BrandRegisterClient';

export default function BrandRegisterPage() {
  return (
    <Suspense fallback={null}>
      <BrandRegisterClient />
    </Suspense>
  );
}
