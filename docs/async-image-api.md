# NewAPI 图片异步接口 — 对接说明

## 概述

NewAPI 已支持图片生成异步模式。客户端通过 `wait: false` 提交任务后秒回 `task_id`，然后轮询查询结果，避免长时间等待超时。

---

## 接口说明

### 1. 提交异步任务

和同步模式用**同一个接口**，只需加 `"wait": false`。

```
POST /v1/images/generations
Authorization: Bearer {USER_API_KEY}
Content-Type: application/json
```

**请求体：**

```json
{
  "model": "gpt-image-2",
  "prompt": "A cute orange cat sitting on a desk",
  "n": 1,
  "size": "1024x1024",
  "response_format": "b64_json",
  "wait": false
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `model` | 是 | 模型名称 |
| `prompt` | 是 | 图片描述 |
| `wait` | 否 | `false` = 异步模式（秒回 task_id）；不传或 `true` = 同步模式（等待生成完毕） |
| 其他字段 | 否 | `n`, `size`, `quality`, `response_format` 等和同步模式一样 |

**响应 202 Accepted（秒回）：**

```json
{
  "task_id": "img_xxxxxxxx",
  "status": "dispatched",
  "message": "任务已提交,请通过 GET /v1/images/tasks/img_xxxxxxxx 查询结果"
}
```

> **注意**：异步模式返回 HTTP 状态码 `202`，不是 `200`。

---

### 2. 查询任务结果

```
GET /v1/images/tasks/{task_id}
Authorization: Bearer {USER_API_KEY}
```

> 用提交任务时**同一个 API Key** 查询，不需要额外参数。

**进行中：**

```json
{
  "task_id": "img_xxxxxxxx",
  "status": "running"
}
```

**成功（HTTP 200）：**

```json
{
  "task_id": "img_xxxxxxxx",
  "status": "success",
  "data": [
    {
      "b64_json": "/9j/4AAQ...",
      "file_id": "file-xxx"
    }
  ]
}
```

**失败：**

```json
{
  "task_id": "img_xxxxxxxx",
  "status": "failed",
  "error": "content_policy_violation"
}
```

**状态流转：** `queued → dispatched → running → success / failed`

---

## 调用流程

```
客户端                          NewAPI                          上游
  │                               │                              │
  │  POST /v1/images/generations  │                              │
  │  { ..., "wait": false }       │                              │
  │ ─────────────────────────────>│  透传请求（含 wait:false）    │
  │                               │ ────────────────────────────>│
  │                               │  202 { task_id: "img_xxx" }  │
  │                               │ <────────────────────────────│
  │  202 { task_id: "img_xxx" }   │                              │
  │ <─────────────────────────────│                              │
  │                               │                              │
  │  (等待 3~5 秒)                │                              │
  │                               │                              │
  │  GET /v1/images/tasks/img_xxx │                              │
  │ ─────────────────────────────>│  代理到上游                  │
  │                               │ ────────────────────────────>│
  │                               │  { status: "running" }       │
  │  { status: "running" }        │ <────────────────────────────│
  │ <─────────────────────────────│                              │
  │                               │                              │
  │  (继续轮询，每 4 秒一次)      │                              │
  │                               │                              │
  │  GET /v1/images/tasks/img_xxx │                              │
  │ ─────────────────────────────>│                              │
  │                               │ ────────────────────────────>│
  │                               │  { status:"success", data }  │
  │  { status:"success", data }   │ <────────────────────────────│
  │ <─────────────────────────────│                              │
```

---

## 计费

- **提交时扣费**：和同步模式一致，提交任务时即扣除费用
- 查询接口（GET）**不计费**
- 如果任务最终失败（上游返回 `status: "failed"`），已扣费用**不退还**

---

## 前端对接参考代码

```javascript
async function generateImageAsync(apiKey, prompt, options = {}) {
  const baseUrl = ''; // 同域，留空

  // 1. 提交异步任务
  const submitResp = await fetch(`${baseUrl}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || 'gpt-image-2',
      prompt,
      n: options.n || 1,
      size: options.size || '1024x1024',
      response_format: options.response_format || 'b64_json',
      wait: false,  // 关键：异步模式
    }),
  });

  if (submitResp.status !== 202) {
    throw new Error(`提交失败: ${submitResp.status}`);
  }

  const { task_id } = await submitResp.json();
  console.log('任务已提交:', task_id);

  // 2. 轮询结果
  const maxAttempts = 120;  // 最多轮询 120 次（约 8 分钟）
  const interval = 4000;    // 每 4 秒查一次

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, interval));

    const queryResp = await fetch(`${baseUrl}/v1/images/tasks/${task_id}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const result = await queryResp.json();

    if (result.status === 'success') {
      return result.data;  // 返回图片数据
    }

    if (result.status === 'failed') {
      throw new Error(`生成失败: ${result.error || '未知错误'}`);
    }

    // status 为 queued / dispatched / running，继续轮询
    console.log(`轮询中 (${i + 1}/${maxAttempts}): ${result.status}`);
  }

  throw new Error('轮询超时');
}
```

---

## curl 测试

```bash
# 1. 提交异步任务
curl -X POST "${NEWAPI_URL}/v1/images/generations" \
  -H "Authorization: Bearer ${USER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-2","prompt":"a cat","wait":false}'

# 应返回 HTTP 202 + { task_id, status }

# 2. 查询任务
curl "${NEWAPI_URL}/v1/images/tasks/${TASK_ID}" \
  -H "Authorization: Bearer ${USER_KEY}"

# 应返回 { status, data（成功时） }
```

---

## 注意事项

1. **同步模式完全不受影响**：不传 `wait` 或 `wait: true` 时，行为和之前一样
2. **必须用同一个 API Key**：提交和查询必须用同一个 Key，否则会返回 403
3. **task_id 有效期 24 小时**：超过 24 小时未查询的任务映射会被自动清理
4. **仅支持特定渠道**：只有上游支持异步模式的渠道（返回 202）才会走异步流程
5. **HTTP 状态码**：异步提交返回 `202`，前端需要判断 `202` 而不是 `200`
