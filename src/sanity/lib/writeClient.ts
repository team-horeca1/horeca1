import 'server-only'
import { createClient, type SanityClient } from '@sanity/client'
import { apiVersion, dataset, projectId } from '../env'

/** Server-only write client. Returns null when SANITY_API_WRITE_TOKEN is unset. */
export function getWriteClient(): SanityClient | null {
  const token = process.env.SANITY_API_WRITE_TOKEN
  if (!token) return null
  return createClient({
    projectId,
    dataset,
    apiVersion,
    token,
    useCdn: false,
  })
}
