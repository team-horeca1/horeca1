/**
 * Smoke-test customer / brand / vendor register API paths.
 * Run: node scripts/test-register-flows.mjs
 */
import { execSync } from 'node:child_process';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ts = Date.now();

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function sampleAddress() {
  return {
    addressLine: '123 Test Industrial Estate, Andheri East',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400708',
  };
}

function vendorPayload({ phone, verifiedEmail, email, password }) {
  return {
    phone: phone || '',
    verifiedEmail: verifiedEmail || '',
    vendorType: 'distributor',
    vendorBusinessType: 'Distributor',
    vendorTypeSelections: [{
      type: 'Distributor',
      slug: 'distributor',
      subTypes: ['HoReCa Distributor'],
    }],
    subType: 'HoReCa Distributor',
    fullName: 'Test Vendor Owner',
    businessName: `Test Vendor ${ts}`,
    tradeName: `Test Trade ${ts}`,
    email: email || '',
    password: password || 'testpass123',
    authorizedPersonName: 'Test Authorized',
    authorizedPersonPhone: phone || '',
    authorizedPersonEmail: email || '',
    gstNumber: '',
    panNumber: '',
    bankAccountName: 'Test Vendor Pvt Ltd',
    bankAccountNumber: '123456789012',
    bankIfsc: 'HDFC0001234',
    bankName: 'HDFC Bank',
    bankAccountType: 'current',
    billingAddress: sampleAddress(),
    pickupAddress: sampleAddress(),
    serviceablePincodes: ['400708'],
    deliveryCapability: 'both',
  };
}

function brandPayload({ phone, verifiedEmail, email, password }) {
  return {
    phone: phone || '',
    verifiedEmail: verifiedEmail || '',
    legalName: `Test Brand ${ts}`,
    companyName: `Test Brand ${ts}`,
    displayName: `Test Brand ${ts}`,
    brandType: 'FMCG',
    subType: 'Snacks',
    firstName: 'Brand',
    lastName: 'Owner',
    email: email || '',
    password: password || 'testpass123',
    mobilePhone: phone || '',
    gstin: '',
    billingAddressLine: sampleAddress().addressLine,
    billingCity: 'Mumbai',
    billingState: 'Maharashtra',
    billingPincode: '400708',
  };
}

function readOtp({ email, phone }) {
  const cmd = email
    ? `npx tsx scripts/read-otp.ts "${email}"`
    : `npx tsx scripts/read-otp.ts "" "${phone}"`;
  return execSync(cmd, { cwd: process.cwd(), encoding: 'utf8' }).trim();
}

async function emailOtpFlow(intent, email) {
  const send = await api('/api/v1/auth/otp/send', { email, mode: 'register', intent });
  if (!send.data.success) return { ok: false, step: 'otp/send', ...send };
  const code = readOtp({ email });
  if (!/^\d{4}$/.test(code)) return { ok: false, step: 'otp/read', error: `No OTP for ${email}` };
  const verify = await api('/api/v1/auth/otp/verify', { email, code });
  if (!verify.data.success) return { ok: false, step: 'otp/verify', ...verify };
  return { ok: true, code };
}

async function phoneOtpFlow(intent, phone) {
  const send = await api('/api/v1/auth/otp/send', { phone, mode: 'register', intent });
  if (!send.data.success) return { ok: false, step: 'otp/send', ...send };
  const code = readOtp({ phone });
  if (!/^\d{4}$/.test(code)) return { ok: false, step: 'otp/read', error: `No OTP for ${phone}` };
  const verify = await api('/api/v1/auth/otp/verify', { phone, code });
  if (!verify.data.success) return { ok: false, step: 'otp/verify', ...verify };
  return { ok: true, code };
}

async function testVendorEmail() {
  const email = `testvendor+${ts}@example.com`;
  console.log('\n=== VENDOR (email) ===', email);
  const otp = await emailOtpFlow('vendor', email);
  if (!otp.ok) {
    console.log('FAIL', otp.step, JSON.stringify(otp.data || otp.error, null, 2));
    return false;
  }
  const submit = await api('/api/v1/vendor/onboarding/submit', vendorPayload({
    verifiedEmail: email,
    email,
    password: 'testpass123',
  }));
  console.log('submit', submit.status, JSON.stringify(submit.data, null, 2));
  return submit.data.success === true;
}

async function testBrandEmail() {
  const email = `testbrand+${ts}@example.com`;
  console.log('\n=== BRAND (email) ===', email);
  const otp = await emailOtpFlow('brand', email);
  if (!otp.ok) {
    console.log('FAIL', otp.step, JSON.stringify(otp.data || otp.error, null, 2));
    return false;
  }
  const submit = await api('/api/v1/brand/onboarding/submit', brandPayload({
    verifiedEmail: email,
    email,
    password: 'testpass123',
  }));
  console.log('submit', submit.status, JSON.stringify(submit.data, null, 2));
  return submit.data.success === true;
}

async function testVendorPhone() {
  const phone = String(9876500000 + (ts % 1000000)).slice(0, 10);
  console.log('\n=== VENDOR (phone) ===', phone);
  const otp = await phoneOtpFlow('vendor', phone);
  if (!otp.ok) {
    console.log('FAIL', otp.step, JSON.stringify(otp.data || otp.error, null, 2));
    return false;
  }
  const submit = await api('/api/v1/vendor/onboarding/submit', vendorPayload({ phone }));
  console.log('submit', submit.status, JSON.stringify(submit.data, null, 2));
  return submit.data.success === true;
}

async function testCustomerEmail() {
  const email = `testcustomer+${ts}@example.com`;
  console.log('\n=== CUSTOMER (email OTP) ===', email);
  const otp = await emailOtpFlow('customer', email);
  if (!otp.ok) {
    console.log('FAIL', otp.step, JSON.stringify(otp.data || otp.error, null, 2));
    return false;
  }
  console.log('OTP verify OK (signIn happens in browser after profile step)');
  return true;
}

async function testCustomerPhone() {
  const phone = String(9765400000 + (ts % 1000000)).slice(0, 10);
  console.log('\n=== CUSTOMER (phone OTP) ===', phone);
  const otp = await phoneOtpFlow('customer', phone);
  if (!otp.ok) {
    console.log('FAIL', otp.step, JSON.stringify(otp.data || otp.error, null, 2));
    return false;
  }
  console.log('OTP verify OK');
  return true;
}

async function testBrandPhone() {
  const phone = String(9854300000 + (ts % 1000000)).slice(0, 10);
  console.log('\n=== BRAND (phone) ===', phone);
  const otp = await phoneOtpFlow('brand', phone);
  if (!otp.ok) {
    console.log('FAIL', otp.step, JSON.stringify(otp.data || otp.error, null, 2));
    return false;
  }
  const submit = await api('/api/v1/brand/onboarding/submit', brandPayload({ phone }));
  console.log('submit', submit.status, JSON.stringify(submit.data, null, 2));
  return submit.data.success === true;
}

async function main() {
  const results = {
    customerEmail: await testCustomerEmail(),
    customerPhone: await testCustomerPhone(),
    vendorEmail: await testVendorEmail(),
    vendorPhone: await testVendorPhone(),
    brandEmail: await testBrandEmail(),
    brandPhone: await testBrandPhone(),
  };
  console.log('\n=== SUMMARY ===', results);
  process.exit(Object.values(results).every(Boolean) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
