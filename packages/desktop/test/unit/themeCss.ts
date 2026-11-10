import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const readThemeCss = (file: string): string => {
  const css = readFileSync(file, 'utf8').replace(
    /@import ['"]([^'"]+)['"];?/g,
    (_, relative: string) => readThemeCss(resolve(dirname(file), relative))
  )
  if (!/blueview-(light|dark)\.theme\.css$/.test(file)) return css
  const tokens = readFileSync(resolve(dirname(file), '../blueview-design/tokens.css'), 'utf8')
  const light = tokens.slice(0, tokens.indexOf('@media (prefers-color-scheme: dark)'))
  const dark = tokens.slice(tokens.lastIndexOf(":root[data-theme='dark']"))
  return light + (file.endsWith('blueview-dark.theme.css') ? dark : '') + css
}
