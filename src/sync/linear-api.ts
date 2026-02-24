/**
 * Thin Linear GraphQL API client.
 * Uses LINEAR_API_KEY env var for authentication.
 */

import type {
  LinearIssue,
  LinearComment,
  LinearState,
  LinearTeam,
  LinearProject,
} from "../types/linear"

const LINEAR_API_URL = "https://api.linear.app/graphql"

const ISSUE_FIELDS = `
  id identifier title description priority
  state { id name }
  parent { id identifier }
  children { nodes { id identifier } }
  comments { nodes { id body createdAt updatedAt user { name displayName } } }
  labels { nodes { id name } }
  updatedAt createdAt
`

function getApiKey(): string {
  const key = process.env.LINEAR_API_KEY
  if (!key) {
    throw new Error(
      "LINEAR_API_KEY environment variable is not set. " +
        "Get your API key from Linear Settings → API → Personal API keys.",
    )
  }
  return key
}

export async function linearQuery(
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const apiKey = getApiKey()
  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Linear API error (${response.status}): ${text}`)
  }

  const json = (await response.json()) as { data?: unknown; errors?: Array<{ message: string }> }
  if (json.errors?.length) {
    throw new Error(`Linear GraphQL error: ${json.errors.map((e) => e.message).join(", ")}`)
  }

  return json.data
}

/** Fetch an issue by its internal UUID. Use getIssueByIdentifier for human-readable IDs like "ENG-142". */
export async function getIssue(id: string): Promise<LinearIssue> {
  const data = (await linearQuery(
    `query($id: String!) {
      issue(id: $id) { ${ISSUE_FIELDS} }
    }`,
    { id },
  )) as { issue: LinearIssue | null }
  if (!data.issue) throw new Error(`Linear issue with id ${id} not found`)
  return data.issue
}

/** Fetch an issue by human-readable identifier like "ENG-142". */
export async function getIssueByIdentifier(identifier: string): Promise<LinearIssue> {
  const [teamKey, numberStr] = identifier.split("-")
  const number = parseInt(numberStr, 10)
  const data = (await linearQuery(
    `query($teamKey: String!, $number: Float!) {
      issues(filter: { team: { key: { eq: $teamKey } }, number: { eq: $number } }) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`,
    { teamKey, number },
  )) as { issues: { nodes: LinearIssue[] } }

  if (!data.issues.nodes.length) {
    throw new Error(`Linear issue ${identifier} not found`)
  }
  return data.issues.nodes[0]
}

export async function listIssues(filter: {
  teamId?: string
  projectId?: string
}): Promise<LinearIssue[]> {
  // Build the query and variables dynamically based on which filters are provided
  const conditions: string[] = []
  const varDefs: string[] = []
  const variables: Record<string, unknown> = {}

  if (filter.teamId) {
    varDefs.push("$teamId: ID!")
    conditions.push('team: { id: { eq: $teamId } }')
    variables.teamId = filter.teamId
  }
  if (filter.projectId) {
    varDefs.push("$projectId: ID!")
    conditions.push('project: { id: { eq: $projectId } }')
    variables.projectId = filter.projectId
  }

  const varDefStr = varDefs.length ? `(${varDefs.join(", ")})` : ""
  const filterStr = conditions.length ? `filter: { ${conditions.join(", ")} },` : ""

  const data = (await linearQuery(
    `query${varDefStr} {
      issues(${filterStr} first: 100) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`,
    variables,
  )) as { issues: { nodes: LinearIssue[] } }
  return data.issues.nodes
}

export async function createIssue(input: {
  teamId: string
  title: string
  description?: string
  priority?: number
  stateId?: string
  parentId?: string
  projectId?: string
}): Promise<LinearIssue> {
  const data = (await linearQuery(
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { ${ISSUE_FIELDS} }
      }
    }`,
    { input },
  )) as { issueCreate: { success: boolean; issue: LinearIssue } }

  if (!data.issueCreate.success) {
    throw new Error("Linear issueCreate mutation returned success: false")
  }
  return data.issueCreate.issue
}

export async function updateIssue(
  issueId: string,
  input: {
    title?: string
    description?: string
    priority?: number
    stateId?: string
    parentId?: string
  },
): Promise<LinearIssue> {
  const data = (await linearQuery(
    `mutation($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { ${ISSUE_FIELDS} }
      }
    }`,
    { id: issueId, input },
  )) as { issueUpdate: { success: boolean; issue: LinearIssue } }

  if (!data.issueUpdate.success) {
    throw new Error(`Linear issueUpdate mutation returned success: false for ${issueId}`)
  }
  return data.issueUpdate.issue
}

export async function listComments(issueId: string): Promise<LinearComment[]> {
  const data = (await linearQuery(
    `query($issueId: String!) {
      issue(id: $issueId) {
        comments {
          nodes { id body createdAt updatedAt user { name displayName } }
        }
      }
    }`,
    { issueId },
  )) as { issue: { comments: { nodes: LinearComment[] } } }
  return data.issue.comments.nodes
}

export async function createComment(issueId: string, body: string): Promise<LinearComment> {
  const data = (await linearQuery(
    `mutation($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id body createdAt updatedAt user { name displayName } }
      }
    }`,
    { input: { issueId, body } },
  )) as { commentCreate: { success: boolean; comment: LinearComment } }

  if (!data.commentCreate.success) {
    throw new Error(`Linear commentCreate mutation returned success: false for issue ${issueId}`)
  }
  return data.commentCreate.comment
}

export async function listTeams(): Promise<LinearTeam[]> {
  const data = (await linearQuery(
    `query { teams { nodes { id name key } } }`,
  )) as { teams: { nodes: LinearTeam[] } }
  return data.teams.nodes
}

export async function listProjects(teamId?: string): Promise<LinearProject[]> {
  if (teamId) {
    const data = (await linearQuery(
      `query($teamId: ID!) {
        projects(filter: { accessibleTeams: { id: { eq: $teamId } } }) {
          nodes { id name state }
        }
      }`,
      { teamId },
    )) as { projects: { nodes: LinearProject[] } }
    return data.projects.nodes
  }

  const data = (await linearQuery(
    `query { projects { nodes { id name state } } }`,
  )) as { projects: { nodes: LinearProject[] } }
  return data.projects.nodes
}

export async function listStates(teamId: string): Promise<LinearState[]> {
  const data = (await linearQuery(
    `query($teamId: ID!) {
      workflowStates(filter: { team: { id: { eq: $teamId } } }) {
        nodes { id name type }
      }
    }`,
    { teamId },
  )) as { workflowStates: { nodes: LinearState[] } }
  return data.workflowStates.nodes
}

export function hasApiKey(): boolean {
  return !!process.env.LINEAR_API_KEY
}
