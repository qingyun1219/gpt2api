import { useConfigStore } from '@/stores/config'

/** 错误码 → 中文提示映射 */
const ERROR_LABELS: Record<string, string> = {
  no_available_account: '账号池暂无可用账号，请稍后重试',
  rate_limited: '请求过于频繁，请稍后再试',
  rate_limit_rpm: '触发每分钟请求数限制，请稍后再试',
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
  unknown: '图片生成失败，请重试',
  image_not_wired: '图片能力未开启，请联系管理员',
  invalid_request_error: '请求参数有误',
  invalid_reference_image: '参考图解析失败，请检查图片格式',
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
  // 兜底
  if (status === 402) return '积分不足，请充值后再试'
  if (status === 429) return '请求过于频繁，请稍后再试'
  if (status === 503) return '服务暂时不可用，请稍后重试'
  if (status === 502) return '图片生成失败，请重试'
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

/** 只展示这 4 个生图模型 */
const ALLOWED_MODELS = ['gemini-3.1-flash-image', 'gpt-image-2', 'gpt-image-2-2k', 'gpt-image-2-4k']

/** 获取模型列表 —— 只保留指定的 4 个生图模型 */
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

/** GPT Image 文生图 — /v1/images/generations */
export async function generateImage(
  model: string,
  prompt: string,
  n: number = 1,
  size: string = '1024x1024',
  signal?: AbortSignal,
): Promise<{ imageUrls: string[] }> {
  const body = { model, prompt, n, size }
  const resp = await fetch(`${base()}/v1/images/generations`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body), signal,
  })
  if (!resp.ok) {
    const e = await resp.text()
    throw new Error(parseApiError(resp.status, e))
  }
  const data = await resp.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return { imageUrls: extractImageUrls(data) }
}

/** GPT Image 图生图 — /v1/images/edits (multipart/form-data) */
export async function editImage(
  model: string,
  prompt: string,
  imageDataUrls: string[],
  n: number = 1,
  size: string = '1024x1024',
  signal?: AbortSignal,
): Promise<{ imageUrls: string[] }> {
  const formData = new FormData()
  formData.append('model', model)
  formData.append('prompt', prompt)
  formData.append('n', String(n))
  formData.append('size', size)
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
  return { imageUrls: extractImageUrls(data) }
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

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const resp = await fetch(dataUrl)
  return resp.blob()
}
