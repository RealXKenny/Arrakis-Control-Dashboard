'use client';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

import { useState } from 'react';
import { OperationTemplates } from './operation-templates';
import { AvailabilityBoard } from './availability-board';
import { FleetDispatch } from './fleet-dispatch';
import { LandsraadCampaign } from './landsraad-campaign';

const sections = [
  { id: 'templates', label: 'Templates' },
  { id: 'availability', label: 'Availability' },
  { id: 'fleet', label: 'Fleet dispatch' },
  { id: 'landsraad', label: 'Landsraad campaign' },
] as const;

/** Guild logistics workspace: planning records only. Nothing here moves items, vehicles or currency in game. */
export function GuildLogistics({ guildId }: { guildId: string }) {
  const [section, setSection] = useState<(typeof sections)[number]['id']>('templates');
  return (
    <Card
      as="section"
      aria-label="Guild logistics"
      className="panel min-w-0 p-5 sm:p-6 [&_button]:max-w-full [&_button]:whitespace-normal"
    >
      <h2 className="text-lg">Logistics</h2>
      <p className="mt-2 max-w-prose text-sm text-sand-400">
        Reusable operation templates, shared availability, fleet bookings and Landsraad targets for your guild. These
        are planning records: they never move items, vehicles or currency in game.
      </p>
      <div role="group" aria-label="Logistics sections" className="mt-5 flex flex-wrap gap-3">
        {sections.map((entry) => (
          <Button
            key={entry.id}
            type="button"
            aria-pressed={section === entry.id}
            className={`btn ${section === entry.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSection(entry.id)}
          >
            {entry.label}
          </Button>
        ))}
      </div>
      <div className="mt-6 min-w-0">
        {section === 'templates' && <OperationTemplates guildId={guildId} />}
        {section === 'availability' && <AvailabilityBoard guildId={guildId} />}
        {section === 'fleet' && <FleetDispatch guildId={guildId} />}
        {section === 'landsraad' && <LandsraadCampaign guildId={guildId} />}
      </div>
    </Card>
  );
}
