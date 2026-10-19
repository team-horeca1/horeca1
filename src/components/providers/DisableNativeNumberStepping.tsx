'use client';

import { useEffect } from 'react';

/**
 * `type="number"` still steps the value on ArrowUp/ArrowDown and the mouse
 * wheel after the spinner buttons are hidden. Block that for every number
 * field — product sheets, import grids, and the rest.
 */
export function DisableNativeNumberStepping() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'number') {
        event.preventDefault();
      }
    };

    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement &&
        target.type === 'number' &&
        document.activeElement === target
      ) {
        target.blur();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('wheel', onWheel, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('wheel', onWheel, true);
    };
  }, []);

  return null;
}
