import { Component, ChangeDetectionStrategy, input, output, signal, OnInit } from '@angular/core';
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
export class IncidentFormModalComponent implements OnInit {
  data = input.required<{ eventMessage: string; bus: Bus, title?: string, priority?: IncidentPriority }>();
  
  close = output<void>();
  save = output<Omit<Incident, 'id' | 'createdAt' | 'status'>>();

  title = signal('');
  priority = signal<IncidentPriority>('Media');
  notes = signal('');

  ngOnInit(): void {
    if (this.data().title) {
      this.title.set(this.data().title!);
    }
    if (this.data().priority) {
      this.priority.set(this.data().priority!);
    }
  }

  onSave(): void {
    if (!this.title().trim()) {
        return; // Basic validation
    }
    const busData = this.data().bus;
    this.save.emit({
      title: this.title(),
      priority: this.priority(),
      bus: {
        id: busData.id,
        name: busData.name,
        driver: busData.driver,
      },
      triggeringEvent: this.data().eventMessage,
      notes: this.notes()
    });
  }

  onClose(): void {
    this.close.emit();
  }
}
