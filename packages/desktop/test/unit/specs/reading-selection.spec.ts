import { afterEach, describe, expect, it } from 'vitest'
import {
  captureRenderedReadingSelection,
  captureSourceReadingSelection,
  getReadingSelection
} from '@/services/readingSelection'
import { readingSentences } from '@/util/readingText'

const element = (selector: string): HTMLElement => {
  const node = document.querySelector<HTMLElement>(selector)
  if (!node) throw new Error(`Missing test element: ${selector}`)
  return node
}

const selectRange = (range: Range): void => {
  const selected = document.getSelection()
  if (!selected) throw new Error('Selection API unavailable')
  selected.removeAllRanges()
  selected.addRange(range)
}

const spoken = (): string[] => {
  const snapshot = getReadingSelection('document')
  if (!snapshot) return []
  return readingSentences(snapshot.content, true, 'en', snapshot.format).map(s => s.text)
}

afterEach(() => {
  document.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
  captureSourceReadingSelection('document', '')
})

describe('read-aloud selection snapshots', () => {
  it('retains only the highlighted passage after focus removes the live selection', () => {
    document.body.innerHTML = '<div id="editor"><p>Before. Only the highlighted passage. After.</p></div>'
    const editor = element('#editor')
    const text = element('#editor p').firstChild
    if (!text) throw new Error('Missing paragraph text')
    const range = document.createRange()
    range.setStart(text, 8)
    range.setEnd(text, 37)
    selectRange(range)
    captureRenderedReadingSelection('document', editor)
    document.getSelection()?.removeAllRanges()
    expect(spoken()).toEqual(['Only the highlighted passage.'])
    expect(getReadingSelection('another-document')).toBeNull()
  })

  it('retains paragraph boundaries and skips selected code, URLs and hidden markers', () => {
    document.body.innerHTML = '<div id="editor"><p>First.</p><pre><code>secret()</code></pre><p><span class="mu-remove">**</span>Last <a href="https://example.com">paragraph</a>.</p></div>'
    const editor = element('#editor')
    const range = document.createRange()
    range.selectNodeContents(editor)
    selectRange(range)
    captureRenderedReadingSelection('document', editor)
    expect(spoken()).toEqual(['First.', 'Last paragraph.'])
  })

  it('keeps the code context when highlighting only part of a code block', () => {
    document.body.innerHTML = '<div id="editor"><pre><code>secret()</code></pre></div>'
    const editor = element('#editor')
    const range = document.createRange()
    range.selectNodeContents(element('#editor code'))
    selectRange(range)
    captureRenderedReadingSelection('document', editor)
    expect(spoken()).toEqual([])
  })

  it('does not reinterpret visible angle brackets as Markdown HTML', () => {
    document.body.innerHTML = '<div id="editor"><p>Use &lt;example&gt; here.</p></div>'
    const editor = element('#editor')
    const range = document.createRange()
    range.selectNodeContents(element('#editor p'))
    selectRange(range)
    captureRenderedReadingSelection('document', editor)
    expect(spoken()).toEqual(['Use <example> here.'])
  })

  it('ignores selections outside the editor and clears empty source selections', () => {
    captureSourceReadingSelection('document', 'Selected **source** only.')
    expect(spoken()).toEqual(['Selected source only.'])
    document.body.innerHTML = '<div id="editor">Editor</div><p>Outside.</p>'
    const range = document.createRange()
    range.selectNodeContents(element('p'))
    selectRange(range)
    captureRenderedReadingSelection('document', element('#editor'))
    expect(getReadingSelection('document')).toBeNull()
    captureSourceReadingSelection('document', '   ')
    expect(getReadingSelection('document')).toBeNull()
    expect(getReadingSelection()).toBeNull()
  })
})
