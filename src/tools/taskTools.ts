import { pool } from '../db.js';
import type { Task } from '../types.js';

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
    name: 'update_task',
    description: 'Actualiza el titulo, descripcion o fecha limite de una tarea existente. Solo incluye los campos que cambian.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Id de la tarea a modificar' },
        title: { type: 'string', description: 'Nuevo titulo, opcional' },
        description: { type: 'string', description: 'Nueva descripcion, opcional' },
        due_date: { type: 'string', description: 'Nueva fecha limite en formato YYYY-MM-DD, opcional' }
      },
      required: ['id']
    }
  },
  {
    name: 'delete_task',
    description: 'Elimina definitivamente una tarea por su id.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Id de la tarea a eliminar' }
      },
      required: ['id']
    }
  },
  {
    name: 'prioritize_tasks',
    description: 'Devuelve las tareas pendientes ordenadas por urgencia (fecha limite mas proxima primero).',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'search_tasks',
    description: 'Busca tareas del usuario cuyo titulo o descripcion contengan un texto.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar en el titulo o la descripcion' }
      },
      required: ['query']
    }
  },
  {
    name: 'search_tasks_by_date',
    description:
      'Busca tareas del usuario cuya fecha limite cae dentro de un rango. Util para preguntas ' +
      'como "que tengo esta semana" o "que tengo en marzo" (calcula tu las fechas exactas).',
    input_schema: {
      type: 'object',
      properties: {
        from_date: { type: 'string', description: 'Fecha inicial en formato YYYY-MM-DD, opcional' },
        to_date: { type: 'string', description: 'Fecha final en formato YYYY-MM-DD, opcional' }
      }
    }
  },
  {
    name: 'get_task_stats',
    description: 'Devuelve un resumen numerico: cuantas tareas pendientes, completadas y vencidas tiene el usuario.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'snooze_task',
    description: 'Aplaza la fecha limite de una tarea un numero de dias desde hoy o desde su fecha actual.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Id de la tarea a aplazar' },
        days: { type: 'number', description: 'Numero de dias a aplazar, ej. 7 para una semana' }
      },
      required: ['id', 'days']
    }
  }
] as const;

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
    case 'update_task': {
      const { rows } = await pool.query<Task>(
        `UPDATE tasks
         SET title = COALESCE($1, title),
             description = COALESCE($2, description),
             due_date = COALESCE($3, due_date)
         WHERE id = $4 AND user_id = $5
         RETURNING *`,
        [input.title ?? null, input.description ?? null, input.due_date ?? null, input.id, userId]
      );
      return rows[0] ?? { error: `No existe tarea con id ${input.id}` };
    }
    case 'delete_task': {
      const { rows } = await pool.query<Task>(
        `DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id`,
        [input.id, userId]
      );
      return rows[0]
        ? { deleted: true, id: rows[0].id }
        : { error: `No existe tarea con id ${input.id}` };
    }
    case 'prioritize_tasks': {
      const { rows } = await pool.query<Task>(
        `SELECT * FROM tasks WHERE user_id = $1 AND completed = false ORDER BY due_date ASC NULLS LAST, created_at ASC`,
        [userId]
      );
      return rows;
    }
    case 'search_tasks': {
      const { rows } = await pool.query<Task>(
        `SELECT * FROM tasks WHERE user_id = $1 AND (title ILIKE $2 OR description ILIKE $2) ORDER BY created_at DESC`,
        [userId, `%${input.query}%`]
      );
      return rows;
    }
    case 'search_tasks_by_date': {
      const conditions = ['user_id = $1'];
      const params: any[] = [userId];
      if (input.from_date) {
        params.push(input.from_date);
        conditions.push(`due_date >= $${params.length}`);
      }
      if (input.to_date) {
        params.push(input.to_date);
        conditions.push(`due_date <= $${params.length}`);
      }
      const { rows } = await pool.query<Task>(
        `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY due_date ASC NULLS LAST`,
        params
      );
      return rows;
    }
    case 'get_task_stats': {
      const { rows } = await pool.query<{ completed: boolean; overdue: boolean; count: string }>(
        `SELECT
           completed,
           (due_date IS NOT NULL AND due_date < CURRENT_DATE AND NOT completed) AS overdue,
           COUNT(*) AS count
         FROM tasks
         WHERE user_id = $1
         GROUP BY completed, overdue`,
        [userId]
      );

      let pending = 0;
      let completed = 0;
      let overdue = 0;
      for (const row of rows) {
        const count = Number(row.count);
        if (row.completed) {
          completed += count;
        } else {
          pending += count;
          if (row.overdue) overdue += count;
        }
      }
      return { pending, completed, overdue };
    }
    case 'snooze_task': {
      const { rows } = await pool.query<Task>(
        `UPDATE tasks
         SET due_date = COALESCE(due_date, CURRENT_DATE) + make_interval(days => $1)
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [Math.round(input.days), input.id, userId]
      );
      return rows[0] ?? { error: `No existe tarea con id ${input.id}` };
    }
    default:
      return { error: `Herramienta desconocida: ${name}` };
  }
}