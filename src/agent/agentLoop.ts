import { GoogleGenAI, type Content, type Part, type FunctionDeclaration } from '@google/genai';
import dotenv from 'dotenv';
import { taskToolDefinitions, executeTaskTool } from '../tools/taskTools.js';
import { githubToolDefinitions, executeGithubTool } from '../tools/githubTools.js';
import { emailToolDefinitions, executeEmailTool } from '../tools/emailTools.js';
import { settingsToolDefinitions, executeSettingsTool } from '../tools/settingsTools.js';
import type { ChatMessage } from '../types.js';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// gemini-2.5-flash fue retirado para cuentas nuevas; gemini-3.6-flash es el modelo
// estable recomendado actualmente (ver ai.google.dev/gemini-api/docs/changelog).
// gemini-3.5-flash-lite: el modelo mas rapido y barato del catalogo actual de Google,
// pensado especificamente para tareas de "agentic search" y decidir que herramienta usar
// (justo lo que hace este bucle). gemini-3.6-flash sigue disponible si notas que la calidad
// de las respuestas baja demasiado - basta con cambiar esta constante.
const MODEL = 'gemini-3.5-flash-lite';

const MAX_TOOL_ITERATIONS = 5;

function buildSystemInstruction(): string {
  const today = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `Hoy es ${today}. Eres un asistente de gestion de tareas con herramientas para
    tareas, GitHub y recordatorios. Antes de llamar a delete_task, comment_on_pr, open_github_pr,
    create_github_issue o close_github_issue: describe la accion exacta y espera confirmacion
    explicita del usuario en un mensaje posterior, nunca en el mismo turno en que se pide. Nunca
    cierres ni fusiones un PR. Para fechas relativas ("mañana", "el viernes"), calcula la fecha
    exacta en formato YYYY-MM-DD usando hoy como referencia. Se breve y responde en español.`;
}

// taskTools.ts define los esquemas en JSON Schema "de libro" (type: 'string', 'object'...),
// que es el estandar que usan la mayoria de proveedores (Anthropic, OpenAI). El SDK de Gemini
// espera los mismos campos pero con el "type" en mayusculas (su enum interno Type.STRING,
// Type.OBJECT...). Este adaptador traduce uno a otro sin tocar taskTools.ts: si mañana
// cambias de proveedor otra vez, la logica de negocio de las herramientas no se mueve.
export function toGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const { type, properties, items, ...rest } = schema;
  const converted: any = { ...rest };
  if (type) converted.type = String(type).toUpperCase();
  if (properties) {
    converted.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, toGeminiSchema(value)])
    );
  }
  if (items) converted.items = toGeminiSchema(items);
  return converted;
}

const allToolDefinitions = [
  ...taskToolDefinitions,
  ...githubToolDefinitions,
  ...emailToolDefinitions,
  ...settingsToolDefinitions
];
const githubToolNames = new Set<string>(githubToolDefinitions.map((t) => t.name));
const emailToolNames = new Set<string>(emailToolDefinitions.map((t) => t.name));
const settingsToolNames = new Set<string>(settingsToolDefinitions.map((t) => t.name));

const functionDeclarations = allToolDefinitions.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: toGeminiSchema(tool.input_schema)
})) as unknown as FunctionDeclaration[];

function executeTool(name: string, args: any, userId: number): Promise<unknown> {
  if (githubToolNames.has(name)) return executeGithubTool(name, args);
  if (emailToolNames.has(name)) return executeEmailTool(name, args, userId);
  if (settingsToolNames.has(name)) return executeSettingsTool(name, args, userId);
  return executeTaskTool(name, args, userId);
}

// Bucle del agente (patron ReAct simplificado), version Gemini:
// 1. Se envia la conversacion + las functionDeclarations al modelo.
// 2. Si el modelo devuelve una o mas "functionCall", se ejecutan y se le devuelve
//    el resultado como "functionResponse".
// 3. Se repite hasta que el modelo responda solo con texto (o se alcance el limite).
export async function runAgent(
  history: ChatMessage[],
  userId: number,
  onChunk?: (text: string) => void
): Promise<string> {
  // Gemini usa role 'model' donde Anthropic/OpenAI usan 'assistant'.
  const contents: Content[] = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  let fullText = '';

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents,
      config: {
        systemInstruction: buildSystemInstruction(),
        tools: [{ functionDeclarations }]
      }
    });

    // Acumulamos todas las parts de este turno segun van llegando. El texto se
    // reenvia al momento via onChunk; las functionCall no se streamean por partes,
    // llegan enteras en un unico chunk.
    const turnParts: Part[] = [];

    for await (const chunk of stream) {
      const parts: Part[] = chunk.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        turnParts.push(part);
        if (part.text) {
          fullText += part.text;
          onChunk?.(part.text);
        }
      }
    }

    const functionCallParts = turnParts.filter((p) => p.functionCall);

    if (functionCallParts.length === 0) {
      return fullText;
    }

    // Los modelos Gemini 3.x a veces no generan el thought_signature correctamente
    // para la 2a funcion en adelante cuando piden varias herramientas en el mismo turno
    // (bug conocido del lado de Google, ver ai.google.dev/gemini-api/docs/thought-signatures).
    // Para evitarlo, procesamos una unica herramienta por turno: si el modelo pidio varias,
    // las demas las volvera a pedir en la siguiente vuelta del bucle.
    const callPart = functionCallParts[0];

    if (!callPart.thoughtSignature) {
      callPart.thoughtSignature = 'skip_thought_signature_validator';
    }

    const keptParts = turnParts.filter((p) => !p.functionCall || p === callPart);
    contents.push({ role: 'model', parts: keptParts });

    const call = callPart.functionCall!;
    const result = await executeTool(call.name!, call.args ?? {}, userId);

    contents.push({
      role: 'user',
      parts: [{ functionResponse: { id: call.id, name: call.name, response: { result } } }]
    });
  }

  const fallback = 'No he podido completar la peticion tras varios intentos con herramientas.';
  onChunk?.(fallback);
  return fullText || fallback;
}
