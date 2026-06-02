import { useConfigStore } from '@/stores/config'

/** 错误码 → 中文提示映射（兼容 gpt2api 自有错误码 + newapi 错误码 + 上游错误码） */
const ERROR_LABELS: Record<string, string> = {
  // —— newapi / one-api 常见错误码 ——
  insufficient_quota: '额度不足，请充值后再试',
  invalid_api_key: 'API Key 无效，请检查卡密',
  invalid_authentication: '认证失败，请检查卡密',
  model_permission_denied: '当前 Key 无权调用该模型',
  exceed_quota: '额度已用尽，请充值',
  channel_not_found: '无可用渠道，请稍后重试',
  no_available_channel: '无可用渠道，请稍后重试',
  // —— 上游 / 通用错误码 ——
  no_available_account: '账号池暂无可用账号，请稍后重试',
  rate_limited: '请求过于频繁，请稍后再试',
  rate_limit_rpm: '触发每分钟请求数限制，请稍后再试',
  rate_limit_exceeded: '请求过于频繁，请稍后再试',
  insufficient_balance: '积分不足，请充值后再试',
  billing_error: '计费系统异常',
  model_not_allowed: '当前 API Key 无权调用该模型',
  model_not_found: '模型不存在或已下架',
  upstream_error: '上游服务返回错误，请重试',
  poll_timeout: '图片生成超时，请重试',
  network_transient: '网络波动，请重试',
  pow_timeout: 'POW 验证超时，请重试',
  pow_failed: 'POW 验证失败，请重试',
  turnstile_required: '需要验证码，请重试',
  download_failed: '图片下载失败，请重试',
  invalid_response: '上游返回数据异常，请重试',
  auth_required: '账号鉴权失败，请重试',
  content_policy: '内容策略限制，该提示词被上游拒绝生成',
  content_policy_violation: '内容策略限制，该提示词被上游拒绝生成',
  unknown: '图片生成失败，请重试',
  image_not_wired: '图片能力未开启，请联系管理员',
  invalid_request_error: '请求参数有误',
  invalid_reference_image: '参考图解析失败，请检查图片格式',
  server_error: '服务器内部错误，请重试',
  timeout: '请求超时，请重试',
}

/** 解析后端 OpenAI 格式的错误响应，返回人类可读的错误信息 */
function parseApiError(status: number, body: string): string {
  try {
    const obj = JSON.parse(body)
    const err = obj?.error
    if (err) {
      const code = err.code || err.type || ''
      const msg = err.message || ''
      // content_policy: 直接显示上游原文
      if (code === 'content_policy' && msg) return msg
      // 优先用中文映射
      const zh = ERROR_LABELS[code]
      if (zh) return zh + (msg && !msg.startsWith(zh) ? `（${msg}）` : '')
      // 后端 localizeImageErr 已经返回中文 message 的情况
      if (msg) return msg
    }
  } catch { /* 非 JSON */ }
  // 兜底 HTTP 状态码
  if (status === 401) return 'API Key 无效或已过期'
  if (status === 402) return '积分不足，请充值后再试'
  if (status === 403) return '无权访问，请检查 Key 权限'
  if (status === 429) return '请求过于频繁，请稍后再试'
  if (status === 500) return '服务器内部错误，请重试'
  if (status === 502) return '图片生成失败，请重试'
  if (status === 503) return '服务暂时不可用，请稍后重试'
  if (status === 504) return '请求超时，图片生成耗时较长，请重试'
  return `请求失败 (HTTP ${status})`
}

function headers() {
  const config = useConfigStore()
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
}

function base() {
  return useConfigStore().baseUrl
}

export interface ModelInfo {
  id: string
  description: string
  type: 'image' | 'chat' | string
}

/** 只展示这 2 个生图模型 */
const ALLOWED_MODELS = ['gpt-image-2', 'gemini-3.1-flash-image']

/** 获取模型列表 —— 只保留指定的生图模型 */
export async function fetchModels(): Promise<ModelInfo[]> {
  const resp = await fetch(`${base()}/v1/models`, { headers: headers() })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  return (data.data || [])
    .filter((m: any) => ALLOWED_MODELS.includes(m.id))
    .map((m: any) => ({
      id: m.id as string,
      description: (m.description || '') as string,
      type: 'image' as string,
    }))
}

