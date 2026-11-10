import { app, ipcMain, type WebContents } from 'electron'
import path from 'node:path'
import { SpeechSynthesizer } from '../speech'
import { listSpeechVoices, speechVoiceLicense, SpeechVoiceDownloads } from '../speechVoices'
import type { SpeechVoiceSettings } from '@shared/types/speech'

export const registerSpeechHandlers = (): void => {
  const directories = [
    path.join(app.getPath('userData'), 'speech'),
    path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'static', 'speech')
  ]
  const synthesizer = new SpeechSynthesizer(directories)
  const downloads = new SpeechVoiceDownloads(directories[0])
  const observed = new WeakSet<WebContents>()
  ipcMain.handle('mt::speech::synthesize', (event, text: string, voice?: SpeechVoiceSettings) => {
    const sender = event.sender
    const owner = sender.id
    if (!observed.has(sender)) {
      observed.add(sender)
      sender.once('destroyed', () => synthesizer.cancel(owner))
      sender.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => {
        if (isMainFrame) synthesizer.cancel(owner)
      })
    }
    return synthesizer.synthesize(owner, text, voice)
  })
  ipcMain.handle('mt::speech::cancel', (event) => synthesizer.cancel(event.sender.id))
  ipcMain.handle('mt::speech::voices', () => listSpeechVoices(directories))
  ipcMain.handle('mt::speech::voice-license', (_event, id: string) =>
    speechVoiceLicense(id, directories)
  )
  ipcMain.handle('mt::speech::install-voice', (_event, id: string) => downloads.install(id))
  app.once('before-quit', () => {
    synthesizer.cancelAll()
    downloads.cancelAll()
  })
}
