export type IncidentPriority = 'Baja' | 'Media' | 'Alta';
export type IncidentStatus = 'Abierto' | 'En Progreso' | 'Resuelto';

export interface Incident {
  id: number;
  title: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  createdAt: Date;
  bus: {
    id: number;
    name: string;
    driver: string;
  };
  triggeringEvent: string;
  notes?: string;
}
