import type { PortableTextBlock } from '@portabletext/types'

type Span = { _type: 'span'; _key: string; text: string; marks: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function blocksToPlainText(body: PortableTextBlock[] | null | undefined): string {
  if (!Array.isArray(body)) return ''
  return body
    .map((block) => {
      if (!isRecord(block) || block._type !== 'block') return ''
      const children = Array.isArray(block.children) ? block.children : []
      return children
        .map((child) => (isRecord(child) && typeof child.text === 'string' ? child.text : ''))
        .join('')
    })
    .filter(Boolean)
    .join('\n\n')
}

export function plainTextToBlocks(text: string): PortableTextBlock[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return []
  return paragraphs.map((para, i) => {
    const span: Span = { _type: 'span', _key: `s${i}`, text: para, marks: [] }
    return {
      _type: 'block',
      _key: `b${i}`,
      style: 'normal',
      markDefs: [],
      children: [span],
    } as PortableTextBlock
  })
}
