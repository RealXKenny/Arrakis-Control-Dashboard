import type { Metadata } from 'next';
import { Notice, PageHeader } from '../../../components/ui/page-header';
import { requireSession } from '../../../features/auth/server/session';
import { discordAvatarUrl } from '../../../features/auth/identity';
import { getChatConfig } from '../../../features/chat/server/config';
import { LiveChat } from '../../../features/chat/components/live-chat';
import { loadChatViewer } from '../../../features/chat/server/viewer';

export const metadata: Metadata = { title: 'Live chat' };

export default async function ChatPage() {
  const session = await requireSession();
  const config = getChatConfig();
  const viewer = config ? await loadChatViewer(session) : undefined;
  const senderName =
    session.linkedPlayerName ?? session.user.global_name ?? session.user.username ?? 'Dashboard member';

  return (
    <>
      <PageHeader eyebrow="Real-time communications" title="Live chat">
        <p className="max-w-md text-sm leading-relaxed text-sand-400">Your community, connected across the dunes.</p>
      </PageHeader>
      {config ? (
        <LiveChat
          servers={config.servers}
          maxChars={config.messageMaxChars}
          senderName={senderName}
          senderId={session.user.id}
          senderAvatarUrl={discordAvatarUrl(session.user.id, session.user.avatar)}
          viewer={viewer}
        />
      ) : (
        <Notice title="Live chat is not configured">
          Live chat is not available yet. Ask a server administrator to enable it for your community.
        </Notice>
      )}
    </>
  );
}
