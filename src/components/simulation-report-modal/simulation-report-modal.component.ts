import { Component, ChangeDetectionStrategy, output, input, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SimulationReport, UserActionType } from '../../models/simulation.model';
import { GeminiService } from '../../services/gemini.service';

@Component({
  selector: 'app-simulation-report-modal',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './simulation-report-modal.component.html',
  styleUrls: ['./simulation-report-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimulationReportModalComponent implements OnInit {
  report = input.required<SimulationReport>();
  close = output<void>();

  private geminiService = inject(GeminiService);

  isLoadingAnalysis = signal(true);
  aiAnalysisResult = signal('');
  
  ngOnInit(): void {
    this.generateAnalysis();
  }

  async generateAnalysis(): Promise<void> {
    this.isLoadingAnalysis.set(true);
    try {
        const analysis = await this.geminiService.analyzeSimulationPerformance(
            this.report().scenario,
            this.report().actions
        );
        this.aiAnalysisResult.set(analysis);
    } catch (e) {
        this.aiAnalysisResult.set('No se pudo generar el análisis de IA. Por favor, intente de nuevo.');
    } finally {
        this.isLoadingAnalysis.set(false);
    }
  }

  onClose(): void {
    this.close.emit();
  }

  formatActionType(type: UserActionType): string {
    return type.replace(/_/g, ' ');
  }
}
