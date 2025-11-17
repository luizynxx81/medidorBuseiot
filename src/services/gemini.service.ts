import { Injectable } from '@angular/core';
import { GoogleGenAI, Type, Chat } from '@google/genai';
import { FeedbackAnalysis } from '../models/feedback-analysis.model';
import { AccessibilityAnalysis } from '../models/accessibility-analysis.model';
import { Bus } from '../components/dashboard/dashboard.component';
import { Stop } from '../models/stop.model';
import { AssistantMessage, AssistantMessageType } from '../models/ai-assistant.model';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;
  private chat: Chat | null = null;

  constructor() {
    // Safely access the API key using optional chaining on `globalThis`.
    // This is the most robust way to avoid a `ReferenceError` in browser environments
    // where `process` is not defined.
    const apiKey = (globalThis as any)?.process?.env?.API_KEY || '';

    if (!apiKey) {
      console.error(
        'Could not read Gemini API key from environment. ' +
        'This is expected if the app is running in a browser and the API key was not injected. ' +
        'The app will continue to run, but Gemini features will not work.'
      );
    }
    this.ai = new GoogleGenAI({ apiKey });
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

  async generateDispatchInsight(
    buses: Bus[],
    stops: Stop[],
    previousMessages: AssistantMessage[]
  ): Promise<{ message: string; type: AssistantMessageType; involvedBusId?: number; } | null> {

    // Sanitize data for the prompt to keep it concise
    const fleetState = buses.map(bus => ({
      id: bus.id,
      name: bus.name,
      status: bus.status(),
      curbDistanceCm: bus.curbDistanceCm(),
      // only include recent events to keep prompt small
      eventLog: bus.eventLog().slice(0, 2), 
    }));

    const stopState = stops.filter(s => s.status !== 'Apto').map(s => ({
        name: s.name,
        route: s.route,
        status: s.status,
        issues: s.issues.map(i => i.description)
    }));

    const previousMessageTexts = previousMessages.slice(0, 3).map(m => m.message);

    const schema = {
      type: Type.OBJECT,
      properties: {
        shouldRespond: {
            type: Type.BOOLEAN,
            description: "Establecer en true SÓLO si se encuentra una visión nueva, no repetitiva y significativa. De lo contrario, establecer en false."
        },
        insight: {
          type: Type.OBJECT,
          description: "El objeto de la visión. Proporciónalo sólo si shouldRespond es true.",
          properties: {
            message: {
              type: Type.STRING,
              description: 'El mensaje conciso y accionable para el despachador. Debe estar en español.',
            },
            type: {
              type: Type.STRING,
              description: 'El tipo de mensaje. Debe ser "info", "alert", o "success".',
            },
            involvedBusId: {
              type: Type.INTEGER,
              description: 'Opcional. El ID del autobús principal involucrado en la información.',
            }
          }
        }
      },
      required: ['shouldRespond']
    };

    const systemInstruction = `Eres un experto asistente de despacho de IA para un sistema de transporte público. Tu rol es monitorear datos de la flota en tiempo real y proporcionar UNA SOLA visión concisa y accionable para el despachador humano. Analiza los datos JSON proporcionados, que incluyen el estado actual de todos los buses, sus registros de eventos recientes y la condición de las paradas de autobús problemáticas.

    Tu tarea es identificar la situación MÁS CRÍTICA o interesante en este momento. Esto podría ser:
    - Un autobús con repetidos eventos de 'peligro'.
    - Un autobús que se aproxima a una parada 'No Apta' en su ruta.
    - Un conductor con un historial limpio en esta sesión.
    - Una ruta que está experimentando múltiples problemas.

    REGLAS IMPORTANTES:
    1. NO SEAS REPETITIVO. Revisa la lista de 'previousMessageTexts' y NO generes una idea que ya se haya comunicado.
    2. SÉ RELEVANTE. Si no hay nada nuevo o importante que decir, establece 'shouldRespond' en 'false'. No inventes problemas.
    3. SÉ CONCISO. El mensaje debe ser breve y al grano.
    4. Responde ÚNICAMENTE con un objeto JSON en el esquema solicitado.`;

    const prompt = `Aquí están los datos actuales:
    - Estado de la flota: ${JSON.stringify(fleetState)}
    - Paradas problemáticas: ${JSON.stringify(stopState)}
    - Mensajes anteriores recientes: ${JSON.stringify(previousMessageTexts)}

    Analiza estos datos y proporciona tu conclusión.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });

      const jsonText = response.text.trim();
      const result = JSON.parse(jsonText);
      
      if (result.shouldRespond && result.insight) {
        // Basic validation
        if (result.insight.message && result.insight.type) {
            return result.insight;
        }
      }
      return null; // No new insight found
    } catch (error) {
      console.error('Error calling Gemini API for dispatch insight:', error);
      throw new Error('Failed to generate dispatch insight due to an API error.');
    }
  }

  async generateStopImprovementImage(stopName: string, issues: string[]): Promise<string> {
    const issuesString = issues.join(', ');
    const prompt = `Create a photorealistic, high-quality image of a modern, clean, and accessible public bus stop named "${stopName}". The scene should be bright and welcoming. The bus stop has been renovated to fix the following issues: ${issuesString}. Show the improved state, for example, with clear pathways, proper lighting, no trash, and repaired surfaces.`;

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
        
        const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
        return `data:image/jpeg;base64,${base64ImageBytes}`;
    } catch (error) {
        console.error("Error calling Gemini API for image generation:", error);
        throw new Error("Failed to generate stop improvement image due to an API error.");
    }
  }

  async startChatAndQueryData(
    query: string,
    buses: Bus[],
    stops: Stop[]
  ): Promise<string> {
    if (!this.chat) {
      this.chat = this.ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction:
            "Eres un útil analista de datos para el sistema de monitoreo de autobuses StreetSafe. El usuario te hará preguntas sobre el estado de la flota. Responde a sus preguntas basándote ÚNICAMENTE en los datos JSON proporcionados en el mensaje. Mantén tus respuestas concisas y en español. Si la pregunta no se puede responder con los datos proporcionados, indica que no tienes esa información.",
        },
      });
    }

    const fleetState = buses.map((bus) => ({
      id: bus.id,
      name: bus.name,
      status: bus.status(),
      curbDistanceCm: bus.curbDistanceCm(),
      eventLog: bus.eventLog(),
    }));

    const stopState = stops.map((s) => ({
      name: s.name,
      status: s.status,
      issues: s.issues.map((i) => i.description),
    }));

    const prompt = `
      Pregunta del usuario: "${query}"

      Datos en tiempo real:
      ${JSON.stringify({ buses: fleetState, paradas: stopState })}
    `;

    try {
      const response = await this.chat.sendMessage({ message: prompt });
      return response.text;
    } catch (error) {
      console.error('Error calling Gemini API for chat:', error);
      this.chat = null; // Reset chat on error
      throw new Error('Failed to get chat response due to an API error.');
    }
  }
}
