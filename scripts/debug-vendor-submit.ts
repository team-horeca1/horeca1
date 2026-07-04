import 'dotenv/config';
import { execSync } from 'node:child_process';

const BASE = 'http://localhost:3000';
const ts = Date.now();
const email = `testvendor+${ts}@example.com`;

async function api(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function readOtp(e: string) {
  return execSync(`npx tsx scripts/read-otp.ts "${e}"`, { encoding: 'utf8' }).trim();
}

const payload = {
  phone: '',
  verifiedEmail: email,
  vendorType: 'distributor',
  vendorBusinessType: 'Distributor',
  vendorTypeSelections: [{ type: 'Distributor', slug: 'distributor', subTypes: ['HoReCa Distributor'] }],
  subType: 'HoReCa Distributor',
  fullName: 'Test Vendor Owner',
  businessName: `Test Vendor ${ts}`,
  tradeName: `Test Trade ${ts}`,
  email,
  password: 'testpass123',
  authorizedPersonName: 'Test Authorized',
  authorizedPersonPhone: '',
  authorizedPersonEmail: email,
  gstNumber: '',
  panNumber: '',
  bankAccountName: 'Test Vendor Pvt Ltd',
  bankAccountNumber: '123456789012',
  bankIfsc: 'HDFC0001234',
  bankName: 'HDFC Bank',
  bankAccountType: 'current',
  billingAddress: {
    addressLine: '123 Test Industrial Estate, Andheri East',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400708',
  },
  pickupAddress: {
    addressLine: '123 Test Industrial Estate, Andheri East',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400708',
  },
  serviceablePincodes: ['400708'],
  deliveryCapability: 'both',
};

async function main() {
  console.log('email', email);
  const send = await api('/api/v1/auth/otp/send', { email, mode: 'register', intent: 'vendor' });
  console.log('send', send);
  const code = readOtp(email);
  console.log('code', code);
  const verify = await api('/api/v1/auth/otp/verify', { email, code });
  console.log('verify', verify);
  const submit = await api('/api/v1/vendor/onboarding/submit', payload);
  console.log('submit', submit);
}

main().catch(console.error);
