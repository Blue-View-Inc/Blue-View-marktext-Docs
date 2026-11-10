# SPDX-License-Identifier: GPL-3.0-or-later
"""Local Piper adapter. Only raw PCM goes to stdout; document text arrives on stdin."""

import argparse
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packages', required=True)
    parser.add_argument('--cache-dir', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--output_raw', action='store_true')
    parser.add_argument('--length_scale', type=float, default=1.1)
    parser.add_argument('--noise_scale', type=float, default=0.45)
    parser.add_argument('--noise_w', type=float, default=0.57)
    parser.add_argument('--sentence_silence', type=float, default=0.3)
    parser.add_argument('--speaker', type=int, default=0)
    args = parser.parse_args()
    sys.path.insert(0, args.packages)

    from piper import PiperVoice, SynthesisConfig

    cache = Path(args.cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    voice = PiperVoice.load(args.model, download_dir=cache)
    config = SynthesisConfig(
        speaker_id=args.speaker,
        length_scale=args.length_scale,
        noise_scale=args.noise_scale,
        noise_w_scale=args.noise_w,
        normalize_audio=True,
    )
    text = sys.stdin.read()
    silence = bytes(int(voice.config.sample_rate * args.sentence_silence) * 2)
    for chunk in voice.synthesize(text, config):
        sys.stdout.buffer.write(chunk.audio_int16_bytes)
        sys.stdout.buffer.write(silence)
        sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
