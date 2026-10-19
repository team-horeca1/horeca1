import fetch from 'node-fetch';

const BASE_URL = 'https://demo.horeca1.com';

async function queryAdminApis() {
  // 1. Authenticate as admin
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  const cookies = csrfRes.headers.raw()['set-cookie'] || [];
  const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
  const { csrfToken } = await csrfRes.json();

  const params = new URLSearchParams();
  params.append('csrfToken', csrfToken);
  params.append('callbackUrl', `${BASE_URL}/`);
  params.append('json', 'true');
  params.append('email', 'admin@horeca1.com');
  params.append('password', 'admin123');

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials?`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieHeader },
    body: params.toString(),
    redirect: 'manual',
  });

  const authCookies = [...cookies, ...(loginRes.headers.raw()['set-cookie'] || [])].map(c => c.split(';')[0]).join('; ');

  console.log('Authenticated! Querying Admin endpoints on demo.horeca1.com...\n');

  const endpoints = [
    '/api/v1/admin/vendors?view=suppliers&limit=50',
    '/api/v1/admin/products?limit=20',
    '/api/v1/admin/orders?limit=10',
    '/api/v1/admin/users?limit=10',
    '/api/v1/vendors',
    '/api/v1/categories',
    '/api/v1/system/health',
    '/api/health',
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep}`, {
        headers: { 'Cookie': authCookies }
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        console.log(`[HTTP ${res.status}] ${ep}`);
        if (ep.includes('vendors')) {
          const vendors = json.data?.suppliers || json.data || [];
          console.log(`   Found ${vendors.length} vendors/suppliers:`, vendors.slice(0, 5).map(v => ({ id: v.id, name: v.name || v.storeName || v.businessName, userId: v.userId })));
        } else if (ep.includes('products')) {
          const prods = json.data?.products || json.data || [];
          console.log(`   Found ${prods.length} products:`, prods.slice(0, 5).map(p => ({ id: p.id, name: p.name, slug: p.slug, sku: p.sku })));
        } else if (ep.includes('users')) {
          const users = json.data?.users || json.data || [];
          console.log(`   Found ${users.length} users:`, users.slice(0, 5).map(u => ({ id: u.id, email: u.email, role: u.role, phone: u.phone })));
        } else {
          console.log(`   Sample response:`, JSON.stringify(json).slice(0, 150));
        }
      } else {
        console.log(`[HTTP ${res.status}] ${ep} (non-JSON: ${contentType})`);
      }
    } catch (e) {
      console.log(`[FAIL] ${ep}: ${e.message}`);
    }
  }
}

queryAdminApis().catch(console.error);
