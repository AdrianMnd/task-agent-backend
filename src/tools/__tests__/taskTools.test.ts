import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...args: any[]) => queryMock(...args) } }));

const { executeTaskTool, taskToolDefinitions } = await import('../taskTools.js');

const USER_ID = 42;

beforeEach(() => {
  queryMock.mockReset();
});

describe('taskToolDefinitions', () => {
  it('declara las 10 herramientas de tareas', () => {
    const names = taskToolDefinitions.map((t) => t.name);
    expect(names).toEqual([
      'create_task',
      'list_tasks',
      'complete_task',
      'update_task',
      'delete_task',
      'prioritize_tasks',
      'search_tasks',
      'search_tasks_by_date',
      'get_task_stats',
      'snooze_task'
    ]);
  });

  it('ninguna definicion incluye user_id como parametro (nunca lo debe ver el modelo)', () => {
    for (const tool of taskToolDefinitions) {
      expect(tool.input_schema.properties).not.toHaveProperty('user_id');
    }
  });
});

describe('executeTaskTool', () => {
  it('create_task inserta con el user_id inyectado, no el del input', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Revisar PR' }] });
    const result = await executeTaskTool(
      'create_task',
      { title: 'Revisar PR', description: 'desc', due_date: '2026-09-01' },
      USER_ID
    );
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO tasks'), [
      'Revisar PR',
      'desc',
      '2026-09-01',
      USER_ID
    ]);
    expect(result).toEqual({ id: 1, title: 'Revisar PR' });
  });

  it('create_task acepta description/due_date opcionales', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 2 }] });
    await executeTaskTool('create_task', { title: 'Solo titulo' }, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ['Solo titulo', null, null, USER_ID]);
  });

  it('list_tasks sin filtro devuelve todas las del usuario', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const result = await executeTaskTool('list_tasks', {}, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.not.stringContaining('completed = false'), [USER_ID]);
    expect(result).toHaveLength(2);
  });

  it('list_tasks con only_pending filtra completadas', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await executeTaskTool('list_tasks', { only_pending: true }, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('completed = false'), [USER_ID]);
  });

  it('complete_task marca como completada y escopa por user_id', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5, completed: true }] });
    const result = await executeTaskTool('complete_task', { id: 5 }, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE tasks SET completed = true'), [
      5,
      USER_ID
    ]);
    expect(result).toEqual({ id: 5, completed: true });
  });

  it('complete_task devuelve error si no existe la tarea', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await executeTaskTool('complete_task', { id: 999 }, USER_ID);
    expect(result).toEqual({ error: 'No existe tarea con id 999' });
  });

  it('update_task usa COALESCE para no pisar campos no enviados', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 3, title: 'Nuevo' }] });
    await executeTaskTool('update_task', { id: 3, title: 'Nuevo' }, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('COALESCE'), [
      'Nuevo',
      null,
      null,
      3,
      USER_ID
    ]);
  });

  it('delete_task elimina y devuelve deleted:true', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 7 }] });
    const result = await executeTaskTool('delete_task', { id: 7 }, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM tasks'), [7, USER_ID]);
    expect(result).toEqual({ deleted: true, id: 7 });
  });

  it('delete_task devuelve error si no existe o no pertenece al usuario', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await executeTaskTool('delete_task', { id: 404 }, USER_ID);
    expect(result).toEqual({ error: 'No existe tarea con id 404' });
  });

  it('prioritize_tasks ordena por fecha limite y excluye completadas', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    await executeTaskTool('prioritize_tasks', {}, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('completed = false'), [USER_ID]);
  });

  it('search_tasks busca con ILIKE en titulo y descripcion', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Revisar PR' }] });
    await executeTaskTool('search_tasks', { query: 'PR' }, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), [USER_ID, '%PR%']);
  });

  it('search_tasks_by_date con ambos extremos añade las dos condiciones', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await executeTaskTool('search_tasks_by_date', { from_date: '2026-01-01', to_date: '2026-01-31' }, USER_ID);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('due_date >= $2');
    expect(sql).toContain('due_date <= $3');
    expect(params).toEqual([USER_ID, '2026-01-01', '2026-01-31']);
  });

  it('search_tasks_by_date sin fechas solo filtra por usuario', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await executeTaskTool('search_tasks_by_date', {}, USER_ID);
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).not.toContain('due_date >=');
    expect(params).toEqual([USER_ID]);
  });

  it('get_task_stats agrega pendientes/completadas/vencidas correctamente', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { completed: true, overdue: false, count: '3' },
        { completed: false, overdue: true, count: '2' },
        { completed: false, overdue: false, count: '1' }
      ]
    });
    const result = await executeTaskTool('get_task_stats', {}, USER_ID);
    expect(result).toEqual({ pending: 3, completed: 3, overdue: 2 });
  });

  it('get_task_stats con cero filas devuelve todo a cero', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await executeTaskTool('get_task_stats', {}, USER_ID);
    expect(result).toEqual({ pending: 0, completed: 0, overdue: 0 });
  });

  it('snooze_task aplaza usando make_interval con los dias redondeados', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 9, due_date: '2026-09-08' }] });
    await executeTaskTool('snooze_task', { id: 9, days: 6.7 }, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('make_interval'), [7, 9, USER_ID]);
  });

  it('herramienta desconocida devuelve un error explicito', async () => {
    const result = await executeTaskTool('does_not_exist', {}, USER_ID);
    expect(result).toEqual({ error: 'Herramienta desconocida: does_not_exist' });
  });
});
