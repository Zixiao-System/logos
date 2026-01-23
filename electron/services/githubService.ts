/**
 * GitHub Actions 服务
 * 提供与 GitHub Actions API 的交互
 */

import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/** GitHub API 基础 URL */
const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_OAUTH_DEVICE_CODE_URL = 'https://github.com/login/device/code'
const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token'

/** GitHub Workflow Run */
interface GitHubWorkflowRun {
  id: number
  name: string
  head_branch: string
  head_sha: string
  status: string
  conclusion: string | null
  workflow_id: number
  html_url: string
  created_at: string
  updated_at: string
  run_started_at: string
  jobs_url: string
  actor: {
    login: string
    avatar_url: string
  }
}

/** GitHub Workflow */
interface GitHubWorkflow {
  id: number
  name: string
  path: string
  state: string
}

/** GitHub Workflow Job */
interface GitHubWorkflowJob {
  id: number
  run_id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
  steps: Array<{
    name: string
    status: string
    conclusion: string | null
    number: number
  }>
}

/** GitHub OAuth 设备码响应 */
interface GitHubDeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in: number
  interval: number
}

/** GitHub OAuth Token 响应 */
interface GitHubDeviceTokenResponse {
  access_token?: string
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
  error_uri?: string
  interval?: number
}

/**
 * 从 git remote 获取仓库信息
 */
async function getRepoInfo(repoPath: string): Promise<{ owner: string; repo: string } | null> {
  try {
    const { stdout } = await execAsync('git remote get-url origin', { cwd: repoPath })
    const url = stdout.trim()

    // 支持 HTTPS 和 SSH 格式
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    let match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?$/)
    if (match) {
      return { owner: match[1], repo: match[2] }
    }

    return null
  } catch {
    return null
  }
}

/**
 * 获取 Token (优先级: 传入参数 > 环境变量 > git credential)
 */
async function getToken(providedToken?: string, repoPath?: string): Promise<string | null> {
  // 1. 使用传入的 token
  if (providedToken) {
    return providedToken
  }

  // 2. 检查环境变量
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN
  }
  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN
  }

  // 3. 尝试从 git credential 获取
  if (repoPath) {
    try {
      const { stdout } = await execAsync(
        'git credential fill <<< "protocol=https\nhost=github.com"',
        { cwd: repoPath, shell: '/bin/bash' }
      )
      const match = stdout.match(/password=(.+)/)
      if (match) {
        return match[1].trim()
      }
    } catch {
      // 忽略错误
    }
  }

  return null
}

/**
 * 获取 OAuth Client 配置
 */
function getOAuthClientConfig(): { clientId: string; clientSecret?: string } {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET

  if (!clientId) {
    throw new Error('GitHub OAuth client ID not configured. Set GITHUB_OAUTH_CLIENT_ID.')
  }

  return { clientId, clientSecret: clientSecret || undefined }
}

/**
 * 发送 GitHub OAuth 表单请求
 */
async function githubOAuthRequest<T>(url: string, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(params)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GitHub OAuth error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * 发送 GitHub API 请求
 */
async function githubRequest<T>(
  endpoint: string,
  token: string,
  method: string = 'GET',
  body?: unknown
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_BASE}${endpoint}`

  const response = await fetch(url, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GitHub API error: ${response.status} - ${error}`)
  }

  return response.json()
}

/**
 * 注册 GitHub Actions IPC handlers
 */
