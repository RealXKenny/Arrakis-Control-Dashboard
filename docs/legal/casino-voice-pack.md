# Casino dealer voice pack

The **Solaris Dealer v1** recordings are synthetic narration generated locally from the dashboard’s original game announcement scripts. The selected stock English voice is `af_heart` from [Kokoro-82M v1.0](https://huggingface.co/hexgrad/Kokoro-82M). This is a general model voice; no custom voice cloning, celebrity imitation, official game recordings, or Dune character voices were used.

## Sources and license

- Original model: [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), Apache License 2.0.
- ONNX conversion: [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX), Apache License 2.0, pinned revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231`.
- Offline generation library: [Kokoro.js](https://github.com/hexgrad/kokoro/tree/main/kokoro.js), version 1.2.1, Apache License 2.0.
- Generated recordings: Apache License 2.0, with original scripts by Arrakis Control Dashboard contributors.

The full license and attribution notice accompany the audio in `src/assets/audio/casino/solaris-v1/LICENSE.txt` and `NOTICE.txt`. Those source files are not exposed by the public audio route. The manifest records the model revision, voice, speed, sample rate, encoding, spoken script, sizes and SHA-256 checksums. Recordings were trimmed, loudness-normalized and compressed to mono 24 kHz / 48 kbit/s MP3. Only these audio assets ship; the model, inference libraries and generation executables are not application dependencies.

The upstream multilingual model card acknowledges [Koniwa’s tnc corpus](https://github.com/koniwa/koniwa), under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), and [The SIWIS French Speech Synthesis Database](https://datashare.ed.ac.uk/handle/10283/2353), under CC BY 4.0, by Junichi Yamagishi, Pierre-Edouard Honnet, Philip Garner and Alexandros Lazaridis. These acknowledgments describe the upstream model; they do not assert that the English voice uses either particular dataset.

## Regenerating the pack

Normal application builds and deployments use the committed recordings and do not download a model or synthesize audio. Regeneration is an optional authoring operation. It needs Node.js, the free generation dependencies, and FFmpeg. From the repository root on Windows:

```powershell
npm install --prefix .next/cache/casino-voice-tools --no-audit --no-fund --save-exact kokoro-js@1.2.1 @huggingface/transformers@3.8.1 @ffmpeg-installer/win32-x64@4.1.0
node scripts/maintenance/build-casino-voice-pack.mjs
```

On Linux/macOS, install `kokoro-js@1.2.1` and `@huggingface/transformers@3.8.1` in the same tools directory and make FFmpeg available on `PATH`. Tooling and model downloads stay in the ignored `.next/cache/casino-voice-tools/` directory. The script uses the pinned model revision, resumes existing generated clips and writes a new manifest after completion. Changes to scripts, processing or voice settings require a new pack version or deliberate regeneration; review the resulting audio and checksums before replacing the shipped pack. Never add generation to application startup or release installation.

See [The Solaris Exchange](../features/solaris-exchange.md#cards-presentation-and-audio) for playback, preferences, fallbacks and privacy behavior.
