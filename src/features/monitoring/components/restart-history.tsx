import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import { readRestartHistory } from '../server/restart-history';

export async function RestartHistory() {
  let rows: Awaited<ReturnType<typeof readRestartHistory>> | null;
  try {
    rows = await readRestartHistory();
  } catch {
    rows = null;
  }
  return (
    <Card as="section" className="panel mb-6 p-6" aria-labelledby="restart-history-heading">
      <h2 id="restart-history-heading" className="text-lg">
        Recent verified restarts
      </h2>
      <p className="mt-2 text-sm text-sand-400">Console restart records do not establish an incident or its cause.</p>
      {rows === null ? (
        <p className="mt-3 text-sm">Restart history is unavailable.</p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm">No restart records were reported.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((item) => (
            <li key={item.id} className="text-sm">
              <strong>{item.scope === 'battlegroup' ? 'All servers' : item.map || item.scope}</strong>
              {' — '}
              {item.result === 'Succeeded' ? 'completed' : 'failed'}; <LocalTime value={item.finishedAt} />; duration{' '}
              {Math.round(item.durationSeconds)} seconds.
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
