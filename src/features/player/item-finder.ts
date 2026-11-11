export interface FoundItem {
  id: string;
  name: string;
  templateId: string;
  quantity: string;
  grade: string;
  durability: string;
  augments: string[];
  location: string;
  href: string;
}
export interface FinderSource {
  name: string;
  status: 'ok' | 'unavailable' | 'excluded' | 'limited';
  detail: string;
  checkedAt: string;
}
export interface FinderResult {
  items: FoundItem[];
  sources: FinderSource[];
  limited: boolean;
  startedAt: string;
}
