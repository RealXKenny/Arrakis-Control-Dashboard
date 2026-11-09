import { Logo } from '../brand/logo';

/** Branding and the disclaimer, nothing else. It sits in normal flow; the page layout pins it to the bottom. */
export function SiteFooter() {
  return (
    <footer className="site-footer border-t border-[#302B24] bg-[#0B0C0E]">
      <div className="flex w-full flex-col items-center justify-center gap-4 px-4 py-6 text-center sm:px-6 xl:px-8 md:h-[4.5rem] md:flex-row md:justify-between md:py-0 md:text-left">
        <Logo />
        <p className="text-balance text-sm leading-5 text-[#A89B87] md:whitespace-nowrap">
          Fan-made. Not affiliated with Funcom.
        </p>
      </div>
    </footer>
  );
}
