import dotenv from 'dotenv';

dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export const githubToolDefinitions = [
  {
    name: 'list_github_prs',
    description: 'Lista los PRs abiertos en un repositorio de GitHub.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repositorio en formato owner/repo, ej. AdrianMnd/task-agent-backend' }
      },
      required: ['repo']
    }
  },
  {
    name: 'list_github_issues',
    description: 'Lista los issues abiertos en un repositorio de GitHub (no incluye PRs).',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repositorio en formato owner/repo' }
      },
      required: ['repo']
    }
  },
  {
    name: 'comment_on_pr',
    description:
      'Publica un comentario en un PR de GitHub. Usa esto solo despues de que el usuario ' +
      'haya confirmado explicitamente el texto exacto del comentario.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repositorio en formato owner/repo' },
        pr_number: { type: 'number', description: 'Numero del PR' },
        body: { type: 'string', description: 'Texto del comentario a publicar' }
      },
      required: ['repo', 'pr_number', 'body']
    }
  },
  {
    name: 'open_github_pr',
    description:
      'Abre un Pull Request en GitHub desde una rama con cambios hacia una rama base (normalmente ' +
      'master). NO fusiona ni cierra nada, solo lo crea para revision manual. Usa esto solo ' +
      'despues de que el usuario confirme explicitamente el titulo, la rama origen y la rama destino.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repositorio en formato owner/repo' },
        head: { type: 'string', description: 'Rama con los cambios, ej. dev' },
        base: { type: 'string', description: 'Rama destino, ej. master. Si no se indica, usa master' },
        title: { type: 'string', description: 'Titulo del PR' },
        body: { type: 'string', description: 'Descripcion del PR, opcional' }
      },
      required: ['repo', 'head', 'title']
    }
  },
    {
    name: 'create_github_issue',
    description:
      'Crea un issue en un repositorio de GitHub. Usa esto solo despues de que el usuario ' +
      'confirme explicitamente el titulo y la descripcion.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repositorio en formato owner/repo' },
        title: { type: 'string', description: 'Titulo del issue' },
        body: { type: 'string', description: 'Descripcion del issue, opcional' }
      },
      required: ['repo', 'title']
    }
  },
    {
    name: 'close_github_issue',
    description:
      'Cierra un issue de GitHub (no un PR: si el numero indicado pertenece a un PR, esta ' +
      'herramienta lo rechaza). Usa esto solo despues de que el usuario confirme explicitamente ' +
      'que quiere cerrar ese issue concreto.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repositorio en formato owner/repo' },
        issue_number: { type: 'number', description: 'Numero del issue a cerrar' }
      },
      required: ['repo', 'issue_number']
    }
  }
] as const;

export async function executeGithubTool(name: string, input: any): Promise<unknown> {
  if (!GITHUB_TOKEN) {
    return { error: 'GITHUB_TOKEN no configurado en .env' };
  }

  switch (name) {
    case 'list_github_prs': {
      const repo = input.repo;
      const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json'
        }
      });

      if (!res.ok) {
        return { error: `GitHub API error: ${res.status} ${res.statusText}` };
      }

      const prs = (await res.json()) as any[];
      return prs.map((pr) => ({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        author: pr.user?.login,
        created_at: pr.created_at
      }));
    }
    case 'list_github_issues': {
      const repo = input.repo;
      const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=open`, {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json'
        }
      });

      if (!res.ok) {
        return { error: `GitHub API error: ${res.status} ${res.statusText}` };
      }

      const issues = (await res.json()) as any[];
      return issues
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          author: issue.user?.login,
          created_at: issue.created_at
        }));
    }
    case 'comment_on_pr': {
      const { repo, pr_number, body } = input;
      const res = await fetch(`https://api.github.com/repos/${repo}/issues/${pr_number}/comments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ body })
      });

      if (!res.ok) {
        return { error: `GitHub API error: ${res.status} ${res.statusText}` };
      }

      const comment = (await res.json()) as any;
      return { commented: true, url: comment.html_url };
    }
    case 'open_github_pr': {
      const { repo, head, title } = input;
      const base = input.base || 'master';

      const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, head, base, body: input.body ?? '' })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}) as any);
        return { error: `GitHub API error: ${res.status} ${res.statusText}`, details: errBody.message };
      }

      const pr = (await res.json()) as any;
      return { opened: true, number: pr.number, url: pr.html_url };
    }
        case 'create_github_issue': {
      const { repo, title } = input;
      const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, body: input.body ?? '' })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}) as any);
        return { error: `GitHub API error: ${res.status} ${res.statusText}`, details: errBody.message };
      }

      const issue = (await res.json()) as any;
      return { created: true, number: issue.number, url: issue.html_url };
    }
        case 'close_github_issue': {
      const { repo, issue_number } = input;

      const checkRes = await fetch(`https://api.github.com/repos/${repo}/issues/${issue_number}`, {
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' }
      });

      if (!checkRes.ok) {
        return { error: `GitHub API error: ${checkRes.status} ${checkRes.statusText}` };
      }

      const item = (await checkRes.json()) as any;
      if (item.pull_request) {
        return { error: `El numero ${issue_number} es un PR, no un issue. Esta herramienta no cierra PRs.` };
      }

      const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issue_number}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ state: 'closed' })
      });

      if (!res.ok) {
        return { error: `GitHub API error: ${res.status} ${res.statusText}` };
      }

      const closed = (await res.json()) as any;
      return { closed: true, number: closed.number, url: closed.html_url };
    }
    default:
      return { error: `Herramienta de GitHub desconocida: ${name}` };
  }
}