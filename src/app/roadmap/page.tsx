import type { Metadata } from 'next';
import { loadRoadmapResponse } from '../../features/roadmap/server/http';
import { RoadmapBoard } from '../../features/roadmap/components/roadmap-board';

export const metadata: Metadata = { title: 'Roadmap' };

export default async function RoadmapPage() {
  const initial = await loadRoadmapResponse();
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <header className="mb-8 max-w-3xl">
        <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-spice-400">Arrakis Control</p>
        <h1 className="mt-2 text-3xl">Roadmap</h1>
        <p className="mt-3 text-sm leading-relaxed text-sand-300">
          What is planned, in development, in testing and already released for the dashboard and the Discord bot.
          Entries come from approved public GitHub issues. Target versions appear only once they are confirmed.
        </p>
      </header>
      <RoadmapBoard initial={initial} />
    </div>
  );
}
