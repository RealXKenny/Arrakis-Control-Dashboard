# Third-Party Licenses and Attributions

This document records the upstream code, direct runtime dependencies, fonts and redistributed assets reviewed for version 2.0.0. Third-party materials retain their own terms; the project's MIT License does not replace them.

## dune-awakening-selfhost-docker

- **Original author:** RedBlink
- **Repository:** https://github.com/Red-Blink/dune-awakening-selfhost-docker
- **License:** MIT License
- **Copyright:** Copyright (c) 2026 RedBlink
- **Relationship:** Software incorporated or adapted for Arrakis Control Dashboard

### Original MIT license text

```text
MIT License

Copyright (c) 2026 RedBlink

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Direct runtime dependency inventory

The installed package metadata and lockfile were checked for the 2.0.0 release. npm retains each package's own license text on installation; transitive dependencies and exact versions are locked in `package-lock.json`.

| Package                      | License      | Package              | License |
| ---------------------------- | ------------ | -------------------- | ------- |
| `@fontsource/jetbrains-mono` | OFL-1.1      | `amqplib`            | MIT     |
| `dotenv`                     | BSD-2-Clause | `iframe-resizer`     | MIT     |
| `ioredis`                    | MIT          | `next`               | MIT     |
| `next-auth`                  | ISC          | `react`, `react-dom` | MIT     |
| `three`                      | MIT          | `tsx`                | MIT     |
| `zod`                        | MIT          |                      |         |

## Original dashboard artwork and sounds

The landing illustrations, geometric casino emblems, SVG playing-card faces and backs, and synthesized interface/game sound palette are original project work. Their source is in `src/features/landing`, `src/features/casino/components`, and `src/lib/audio/manager.ts`; they do not use official game recordings or downloaded sound effects. Original contributions fall under the root [LICENSE](../../LICENSE).

## Game-derived maps, models, terrain and item images

`src/assets/maps`, `src/assets/models`, `src/assets/terrain`, and the extracted item artwork under `src/assets/items` contain game-derived images, textures, terrain or model data. Rights in Dune: Awakening artwork remain with Funcom and the respective rights holders; these assets are **not** relicensed under MIT. Model regeneration records the `dev-prophet-code/MapViewer3D` `cdn` source tree in `scripts/maintenance/build-client-models.mjs`. The item-image provenance, extraction credit and swatch terms are preserved in [Catalog Image Attribution](../../src/assets/items/ATTRIBUTION.md).

The 112 palette-derived swatch tiles are CC BY-NC-SA 4.0, not MIT. Their noncommercial and share-alike restrictions must be preserved; commercial redistribution is not covered by that license. No permission is claimed here for commercial use of game artwork. Maintainers must confirm that the intended fan-project distribution of game-derived assets is acceptable before publication.

## Archivo and JetBrains Mono fonts

Archivo is loaded through `next/font/google`; JetBrains Mono is loaded there and is also pinned through `@fontsource/jetbrains-mono`. The fonts remain under SIL Open Font License 1.1:

- Archivo: Copyright 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo), [license source](https://github.com/google/fonts/blob/main/ofl/archivo/OFL.txt).
- JetBrains Mono: Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono), [license source](https://github.com/google/fonts/blob/main/ofl/jetbrainsmono/OFL.txt).

```text
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

## iframe-resizer 4.3.11

The HetrixTools report uses the locally bundled parent resize helper from David J. Bradshaw’s iframe-resizer, pinned to the provider-compatible 4.3.11 release. Source: https://github.com/davidjbradshaw/iframe-resizer/tree/v4.3.11.

```text
The MIT License (MIT)

Copyright (c) 2013-2023 David J. Bradshaw

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Solaris dealer narration assets

The locally hosted casino voice pack is generated with the Apache-licensed Kokoro-82M v1.0 model and stock `af_heart` English voice. See [casino voice pack attribution](casino-voice-pack.md) for the pinned model source, full license location, upstream acknowledgments and regeneration instructions. Only pre-generated audio ships with the application; generation tools are not runtime dependencies.
