'use client';

import { Fragment, useState } from 'react';
import type { ChangelogRelease } from '../schema';

const PREVIEW_COUNT = 5;
const SECTION_STYLES: Record<string, { label: string; tone: string; description: string }> = {
  'New Features': {
    label: 'Discover',
    tone: 'border-l-spice-500',
    description: 'New ways to explore, connect and manage your world.',
  },
  Improvements: {
    label: 'Refined',
    tone: 'border-l-ibad-400',
    description: 'A smoother experience, from the first click to the last.',
  },
  Fixes: {
    label: 'Resolved',
    tone: 'border-l-status-ok',
    description: 'Small frustrations and unexpected behaviour, addressed.',
  },
  Security: {
    label: 'Protected',
    tone: 'border-l-spice-300',
    description: 'Stronger safeguards for your account and community.',
  },
  Privacy: {
    label: 'Private',
    tone: 'border-l-ibad-400',
    description: 'More control over how your information is handled.',
  },
  Removed: {
    label: 'Simplified',
    tone: 'border-l-sand-500',
    description: 'Retired features and a cleaner foundation.',
  },
  'Upgrade Notes': {
    label: 'Before updating',
    tone: 'border-l-status-warn',
    description: 'Configuration changes and details for your next deployment.',
  },
};

/** Only supported inline formatting is rendered; embedded HTML always remains plain text. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith('`') && part.endsWith('`') ? (
          <code
            key={index}
            className="break-words bg-sand-100/[0.06] px-1.5 py-0.5 font-mono text-[0.8em] text-spice-300"
          >
            {part.slice(1, -1)}
          </code>
        ) : part.startsWith('**') && part.endsWith('**') ? (
          <strong key={index} className="font-semibold text-sand-100">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function ReleaseNotes({ releases }: { releases: ChangelogRelease[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All updates');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const latest = releases[0];
  const categories = [...new Set(releases.flatMap((release) => release.sections.map((section) => section.title)))];
  const total = releases.reduce(
    (count, release) => count + release.sections.reduce((sum, section) => sum + section.items.length, 0),
    0,
  );
  const search = query.trim().toLowerCase();
  const visible = releases
    .map((release) => ({
      ...release,
      sections: release.sections
        .filter((section) => category === 'All updates' || section.title === category)
        .map((section) => ({
          ...section,
          items: section.items.filter(
            (item) => !search || `${release.version} ${section.title} ${item}`.toLowerCase().includes(search),
          ),
        }))
        .filter((section) => section.items.length),
    }))
    .filter((release) => release.sections.length);
  const matches = visible.reduce(
    (count, release) => count + release.sections.reduce((sum, section) => sum + section.items.length, 0),
    0,
  );

  return (
    <>
      <header className="relative overflow-hidden border border-sand-200/10 border-t-2 border-t-spice-500 bg-obsidian-900/60 p-6 sm:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-28 size-80 rotate-12 border border-spice-500/10 shadow-[24px_24px_0_0_rgb(238_130_9/0.03)]"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-xl">
            <p className="eyebrow text-spice-400">Arrakis Control / Release notes</p>
            <h1 className="mt-4 text-4xl leading-tight sm:text-6xl">
              Changelog<span className="text-spice-300">.</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-sand-400">
              New features, thoughtful refinements, and fixes for your community. See how your dashboard is evolving.
            </p>
          </div>
          {latest && (
            <a
              href={`#v${latest.version}`}
              className="flex shrink-0 items-center gap-4 border border-spice-500/30 bg-spice-500/[0.06] px-4 py-3 hover:border-spice-400 sm:flex-col sm:items-start sm:gap-0 sm:px-5 sm:py-4"
            >
              <span className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-spice-400">
                Latest release
              </span>
              <span className="text-2xl font-bold tracking-tight text-sand-50 sm:mt-2 sm:text-3xl">
                v{latest.version}
              </span>
              {latest.date && <time className="mt-2 text-xs text-sand-400">{latest.date}</time>}
            </a>
          )}
        </div>
        <div className="relative mt-8 flex flex-wrap gap-x-5 gap-y-3 sm:gap-x-8 border-t border-sand-200/10 pt-5 font-mono text-xs text-sand-400">
          <p>
            <span className="mr-2 font-bold text-sand-100">{releases.length}</span>{' '}
            {releases.length === 1 ? 'update' : 'updates'}
          </p>
          <p>
            <span className="mr-2 font-bold text-sand-100">{total}</span> {total === 1 ? 'change' : 'changes'}
          </p>
          <p>
            <span className="mr-2 font-bold text-sand-100">{categories.length}</span> categories
          </p>
        </div>
      </header>
      <div className="mb-7 mt-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-spice-400">Release journal</p>
          <h2 className="mt-2 text-xl sm:text-2xl">Explore the updates</h2>
        </div>
        <div className="w-full sm:w-80">
          <label htmlFor="release-search" className="sr-only">
            Search release notes
          </label>
          <input
            id="release-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={200}
            placeholder="Search features, fixes, changes…"
            className="min-h-12 w-full border border-sand-200/20 bg-obsidian-950 px-4 text-sm text-sand-100 placeholder:text-sand-600 focus:border-spice-400 focus:outline-none"
          />
        </div>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-8">
        <aside className="min-w-0 lg:sticky lg:top-28">
          <p className="mb-3 hidden font-mono text-[0.625rem] uppercase tracking-[0.18em] text-sand-500 lg:block">
            Browse changes
          </p>
          <div role="group" aria-label="Filter release notes" className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {['All updates', ...categories].map((title) => {
              const count =
                title === 'All updates'
                  ? releases.length
                  : releases.reduce(
                      (sum, release) =>
                        sum + (release.sections.find((section) => section.title === title)?.items.length ?? 0),
                      0,
                    );
              return (
                <button
                  type="button"
                  key={title}
                  aria-pressed={category === title}
                  title={`${count} ${title === 'All updates' ? 'release updates' : 'changes'}`}
                  onClick={() => setCategory(title)}
                  className={`flex min-h-10 items-center justify-between gap-3 border px-3 py-2 text-left text-xs lg:min-h-11 ${category === title ? 'border-spice-500/35 bg-spice-500/10 font-bold text-spice-300' : 'border-sand-200/10 text-sand-400 hover:border-sand-200/25 hover:text-sand-100'}`}
                >
                  <span>{title}</span>
                  <span aria-hidden="true" className="font-mono text-[0.625rem] opacity-60">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <p role="status" className="mt-4 text-xs text-sand-500">
            {search ? `${matches} ${matches === 1 ? 'change' : 'changes'} matching your search in ` : ''}
            {visible.length} {visible.length === 1 ? 'update' : 'updates'}
            {!search && ' to explore'}
          </p>
        </aside>
        <div className="min-w-0 space-y-9">
          {visible.map((release) => (
            <article key={release.version} id={`v${release.version}`} className="scroll-mt-28">
              <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-sand-200/10 pb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl text-sand-50">
                    <a href={`#v${release.version}`}>Version {release.version}</a>
                  </h2>
                  {release.version === latest?.version && (
                    <span className="border border-spice-500/30 bg-spice-500/10 px-2 py-1 font-mono text-[0.5625rem] uppercase tracking-wider text-spice-300">
                      Latest
                    </span>
                  )}
                </div>
                {release.date && <time className="text-xs text-sand-500">{release.date}</time>}
              </header>
              <div className="space-y-5">
                {release.sections.map((section) => {
                  const style = SECTION_STYLES[section.title] ?? {
                    label: 'Updated',
                    tone: 'border-l-spice-500',
                    description: 'The latest changes to your dashboard.',
                  };
                  const key = `${release.version}:${section.title}`;
                  const showAll = Boolean(search || category !== 'All updates' || expanded[key]);
                  const items = showAll ? section.items : section.items.slice(0, PREVIEW_COUNT);
                  return (
                    <section
                      key={key}
                      aria-label={section.title}
                      className={`min-w-0 border border-l-2 border-sand-200/10 bg-obsidian-900/40 ${style.tone}`}
                    >
                      <header className="flex items-start justify-between gap-4 border-b border-sand-200/[0.06] px-5 py-5 sm:px-6">
                        <div>
                          <p className="font-mono text-[0.5625rem] uppercase tracking-[0.2em] text-sand-500">
                            {style.label}
                          </p>
                          <h3 className="mt-2 text-base tracking-wide text-sand-100">{section.title}</h3>
                          <p className="mt-2 text-xs leading-relaxed text-sand-500">{style.description}</p>
                        </div>
                        <span className="flex size-8 shrink-0 items-center justify-center border border-sand-200/10 font-mono text-xs text-sand-400">
                          {section.items.length}
                        </span>
                      </header>
                      <ul className="divide-y divide-sand-200/[0.06] px-5 sm:px-6">
                        {items.map((item, index) => (
                          <li
                            key={index}
                            className="flex gap-3 py-4 text-sm leading-7 text-sand-300 [overflow-wrap:anywhere]"
                          >
                            <span aria-hidden="true" className="mt-3 size-1 shrink-0 bg-spice-400/60" />
                            <span className="min-w-0">
                              <Inline text={item} />
                            </span>
                          </li>
                        ))}
                      </ul>
                      {!search && category === 'All updates' && section.items.length > PREVIEW_COUNT && (
                        <button
                          type="button"
                          aria-expanded={Boolean(expanded[key])}
                          onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))}
                          className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-sand-200/10 bg-sand-100/[0.02] px-4 text-xs font-semibold text-spice-300 hover:bg-spice-500/[0.06]"
                        >
                          {expanded[key]
                            ? `Show fewer ${section.title.toLowerCase()}`
                            : `View all ${section.items.length} ${section.title.toLowerCase()}`}
                          <span aria-hidden="true">{expanded[key] ? '−' : '+'}</span>
                        </button>
                      )}
                    </section>
                  );
                })}
              </div>
            </article>
          ))}
          {!visible.length && (
            <div className="border border-sand-200/10 bg-obsidian-900/40 px-6 py-14 text-center">
              <h3 className="text-lg">{releases.length ? 'No matching updates' : 'A new chapter is coming'}</h3>
              <p className="mt-3 text-sm text-sand-500">
                {releases.length
                  ? 'Try another search or explore a different category.'
                  : 'Release notes will appear here when they are ready.'}
              </p>
              {releases.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost mt-5"
                  onClick={() => {
                    setQuery('');
                    setCategory('All updates');
                  }}
                >
                  Reset filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
