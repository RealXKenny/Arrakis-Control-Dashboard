export type LiveEvent = {
  id: string;
  source: string;
  receivedAt: number;
  kind: 'chat' | 'activity' | 'status' | 'observation';
  fields: Record<string, string | number | boolean | null>;
};
export type LiveReading = {
  enabled: boolean;
  connectedAt: number | null;
  admin: boolean;
  events: LiveEvent[];
};
