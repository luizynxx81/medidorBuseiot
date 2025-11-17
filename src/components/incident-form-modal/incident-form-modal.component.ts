import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Bus } from '../dashboard/dashboard.component';
import { Incident, IncidentPriority } from '../../models/incident.model';

@Component({
  selector: 'app-incident-form-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './incident-form-modal.component.html',
  styleUrls: ['./incident-form-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentFormModalComponent {
  data = input.required<{ eventMessage: string; bus: Bus }>();
  
  close = output<void>();
  save = output<Omit<Incident, 'id' | 'createdAt' | 'status'>>();

  title = signal('');
  priority = signal<IncidentPriority>('Media');
  notes = signal('');

  onSave(): void {
    if (!this.title().trim()) {
        return; // Basic validation
    }
    this.save.emit({
      title: this.title(),
      priority: this.priority(),
      bus: this.data().bus,
      triggeringEvent: this.data().eventMessage,
      notes: this.notes()
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
