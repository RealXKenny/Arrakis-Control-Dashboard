export default function MarketPlannerLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading market planner">
      <div className="mb-10 h-16 w-64 animate-pulse bg-sand-100/5" />
      <div className="h-48 animate-pulse border border-sand-200/10 bg-sand-100/[0.03]" />
    </div>
  );
}
