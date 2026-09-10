import { createClient } from 'next-sanity'
import { apiVersion, dataset, projectId } from '../env'

const token = process.env.SANITY_API_READ_TOKEN || undefined

/** CDN client for listing pages. */
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: process.env.NODE_ENV === 'production',
  token,
  perspective: 'published',
})

/** Bypass CDN so publish webhooks and OG cards see the document immediately. */
export const liveClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token,
  perspective: 'published',
})
