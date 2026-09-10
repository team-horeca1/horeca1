import type { StructureResolver } from 'sanity/structure'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Horeca1 Voices')
    .items([
      S.listItem()
        .id('voices')
        .title('Voice stories')
        .schemaType('voiceStory')
        .child(S.documentTypeList('voiceStory').title('Voice stories')),
      S.listItem()
        .id('nominations')
        .title('Nominations')
        .schemaType('voiceNomination')
        .child(S.documentTypeList('voiceNomination').title('Nominations')),
    ])
