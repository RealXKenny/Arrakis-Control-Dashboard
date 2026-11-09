'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AnchorHTMLAttributes } from 'react';
import { needsDocumentNavigation } from './nav-config';

/** Native links apply the destination document's CSP; ordinary dashboard links keep client navigation. */
export function NavigationLink({
  href,
  prefetch,
  ...props
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: string; prefetch?: boolean }) {
  const pathname = usePathname();
  if (needsDocumentNavigation(pathname, href)) return <a href={href} {...props} />;
  return <Link href={href} prefetch={prefetch} {...props} />;
}
