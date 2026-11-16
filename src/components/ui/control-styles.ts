/** Shared theme-aware styles for native controls and links; semantics stay with the caller. */
export const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-spice-300';

export function buttonClass({
  variant = 'secondary',
  className = '',
}: { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; className?: string } = {}): string {
  const tone = {
    primary: 'btn-primary',
    secondary: 'btn-ghost',
    ghost: 'border border-transparent text-sand-100 hover:text-spice-300',
    danger: 'border border-status-danger bg-status-danger/15 text-sand-50',
  }[variant];
  return `btn ${tone} ${focusRing} disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim();
}

export function cardClass({
  surface = 'solid',
  interactive = false,
  className = '',
}: { surface?: 'solid' | 'glass'; interactive?: boolean; className?: string } = {}): string {
  return `${surface === 'glass' ? 'panel' : 'ui-card'} ${interactive ? `panel-interactive ${focusRing}` : ''} ${className}`.trim();
}

export function menuItemClass({
  active,
  layout = 'dropdown',
  className = '',
}: {
  active: boolean;
  layout?: 'dropdown' | 'drawer' | 'segment';
  className?: string;
}): string {
  if (layout === 'segment')
    return `flex min-h-11 items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] ${focusRing} ${active ? 'bg-spice-500 text-obsidian-950' : 'text-sand-300 hover:text-spice-300'} ${className}`.trim();
  if (layout === 'drawer')
    return `flex min-h-12 items-center gap-3 border-l-2 px-3 py-2 text-sm font-semibold ${focusRing} ${active ? 'border-spice-400 bg-spice-500/10 text-spice-300' : 'border-transparent text-sand-200'} ${className}`.trim();
  return `flex min-h-11 items-start gap-3.5 border-l-2 px-3.5 py-3 outline-none transition-all duration-150 focus-visible:border-spice-300 focus-visible:bg-spice-500/14 focus-visible:text-sand-50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-spice-400/60 ${active ? 'border-spice-400 bg-spice-500/12 text-spice-300' : 'border-transparent text-sand-200 hover:translate-x-0.5 hover:border-spice-500/40 hover:bg-spice-500/6 hover:text-sand-50'} ${className}`.trim();
}
