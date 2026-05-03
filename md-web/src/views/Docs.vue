<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
const router = useRouter()
const config = useConfigStore()
</script>

<template><div class="docs">
  <header class="nav"><div class="nav-in">
    <a class="logo" @click="router.push('/')">
      <svg class="lo-i" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>
      <span class="lo-t">AI Studio</span>
    </a>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="nav-btn-icon" @click="config.dark=!config.dark" :title="config.dark?'切换浅色模式':'切换深色模式'">
        <svg v-if="config.dark" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      <button class="nav-btn-primary" @click="router.push('/play')">
        工作台
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </div>
  </div></header>

  <main class="doc-body">
    <h1 class="doc-title">📖 API 开发文档</h1>
    <p class="doc-intro">所有接口兼容 OpenAI 格式，设置 <code>base_url</code> 和 <code>Authorization: Bearer YOUR_KEY</code> 即可调用。</p>

    <section class="card">
      <h2>可用模型</h2>
      <table class="tb"><thead><tr><th>模型 ID</th><th>说明</th></tr></thead><tbody>
        <tr><td><code>gpt-image-2</code></td><td>GPT Image 2 标准版（1024px）</td></tr>
        <tr><td><code>gpt-image-2-2k</code></td><td>自动 2K 放大（长边 2560px）</td></tr>
        <tr><td><code>gpt-image-2-4k</code></td><td>自动 4K 放大（长边 3840px）</td></tr>
        <tr><td><code>gemini-3.1-flash-image</code></td><td>Gemini Flash 生图（走 chat/completions）</td></tr>
      </tbody></table>
    </section>

    <section class="card"><h2>① 文生图</h2>
      <p class="ep">POST <code>/v1/images/generations</code></p>
      <pre class="code">{
  "model": "gpt-image-2",
  "prompt": "A cute orange cat on a windowsill",
  "n": 1,
  "size": "1024x1024"
}</pre>
      <p class="note">size 可选：<code>1024x1024</code>　<code>1792x1024</code>（16:9）　<code>1024x1792</code>（9:16）</p>
    </section>

    <section class="card"><h2>② 图生图（multipart）</h2>
      <p class="ep">POST <code>/v1/images/edits</code>　<span class="tag">multipart/form-data</span></p>
      <pre class="code">curl -X POST "${BASE_URL}/v1/images/edits" \
  -H "Authorization: Bearer ${API_KEY}" \
  -F "model=gpt-image-2" \
  -F "prompt=把猫咪变成卡通风格" \
  -F "image=@photo.png" \
  -F "n=1" -F "size=1024x1024"</pre>
      <p class="note">支持多张参考图（最多 4 张）：重复 <code>-F "image=@xxx.png"</code></p>
    </section>

    <section class="card"><h2>③ 图生图（JSON）</h2>
      <p class="ep">POST <code>/v1/images/generations</code>　+ <code>reference_images</code></p>
      <pre class="code">{
  "model": "gpt-image-2",
  "prompt": "根据参考图生成卡通版本",
  "reference_images": [
    "data:image/png;base64,iVBORw0KGgo...",
    "https://example.com/photo.jpg"
  ]
}</pre>
      <p class="note">每项支持：data URL / https URL / 纯 base64 字符串</p>
    </section>

    <section class="card"><h2>④ 异步模式</h2>
      <p class="ep">POST <code>/v1/images/generations</code>　+ <code>"wait": false</code></p>
      <p class="note">默认同步阻塞（1~5 分钟），设置 <code>"wait": false</code> 可立即返回 task_id，后台异步生成。</p>
      <h3>第 1 步：提交任务</h3>
      <pre class="code">{
  "model": "gpt-image-2",
  "prompt": "A futuristic city at sunset",
  "wait": false
}
// → 202 Accepted
{
  "task_id": "img_xxxxxxxx",
  "status": "dispatched",
  "message": "任务已提交,请通过 GET /v1/images/tasks/img_xxxxxxxx 查询结果"
}</pre>
      <h3>第 2 步：轮询结果</h3>
      <p class="ep">GET <code>/v1/images/tasks/{task_id}</code></p>
      <pre class="code">// → 200 OK
{
  "task_id": "img_xxxxxxxx",
  "status": "success",       // queued → dispatched → running → success / failed
  "data": [
    { "url": "/p/img/img_xxxxxxxx/0?...", "file_id": "..." }
  ],
  "error": ""
}</pre>
      <p class="note">建议每 3~5 秒轮询一次。status 为 <code>success</code> 或 <code>failed</code> 时停止。</p>
    </section>

    <section class="card"><h2>⑤ 通过 chat 接口生图</h2>
      <p class="ep">POST <code>/v1/chat/completions</code></p>
      <p class="note">支持 Gemini 生图和 GPT Image 生图，统一走 chat 接口。model 设为图片模型即可。</p>
      <pre class="code">{
  "model": "gpt-image-2",
  "stream": false,
  "messages": [{ "role": "user", "content": "画一只在月光下的狼" }]
}</pre>
      <p class="note">也支持 <code>gemini-3.1-flash-image</code>。返回标准 ChatCompletion 格式，图片以 markdown data URL 嵌入 content。</p>
    </section>

    <section class="card"><h2>⑥ 响应格式</h2>
      <h3>/v1/images/generations · /v1/images/edits</h3>
      <pre class="code">{
  "created": 1234567890,
  "task_id": "img_xxxxxxxx",
  "data": [{ "b64_json": "/9j/4AAQ...", "file_id": "..." }]
}</pre>
      <h3>/v1/chat/completions（图片模型）</h3>
      <pre class="code">{
  "id": "chatcmpl-img-img_xxxxxxxx",
  "object": "chat.completion",
  "model": "gpt-image-2",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "![image_0](data:image/png;base64,iVBOR...)"
    },
    "finish_reason": "stop"
  }],
  "usage": { "prompt_tokens": 10, "completion_tokens": 1, "total_tokens": 11 },
  "data": [{ "b64_json": "iVBOR...", "file_id": "..." }]
}</pre>
      <p class="note">图片在 <code>choices[0].message.content</code> 中以 markdown data URL 返回。同时 <code>data</code> 字段也保留，可按任一方式取图。</p>
    </section>

    <section class="card"><h2>⑦ 错误码参考</h2>
      <p class="note">错误返回 OpenAI 格式：<code>{"error":{"code":"xxx","message":"..."}}</code></p>
      <table class="tb"><thead><tr><th>错误码</th><th>HTTP</th><th>含义</th><th>建议</th></tr></thead><tbody>
        <tr><td><code>no_available_account</code></td><td>503</td><td>账号池暂无可用账号</td><td>等 30s 重试</td></tr>
        <tr><td><code>rate_limited</code></td><td>503</td><td>上游限流</td><td>等 30s 重试</td></tr>
        <tr><td><code>rate_limit_rpm</code></td><td>429</td><td>触发每分钟请求数限制</td><td>降低频率</td></tr>
        <tr><td><code>insufficient_balance</code></td><td>402</td><td>积分不足</td><td>充值</td></tr>
        <tr><td><code>model_not_allowed</code></td><td>403</td><td>Key 无权调用该模型</td><td>联系管理员</td></tr>
        <tr><td><code>model_not_found</code></td><td>400</td><td>模型不存在或已下架</td><td>检查 model 字段</td></tr>
        <tr><td><code>upstream_error</code></td><td>502</td><td>上游服务返回错误</td><td>重试</td></tr>
        <tr><td><code>poll_timeout</code></td><td>502</td><td>图片生成超时</td><td>重试</td></tr>
        <tr><td><code>network_transient</code></td><td>502</td><td>网络波动</td><td>自动重试</td></tr>
        <tr><td><code>auth_required</code></td><td>502</td><td>上游鉴权失败</td><td>自动换号重试</td></tr>
        <tr><td><code>download_failed</code></td><td>502</td><td>图片下载失败</td><td>重试</td></tr>
        <tr><td><code>invalid_response</code></td><td>502</td><td>上游返回数据异常</td><td>重试</td></tr>
        <tr><td><code>invalid_request_error</code></td><td>400</td><td>请求参数有误</td><td>检查请求体</td></tr>
        <tr><td><code>invalid_reference_image</code></td><td>400</td><td>参考图解析失败</td><td>检查图片格式/大小</td></tr>
        <tr><td><code>billing_error</code></td><td>500</td><td>计费系统异常</td><td>联系管理员</td></tr>
      </tbody></table>
    </section>
  </main>
