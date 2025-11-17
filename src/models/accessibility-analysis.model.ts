export type HazardSeverity = 'Bajo' | 'Medio' | 'Alto';

export interface AccessibilityHazard {
  description: string;
  severity: HazardSeverity;
}

export interface AccessibilityAnalysis {
  summary: string;
  hazards: AccessibilityHazard[];
}