/**
 * Modern Dune class recipes for the administrator workspace: Tailwind utilities only, no CSS
 * modules and no legacy-bridge selectors. Each entry is a complete literal so Tailwind's scanner
 * sees every class; nested selectors use arbitrary variants on the container.
 */

const buttons =
  '[&_button]:inline-flex [&_button]:min-h-9 [&_button]:cursor-pointer [&_button]:items-center [&_button]:justify-center [&_button]:border [&_button]:border-sand-200/20 [&_button]:bg-sand-100/10 [&_button]:px-3.5 [&_button]:py-1.5 [&_button]:text-center [&_button]:text-xs [&_button]:font-medium [&_button]:leading-snug [&_button]:text-sand-300 [&_button:hover:not(:disabled)]:bg-spice-500/15 [&_button:hover:not(:disabled)]:text-sand-100 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-45 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-spice-400';

const controls =
  '[&_input]:min-h-9 [&_input]:w-full [&_input]:min-w-0 [&_input]:border [&_input]:border-sand-200/20 [&_input]:bg-obsidian-900/60 [&_input]:px-3 [&_input]:py-2 [&_input]:text-xs [&_input]:text-sand-100 [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-offset-2 [&_input:focus-visible]:outline-spice-400 [&_select]:min-h-9 [&_select]:w-full [&_select]:max-w-xs [&_select]:border [&_select]:border-sand-200/20 [&_select]:bg-obsidian-900 [&_select]:px-2.5 [&_select]:py-2 [&_select]:text-xs [&_select]:text-sand-100 [&_select:focus-visible]:outline-2 [&_select:focus-visible]:outline-offset-2 [&_select:focus-visible]:outline-spice-400 [&_textarea]:min-h-9 [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:border [&_textarea]:border-sand-200/20 [&_textarea]:bg-obsidian-900/60 [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:font-mono [&_textarea]:text-[0.6875rem] [&_textarea]:leading-6 [&_textarea]:text-sand-100 [&_textarea:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-offset-2 [&_textarea:focus-visible]:outline-spice-400';

const links =
  '[&_a]:text-spice-400 [&_a]:underline [&_a]:underline-offset-4 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-spice-400';

const calm = 'motion-reduce:[&_*]:animate-none! motion-reduce:[&_*]:transition-none!';

