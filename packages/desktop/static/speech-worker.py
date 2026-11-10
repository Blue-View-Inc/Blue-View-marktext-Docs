# SPDX-License-Identifier: GPL-3.0-or-later
"""Keeps a Piper model loaded; server responses are length-prefixed PCM, never logs."""

import argparse
import json
import struct
import sys
from array import array
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packages', required=True)
    parser.add_argument('--cache-dir', required=True)
    parser.add_argument('--model', required=True)
    parser.add_argument('--output_raw', action='store_true')
    parser.add_argument('--server', action='store_true')
    parser.add_argument('--length_scale', type=float, default=1.1)
    parser.add_argument('--noise_scale', type=float, default=0.45)
    parser.add_argument('--noise_w', type=float, default=0.57)
    parser.add_argument('--sentence_silence', type=float, default=0.15)
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
    def synthesize(text):
        samples = array('h')
        for chunk in voice.synthesize(text, config):
            samples.frombytes(chunk.audio_int16_bytes)
        # Keep quiet consonant edges, replacing only near-silent clip padding.
        start, end = 0, len(samples)
        while start < end and abs(samples[start]) < 32:
            start += 1
        while end > start and abs(samples[end - 1]) < 32:
            end -= 1
        margin = int(voice.config.sample_rate * 0.04)
        pcm = samples[max(0, start - margin):min(len(samples), end + margin)].tobytes()
        return pcm + bytes(int(voice.config.sample_rate * args.sentence_silence) * 2)

    requests = sys.stdin if args.server else [json.dumps({'text': sys.stdin.read()})]
    for line in requests:
        text = json.loads(line)['text']
        if not isinstance(text, str) or not text.strip() or len(text) > 1200:
            raise ValueError('Invalid speech text')
        pcm = synthesize(text)
        if not pcm or len(pcm) > 8 * 1024 * 1024:
            raise ValueError('Invalid audio size')
        if args.server:
            sys.stdout.buffer.write(struct.pack('<I', len(pcm)))
        sys.stdout.buffer.write(pcm)
        sys.stdout.buffer.flush()


if __name__ == '__main__':
    main()
