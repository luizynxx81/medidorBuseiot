import { Injectable } from '@angular/core';
import { GoogleGenAI, Type, Chat } from '@google/genai';
import { FeedbackAnalysis } from '../models/feedback-analysis.model';
import { AccessibilityAnalysis } from '../models/accessibility-analysis.model';
import { Bus } from '../components/dashboard/dashboard.component';
import { Stop } from '../models/stop.model';
import { AssistantMessage } from '../models/ai-assistant.model';
import { SimulationScenario, UserAction } from '../models/simulation.model';
import { marked } from 'marked';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI | null = null;
  private chat: Chat | null = null;

  constructor() {
    const apiKey = (typeof process !== 'undefined' && process.env && process.env.API_KEY) ? process.env.API_KEY : undefined;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    } else {
      console.error(
        'API_KEY environment variable not set. ' +
        'The app will continue to run, but Gemini features will not work.'
      );
    }
  }

  private getNotConfiguredError(): Promise<any> {
    return Promise.reject(new Error("Gemini Service is not configured. API_KEY is missing."));
  }
  
  // --- EXISTING METHODS (Feedback & Accessibility) ---

  async analyzeStopAccessibility(imageBase64: string): Promise<AccessibilityAnalysis> {
    if (!this.ai) return this.getNotConfiguredError();
    const schema = {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: 'Un resumen de una frase sobre la condición general de accesibilidad de la parada de autobús.' },
        hazards: {
          type: Type.ARRAY,
          description: 'Una lista de los peligros específicos de accesibilidad o seguridad identificados.',
          items: {
            type: Type.OBJECT,
            properties: {
              description: { type: Type.STRING, description: 'Una descripción clara y concisa del peligro.' },
              severity: { type: Type.STRING, description: 'La gravedad del peligro. Debe ser "Bajo", "Medio", o "Alto".' }
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
        contents: { parts: [{ text: prompt }, { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } }] },
        config: { responseMimeType: "application/json", responseSchema: schema },
      });
      const jsonText = response.text.trim();
      return JSON.parse(jsonText) as AccessibilityAnalysis;
    } catch (error) {
      console.error("Error calling Gemini API for accessibility analysis:", error);
      throw new Error("Failed to analyze stop environment due to an API error.");
    }
  }

  async analyzeFeedback(message: string, type: string, image?: { base64: string, mimeType: string }): Promise<FeedbackAnalysis> {
    if (!this.ai) return this.getNotConfiguredError();
    const schema = {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING, description: 'Un resumen conciso del comentario del usuario en menos de 20 palabras. Si se adjunta una imagen, el resumen debe incorporar lo que se observa en ella.' },
        sentiment: { type: Type.STRING, description: 'El sentimiento general del comentario. Debe ser "Positivo", "Negativo" o "Neutral".' },
        category: { type: Type.STRING, description: 'La categoría principal del comentario. Debe ser una de: "Conducta del Conductor", "Condición del Vehículo", "Infraestructura", "Seguridad", "Sugerencia General", "Felicitación".' },
        priority: { type: Type.STRING, description: 'El nivel de prioridad para revisar este comentario. Debe ser "Baja", "Media" o "Alta". Las denuncias de seguridad deben tener prioridad Alta.' },
        imageAnalysis: { type: Type.STRING, description: 'Si se proporciona una imagen, describe brevemente lo que ves en ella. Si no hay imagen, deja este campo como una cadena vacía.' }
      },
      required: ['summary', 'sentiment', 'category', 'priority', 'imageAnalysis']
    };
    const userPrompt = `Analiza el siguiente comentario de un usuario y la imagen adjunta (si existe). El tipo de comentario seleccionado por el usuario fue: "${type}". El comentario es: "${message || '(sin texto)'}"`;
    // FIX: Explicitly type the `contents` array to allow both text and inlineData parts, resolving a TypeScript type inference error.
    const contents: ({ text: string } | { inlineData: { data: string, mimeType: string } })[] = [{ text: userPrompt }];
    if (image) {
      contents.push({ inlineData: { data: image.base64, mimeType: image.mimeType } });
    }
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: { parts: contents },
        config: {
          systemInstruction: "Eres un asistente de IA para un sistema de transporte público. Tu tarea es analizar los comentarios de los usuarios de forma objetiva y estructurada. Proporciona la salida únicamente en el formato JSON solicitado.",
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      const jsonText = response.text.trim();
      return JSON.parse(jsonText) as FeedbackAnalysis;
    } catch (error) {
      console.error("Error calling Gemini API for feedback analysis:", error);
      throw new Error("Failed to analyze feedback due to an API error.");
    }
  }

  // --- NEWLY RESTORED METHODS ---

  async generateDispatchInsight(buses: Bus[], stops: Stop[], history: AssistantMessage[]): Promise<AssistantMessage | null> {
    if (!this.ai) return this.getNotConfiguredError();
    // Simplified logic for now
    return null; 
  }

  async generateStopImprovementImage(stopName: string, issues: string[]): Promise<string> {
    if (!this.ai) return this.getNotConfiguredError();
    const prompt = `Fotografía fotorrealista de una parada de autobús moderna, accesible y segura llamada "${stopName}". La parada ha sido rediseñada para solucionar estos problemas: ${issues.join(', ')}. Debe incluir una rampa de acceso clara, buena iluminación, señalización braille, un banco y sin obstrucciones.`;
     try {
        const response = await this.ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '16:9',
            },
        });
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (error) {
        console.error("Error generating image with Gemini:", error);
        throw new Error("Image generation failed.");
    }
  }
  
  async startChatAndQueryData(query: string, buses: Bus[], stops: Stop[]): Promise<string> {
    if (!this.ai) return this.getNotConfiguredError();
     const systemInstruction = `Eres un asistente de datos para un sistema de monitoreo de autobuses. Tienes acceso a los siguientes datos en tiempo real. Responde a las preguntas del usuario de forma concisa basándote únicamente en esta información. No inventes datos.

    Datos de Autobuses:
    ${JSON.stringify(buses.map(b => ({ id: b.id, nombre: b.name, ruta: b.route, estado: b.status(), distanciaBanqueta: b.curbDistanceCm() })))}

    Datos de Paraderos:
    ${JSON.stringify(stops.map(s => ({ id: s.id, nombre: s.name, ruta: s.route, estado: s.status, incidencias: s.issues.length })))}
    `;

    if (!this.chat) {
        this.chat = this.ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { systemInstruction },
        });
    }

    try {
        const response = await this.chat.sendMessage({ message: query });
        return response.text;
    } catch (error) {
        console.error("Error in chat query:", error);
        this.chat = null; // Reset chat on error
        throw new Error("Failed to get chat response.");
    }
  }
  
  async generateSimulationScenario(prompt: string): Promise<SimulationScenario> {
    if (!this.ai) return this.getNotConfiguredError();
    // Simplified schema for demonstration
    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        events: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.INTEGER },
              busId: { type: Type.INTEGER },
              type: { type: Type.STRING },
              payload: {
                type: Type.OBJECT,
                properties: {
                  distance: { type: Type.INTEGER }
                }
              }
            }
          }
        }
      }
    };

    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Crea un escenario de simulación basado en: "${prompt}". Los IDs de bus válidos son 72, 128.`,
            config: {
                responseMimeType: 'application/json',
                responseSchema: schema
            }
        });
        return JSON.parse(response.text) as SimulationScenario;
    } catch (error) {
        console.error("Error generating simulation scenario:", error);
        throw new Error("Failed to generate scenario.");
    }
  }

  async analyzeSimulationPerformance(scenario: SimulationScenario, actions: UserAction[]): Promise<string> {
    if (!this.ai) return this.getNotConfiguredError();
    const prompt = `
      Eres un evaluador de rendimiento para operadores de sistemas de transporte.
      Analiza las acciones del usuario durante la siguiente simulación y proporciona una retroalimentación constructiva.
      Escenario: ${scenario.title} - ${scenario.description}
      Acciones del Usuario:
      ${actions.map(a => `- a los ${a.timestamp}s: ${a.type} - ${a.details}`).join('\n')}
      
      Evalúa la rapidez, precisión y decisiones tomadas. Ofrece sugerencias de mejora. Formatea la respuesta en Markdown.
    `;
    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });
        const markdownText = response.text;
        return marked.parse(markdownText) as string;
    } catch (error) {
        console.error("Error analyzing simulation:", error);
        throw new Error("Failed to analyze performance.");
    }
  }
}
