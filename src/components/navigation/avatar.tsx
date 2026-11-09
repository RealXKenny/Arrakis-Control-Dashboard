import type { NavIdentity } from '../../features/auth/identity';
import { AvatarImage } from '../ui/avatar-image';

export function Avatar({ identity, size = 'default' }: { identity: NavIdentity; size?: 'default' | 'large' }) {
  const large = size === 'large';
  const dimensions = large ? 40 : 32;
  const classes = large ? 'size-10 border-[#8f621d]/70' : 'size-8 border-[#302B24]';
  return (
    <span
      aria-hidden="true"
      className={`flex ${classes} shrink-0 items-center justify-center border bg-[#1B1A18] text-xs font-bold text-spice-300`}
    >
      <AvatarImage
        src={identity.avatarUrl}
        width={dimensions}
        height={dimensions}
        className="size-full object-cover"
        fallback={identity.ign.slice(0, 1).toUpperCase()}
      />
    </span>
  );
}
