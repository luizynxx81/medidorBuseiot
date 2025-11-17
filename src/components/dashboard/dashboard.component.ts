import { Component, signal, computed, OnInit, OnDestroy, ChangeDetectionStrategy, WritableSignal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService } from '../../services/gemini.service';
import { FeedbackAnalysis } from '../../models/feedback-analysis.model';
import { FeedbackAnalysisComponent } from '../feedback-analysis/feedback-analysis.component';

// --- DATA STRUCTURE FOR A BUS ---
type BusStatus = 'en-ruta' | 'llegando' | 'detenido' | 'saliendo';

interface Bus {
  id: number;
  name: string;
  status: WritableSignal<BusStatus>;
  curbDistanceCm: WritableSignal<number>; // Lateral distance to the curb
  stateTimer: WritableSignal<number>; // Countdown for the current state
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, FeedbackAnalysisComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit, OnDestroy {
  // --- INJECTED SERVICES ---
  private geminiService = inject(GeminiService);

  // --- CONFIGURATION ---
  readonly SIMULATION_INTERVAL_MS = 2000; // Update every 2 seconds
  readonly MAX_IMAGE_SIZE_MB = 4;

  // --- STATE SIGNALS ---
  buses = signal<Bus[]>([]);
  selectedBus = signal<Bus | null>(null);

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
    if (!bus || bus.status() !== 'detenido') {
      return 'none';
    }
    const distance = bus.curbDistanceCm();
    if (distance <= 15) return 'safe';
    if (distance <= 30) return 'caution';
    return 'danger';
  });
  
  safetyVisuals = computed(() => {
    const status = this.safetyStatus();
    switch (status) {
      case 'safe':
        return {
          text: 'text-green-400',
          glow: 'text-glow-green',
          border: 'border-green-400',
          bg: 'bg-green-400',
          lightGlow: 'light-glow-green',
        };
      case 'caution':
        return {
          text: 'text-yellow-400',
          glow: 'text-glow-yellow',
          border: 'border-yellow-400',
          bg: 'bg-yellow-400',
          lightGlow: 'light-glow-yellow',
        };
      case 'danger':
        return {
          text: 'text-red-500',
          glow: 'text-glow-red',
          border: 'border-red-500',
          bg: 'bg-red-500',
          lightGlow: 'light-glow-red',
        };
      default: // 'none'
        return {
          text: 'text-cyan-400',
          glow: '',
          border: 'border-slate-700',
          bg: 'bg-slate-800',
          lightGlow: '',
        };
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

  ngOnInit(): void {
    this.initializeBuses();
    this.startSimulation();
  }

  ngOnDestroy(): void {
    this.stopSimulation();
  }
  
  initializeBuses(): void {
    const initialBuses: Bus[] = [
      { id: 1, name: 'Bus #72A', status: signal('detenido'), curbDistanceCm: signal(12), stateTimer: signal(5) },
      { id: 2, name: 'Bus #72B', status: signal('en-ruta'), curbDistanceCm: signal(0), stateTimer: signal(8) },
      { id: 3, name: 'Bus #72C', status: signal('llegando'), curbDistanceCm: signal(0), stateTimer: signal(3) },
    ];
    this.buses.set(initialBuses);
    this.selectedBus.set(initialBuses[0]);
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
            bus.stateTimer.set(3); // 6 seconds in 'saliendo' state
            bus.curbDistanceCm.set(0); // Clear distance when leaving
            break;
          case 'saliendo':
            bus.status.set('en-ruta');
            bus.stateTimer.set(Math.floor(Math.random() * 10 + 5)); // 10-30 seconds 'en-ruta'
            break;
          case 'en-ruta':
            bus.status.set('llegando');
            bus.stateTimer.set(4); // 8 seconds 'llegando'
            break;
          case 'llegando':
            bus.status.set('detenido');
            bus.stateTimer.set(5); // 10 seconds 'detenido'
            // Generate a new random curb distance upon stopping
            bus.curbDistanceCm.set(5 + Math.random() * 40); // 5cm to 45cm
            break;
        }
      }
    });
  }
  
  selectBus(bus: Bus): void {
    this.selectedBus.set(bus);
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
    
    // Validate file type and size
    if (!file.type.startsWith('image/')) {
        this.analysisError.set('Por favor, selecciona un archivo de imagen válido.');
        return;
    }
    if (file.size > this.MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        this.analysisError.set(`La imagen es demasiado grande. El máximo es ${this.MAX_IMAGE_SIZE_MB}MB.`);
        return;
    }

    this.feedbackImageFile.set(file);

    // Create a preview URL
    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      this.feedbackImagePreviewUrl.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    
    input.value = ''; // Reset input to allow re-selection of the same file
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
      
      // Clear form on success
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
