import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Stop } from '../../models/stop.model';

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

  activeFilter = signal<FilterType>('Todos');
  
  filteredStops = computed(() => {
    const stops = this.stops();
    const filter = this.activeFilter();
    
    if (filter === 'Todos') {
      return stops;
    }
    // Handle 'No Apto' which includes 'Pendiente' for review
    if (filter === 'No Apto') {
        return stops.filter(stop => stop.status === 'No Apto' || stop.status === 'Pendiente');
    }
    return stops.filter(stop => stop.status === filter);
  });
  
  setFilter(filter: FilterType) {
    this.activeFilter.set(filter);
  }

  onClose(): void {
    this.close.emit();
  }
}
