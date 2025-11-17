import { Injectable } from '@angular/core';
import { GoogleGenAI, Type, Chat } from '@google/genai';
import { FeedbackAnalysis } from '../models/feedback-analysis.model';
import { AccessibilityAnalysis } from '../models/accessibility-analysis.model';
import { Bus } from '../components/dashboard/dashboard.component';
import { Stop } from '../models/stop.model';
import { AssistantMessage, AssistantMessageType } from '../models/ai-assistant.model';
import { SimulationScenario, UserAction } from '../models/simulation.model';
import { Incident, IncidentPriority } from '../models/incident.model';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;
  private chat: Chat | null = null;

  constructor() {
    const apiKey = (process.env as any).API_KEY || '';

    if (!apiKey) {
      console.error(
        'API_KEY environment variable not set. ' +
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
  ): Promise<AssistantMessage | null> {

    // Sanitize data for the prompt to keep it concise
    const fleetState = buses.map(bus => ({
      id: bus.id,
      name: bus.name,
      route: bus.route,
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
              description: 'El tipo de mensaje. Debe ser "info", "alert", "success", "predictive", o "incident_draft".',
            },
            involvedBusId: {
              type: Type.INTEGER,
              description: 'Opcional. El ID del autobús principal involucrado en la información.',
            },
            incidentDraft: {
                type: Type.OBJECT,
                description: "Obligatorio si el tipo es 'incident_draft'. Contiene los detalles pre-rellenados para el incidente.",
                properties: {
                    title: { type: Type.STRING, description: 'Un título claro y conciso para el incidente. Ej: "Múltiples alertas de peligro para Bus #72A"' },
                    priority: { type: Type.STRING, description: 'La prioridad del incidente. Debe ser "Baja", "Media", o "Alta".' }
                }
            }
          }
        }
      },
      required: ['shouldRespond']
    };

    const systemInstruction = `Eres un experto asistente de despacho de IA para un sistema de transporte público. Tu rol es monitorear datos de la flota en tiempo real y proporcionar UNA SOLA visión concisa y accionable para el despachador humano. Analiza los datos JSON proporcionados.

    Tu tarea principal es identificar la situación MÁS CRÍTICA que justifique la creación de un incidente.
    - **PRIORIDAD ALTA: Borrador de Incidente (tipo: 'incident_draft')**: Si un autobús tiene dos o más eventos de 'peligro' en su registro de eventos reciente, es CRÍTICO. Debes proponer un borrador de incidente. Tu mensaje debe explicar por qué. Debes proporcionar un 'title' y una 'priority' ('Alta' o 'Media') para el borrador.
    - **PRIORIDAD MEDIA: Riesgo Predictivo (tipo: 'predictive')**: Un autobús ('en-ruta' o 'llegando') que se aproxima a una parada 'No Apta' en su misma ruta.
    - **PRIORIDAD BAJA: Otras Observaciones (tipos: 'info', 'success', 'alert')**: Un conductor con un historial limpio, una ruta con múltiples problemas, etc.

    REGLAS IMPORTANTES:
    1. NO SEAS REPETITIVO. Revisa la lista de 'previousMessageTexts' y NO generes una idea que ya se haya comunicado.
    2. SÉ RELEVANTE. Si no hay nada nuevo o importante que decir, establece 'shouldRespond' en 'false'. No inventes problemas.
    3. Responde ÚNICAMENTE con un objeto JSON en el esquema solicitado.`;

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
             const insightResult: AssistantMessage = {
                timestamp: new Date(), // This will be overwritten, but good for typing
                type: result.insight.type,
                message: result.insight.message,
                involvedBusId: result.insight.involvedBusId,
                incidentDraft: result.insight.incidentDraft,
            };
            return insightResult;
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

  async generateSimulationScenario(prompt: string): Promise<SimulationScenario> {
    const schema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Un título breve y descriptivo para el escenario.' },
        description: { type: Type.STRING, description: 'Una descripción de 1-2 frases del escenario para el usuario.' },
        events: {
          type: Type.ARRAY,
          description: 'Una matriz de eventos de simulación que ocurrirán a lo largo del tiempo.',
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.INTEGER, description: 'El tiempo en segundos desde el inicio de la simulación en que ocurre este evento.' },
              busId: { type: Type.INTEGER, description: 'El ID del autobús afectado por el evento.' },
              type: { type: Type.STRING, description: 'El tipo de evento. Debe ser "STATUS_CHANGE" o "PROXIMITY_ALERT".' },
              payload: {
                type: Type.OBJECT,
                properties: {
                  newStatus: { type: Type.STRING, description: 'Para STATUS_CHANGE, el nuevo estado del autobús (en-ruta, llegando, detenido, saliendo).' },
                  distance: { type: Type.NUMBER, description: 'Para PROXIMITY_ALERT, la nueva distancia a la acera en cm.' }
                }
              }
            }
          }
        }
      },
      required: ['title', 'description', 'events']
    };

    const systemInstruction = `Eres un generador de escenarios de entrenamiento para un simulador de despacho de autobuses. Tu tarea es crear un escenario realista y atractivo basado en la indicación del usuario. El escenario debe consistir en una secuencia cronológica de eventos. Genera al menos 5-10 eventos para crear un escenario interesante. Los eventos deben ser lógicos (por ejemplo, un autobús no puede pasar de 'en-ruta' a 'detenido' instantáneamente). Asegúrate de que los eventos de proximidad solo ocurran cuando el estado sea 'detenido'. Responde únicamente en el formato JSON solicitado.`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      const jsonText = response.text.trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Error calling Gemini API for scenario generation:', error);
      throw new Error('Failed to generate simulation scenario due to an API error.');
    }
  }

  async analyzeSimulationPerformance(scenario: SimulationScenario, actions: UserAction[]): Promise<string> {
     const systemInstruction = `Eres un experto entrenador de despachadores de transporte. Tu tarea es analizar el rendimiento de un usuario durante un escenario de simulación. Se te proporcionará el escenario original y una lista cronológica de las acciones que tomó el usuario.

    Tu análisis debe ser:
    1.  **Constructivo:** Concéntrate en el aprendizaje.
    2.  **Específico:** Menciona acciones concretas que fueron buenas y áreas de mejora.
    3.  **Conciso:** Proporciona 2-3 puntos clave en formato de markdown (usando '*' para las viñetas).
    4.  **En español.**

    Evalúa la puntualidad, la idoneidad y la exhaustividad de las acciones del usuario en respuesta a los eventos del escenario. ¿Crearon un incidente para un evento crítico? ¿Utilizaron las herramientas disponibles?`;

    const prompt = `
      **Escenario:**
      Título: ${scenario.title}
      Descripción: ${scenario.description}
      Eventos Clave: ${JSON.stringify(scenario.events.filter(e => e.type === 'PROXIMITY_ALERT'))}

      **Registro de Acciones del Usuario:**
      ${JSON.stringify(actions)}

      Por favor, proporciona tu análisis de rendimiento.`;
      
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { systemInstruction },
      });
      return response.text;
    } catch (error) {
        console.error("Error calling Gemini API for performance analysis:", error);
        throw new Error("Failed to analyze simulation performance due to an API error.");
    }
  }

  async analyzeRouteRisk(
    buses: Bus[],
    stops: Stop[],
    incidents: Incident[]
  ): Promise<Record<string, 'Bajo' | 'Medio' | 'Alto'>> {
    const schema = {
      type: Type.OBJECT,
      properties: {
        routeRisks: {
          type: Type.ARRAY,
          description: "Una lista de los niveles de riesgo para cada ruta.",
          items: {
            type: Type.OBJECT,
            properties: {
              routeName: {
                type: Type.STRING,
                description: "El nombre de la ruta, por ejemplo, 'Ruta Central'."
              },
              riskLevel: {
                type: Type.STRING,
                description: 'El nivel de riesgo. Debe ser "Bajo", "Medio" o "Alto".'
              }
            },
            required: ['routeName', 'riskLevel']
          }
        }
      },
      required: ['routeRisks']
    };

    const systemInstruction = `Eres un analista de riesgos para una red de transporte público. Tu tarea es analizar el estado actual de la flota y asignar un nivel de riesgo a cada ruta.

    Considera los siguientes factores:
    - **Alertas de proximidad:** Múltiples o recientes alertas de 'peligro' en una ruta aumentan el riesgo.
    - **Incidentes abiertos:** Los incidentes activos en una ruta aumentan significativamente el riesgo.
    - **Estado de las paradas:** Las paradas 'No Aptas' en una ruta contribuyen al riesgo.

    Devuelve un objeto JSON con una única clave "routeRisks" que contiene un array de objetos. Cada objeto debe tener "routeName" y "riskLevel" ('Bajo', 'Medio', o 'Alto'). Analiza todas las rutas presentes en los datos de los autobuses.`;

    const fleetState = buses.map(bus => ({
      route: bus.route,
      status: bus.status(),
      recentDangerEvents: bus.eventLog().filter(e => e.level === 'danger').length,
    }));
    const problemStops = stops.filter(s => s.status !== 'Apto').map(s => ({ route: s.route, name: s.name }));
    const openIncidentsByRoute = incidents
      .filter(i => i.status !== 'Resuelto')
      .map(incident => {
        const bus = buses.find(b => b.id === incident.bus.id);
        return {
          route: bus ? bus.route : 'Unknown',
          priority: incident.priority
        };
      })
      .filter(i => i.route !== 'Unknown');

    const prompt = `Analiza los siguientes datos y asigna un nivel de riesgo a cada ruta.
    - Flota: ${JSON.stringify(fleetState)}
    - Paradas con problemas: ${JSON.stringify(problemStops)}
    - Incidentes abiertos: ${JSON.stringify(openIncidentsByRoute)}`;

    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      const jsonText = response.text.trim();
      const result = JSON.parse(jsonText);

      if (!result.routeRisks || !Array.isArray(result.routeRisks)) {
          throw new Error('Invalid route risk analysis result structure from API');
      }

      const riskScores: Record<string, 'Bajo' | 'Medio' | 'Alto'> = {};
      for (const item of result.routeRisks) {
          if (item.routeName && item.riskLevel) {
              riskScores[item.routeName] = item.riskLevel;
          }
      }
      return riskScores;
    } catch (error) {
      console.error('Error calling Gemini API for route risk analysis:', error);
      throw new Error('Failed to analyze route risk due to an API error.');
    }
  }
}