import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { findOperation } from '../../../../../features/admin/client';
import { QueryState, Table } from '../parts/DataPanel';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { useConfirmedAction } from '../hooks/useConfirmedAction';
import { guildMemberId, guildMemberName, guildMemberRole } from '../../../../../modules/guilds/members';
import { adminHref } from '../../../../../features/admin/navigation';
import { hasMore, idFrom, nameFrom, resultRows, type Row } from '../../../../../features/admin/records';
import type { AdminOperation } from '../../../../../features/admin/types';
import { ui } from '../ui';

const PAGE_SIZE = 20;
const LEADER = 100;
const OFFICER = 50;

export function rankLabel(role: number | null): string {
  if (role === null) return 'Unknown';
  if (role >= LEADER) return 'Leader';
  if (role >= OFFICER) return 'Officer';
  return 'Member';
}

function Roster({ operations, guildId, name }: { operations: AdminOperation[]; guildId: string; name: string }) {
  const url = useAdminUrl();
  const [notice, setNotice] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [rank, setRank] = useState('1');
  const members = useAdminQuery(findOperation(operations, 'get-guilds-guildid-members'), { path: { guildId } });
  const { act, dialog } = useConfirmedAction(operations, (message) => {
    setNotice(message);
    members.refresh();
  });
  const rows = resultRows(members.data) ?? [];
  const target = `${name} (guild ${guildId})`;
  function add(event: FormEvent) {
    event.preventDefault();
    const id = playerId.trim();
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) return setNotice('Enter a valid player ID.');
    act(
      'post-guilds-guildid-members',
      { path: { guildId }, body: { playerId: id, roleId: Number(rank) } },
      {
        title: 'Add a member',
        confirmLabel: 'Add member',
        danger: false,
        target: `Player ${id} → ${target}`,
        consequences: [
          `Adds this player as ${rank === '50' ? 'an Officer' : 'a Member'}.`,
          'The Console enforces member limits, existing membership and faction compatibility.',
        ],
        done: 'Member addition requested.',
      },
    );
    setPlayerId('');
  }
  return (
    <div className={ui.screen}>
      <div className={ui.toolbar}>
        <button type="button" onClick={() => url.update({ guild: null })}>
          ← All guilds
        </button>
        <h3 style={{ margin: 0 }}>{name}</h3>
        <span className={ui.stateLine}>ID {guildId}</span>
      </div>
      {notice && (
        <p role="status" className={ui.status}>
          {notice}
        </p>
      )}
      <section className={ui.panel} aria-label="Guild roster">
        <h3>Members</h3>
        <QueryState loading={members.loading} error={members.error} onRetry={members.refresh}>
          {rows.length === 0 ? (
            <p className={ui.stateLine}>This guild has no members.</p>
          ) : (
            <div className={ui.tableScroll}>
              <table>
                <caption className="sr-only">Guild members</caption>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Rank</th>
                    <th>Player ID</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((member: Row, index) => {
                    const id = guildMemberId(member);
                    const role = guildMemberRole(member);
                    const memberName = guildMemberName(member);
                    const isLeader = role !== null && role >= LEADER;
                    const label = `${memberName} (ID ${id}) in ${target}`;
                    return (
                      <tr key={id ?? index}>
                        <td>{memberName}</td>
                        <td>{rankLabel(role)}</td>
                        <td>{id ?? '—'}</td>
                        <td>
                          {id && !isLeader && (
                            <span className={ui.actions}>
                              {role !== null && role >= OFFICER ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      act(
                                        'post-guilds-guildid-members-playerid-promote',
                                        { path: { guildId, playerId: id } },
                                        {
                                          title: 'Promote an Officer to Leader',
                                          confirmLabel: 'Transfer leadership',
                                          phrase: 'TRANSFER LEADERSHIP',
                                          target: label,
                                          consequences: [
                                            'Promoting an Officer transfers leadership.',
                                            'The current Leader is demoted.',
                                            'Players may need to relog to see the change.',
                                          ],
                                          done: 'Leadership transfer requested.',
                                        },
                                      )
                                    }
                                  >
                                    Make leader…
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      act(
                                        'post-guilds-guildid-members-playerid-demote',
                                        { path: { guildId, playerId: id } },
                                        {
                                          title: 'Demote an Officer',
                                          confirmLabel: 'Demote',
                                          target: label,
                                          consequences: ['The Officer becomes a Member.'],
                                          done: 'Demotion requested.',
                                        },
                                      )
                                    }
                                  >
                                    Demote…
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    act(
                                      'post-guilds-guildid-members-playerid-promote',
                                      { path: { guildId, playerId: id } },
                                      {
                                        title: 'Promote a Member',
                                        confirmLabel: 'Promote',
                                        danger: false,
                                        target: label,
                                        consequences: ['The Member becomes an Officer.'],
                                        done: 'Promotion requested.',
                                      },
                                    )
                                  }
                                >
                                  Promote…
                                </button>
                              )}
                              <button
                                type="button"
                                className={ui.danger}
                                onClick={() =>
                                  act(
                                    'delete-guilds-guildid-members-playerid',
                                    { path: { guildId, playerId: id } },
                                    {
                                      title: 'Remove a member',
                                      confirmLabel: 'Remove member',
                                      target: label,
                                      consequences: [
                                        'The player leaves the guild.',
                                        'They can apply or be added again later.',
                                      ],
                                      done: 'Member removal requested.',
                                    },
                                  )
                                }
                              >
                                Remove…
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </QueryState>
      </section>
      <section className={ui.panel} aria-label="Add member">
        <h3>Add a member</h3>
        <form onSubmit={add}>
          <label className={ui.field}>
            Player ID
            <input value={playerId} onChange={(event) => setPlayerId(event.target.value)} />
          </label>
          <label className={ui.field}>
            Starting rank
            <select value={rank} onChange={(event) => setRank(event.target.value)}>
              <option value="1">Member</option>
              <option value="50">Officer</option>
            </select>
          </label>
          <button type="submit">Review…</button>
        </form>
        <p className={ui.stateLine}>
          Applications, conversations and private leader support chats are under{' '}
          <Link href={adminHref('guild-oversight')}>Guilds</Link>.
        </p>
      </section>
      <section className={ui.panel} aria-label="Disband guild">
        <h3>Disband</h3>
        <p className={ui.notice}>
          Disbanding removes the guild in the Console, then clears its recruitment listing, applications, logo and chats
          here. If the cleanup fails you are told; do not repeat the disband.
        </p>
        <div className={ui.actions}>
          <button
            type="button"
            className={ui.danger}
            onClick={() =>
              act(
                'delete-guilds-guildid',
                { path: { guildId }, body: { confirmation: 'DISBAND GUILD' } },
                {
                  title: 'Disband this guild',
                  confirmLabel: 'Disband guild',
                  phrase: 'DISBAND GUILD',
                  target,
                  consequences: [
                    'Every member is removed and the guild ceases to exist.',
                    'Its applications and support chats are deleted.',
                    'This cannot be undone.',
                  ],
                  done: 'Guild disbanded.',
                },
              )
            }
          >
            Disband guild…
          </button>
        </div>
      </section>
      {dialog}
    </div>
  );
}

export default function GuildToolsScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const guildId = url.read('guild');
  const search = url.read('q');
  const page = Math.max(0, Number(url.read('page')) || 0);
  const [draft, setDraft] = useState<string | null>(null);
  const list = useAdminQuery(
    findOperation(operations, 'get-guilds'),
    { query: { page, pageSize: PAGE_SIZE, ...(search ? { q: search } : {}) } },
    !guildId,
  );
  const selected = (resultRows(list.data) ?? []).find((row) => idFrom(row, 'guild') === guildId);
  if (guildId)
    return (
      <Roster
        operations={operations}
        guildId={guildId}
        name={selected ? nameFrom(selected, `Guild ${guildId}`) : `Guild ${guildId}`}
      />
    );
  return (
    <div className={ui.screen}>
      <form
        className={ui.toolbar}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          url.update({ q: draft ?? search, page: null });
          setDraft(null);
        }}
      >
        <label className={ui.field}>
          Search guilds
          <input type="search" value={draft ?? search} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <button type="submit">Search</button>
      </form>
      <QueryState loading={list.loading} error={list.error} onRetry={list.refresh}>
        <Table
          value={list.data}
          caption="Guilds"
          empty="No guilds match this search."
          action={(row: Row) => {
            const id = idFrom(row, 'guild');
            return id ? (
              <button
                aria-label={`Manage ${nameFrom(row, 'guild')}`}
                type="button"
                onClick={() => url.update({ guild: id })}
              >
                Manage
              </button>
            ) : null;
          }}
        />
        <nav className={ui.pager} aria-label="Guild pages">
          <button type="button" disabled={page === 0} onClick={() => url.update({ page: page - 1 || null })}>
            Previous page
          </button>
          <span>Page {page + 1}</span>
          <button
            type="button"
            disabled={!hasMore(list.data, page, PAGE_SIZE)}
            onClick={() => url.update({ page: page + 1 })}
          >
            Next page
          </button>
        </nav>
      </QueryState>
    </div>
  );
}
