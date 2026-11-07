export default function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-unread-count={count}
      aria-label={`${count} unread messages`}
      title={`${count} unread messages`}
      className="ml-1.5 inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-bold text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