</div></template>

<style scoped lang="scss">
.docs{min-height:100vh;display:flex;flex-direction:column;background:var(--bg)}
.nav{position:sticky;top:0;z-index:50;padding:16px 0;background:var(--nav-bg);border-bottom:1px solid var(--border);backdrop-filter:saturate(180%) blur(20px)}
.nav-in{max-width:900px;margin:0 auto;padding:0 32px;display:flex;align-items:center;justify-content:space-between}
.logo{display:inline-flex;align-items:center;gap:10px;cursor:pointer;text-decoration:none;color:var(--text);transition:opacity 0.2s}
.logo:hover{opacity:0.8}
.lo-i{color:var(--primary)}
.lo-t{font-size:18px;font-weight:700;letter-spacing:-0.5px}

.nav-btn-icon{width:36px;height:36px;border-radius:50%;border:1px solid transparent;background:transparent;color:var(--text-soft);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s}
.nav-btn-icon:hover{background:var(--bg-soft);color:var(--text)}
.nav-btn-primary{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;border-radius:18px;border:none;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(var(--primary-rgb),0.2)}
.nav-btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(var(--primary-rgb),0.3)}
.doc-body{max-width:900px;width:100%;margin:0 auto;padding:48px 32px 80px}
.doc-title{font-size:32px;font-weight:800;letter-spacing:-1px;margin-bottom:12px}
.doc-intro{font-size:16px;color:var(--text-soft);line-height:1.7;margin-bottom:40px;
  code{background:var(--bg-soft);padding:2px 8px;border-radius:6px;font-size:14px;border:1px solid var(--border)}}
