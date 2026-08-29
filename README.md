# Task Agent — Backend

Backend de un agente de tareas conversacional: chat con IA (Gemini) que gestiona tareas,
consulta y actúa sobre GitHub, y manda recordatorios por email, con autenticación
multiusuario y automatización sin intervención humana.

Repo hermano: [task-agent-frontend](https://github.com/AdrianMnd/task-agent-frontend)

## Stack

- **Node.js + TypeScript + Express**
- **Neon Postgres** (`pg`) — base de datos relacional
- **Google Gemini** (`@google/genai`, modelo `gemini-3.5-flash-lite`) — motor del agente,
  vía function calling / tool use
- **JWT** (`jsonwebtoken`) + **bcryptjs** — autenticación
- **Resend** — envío de emails (recordatorios y notificaciones de reset de contraseña)
- **GitHub REST API** — consulta y gestión de PRs/issues (fetch nativo, sin SDK)
- **express-rate-limit** — protección básica de fuerza bruta

## Arquitectura: el bucle del agente

El corazón del backend es `src/agent/agentLoop.ts`, que implementa el patrón **ReAct**
(Reasoning + Acting):

1. Se manda la conversación completa + el catálogo de herramientas disponibles a Gemini.
2. Gemini responde con texto (streameado al cliente en tiempo real) o pide ejecutar una
   herramienta (`functionCall`).
3. Si pide una herramienta, el backend la ejecuta de verdad (consulta la base de datos,
   llama a la API de GitHub, envía un email...) y le devuelve el resultado a Gemini.
4. Se repite hasta que Gemini responde solo con texto, o hasta un límite de 5 iteraciones
   de seguridad (`MAX_TOOL_ITERATIONS`).

Puntos importantes de esta implementación:

- **El modelo nunca decide el `user_id`.** Las definiciones de herramientas (lo que Gemini
  "ve") no incluyen ningún parámetro de usuario. El `user_id` siempre se deriva del JWT en
  `middleware/auth.ts` y se inyecta en el backend antes de ejecutar cualquier herramienta.
  Esto es deliberado: si el modelo pudiera especificar de qué usuario leer/escribir datos,
  cualquiera podría manipular el prompt para acceder a datos de otro usuario.
- **Una herramienta por turno.** Los modelos Gemini 3.x tienen un fallo conocido: cuando
  piden varias herramientas en el mismo turno, a veces no generan correctamente el
  `thought_signature` (un campo interno de "razonamiento") para la segunda función en
  adelante, lo que hace fallar la petición siguiente. Para evitarlo, el bucle solo procesa
  la primera `functionCall` de cada turno; si el modelo quería varias, las pide en turnos
  sucesivos. Como red de seguridad adicional, si el `thought_signature` falta, se rellena
  con el valor centinela oficial de Google (`skip_thought_signature_validator`).
- **Streaming real.** La respuesta de texto se envía al cliente con `generateContentStream`
  y se reenvía trozo a trozo por el endpoint `/api/chat` (texto plano, sin esperar a que
  Gemini termine de generar toda la respuesta). Los turnos que solo ejecutan herramientas
  no generan texto visible hasta el turno final.
- **Historial acotado.** Solo se envían a Gemini los últimos 15 mensajes de la conversación
  (`MAX_HISTORY_MESSAGES` en `routes/chat.ts`) para controlar tiempo de respuesta y coste;
  el historial completo se guarda en la base de datos igualmente.

## Catálogo de herramientas del agente

| Archivo | Herramientas | Notas |
|---|---|---|
| `tools/taskTools.ts` | `create_task`, `list_tasks`, `complete_task`, `update_task`, `delete_task`, `prioritize_tasks`, `search_tasks`, `search_tasks_by_date`, `get_task_stats`, `snooze_task` | CRUD completo + búsqueda + estadísticas |
| `tools/githubTools.ts` | `list_github_prs`, `list_github_issues`, `comment_on_pr`, `open_github_pr`, `create_github_issue`, `close_github_issue` | Nunca cierra ni fusiona PRs (esa acción es siempre manual) |
| `tools/emailTools.ts` | `send_reminder_email` | También expone `sendTaskReminderEmail` y `sendPasswordResetNotification` como funciones internas reutilizadas por scripts y por la ruta de auth |
| `tools/settingsTools.ts` | `set_reminder_window` | Cuántos días de antelación cuentan como "urgente" |

**Acciones que requieren confirmación explícita del usuario antes de ejecutarse** (impuesto
por instrucciones en el prompt del sistema, no por una barrera técnica): `delete_task`,
`comment_on_pr`, `open_github_pr`, `create_github_issue`, `close_github_issue`. El modelo
debe describir la acción exacta y esperar un mensaje de confirmación antes de llamar a la
herramienta.

## Autenticación

- Registro/login con usuario y contraseña (no email de verificación), para no depender de
  las limitaciones de Resend (ver más abajo).
- JWT de 30 días, `middleware/auth.ts` protege todas las rutas salvo `/health` y
  `/auth/*`.
- **Recuperación de contraseña manual**: como Resend (sin dominio verificado) solo puede
  enviar a una dirección fija, `POST /auth/request-reset` no manda un enlace al usuario —
  notifica a `REMINDER_EMAIL` (el operador de la app), que ejecuta
  `npm run reset-password -- <email> <nueva-contraseña>` y comunica la nueva contraseña
  por otro canal. No es un flujo self-service, pero es honesto sobre la limitación en vez
  de fingir un flujo automático que no podría funcionar.
- Rate limiting: 10 intentos/15 min en `/auth/login`, 5 solicitudes/hora en
  `/auth/request-reset`.

## Automatización (sin intervención humana)

- **`scripts/checkReminders.ts`** — revisa tareas urgentes y envía email si corresponde.
  Se ejecuta vía GitHub Actions (`.github/workflows/check-reminders.yml`, cron diario).
- **GitHub Actions keep-alive** (`.github/workflows/keep-alive.yml`) — ping cada 10 min a
  `/health` para evitar que Render duerma el servicio en el plan gratuito.

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/register` | No | Crea usuario, devuelve JWT |
| POST | `/auth/login` | No | Devuelve JWT (rate-limited) |
| POST | `/auth/request-reset` | No | Notifica solicitud de reset (rate-limited) |
| POST | `/chat` | Sí | Envía mensaje al agente, respuesta en streaming (texto plano) |
| GET | `/messages` | Sí | Historial completo de la conversación |
| DELETE | `/messages` | Sí | Limpia la conversación |
| GET | `/tasks` | Sí | Lista tareas del usuario |
| GET | `/reminders/last` | Sí | Última comprobación automática de recordatorios |
| POST | `/transcribe` | Sí | Transcribe audio (base64) a texto vía Gemini |
| GET | `/health` | No | Health check (usado por el keep-alive) |

## Estructura

```
src/
  index.ts              — entrypoint Express
  db.ts                 — pool de conexión Postgres
  types.ts              — tipos compartidos (Task, ChatMessage)
  agent/agentLoop.ts     — bucle del agente (ReAct)
  middleware/auth.ts     — JWT: signToken, requireAuth
  tools/                 — definiciones + ejecución de herramientas
  routes/                — auth, chat, tasks, reminders, transcribe
  scripts/                — checkReminders, resetPassword (ejecución manual/cron)
  migrations/             — SQL versionado, run.ts aplica todos los .sql en orden
```

## Variables de entorno

Ver `.env.example`. Resumen:

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión Neon Postgres |
| `GEMINI_API_KEY` | Motor del agente y transcripción de audio |
| `GITHUB_TOKEN` | Fine-grained token con permisos de lectura/escritura en Pull requests e Issues |
| `RESEND_API_KEY`, `REMINDER_EMAIL`, `RESEND_FROM_ADDRESS` | Envío de emails |
| `JWT_SECRET` | Firma de tokens de sesión |
| `FRONTEND_URL` | Restringe CORS al dominio del frontend desplegado |
| `PORT` | Puerto local (Render lo gestiona solo en producción) |

## Puesta en marcha local

```bash
npm install
cp .env.example .env   # rellenar variables
npm run migrate        # aplica todas las migraciones en orden
npm run dev
```

## Despliegue

- **Backend**: Render (Web Service), auto-deploy en `master`.
- **Recordatorios + keep-alive**: GitHub Actions (ver `.github/workflows/`).
- **Base de datos**: Neon Postgres (serverless).

## Limitaciones conocidas

- **Resend sin dominio verificado** solo permite enviar a una dirección fija
  (`REMINDER_EMAIL`). Esto afecta a los recordatorios (llegan solo al operador) y al reset
  de contraseña (manual en vez de self-service). El código ya está preparado para escalar
  a multiusuario real en cuanto se verifique un dominio propio.
- **Sin tests automatizados todavía** (pendiente, próxima iteración del proyecto).
