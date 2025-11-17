import { Component, ChangeDetectionStrategy, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-simulation-control',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './simulation-control.component.html',
  styleUrls: ['./simulation-control.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimulationControlComponent {
  endSimulation = output<void>();
}
