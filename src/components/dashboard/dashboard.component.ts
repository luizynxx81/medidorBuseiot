
import { Component, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, WritableSignal, inject, effect } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { GeminiService } from '../../services/gemini.service';
import { FeedbackAnalysis } from '../../models/feedback-analysis.model';
import { FeedbackAnalysisComponent } from '../feedback-analysis/feedback-analysis.component';
import { AccessibilityAnalyzerComponent } from '../accessibility-analyzer/accessibility-analyzer.component';
import { SettingsModalComponent } from '../settings-modal/settings-modal.component';
import { SettingsService, AppSettings } from '../../services/settings.service';
import { alertSound } from '../../assets/audio-alert';

// --- DATA STRUCTURES ---
type BusStatus = 'en-ruta' | 'llegando' | 'detenido' | 'saliendo';
type EventLevel = 'caution' | 'danger';

interface BusEvent {
  timestamp: Date;
  level: EventLevel;
  message: string;
}

interface Bus {
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
  imports: [CommonModule, DatePipe, FeedbackAnalysisComponent, AccessibilityAnalyzerComponent, SettingsModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  // --- INJECTED SERVICES ---
  private geminiService = inject(GeminiService);
  settingsService = inject(SettingsService);

  // --- CONFIGURATION ---
  readonly SIMULATION_INTERVAL_MS = 2000;
  readonly MAX_IMAGE_SIZE_MB = 4;
  readonly MAX_LOG_ENTRIES = 5;

  // --- STATE SIGNALS ---
  buses = signal<Bus[]>([]);
  selectedBus = signal<Bus | null>(null);
  isMenuOpen = signal(false);
  isSettingsModalOpen = signal(false);
  private alertAudio: HTMLAudioElement;

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

  private simulationInterval: any;
  
  constructor() {
    this.alertAudio = new Audio(alertSound);
    // Effect to play sound on new 'danger' status
    effect((onCleanup) => {
        const status = this.safetyStatus();
        const soundEnabled = this.settingsService.settings().soundAlertsEnabled;

        let previousStatus: 'safe' | 'caution' | 'danger' | 'none' | undefined;
        onCleanup(() => previousStatus = status);
        
        if (soundEnabled && status === 'danger' && previousStatus !== 'danger') {
            this.alertAudio.play().catch(e => console.error("Error playing sound:", e));
        }
    }, { allowSignalWrites: false });
  }

  ngOnInit(): void {
    this.initializeBuses();
    this.startSimulation();
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

  startSimulation(): void {
    if (this.simulationInterval) return;
    this.simulationInterval = setInterval(() => {
      this.updateBusStates();
    }, this.SIMULATION_INTERVAL_MS);
  }

  stopSimulation(): void {
    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }
  }

  updateBusStates(): void {
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

  openSettingsModal(): void {
    this.isSettingsModalOpen.set(true);
    this.closeMenu();
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
