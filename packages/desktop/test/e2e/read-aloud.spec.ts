import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import path from 'node:path'
import type CodeMirror from 'codemirror'
import { clickMenuById, enterSourceMode, launchWithMarkdown, toggleReadingMode } from './helpers'

test.skip(
  !existsSync(path.resolve(__dirname, '../../static/speech/python/bin/python3')),
  'Run pnpm setup-read-aloud before testing local speech.'
)

test('reads locally with sentence/paragraph navigation, pause and speed controls', async() => {
  test.setTimeout(90000)
  const { app, page } = await launchWithMarkdown(
    'This is the opening sentence, with enough words to keep the voice reading while the controls are tested. The second sentence follows.\n\nHere is the second paragraph.\n\nThe final paragraph is ready.'
  )
  try {
    await page.getByRole('button', { name: 'Use dark mode', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.document-body')).toHaveCSS('background-color', 'rgb(28, 36, 30)')
    await expect(page.locator('.title-bar')).toHaveCSS('background-color', 'rgba(28, 36, 30, 0.94)')
    await page.getByRole('button', { name: 'Use light mode', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.evaluate(() => {
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function() {
        this.muted = true
        return play.call(this)
      }
    })
    await page.getByRole('button', { name: 'Read Aloud', exact: true }).click()
    await expect(page.locator('.reading-status')).toContainText('Sentence 1/', { timeout: 30000 })
    await expect(page.locator('.compact-controls')).toBeVisible()
    await expect(page.locator('.voice-settings')).toBeHidden()
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await expect(page.locator('.reading-status')).toHaveText('Paused')
    await page.getByRole('button', { name: 'Next sentence', exact: true }).click()
    await expect(page.locator('.reading-sentence')).toHaveText('The second sentence follows.')
    await page.getByRole('button', { name: 'Next paragraph', exact: true }).click()
    await expect(page.locator('.reading-sentence')).toHaveText('Here is the second paragraph.')
    await page.getByRole('button', { name: 'Previous paragraph', exact: true }).click()
    await expect(page.locator('.reading-sentence')).toContainText('This is the opening sentence')
    await page.getByRole('slider', { name: 'Speed', exact: true }).evaluate((input) => {
      const range = input as HTMLInputElement
      range.value = '1.5'
      range.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(page.locator('.reading-speed output')).toHaveText('1.50×')
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect(page.locator('.reading-status')).toContainText('Sentence 1/', { timeout: 30000 })
    await page.screenshot({ path: '/tmp/marktext-read-aloud.png' })
    await page.getByRole('button', { name: 'Stop reading', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Read Aloud', exact: true })).toBeVisible()

    await enterSourceMode(page, app)
    await page.evaluate(() => {
      const element = document.querySelector('.source-code .CodeMirror') as HTMLElement & {
        CodeMirror: { setValue(value: string): void }
      }
      element.CodeMirror.setValue('Unsaved source text is also readable.')
    })
    await clickMenuById(app, 'readAloudMenuItem')
    await expect(page.locator('.reading-sentence')).toHaveText(
      'Unsaved source text is also readable.'
    )
    await expect(page.locator('.reading-status')).toContainText('Sentence 1/', { timeout: 30000 })
    await page.getByRole('button', { name: 'Stop reading', exact: true }).click()
    await page.getByRole('button', { name: 'Read Aloud', exact: true }).click()
    await expect(page.locator('.reading-status')).toContainText('Sentence 1/', { timeout: 30000 })
    await page.getByRole('button', { name: 'Show controls', exact: true }).click()
    await page.getByRole('button', { name: 'Voice and calibration', exact: true }).click()
    const language = page.getByRole('combobox', { name: 'Language', exact: true })
    await expect(language.locator('option')).toHaveCount(53)
    await expect(page.getByRole('combobox', { name: 'Delivery', exact: true })).toHaveValue(
      'relaxed'
    )
    await page
      .getByRole('checkbox', { name: 'Automatically hide controls during playback', exact: true })
      .uncheck()
    await page.getByRole('button', { name: 'Hide controls', exact: true }).click()
    await expect(page.locator('.compact-controls')).toBeVisible()
    await page.getByRole('button', { name: 'Show controls', exact: true }).click()
    await page.getByRole('button', { name: 'Voice and calibration', exact: true }).click()
    await page.screenshot({ path: '/tmp/marktext-read-aloud-calibration.png' })
    await page.getByRole('button', { name: 'Stop reading', exact: true }).click()
  } finally {
    await app.close()
  }
})

test('continues naturally across sentences while omitting code blocks and URLs', async() => {
  test.setTimeout(60000)
  const { app, page } = await launchWithMarkdown(
    'A short beginning. The second sentence follows naturally.\n\n```js\nnever_read_this_code()\n```\n\nhttps://example.com/never-read-this-address. The [next paragraph](https://example.com/guide) is ready.'
  )
  try {
    await page.evaluate(() => {
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function() {
        this.muted = true
        return play.call(this)
      }
    })
    await page.getByRole('button', { name: 'Read Aloud', exact: true }).click()
    await expect(page.locator('.reading-status')).toContainText('Sentence 1/3', { timeout: 30000 })
    await expect(page.locator('.reading-status')).toContainText('Sentence 2/3', { timeout: 10000 })
    await expect(page.locator('.reading-status')).toContainText('Sentence 3/3', { timeout: 10000 })
    await expect(page.locator('.reading-status')).toHaveText('Finished', { timeout: 10000 })
    await expect(page.locator('.reading-sentence')).toHaveText('The next paragraph is ready.')
  } finally {
    await app.close()
  }
})

test('reads only a right-click selection in editing, reading and source modes', async() => {
  test.setTimeout(120000)
  const chosen = 'Only this highlighted sentence should be read aloud.'
  const { app, page } = await launchWithMarkdown(
    `Before is outside the selection.\n\nUnselected start. ${chosen} Unselected end.\n\nAfter is outside the selection.`
  )
  try {
    await app.evaluate(({ Menu }) => {
      const state = globalThis as unknown as { selectionMenuLabels: string[]; selectionPopupCount: number }
      state.selectionMenuLabels = []
      state.selectionPopupCount = 0
      Menu.prototype.popup = function(options = {}) {
        state.selectionPopupCount++
        state.selectionMenuLabels = this.items.map(item => item.label)
        const item = this.items.find(item => item.label === 'Read Selection Aloud')
        if (item?.enabled) item.click(item, options.window, {} as Electron.KeyboardEvent)
        options.callback?.()
      }
    })
    await page.evaluate(() => {
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function() {
        this.muted = true
        return play.call(this)
      }
    })
    await page.locator('.mu-paragraph .mu-content').first().click({ button: 'right' })
    await expect.poll(() => app.evaluate(() =>
      (globalThis as unknown as { selectionPopupCount: number }).selectionPopupCount
    )).toBeGreaterThan(0)
    await expect.poll(() => app.evaluate(() =>
      (globalThis as unknown as { selectionMenuLabels: string[] }).selectionMenuLabels
    )).not.toContain('Read Selection Aloud')

    for (const mode of ['editing', 'reading', 'source']) {
      if (mode === 'reading') await toggleReadingMode(page)
      if (mode === 'source') {
        await toggleReadingMode(page)
        await enterSourceMode(page, app)
      }
      const point = await page.evaluate(({ chosen, source }) => {
        if (source) {
          const element = document.querySelector('.source-code .CodeMirror') as HTMLElement & { CodeMirror: CodeMirror.Editor }
          const cm = element.CodeMirror
          const start = cm.getValue().indexOf(chosen)
          const from = cm.posFromIndex(start)
          cm.setSelection(from, cm.posFromIndex(start + chosen.length))
          cm.focus()
          const coordinates = cm.charCoords(from, 'window')
          return { x: coordinates.left + 5, y: coordinates.top + 5 }
        }
        const editor = document.querySelector('.editor-component')
        if (!editor) throw new Error('Editor not found')
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
        let text = walker.nextNode()
        while (text && !text.textContent?.includes(chosen)) text = walker.nextNode()
        if (!text) throw new Error('Selected passage not found')
        const start = (text.textContent ?? '').indexOf(chosen)
        const range = document.createRange()
        range.setStart(text, start)
        range.setEnd(text, start + chosen.length)
        const selected = document.getSelection()
        if (!selected) throw new Error('Selection API unavailable')
        selected.removeAllRanges()
        selected.addRange(range)
        const rectangle = range.getBoundingClientRect()
        return { x: rectangle.left + 5, y: rectangle.top + 5 }
      }, { chosen, source: mode === 'source' })
      await page.mouse.click(point.x, point.y, { button: 'right' })
      await expect(page.locator('.reading-status')).toContainText('Sentence 1/1', { timeout: 30000 })
      await page.getByRole('button', { name: 'Pause', exact: true }).click()
      await expect(page.locator('.reading-sentence')).toHaveText(chosen)
      await expect(page.locator('.reading-controls strong')).toHaveText('Read Selection Aloud')
      await expect(page.getByRole('button', { name: 'Read document', exact: true })).toBeVisible()
      if (mode === 'editing') {
        await page.locator('.skip-citations input').uncheck()
        await expect(page.locator('.reading-status')).toContainText('Sentence 1/1', { timeout: 30000 })
        await page.getByRole('button', { name: 'Pause', exact: true }).click()
        await expect(page.locator('.reading-sentence')).toHaveText(chosen)
      }
      await page.getByRole('button', { name: 'Stop reading', exact: true }).click()
    }
    await expect(page.locator('.tabs-container li.unsaved')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('downloads a second-language voice and previews its calibration', async() => {
  test.skip(
    process.env.MARKTEXT_TEST_SPEECH_VOICES !== '1',
    'Opt in to voice downloads with MARKTEXT_TEST_SPEECH_VOICES=1.'
  )
  test.setTimeout(180000)
  const { app, page } = await launchWithMarkdown(
    'Esta es una prueba de lectura en español, con una voz local y un ritmo tranquilo para escuchar el documento con claridad.'
  )
  try {
    await page.evaluate(() => {
      const play = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function() {
        this.muted = true
        return play.call(this)
      }
    })
    await page.getByRole('button', { name: 'Read Aloud', exact: true }).click()
    await page.getByRole('button', { name: 'Voice and calibration', exact: true }).click()
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('es')
    await page.getByRole('checkbox', { name: 'Show all voice models', exact: true }).check()
    await page
      .getByRole('combobox', { name: 'Voice', exact: true })
      .selectOption('es_ES-davefx-medium')
    await page.getByRole('button', { name: /^Download voice/ }).click()
    await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeEnabled({
      timeout: 120000
    })
    await page.getByRole('button', { name: 'Preview voice', exact: true }).click()
    await expect(page.locator('.reading-status')).toContainText('Sentence 1/', { timeout: 30000 })
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.getByRole('button', { name: 'Voice and calibration', exact: true }).click()
    await page.getByText('Voice license and model card', { exact: true }).click()
    await expect(page.locator('.voice-settings details pre')).toContainText('davefx', {
      timeout: 30000
    })
    await page.screenshot({ path: '/tmp/marktext-read-aloud-spanish.png' })
    await enterSourceMode(page, app)
    await page.evaluate(() => {
      const element = document.querySelector('.source-code .CodeMirror') as HTMLElement & {
        CodeMirror: { setValue(value: string): void }
      }
      element.CodeMirror.setValue(
        'これは日本語の文章を自然な声でゆっくり読み上げるためのテストです。次の文章も読むことができます。'
      )
    })
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ja')
    await page.getByRole('button', { name: /^Download voice/ }).click()
    await expect(page.getByRole('button', { name: 'Preview voice', exact: true })).toBeEnabled({
      timeout: 120000
    })
    await page.getByRole('button', { name: 'Preview voice', exact: true }).click()
    await expect(page.locator('.reading-status')).toContainText('Sentence 1/', { timeout: 30000 })
    await expect(page.locator('.compact-controls')).toBeVisible()
  } finally {
    await app.close()
  }
})
