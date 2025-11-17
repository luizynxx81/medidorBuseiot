import { Component, ChangeDetectionStrategy, output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService } from '../../services/gemini.service';
import { SimulationScenario } from '../../models/simulation.model';

@Component({
  selector: 'app-scenario-setup-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scenario-setup-modal.component.html',
  styleUrls: ['./scenario-setup-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScenarioSetupModalComponent {
  close = output<void>();
  start = output<SimulationScenario>();

  private geminiService = inject(GeminiService);
  
  isLoading = signal(false);
  error = signal<string | null>(null);
  customPrompt = signal('');

  predefinedScenarios = [
    { name: 'Tráfico Pesado', prompt: 'Simula un escenario de entrenamiento donde el Bus #72B queda atascado en tráfico pesado, causando múltiples paradas y arranques y un evento de proximidad peligroso debido a la congestión.' },
    { name: 'Falla Mecánica Leve', prompt: 'Simula que el Bus #72C experimenta una falla mecánica leve, causando una parada inesperada en una zona no designada. El bus se detiene peligrosamente lejos de la acera.' },
    { name: 'Pasajero Conflictivo', prompt: 'Simula un escenario donde el Bus #72A tiene un retraso, y luego se detiene demasiado lejos de la acera en la parada "Plaza Mayor" debido a una distracción, causando una alerta de peligro.' }
  ];

  onClose(): void {
    this.close.emit();
  }

  async generateScenario(prompt: string): Promise<void> {
    if (!prompt) return;
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const scenario = await this.geminiService.generateSimulationScenario(prompt);
      this.start.emit(scenario);
    } catch (e) {
      console.error(e);
      this.error.set('No se pudo generar el escenario. Por favor, intenta de nuevo.');
    } finally {
      this.isLoading.set(false);
    }
  }
}
