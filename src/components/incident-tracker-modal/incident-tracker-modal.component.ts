import { Component, ChangeDetectionStrategy, computed, input, output, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Incident, IncidentStatus } from '../../models/incident.model';

type FilterType = 'Todos' | IncidentStatus;

@Component({
  selector: 'app-incident-tracker-modal',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './incident-tracker-modal.component.html',
  styleUrls: ['./incident-tracker-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentTrackerModalComponent {
  incidents = input.required<Incident[]>();
  
  close = output<void>();
  statusChange = output<{ incidentId: number; newStatus: IncidentStatus }>();
  
  activeFilter = signal<FilterType>('Todos');

  filteredIncidents = computed(() => {
    const incidents = this.incidents();
    const filter = this.activeFilter();
    if (filter === 'Todos') {
      return incidents;
    }
    return incidents.filter((inc) => inc.status === filter);
  });

  setFilter(filter: FilterType) {
    this.activeFilter.set(filter);
  }

  onClose(): void {
    this.close.emit();
  }

  changeStatus(incidentId: number, newStatus: IncidentStatus): void {
    this.statusChange.emit({ incidentId, newStatus });
  }
}
