/** Run one register test: node scripts/test-one-register.mjs vendorPhone */
import { execSync } from 'node:child_process';

const testName = process.argv[2];
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
  return { addressLine: '123 Test Industrial Estate', city: 'Mumbai', state: 'Maharashtra', pincode: '400708' };
}

function vendorPayload({ phone, verifiedEmail, email }) {
  return {
    phone: phone || '',
    verifiedEmail: verifiedEmail || '',
    vendorType: 'distributor',
    vendorBusinessType: 'Distributor',
    vendorTypeSelections: [{ type: 'Distributor', slug: 'distributor', subTypes: ['HoReCa Distributor'] }],
    subType: 'HoReCa Distributor',
    fullName: 'Test Vendor Owner',
    businessName: `Test Vendor ${ts}`,
    tradeName: `Test Trade ${ts}`,
    email: email || '',
    password: 'testpass123',
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

function brandPayload({ phone, verifiedEmail, email }) {
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
    password: 'testpass123',
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
  if (!send.data.success) throw new Error(`otp/send: ${JSON.stringify(send.data)}`);
  const code = readOtp({ email });
  const verify = await api('/api/v1/auth/otp/verify', { email, code });
  if (!verify.data.success) throw new Error(`otp/verify: ${JSON.stringify(verify.data)}`);
}

async function phoneOtpFlow(intent, phone) {
  const send = await api('/api/v1/auth/otp/send', { phone, mode: 'register', intent });
  if (!send.data.success) throw new Error(`otp/send: ${JSON.stringify(send.data)}`);
  const code = readOtp({ phone });
  const verify = await api('/api/v1/auth/otp/verify', { phone, code });
  if (!verify.data.success) throw new Error(`otp/verify: ${JSON.stringify(verify.data)}`);
}

const tests = {
  customerEmail: async () => {
    const email = `testcustomer+${ts}@example.com`;
    await emailOtpFlow('customer', email);
  },
  customerPhone: async () => {
    const phone = String(9765400000 + (ts % 1000000)).slice(0, 10);
    await phoneOtpFlow('customer', phone);
  },
  vendorEmail: async () => {
    const email = `testvendor+${ts}@example.com`;
    await emailOtpFlow('vendor', email);
    const submit = await api('/api/v1/vendor/onboarding/submit', vendorPayload({ verifiedEmail: email, email }));
    if (!submit.data.success) throw new Error(JSON.stringify(submit.data));
    console.log('vendorId', submit.data.data?.vendorId);
  },
  vendorPhone: async () => {
    const phone = String(9876500000 + (ts % 1000000)).slice(0, 10);
    await phoneOtpFlow('vendor', phone);
    const submit = await api('/api/v1/vendor/onboarding/submit', vendorPayload({ phone }));
    if (!submit.data.success) throw new Error(JSON.stringify(submit.data));
    console.log('vendorId', submit.data.data?.vendorId);
  },
  brandEmail: async () => {
    const email = `testbrand+${ts}@example.com`;
    await emailOtpFlow('brand', email);
    const submit = await api('/api/v1/brand/onboarding/submit', brandPayload({ verifiedEmail: email, email }));
    if (!submit.data.success) throw new Error(JSON.stringify(submit.data));
    console.log('brand', submit.data.data);
  },
  brandPhone: async () => {
    const phone = String(9854300000 + (ts % 1000000)).slice(0, 10);
    await phoneOtpFlow('brand', phone);
    const submit = await api('/api/v1/brand/onboarding/submit', brandPayload({ phone }));
    if (!submit.data.success) throw new Error(JSON.stringify(submit.data));
    console.log('brand', submit.data.data);
  },
};

const fn = tests[testName];
if (!fn) {
  console.error('Usage: node scripts/test-one-register.mjs <', Object.keys(tests).join('|'), '>');
  process.exit(1);
}

fn()
  .then(() => {
    console.log(testName, 'PASS');
    process.exit(0);
  })
  .catch((e) => {
    console.error(testName, 'FAIL', e.message);
    process.exit(1);
  });
