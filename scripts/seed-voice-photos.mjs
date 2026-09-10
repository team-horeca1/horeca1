import { createClient } from '@sanity/client'
import fs from 'node:fs'

function envValue(text, key) {
  const match = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
  return match ? match[1].trim() : ''
}

const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const token = envValue(env, 'SANITY_API_WRITE_TOKEN')
const client = createClient({
  projectId: envValue(env, 'NEXT_PUBLIC_SANITY_PROJECT_ID') || 't7n5swxf',
  dataset: envValue(env, 'NEXT_PUBLIC_SANITY_DATASET') || 'production',
  apiVersion: envValue(env, 'NEXT_PUBLIC_SANITY_API_VERSION') || '2024-03-13',
  token,
  useCdn: false,
})

const PHOTOS = [
  { id: 'voiceStory.seed-chef-ananya', url: 'https://randomuser.me/api/portraits/women/21.jpg', name: 'Ananya Rao' },
  { id: 'voiceStory.seed-consultant-vikram', url: 'https://randomuser.me/api/portraits/men/32.jpg', name: 'Vikram Shah' },
  { id: 'voiceStory.seed-vendor-meera', url: 'https://randomuser.me/api/portraits/women/65.jpg', name: 'Meera Iyer' },
  { id: 'voiceStory.seed-owner-rohan', url: 'https://randomuser.me/api/portraits/men/75.jpg', name: 'Rohan Kapoor' },
]

for (const row of PHOTOS) {
  const res = await fetch(row.url)
  if (!res.ok) throw new Error(`photo fetch failed ${row.url} ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const asset = await client.assets.upload('image', buf, {
    filename: `${row.id}.jpg`,
    contentType: 'image/jpeg',
  })
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
  console.log('photo', row.id, 'ok')
}
