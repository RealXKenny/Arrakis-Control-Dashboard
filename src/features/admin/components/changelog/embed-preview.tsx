import type { WebhookPayload } from '../../../changelog/discord';

/** Renders a webhook payload the way Discord will show it: accent bar, title link, fields, link buttons. */
export function EmbedPreview({ payload }: { payload: WebhookPayload }) {
  const embed = payload.embeds[0];
  const buttons = payload.components.flatMap((row) => row.components);
  const color = `#${embed.color.toString(16).padStart(6, '0')}`;
  return (
    <div className="bg-[#313338] p-4 font-sans text-[#dbdee1]" aria-label="Discord message preview">
      <p className="mb-2 text-sm font-semibold text-white">
        {payload.username} <span className="ml-1 bg-[#5865f2] px-1 text-[0.625rem] font-bold uppercase">App</span>
      </p>
      <div className="max-w-md border-l-4 bg-[#2b2d31] p-3" style={{ borderLeftColor: color }}>
        <p className={`text-sm font-semibold ${embed.url ? 'text-[#00a8fc]' : 'text-white'}`}>{embed.title}</p>
        {embed.description && <p className="mt-2 whitespace-pre-line text-sm">{embed.description}</p>}
        {embed.fields?.map((field) => (
          <div key={field.name} className="mt-3">
            <p className="text-sm font-semibold text-white">{field.name}</p>
            <p className="whitespace-pre-line text-sm">{field.value}</p>
          </div>
        ))}
        <p className="mt-3 text-xs text-[#949ba4]">{embed.footer.text}</p>
      </div>
      {buttons.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {buttons.map((button) => (
            <span
              key={`${button.label}:${button.url}`}
              className="bg-[#4e5058] px-4 py-1.5 text-sm font-medium text-white"
            >
              {button.label} ↗
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
