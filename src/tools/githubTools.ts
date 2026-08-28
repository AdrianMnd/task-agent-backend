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
    default:
      return { error: `Herramienta de GitHub desconocida: ${name}` };
  }
}
