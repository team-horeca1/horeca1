export const VOICE_STORY_PROJECTION = `{
  _id,
  category,
  name,
  "slug": slug.current,
  role,
  venue,
  quote,
  "photoUrl": photo.asset->url,
  "photoAlt": photo.alt,
  photo,
  body,
  recipe,
  qa,
  brandLinks,
  published,
  publishedAt,
  storyPortraitUrl,
  storySquareUrl
}`

export const publishedVoicesQuery = `*[_type == "voiceStory" && published == true && defined(slug.current)] | order(publishedAt desc) ${VOICE_STORY_PROJECTION}`

export const voiceBySlugQuery = `*[_type == "voiceStory" && published == true && slug.current == $slug][0] ${VOICE_STORY_PROJECTION}`

export const relatedVoicesQuery = `*[_type == "voiceStory" && published == true && defined(slug.current) && slug.current != $slug] | order(publishedAt desc)[0...6] ${VOICE_STORY_PROJECTION}`

export const adminVoicesQuery = `*[_type == "voiceStory"] | order(publishedAt desc, _updatedAt desc) ${VOICE_STORY_PROJECTION}`

export const adminVoiceByIdQuery = `*[_type == "voiceStory" && _id == $id][0] ${VOICE_STORY_PROJECTION}`

export const adminNominationsQuery = `*[_type == "voiceNomination"] | order(_createdAt desc) {
  _id,
  nomineeName,
  category,
  contact,
  reason,
  nominatorName,
  relationship,
  status,
  _createdAt
}`
