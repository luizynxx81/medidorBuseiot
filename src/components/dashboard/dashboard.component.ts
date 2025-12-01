
import { Component, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, WritableSignal, inject, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { GeminiService } from '../../services/gemini.service';
import { FeedbackAnalysis } from '../../models/feedback-analysis.model';
import { FeedbackAnalysisComponent } from '../feedback-analysis/feedback-analysis.component';
import { AccessibilityAnalyzerComponent } from '../accessibility-analyzer/accessibility-analyzer.component';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';
import { SettingsService, AppSettings } from '../../services/settings.service';
import { ReportsModalComponent } from '../reports-modal/reports-modal.component';
import { IncidentTrackerModalComponent } from '../incident-tracker-modal/incident-tracker-modal.component';
import { IncidentFormModalComponent } from '../incident-form-modal/incident-form-modal.component';
import { ScenarioSetupModalComponent } from '../scenario-setup-modal/scenario-setup-modal.component';
import { SimulationControlComponent } from '../simulation-control/simulation-control.component';
import { SimulationReportModalComponent } from '../simulation-report-modal/simulation-report-modal.component';
import { AiAssistantComponent } from '../ai-assistant/ai-assistant.component';
import { Stop } from '../../models/stop.model';
import { Incident, IncidentStatus } from '../../models/incident.model';
import { AssistantMessage } from '../../models/ai-assistant.model';
import { SimulationReport, SimulationScenario, UserAction } from '../../models/simulation.model';
import { alertSound } from '../../assets/audio-alert';


// --- DATA STRUCTURES ---
export type BusStatus = 'En Ruta' | 'Llegando' | 'Detenido' | 'Saliendo';
export type ProximityStatus = 'safe' | 'caution' | 'danger';
export interface BusEvent {
  timestamp: Date;
  message: string;
}

export interface Bus {
  id: number;
  name: string;
  route: string;
  driver: string;
  status: WritableSignal<BusStatus>;
  curbDistanceCm: WritableSignal<number>;
  proximityStatus: WritableSignal<ProximityStatus>;
  eventLog: WritableSignal<BusEvent[]>;
}

export interface Route {
  name: string;
  buses: Bus[];
}

@Component({
  selector: 'app-dashboard',
  imports: [
    CommonModule, DatePipe, FeedbackAnalysisComponent, AccessibilityAnalyzerComponent,
    SettingsModalComponent, ReportsModalComponent, IncidentTrackerModalComponent,
    IncidentFormModalComponent, ScenarioSetupModalComponent, SimulationControlComponent,
    SimulationReportModalComponent, AiAssistantComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  // --- INJECTED SERVICES ---
  private geminiService = inject(GeminiService);
  settingsService = inject(SettingsService);

  // --- CONFIGURATION ---
  readonly REALTIME_SIMULATION_INTERVAL_MS = 2000;
  readonly MAX_IMAGE_SIZE_MB = 4;
  private audioAlert = new Audio(alertSound);

  // --- STATE SIGNALS ---
  buses = signal<Bus[]>([]);
  routes = computed(() => this.groupBusesByRoute());
  selectedBus = signal<Bus | null>(null);
  stops = signal<Stop[]>([]);
  incidents = signal<Incident[]>([]);
  isMenuOpen = signal(false);

  // Modal states
  isSettingsModalOpen = signal(false);
  isHelpModalOpen = signal(false);
  isReportsModalOpen = signal(false);
  isIncidentTrackerModalOpen = signal(false);
  isIncidentFormModalOpen = signal(false);
  incidentFormData = signal<{ eventMessage: string; bus: Bus, title?: string, priority?: 'Baja' | 'Media' | 'Alta' } | null>(null);

  // Simulation states
  isSimulationRunning = signal(false);
  isScenarioSetupModalOpen = signal(false);
  isSimulationReportModalOpen = signal(false);
  simulationReport = signal<SimulationReport | null>(null);
  private simulationInterval: any;
  private userActions: UserAction[] = [];
  private simulationStartTime = 0;


  // Feedback form state
  feedbackType = signal<'felicitacion' | 'sugerencia' | 'denuncia'>('sugerencia');
  feedbackMessage = signal('');
  feedbackImageFile = signal<File | null>(null);
  feedbackImagePreviewUrl = signal<string | null>(null);
  isSubmittingFeedback = signal(false);
  analysisResult = signal<FeedbackAnalysis | null>(null);
  analysisError = signal<string | null>(null);

  // --- DERIVED COMPUTED SIGNALS ---
  isFeedbackFormValid = computed(() => this.feedbackMessage().trim().length > 0 || this.feedbackImageFile() !== null);
  
  constructor() {
     effect(() => {
      const bus = this.selectedBus();
      if (bus && bus.proximityStatus() === 'danger' && this.settingsService.settings().soundAlertsEnabled) {
        this.playAudioAlert();
      }
    });
  }

  ngOnInit(): void {
    this.initializeBuses();
    this.initializeStops();
    this.initializeIncidents();
    this.startRealtimeSimulation();
  }

  ngOnDestroy(): void {
    this.stopSimulation();
  }

  // --- INITIALIZATION ---
  initializeBuses(): void {
    const initialBuses: Bus[] = [
      { id: 72, name: 'Bus #72A', route: 'Ruta Central', driver: 'Ana García', status: signal('En Ruta'), curbDistanceCm: signal(18), proximityStatus: signal('caution'), eventLog: signal([]) },
      { id: 128, name: 'Bus #128B', route: 'Paradero Norte', driver: 'Carlos Ruiz', status: signal('Detenido'), curbDistanceCm: signal(10), proximityStatus: signal('safe'), eventLog: signal([]) },
      { id: 72, name: 'Bus #72C', route: 'Paradero Sur', driver: 'Lucía Fernández', status: signal('Detenido'), curbDistanceCm: signal(12), proximityStatus: signal('safe'), eventLog: signal([]) },
    ];
    this.buses.set(initialBuses);
    this.selectedBus.set(initialBuses[0]);
  }

  initializeStops(): void {
    this.stops.set([
        { id: 'stop-01', name: 'Plaza Mayor', route: 'Ruta Central', status: 'Apto', issues: [], lastChecked: '2024-07-20' },
        { id: 'stop-02', name: 'Mercado Central', route: 'Ruta Central', status: 'No Apto', issues: [{ id: 1, description: 'Bordillo roto', severity: 'Alta' }, { id: 2, description: 'Falta de rampa', severity: 'Alta' }], lastChecked: '2024-07-19' },
        { id: 'stop-03', name: 'Hospital General', route: 'Paradero Norte', status: 'Apto', issues: [], lastChecked: '2024-07-21' },
        { id: 'stop-04', name: 'Parque Industrial', route: 'Paradero Norte', status: 'Pendiente', issues: [{ id: 3, description: 'Obstrucción por vendedor ambulante', severity: 'Media' }], lastChecked: '2024-07-18' },
        { id: 'stop-05', name: 'Centro Comercial Sur', route: 'Paradero Sur', status: 'Apto', issues: [], lastChecked: '2024-07-22' },
    ]);
  }

  initializeIncidents(): void {
    this.incidents.set([
      { id: 1, title: 'Proximidad peligrosa repetida', priority: 'Alta', status: 'Abierto', createdAt: new Date(), bus: { id: 72, name: 'Bus #72A', driver: 'Ana García' }, triggeringEvent: 'Distancia detectada: 44 cm' }
    ]);
  }

  groupBusesByRoute(): Route[] {
    const grouped: { [key: string]: Bus[] } = {};
    this.buses().forEach(bus => {
      if (!grouped[bus.route]) {
        grouped[bus.route] = [];
      }
      grouped[bus.route].push(bus);
    });
    return Object.keys(grouped).map(key => ({ name: key, buses: grouped[key] }));
  }

  // --- SIMULATION ---
  startRealtimeSimulation(): void {
    if (this.simulationInterval) return;
    this.simulationInterval = setInterval(() => this.updateBusStates(), this.REALTIME_SIMULATION_INTERVAL_MS);
  }

  stopSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  updateBusStates(): void {
    const { cautionThreshold, dangerThreshold } = this.settingsService.settings();
    this.buses.update(buses => {
      return buses.map(bus => {
        const currentDistance = bus.curbDistanceCm();
        let newDistance = currentDistance + (Math.random() - 0.5) * 8;
        newDistance = Math.max(5, Math.min(50, newDistance)); // Clamp between 5 and 50 cm
        bus.curbDistanceCm.set(newDistance);

        const newStatus: ProximityStatus = newDistance > dangerThreshold ? 'danger' : newDistance > cautionThreshold ? 'caution' : 'safe';

        if (bus.proximityStatus() !== newStatus && (newStatus === 'danger' || newStatus === 'caution')) {
          const eventMessage = `Distancia detectada: ${newDistance.toFixed(0)} cm`;
          bus.eventLog.update(log => [{ timestamp: new Date(), message: eventMessage }, ...log.slice(0, 4)]);
        }
        bus.proximityStatus.set(newStatus);
        
        return bus;
      });
    });
  }
  
  // --- UI EVENT HANDLERS ---
  selectBus(bus: Bus): void {
    this.selectedBus.set(bus);
  }

  toggleMenu(): void {
    this.isMenuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  openSettingsModal(): void {
    this.isSettingsModalOpen.set(true);
    this.closeMenu();
  }

  openHelpModal(): void {
    this.isHelpModalOpen.set(true);
    this.closeMenu();
  }
  
  closeHelpModal(): void { this.isHelpModalOpen.set(false); }
  openReportsModal(): void { this.isReportsModalOpen.set(true); this.closeMenu(); }
  openIncidentTrackerModal(): void { this.isIncidentTrackerModalOpen.set(true); this.closeMenu(); }
  openScenarioSetupModal(): void { this.isScenarioSetupModalOpen.set(true); this.closeMenu(); }
  
  handleSettingsSave(newSettings: AppSettings): void {
    this.settingsService.saveSettings(newSettings);
    this.isSettingsModalOpen.set(false);
  }

  // --- INCIDENT MANAGEMENT ---
  createIncident(bus: Bus, event: BusEvent): void {
    this.incidentFormData.set({ bus, eventMessage: event.message });
    this.isIncidentFormModalOpen.set(true);
  }

  handleCreateIncident(data: { message: AssistantMessage, bus: Bus }): void {
    this.incidentFormData.set({ bus: data.bus, eventMessage: data.message.message });
    this.isIncidentFormModalOpen.set(true);
  }

  handleCreateIncidentFromDraft(data: { draft: AssistantMessage, bus: Bus }): void {
    const draft = data.draft.incidentDraft!;
    this.incidentFormData.set({
      bus: data.bus,
      eventMessage: data.draft.message,
      title: draft.title,
      priority: draft.priority
    });
    this.isIncidentFormModalOpen.set(true);
  }

  saveNewIncident(data: Omit<Incident, 'id' | 'createdAt' | 'status'>): void {
    this.incidents.update(incidents => {
      const newIncident: Incident = {
        ...data,
        id: Math.max(...incidents.map(i => i.id), 0) + 1,
        createdAt: new Date(),
        status: 'Abierto'
      };
      return [newIncident, ...incidents];
    });
    this.isIncidentFormModalOpen.set(false);
    this.incidentFormData.set(null);
  }

  handleStatusChange(event: { incidentId: number; newStatus: IncidentStatus }): void {
    this.incidents.update(incidents => 
      incidents.map(inc => 
        inc.id === event.incidentId ? { ...inc, status: event.newStatus } : inc
      )
    );
  }

  // --- SIMULATION CONTROL ---
  startSimulation(scenario: SimulationScenario): void {
    this.isScenarioSetupModalOpen.set(false);
    this.isSimulationRunning.set(true);
    // ... simulation logic would go here
  }

  endSimulation(): void {
    this.isSimulationRunning.set(false);
    this.simulationReport.set({
      scenario: { title: 'Simulación Manual', description: 'Escenario de prueba de finalización.', events: [] },
      actions: [],
      aiAnalysis: ''
    });
    this.isSimulationReportModalOpen.set(true);
  }


  // --- FEEDBACK FORM ---
  handleFeedbackInput(event: Event): void { this.feedbackMessage.set((event.target as HTMLTextAreaElement).value); }
  handleFeedbackTypeChange(event: Event): void { this.feedbackType.set((event.target as HTMLSelectElement).value as 'felicitacion' | 'sugerencia' | 'denuncia'); }

  handleImageSelection(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) { this.removeImage(); return; }
    if (!file.type.startsWith('image/')) { this.analysisError.set('Por favor, selecciona un archivo de imagen válido.'); return; }
    if (file.size > this.MAX_IMAGE_SIZE_MB * 1024 * 1024) { this.analysisError.set(`La imagen es demasiado grande. El máximo es ${this.MAX_IMAGE_SIZE_MB}MB.`); return; }
    this.feedbackImageFile.set(file);
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => this.feedbackImagePreviewUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
    (event.target as HTMLInputElement).value = '';
  }

  removeImage(): void {
    this.feedbackImageFile.set(null);
    this.feedbackImagePreviewUrl.set(null);
  }

  async submitFeedback(): Promise<void> {
    if (!this.isFeedbackFormValid() || this.isSubmittingFeedback()) return;
    this.isSubmittingFeedback.set(true);
    this.analysisResult.set(null);
    this.analysisError.set(null);
    if (!this.settingsService.settings().feedbackAnalysisEnabled) {
      setTimeout(() => {
        this.resetFeedbackForm();
        this.isSubmittingFeedback.set(false);
      }, 500);
      return;
    }
    try {
      let imagePayload: { base64: string; mimeType: string } | undefined;
      if (this.feedbackImageFile() && this.feedbackImagePreviewUrl()) {
        imagePayload = {
          base64: this.feedbackImagePreviewUrl()!.split(',')[1],
          mimeType: this.feedbackImageFile()!.type,
        };
      }
      const result = await this.geminiService.analyzeFeedback(this.feedbackMessage(), this.feedbackType(), imagePayload);
      this.analysisResult.set(result);
      this.resetFeedbackForm();
    } catch (error) {
      console.error('Error analyzing feedback:', error);
      this.analysisError.set('No se pudo analizar el comentario. Por favor, inténtalo de nuevo más tarde.');
    } finally {
      this.isSubmittingFeedback.set(false);
    }
  }
  
  resetFeedbackForm(): void {
    this.feedbackMessage.set('');
    this.feedbackType.set('sugerencia');
    this.removeImage();
  }

  clearAnalysis(): void {
    this.analysisResult.set(null);
    this.analysisError.set(null);
  }

  // --- AUDIO ---
  playAudioAlert(): void {
    this.audioAlert.currentTime = 0;
    this.audioAlert.play().catch(error => console.error("Audio playback failed:", error));
  }
}
