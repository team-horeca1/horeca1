'use client';

import { useEffect, useState } from 'react';

/** True at lg+ (1024px). Starts false so the first paint is mobile-first cards. */
export function useAdminDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return isDesktop;
}
