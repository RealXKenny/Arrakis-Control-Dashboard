export type ImportRecord = {
  id: string;
  title: string;
  at: string;
  status: 'pending' | 'imported' | 'unconfirmed';
  message: string;
};
