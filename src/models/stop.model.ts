export type StopStatus = 'Apto' | 'No Apto' | 'Pendiente';

export interface StopIssue {
  id: number;
  description: string;
  severity: 'Baja' | 'Media' | 'Alta';
}

export interface Stop {
  id: string;
  name: string;
  route: string;
  status: StopStatus;
  issues: StopIssue[];
  lastChecked: string;
}
