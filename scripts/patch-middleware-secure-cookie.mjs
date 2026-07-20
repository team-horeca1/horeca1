import fs from 'node:fs';

const paths = [
  '.next/server/middleware.js',
  '.next/standalone/.next/server/middleware.js',
];

const before = 'secureCookie:!0});if(!g){let c=b+a.nextUrl.search';
const after = 'secureCookie:a.nextUrl.protocol==="https:"});if(!g){let c=b+a.nextUrl.search';

for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.log('skip missing', p);
    continue;
  }
  let s = fs.readFileSync(p, 'utf8');
  if (!s.includes(before)) {
    if (s.includes(after)) {
      console.log('already patched', p);
      continue;
    }
    const i = s.indexOf('secureCookie:!0');
    console.log('pattern not found', p, 'idx', i, s.slice(Math.max(0, i - 40), i + 80));
    continue;
  }
  s = s.replace(before, after);
  fs.writeFileSync(p, s);
  console.log('patched', p);
}
