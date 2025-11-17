import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedbackAnalysis, Sentiment, Category, Priority } from '../../models/feedback-analysis.model';

@Component({
  selector: 'app-feedback-analysis',
  imports: [CommonModule],
  templateUrl: './feedback-analysis.component.html',
  styleUrls: ['./feedback-analysis.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackAnalysisComponent {
  analysis = input.required<FeedbackAnalysis>();
  close = output<void>();

  sentimentInfo = computed(() => {
    const sentiment = this.analysis().sentiment;
    switch (sentiment) {
      case 'Positivo':
        return { color: 'text-green-400', bgColor: 'bg-green-500/20', icon: 'M10 18a8 8 0 100-16 8 8 0 000 16zm-1.25-5.5a1.25 1.25 0 112.5 0 1.25 1.25 0 01-2.5 0zM8.75 8a1.25 1.25 0 112.5 0 1.25 1.25 0 01-2.5 0zm6.5 4.5a.75.75 0 000-1.5H14a.75.75 0 000 1.5h1.25z' };
      case 'Negativo':
        return { color: 'text-red-400', bgColor: 'bg-red-500/20', icon: 'M10 18a8 8 0 100-16 8 8 0 000 16zm-1.25-5.5a1.25 1.25 0 112.5 0 1.25 1.25 0 01-2.5 0zM8.75 8a1.25 1.25 0 112.5 0 1.25 1.25 0 01-2.5 0zm6.5 4.5a.75.75 0 00-1.5 0H14a.75.75 0 000 1.5h1.25a.75.75 0 001.5 0h-1.25z' };
      default: // Neutral
        return { color: 'text-yellow-400', bgColor: 'bg-yellow-500/20', icon: 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.75 8a1.25 1.25 0 112.5 0 1.25 1.25 0 01-2.5 0zm3.75 4.5a1.25 1.25 0 11-2.5 0 1.25 1.25 0 012.5 0z' };
    }
  });

  priorityInfo = computed(() => {
    const priority = this.analysis().priority;
    switch (priority) {
      case 'Alta':
        return { color: 'text-red-300', bgColor: 'bg-red-500/20' };
      case 'Media':
        return { color: 'text-yellow-300', bgColor: 'bg-yellow-500/20' };
      default: // Baja
        return { color: 'text-green-300', bgColor: 'bg-green-500/20' };
    }
  });

  onClose(): void {
    this.close.emit();
  }
}
