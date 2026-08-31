import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...args: any[]) => queryMock(...args) } }));

const sendMock = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(function () {
    return { emails: { send: (...args: any[]) => sendMock(...args) } };
  })
}));

const { sendTaskReminderEmail, executeEmailTool, sendPasswordResetNotification } = await import(
  '../emailTools.js'
);

const USER_ID = 1;

beforeEach(() => {
  queryMock.mockReset();
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: 'email-123' }, error: null });
});

describe('sendTaskReminderEmail', () => {
  it('sin onlyUrgent lista todas las pendientes', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ title: 'Tarea 1', due_date: null }] });
    const result = await sendTaskReminderEmail({ userId: USER_ID, onlyUrgent: false });
    expect(queryMock).toHaveBeenCalledWith(expect.not.stringContaining('make_interval'), [USER_ID]);
    expect(result).toEqual({ sent: true, task_count: 1, email_id: 'email-123' });
  });

  it('con onlyUrgent consulta primero los dias de antelacion del usuario', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ reminder_days_ahead: 7 }] })
      .mockResolvedValueOnce({ rows: [{ title: 'Urgente', due_date: '2026-09-01' }] });
    await sendTaskReminderEmail({ userId: USER_ID, onlyUrgent: true });
    expect(queryMock).toHaveBeenNthCalledWith(1, expect.stringContaining('reminder_days_ahead'), [USER_ID]);
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining('make_interval'), [USER_ID, 7]);
  });

  it('usa 3 dias por defecto si el usuario no tiene preferencia guardada', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await sendTaskReminderEmail({ userId: USER_ID, onlyUrgent: true, skipIfEmpty: true });
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.any(String), [USER_ID, 3]);
  });

  it('skipIfEmpty evita enviar el email si no hay tareas', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ reminder_days_ahead: 3 }] }).mockResolvedValueOnce({ rows: [] });
    const result = await sendTaskReminderEmail({ userId: USER_ID, onlyUrgent: true, skipIfEmpty: true });
    expect(sendMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: false, task_count: 0 });
  });

  it('incluye additionalNotes en el HTML cuando se proporciona', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ title: 'T', due_date: null }] });
    await sendTaskReminderEmail({ userId: USER_ID, onlyUrgent: false, additionalNotes: '<li>PR #3</li>' });
    const call = sendMock.mock.calls[0][0];
    expect(call.html).toContain('PR #3');
    expect(call.html).toContain('Otros pendientes');
  });

  it('devuelve error si falta RESEND_API_KEY', async () => {
    const original = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    const result = await sendTaskReminderEmail({ userId: USER_ID, onlyUrgent: false });
    expect(result).toEqual({ error: 'RESEND_API_KEY no configurado en .env' });
    process.env.RESEND_API_KEY = original;
  });

  it('propaga el error de Resend si el envio falla', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ title: 'T', due_date: null }] });
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'quota exceeded' } });
    const result = await sendTaskReminderEmail({ userId: USER_ID, onlyUrgent: false });
    expect(result).toEqual({ error: 'Resend error: quota exceeded' });
  });
});

describe('executeEmailTool', () => {
  it('send_reminder_email delega en sendTaskReminderEmail con los args del modelo', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const result = await executeEmailTool(
      'send_reminder_email',
      { only_urgent: false, additional_notes: 'nota' },
      USER_ID
    );
    expect(result).toMatchObject({ sent: true });
  });

  it('herramienta desconocida devuelve error', async () => {
    const result = await executeEmailTool('otra_cosa', {}, USER_ID);
    expect(result).toEqual({ error: 'Herramienta de email desconocida: otra_cosa' });
  });
});

describe('sendPasswordResetNotification', () => {
  it('envia la notificacion al email del operador con el email del solicitante en el cuerpo', async () => {
    await sendPasswordResetNotification('usuario@example.com');
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        subject: 'Solicitud de restablecimiento de contraseña',
        html: expect.stringContaining('usuario@example.com')
      })
    );
  });

  it('no lanza si falta configuracion, solo lo registra', async () => {
    const original = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    await expect(sendPasswordResetNotification('x@example.com')).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
    process.env.RESEND_API_KEY = original;
  });
});
