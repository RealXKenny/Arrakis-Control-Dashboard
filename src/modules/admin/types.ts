export type AdminOperation = {
  id: string;
  method: string;
  route: string;
  group: string;
  title: string;
  parameters: string;
  provider: string;
  mode: string;
  pathParameters: string[];
  confirmationPhrases: string[];
  files?: string[];
  restriction?: string;
};
