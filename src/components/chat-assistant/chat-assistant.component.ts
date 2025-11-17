import { Component, ChangeDetectionStrategy, input, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Bus } from '../dashboard/dashboard.component';
import { Stop } from '../../models/stop.model';
import { GeminiService } from '../../services/gemini.service';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

@Component({
  selector: 'app-chat-assistant',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-assistant.component.html',
  styleUrls: ['./chat-assistant.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatAssistantComponent {
  buses = input.required<Bus[]>();
  stops = input.required<Stop[]>();

  private geminiService = inject(GeminiService);

  isOpen = signal(false);
  isLoading = signal(false);
  userInput = signal('');
  conversation = signal<ChatMessage[]>([]);

  toggleChat(): void {
    this.isOpen.update(v => !v);
  }
  
  handleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.userInput.set(target.value);
  }

  async sendMessage(): Promise<void> {
    const userMessage = this.userInput().trim();
    if (!userMessage || this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.conversation.update(c => [...c, { role: 'user', text: userMessage }]);
    this.userInput.set('');

    try {
      const modelResponse = await this.geminiService.startChatAndQueryData(
        userMessage,
        this.buses(),
        this.stops()
      );
      this.conversation.update(c => [...c, { role: 'model', text: modelResponse }]);
    } catch (error) {
      console.error('Error getting chat response:', error);
      const errorMessage = {
        role: 'model' as const,
        text: 'Lo siento, no pude procesar tu solicitud en este momento. Por favor, intenta de nuevo.'
      };
      this.conversation.update(c => [...c, errorMessage]);
    } finally {
      this.isLoading.set(false);
    }
  }
}