.card{background:var(--bg-card-solid);border:1px solid var(--border);border-radius:16px;padding:28px;margin-bottom:24px;
  h2{font-size:18px;font-weight:700;margin:0 0 16px;letter-spacing:-.3px}
  h3{font-size:15px;font-weight:600;margin:20px 0 8px;color:var(--text-soft)}}
.ep{font-size:14px;margin-bottom:12px;color:var(--text-soft);
  code{background:var(--bg-soft);padding:3px 10px;border-radius:6px;font-size:13px;color:var(--primary);border:1px solid var(--border);font-weight:600}}
.tag{display:inline-block;font-size:11px;padding:2px 8px;border-radius:4px;background:var(--primary-soft);color:var(--primary);font-weight:600;vertical-align:middle}
.code{background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;padding:16px 20px;font-size:13px;line-height:1.7;overflow-x:auto;color:var(--text-soft);font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace;white-space:pre;margin:8px 0}
.note{font-size:14px;color:var(--text-mute);margin:8px 0 0;line-height:1.6;
  code{background:var(--bg-soft);padding:1px 6px;border-radius:4px;font-size:13px;border:1px solid var(--border)}}
.tb{width:100%;border-collapse:collapse;font-size:14px;
  th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--border)}
  th{font-weight:600;color:var(--text);background:var(--bg-soft);font-size:12px;text-transform:uppercase;letter-spacing:.05em}
  td code{background:var(--bg-soft);padding:2px 8px;border-radius:6px;font-size:12px;color:var(--primary);border:1px solid var(--border)}
  tr:last-child td{border-bottom:none}}
@media(max-width:600px){.doc-body{padding:24px 16px 60px}}
</style>