export function registerGitHubHandlers() {
  // 获取仓库信息
  ipcMain.handle('github:getRepoInfo', async (_event, repoPath: string) => {
    return await getRepoInfo(repoPath)
  })

  // OAuth 设备码登录
  ipcMain.handle('github:oauthStartDeviceFlow', async (_event, scopes?: string[]) => {
    const { clientId } = getOAuthClientConfig()
    const scope = (scopes && scopes.length > 0)
      ? scopes.join(' ')
      : 'repo workflow read:user'

    return await githubOAuthRequest<GitHubDeviceCodeResponse>(
      GITHUB_OAUTH_DEVICE_CODE_URL,
      {
        client_id: clientId,
        scope
      }
    )
  })

  // OAuth 设备码轮询
  ipcMain.handle('github:oauthPollDeviceFlow', async (_event, deviceCode: string) => {
    const { clientId, clientSecret } = getOAuthClientConfig()
    return await githubOAuthRequest<GitHubDeviceTokenResponse>(
      GITHUB_OAUTH_TOKEN_URL,
      {
        client_id: clientId,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      }
    )
  })

  // 获取 workflows
  ipcMain.handle('github:getWorkflows', async (
    _event,
    repoPath: string,
    token?: string
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    const response = await githubRequest<{ workflows: GitHubWorkflow[] }>(
      `/repos/${repoInfo.owner}/${repoInfo.repo}/actions/workflows`,
      resolvedToken
    )

    return response.workflows
  })

  // 获取 workflow runs
  ipcMain.handle('github:getWorkflowRuns', async (
    _event,
    repoPath: string,
    token?: string,
    workflowId?: number,
    perPage: number = 20
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    let endpoint = `/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs?per_page=${perPage}`
    if (workflowId) {
      endpoint = `/repos/${repoInfo.owner}/${repoInfo.repo}/actions/workflows/${workflowId}/runs?per_page=${perPage}`
    }

    const response = await githubRequest<{ workflow_runs: GitHubWorkflowRun[] }>(
      endpoint,
      resolvedToken
    )

    return response.workflow_runs
  })

  // 获取 workflow jobs
  ipcMain.handle('github:getWorkflowJobs', async (
    _event,
    repoPath: string,
    runId: number,
    token?: string
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    const response = await githubRequest<{ jobs: GitHubWorkflowJob[] }>(
      `/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs/${runId}/jobs`,
      resolvedToken
    )

    return response.jobs
  })

  // 触发 workflow
  ipcMain.handle('github:triggerWorkflow', async (
    _event,
    repoPath: string,
    workflowId: number | string,
    ref: string = 'main',
    inputs?: Record<string, string>,
    token?: string
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    await githubRequest(
      `/repos/${repoInfo.owner}/${repoInfo.repo}/actions/workflows/${workflowId}/dispatches`,
      resolvedToken,
      'POST',
      { ref, inputs }
    )

    return { success: true }
  })

  // 取消 workflow run
  ipcMain.handle('github:cancelWorkflowRun', async (
    _event,
    repoPath: string,
    runId: number,
    token?: string
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    await githubRequest(
      `/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs/${runId}/cancel`,
      resolvedToken,
      'POST'
    )

    return { success: true }
  })

  // 重新运行 workflow
  ipcMain.handle('github:rerunWorkflow', async (
    _event,
    repoPath: string,
    runId: number,
    token?: string
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    await githubRequest(
      `/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs/${runId}/rerun`,
      resolvedToken,
      'POST'
    )

    return { success: true }
  })

  // 获取 workflow run 日志 URL
  ipcMain.handle('github:getWorkflowRunLogsUrl', async (
    _event,
    repoPath: string,
    runId: number,
    token?: string
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    // 获取日志下载 URL (会重定向)
    const url = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}/actions/runs/${runId}/logs`

    return { url, token: resolvedToken }
  })

  // ============ Pull Requests ============

  // 列出 PRs
  ipcMain.handle('github:listPRs', async (
    _event,
    repoPath: string,
    token?: string,
    state: 'open' | 'closed' | 'all' = 'open',
    perPage: number = 30
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    const response = await githubRequest<any[]>(
      `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls?state=${state}&per_page=${perPage}`,
      resolvedToken
    )

    return response
  })

  // 创建 PR
  ipcMain.handle('github:createPR', async (
    _event,
    repoPath: string,
    title: string,
    body: string,
    head: string,
    base: string,
    token?: string
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    const response = await githubRequest<any>(
      `/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`,
      resolvedToken,
      'POST',
      { title, body, head, base }
    )

    return response
  })

  // ============ Issues ============

  // 列出 Issues
  ipcMain.handle('github:listIssues', async (
    _event,
    repoPath: string,
    token?: string,
    state: 'open' | 'closed' | 'all' = 'open',
    perPage: number = 30
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    const response = await githubRequest<any[]>(
      `/repos/${repoInfo.owner}/${repoInfo.repo}/issues?state=${state}&per_page=${perPage}`,
      resolvedToken
    )

    return response
  })

  // 创建 Issue
  ipcMain.handle('github:createIssue', async (
    _event,
    repoPath: string,
    title: string,
    body: string,
    labels?: string[],
    token?: string
  ) => {
    const repoInfo = await getRepoInfo(repoPath)
    if (!repoInfo) {
      throw new Error('Cannot determine GitHub repository from remote URL')
    }

    const resolvedToken = await getToken(token, repoPath)
    if (!resolvedToken) {
      throw new Error('GitHub token not found. Please configure it in settings.')
    }

    const response = await githubRequest<any>(
      `/repos/${repoInfo.owner}/${repoInfo.repo}/issues`,
      resolvedToken,
      'POST',
      { title, body, ...(labels ? { labels } : {}) }
    )

    return response
  })
}
