'use client';

import { useState } from 'react';
import useSupportUnread from '../hooks/use-support-unread';
import { UnreadPill } from '../../../components/ui/form-controls';
import { GuildChat } from './guild-chat';

/** Leader-to-administrator support chat, with an unread badge that keeps polling while the chat is closed. */
export function SupportPanel({ guildId }: { guildId: string }) {
  const [open, setOpen] = useState(false);
  const unread = useSupportUnread({ guildId });

  return (
    <section aria-label="Administrator support" className="panel flex flex-col gap-4 p-6">
      <div>
        <h2 className="text-sm uppercase tracking-[0.2em]">Support</h2>
        <p className="mt-2 text-sm text-sand-400">Talk privately with dashboard administrators about your guild.</p>
      </div>
      <button type="button" className="btn btn-primary self-start" aria-expanded={open} onClick={() => setOpen(!open)}>
        Chat with administrators <UnreadPill count={unread.total} />
      </button>
      {open && (
        <GuildChat
          url={`/api/guilds/${encodeURIComponent(guildId)}/support`}
          title="Chat with administrators"
          note="Private to dashboard administrators and the current guild leader. New leaders can see earlier messages."
          roleLabels={{ applicant: 'Guild leader', reviewer: 'Administrator' }}
          readFrom="reviewer"
          support={{ guildId }}
        />
      )}
    </section>
  );
}
