# Read Aloud

Open **Edit → Read Aloud**, or use **Read Aloud** above the document. The player
reads a snapshot of the active document, including unsaved edits in source mode.
It shows the current sentence and supports pause/resume, previous/next sentence,
previous/next paragraph, stop, and playback speeds from 0.5× to 2×. Pause retains
the audio position. Switching documents stops playback.

Controls automatically collapse to a compact Pause/Stop bar during playback.
**Show controls** expands them without stopping speech. Pausing, finishing, or
encountering an error restores the full controls. **Hide controls** collapses
them manually, and the auto-hide checkbox keeps them expanded when desired.

The voice runs locally through Piper. Document text is never sent to a
speech service. Code blocks and front matter are omitted; citations and reference
sections can also be skipped. Speed changes preserve pitch. The next sentence is
prepared during playback, and only adjacent audio is retained in memory.

## Voice setup and packaging

For Linux x64, install `uv` and run `pnpm setup-read-aloud` before packaging. This
prepares a private CPython 3.12.12 interpreter, Piper 1.8.0 with Chinese, Japanese
and Thai frontends, and the US English Lessac medium voice. Voice files are
checked against pinned SHA-256 hashes; Python dependencies are pinned in
`scripts/read-aloud-requirements.txt`. Resources live under
`packages/desktop/static/speech/` (ignored by Git).
The existing `extraResources` packaging rule includes that directory. Voice files
are optional for ordinary development builds; the player reports an unavailable
voice when they are absent.

The main process first checks `<userData>/speech/`, then the app's `static/speech/`.
The runtime directory contains `python/bin/python3`, `python-packages/`, and
`speech-worker.py`. Models can be bundled directly in that directory or installed
under `voices/<voiceId>/`. The setup script currently provides the Linux x64
runtime and one English voice. Other models download from the app on demand.

The runtime's license and the voice model card are included in the download.
Upstream sources: [Piper 1.8.0](https://github.com/OHF-Voice/piper1-gpl/tree/v1.8.0) and
[Lessac medium](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac/medium).
Review the model card and its dataset terms when distributing a build.

## Languages, voices, and calibration

The pinned catalog contains 180 voice models across 53 languages. The app shows
up to five distinct recommended voices per language, using the catalog's quality
tiers. These rankings are metadata-based, not listening-test results. A checkbox
also exposes all models. Multi-speaker models offer a speaker selector.

Voice downloads use a fixed upstream revision and verify each file's size and
catalog digest before atomically making the voice available. The voice's model
card is shown as plain text in the settings panel. Licenses vary; availability
does not imply unrestricted commercial use. The bundled Lessac model references
a research dataset license. Piper 1.8.0 is GPL-3.0-or-later, and its dependencies
retain their own licenses included alongside the installed Python packages.

The **Voice and calibration** panel offers delivery presets, expression, sentence
pauses, paragraph pauses, preview, and language selection. Speed, delivery, and
pause preferences are remembered separately for each voice and speaker. The
default preset is **Warm and relaxed**. These are synthesis settings, not newly
trained models. Preview uses the document's first sentence; choosing a language
does not translate the document. Some pronunciation frontends may download
additional language data on first use; later synthesis runs locally.

## IPC and lifecycle

The sandboxed renderer requests one bounded sentence through
`mt::speech::synthesize`. Main passes it to the fixed Piper executable on stdin
and returns WAV bytes. There is one active synthesis per renderer; canceling,
navigating, closing the window, or quitting terminates that renderer's process.
The renderer owns audio playback and releases object URLs on stop. Generation
counters keep late synthesis results from restarting canceled playback.

For local playback checks, prepare the voice runtime, build the app, and run
`pnpm -C packages/desktop exec playwright test test/e2e/read-aloud.spec.ts`.
Set `MARKTEXT_TEST_SPEECH_VOICES=1` to also test downloads and Spanish/Japanese
preview. These use temporary profiles and muted playback.
