import { Component, ChangeDetectionStrategy, input, effect, signal, inject, output } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Bus } from '../dashboard/dashboard.component';
import { Stop } from '../../models/stop.model';
import { GeminiService } from '../../services/gemini.service';
import { AssistantMessage } from '../../models/ai-assistant.model';

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './ai-assistant.component.html',
  styleUrls: ['./ai-assistant.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAssistantComponent {
  buses = input.required<Bus[]>();
  stops = input.required<Stop[]>();
  createIncident = output<{ message: AssistantMessage, bus: Bus }>();

  private geminiService = inject(GeminiService);
  private analysisTimer: any;

  messages = signal<AssistantMessage[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      // Create a dependency on the event logs of all buses
      const eventState = JSON.stringify(this.buses().map(b => b.eventLog()));

      // This is a workaround to prevent the effect from running on initial component load
      let isFirstRun = true;
      onCleanup(() => { isFirstRun = false; });
      if (isFirstRun && this.messages().length === 0) {
        return;
      }
      
      // Debounce the analysis request
      clearTimeout(this.analysisTimer);
      this.analysisTimer = setTimeout(() => {
        this.runAnalysis();
      }, 5000); // Wait 5 seconds after the last event to run analysis

      onCleanup(() => {
        clearTimeout(this.analysisTimer);
      });
    }, { allowSignalWrites: true });
  }

  async runAnalysis(): Promise<void> {
    if (this.isLoading()) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const insight = await this.geminiService.generateDispatchInsight(
        this.buses(),
        this.stops(),
        this.messages()
      );

      if (insight) {
        // Add timestamp to the new message
        const newMessage: AssistantMessage = {
            ...insight,
            timestamp: new Date()
        };
        this.messages.update(msgs => [newMessage, ...msgs].slice(0, 10)); // Keep max 10 messages
      }
    } catch (e) {
      console.error("Error generating dispatch insight:", e);
      // Don't show a persistent error to the user, just log it. The assistant can try again later.
    } finally {
      this.isLoading.set(false);
    }
  }

  escalateToIncident(message: AssistantMessage): void {
    if (!message.involvedBusId) return;
    const bus = this.buses().find(b => b.id === message.involvedBusId);
    if (bus) {
      this.createIncident.emit({ message, bus });
    }
  }
}
