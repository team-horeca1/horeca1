/**
 * Build a client-friendly schema overview (JSON + short Markdown)
 * from prisma/schema.prisma — structure only, no data.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const SCALAR = new Set(['String', 'Int', 'Boolean', 'DateTime', 'Decimal', 'Float', 'Json', 'Bytes', 'BigInt']);

const models = [];
const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
let match;
while ((match = modelRe.exec(schema)) !== null) {
  const name = match[1];
  const body = match[2];
  const columns = [];
  const relationships = [];

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

    const parts = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
    if (!parts) continue;
    const [, fieldName, fieldType, isArray, optionalMark, rest] = parts;
    const optional = Boolean(optionalMark) || /\?/.test(line.split(/\s+/)[1] || '');
    const isRelationObj = !SCALAR.has(fieldType) && /^[A-Z]/.test(fieldType);

    if (isRelationObj) {
      relationships.push(
        isArray
          ? `${name}.${fieldName} → ${fieldType}[]`
          : `${name}.${fieldName} → ${fieldType}`,
      );
      continue;
    }

    columns.push({
      name: fieldName,
      type: fieldType + (isArray || ''),
      required: !optional && !optionalMark,
      primaryKey: rest.includes('@id'),
      unique: rest.includes('@unique'),
    });
  }

  const mapMatch = body.match(/@@map\("([^"]+)"\)/);
  models.push({
    model: name,
    table: mapMatch?.[1] || name,
    columns,
    relationships,
  });
}

const enums = [];
const enumRe = /enum\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
while ((match = enumRe.exec(schema)) !== null) {
  enums.push({
    name: match[1],
    values: match[2]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('@@')),
  });
}

models.sort((a, b) => a.model.localeCompare(b.model));

const groups = {
  'Auth & Identity': ['User', 'Account', 'Session', 'VerificationToken', 'LinkedAccount', 'SavedAddress'],
  'Business / Supplier / Store': ['BusinessAccount', 'BusinessAccountMember', 'Outlet', 'Vendor', 'ServiceArea', 'DeliverySlot', 'CustomerVendor'],
  Catalog: ['Category', 'CategoryCategory', 'Product', 'ProductCategory', 'PriceSlab', 'Collection', 'CollectionProduct', 'ProductCombo', 'ComboItem', 'Inventory', 'MasterProduct', 'MasterProductCategory', 'MasterProductRevision', 'ProductAuditLog'],
  'Cart & Orders': ['Cart', 'CartItem', 'Order', 'OrderItem', 'Review'],
  'Lists & Saved': ['QuickOrderList', 'QuickOrderListItem'],
  'Payments & Credit': ['Payment', 'CreditAccount', 'CreditTransaction', 'Wallet', 'WalletTransaction', 'GlobalCreditConfig', 'CreditWallet', 'CreditWalletTxn', 'CreditWalletRepayment', 'CreditWalletPenalty', 'CreditWalletAuditLog'],
  Notifications: ['Notification'],
  Brand: ['Brand', 'BrandMasterProduct', 'BrandProductMapping', 'BrandDistributorInvite', 'BrandAuthorizedDistributor', 'BrandTeamMember'],
  Teams: ['VendorTeamMember', 'AdminTeamMember', 'UserRole', 'AccountRole'],
  Audit: ['AuditLog'],
};

const overview = {
  project: 'HoReCa Hub (horeca1)',
  generatedAt: new Date().toISOString().slice(0, 10),
  databaseEngine: 'PostgreSQL',
  importantNote:
    'There is one application database with many tables — not multiple separate databases.',
  summary: {
    tableCount: models.length,
    enumCount: enums.length,
    tableNames: models.map((m) => m.table),
  },
  domainGroups: Object.fromEntries(
    Object.entries(groups).map(([label, names]) => [
      label,
      names.filter((n) => models.some((m) => m.model === n)),
    ]),
  ),
  enums,
  tables: models,
};

mkdirSync('docs', { recursive: true });
writeFileSync('docs/horeca1-schema-overview.json', JSON.stringify(overview, null, 2));

const md = [
  '# HoReCa Hub - Database Schema Overview',
  '',
  `Generated: ${overview.generatedAt}`,
  '',
  '## Important',
  '',
  '- **One PostgreSQL database** powers the website (not many separate DBs).',
  `- **${models.length} tables** / models, **${enums.length} enums**.`,
  '- This document is **structure only** (no customer or order data).',
  '',
  '## Domain groups',
  '',
];

for (const [label, names] of Object.entries(overview.domainGroups)) {
  if (!names.length) continue;
  md.push(`### ${label}`);
  md.push('');
  for (const n of names) {
    const t = models.find((x) => x.model === n);
    md.push(`- **${n}**${t && t.table !== n ? ` (table: \`${t.table}\`)` : ''}`);
  }
  md.push('');
}

md.push('## All tables (simple list)');
md.push('');
for (const t of models) {
  md.push(`- \`${t.table}\``);
}
md.push('');
md.push('## Full detail');
md.push('');
md.push('See `horeca1-schema-overview.json` for columns and relationships per table.');
md.push('');
md.push('For a visual diagram, import `horeca1-schema.sql` into https://dbdiagram.io (Import → From PostgreSQL) and use Share.');
md.push('');

writeFileSync('docs/horeca1-schema-overview.md', md.join('\n'));
console.log(`Wrote docs/horeca1-schema-overview.json (${models.length} tables)`);
console.log('Wrote docs/horeca1-schema-overview.md');
