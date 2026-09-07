import { useEffect, useState } from "react";

export function useServerStatus() {
  const [activePlayers, setActivePlayers] = useState(null);
  const [totalPlayers, setTotalPlayers] = useState(null);
  const [serverStatusError, setServerStatusError] = useState(false);

  async function loadTelemetry() {
    try {
      const res = await fetch("/api/server/status", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Server telemetry request failed: ${res.status} `);
      }

      const data = await res.json();

      setActivePlayers(data.activePlayers !== null ? Number(data.activePlayers) : null);

      setTotalPlayers(data.totalPlayers !== null ? Number(data.totalPlayers) : null);

      setServerStatusError(false);
    } catch (err) {
      setServerStatusError(true);
      setActivePlayers(null);
      setTotalPlayers(null);
    }
  }

  useEffect(() => {
    loadTelemetry();

    const interval = setInterval(loadTelemetry, 15000);

    return () => clearInterval(interval);
  }, []);

  return { activePlayers, totalPlayers, serverStatusError };
}
