# Blue View Docs

<img src="packages/desktop/static/brand/truedocs/truedocs-mark.svg" alt="Blue View TrueDocs" width="120">

A desktop Markdown editor based on [MarkText](https://github.com/marktext/marktext), with Blue View’s TrueDocs branding, light and dark themes, and offline read-aloud.

- Edit Markdown with live preview, source mode, tables, math and diagrams.
- Read documents aloud with play, pause, sentence and paragraph navigation, and speed controls.
- Choose from 180 voice models across 53 languages. Each language shows up to five recommended models; all models and available speakers remain accessible.
- Adjust delivery, expression and pauses, preview a voice, and save settings per voice and speaker. These settings calibrate existing models; they do not train new voices.
- Collapse the reading controls automatically during playback.
- Review each voice’s model card and license before downloading. Voice licenses vary.

## Build and run

Use Node.js 22.12 or newer and pnpm 10. Linux builds require the native development libraries described in [the build guide](packages/website/content/docs/dev/BUILD.md).

```sh
pnpm install
pnpm run setup-read-aloud
pnpm run dev
```

The speech setup currently supports Linux x64. It downloads a private Python runtime, Piper, its dependencies and the default English voice. Other voices download on demand. Speech runs locally once a voice is installed. Runtime binaries and voice weights are excluded from Git.

```sh
pnpm run build:unpack
pnpm run lint
pnpm run typecheck
pnpm run test:unit
```

See [read-aloud implementation and licenses](packages/website/content/docs/dev/READ_ALOUD.md) for setup details and limitations. Existing MarkText developer documentation remains under [packages/website/content/docs/dev](packages/website/content/docs/dev).

## License and attribution

This is a public, source-available repository. Blue View’s original additions are offered under the [BlueView Non-Commercial License](LICENSE-BLUEVIEW-NONCOMMERCIAL.txt). A non-commercial restriction does not meet the OSI definition of open source.

Upstream MarkText and Muya retain their MIT licenses and original commercial permissions. Piper and the speech adapter retain GPL terms. Voice models, fonts and branding have their own notices. No Blue View restriction overrides those third-party rights. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Credits: MarkText contributors, Muya contributors, Piper contributors and voice creators. Blue View design assets come from [blueview-design](https://github.com/Blue-View-Inc/blueview-design) and the company’s TrueDocs brand assets.
