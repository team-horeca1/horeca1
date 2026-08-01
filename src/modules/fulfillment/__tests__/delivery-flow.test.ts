import { describe, expect, it } from 'vitest';
import {
  DELIVERY_FAIL_REASONS,
  DELIVERY_TO_ORDER_STATUS,
  DELIVERY_UI_TO_DB_STATUSES,
  DELIVERY_VENDOR_ACTIONS,
  dbStatusesForDeliveryUi,
  formatDeliveryFailReason,
  toDeliveryUiStatus,
} from '../delivery.scope';
import {
  fulfilmentActionSchema,
  fulfilmentBulkActionSchema,
} from '../fulfillment.validator';
import {
  deliveryLinkCompleteSchema,
  deliveryLinkFailSchema,
} from '../delivery-link.validator';

describe('delivery.scope — UI ↔ DB status mapping', () => {
  it('maps every accepted/packed/dispatched/failed/delivered DB status', () => {
    expect(toDeliveryUiStatus('awaiting_picking')).toBe('accepted');
    expect(toDeliveryUiStatus('picking')).toBe('accepted');
    expect(toDeliveryUiStatus('awaiting_packing')).toBe('accepted');
    expect(toDeliveryUiStatus('packed')).toBe('packed');
    expect(toDeliveryUiStatus('ready_for_dispatch')).toBe('packed');
    expect(toDeliveryUiStatus('out_for_delivery')).toBe('dispatched');
    expect(toDeliveryUiStatus('failed_delivery')).toBe('delivery_attempt_failed');
    expect(toDeliveryUiStatus('delivered')).toBe('delivered');
  });

  it('expands UI filters to DB statuses', () => {
    expect(dbStatusesForDeliveryUi('accepted')).toEqual([
      ...DELIVERY_UI_TO_DB_STATUSES.accepted,
    ]);
    expect(dbStatusesForDeliveryUi('dispatched')).toEqual(['out_for_delivery']);
  });

  it('keeps failed attempts as shipped on Order (never complete)', () => {
    expect(DELIVERY_TO_ORDER_STATUS.delivery_attempt_failed).toBe('shipped');
    expect(DELIVERY_TO_ORDER_STATUS.delivered).toBe('delivered');
    expect(DELIVERY_TO_ORDER_STATUS.packed).toBe('ready_for_dispatch');
    expect(DELIVERY_TO_ORDER_STATUS.dispatched).toBe('shipped');
  });

  it('formats fail reasons including Other free text', () => {
    expect(formatDeliveryFailReason('customer_not_available')).toBe('Customer Not Available');
    expect(formatDeliveryFailReason('other', 'Gate locked')).toBe('Other: Gate locked');
    expect(formatDeliveryFailReason('other', '  ')).toBe('Other');
    expect(DELIVERY_FAIL_REASONS).toContain('vehicle_breakdown');
  });

  it('exposes slim vendor actions only', () => {
    expect(DELIVERY_VENDOR_ACTIONS).toEqual([
      'mark_packed',
      'assign_and_dispatch',
      'record_failed_delivery',
      'reschedule_dispatch',
      'override_mark_delivered',
      'mark_delivered',
    ]);
  });
});

describe('delivery validators — accept→pack→assign→OTP/fail/override shapes', () => {
  it('accepts mark_packed then assign_and_dispatch payload', () => {
    expect(fulfilmentActionSchema.parse({ action: 'mark_packed' })).toEqual({
      action: 'mark_packed',
    });
    const assign = fulfilmentActionSchema.parse({
      action: 'assign_and_dispatch',
      deliveryBoyName: 'Ravi',
      deliveryBoyPhone: '9876543210',
    });
    expect(assign.action).toBe('assign_and_dispatch');
  });

  it('accepts bulk assign_and_dispatch', () => {
    const bulk = fulfilmentBulkActionSchema.parse({
      action: 'assign_and_dispatch',
      fulfilmentIds: ['11111111-1111-4111-8111-111111111111'],
      deliveryBoyName: 'Asha',
      deliveryBoyPhone: '9123456780',
    });
    expect(bulk.fulfilmentIds).toHaveLength(1);
  });

  it('accepts fail / override / OTP complete payloads', () => {
    expect(
      fulfilmentActionSchema.parse({
        action: 'record_failed_delivery',
        failedReason: 'wrong_address',
      }).action,
    ).toBe('record_failed_delivery');

    expect(
      fulfilmentActionSchema.parse({
        action: 'override_mark_delivered',
        note: 'Confirmed on phone',
      }).action,
    ).toBe('override_mark_delivered');

    expect(
      deliveryLinkCompleteSchema.parse({ otp: '1234' }),
    ).toEqual({ otp: '1234' });

    expect(() => deliveryLinkCompleteSchema.parse({ otp: '12345' })).toThrow();
    expect(() => deliveryLinkCompleteSchema.parse({ otp: '12a4' })).toThrow();

    expect(
      deliveryLinkFailSchema.parse({
        failedReason: 'other',
        failedReasonOther: 'Gate locked',
      }).failedReason,
    ).toBe('other');
  });

  it('rejects unknown vendor actions and invalid fail reasons', () => {
    expect(() =>
      fulfilmentActionSchema.parse({ action: 'start_picking' }),
    ).toThrow();
    expect(() =>
      deliveryLinkFailSchema.parse({ failedReason: 'lost_in_space' }),
    ).toThrow();
  });
});
