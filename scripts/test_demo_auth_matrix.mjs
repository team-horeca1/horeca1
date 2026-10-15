import fetch from 'node-fetch';

const BASE_URL = 'https://demo.horeca1.com';

const ACCOUNTS = [
  { email: 'admin@horeca1.com', password: 'admin123', role: 'admin' },
  { email: 'demo.admin@horeca1.com', password: 'DemoAdmin123!', role: 'demo-admin' },
  { email: 'fresh@dailyfreshfoods.com', password: 'vendor123', role: 'vendor' },
  { email: 'brand@kitchensmith.com', password: 'brand123', role: 'brand' },
  { email: 'chef@tajpalace.com', password: 'customer123', role: 'customer' },
  { email: 'vendor@horeca1.com', password: 'vendor123', role: 'vendor' },
  { email: 'dairy@dairydirect.com', password: 'vendor123', role: 'vendor' },
];

async function testLogins() {
  console.log(`Checking accounts on ${BASE_URL}...`);

  for (const acc of ACCOUNTS) {
    try {
      // 1. Get CSRF token and cookies
      const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
      const cookies = csrfRes.headers.raw()['set-cookie'] || [];
      const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
      const csrfData = await csrfRes.json();
      const csrfToken = csrfData.csrfToken;

      // 2. Post credentials
      const params = new URLSearchParams();
      params.append('csrfToken', csrfToken);
      params.append('callbackUrl', `${BASE_URL}/`);
      params.append('json', 'true');
      params.append('email', acc.email);
      params.append('password', acc.password);

      const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials?`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieHeader,
        },
        body: params.toString(),
        redirect: 'manual',
      });

      const respCookie = loginRes.headers.raw()['set-cookie'] || [];
      const allCookies = [...cookies, ...respCookie].map(c => c.split(';')[0]).join('; ');
      const status = loginRes.status;
      const location = loginRes.headers.get('location') || '';

      const isError = location.includes('error=CredentialsSignin');
      if (!isError && (status === 200 || status === 302)) {
        console.log(`[SUCCESS] ${acc.email} (${acc.role}) -> Logged in! Status: ${status}, Location: ${location}`);

        // Verify session
        const sessRes = await fetch(`${BASE_URL}/api/auth/session`, {
          headers: { 'Cookie': allCookies }
        });
        const sessData = await sessRes.json();
        console.log(`   Session details:`, sessData);
      } else {
        console.log(`[FAILED] ${acc.email} -> ${isError ? 'CredentialsSignin error' : `Status ${status} loc: ${location}`}`);
      }
    } catch (e) {
      console.log(`[ERROR] ${acc.email} -> ${e.message}`);
    }
  }
}

testLogins().catch(console.error);
