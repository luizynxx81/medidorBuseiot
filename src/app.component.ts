import { Component, signal, OnInit, OnDestroy, ChangeDetectionStrategy, inject, computed, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { SupabaseService, Measurement } from './services/supabase.service';
import * as d3 from 'd3';
import { alertSound } from './assets/audio-alert';

export type MeasurementStatus = 'safe' | 'caution' | 'danger';

export interface DisplayMeasurement extends Measurement {
  status: MeasurementStatus;
  relativeTime: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('chart') private chartContainer!: ElementRef;

  private supabaseService = inject(SupabaseService);
  private pollingInterval: any;
  private audioAlert = new Audio(alertSound);
  private isAudioUnlocked = false;

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
    const status = measurement.status;
    if (status === 'danger') {
      return { status: 'danger', text: 'Peligro: Lejos de la Banqueta', isDanger: true, isCaution: false, isSafe: false };
    }
    if (status === 'caution') {
      return { status: 'caution', text: 'Precaución', isDanger: false, isCaution: true, isSafe: false };
    }
    return { status: 'safe', text: 'Distancia Segura', isDanger: false, isCaution: false, isSafe: true };
  });

  ngOnInit(): void {
    this.fetchData();
    this.pollingInterval = setInterval(() => this.fetchData(), 500);
  }

  ngAfterViewInit(): void {
    // The chart can only be drawn after the view is initialized
    if (this.history().length > 0) {
      this.drawChart();
    }
  }

  unlockAudioContext() {
    if (!this.isAudioUnlocked) {
      this.audioAlert.play().catch(() => {});
      this.audioAlert.pause();
      this.audioAlert.currentTime = 0;
      this.isAudioUnlocked = true;
    }
  }

  async fetchData(): Promise<void> {
    try {
      const { latest, history } = await this.supabaseService.getInitialData();
      
      const oldStatus = this.latestMeasurement()?.status;
      const newLatest = latest ? this.addStatusToMeasurement(latest) : null;
      
      if (newLatest && newLatest.status === 'danger' && oldStatus !== 'danger') {
        this.playAudioAlert();
      }

      this.latestMeasurement.set(newLatest);
      this.history.set(history.map(this.addStatusToMeasurement.bind(this)));
      
      this.drawChart();
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
    return { ...measurement, status, relativeTime: this.getRelativeTime(measurement.created_at) };
  }

  private getRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
    if (seconds < 5) return "justo ahora";
    if (seconds < 60) return `hace ${seconds} segundos`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    // For older entries, show the actual time
    return new DatePipe('en-US').transform(date, 'shortTime') || '';
  }

  private playAudioAlert(): void {
    if (this.isAudioUnlocked) {
      this.audioAlert.currentTime = 0;
      this.audioAlert.play().catch(error => console.error("Audio playback failed:", error));
    }
  }

  private drawChart(): void {
    const data = this.history().slice().reverse(); // d3 needs chronological order
    if (!data.length || !this.chartContainer) {
      return;
    }

    const el = this.chartContainer.nativeElement;
    d3.select(el).select('svg').remove();

    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const width = el.clientWidth - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    const svg = d3.select(el).append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => new Date(d.created_at)) as [Date, Date])
      .range([0, width]);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(5).tickSizeOuter(0));

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.datos_sensor.distancia_cm) as number + 10])
      .range([height, 0]);

    svg.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));

    const line = d3.line<DisplayMeasurement>()
      .x(d => x(new Date(d.created_at)))
      .y(d => y(d.datos_sensor.distancia_cm));

    svg.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', '#22d3ee')
      .attr('stroke-width', 2.5)
      .attr('d', line);

    svg.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', d => x(new Date(d.created_at)))
      .attr('cy', d => y(d.datos_sensor.distancia_cm))
      .attr('r', 4)
      .attr('fill', '#22d3ee');
  }
}