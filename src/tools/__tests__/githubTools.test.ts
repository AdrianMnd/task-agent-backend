import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeGithubTool, githubToolDefinitions } from '../githubTools.js';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? 'OK' : 'Error', json: async () => body } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('githubToolDefinitions', () => {
  it('declara las 6 herramientas de GitHub', () => {
    const names = githubToolDefinitions.map((t) => t.name);
    expect(names).toEqual([
      'list_github_prs',
      'list_github_issues',
      'comment_on_pr',
      'open_github_pr',
      'create_github_issue',
      'close_github_issue'
    ]);
  });
});

describe('executeGithubTool', () => {
  it('list_github_prs mapea los campos relevantes', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{ number: 3, title: 'Fix', html_url: 'url', user: { login: 'adrian' }, created_at: 't' }])
    );
    const result = await executeGithubTool('list_github_prs', { repo: 'owner/repo' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/pulls?state=open',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining('Bearer') }) })
    );
    expect(result).toEqual([{ number: 3, title: 'Fix', url: 'url', author: 'adrian', created_at: 't' }]);
  });

  it('list_github_issues filtra los que en realidad son PRs', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        { number: 1, title: 'Issue real', html_url: 'u1', user: { login: 'a' }, created_at: 't1' },
        { number: 2, title: 'Es un PR', html_url: 'u2', user: { login: 'b' }, created_at: 't2', pull_request: {} }
      ])
    );
    const result = await executeGithubTool('list_github_issues', { repo: 'owner/repo' });
    expect(result).toEqual([{ number: 1, title: 'Issue real', url: 'u1', author: 'a', created_at: 't1' }]);
  });

  it('comment_on_pr publica en el endpoint de comentarios de issues', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ html_url: 'comment-url' }));
    const result = await executeGithubTool('comment_on_pr', { repo: 'owner/repo', pr_number: 5, body: 'LGTM' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/issues/5/comments',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ body: 'LGTM' }) })
    );
    expect(result).toEqual({ commented: true, url: 'comment-url' });
  });

  it('open_github_pr usa master como base por defecto', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ number: 10, html_url: 'pr-url' }));
    const result = await executeGithubTool('open_github_pr', { repo: 'owner/repo', head: 'dev', title: 'Nueva feature' });
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ title: 'Nueva feature', head: 'dev', base: 'master', body: '' });
    expect(result).toEqual({ opened: true, number: 10, url: 'pr-url' });
  });

  it('open_github_pr respeta la base indicada explicitamente', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ number: 11, html_url: 'pr-url-2' }));
    await executeGithubTool('open_github_pr', { repo: 'owner/repo', head: 'dev', base: 'staging', title: 'X' });
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options.body).base).toBe('staging');
  });

  it('open_github_pr devuelve el detalle del error de GitHub si falla', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'No commits between master and dev' }, false, 422));
    const result = await executeGithubTool('open_github_pr', { repo: 'owner/repo', head: 'dev', title: 'X' });
    expect(result).toMatchObject({ details: 'No commits between master and dev' });
  });

  it('create_github_issue crea el issue', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ number: 20, html_url: 'issue-url' }));
    const result = await executeGithubTool('create_github_issue', { repo: 'owner/repo', title: 'Bug' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/issues',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result).toEqual({ created: true, number: 20, url: 'issue-url' });
  });

  it('close_github_issue cierra un issue real', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ number: 20 })) // comprobacion: no es un PR
      .mockResolvedValueOnce(jsonResponse({ number: 20, html_url: 'closed-url' })); // PATCH
    const result = await executeGithubTool('close_github_issue', { repo: 'owner/repo', issue_number: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, patchOptions] = fetchMock.mock.calls[1];
    expect(patchOptions.method).toBe('PATCH');
    expect(JSON.parse(patchOptions.body)).toEqual({ state: 'closed' });
    expect(result).toEqual({ closed: true, number: 20, url: 'closed-url' });
  });

  it('close_github_issue rechaza cerrar un numero que en realidad es un PR', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ number: 7, pull_request: {} }));
    const result = await executeGithubTool('close_github_issue', { repo: 'owner/repo', issue_number: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(1); // nunca llega a hacer el PATCH
    expect(result).toEqual({ error: 'El numero 7 es un PR, no un issue. Esta herramienta no cierra PRs.' });
  });

  it('devuelve error si la API de GitHub responde con fallo', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 404));
    const result = await executeGithubTool('list_github_prs', { repo: 'owner/inexistente' });
    expect(result).toEqual({ error: 'GitHub API error: 404 Error' });
  });

  it('herramienta desconocida devuelve error explicito', async () => {
    const result = await executeGithubTool('cosa_rara', {});
    expect(result).toEqual({ error: 'Herramienta de GitHub desconocida: cosa_rara' });
  });
});
