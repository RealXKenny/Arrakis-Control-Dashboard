import type { AdminOperation } from '../types';
import { findOperation } from '../client';
import { ui } from './ui';

/** Lists operations the scoped API key cannot perform; it never renders a form or sends a request. */
export default function ConsoleHandoff({
  operations,
  ids,
  consoleOrigin,
  heading = 'Do this in the Console',
}: {
  operations: AdminOperation[];
  ids: string[];
  consoleOrigin?: string | null;
  heading?: string;
}) {
  const entries = ids
    .map((id) => findOperation(operations, id))
    .filter((entry): entry is AdminOperation => Boolean(entry));
  if (!entries.length) return null;
  return (
    <section className={ui.panel} aria-label={heading}>
      <h3>{heading}</h3>
      <p className={ui.notice}>
        The dashboard’s API credential is not allowed to perform these, so no form is offered. They are never run on
        your behalf.
      </p>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.title}
            <span className={ui.stateLine}> — {entry.restriction ?? 'Console only'}</span>
          </li>
        ))}
      </ul>
      {consoleOrigin && (
        <p>
          <a href={consoleOrigin} target="_blank" rel="noreferrer">
            Open Console ↗
          </a>
        </p>
      )}
    </section>
  );
}
