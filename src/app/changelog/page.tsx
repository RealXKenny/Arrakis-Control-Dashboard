import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { readChangelog } from '../../modules/changelog/server/read';

export const metadata: Metadata = { title: 'Changelog' };

const RECENT = 8;

/** Render `inline code` spans from the Markdown source; everything else stays plain text. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, index) =>
        index % 2 ? (
          <code key={index} className="bg-sand-100/10 px-1 font-mono text-[0.85em] text-spice-300">
            {part}
          </code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export default async function ChangelogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const showAll = (await searchParams).show === 'all';
  const all = (await readChangelog()).filter((release) => release.sections.some((section) => section.items.length));
  const releases = showAll ? all : all.slice(0, RECENT);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <p className="eyebrow">What changed</p>
      <h1 className="mt-3 text-2xl sm:text-4xl">Changelog</h1>

      <div className="mt-12 grid gap-10">
        {releases.map((release) => (
          <article key={release.version} id={`v${release.version}`} className="panel scroll-mt-24 p-6 sm:p-8">
            <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-sand-200/10 pb-4">
              <h2 className="text-lg">
                <a href={`#v${release.version}`} className="hover:text-spice-300">
                  v{release.version}
                </a>
              </h2>
              <time className="font-mono text-xs uppercase tracking-widest text-sand-500">{release.date}</time>
            </header>
            {release.sections
              .filter((section) => section.items.length)
              .map((section) => (
                <section key={section.title} className="mt-6">
                  <h3 className="eyebrow">{section.title}</h3>
                  <ul className="mt-3 grid gap-3 text-sm leading-relaxed text-sand-300">
                    {section.items.map((item, index) => (
                      <li key={index} className="border-l-2 border-spice-500/40 pl-4">
                        <Inline text={item} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </article>
        ))}
      </div>

      {!showAll && all.length > RECENT && (
        <Link href="/changelog?show=all" className="btn btn-ghost mt-10">
          Show all {all.length} releases
        </Link>
      )}
    </div>
  );
}
