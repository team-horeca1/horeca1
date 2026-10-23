import { Suspense } from 'react';
import RegisterPageInner from './RegisterPageInner';

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageInner />
    </Suspense>
  );
}
