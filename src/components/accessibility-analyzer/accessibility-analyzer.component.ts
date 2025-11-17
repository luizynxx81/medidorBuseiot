import { Component, ChangeDetectionStrategy, signal, inject, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService } from '../../services/gemini.service';
import { AccessibilityAnalysis } from '../../models/accessibility-analysis.model';

type ViewMode = 'idle' | 'camera' | 'loading' | 'results' | 'error';

@Component({
  selector: 'app-accessibility-analyzer',
  imports: [CommonModule],
  templateUrl: './accessibility-analyzer.component.html',
  styleUrls: ['./accessibility-analyzer.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccessibilityAnalyzerComponent implements OnDestroy {
  @ViewChild('videoPlayer') videoPlayer: ElementRef<HTMLVideoElement> | undefined;
  @ViewChild('canvas') canvas: ElementRef<HTMLCanvasElement> | undefined;

  private geminiService = inject(GeminiService);
  private videoStream: MediaStream | null = null;
  
  viewMode = signal<ViewMode>('idle');
  analysisResult = signal<AccessibilityAnalysis | null>(null);
  error = signal<string | null>(null);

  ngOnDestroy(): void {
    this.stopCamera();
  }

  async startCamera(): Promise<void> {
    try {
      if (this.videoStream) {
        this.stopCamera();
      }
      this.videoStream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      if (this.videoPlayer) {
        this.videoPlayer.nativeElement.srcObject = this.videoStream;
        this.viewMode.set('camera');
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      this.error.set('No se pudo acceder a la cámara. Asegúrate de tener los permisos habilitados.');
      this.viewMode.set('error');
    }
  }

  stopCamera(): void {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
  }

  async captureAndAnalyze(): Promise<void> {
    if (!this.videoPlayer || !this.canvas) return;

    this.viewMode.set('loading');
    
    const video = this.videoPlayer.nativeElement;
    const canvasEl = this.canvas.nativeElement;
    
    // Match canvas size to video's intrinsic size for best quality
    canvasEl.width = video.videoWidth;
    canvasEl.height = video.videoHeight;
    
    const context = canvasEl.getContext('2d');
    if (!context) {
        this.error.set('Could not get canvas context.');
        this.viewMode.set('error');
        return;
    }

    context.drawImage(video, 0, 0, canvasEl.width, canvasEl.height);
    this.stopCamera(); // Stop camera after capture to save battery

    const imageBase64 = canvasEl.toDataURL('image/jpeg', 0.8).split(',')[1];

    try {
      const result = await this.geminiService.analyzeStopAccessibility(imageBase64);
      this.analysisResult.set(result);
      this.viewMode.set('results');
    } catch (err) {
      console.error('Error analyzing stop accessibility:', err);
      this.error.set('No se pudo analizar la imagen. Por favor, inténtalo de nuevo.');
      this.viewMode.set('error');
    }
  }

  reset(): void {
    this.stopCamera();
    this.viewMode.set('idle');
    this.analysisResult.set(null);
    this.error.set(null);
  }
}
