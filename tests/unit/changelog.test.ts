import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../../src/modules/changelog/server/read';

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

  it('ignores preamble and unrelated prose', () => {
    expect(parseChangelog('# Changelog\n\nNothing released yet.')).toEqual([]);
  });
});
