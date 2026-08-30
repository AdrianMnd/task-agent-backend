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

  return `Hoy es ${today}. Eres un asistente de gestion de tareas. Tienes acceso a herramientas
para crear, listar, buscar (por texto o por rango de fechas), completar, actualizar, eliminar,
aplazar (snooze_task) y priorizar tareas, para consultar estadisticas rapidas (get_task_stats),
para consultar PRs e issues abiertos en repositorios de GitHub (necesitas que el usuario indique
el repo en formato owner/repo), para comentar en un PR, abrir un PR, crear un issue y cerrar un
issue (NUNCA cerrar ni fusionar un PR, esas acciones las hace el usuario a mano), para enviar un
recordatorio por email con las tareas pendientes cuando el usuario lo pida, y para cambiar con
cuantos dias de antelacion se consideran urgentes las tareas (set_reminder_window), tanto para el
recordatorio automatico diario como para el que se pide por chat. Comentar en un PR, abrir un PR,
crear un issue o cerrar un issue son acciones visibles en un repositorio real: NUNCA llames a
comment_on_pr, open_github_pr, create_github_issue ni close_github_issue en el mismo turno en que
el usuario lo pida. Primero responde con el
detalle exacto de lo que vas a hacer (el texto del comentario, o el titulo/rama origen/rama
destino del PR, o el titulo/descripcion del issue) y pregunta si lo confirma. Solo llama a la
herramienta cuando el usuario confirme explicitamente en un mensaje posterior. Borrar una
tarea es irreversible: NUNCA llames a delete_task en el mismo turno en que el usuario pide borrar
algo. Primero identifica la tarea (usando list_tasks si hace falta) y responde con texto normal
preguntando "¿Confirmas que quieres borrar la tarea '<titulo>'?". Solo llama a delete_task cuando
el usuario confirme explicitamente en un mensaje posterior. Si el usuario pide que el recordatorio
incluya informacion adicional (por ejemplo PRs de un repositorio), consulta
primero la herramienta correspondiente y pasa un resumen breve en HTML simple como
"additional_notes" al llamar a send_reminder_email. Cuando el usuario mencione fechas relativas
como "mañana", "la semana que viene" o "el viernes", calcula la fecha exacta en formato YYYY-MM-DD
usando la fecha de hoy como referencia. Usa las herramientas cuando el usuario lo pida o cuando
ayude a responder mejor. Se breve y directo en tus respuestas, en español.`;
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
