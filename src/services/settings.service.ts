
import { Injectable, signal, WritableSignal } from '@angular/core';

export interface AppSettings {
  theme: 'light' | 'dark';
  cautionThreshold: number; // in cm
  dangerThreshold: number; // in cm
  soundAlertsEnabled: boolean;
}

const DEFAULTS: AppSettings = {
  theme: 'dark',
  cautionThreshold: 15,
  dangerThreshold: 30,
  soundAlertsEnabled: true,
};

const STORAGE_KEY = 'streetsafe-settings';

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  settings: WritableSignal<AppSettings>;

  constructor() {
    const savedSettings = this.loadSettingsFromStorage();
    this.settings = signal(savedSettings);
  }

  private loadSettingsFromStorage(): AppSettings {
    try {
      const item = window.localStorage.getItem(STORAGE_KEY);
      if (item) {
        const parsed = JSON.parse(item);
        // Basic validation to merge defaults with saved settings
        return { ...DEFAULTS, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load settings from localStorage', e);
    }
    return DEFAULTS;
  }

  saveSettings(newSettings: AppSettings): void {
    try {
      // Ensure danger is always greater than caution
      if (newSettings.dangerThreshold <= newSettings.cautionThreshold) {
        newSettings.dangerThreshold = newSettings.cautionThreshold + 1;
      }
      
      const settingsString = JSON.stringify(newSettings);
      window.localStorage.setItem(STORAGE_KEY, settingsString);
      this.settings.set(newSettings);
    } catch (e) {
      console.error('Failed to save settings to localStorage', e);
    }
  }

  restoreDefaults(): void {
    this.saveSettings(DEFAULTS);
  }
}
