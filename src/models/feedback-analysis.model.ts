export type Sentiment = 'Positivo' | 'Negativo' | 'Neutral';
export type Category = 'Conducta del Conductor' | 'Condición del Vehículo' | 'Infraestructura' | 'Seguridad' | 'Sugerencia General' | 'Felicitación';
export type Priority = 'Baja' | 'Media' | 'Alta';

export interface FeedbackAnalysis {
  summary: string;
  sentiment: Sentiment;
  category: Category;
  priority: Priority;
  imageAnalysis: string; // A description of the image, if provided. Empty string otherwise.
}