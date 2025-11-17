export type SimulationEventType = 'STATUS_CHANGE' | 'PROXIMITY_ALERT';
export type UserActionType = 'CREATE_INCIDENT_ATTEMPT' | 'INCIDENT_CREATED' | 'INCIDENT_STATUS_CHANGE' | 'CHAT_QUERY';

export interface SimulationEvent {
  time: number; // Time in seconds from start
  busId: number;
  type: SimulationEventType;
  payload: {
    newStatus?: 'en-ruta' | 'llegando' | 'detenido' | 'saliendo';
    distance?: number;
  };
}

export interface SimulationScenario {
  title: string;
  description: string;
  events: SimulationEvent[];
}

export interface UserAction {
  timestamp: number; // Time in seconds from start of simulation
  type: UserActionType;
  details: string;
}

export interface SimulationReport {
  scenario: SimulationScenario;
  actions: UserAction[];
  aiAnalysis: string;
}
