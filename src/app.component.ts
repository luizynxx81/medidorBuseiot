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

const MAX_VISUAL_DISTANCE_CM = 50; // The max distance (e.g., 50cm) that corresponds to the leftmost position in the visualizer.

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

  // D3 Chart properties
  private svg: any;
  private x: any;
  private y: any;
  private xAxis: any;
  private yAxis: any;
  private line: any;
  private chartInitialized = false;

  // --- THRESHOLDS ---
  readonly CAUTION_THRESHOLD_CM = 15;
  readonly DANGER_THRESHOLD_CM = 25;

  // --- STATISTICS ---
  maxDistanceToday = computed(() => {
    const today = new Date();
    const todayHistory = this.history().filter(m => {
      const measurementDate = new Date(m.created_at);
      return measurementDate.getDate() === today.getDate() &&
             measurementDate.getMonth() === today.getMonth() &&
             measurementDate.getFullYear() === today.getFullYear();
    });

    if (todayHistory.length === 0) {
      return 0;
    }

    return Math.max(...todayHistory.map(m => m.datos_sensor.distancia_cm));
  });

  dangerAlertsToday = computed(() => {
    const today = new Date();
    return this.history().filter(m => {
      const measurementDate = new Date(m.created_at);
      return m.status === 'danger' &&
             measurementDate.getDate() === today.getDate() &&
             measurementDate.getMonth() === today.getMonth() &&
             measurementDate.getFullYear() === today.getFullYear();
    }).length;
  });

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
    this.initChart();
    // Call update in case data arrived before the view was initialized
    if (this.history().length > 0) {
      this.updateChart();
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
      
      this.updateChart();
      this.error.set(null);

    } catch (err: unknown) {
      let errorMessage = 'Ocurrió un error inesperado.';
  
      if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
        const typedError = err as { message: string };
        errorMessage = typedError.message;
        
        if (errorMessage.includes('security policies') || errorMessage.includes('permission denied')) {
          this.error.set(
            `Error de Permiso: ${errorMessage}\n\n` +
            `Sugerencia: Parece un problema de Row Level Security (RLS). ` +
            `Asegúrate de que la tabla 'mediciones_distancia' tenga una política que permita la lectura ('SELECT') para el rol 'anon'.`
          );
        } else {
          this.error.set(`Error al obtener datos: ${errorMessage}`);
        }
      } else {
        try {
          errorMessage = JSON.stringify(err, null, 2);
        } catch {
          errorMessage = 'No se pudo procesar el objeto de error. Revisa la consola.';
        }
        this.error.set(`Error inesperado:\n${errorMessage}`);
      }

      console.error('Error completo:', err);
    }
  }

  ngOnDestroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }
  
  calculateBusPosition(distanceCm: number): number {
    // This function maps a distance in cm to a percentage for the 'left' CSS property.
    // 0cm distance -> bus is close to the curb (right side). Let's say 80% left.
    // MAX_VISUAL_DISTANCE_CM distance -> bus is far from the curb (left side). Let's say 0% left.
    const clampedDistance = Math.min(distanceCm, MAX_VISUAL_DISTANCE_CM);
    const percentage = 1 - (clampedDistance / MAX_VISUAL_DISTANCE_CM);
    // The bus visual area is between 0% and 80% (leaving space for the curb)
    return percentage * 80;
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
  
  private initChart(): void {
    if (!this.chartContainer) return;

    const el = this.chartContainer.nativeElement;
    const margin = { top: 20, right: 20, bottom: 30, left: 40 };
    const width = el.clientWidth - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    this.svg = d3.select(el).append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    this.x = d3.scaleTime().range([0, width]);
    this.y = d3.scaleLinear().range([height, 0]);

    this.xAxis = this.svg.append('g')
      .attr('transform', `translate(0,${height})`);

    this.yAxis = this.svg.append('g');

    this.line = d3.line<DisplayMeasurement>()
      .x(d => this.x(new Date(d.created_at)))
      .y(d => this.y(d.datos_sensor.distancia_cm));
      
    this.svg.append('path')
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', '#22d3ee')
      .attr('stroke-width', 2.5);
      
    // Create tooltip once
    d3.select(el).select('.chart-tooltip').remove();
    d3.select(el).append('div').attr('class', 'chart-tooltip');
    
    this.chartInitialized = true;
  }

  private updateChart(): void {
    if (!this.chartInitialized || !this.history().length || !this.chartContainer) {
      return;
    }

    const data = this.history().slice().reverse(); // d3 needs chronological order
    const el = this.chartContainer.nativeElement;
    const tooltip = d3.select(el).select('.chart-tooltip');

    // Update domains
    this.x.domain(d3.extent(data, d => new Date(d.created_at)) as [Date, Date]);
    this.y.domain([0, d3.max(data, d => d.datos_sensor.distancia_cm) as number + 10]);

    // Update axes
    this.xAxis.transition().duration(250).call(d3.axisBottom(this.x).ticks(5).tickSizeOuter(0));
    this.yAxis.transition().duration(250).call(d3.axisLeft(this.y).ticks(5).tickSizeOuter(0));

    // Update line path
    this.svg.select('.line')
      .datum(data)
      .transition()
      .duration(250)
      .attr('d', this.line);

    // Data join for circles
    const circles = this.svg.selectAll('circle')
      .data(data, (d: any) => d.id);

    // EXIT: Remove old elements
    circles.exit().remove();

    // ENTER: Create new elements
    circles.enter()
      .append('circle')
      .attr('r', 5)
      .attr('fill', '#22d3ee')
      .attr('stroke', '#1e293b')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', (event: any, d: any) => {
        tooltip.style('opacity', 1);
      })
      .on('mousemove', (event: any, d: any) => {
        const time = new DatePipe('en-US').transform(d.created_at, 'mediumTime');
        tooltip.html(`<strong>${d.datos_sensor.distancia_cm} cm</strong><br>${time}`)
          .style('left', `${event.pageX + 15}px`)
          .style('top', `${event.pageY - 28}px`);
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      })
      // MERGE: Apply updates to both new and existing elements
      .merge(circles)
      .transition()
      .duration(250)
      .attr('cx', (d: any) => this.x(new Date(d.created_at)))
      .attr('cy', (d: any) => this.y(d.datos_sensor.distancia_cm));
  }
}