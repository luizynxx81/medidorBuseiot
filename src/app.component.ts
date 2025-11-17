
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { SettingsService } from './services/settings.service';
import { ReportsModalComponent } from './components/reports-modal/reports-modal.component';

@Component({
  selector: 'app-root',
  template: `<app-dashboard />`,
  imports: [DashboardComponent, ReportsModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private settingsService = inject(SettingsService);

  constructor() {
    effect(() => {
      const theme = this.settingsService.settings().theme;
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    });
  }
}