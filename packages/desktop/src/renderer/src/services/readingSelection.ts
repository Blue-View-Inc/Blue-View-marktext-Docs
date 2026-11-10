export interface ReadingSelection {
  documentId: string
  content: string
  format: 'markdown' | 'html'
}

let selection: ReadingSelection | null = null

export const captureSourceReadingSelection = (documentId: string, content: string): void => {
  selection = content.trim() ? { documentId, content, format: 'markdown' } : null
}

/** Snapshot before a native popup takes focus; retain block context for code exclusion. */
export const captureRenderedReadingSelection = (documentId: string, editor: HTMLElement): void => {
  selection = null
  const selected = document.getSelection()
  if (!selected || selected.isCollapsed || !selected.rangeCount) return
  const range = selected.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return
  const ancestor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer as HTMLElement
    : range.commonAncestorContainer.parentElement
  const context = ancestor?.closest('pre') ?? ancestor
  const wrapper = context ? context.cloneNode(false) as HTMLElement : document.createElement('div')
  wrapper.append(range.cloneContents())
  wrapper.querySelectorAll('.mu-remove, button, [aria-hidden="true"]').forEach(node => node.remove())
  selection = { documentId, content: wrapper.outerHTML, format: 'html' }
}

export const getReadingSelection = (documentId?: string): ReadingSelection | null =>
  selection && selection.documentId === documentId ? { ...selection } : null
