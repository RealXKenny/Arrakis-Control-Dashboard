export const progressionTabs = [
  { id: 'briefing', label: 'Briefing' },
  { id: 'goals', label: 'Goals' },
  { id: 'builds', label: 'Skill builds' },
  { id: 'unlocks', label: 'Research' },
  { id: 'journey', label: 'Journey' },
  { id: 'journal', label: 'Journal' },
  { id: 'notebook', label: 'Notebook' },
] as const;
export type ProgressionTab = (typeof progressionTabs)[number]['id'];
