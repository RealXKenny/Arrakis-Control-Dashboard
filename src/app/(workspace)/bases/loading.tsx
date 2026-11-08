export default function BasesLoading() {
  return (
    <div aria-busy="true" aria-label="Loading bases">
      <div className="mb-10 h-16 w-72 animate-pulse bg-sand-100/5" />
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="h-72 animate-pulse border border-sand-200/10 bg-sand-100/[0.03]" />
        ))}
      </ul>
    </div>
  );
}
