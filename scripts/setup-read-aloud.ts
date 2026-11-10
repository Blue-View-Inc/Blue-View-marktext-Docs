import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const voiceBase =
  'https://huggingface.co/rhasspy/piper-voices/resolve/cf910fb59f1d79ab3b625a63993a108751c6c25d/en/en_US/lessac/medium'
const files = [
  {
    name: 'en_US-lessac-medium.onnx',
    url: `${voiceBase}/en_US-lessac-medium.onnx`,
    sha256: '5efe09e69902187827af646e1a6e9d269dee769f9877d17b16b1b46eeaaf019f'
  },
  {
    name: 'en_US-lessac-medium.onnx.json',
    url: `${voiceBase}/en_US-lessac-medium.onnx.json`,
    sha256: 'efe19c417bed055f2d69908248c6ba650fa135bc868b0e6abb3da181dab690a0'
  }
]

const download = async(url: string): Promise<Buffer> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`)
  return Buffer.from(await response.arrayBuffer())
}

const main = async(): Promise<void> => {
  if (process.platform !== 'linux' || process.arch !== 'x64') {
    throw new Error('The bundled Read Aloud voice setup currently supports Linux x64.')
  }
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'marktext-voice-'))
  const destination = fileURLToPath(new URL('../packages/desktop/static/speech/', import.meta.url))
  try {
    for (const file of files) {
      console.log(`Downloading ${file.name}…`)
      const data = await download(file.url)
      const hash = createHash('sha256').update(data).digest('hex')
      if (hash !== file.sha256) throw new Error(`Checksum mismatch: ${file.name}`)
      await writeFile(path.join(temporary, file.name), data)
    }
    console.log('Preparing the multilingual speech runtime…')
    const interpreters = path.join(temporary, 'interpreters')
    execFileSync(
      'uv',
      ['python', 'install', '3.12.12', '--install-dir', interpreters, '--no-bin'],
      { stdio: 'inherit' }
    )
    const entries = await readdir(interpreters, { withFileTypes: true })
    const interpreter = entries.find(
      (entry) => entry.isDirectory() && entry.name.startsWith('cpython-3.12.12-')
    )
    if (!interpreter) throw new Error('Private Python runtime not found')
    const python = path.join(interpreters, interpreter.name)
    const packages = path.join(temporary, 'python-packages')
    execFileSync(
      'uv',
      [
        'pip',
        'install',
        '--python',
        path.join(python, 'bin', 'python3'),
        '--target',
        packages,
        '--requirements',
        fileURLToPath(new URL('./read-aloud-requirements.txt', import.meta.url))
      ],
      { stdio: 'inherit' }
    )
    await cp(python, path.join(temporary, 'python'), { recursive: true, verbatimSymlinks: true })
    await cp(
      fileURLToPath(new URL('../packages/desktop/static/speech-worker.py', import.meta.url)),
      path.join(temporary, 'speech-worker.py')
    )
    await writeFile(path.join(temporary, 'MODEL_CARD'), await download(`${voiceBase}/MODEL_CARD`))
    await writeFile(
      path.join(temporary, 'PIPER-LICENSE.md'),
      await download('https://raw.githubusercontent.com/OHF-Voice/piper1-gpl/v1.8.0/COPYING')
    )
    await mkdir(destination, { recursive: true })
    for (const name of [
      'python',
      'python-packages',
      'speech-worker.py',
      'en_US-lessac-medium.onnx',
      'en_US-lessac-medium.onnx.json',
      'MODEL_CARD',
      'PIPER-LICENSE.md'
    ]) {
      await cp(path.join(temporary, name), path.join(destination, name), {
        recursive: true,
        verbatimSymlinks: true
      })
    }
    console.log('Offline Read Aloud voice installed. The next app package will include it.')
    await rm(path.join(destination, 'piper'), { recursive: true, force: true })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
