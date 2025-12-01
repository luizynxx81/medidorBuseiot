import { Component, signal, OnInit, OnDestroy, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SupabaseService, Measurement } from './services/supabase.service';

export type MeasurementStatus = 'safe' | 'caution' | 'danger';

export interface DisplayMeasurement extends Measurement {
  status: MeasurementStatus;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy {
  private supabaseService = inject(SupabaseService);
  private pollingInterval: any;

  latestMeasurement = signal<DisplayMeasurement | null>(null);
  history = signal<DisplayMeasurement[]>([]);
  error = signal<string | null>(null);

  // --- THRESHOLDS ---
  readonly CAUTION_THRESHOLD_CM = 15;
  readonly DANGER_THRESHOLD_CM = 25;

  statusInfo = computed(() => {
    const measurement = this.latestMeasurement();
    if (!measurement) {
      return { status: '', text: 'Esperando datos...', isDanger: false, isCaution: false, isSafe: false };
    }
    const distance = measurement.datos_sensor.distancia_cm;
    if (distance > this.DANGER_THRESHOLD_CM) {
      return { status: 'danger', text: 'Peligro', isDanger: true, isCaution: false, isSafe: false };
    }
    if (distance > this.CAUTION_THRESHOLD_CM) {
      return { status: 'caution', text: 'Precaución', isDanger: false, isCaution: true, isSafe: false };
    }
    return { status: 'safe', text: 'Distancia Segura', isDanger: false, isCaution: false, isSafe: true };
  });

  ngOnInit(): void {
    this.fetchData(); // Fetch immediately on load
    this.pollingInterval = setInterval(() => this.fetchData(), 500); // Poll every 0.5 seconds
  }

  async fetchData(): Promise<void> {
    try {
      const { latest, history } = await this.supabaseService.getInitialData();
      
      this.latestMeasurement.set(latest ? this.addStatusToMeasurement(latest) : null);
      this.history.set(history.map(this.addStatusToMeasurement.bind(this)));
      
      // Clear any previous error on a successful fetch
      this.error.set(null);

    } catch (err) {
      const typedError = err as { message?: string };
      let errorMessage = 'No se pudo conectar con la base de datos.';
      if (typedError.message) {
        errorMessage = `Error al obtener datos: ${typedError.message}`;
        if (typedError.message.includes('security policies')) {
          errorMessage += '\nSugerencia: Revisa que Row Level Security (RLS) esté habilitado en Supabase y que exista una política que permita la lectura (`SELECT`) para usuarios anónimos.';
        }
      }
      this.error.set(errorMessage);
      console.error(err);
    }
  }

  ngOnDestroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  private addStatusToMeasurement(measurement: Measurement): DisplayMeasurement {
    const distance = measurement.datos_sensor.distancia_cm;
    let status: MeasurementStatus;

    if (distance > this.DANGER_THRESHOLD_CM) {
      status = 'danger';
    } else if (distance > this.CAUTION_THRESHOLD_CM) {
      status = 'caution';
    } else {
      status = 'safe';
    }
    return { ...measurement, status };
  }
}