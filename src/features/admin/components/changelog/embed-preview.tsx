import type { DiscordContainerPayload } from '../../../../lib/discord-components';

function InlineText({ text }: { text: string }) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={index}>{part.slice(2, -2)}</strong>
    ) : part.startsWith('`') && part.endsWith('`') ? (
      <code key={index} className="rounded bg-black/20 px-1">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    ),
  );
}

/** Renders the Components V2 container tree with an accent border, headings and link buttons. */
export function EmbedPreview({ payload }: { payload: DiscordContainerPayload }) {
  const container = payload.components[0];
  const color = `#${container.accent_color.toString(16).padStart(6, '0')}`;
  return (
    <div className="bg-[#313338] p-4 font-sans text-[#dbdee1]" aria-label="Discord message preview">
      <p className="mb-2 text-sm font-semibold text-white">
        Arrakis Control <span className="ml-1 bg-[#5865f2] px-1 text-[0.625rem] font-bold uppercase">App</span>
      </p>
      <div
        className="max-w-lg space-y-3 rounded-lg border border-[#1e1f22] border-l-4 bg-[#2b2d31] p-4"
        style={{ borderLeftColor: color }}
      >
        {container.components.map((component, index) =>
          component.type === 14 ? (
            <hr key={index} className="border-white/10" />
          ) : component.type === 1 ? (
            <div key={index} className="flex flex-wrap gap-2">
              {component.components.map((button) => (
                <span
                  key={`${button.label}:${button.url}`}
                  className="rounded bg-[#4e5058] px-4 py-1.5 text-sm font-medium text-white"
                >
                  {button.label} ↗
                </span>
              ))}
            </div>
          ) : (
            <div key={index} data-discord-component="text-display">
              {component.content.split('\n').map((line, lineIndex) => (
                <p
                  key={lineIndex}
                  className={
                    line.startsWith('# ')
                      ? 'text-xl font-bold text-white'
                      : line.startsWith('## ')
                        ? 'font-semibold text-white'
                        : line.startsWith('-# ')
                          ? 'text-xs text-[#b5bac1]'
                          : 'min-h-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]'
                  }
                >
                  <InlineText text={line.replace(/^(?:#{1,2}|-#) /, '')} />
                </p>
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
