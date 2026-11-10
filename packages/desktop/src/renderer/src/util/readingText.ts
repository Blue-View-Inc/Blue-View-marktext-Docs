import { renderToStaticHTML } from '@muyajs/core'
import type { ReadingSentence } from '@/services/readAloud'

const omitWebAddresses = (text: string): string =>
  text.replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>"\u200b，。！？；：、（）【】「」『』]+/gi, (address) =>
    address.match(/[.,;:!?)\]}]+$/)?.[0] ?? ' '
  )

const hasReadingText = (text: string): boolean => Boolean(text) && !/^[\p{P}\s]+$/u.test(text)

const splitLongSentence = (text: string): string[] => {
  const characters = Array.from(text)
  const parts: string[] = []
  while (characters.length) {
    let end = Math.min(500, characters.length)
    if (characters.length > end) {
      for (let i = end; i > 250; --i) {
        if (/\s/.test(characters[i])) {
          end = i
          break
        }
      }
    }
    const part = characters.splice(0, end).join('').trim()
    if (part) parts.push(part)
  }
  return parts
}

/** Inert export markup supplies prose without exposing Markdown punctuation or loading images. */
export const readingSentences = (
  markdown: string,
  skipCitations = true,
  language?: string,
  format: 'markdown' | 'html' = 'markdown'
): ReadingSentence[] => {
  const template = document.createElement('template')
  const proseMarkdown = markdown.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  template.innerHTML = format === 'html'
    ? proseMarkdown
    : renderToStaticHTML(proseMarkdown, { footnote: true, frontMatter: true })
  const root = template.content
  root
    .querySelectorAll('script, style, pre, svg, math, .katex, .front-matter, .frontmatter')
    .forEach((node) => node.remove())
  for (const code of root.querySelectorAll('code')) {
    const container = code.parentElement
    if (container && container.textContent?.trim() === code.textContent?.trim()) code.remove()
  }
  for (const link of root.querySelectorAll('a[href]')) {
    const label = link.textContent?.trim() ?? ''
    try {
      const destination = new URL(link.getAttribute('href') ?? '')
      const address = destination.host + destination.pathname + destination.search + destination.hash
      if (
        /^(https?|ftp):$/.test(destination.protocol) &&
        (label === destination.href ||
          label === destination.host ||
          label.replace(/\/$/, '') === address.replace(/\/$/, ''))
      ) link.replaceWith(document.createTextNode(' '))
    } catch {
      // Relative links keep their descriptive labels.
    }
  }
  if (skipCitations) {
    root
      .querySelectorAll('.footnotes, [role="doc-noteref"], [role="doc-endnotes"], sup.footnote-ref')
      .forEach((node) => node.remove())
    for (const heading of root.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      if (!/^(references|bibliography|works cited)$/i.test(heading.textContent?.trim() ?? ''))
        continue
      let node = heading.nextElementSibling
      while (node && !(/^H[1-6]$/.test(node.tagName) && node.tagName <= heading.tagName)) {
        const next = node.nextElementSibling
        node.remove()
        node = next
      }
      heading.remove()
    }
  }
  root
    .querySelectorAll('img')
    .forEach((image) => image.replaceWith(document.createTextNode(image.alt)))
  root.querySelectorAll('br').forEach((node) => node.replaceWith(document.createTextNode(' ')))
  root
    .querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, tr, div, section')
    .forEach((node) => {
      node.append(document.createTextNode('\n\n'))
    })
  root.querySelectorAll('td, th').forEach((node) => node.append(document.createTextNode(' ')))
  const paragraphs = omitWebAddresses(root.textContent ?? '')
    .split(/\n\s*\n/)
    .map((text) =>
      (skipCitations ? text.replace(/\[@[^\]]+\]/g, '') : text)
        .replace(/\(\s*\)|\[\s*\]/g, ' ')
        .replace(/\s+([.,;:!?，。！？；：、])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter(hasReadingText)
  const segmenter = new Intl.Segmenter(language?.replace('_', '-'), { granularity: 'sentence' })
  return paragraphs.flatMap((text, paragraph) =>
    [...segmenter.segment(text)].flatMap(({ segment }) =>
      splitLongSentence(segment.trim()).filter(hasReadingText).map((text) => ({ text, paragraph }))
    )
  )
}
