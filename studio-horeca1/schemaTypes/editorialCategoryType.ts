import { defineField, defineType } from 'sanity'

export const editorialCategoryType = defineType({
  name: 'editorialCategory',
  title: 'Editorial Category',
  type: 'document',
  fields: [
    defineField({
      name: 'key',
      title: 'Key',
      type: 'string',
      description: 'Stable slug stored on each story, for example chef or mixologist.',
      validation: (Rule) =>
        Rule.required().max(40).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { name: 'lowercase slug' }),
    }),
    defineField({
      name: 'label',
      title: 'Display name',
      type: 'string',
      validation: (Rule) => Rule.required().min(2).max(80),
    }),
    defineField({
      name: 'badge',
      title: 'Badge label',
      type: 'string',
      description: 'Uppercase kicker shown on the article and share cards.',
      validation: (Rule) => Rule.required().min(2).max(80),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'isDefault',
      title: 'Built-in category',
      type: 'boolean',
      initialValue: false,
      description: 'Built-in categories can be renamed, not deleted.',
    }),
  ],
  preview: {
    select: { title: 'label', subtitle: 'key' },
  },
})
