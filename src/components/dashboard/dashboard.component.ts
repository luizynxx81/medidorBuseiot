


import { Component, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, WritableSignal, inject, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { GeminiService } from '../../services/gemini.service';
import { FeedbackAnalysis } from '../../models/feedback-analysis.model';
import { FeedbackAnalysisComponent } from '../feedback-analysis/feedback-analysis.component';
import { AccessibilityAnalyzerComponent } from '../accessibility-analyzer/accessibility-analyzer.component';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';
import { SettingsService, AppSettings } from '../../services/settings.service';
import { alertSound } from '../../assets/audio-alert';
import { ReportsModalComponent } from '../reports-modal/reports-modal.component';
import { Stop } from '../../models/stop.model';
import { AiAssistantComponent } from '../ai-assistant/ai-assistant.component';
import { ChatAssistantComponent } from '../chat-assistant/chat-assistant.component';
import { Incident, IncidentPriority, IncidentStatus } from '../../models/incident.model';
import { IncidentFormModalComponent } from '../incident-form-modal/incident-form-modal.component';
import { IncidentTrackerModalComponent } from '../incident-tracker-modal/incident-tracker-modal.component';
import { AssistantMessage } from '../../models/ai-assistant.model';
import { ScenarioSetupModalComponent } from '../scenario-setup-modal/scenario-setup-modal.component';
import { SimulationReportModalComponent } from '../simulation-report-modal/simulation-report-modal.component';
import { SimulationControlComponent } from '../simulation-control/simulation-control.component';
import { SimulationScenario, UserAction, SimulationReport } from '../../models/simulation.model';

// --- DATA STRUCTURES ---
type BusStatus = 'en-ruta' | 'llegando' | 'detenido' | 'saliendo';
type EventLevel = 'caution' | 'danger';

export interface BusEvent {
  timestamp: Date;
  level: EventLevel;
  message: string;
}

export interface Bus {
  id: number;
  name: string;
  route: string;
  driver: string;
  status: WritableSignal<BusStatus>;
  curbDistanceCm: WritableSignal<number>;
  stateTimer: WritableSignal<number>;
  eventLog: WritableSignal<BusEvent[]>;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, DatePipe, FeedbackAnalysisComponent, AccessibilityAnalyzerComponent, SettingsModalComponent, ReportsModalComponent, AiAssistantComponent, ChatAssistantComponent, IncidentFormModalComponent, IncidentTrackerModalComponent, ScenarioSetupModalComponent, SimulationReportModalComponent, SimulationControlComponent],
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
  readonly SCENARIO_SIMULATION_INTERVAL_MS = 1500;
  readonly MAX_IMAGE_SIZE_MB = 4;
  readonly MAX_LOG_ENTRIES = 5;

  // --- STATE SIGNALS ---
  buses = signal<Bus[]>([]);
  stops = signal<Stop[]>([]);
  incidents = signal<Incident[]>([]);
  selectedBus = signal<Bus | null>(null);
  isMenuOpen = signal(false);
  isSettingsModalOpen = signal(false);
  isReportsModalOpen = signal(false);
  isHelpModalOpen = signal(false);
  isIncidentTrackerOpen = signal(false);
  isIncidentFormOpen = signal(false);
  incidentToCreate = signal<{ eventMessage: string; bus: Bus; title?: string; priority?: IncidentPriority; } | null>(null);
  
  private alertAudio: HTMLAudioElement;
  private isAudioUnlocked = signal(false);

  // Simulation State
  isSimulationRunning = signal(false);
  simulationScenario = signal<SimulationScenario | null>(null);
  simulationUserActions = signal<UserAction[]>([]);
  simulationTime = signal(0);
  isScenarioSetupOpen = signal(false);
  isSimulationReportOpen = signal(false);
  simulationReport = signal<SimulationReport | null>(null);
  private simulationInterval: any;
  private scenarioEventIndex = 0;


  // Feedback form state
  feedbackType = signal<'felicitacion' | 'sugerencia' | 'denuncia'>('sugerencia');
  feedbackMessage = signal('');
  feedbackImageFile = signal<File | null>(null);
  feedbackImagePreviewUrl = signal<string | null>(null);
  isSubmittingFeedback = signal(false);
  analysisResult = signal<FeedbackAnalysis | null>(null);
  analysisError = signal<string | null>(null);

  // --- DERIVED COMPUTED SIGNALS (for the selected bus) ---
  safetyStatus = computed<'safe' | 'caution' | 'danger' | 'none'>(() => {
    const bus = this.selectedBus();
    const { cautionThreshold, dangerThreshold } = this.settingsService.settings();
    if (!bus || bus.status() !== 'detenido') {
      return 'none';
    }
    const distance = bus.curbDistanceCm();
    if (distance <= cautionThreshold) return 'safe';
    if (distance <= dangerThreshold) return 'caution';
    return 'danger';
  });
  
  safetyVisuals = computed(() => {
    const status = this.safetyStatus();
    switch (status) {
      case 'safe':
        return { text: 'text-green-500 dark:text-green-400', glow: 'text-glow-green', border: 'border-green-400', bg: 'bg-green-400', lightGlow: 'light-glow-green' };
      case 'caution':
        return { text: 'text-yellow-500 dark:text-yellow-400', glow: 'text-glow-yellow', border: 'border-yellow-400', bg: 'bg-yellow-400', lightGlow: 'light-glow-yellow' };
      case 'danger':
        return { text: 'text-red-600 dark:text-red-500', glow: 'text-glow-red', border: 'border-red-500', bg: 'bg-red-500', lightGlow: 'light-glow-red' };
      default: // 'none'
        return { text: 'text-cyan-600 dark:text-cyan-400', glow: '', border: 'border-slate-400 dark:border-slate-700', bg: 'bg-slate-300 dark:bg-slate-800', lightGlow: '' };
    }
  });

  isFeedbackFormValid = computed(() => {
    return this.feedbackMessage().trim().length > 0 || this.feedbackImageFile() !== null;
  });

  // Map status ID to human-readable text
  getStatusMessage(status: BusStatus): string {
    switch (status) {
      case 'en-ruta': return 'En Ruta';
      case 'llegando': return 'Llegando';
      case 'detenido': return 'Detenido';
      case 'saliendo': return 'Saliendo';
    }
  }
  
  constructor() {
    this.alertAudio = new Audio(alertSound);
    // Effect to play sound on new 'danger' status
    effect((onCleanup) => {
        const status = this.safetyStatus();
        const soundEnabled = this.settingsService.settings().soundAlertsEnabled;

        let previousStatus: 'safe' | 'caution' | 'danger' | 'none' | undefined;
        onCleanup(() => previousStatus = status);
        
        // Only attempt to play if the user has interacted with the page first
        if (this.isAudioUnlocked() && soundEnabled && status === 'danger' && previousStatus !== 'danger') {
            this.alertAudio.play().catch(e => console.error("Error playing sound:", e));
        }
    }, { allowSignalWrites: false });
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
  
  initializeBuses(): void {
    const initialBuses: Bus[] = [
      { id: 1, name: 'Bus #72A', route: 'Ruta Central', driver: 'Ana García', status: signal('detenido'), curbDistanceCm: signal(28), stateTimer: signal(5), eventLog: signal([]) },
      { id: 2, name: 'Bus #72B', route: 'Ruta Norte', driver: 'Carlos Pérez', status: signal('en-ruta'), curbDistanceCm: signal(0), stateTimer: signal(8), eventLog: signal([]) },
      { id: 3, name: 'Bus #72C', route: 'Ruta Sur', driver: 'Sofía Rodríguez', status: signal('llegando'), curbDistanceCm: signal(0), stateTimer: signal(3), eventLog: signal([]) },
    ];
    this.buses.set(initialBuses);
    this.selectedBus.set(initialBuses[0]);
    // Log initial events if necessary
    initialBuses.forEach(bus => {
        if (bus.status() === 'detenido') {
            this.logProximityEvent(bus);
        }
    });
  }

  initializeStops(): void {
    const initialStops: Stop[] = [
        { id: 'stop-01', name: 'Estación Central', route: 'Ruta Central', status: 'Apto', issues: [], lastChecked: 'Hoy' },
        { id: 'stop-02', name: 'Plaza Mayor', route: 'Ruta Central', status: 'No Apto', issues: [{id: 1, description: 'Rampa de acceso obstruida por basura.', severity: 'Alta'}, {id: 2, description: 'Iluminación insuficiente.', severity: 'Media'}], lastChecked: 'Ayer' },
        { id: 'stop-03', name: 'Mercado Norte', route: 'Ruta Norte', status: 'Apto', issues: [], lastChecked: 'Hoy' },
        { id: 'stop-04', name: 'Hospital General', route: 'Ruta Sur', status: 'No Apto', issues: [{id: 1, description: 'El pavimento está roto cerca de la zona de espera.', severity: 'Media'}], lastChecked: 'Hace 3 días'},
        { id: 'stop-05', name: 'Parque de la Ciudad', route: 'Ruta Norte', status: 'Pendiente', issues: [], lastChecked: 'Nunca'}
    ];
    this.stops.set(initialStops);
  }

  initializeIncidents(): void {
    // Start with a clean slate, or load from a service/storage in a real app.
    this.incidents.set([]);
  }

  startRealtimeSimulation(): void {
    if (this.simulationInterval) return;
    this.simulationInterval = setInterval(() => {
      this.updateBusStatesRandomly();
    }, this.REALTIME_SIMULATION_INTERVAL_MS);
  }

  stopSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  updateBusStatesRandomly(): void {
    this.buses().forEach(bus => {
      bus.stateTimer.update(t => t - 1);

      if (bus.stateTimer() <= 0) {
        switch (bus.status()) {
          case 'detenido':
            bus.status.set('saliendo');
            bus.stateTimer.set(3);
            bus.curbDistanceCm.set(0);
            break;
          case 'saliendo':
            bus.status.set('en-ruta');
            bus.stateTimer.set(Math.floor(Math.random() * 10 + 5));
            break;
          case 'en-ruta':
            bus.status.set('llegando');
            bus.stateTimer.set(4);
            break;
          case 'llegando':
            bus.status.set('detenido');
            bus.stateTimer.set(5);
            const newDistance = 5 + Math.random() * 40;
            bus.curbDistanceCm.set(newDistance);
            this.logProximityEvent(bus);
            break;
        }
      }
    });
  }

  logProximityEvent(bus: Bus): void {
      const distance = bus.curbDistanceCm();
      const { dangerThreshold, cautionThreshold } = this.settingsService.settings();
      let level: EventLevel | null = null;
      
      if (distance > dangerThreshold) level = 'danger';
      else if (distance > cautionThreshold) level = 'caution';

      if (level) {
          const newEvent: BusEvent = {
              timestamp: new Date(),
              level: level,
              message: `Distancia detectada: ${distance.toFixed(0)} cm`,
          };
          bus.eventLog.update(log => {
            const newLog = [newEvent, ...log];
            // Keep the log from growing indefinitely
            return newLog.slice(0, this.MAX_LOG_ENTRIES);
          });
      }
  }
  
  selectBus(bus: Bus): void {
    this.selectedBus.set(bus);
  }

  toggleMenu(): void {
    this.isMenuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  unlockAudio(): void {
    if (this.isAudioUnlocked()) return;

    this.isAudioUnlocked.set(true);
    console.log("User interaction detected. Audio playback now enabled.");

    const soundEnabled = this.settingsService.settings().soundAlertsEnabled;
    if (soundEnabled && this.safetyStatus() === 'danger') {
        this.alertAudio.play().catch(e => console.error("Error playing sound:", e));
    }
  }

  openSettingsModal(): void {
    this.isSettingsModalOpen.set(true);
    this.closeMenu();
  }

  openReportsModal(): void {
    this.isReportsModalOpen.set(true);
    this.closeMenu();
  }

  closeReportsModal(): void {
    this.isReportsModalOpen.set(false);
  }

  openHelpModal(): void {
    this.isHelpModalOpen.set(true);
    this.closeMenu();
  }

  closeHelpModal(): void {
    this.isHelpModalOpen.set(false);
  }
  
  // --- Simulation Workflow ---
  openScenarioSetup(): void {
    this.isScenarioSetupOpen.set(true);
    this.closeMenu();
  }
  
  closeScenarioSetup(): void {
    this.isScenarioSetupOpen.set(false);
  }

  startScenario(scenario: SimulationScenario): void {
    this.stopSimulation(); // Stop random simulation
    this.initializeBuses(); // Reset bus states
    this.initializeIncidents();
    this.simulationUserActions.set([]);
    this.scenarioEventIndex = 0;
    this.simulationTime.set(0);

    this.simulationScenario.set(scenario);
    this.isSimulationRunning.set(true);
    this.closeScenarioSetup();

    this.simulationInterval = setInterval(() => {
      this.runScenarioStep();
    }, this.SCENARIO_SIMULATION_INTERVAL_MS);
  }
  
  runScenarioStep(): void {
    this.simulationTime.update(t => t + 1);
    const scenario = this.simulationScenario();
    if (!scenario) return;

    const upcomingEvent = scenario.events[this.scenarioEventIndex];
    if (upcomingEvent && this.simulationTime() >= upcomingEvent.time) {
      const bus = this.buses().find(b => b.id === upcomingEvent.busId);
      if (bus) {
        if (upcomingEvent.type === 'STATUS_CHANGE' && upcomingEvent.payload.newStatus) {
            bus.status.set(upcomingEvent.payload.newStatus as BusStatus);
        } else if (upcomingEvent.type === 'PROXIMITY_ALERT' && upcomingEvent.payload.distance) {
            bus.curbDistanceCm.set(upcomingEvent.payload.distance);
            bus.status.set('detenido'); // Proximity alerts imply the bus is stopped
            this.logProximityEvent(bus);
        }
      }
      this.scenarioEventIndex++;
    }

    // End simulation if all events are processed
    if (this.scenarioEventIndex >= scenario.events.length) {
      this.stopSimulationAndShowReport();
    }
  }

  async stopSimulationAndShowReport(): Promise<void> {
    this.stopSimulation();
    this.simulationReport.set({
      scenario: this.simulationScenario()!,
      actions: this.simulationUserActions(),
      aiAnalysis: '', // To be filled by Gemini
    });
    this.isSimulationReportOpen.set(true);
    // Restore live data after a short delay
    setTimeout(() => {
        this.isSimulationRunning.set(false);
        this.initializeBuses();
        this.startRealtimeSimulation();
    }, 1000);
  }

  closeSimulationReport(): void {
    this.isSimulationReportOpen.set(false);
    this.simulationReport.set(null);
  }

  captureUserAction(action: Omit<UserAction, 'timestamp'>): void {
    if (!this.isSimulationRunning()) return;
    this.simulationUserActions.update(actions => [
      ...actions,
      { ...action, timestamp: this.simulationTime() }
    ]);
  }

  // --- Incident Management (Updated for Simulation) ---
  openIncidentTracker(): void {
    this.isIncidentTrackerOpen.set(true);
    this.closeMenu();
  }

  closeIncidentTracker(): void {
    this.isIncidentTrackerOpen.set(false);
  }

  openIncidentForm(eventMessage: string, bus: Bus): void {
    this.incidentToCreate.set({ eventMessage, bus });
    this.isIncidentFormOpen.set(true);
    this.captureUserAction({
      type: 'CREATE_INCIDENT_ATTEMPT',
      details: `User opened incident form for event: "${eventMessage}" on bus ${bus.name}.`
    });
  }
  
  openIncidentFormFromAI(event: { message: AssistantMessage, bus: Bus }): void {
    this.incidentToCreate.set({ eventMessage: event.message.message, bus: event.bus });
    this.isIncidentFormOpen.set(true);
     this.captureUserAction({
      type: 'CREATE_INCIDENT_ATTEMPT',
      details: `User opened incident form from AI alert: "${event.message.message}" on bus ${event.bus.name}.`
    });
  }

  openIncidentFormFromDraft(event: { draft: AssistantMessage, bus: Bus }): void {
    this.incidentToCreate.set({ 
      eventMessage: event.draft.message, 
      bus: event.bus,
      title: event.draft.incidentDraft?.title,
      priority: event.draft.incidentDraft?.priority,
    });
    this.isIncidentFormOpen.set(true);
    this.captureUserAction({
      type: 'CREATE_INCIDENT_ATTEMPT',
      details: `User opened incident form from AI draft: "${event.draft.message}" on bus ${event.bus.name}.`
    });
  }

  closeIncidentForm(): void {
    this.isIncidentFormOpen.set(false);
    this.incidentToCreate.set(null);
  }
  
  handleIncidentCreation(incidentData: Omit<Incident, 'id' | 'createdAt' | 'bus'> & {bus: Bus, notes?: string}): void {
    this.captureUserAction({
      type: 'INCIDENT_CREATED',
      details: `Incident "${incidentData.title}" created with priority ${incidentData.priority}.`
    });
    const newIncident: Incident = {
      id: Date.now(),
      createdAt: new Date(),
      status: 'Abierto',
      ...incidentData,
      bus: {
        id: incidentData.bus.id,
        name: incidentData.bus.name,
        driver: incidentData.bus.driver
      }
    };
    this.incidents.update(list => [newIncident, ...list]);
    this.closeIncidentForm();
  }
  
  handleIncidentStatusChange(update: { incidentId: number; newStatus: IncidentStatus }): void {
    this.captureUserAction({
      type: 'INCIDENT_STATUS_CHANGE',
      details: `Status of incident ID ${update.incidentId} changed to ${update.newStatus}.`
    });
    this.incidents.update(list =>
      list.map(inc =>
        inc.id === update.incidentId ? { ...inc, status: update.newStatus } : inc
      )
    );
  }

  handleSettingsSave(newSettings: AppSettings): void {
    this.settingsService.saveSettings(newSettings);
    this.isSettingsModalOpen.set(false);
  }
  
  handleFeedbackInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.feedbackMessage.set(target.value);
  }

  handleFeedbackTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.feedbackType.set(target.value as 'felicitacion' | 'sugerencia' | 'denuncia');
  }

  handleImageSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      this.removeImage();
      return;
    }
    
    if (!file.type.startsWith('image/')) {
        this.analysisError.set('Por favor, selecciona un archivo de imagen válido.');
        return;
    }
    if (file.size > this.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        this.analysisError.set(`La imagen es demasiado grande. El máximo es ${this.MAX_IMAGE_SIZE_MB}MB.`);
        return;
    }

    this.feedbackImageFile.set(file);

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      this.feedbackImagePreviewUrl.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    input.value = '';
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
        this.feedbackMessage.set('');
        this.feedbackType.set('sugerencia');
        this.removeImage();
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

      const result = await this.geminiService.analyzeFeedback(
        this.feedbackMessage(),
        this.feedbackType(),
        imagePayload
      );
      this.analysisResult.set(result);
      
      this.feedbackMessage.set('');
      this.feedbackType.set('sugerencia');
      this.removeImage();

    } catch (error) {
      console.error('Error analyzing feedback:', error);
      this.analysisError.set('No se pudo analizar el comentario. Por favor, inténtalo de nuevo más tarde.');
    } finally {
      this.isSubmittingFeedback.set(false);
    }
  }

  clearAnalysis(): void {
    this.analysisResult.set(null);
    this.analysisError.set(null);
  }
}