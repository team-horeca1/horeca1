/**
 * Replace seed Voice photos with high-res editorial images (Unsplash).
 * Run from repo root: node scripts/upgrade-voice-photos.mjs
 */
import { createClient } from '@sanity/client'
import fs from 'node:fs'

function envValue(text, key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
  return match ? match[1].trim() : ''
}

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const token = envValue(env, 'SANITY_API_WRITE_TOKEN')
if (!token) throw new Error('SANITY_API_WRITE_TOKEN missing in .env.local')

const client = createClient({
  projectId: envValue(env, 'NEXT_PUBLIC_SANITY_PROJECT_ID') || 't7n5swxf',
  dataset: envValue(env, 'NEXT_PUBLIC_SANITY_DATASET') || 'production',
  apiVersion: envValue(env, 'NEXT_PUBLIC_SANITY_API_VERSION') || '2024-03-13',
  token,
  useCdn: false,
})

// High-quality editorial images (1200w) — kitchen / hospitality, not tiny stock faces
const PHOTOS = [
  {
    id: 'voiceStory.seed-chef-ananya',
    name: 'Ananya Rao',
    url: 'https://images.unsplash.com/photo-1577219491135-ce391730fb2c?auto=format&fit=crop&w=1200&q=85',
  },
  {
    id: 'voiceStory.seed-consultant-vikram',
    name: 'Vikram Shah',
    url: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=1200&q=85',
  },
  {
    id: 'voiceStory.seed-vendor-meera',
    name: 'Meera Iyer',
    url: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=85',
  },
  {
    id: 'voiceStory.seed-owner-rohan',
    name: 'Rohan Kapoor',
    url: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=85',
  },
]

async function uploadFromUrl(url, filename, alt) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed ${url} ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return client.assets.upload('image', buf, {
    filename,
    contentType: 'image/jpeg',
  })
}

for (const row of PHOTOS) {
  const asset = await uploadFromUrl(row.url, `${row.id}-hq.jpg`, row.name)
  await client
    .patch(row.id)
    .set({
      photo: {
        _type: 'image',
        asset: { _type: 'reference', _ref: asset._id },
        alt: row.name,
      },
    })
    .commit()
  console.log('upgraded', row.id, asset.url)
}

console.log('done')
