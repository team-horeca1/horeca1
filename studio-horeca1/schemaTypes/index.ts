import type { SchemaTypeDefinition } from 'sanity'
import { blockContentType } from './blockContentType'
import { voiceStoryType } from './voiceStoryType'
import { voiceNominationType } from './voiceNominationType'

export const schemaTypes: SchemaTypeDefinition[] = [
  blockContentType,
  voiceStoryType,
  voiceNominationType,
]
