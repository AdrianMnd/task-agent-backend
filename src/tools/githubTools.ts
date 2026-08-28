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
    default:
      return { error: `Herramienta de GitHub desconocida: ${name}` };
  }
}