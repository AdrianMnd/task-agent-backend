import { pool } from '../db.js';
import type { Task } from '../types.js';

// Definiciones de herramientas en formato Anthropic tool-use.
// El modelo decide cuál llamar y con qué argumentos según la conversación.
export const taskToolDefinitions = [
  {
    name: 'create_task',
    description: 'Crea una nueva tarea para el usuario.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titulo breve de la tarea' },
        description: { type: 'string', description: 'Detalles opcionales' },
        due_date: { type: 'string', description: 'Fecha limite en formato YYYY-MM-DD, opcional' }
      },
      required: ['title']
    }
  },
  {
    name: 'list_tasks',
    description: 'Lista las tareas del usuario, opcionalmente filtradas.',
    input_schema: {
      type: 'object',
      properties: {
        only_pending: { type: 'boolean', description: 'Si es true, excluye tareas completadas' }
      }
    }
  },
  {
    name: 'complete_task',
    description: 'Marca una tarea como completada por su id.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Id de la tarea a completar' }
      },
      required: ['id']
    }
  },
  {
    name: 'prioritize_tasks',
    description: 'Devuelve las tareas pendientes ordenadas por urgencia (fecha limite mas proxima primero).',
    input_schema: { type: 'object', properties: {} }
  }
] as const;

// El "userId" NUNCA viene del modelo ni de "input": siempre se lo pasa agentLoop.ts,
// que a su vez lo recibe del middleware de autenticacion (ver middleware/auth.ts).
// Las definiciones de herramientas (lo que ve el modelo) no incluyen user_id a proposito.
export async function executeTaskTool(name: string, input: any, userId: number): Promise<unknown> {
  switch (name) {
    case 'create_task': {
      const { rows } = await pool.query<Task>(
        `INSERT INTO tasks (title, description, due_date, user_id) VALUES ($1, $2, $3, $4) RETURNING *`,
        [input.title, input.description ?? null, input.due_date ?? null, userId]
      );
      return rows[0];
    }
    case 'list_tasks': {
      const query = input?.only_pending
        ? `SELECT * FROM tasks WHERE user_id = $1 AND completed = false ORDER BY created_at DESC`
        : `SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC`;
      const { rows } = await pool.query<Task>(query, [userId]);
      return rows;
    }
    case 'complete_task': {
      const { rows } = await pool.query<Task>(
        `UPDATE tasks SET completed = true WHERE id = $1 AND user_id = $2 RETURNING *`,
        [input.id, userId]
      );
      return rows[0] ?? { error: `No existe tarea con id ${input.id}` };
    }
    case 'prioritize_tasks': {
      const { rows } = await pool.query<Task>(
        `SELECT * FROM tasks WHERE user_id = $1 AND completed = false ORDER BY due_date ASC NULLS LAST, created_at ASC`,
        [userId]
      );
      return rows;
    }
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}