/** 提交异步生图任务（秒回 task_id） */
export async function submitImageTask(
  model: string,
  prompt: string,
  n: number = 1,
  size: string = '1024x1024',
  quality?: string,
): Promise<{ taskId: string } | { imageUrls: string[] }> {
  const body: Record<string, any> = { model, prompt, n, size, response_format: 'b64_json' }
  if (quality && quality !== '1k') body.upscale = quality
  const resp = await fetch(`${base()}/v1/images/generations/async`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  })
  if (!resp.ok && resp.status !== 202) {
    const e = await resp.text()
    throw new Error(parseApiError(resp.status, e))
  }
  const submit = await resp.json()
  if (submit.error) throw new Error(submit.error.message || JSON.stringify(submit.error))
  // 兜底：如果直接返回了 data（走了同步）
  if (submit.data?.length) return { imageUrls: await extractAndConvertImages(submit) }
  const taskId = submit.task_id
  if (!taskId) throw new Error('未返回 task_id')
  return { taskId }
}

/** 文生图完整流程：提交 + 轮询 */
export async function generateImage(
  model: string,
  prompt: string,
  n: number = 1,
  size: string = '1024x1024',
  signal?: AbortSignal,
  quality?: string,
): Promise<{ imageUrls: string[]; taskId?: string }> {
  const result = await submitImageTask(model, prompt, n, size, quality)
  if ('imageUrls' in result) return { imageUrls: result.imageUrls }
  const poll = await pollTask(result.taskId, signal)
  return { imageUrls: poll.imageUrls, taskId: result.taskId }
}

/** 可重试的错误码 — 上游换号/重试中，继续轮询 */
const RETRYABLE_ERRORS = new Set([
  'auth_required', 'network_transient', 'upstream_error',
  'pow_timeout', 'pow_failed', 'turnstile_required',
  'rate_limited', 'rate_limit_rpm',
])

/** 轮询任务结果：先等 firstWait，之后每 5s 一次 */
const POLL_FIRST_WAIT = 30_000
const POLL_INTERVAL = 5000
const MAX_POLLS = 90
export async function pollTask(taskId: string, signal?: AbortSignal, skipFirstWait = false): Promise<{ imageUrls: string[] }> {
  if (!skipFirstWait) await new Promise(r => setTimeout(r, POLL_FIRST_WAIT))
  let lastError = ''
  let httpFailCount = 0          // 连续 HTTP 非 200 次数
  const MAX_HTTP_FAILS = 10      // 连续 10 次 HTTP 错误就放弃
  for (let i = 0; i < MAX_POLLS; i++) {
    if (signal?.aborted) throw new Error('⏱ 生成超时，请简化描述或减少细节后重试')
    try {
      const resp = await fetch(`${base()}/v1/images/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${useConfigStore().apiKey}` }, signal,
      })
      if (!resp.ok) {
        // HTTP 错误（401/404/502 等）：记录并继续，但连续太多次就放弃
        httpFailCount++
        const body = await resp.text().catch(() => '')
        console.warn(`[poll #${i}] HTTP ${resp.status} (fail ${httpFailCount}/${MAX_HTTP_FAILS}):`, body.slice(0, 200))
        lastError = `HTTP ${resp.status}`
        if (httpFailCount >= MAX_HTTP_FAILS) {
          throw new Error(`生成失败：轮询连续 ${httpFailCount} 次 HTTP ${resp.status}`)
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL))
        continue
      }
      httpFailCount = 0  // 重置连续失败计数

      const result = await resp.json()
      // ---- 成功 ----
      if (result.status === 'success' || result.status === 'succeeded') {
        return { imageUrls: await extractAndConvertImages(result) }
      }
      // ---- 失败/违规 ----
      if (result.status === 'failed' || result.status === 'violated') {
        const errCode = (result.error || '').split(':')[0].trim() || 'unknown'
        if (RETRYABLE_ERRORS.has(errCode)) {
          lastError = result.error || errCode
          // 可重试 → 继续轮询
        } else {
          // 不可重试终态 → 立即中断
          const zh = ERROR_LABELS[errCode]
          throw new Error(zh || `生成失败：${result.error || errCode}`)
        }
      }
      // ---- 其他中间状态（queued/dispatched/running）→ 正常继续轮询 ----
    } catch (e: any) {
      // 明确的业务错误 → 直接抛出，不吞
      if (e?.message?.startsWith('生成失败') || e?.message?.startsWith('内容策略')
        || e?.message?.startsWith('⏱')) throw e
      // 仅 fetch 网络层错误（TypeError: Failed to fetch / AbortError）允许继续轮询
      if (e instanceof TypeError || e?.name === 'AbortError') {
        console.warn(`[poll #${i}] network error:`, e?.message)
        // 继续下一轮
      } else {
        // 未知异常 → 不吞，直接抛
        throw e
      }
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
  throw new Error(lastError ? `生成失败：${lastError}` : '⏱ 轮询超时，请重试')
}

