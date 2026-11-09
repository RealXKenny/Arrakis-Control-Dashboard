import type { ReactNode } from 'react';

/**
 * Landing-page illustrations. They are drawings of the dashboard's layout built from the same primitives the
 * dashboard uses, not screenshots, and they contain no figures, names or counts. Each one is hidden from assistive
 * technology; the caption underneath says what it is.
 */

const CAPTION = 'Illustration of the layout. It shows no real data.';

function Figure({ children, caption = CAPTION }: { children: ReactNode; caption?: string }) {
  return (
    <figure className="m-0">
      {children}
      <figcaption className="mt-3 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
        {caption}
      </figcaption>
    </figure>
  );
}

function Bar({ width, accent = false }: { width: string; accent?: boolean }) {
  return <span className={`block h-1.5 ${accent ? 'bg-spice-500/70' : 'bg-sand-200/15'}`} style={{ width }} />;
}

const NAV = ['Home', 'Portal', 'Bases', 'Map', 'Chat'];

/** The hero composition: the topbar, a map panel, character cards and a guild strip. */
export function DashboardIllustration() {
  return (
    <Figure>
      <div aria-hidden="true" className="panel p-3 sm:p-4">
        <div className="flex items-center gap-1.5 border-b border-sand-200/10 pb-3">
          <span className="size-2 bg-spice-500" />
          <span className="size-2 bg-sand-200/20" />
          <span className="size-2 bg-sand-200/20" />
          <div className="ml-3 hidden gap-4 font-mono text-[0.625rem] uppercase tracking-widest text-sand-500 sm:flex">
            {NAV.map((item, index) => (
              <span key={item} className={index === 0 ? 'text-spice-400' : undefined}>
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-5 gap-3">
          <div className="relative col-span-3 h-40 overflow-hidden border border-sand-200/10 bg-obsidian-900 bg-grid bg-[size:24px_24px] sm:h-52">
            <svg
              viewBox="0 0 240 160"
              className="absolute inset-0 size-full"
              preserveAspectRatio="xMidYMid slice"
              fill="none"
            >
              <path
                d="M-10 118 C 40 96, 70 128, 120 104 S 200 84, 250 100"
                stroke="rgb(187 163 116 / 0.35)"
                strokeWidth="1"
              />
              <path
                d="M-10 92 C 40 70, 80 100, 128 78 S 200 58, 250 74"
                stroke="rgb(187 163 116 / 0.28)"
                strokeWidth="1"
              />
              <path
                d="M-10 66 C 44 46, 84 72, 132 52 S 204 34, 250 48"
                stroke="rgb(187 163 116 / 0.2)"
                strokeWidth="1"
              />
              <circle cx="72" cy="84" r="4" fill="rgb(238 130 9)" />
              <rect x="148" y="66" width="7" height="7" fill="rgb(95 147 217)" />
              <path d="M110 118 l5 9 h-10 z" fill="rgb(241 233 216 / 0.8)" />
            </svg>
          </div>
          <div className="col-span-2 flex flex-col gap-3">
            {[
              ['70%', '45%'],
              ['55%', '80%'],
              ['85%', '40%'],
            ].map(([a, b], index) => (
              <div key={index} className="flex-1 border border-sand-200/10 bg-obsidian-900 p-2.5">
                <Bar width={a!} accent={index === 0} />
                <div className="mt-2.5">
                  <Bar width={b!} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          {['38%', '62%', '50%'].map((width, index) => (
            <div key={index} className="border border-sand-200/10 bg-obsidian-900 p-2.5">
              <Bar width={width} accent={index === 1} />
            </div>
          ))}
        </div>
      </div>
    </Figure>
  );
}

/** Contours and the three marker shapes, with a legend that matches the map's own layers. */
export function MapIllustration() {
  return (
    <Figure>
      <div aria-hidden="true" className="panel p-3 sm:p-4">
        <div className="relative aspect-[5/3] overflow-hidden border border-sand-200/10 bg-obsidian-900 bg-grid bg-[size:28px_28px]">
          <svg
            viewBox="0 0 300 180"
            className="absolute inset-0 size-full"
            preserveAspectRatio="xMidYMid slice"
            fill="none"
          >
            <path
              d="M-10 140 C 50 112, 90 150, 150 120 S 250 96, 310 116"
              stroke="rgb(187 163 116 / 0.4)"
              strokeWidth="1.2"
            />
            <path
              d="M-10 112 C 52 84, 98 122, 156 92 S 252 68, 310 88"
              stroke="rgb(187 163 116 / 0.32)"
              strokeWidth="1.2"
            />
            <path
              d="M-10 84 C 56 58, 104 94, 162 64 S 256 42, 310 60"
              stroke="rgb(187 163 116 / 0.24)"
              strokeWidth="1.2"
            />
            <path
              d="M-10 56 C 60 34, 108 66, 168 38 S 260 20, 310 32"
              stroke="rgb(187 163 116 / 0.16)"
              strokeWidth="1.2"
            />
            <circle cx="88" cy="104" r="5" fill="rgb(238 130 9)" />
            <circle cx="204" cy="70" r="5" fill="rgb(238 130 9)" />
            <rect x="140" y="112" width="9" height="9" fill="rgb(95 147 217)" />
            <path d="M232 128 l6 11 h-12 z" fill="rgb(241 233 216 / 0.85)" />
            <circle cx="60" cy="50" r="12" stroke="rgb(238 130 9 / 0.5)" strokeDasharray="3 3" />
          </svg>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[0.625rem] uppercase tracking-widest text-sand-400">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-spice-500" />
            Base
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2 bg-ibad-400" />
            Vehicle
          </span>
          <span className="flex items-center gap-2">
            <span className="size-0 border-x-[5px] border-b-[8px] border-x-transparent border-b-sand-100/80" />
            Player
          </span>
        </div>
      </div>
    </Figure>
  );
}

const ROWS = [
  { role: 'Leader', width: '55%', accent: true },
  { role: 'Officer', width: '42%', accent: false },
  { role: 'Member', width: '66%', accent: false },
  { role: 'Member', width: '48%', accent: false },
];

/** A roster and an application form: the two things a guild leader works with. */
export function GuildIllustration() {
  return (
    <Figure>
      <div aria-hidden="true" className="panel p-3 sm:p-4">
        <div className="font-mono text-[0.625rem] uppercase tracking-widest text-sand-500">Roster</div>
        <ul className="mt-3 flex flex-col gap-2">
          {ROWS.map((row, index) => (
            <li key={index} className="flex items-center gap-3 border border-sand-200/10 bg-obsidian-900 p-2.5">
              <span
                className={`w-16 shrink-0 font-mono text-[0.625rem] uppercase tracking-widest ${row.accent ? 'text-spice-400' : 'text-sand-400'}`}
              >
                {row.role}
              </span>
              <span className="flex-1">
                <Bar width={row.width} accent={row.accent} />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-sand-200/10 pt-3 font-mono text-[0.625rem] uppercase tracking-widest text-sand-500">
          Application
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          <div className="border border-sand-200/10 bg-obsidian-900 p-2.5">
            <Bar width="60%" />
          </div>
          <div className="h-12 border border-sand-200/10 bg-obsidian-900 p-2.5">
            <Bar width="80%" />
            <div className="mt-2">
              <Bar width="45%" />
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="size-3.5 border border-spice-500/70" />
            <Bar width="35%" />
          </div>
        </div>
      </div>
    </Figure>
  );
}
