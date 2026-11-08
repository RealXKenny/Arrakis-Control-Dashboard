export type ChangelogSection = {
  title: string;
  items: string[];
};

export type ChangelogRelease = {
  version: string;
  /** Empty when the heading carries no date (the `Patch Notes vX.Y.Z` format). */
  date: string;
  sections: ChangelogSection[];
};
