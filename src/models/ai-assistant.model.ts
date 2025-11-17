export type AssistantMessageType = 'info' | 'alert' | 'success';

export interface AssistantMessage {
  timestamp: Date;
  type: AssistantMessageType;
  message: string;
  involvedBusId?: number; // Optional, to link message to a bus
}
