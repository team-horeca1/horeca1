import fs from 'node:fs';

const paths = [
  '.next/server/middleware.js',
  '.next/standalone/.next/server/middleware.js',
];

const before = '"outlets","settings","collections","customer-groups","setup"])';
const after = '"outlets","settings","collections","customer-groups","setup","businesses"])';

for (const p of paths) {
  if (!fs.existsSync(p)) {
    console.log('skip missing', p);
    continue;
  }
  let s = fs.readFileSync(p, 'utf8');
  if (s.includes(after)) {
    console.log('already', p);
    continue;
  }
  if (!s.includes(before)) {
    console.log('pattern missing', p);
    continue;
  }
  fs.writeFileSync(p, s.replace(before, after));
  console.log('patched', p);
}
