import { IncidentPriority } from "./incident.model";

export type AssistantMessageType = 'info' | 'alert' | 'success' | 'predictive' | 'incident_draft';

export interface AssistantMessage {
  timestamp: Date;
  type: AssistantMessageType;
  message: string;
  involvedBusId?: number; // Optional, to link message to a bus
  incidentDraft?: {
    title: string;
    priority: IncidentPriority;
  }
}