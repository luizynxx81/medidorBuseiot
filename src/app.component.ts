
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DashboardComponent } from './components/dashboard/dashboard.component';

@Component({
  selector: 'app-root',
  template: `<app-dashboard />`,
  imports: [DashboardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
