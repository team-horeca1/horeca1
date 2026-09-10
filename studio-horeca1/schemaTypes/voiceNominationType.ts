import { defineField, defineType } from 'sanity'
import { VOICE_CATEGORIES } from './voiceStoryType'

export const voiceNominationType = defineType({
  name: 'voiceNomination',
  title: 'Nomination',
  type: 'document',
  fields: [
    defineField({
      name: 'nomineeName',
      title: 'Nominee name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'category',
      type: 'string',
      options: { list: [...VOICE_CATEGORIES] },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'contact',
      title: 'Email or phone',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'reason',
      title: 'Why they should be featured',
      type: 'text',
      rows: 4,
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'nominatorName',
      title: 'Nominator name',
      type: 'string',
    }),
    defineField({
      name: 'relationship',
      title: 'Relationship to nominee',
      type: 'string',
    }),
    defineField({
      name: 'status',
      type: 'string',
      options: {
        list: [
          { title: 'New', value: 'new' },
          { title: 'Reviewed', value: 'reviewed' },
          { title: 'Used', value: 'used' },
        ],
        layout: 'radio',
      },
      initialValue: 'new',
    }),
  ],
  preview: {
    select: {
      title: 'nomineeName',
      subtitle: 'category',
    },
  },
  orderings: [
    {
      title: 'Newest',
      name: 'createdDesc',
      by: [{ field: '_createdAt', direction: 'desc' }],
    },
  ],
})