/** GPT Image 图生图 — /v1/images/edits（同步） */
export async function editImage(
  model: string,
  prompt: string,
  imageDataUrls: string[],
  n: number = 1,
  size: string = '1024x1024',
  signal?: AbortSignal,
  quality?: string,
): Promise<{ imageUrls: string[] }> {
  const formData = new FormData()
  formData.append('model', model)
  formData.append('prompt', prompt)
  formData.append('n', String(n))
  formData.append('size', size)
  formData.append('response_format', 'b64_json')
  if (quality && quality !== '1k') formData.append('upscale', quality)
  for (let i = 0; i < imageDataUrls.length; i++) {
    const blob = await dataUrlToBlob(imageDataUrls[i])
    formData.append('image', blob, `ref_${i}.png`)
  }
  const config = useConfigStore()
  const resp = await fetch(`${config.baseUrl}/v1/images/edits`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}` },
    body: formData,
    signal,
  })
  if (!resp.ok) {
    const e = await resp.text()
    throw new Error(parseApiError(resp.status, e))
  }
  const data = await resp.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return { imageUrls: await extractAndConvertImages(data) }
}

/** Gemini 生图 — /v1/chat/completions stream=false */
export async function generateGemini(
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ imageUrls: string[]; text: string }> {
  const msgs = [{ role: 'user', content: prompt }]
  const body = { model, messages: msgs, stream: false }
  const resp = await fetch(`${base()}/v1/chat/completions`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body), signal,
  })
  if (!resp.ok) {
    const e = await resp.text()
    throw new Error(parseApiError(resp.status, e))
  }
  const data = await resp.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  const choice = (data.choices || [])[0]
  const imageUrls: string[] = []
  let text = ''
  if (choice?.message?.images?.length) {
    for (const img of choice.message.images) {
      const url = img.image_url?.url || img.url || ''
      if (url) imageUrls.push(url)
    }
  }
  if (choice?.message?.content) text = choice.message.content
  // 尝试从 content 里提取 markdown 图片
  if (!imageUrls.length && text) {
    const re = /!\[.*?\]\((data:image\/[^)]+)\)/g
    let m
    while ((m = re.exec(text)) !== null) imageUrls.push(m[1])
  }
  return { imageUrls, text }
}

function extractImageUrls(data: any): string[] {
  const urls: string[] = []
  for (const item of data.data || []) {
    if (item.b64_json) urls.push('data:image/png;base64,' + item.b64_json)
    else if (item.url) urls.push(item.url)
  }
  return urls
}

/** 把外部 URL 转成 data URL（base64），失败则返回原 URL */
async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  // 修正上游返回的裸 IP 或旧域名 → 走 newapi 代理
  url = normalizeImageUrl(url)
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15_000)  // 15 秒超时
    const resp = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(url)
      reader.readAsDataURL(blob)
    })
  } catch { return url }
}

/** 把上游裸 IP / 旧域名的图片 URL 替换为走 newapi 代理 */
function normalizeImageUrl(url: string): string {
  // 匹配 /p/img/ 路径，替换 host 为 baseUrl
  const m = url.match(/https?:\/\/[^/]+(\/p\/img\/.+)/)
  if (m) return `${base()}${m[1]}`
  return url
}

/** 提取图片并全部转为 base64 data URL */
async function extractAndConvertImages(data: any): Promise<string[]> {
  const raw = extractImageUrls(data)
  return Promise.all(raw.map(u => urlToDataUrl(u)))
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const resp = await fetch(dataUrl)
  return resp.blob()
}
