import { readIncidentTimeline } from '../server/health';
import { IncidentTimelineView } from './incident-timeline-view';
import type { IncidentTimelineData } from '../incidents';

export async function IncidentTimeline() {
  let data: IncidentTimelineData;
  try {
    data = await readIncidentTimeline();
  } catch {
    data = {
      entries: [],
      healthAvailable: false,
      restartsAvailable: false,
      checkedAt: new Date().toISOString(),
    };
  }
  return <IncidentTimelineView data={data} />;
}
