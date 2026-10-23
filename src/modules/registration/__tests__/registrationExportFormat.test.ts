import { describe, expect, it } from 'vitest';
import {
  affiliateDetailHref,
  registrationExportCsv,
  registrationExportHeaders,
  registrationExportPermission,
  spreadsheetSafe,
  summarizeAffiliateCodes,
  type RegistrationExportRow,
} from '@/modules/registration/registrationExportFormat';

function row(overrides: Partial<RegistrationExportRow> = {}): RegistrationExportRow {
  return {
    accountId: 'acct-1',
    businessName: 'Test Kitchen',
    mobile: '9000000001',
    email: 'kitchen@example.com',
    createdAt: new Date('2026-10-23T08:00:00.000Z'),
    gstin: '27ABCDE1234F1Z5',
    fssai: null,
    liveProductCount: null,
    referralCode: 'A-0001',
    ...overrides,
  };
}

describe('registration export', () => {
  it('includes Referral Code and leaves a missing code blank', () => {
    const csv = registrationExportCsv('customer', [
      row(),
      row({ accountId: 'acct-2', referralCode: null, businessName: 'No Code' }),
    ]);
    expect(registrationExportHeaders('customer')).toContain('Referral Code');
    expect(csv.split('\n')[0]).toContain('"Referral Code"');
    expect(csv).toContain('"A-0001"');
    expect(csv).toContain('"No Code"');
    const blankLine = csv.split('\n')[2];
    expect(blankLine?.endsWith('""')).toBe(true);
    expect(blankLine).not.toContain('A-0001');
  });

  it('keeps supplier columns and the live product count', () => {
    const headers = registrationExportHeaders('vendor');
    expect(headers).toEqual([
      'Account ID',
      'Business Name',
      'Mobile Number',
      'Email',
      'Created At',
      'GSTIN',
      'FSSAI',
      'Live Product Count',
      'Referral Code',
    ]);
    const csv = registrationExportCsv('vendor', [row({ liveProductCount: 4, fssai: '12345678901234' })]);
    expect(csv).toContain('"4"');
    expect(csv).toContain('"12345678901234"');
    expect(csv).toContain('"A-0001"');
    expect(registrationExportHeaders('customer')).not.toContain('Live Product Count');
  });

  it('neutralises spreadsheet formulas', () => {
    expect(spreadsheetSafe('=HYPERLINK("http://evil")')).toBe(`'=HYPERLINK("http://evil")`);
    expect(spreadsheetSafe('+cmd')).toBe("'+cmd");
    const csv = registrationExportCsv('brand', [row({ businessName: '=cmd', liveProductCount: 0, referralCode: null })]);
    expect(csv).toContain(`"'=cmd"`);
    expect(csv).not.toContain('"=cmd"');
  });

  it('counts customers, suppliers, and brands per code', () => {
    const summary = summarizeAffiliateCodes([
      { referralCode: 'A-0005', accountType: 'customer' },
      { referralCode: 'A-0005', accountType: 'vendor' },
      { referralCode: 'A-0005', accountType: 'brand' },
      { referralCode: 'A-0006', accountType: 'customer' },
    ]);
    expect(summary.totalRegistrations).toBe(4);
    expect(summary.codes).toEqual([
      { code: 'A-0005', customers: 1, suppliers: 1, brands: 1 },
      { code: 'A-0006', customers: 1, suppliers: 0, brands: 0 },
    ]);
  });

  it('maps each export to the existing view permission', () => {
    expect(registrationExportPermission('customer')).toBe('customers.view');
    expect(registrationExportPermission('vendor')).toBe('vendors.view');
    expect(registrationExportPermission('brand')).toBe('brands.view');
  });

  it('builds admin detail deep-links per account type', () => {
    expect(affiliateDetailHref({ accountType: 'customer', userId: 'user-1' })).toBe('/admin/customers/user-1');
    expect(affiliateDetailHref({ accountType: 'vendor', vendorId: 'vendor-1' })).toBe('/admin/vendors/vendor-1');
    expect(affiliateDetailHref({ accountType: 'brand', brandId: 'brand-1' })).toBe('/admin/brands/brand-1');
    expect(affiliateDetailHref({ accountType: 'customer' })).toBeNull();
    expect(affiliateDetailHref({ accountType: 'vendor', userId: 'user-1' })).toBeNull();
  });
});
