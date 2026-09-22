import { describe, expect, it } from 'vitest';
import { selectDuplicateOutletIds } from '@/lib/outletWrites';

const sharedAddress = {
  addressLine: 'C-003, Station Complex, Sanpada Station, Navi Mumbai, Maharashtra 400705',
  pincode: '400705',
};

describe('selectDuplicateOutletIds', () => {
  it('deactivates a newer delivery branch at the same address', () => {
    const ids = selectDuplicateOutletIds(
      [
        { id: 'older', ...sharedAddress },
        { id: 'newer', ...sharedAddress },
      ],
      null,
    );
    expect(ids).toEqual(['newer']);
  });

  it('keeps each Online Store stock outlet even when the street address matches', () => {
    const storeOutlets = new Set(['dairy', 'foodline', 'bar-and-brew']);
    const ids = selectDuplicateOutletIds(
      [
        { id: 'dairy', ...sharedAddress },
        { id: 'bar-and-brew', ...sharedAddress },
        { id: 'foodline', ...sharedAddress },
      ],
      'davinci',
      storeOutlets,
    );
    expect(ids).toEqual([]);
  });

  it('still collapses a non-store clone onto the oldest branch', () => {
    const ids = selectDuplicateOutletIds(
      [
        { id: 'store', ...sharedAddress },
        { id: 'clone-a', ...sharedAddress },
        { id: 'clone-b', ...sharedAddress },
      ],
      null,
      new Set(['store']),
    );
    expect(ids).toEqual(['clone-b']);
  });
});
