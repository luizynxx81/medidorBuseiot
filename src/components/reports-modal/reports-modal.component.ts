import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Stop } from '../../models/stop.model';
import { GeminiService } from '../../services/gemini.service';

type FilterType = 'Todos' | 'Apto' | 'No Apto';

@Component({
  selector: 'app-reports-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reports-modal.component.html',
  styleUrls: ['./reports-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsModalComponent {
  stops = input.required<Stop[]>();
  close = output<void>();

  private geminiService = inject(GeminiService);

  activeFilter = signal<FilterType>('Todos');

  // State signals for image generation
  isGeneratingImageFor = signal<string | null>(null);
  generatedImage = signal<string | null>(null);
  generationError = signal<string | null>(null);

  filteredStops = computed(() => {
    const stops = this.stops();
    const filter = this.activeFilter();

    if (filter === 'Todos') {
      return stops;
    }
    // Handle 'No Apto' which includes 'Pendiente' for review
    if (filter === 'No Apto') {
      return stops.filter(
        (stop) => stop.status === 'No Apto' || stop.status === 'Pendiente'
      );
    }
    return stops.filter((stop) => stop.status === filter);
  });

  setFilter(filter: FilterType) {
    this.activeFilter.set(filter);
  }

  onClose(): void {
    this.close.emit();
  }

  async visualizeSolution(stop: Stop): Promise<void> {
    this.isGeneratingImageFor.set(stop.id);
    this.generatedImage.set(null);
    this.generationError.set(null);

    try {
      const issuesDescriptions = stop.issues.map((issue) => issue.description);
      const imageUrl = await this.geminiService.generateStopImprovementImage(
        stop.name,
        issuesDescriptions
      );
      this.generatedImage.set(imageUrl);
    } catch (error) {
      console.error('Image generation failed:', error);
      this.generationError.set(
        'No se pudo generar la imagen. La IA podría estar experimentando alta demanda o el contenido solicitado fue bloqueado.'
      );
    } finally {
      this.isGeneratingImageFor.set(null);
    }
  }

  closeImageModal(): void {
    this.generatedImage.set(null);
    this.generationError.set(null);
  }
}