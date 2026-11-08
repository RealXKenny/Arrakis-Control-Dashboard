import type { NavIdentity } from '../../features/auth/identity';

export function Avatar({ identity, size = 'default' }: { identity: NavIdentity; size?: 'default' | 'large' }) {
  const large = size === 'large';
  const dimensions = large ? 40 : 32;
  const classes = large ? 'size-10 border-[#8f621d]/70' : 'size-8 border-[#302B24]';
  if (identity.avatarUrl) {
    return (
      // Discord CDN avatars are already sized; next/image adds nothing for this small decoration.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={identity.avatarUrl}
        alt=""
        width={dimensions}
        height={dimensions}
        className={`${classes} shrink-0 border object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex ${classes} shrink-0 items-center justify-center border bg-[#1B1A18] text-xs font-bold text-spice-300`}
    >
      {identity.ign.slice(0, 1).toUpperCase()}
    </span>
  );
}
