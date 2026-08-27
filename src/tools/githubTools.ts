// FASE 2 (pendiente de implementar): integracion con la API de GitHub.
//
// Cuando se active esta fase:
// 1. Añadir estas definiciones al array de tools en agentLoop.ts junto a taskToolDefinitions.
// 2. Implementar executeGithubTool usando @octokit/rest o fetch directo a api.github.com
//    con el token en GITHUB_TOKEN.
// 3. Opcional: guardar los PRs/issues detectados como tareas con source='github'
//    y external_ref='owner/repo#numero' para que aparezcan junto a las tareas manuales.

export const githubToolDefinitions = [
  {
    name: 'list_github_prs',
    description: '[Fase 2 - no implementado] Lista PRs abiertos asignados al usuario en un repositorio.',
    input_schema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repositorio en formato owner/repo' }
      },
      required: ['repo']
    }
  }
] as const;

export async function executeGithubTool(_name: string, _input: any): Promise<unknown> {
  return { error: 'Herramientas de GitHub aun no implementadas (fase 2).' };
}