export const ui = {
  scope: `text-sand-100 ${calm}`,
  screen: `grid min-w-0 gap-4 text-sand-100 ${buttons} ${controls} ${links} ${calm}`,
  panel: `mb-5 min-w-0 border border-sand-200/15 bg-sand-100/[0.04] p-4 shadow-[4px_4px_0_0_rgb(0_0_0/0.5)] sm:p-6 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:tracking-tight [&_h3]:mb-3.5 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:text-xs [&_p]:leading-7 [&_p]:text-sand-400 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:leading-7 [&_li]:pl-0.5 [&_td_code]:mt-1.5 [&_td_code]:block [&_td_code]:text-[0.625rem] [&_td_code]:break-words [&_td_small]:mt-1.5 [&_td_small]:block [&_td_small]:text-[0.625rem] ${buttons} ${links}`,
  stateLine: 'my-3 text-xs text-sand-400',
  status: 'font-mono text-[0.625rem] text-sand-400',
  error: `my-4 break-words border border-red-300/20 bg-sand-100/[0.08] px-3.5 py-3 text-[0.6875rem] leading-6 text-red-300 ${buttons}`,
  notice: `my-4 break-words border border-sand-200/15 bg-sand-100/[0.08] px-3.5 py-3 text-[0.6875rem] leading-6 text-sand-300 ${links}`,
  actions: `mt-5 flex flex-wrap gap-2 ${buttons} [&_button:first-child]:border-spice-400/30 [&_button:first-child]:bg-spice-500/10 [&_button:first-child]:text-spice-400`,
  danger: 'border-red-400/40! text-red-300!',
  field: `my-4 flex flex-col gap-2 text-xs text-sand-300 [&>span]:text-[0.6875rem] [&>span]:text-sand-400 ${controls}`,
  formGrid: 'grid grid-cols-1 gap-x-4 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] [&>*]:min-w-0',
  toolbar: 'flex flex-wrap items-end gap-3 [&_label]:m-0',
  subTabs:
    'flex flex-wrap gap-1.5 [&_[aria-pressed=true]]:border-spice-400/30 [&_[aria-pressed=true]]:bg-spice-500/10 [&_[aria-pressed=true]]:text-spice-400',
  viewTabs: `mb-5 flex flex-wrap items-center justify-start gap-3 ${buttons} [&_[aria-pressed=true]]:border-spice-400 [&_[aria-pressed=true]]:text-spice-400`,
  pager: `mt-3 flex items-center gap-3 text-xs text-sand-400 ${buttons}`,
  facts:
    'my-3 grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2.5 [&>div]:min-w-0 [&>div]:border [&>div]:border-sand-200/15 [&>div]:bg-obsidian-900/50 [&>div]:px-3.5 [&>div]:py-3 [&_dt]:text-[0.625rem] [&_dt]:text-sand-400 [&_dd]:mt-1 [&_dd]:break-words [&_dd]:text-[0.8125rem] [&_dd]:text-sand-100',
  tableScroll: `mb-4 max-h-[400px] max-w-full overflow-auto border border-sand-200/15 [&_table]:w-full [&_table]:min-w-[640px] [&_table]:border-collapse [&_table]:text-left [&_table]:text-[0.6875rem] [&_table]:text-sand-300 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-sand-200/15 [&_th]:bg-sand-100/[0.04] [&_th]:px-2.5 [&_th]:py-[11px] [&_th]:font-medium [&_th]:text-sand-400 [&_td]:min-w-[100px] [&_td]:max-w-80 [&_td]:break-words [&_td]:border-b [&_td]:border-sand-200/15 [&_td]:px-2.5 [&_td]:py-[11px] [&_td]:align-middle [&_tr:hover_td]:bg-obsidian-700/30 ${controls}`,
  logView:
    'mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words border border-sand-200/15 bg-obsidian-950/70 p-3.5 font-mono text-[0.6875rem] leading-relaxed text-sand-300',
  dialog: `m-auto max-h-[calc(100vh-2rem)] w-[min(520px,calc(100vw-2rem))] overflow-auto border border-sand-200/20 bg-obsidian-900 p-6 text-sand-100 shadow-[6px_6px_0_0_rgb(0_0_0/0.6)] backdrop:bg-black/60 [&_h2]:mb-3 [&_h2]:text-lg [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-[18px] [&_ul]:text-xs [&_ul]:leading-7 [&_ul]:text-sand-300 [&_.field>span]:text-xs [&_.field>span]:text-sand-300 ${buttons} ${controls}`,
  dialogTarget: 'mb-3 break-words text-xs text-sand-300',
  eyebrow: 'mb-2 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-spice-400',
  controlCenter: 'min-w-0 [&_h2]:mb-2 [&_h2]:text-2xl [&_h2]:tracking-tight',
  statGrid: 'my-5 grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5',
  statCard:
    'flex hover:border-spice-400/60 focus-visible:outline-2 focus-visible:outline-spice-400 min-w-0 flex-col gap-3.5 border border-sand-200/15 bg-sand-100/[0.04] p-4 text-left text-sand-100 sm:p-5 [&_span]:text-xs [&_span]:text-sand-400 [&_strong]:break-words [&_strong]:text-[clamp(20px,2.2vw,32px)] [&_strong]:font-semibold [&_strong]:tracking-tight [&_small]:text-[0.625rem] [&_small]:text-sand-400',
  trendGrid: 'grid grid-cols-1 gap-4 sm:grid-cols-2',
  trend:
    'mb-5 min-w-0 border border-sand-200/15 bg-sand-100/[0.04] p-4 shadow-[4px_4px_0_0_rgb(0_0_0/0.5)] sm:p-6 [&_h3]:mb-3.5 [&_h3]:text-sm [&_h3]:font-semibold [&_p]:text-xs [&_p]:leading-7 [&_p]:text-sand-400 [&_small]:text-[0.625rem] [&_small]:text-sand-400 [&_svg]:max-h-36 [&_svg]:w-full',
  quickGrid:
    'my-1 mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4 [&_a]:block [&_a]:border [&_a]:border-sand-200/15 [&_a]:bg-sand-100/[0.04] [&_a]:p-4 [&_a]:text-left [&_a]:text-[0.8125rem] [&_a]:text-sand-100 [&_a]:no-underline [&_a:hover]:border-spice-400/60 [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-spice-400 [&_span]:mt-2 [&_span]:block [&_span]:text-[0.625rem] [&_span]:text-sand-400',
  serviceList:
    'mb-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 [&>div]:bg-sand-100/10 [&>div]:p-3.5 [&>div]:text-xs [&_span]:mt-2 [&_span]:block [&_span]:text-sand-400',
  setupList:
    'grid grid-cols-1 gap-3.5 sm:grid-cols-[repeat(auto-fit,minmax(240px,1fr))] [&_article]:border [&_article]:border-sand-200/15 [&_article]:p-4 [&_header]:flex [&_header]:items-center [&_header]:justify-between [&_header]:gap-2.5 [&_header]:text-xs',
  ready: 'whitespace-nowrap bg-sand-100/10 px-2 py-1 text-[0.625rem] text-emerald-300',
  needsAttention: 'whitespace-nowrap bg-sand-100/10 px-2 py-1 text-[0.625rem] text-amber-300',
  operationGuide:
    'my-4 border border-sand-200/15 bg-sand-100/10 p-3.5 [&_dl]:m-0 [&_dl]:grid [&_dl]:gap-3 [&_dt]:text-[0.625rem] [&_dt]:text-sand-400 [&_dd]:mt-1 [&_dd]:break-words [&_dd]:text-xs [&_dd]:leading-relaxed',
  statPanels:
    'grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4 [&>p]:col-span-full',
  featureGrid: `my-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 [&_button]:flex [&_button]:flex-col [&_button]:gap-2 [&_button]:border [&_button]:border-sand-200/15 [&_button]:bg-sand-100/[0.04] [&_button]:p-4 [&_button]:text-left [&_button]:text-sand-100 [&_button:hover]:border-spice-400/60 [&_span]:text-xs [&_span]:text-sand-400`,
  guildGrid: `my-5 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] [&_button]:flex [&_button]:flex-col [&_button]:gap-2 [&_button]:border [&_button]:border-sand-200/15 [&_button]:bg-sand-100/[0.04] [&_button]:p-4 [&_button]:text-left [&_button]:text-sand-100 [&_button:hover]:border-spice-400/60 [&_button[aria-pressed=true]]:border-spice-400 [&_strong]:break-words [&_span]:text-xs [&_span]:text-sand-400`,
  directoryHeading: 'mb-5 flex flex-wrap items-center justify-between gap-3 [&_p]:text-xs [&_p]:text-sand-400',
  oversight: `min-w-0 border border-sand-200/15 bg-sand-100/[0.04] p-4 sm:p-6 [&_h2]:text-xl [&_h3]:mt-7 [&_h3]:text-base [&_p]:break-words [&_p]:text-[0.8125rem] [&_form]:items-end [&_form_label]:m-0 [&_form_label]:min-w-36 [&_form_label]:flex-1 ${buttons} ${controls} ${links}`,
  guildDetail: 'mt-7 border-t border-sand-200/15 pt-5',
  applicationRecord: 'mb-2.5 border border-sand-200/15 p-4 text-[0.8125rem] [&_summary]:cursor-pointer',
  conversation: 'max-h-[450px] overflow-auto px-7 py-4 [&_li]:break-words [&_li]:py-3 [&_small]:text-sand-400',
  help: 'mb-4 border-y border-sand-200/15 py-3 text-[0.6875rem] leading-7 text-sand-400 [&_summary]:cursor-pointer [&_summary]:text-sand-300 [&_p]:whitespace-pre-wrap [&_p]:break-words',
  confirmation:
    'mt-5 border border-amber-200/15 bg-spice-900/10 p-4 [&_strong]:text-xs [&_strong]:text-sand-200 [&_p]:text-[0.6875rem] [&_p]:leading-7 [&_p]:text-sand-300 [&>code]:block [&>code]:break-words [&>code]:font-mono [&>code]:text-[0.625rem] [&>code]:text-sand-200 [&_.field]:mb-0',
  result: `mt-6 min-w-0 border-t border-sand-200/15 pt-4 [&_h3]:mb-3.5 [&_h3]:text-xs [&_h3]:font-medium [&_details]:text-[0.6875rem] [&_summary]:cursor-pointer [&_summary]:text-sand-300 [&_pre]:max-h-[540px] [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:border [&_pre]:border-sand-200/15 [&_pre]:bg-obsidian-950 [&_pre]:p-3.5 [&_pre]:font-mono [&_pre]:text-[0.625rem] [&_pre]:leading-[1.8] [&_pre]:text-sand-300 ${buttons} ${links}`,
  advancedLink: `mt-4 text-xs ${links}`,
  method:
    'inline-flex shrink-0 items-center border border-sand-200/15 bg-sand-100/10 px-1.5 py-0.5 font-mono text-[0.5625rem] text-sand-400',
  route: 'mb-5 block break-words font-mono text-[0.6875rem] text-sand-400',
  operationHeader: 'flex items-center gap-2.5 text-[0.625rem] text-sand-400',
  count: 'mx-3.5 my-3 text-[0.625rem] text-sand-400',
  search: `grid gap-2.5 px-3.5 pt-4 text-[0.6875rem] text-sand-400 ${controls}`,
  operations: 'min-w-0 overflow-hidden border border-sand-200/15 bg-sand-100/[0.04]',
  detail: `min-w-0 border border-sand-200/15 bg-sand-100/[0.04] p-4 sm:p-5 [&_h2]:my-4 [&_h2]:break-words [&_h2]:text-[1.0625rem] [&_h2]:font-medium [&_h2]:leading-normal ${buttons} ${controls} ${links}`,
  operationList:
    'max-h-64 overflow-y-auto p-1.5 lg:max-h-[800px] [&_button]:flex [&_button]:w-full [&_button]:items-start [&_button]:gap-2 [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-3 [&_button]:text-left [&_button]:text-[0.6875rem] [&_button]:leading-relaxed [&_button]:text-sand-300 [&_button+button]:border-t [&_button+button]:border-sand-200/15 [&_button:hover]:bg-spice-500/15 [&_button[aria-pressed=true]]:bg-spice-500/10 [&_button[aria-pressed=true]]:text-spice-400 [&_button:disabled]:opacity-50 [&_small]:mt-1.5 [&_small]:block [&_small]:break-all [&_small]:text-[0.5625rem] [&_small]:text-sand-400',
  sidebar:
    'flex max-h-40 flex-row flex-wrap gap-1.5 overflow-auto border border-sand-200/15 bg-obsidian-900/70 p-3 lg:sticky lg:top-40 lg:max-h-[calc(100vh-170px)] lg:flex-col [&_h2]:mb-3 [&_h2]:hidden [&_h2]:text-[0.6875rem] [&_h2]:text-sand-400 lg:[&_h2]:block [&_button]:flex [&_button]:min-h-9 [&_button]:items-center [&_button]:justify-between [&_button]:gap-2 [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button]:text-[0.6875rem] [&_button]:text-sand-400 lg:[&_button]:w-full [&_button:hover]:bg-spice-500/15 [&_button:hover]:text-sand-100 [&_button[aria-pressed=true]]:bg-spice-500/10 [&_button[aria-pressed=true]]:text-spice-400 [&_button_span]:font-mono [&_button_span]:text-[0.5625rem] [&_button_span]:text-sand-400',
  workspace:
    'grid grid-cols-1 items-start gap-4 min-[1000px]:grid-cols-[170px_250px_minmax(0,1fr)] min-[651px]:max-[999px]:grid-cols-[250px_minmax(0,1fr)] [&>aside]:max-[999px]:col-span-full',
  workspaceNarrow: 'grid grid-cols-1 items-start gap-4 min-[901px]:grid-cols-[250px_minmax(0,1fr)]',
} as const;
