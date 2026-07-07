#!/bin/bash
set -e
echo "=== Container image ==="
docker inspect --format '{{.Created}} {{.Image}}' horeca1-app
echo "=== Resend in bundle ==="
docker exec horeca1-app sh -c "grep -rl 'api.resend.com' /app/.next 2>/dev/null | head -1 || echo NOT_FOUND"
echo "=== Prod email test ==="
docker exec horeca1-app node -e "
const key = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;
if (!key) { console.error('NO_KEY'); process.exit(1); }
fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from,
    to: ['team.horeca1@gmail.com'],
    subject: 'HoReCa Hub prod Resend test',
    html: '<p>Production Resend test from freshville.store at ' + new Date().toISOString() + '</p>'
  })
}).then(async r => {
  const t = await r.text();
  console.log('HTTP', r.status, t.slice(0, 200));
  process.exit(r.ok ? 0 : 1);
}).catch(e => { console.error(e); process.exit(1); });
"
