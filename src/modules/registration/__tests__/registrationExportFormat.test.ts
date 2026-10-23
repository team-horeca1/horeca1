import { describe, expect, it } from 'vitest';
import {
  registrationExportCsv,
  registrationExportHeaders,
  registrationExportPermission,
  spreadsheetSafe,
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

  it('maps each export to the existing view permission', () => {
    expect(registrationExportPermission('customer')).toBe('customers.view');
    expect(registrationExportPermission('vendor')).toBe('vendors.view');
    expect(registrationExportPermission('brand')).toBe('brands.view');
  });
});
