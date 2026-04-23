import { useConfigStore } from '@/stores/config'

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

/** 获取模型列表 —— 不过滤,返回所有模型(含 -2k / -4k 变体) */
export async function fetchModels(): Promise<ModelInfo[]> {
  const resp = await fetch(`${base()}/v1/models`, { headers: headers() })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  return (data.data || []).map((m: any) => ({
    id: m.id as string,
    description: (m.description || '') as string,
    type: (m.id?.includes('image') ? 'image' : 'chat') as string,
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
    throw new Error(`HTTP ${resp.status}: ${e}`)
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
    throw new Error(`HTTP ${resp.status}: ${e}`)
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
    throw new Error(`HTTP ${resp.status}: ${e}`)
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
