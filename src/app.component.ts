import { Component, signal, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService, Measurement } from './services/supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private supabaseService = inject(SupabaseService);

  latestMeasurement = signal<Measurement | null>(null);
  history = signal<Measurement[]>([]);
  error = signal<string | null>(null);

  private channel: RealtimeChannel | undefined;
  readonly DANGER_THRESHOLD_CM = 30;

  async ngOnInit(): Promise<void> {
    try {
      const { latest, history } = await this.supabaseService.getInitialData();
      this.latestMeasurement.set(latest);
      this.history.set(history);

      this.channel = this.supabaseService.listenToChanges((newMeasurement) => {
        this.latestMeasurement.set(newMeasurement);
        this.history.update(currentHistory => 
            [newMeasurement, ...currentHistory].slice(0, 10)
        );
      });

    } catch (err) {
      this.error.set('No se pudo conectar con la base de datos. Verifique las credenciales y la conexión.');
      console.error(err);
    }
  }

  ngOnDestroy(): void {
    if (this.channel) {
      this.supabaseService.removeChannel(this.channel);
    }
  }
}
