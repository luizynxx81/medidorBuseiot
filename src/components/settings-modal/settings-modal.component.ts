
import { Component, ChangeDetectionStrategy, input, output, signal, WritableSignal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppSettings, SettingsService } from '../../services/settings.service';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings-modal.component.html',
  styleUrls: ['./settings-modal.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsModalComponent implements OnInit {
  currentSettings = input.required<AppSettings>();
  
  close = output<void>();
  save = output<AppSettings>();

  // Local state for the form, initialized from input
  settingsForm: WritableSignal<AppSettings>;

  constructor() {
    // Initialize with default values. ngOnInit will populate it correctly.
    this.settingsForm = signal({
      theme: 'dark',
      cautionThreshold: 15,
      dangerThreshold: 30,
      soundAlertsEnabled: true,
    });
  }

  ngOnInit(): void {
    // Clone the input settings to avoid direct mutation
    this.settingsForm.set({ ...this.currentSettings() });
  }

  onSave(): void {
    this.save.emit(this.settingsForm());
  }

  onClose(): void {
    this.close.emit();
  }

  onRestoreDefaults(): void {
    const defaults: AppSettings = {
        theme: 'dark',
        cautionThreshold: 15,
        dangerThreshold: 30,
        soundAlertsEnabled: true
    };
    this.settingsForm.set(defaults);
    this.save.emit(defaults);
  }

  updateTheme(theme: 'light' | 'dark'): void {
    this.settingsForm.update(s => ({ ...s, theme }));
  }

  updateCautionThreshold(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
    this.settingsForm.update(s => {
      // Ensure caution is always less than danger
      const newDanger = Math.max(value + 1, s.dangerThreshold);
      return { ...s, cautionThreshold: value, dangerThreshold: newDanger };
    });
  }

  updateDangerThreshold(event: Event): void {
    const value = parseInt((event.target as HTMLInputElement).value, 10);
     this.settingsForm.update(s => {
      // Ensure danger is always greater than caution
      const newCaution = Math.min(value - 1, s.cautionThreshold);
      return { ...s, dangerThreshold: value, cautionThreshold: newCaution };
    });
  }

  toggleSoundAlerts(): void {
    this.settingsForm.update(s => ({ ...s, soundAlertsEnabled: !s.soundAlertsEnabled }));
  }
}
