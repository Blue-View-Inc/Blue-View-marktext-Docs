import baseStyle from '@/assets/styles/index.css?inline'
import blueViewTokens from '@/assets/blueview-design/tokens.json'

const themeStyles = import.meta.glob('../../assets/themes/*.theme.css', {
  query: '?inline',
  import: 'default',
  eager: true
}) as Record<string, string>

export const themePreviewStyle = (name: string): Record<string, string> => {
  if (name === 'blueview-dark') {
    return {
      background: '#141a16',
      color: '#e6e8df',
      '--preview-link': '#9fc57e',
      '--preview-code': '#232d25'
    }
  }
  if (name === 'blueview-light') {
    const palette = blueViewTokens.light
    return {
      background: palette.backdrop.ground.stops[0].color,
      color: palette.text.ink,
      '--preview-link': palette.accent,
      '--preview-code': palette.card.fill
    }
  }
  const source = baseStyle + (themeStyles[`../../assets/themes/${name}.theme.css`] ?? '')
  const variables = new Map<string, string>()
  for (const match of source.matchAll(
    /--(editorBgColor|editorColor|themeColor|codeBgColor)\s*:\s*([^;]+);/g
  )) {
    variables.set(match[1], match[2].trim())
  }
  return {
    background: variables.get('editorBgColor') ?? 'transparent',
    color: variables.get('editorColor') ?? 'inherit',
    '--preview-link': variables.get('themeColor') ?? 'currentColor',
    '--preview-code': variables.get('codeBgColor') ?? 'transparent'
  }
}
