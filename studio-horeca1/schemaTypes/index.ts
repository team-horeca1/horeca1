import type { SchemaTypeDefinition } from 'sanity'
import { blockContentType } from './blockContentType'
import { editorialCategoryType } from './editorialCategoryType'
import { voiceStoryType } from './voiceStoryType'
import { voiceNominationType } from './voiceNominationType'

export const schemaTypes: SchemaTypeDefinition[] = [
  blockContentType,
  editorialCategoryType,
  voiceStoryType,
  voiceNominationType,
]
