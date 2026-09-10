import { defineArrayMember, defineField, defineType } from 'sanity'

export const VOICE_CATEGORIES = [
  { title: 'Chef of the Week', value: 'chef' },
  { title: 'Consultant Spotlight', value: 'consultant' },
  { title: 'Vendor Spotlight', value: 'vendor' },
  { title: 'F&B Owner / Restaurateur Spotlight', value: 'owner' },
] as const

export const voiceStoryType = defineType({
  name: 'voiceStory',
  title: 'Voice Story',
  type: 'document',
  fields: [
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: { list: [...VOICE_CATEGORIES], layout: 'radio' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'name',
      title: 'Featured person',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: { source: 'name' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'role',
      title: 'Title / role',
      type: 'string',
    }),
    defineField({
      name: 'venue',
      title: 'Business / venue',
      type: 'string',
    }),
    defineField({
      name: 'quote',
      title: 'Pull quote',
      type: 'text',
      rows: 2,
      description: 'One-line hook. Keep under 90 characters.',
      validation: (Rule) => Rule.required().max(90),
    }),
    defineField({
      name: 'photo',
      title: 'Photo',
      type: 'image',
      options: { hotspot: true },
      fields: [{ name: 'alt', type: 'string', title: 'Alternative text' }],
    }),
    defineField({
      name: 'body',
      title: 'Story',
      type: 'blockContent',
    }),
    defineField({
      name: 'recipe',
      title: 'Signature recipe (chefs)',
      type: 'object',
      hidden: ({ document }) => document?.category !== 'chef',
      fields: [
        defineField({ name: 'dishName', type: 'string', title: 'Dish name' }),
        defineField({
          name: 'ingredients',
          type: 'array',
          of: [{ type: 'string' }],
        }),
        defineField({
          name: 'steps',
          type: 'array',
          of: [{ type: 'text' }],
        }),
      ],
    }),
    defineField({
      name: 'qa',
      title: 'Q&A (consultants)',
      type: 'array',
      hidden: ({ document }) => document?.category !== 'consultant',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({ name: 'question', type: 'string' }),
            defineField({ name: 'answer', type: 'text', rows: 4 }),
          ],
          preview: { select: { title: 'question' } },
        }),
      ],
    }),
    defineField({
      name: 'brandLinks',
      title: 'Brand mentions',
      type: 'array',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({ name: 'label', type: 'string', title: 'Display name' }),
            defineField({
              name: 'brandSlug',
              type: 'string',
              title: 'Brand store slug',
              description: 'Opens /brand/{slug}',
            }),
          ],
          preview: { select: { title: 'label', subtitle: 'brandSlug' } },
        }),
      ],
    }),
    defineField({
      name: 'published',
      title: 'Published',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
      description: 'Required when Published is on. Used to sort stories on the site.',
      validation: (Rule) =>
        Rule.custom((value, ctx) => {
          if (ctx.document?.published && !value) {
            return 'Set a publish date before going live'
          }
          return true
        }),
    }),
    defineField({
      name: 'storyPortraitUrl',
      title: 'Story card URL (1080×1920)',
      type: 'url',
      readOnly: true,
      description: 'Filled by the publish webhook. Do not edit.',
    }),
    defineField({
      name: 'storySquareUrl',
      title: 'Square card URL (1080×1080)',
      type: 'url',
      readOnly: true,
      description: 'Filled by the publish webhook. Also used as og:image.',
    }),
  ],
  preview: {
    select: {
      title: 'name',
      subtitle: 'category',
      media: 'photo',
    },
  },
  orderings: [
    {
      title: 'Published (newest)',
      name: 'publishedAtDesc',
      by: [{ field: 'publishedAt', direction: 'desc' }],
    },
  ],
})
