# Task Agent - Backend

Backend del agente de tareas conversacional. Fase 1: nucleo del agente + CRUD de tareas.

## Stack
- Node.js + TypeScript + Express
- Neon Postgres (via `pg`)
- Google Gemini SDK (`@google/genai`, modelo `gemini-3.6-flash`) para el bucle del agente
  con function calling. Elegido porque tiene tier gratuito y porque reutiliza credito
  existente de otro proyecto (BoardGame Tutor) sin coste adicional.
  Cambiar de proveedor es sencillo: `taskTools.ts` no depende de ningun SDK concreto,
  solo `agentLoop.ts` sabe hablar con Gemini (incluye un pequeño adaptador de esquema,
  `toGeminiSchema`, porque Gemini espera los tipos en mayusculas).

  Nota: Google renueva su catalogo de modelos con frecuencia. Si en el futuro `gemini-3.6-flash`
  deja de estar disponible, el error de la API suele indicar directamente el modelo de
  reemplazo recomendado.

  Nota 2: el bucle procesa una unica llamada a herramienta por turno del modelo (aunque pida
  varias a la vez), por una inconsistencia conocida de Gemini 3.x generando el `thought_signature`
  en llamadas paralelas. Si el modelo pide varias herramientas seguidas, las ejecuta una a una
  en iteraciones sucesivas del bucle en vez de en paralelo.

  Nota 3: si aun asi el modelo no genera el `thought_signature` (pasa con cierta frecuencia,
  es un fallo conocido del lado de Google), se rellena con el valor "comodin" oficial
  `skip_thought_signature_validator` para que la API no rechace la peticion.

  Nota 4: el paquete `@google/genai` cambia de version con mucha frecuencia y las versiones
  antiguas (0.x) no soportan bien `thoughtSignature`. Si `npm install` te deja una version
  muy anterior a la que indica `package.json`, ejecuta `npm update @google/genai` o borra
  `package-lock.json` y reinstala.

## Como se organiza el codigo

```
src/
  index.ts          -> entrypoint, monta express
  db.ts             -> pool de conexion a Postgres
  types.ts          -> tipos compartidos (Task, ChatMessage)
  agent/
    agentLoop.ts    -> el bucle del agente (ReAct simplificado)
  tools/
    taskTools.ts    -> herramientas de tareas (create/list/complete/prioritize) - FUNCIONAL
    githubTools.ts  -> herramientas de GitHub - STUB, fase 2
  routes/
    chat.ts         -> POST /api/chat
  migrations/
    001_init.sql    -> tabla tasks
    run.ts          -> script para aplicar la migracion
```

## Como funciona el bucle del agente (lo importante para aprender)

1. Se manda la conversacion + las definiciones de herramientas (`taskToolDefinitions`) al modelo.
2. Si el modelo responde con un bloque `tool_use`, se ejecuta la funcion real (`executeTaskTool`)
   contra Postgres y se le devuelve el resultado como `tool_result`.
3. El modelo puede volver a pedir otra herramienta o ya responder con texto final.
4. Esto se repite hasta `MAX_TOOL_ITERATIONS` (5) como limite de seguridad.

Todo esto vive en `src/agent/agentLoop.ts`.

## Puesta en marcha

1. `npm install`
2. Copia `.env.example` a `.env` y rellena:
   - `DATABASE_URL` (tu conexion de Neon)
   - `GEMINI_API_KEY` (de Google AI Studio - aistudio.google.com/apikey)
3. `npm run migrate` (crea la tabla `tasks`)
4. `npm run dev` (arranca en `http://localhost:3001`)

## Siguientes fases (no implementadas aun)
- **Fase 2 - GitHub**: completar `githubTools.ts` con llamadas reales a `api.github.com`
  y añadir `githubToolDefinitions` al array de `tools` en `agentLoop.ts`.
- **Fase 3 - Resend**: nueva herramienta `send_reminder` que use Resend para avisar
  de tareas con `due_date` proxima.
