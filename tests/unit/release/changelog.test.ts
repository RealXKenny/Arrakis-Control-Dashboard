import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../../../src/features/changelog/server/read';

describe('changelog parser', () => {
  it('turns release markdown into display-ready sections', () => {
    const releases = parseChangelog(`# Changelog

## [1.2.3] - 2026-09-20

### Added

- A shiny feature.
- Another shiny feature.

[Full comparison](https://example.com/compare)
`);

    expect(releases).toEqual([
      {
        version: '1.2.3',
        date: '2026-09-20',
        sections: [{ title: 'Added', items: ['A shiny feature.', 'Another shiny feature.'] }],
      },
    ]);
  });

  it('reads the Patch Notes format, with items grouped under its section names', () => {
    expect(
      parseChangelog(`## Patch Notes v2.0.0
### New Features
- One.
### Fixes
- Two.
- Three.

## Patch Notes v1.4.7
### Improvements
- Older.
`),
    ).toEqual([
      {
        version: '2.0.0',
        date: '',
        sections: [
          { title: 'New Features', items: ['One.'] },
          { title: 'Fixes', items: ['Two.', 'Three.'] },
        ],
      },
      { version: '1.4.7', date: '', sections: [{ title: 'Improvements', items: ['Older.'] }] },
    ]);
  });

  it('ignores preamble and unrelated prose', () => {
    expect(parseChangelog('# Changelog\n\nNothing released yet.')).toEqual([]);
  });
});
