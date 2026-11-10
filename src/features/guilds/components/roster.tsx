'use client';

import { useState } from 'react';
import type { RankGroup } from '../members';
import { FormMessage } from '../../../components/ui/form-controls';
import { AddMemberButton, MemberManageButton } from './management';

/** Members grouped by rank. Leaders also get Manage buttons per row and an Add member action. */
export function Roster({
  guildId,
  guildName,
  groups,
  canEdit,
}: {
  guildId: string;
  guildName: string;
  groups: RankGroup[];
  canEdit: boolean;
}) {
  const [message, setMessage] = useState('');

  return (
    <section aria-label="Guild roster" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-sm uppercase tracking-[0.2em]">Roster</h2>
        {canEdit && <AddMemberButton guildId={guildId} onDone={setMessage} />}
      </div>
      <FormMessage status={message} />
      <div className="grid gap-5 md:grid-cols-3">
        {groups.map((group) => (
          <section key={group.key} aria-labelledby={`rank-${group.key}`} className="panel flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between gap-3 border-b border-sand-200/10 pb-3">
              <h3 id={`rank-${group.key}`} className="text-sm uppercase tracking-[0.2em]">
                {group.label}
              </h3>
              <span className="font-mono text-xs text-spice-400">{group.members.length}</span>
            </div>
            {group.members.length > 0 ? (
              <ul aria-label={`${group.label} members`} className="flex flex-col divide-y divide-sand-200/10">
                {group.members.map((member, index) => (
                  <li
                    key={member.id ?? `${member.name}-${index}`}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <strong className="min-w-0 truncate text-sm font-semibold text-sand-100">{member.name}</strong>
                    {canEdit && (
                      <MemberManageButton guildId={guildId} guildName={guildName} member={member} onDone={setMessage} />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-sand-500">No members reported</p>
            )}
          </section>
        ))}
      </div>
      <p className="text-xs text-sand-500">Online players may need to relog after rank changes.</p>
    </section>
  );
}
