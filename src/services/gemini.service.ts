import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';
import { FeedbackAnalysis } from '../models/feedback-analysis.model';
import { AccessibilityAnalysis } from '../models/accessibility-analysis.model';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // IMPORTANT: This relies on the API key being available as an environment variable.
    // The check for `process.env.API_KEY` was removed because it causes a
    // `ReferenceError` in the browser, where `process` is not defined. The execution
    // environment is expected to substitute `process.env.API_KEY` with a valid key.
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async analyzeStopAccessibility(imageBase64: string): Promise<AccessibilityAnalysis> {
    const schema = {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: 'Un resumen de una frase sobre la condición general de accesibilidad de la parada de autobús.',
        },
        hazards: {
          type: Type.ARRAY,
          description: 'Una lista de los peligros específicos de accesibilidad o seguridad identificados.',
          items: {
            type: Type.OBJECT,
            properties: {
              description: {
                type: Type.STRING,
                description: 'Una descripción clara y concisa del peligro.',
              },
              severity: {
                type: Type.STRING,
                description: 'La gravedad del peligro. Debe ser "Bajo", "Medio", o "Alto".',
              }
            },
            required: ['description', 'severity']
          }
        }
      },
      required: ['summary', 'hazards']
    };

    const prompt = `Eres un experto en accesibilidad urbana y seguridad para un sistema de transporte público. Analiza la siguiente imagen de una parada de autobús e identifica CUALQUIER peligro potencial para la accesibilidad o la seguridad. Concéntrate en problemas para usuarios de sillas de ruedas, personas con discapacidad visual o cualquier pasajero. Los problemas pueden incluir: obstrucciones, superficies irregulares, falta de rampas, mala iluminación, basura, falta de señalización, etc. Proporciona un resumen general y una lista de los peligros específicos encontrados. Responde únicamente en el formato JSON solicitado.`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBase64,
                mimeType: 'image/jpeg'
              }
            }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      const jsonText = response.text.trim();
      const analysisResult = JSON.parse(jsonText);

      if (!analysisResult.summary || typeof analysisResult.hazards === 'undefined') {
        throw new Error('Invalid accessibility analysis result structure from API');
      }

      return analysisResult as AccessibilityAnalysis;

    } catch (error) {
      console.error("Error calling Gemini API for accessibility analysis:", error);
      throw new Error("Failed to analyze stop environment due to an API error.");
    }
  }

  async analyzeFeedback(
    message: string,
    type: string,
    image?: { base64: string, mimeType: string }
  ): Promise<FeedbackAnalysis> {
    const schema = {
      type: Type.OBJECT,
      properties: {
        summary: {
          type: Type.STRING,
          description: 'Un resumen conciso del comentario del usuario en menos de 20 palabras. Si se adjunta una imagen, el resumen debe incorporar lo que se observa en ella.',
        },
        sentiment: {
          type: Type.STRING,
          description: 'El sentimiento general del comentario. Debe ser "Positivo", "Negativo" o "Neutral".',
        },
        category: {
          type: Type.STRING,
          description: 'La categoría principal del comentario. Si se adjunta una imagen, úsala como contexto principal para la categorización (por ej., si se ve un graffiti, podría ser "Condición del Vehículo"). Debe ser una de: "Conducta del Conductor", "Condición del Vehículo", "Infraestructura", "Seguridad", "Sugerencia General", "Felicitación".',
        },
        priority: {
          type: Type.STRING,
          description: 'El nivel de prioridad para revisar este comentario. Debe ser "Baja", "Media" o "Alta". Las denuncias de seguridad deben tener prioridad Alta.',
        },
        imageAnalysis: {
          type: Type.STRING,
          description: 'Si se proporciona una imagen, describe brevemente lo que ves en ella en relación con el comentario en español. Si no hay imagen, deja este campo como una cadena vacía.',
        }
      },
      required: ['summary', 'sentiment', 'category', 'priority', 'imageAnalysis']
    };
    
    const userPrompt = `Analiza el siguiente comentario de un usuario y la imagen adjunta (si existe). El tipo de comentario seleccionado por el usuario fue: "${type}". El comentario es: "${message || '(sin texto)'}"`;
    
    const contents = [];
    contents.push({ text: userPrompt });

    if (image) {
      contents.push({
        inlineData: {
          data: image.base64,
          mimeType: image.mimeType
        }
      });
    }

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: contents },
        config: {
          systemInstruction: "Eres un asistente de IA para un sistema de transporte público. Tu tarea es analizar los comentarios de los usuarios sobre el servicio de autobuses de forma objetiva y estructurada. Si se incluye una imagen, tu análisis debe integrarla. Proporciona la salida únicamente en el formato JSON solicitado.",
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });

      const jsonText = response.text.trim();
      const analysisResult = JSON.parse(jsonText);

      // Basic validation to ensure the result matches the expected structure
      if (
        !analysisResult.summary ||
        !analysisResult.sentiment ||
        !analysisResult.category ||
        !analysisResult.priority ||
        typeof analysisResult.imageAnalysis === 'undefined'
      ) {
        throw new Error('Invalid analysis result structure from API');
      }

      return analysisResult as FeedbackAnalysis;

    } catch (error) {
      console.error("Error calling Gemini API:", error);
      throw new Error("Failed to analyze feedback due to an API error.");
    }
  }
}