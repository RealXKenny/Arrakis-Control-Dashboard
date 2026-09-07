import Link from 'next/link';
import type { ComponentProps } from 'react';
import { navigatePortal } from '../hooks/usePortalView';

export default function PortalLink(props: ComponentProps<typeof Link>) {
  const portal = typeof props.href === 'string' && props.href.startsWith('/portal?view=');
  return (
    <Link
      {...props}
      as={portal ? '/portal' : props.as}
      shallow={portal || props.shallow}
      onClick={(event) => {
        props.onClick?.(event);
        if (
          !event.defaultPrevented &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          typeof props.href === 'string' &&
          navigatePortal(props.href)
        )
          event.preventDefault();
      }}
    />
  );
}
