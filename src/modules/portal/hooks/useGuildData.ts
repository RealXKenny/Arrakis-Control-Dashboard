import { cachedFetch, clearClientReadCache } from '../../../lib/client-cache';
import { captureException } from '@sentry/nextjs';
import { useEffect, useRef, useState } from 'react';
import { record, rows } from '../utils/inventory';

function idOf(value: Record<string, unknown>) {
  return value.guild_id ?? value.guildId ?? value.id;
}

function nameOf(value: Record<string, unknown>) {
  return value.guild_name ?? value.guildName ?? value.name;
}

function memberIdOf(value: Record<string, unknown>) {
  return (
    value.player_id ?? value.playerId ?? value.pawnId ?? value.pawn_id ?? value.controllerId ?? value.controller_id
  );
}

function memberNameOf(value: Record<string, unknown>) {
  return String(value.character_name ?? value.characterName ?? value.name ?? '')
    .trim()
    .toLowerCase();
}

export function useGuildData(character, enabled: boolean) {
  const [guilds, setGuilds] = useState<Record<string, unknown>[]>([]);
  const [members, setMembers] = useState<Record<string, unknown>[]>([]);
  const [logo, setLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const characterRef = useRef(character);
  const reported = record(character?.guild);
  const reportedId = reported.id ?? reported.guild_id ?? reported.guildId;
  const reportedName = reported.name ?? reported.guild_name;
  const playerId = character?.playerId;
  const characterName = String(character?.name ?? '')
    .trim()
    .toLowerCase();

  useEffect(() => {
    characterRef.current = character;
  }, [character]);

  useEffect(() => {
    const currentCharacter = characterRef.current;
    if (!enabled || !currentCharacter) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const guildResponse = await cachedFetch('/api/guilds?page=0&pageSize=100', { force: true });
        if (guildResponse.status === 401) {
          clearClientReadCache();
          throw new Error('Your session has ended. Connect Discord to continue.');
        }
        if (!guildResponse.ok) throw new Error(`Guilds returned ${guildResponse.status}`);
        const payload = record(await guildResponse.json());
        const data = record(payload.data);
        const nextGuilds = rows(data) ?? [];
        if (cancelled) return;
        setGuilds(nextGuilds);

        const current = nextGuilds.find((guild) => {
          return (
            (reportedId != null && String(idOf(guild)) === String(reportedId)) ||
            (nameOf(guild) != null && String(nameOf(guild)) === String(reportedName))
          );
        });
        const currentId = current ? idOf(current) : reportedId;
        if (currentId == null) return;
        const logoResponse = await cachedFetch(`/api/guilds/${encodeURIComponent(String(currentId))}/logo`, {
          force: true,
        });
        if (logoResponse.ok) {
          const logoPayload = record(await logoResponse.json());
          const logoData = record(logoPayload.data);
          if (!cancelled) setLogo(typeof logoData.logo === 'string' ? logoData.logo : null);
        }
        const memberResponse = await cachedFetch(`/api/guilds/${encodeURIComponent(String(currentId))}/members`, {
          force: true,
        });
        if (!memberResponse.ok) throw new Error(`Guild members returned ${memberResponse.status}`);
        const memberPayload = record(await memberResponse.json());
        const nextMembers = rows(record(memberPayload.data)) ?? [];
        if (!cancelled) setMembers(nextMembers);
      } catch (reason) {
        if (!cancelled) {
          captureException(reason);
          setError('Guild data is temporarily unavailable.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, reportedId, reportedName]);

  const currentGuild = guilds.find((guild) => {
    return (
      (reportedId != null && String(idOf(guild)) === String(reportedId)) ||
      (nameOf(guild) != null && String(nameOf(guild)) === String(reportedName))
    );
  });
  const currentMember = members.find(
    (member) =>
      (playerId != null && String(memberIdOf(member)) === String(playerId)) ||
      (characterName && memberNameOf(member) === characterName),
  );
  return {
    currentGuild: currentGuild ?? null,
    currentMember: currentMember ?? null,
    members,
    logo,
    setLogo,
    loading,
    error,
  };
}
