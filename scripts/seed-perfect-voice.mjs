/**
 * Create one polished Voice story with a high-quality editorial photo.
 * Run: node scripts/seed-perfect-voice.mjs
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

const DOC_ID = 'voiceStory.seed-chef-kavya'
const PHOTO_URL =
  'https://images.unsplash.com/photo-1600565193348-f74bd3c7ccdf?auto=format&fit=crop&w=1400&q=85'

const photoRes = await fetch(PHOTO_URL)
if (!photoRes.ok) throw new Error(`photo fetch failed ${photoRes.status}`)
const photoBuf = Buffer.from(await photoRes.arrayBuffer())
const asset = await client.assets.upload('image', photoBuf, {
  filename: 'kavya-menon-kitchen.jpg',
  contentType: 'image/jpeg',
})

const body = [
  {
    _type: 'block',
    _key: 'b0',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: 's0',
        text: 'Kavya built her reputation on quiet service kitchens, not tasting menus. At Salt & Ember she runs a 60-cover room with one prep list, two vendors she trusts, and a rule that every garnish must earn its place on the plate.',
        marks: [],
      },
    ],
  },
  {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _type: 'span',
        _key: 's1',
        text: 'Her Voice this week is about buying better, not buying more: freeze herbs only when the menu needs them twice, and treat the morning indent like mise — if it is not on paper, it does not leave the store.',
        marks: [],
      },
    ],
  },
]

await client.createOrReplace({
  _id: DOC_ID,
  _type: 'voiceStory',
  category: 'chef',
  name: 'Kavya Menon',
  slug: { _type: 'slug', current: 'kavya-menon-salt-and-ember' },
  role: 'Head Chef',
  venue: 'Salt & Ember, Bengaluru',
  quote: 'Buy what the pass can finish — not what the catalogue can tempt.',
  photo: {
    _type: 'image',
    asset: { _type: 'reference', _ref: asset._id },
    alt: 'Kavya Menon in a professional kitchen',
  },
  body,
  recipe: {
    dishName: 'Charred corn & coconut thali bowl',
    ingredients: [
      'Fresh corn kernels 400g',
      'Thick coconut milk 250ml',
      'Curry leaf, mustard, dried chilli',
      'Lime and sea salt to finish',
    ],
    steps: [
      'Char the corn in a hot pan until edges blister; set aside.',
      'Temper mustard and curry leaf; fold into warm coconut milk.',
      'Toss corn through the milk, finish with lime and salt. Serve hot.',
    ],
  },
  qa: [],
  brandLinks: [],
  published: true,
  publishedAt: new Date().toISOString(),
})

console.log('created', DOC_ID)
console.log('slug /voices/kavya-menon-salt-and-ember')
console.log('photo', asset.url)
