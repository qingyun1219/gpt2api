# gpt2api `/v1/images/generations` 接口行为说明

> 供 NewAPI 等中转层对接扣费逻辑参考。  
> 基于 gpt2api 源码确认，非猜测。

---

## Q1: 成功时是否必定返回 `data[].url` 或 `data[].b64_json`？

**是。成功时必定返回 `data[].b64_json`，不会返回 `data[].url`。**

后端会把 ChatGPT 内部的签名 URL 下载为原始字节 → base64 编码后填入 `b64_json`，
不暴露任何上游域名。`/v1/images/edits` 行为完全相同。

### 成功响应示例

```
HTTP 200 OK
Content-Type: application/json
```

```json
{
  "created": 1715000000,
  "data": [
    {
      "b64_json": "/9j/4AAQSkZJRgABAQ...(完整 base64 图片数据)",
      "file_id": "file_00000000abcd1234efgh5678"
    }
  ]
}
```

| 字段 | 是否必有 | 说明 |
|---|---|---|
| `created` | ✅ | Unix 时间戳 |
| `data` | ✅ | 数组，长度 = 请求参数 `n`（通常为 1） |
| `data[].b64_json` | ✅ | 完整 base64 编码的图片（PNG），**永远不为空字符串** |
| `data[].url` | ❌ 永远不存在 | 后端强制走 b64_json，不暴露 URL |
| `data[].file_id` | 可选 | ChatGPT 侧原始文件 ID，仅用于对账，可忽略（`omitempty`） |
| `data[].revised_prompt` | 可选 | 上游修改后的 prompt（`omitempty`，当前一般为空） |
| `task_id` | 可选 | gpt2api 内部任务 ID，可忽略 |

**关键保证：如果 HTTP 200，`data` 数组非空且每个元素的 `b64_json` 都有内容。不存在"HTTP 200 但 data 为空"的情况。**

---

## Q2: 失败时是否必定返回 `error` 字段？

**是。失败时 100% 返回标准 OpenAI `error` 格式，没有任何例外路径。**

所有失败都由同一个函数 `openAIError()` 输出，结构固定。

### 失败响应示例

```
HTTP 502 Bad Gateway
Content-Type: application/json
```

```json
{
  "error": {
    "message": "图片生成失败(poll_timeout):poll timeout: no image produced within deadline",
    "type": "invalid_request_error",
    "code": "poll_timeout"
  }
}
```

| 字段 | 是否必有 | 说明 |
|---|---|---|
| `error` | ✅ | 顶层错误对象 |
| `error.message` | ✅ | 人类可读的中文错误描述 |
| `error.type` | ✅ | **固定值** `"invalid_request_error"` |
| `error.code` | ✅ | 机器可读的错误码（见下表） |

### 完整错误码 → HTTP 状态码映射

| `error.code` | HTTP Status | 含义 | 是否可重试 |
|---|---|---|---|
| `no_available_account` | **503** | 账号池无可用账号 | 是，稍后重试 |
| `rate_limited` | **503** | 上游风控/限流 | 是，稍后重试 |
| `upstream_error` | **502** | 上游通用错误 | 是 |
| `poll_timeout` | **502** | 轮询超时（300s 内未出图） | 是 |
| `content_policy` | **502** | 上游内容策略拒绝出图 | 否，换 prompt |
| `download_failed` | **502** | 图片生成成功但最终下载失败 | 是 |
| `auth_required` | **502** | 账号鉴权失败 | 是（自动换号） |
| `pow_timeout` | **502** | PoW 验证超时 | 是 |
| `pow_failed` | **502** | PoW 验证失败 | 是 |
| `network_transient` | **502** | 瞬态网络错误（EOF/reset） | 是 |
| `invalid_response` | **502** | 上游返回了无法解析的响应 | 是 |

---

## Q3: ChatGPT 内部 `file_id` / `file-service://` / `sediment://` 对外怎么返回？

**调用方永远看不到这些内部标识。** 后端会将其转换为最终图片字节再返回。

内部处理链路：

```
ChatGPT SSE / Poll 返回:
  file-service://file_xxx  或  sediment://file_xxx
          │
          ▼
GET /backend-api/files/{file_id}/download
  → 拿到短期签名 URL (https://files.oaiusercontent.com/...)
          │
          ▼
GET <signed_url>
  → 下载图片原始字节 (PNG)
          │
          ▼
base64 编码 → 填入 data[].b64_json 返回给调用方
```

**边界情况处理：**

| 场景 | 后端行为 | 对外表现 |
|---|---|---|
| 签名 URL 获取成功 + 下载成功 | 正常编码 | HTTP 200, `data[].b64_json` 有值 |
| 签名 URL 获取失败 | 该张图跳过 | 如果全部失败 → HTTP 502 `download_failed` |
| 下载超时/网络错误 | 该张图跳过 | 如果全部失败 → HTTP 502 `download_failed` |
| 请求了 N 张，K 张成功 (0<K<N) | 只返回 K 张 | HTTP 200, `data` 长度 = K |

**唯一例外**：响应中的 `data[].file_id` 字段会暴露原始 file_id（纯 ID 字符串，不含 `file-service://` 前缀）。该字段为 `omitempty`，仅用于对账/排障，NewAPI 可安全忽略。

---

## Q4: 各失败场景的 HTTP status 和 body

### 场景 1：轮询超时（300s 内未出图）

最常见的失败类型。SSE 发起后上游一直没有生成出图片引用。

```
HTTP 502 Bad Gateway
```
```json
{
  "error": {
    "message": "图片生成失败(poll_timeout):poll timeout: no image produced within deadline",
    "type": "invalid_request_error",
    "code": "poll_timeout"
  }
}
```

### 场景 2：下载最终图片失败

上游已经生成了图片（拿到了 file_id），但下载签名 URL 或下载图片字节时失败。
后端已自动退还内部额度。

```
HTTP 502 Bad Gateway
```
```json
{
  "error": {
    "message": "图片生成成功但下载失败,已自动退款,请重试",
    "type": "invalid_request_error",
    "code": "download_failed"
  }
}
```

### 场景 3：上游内容策略拒绝

ChatGPT 拒绝生成该内容（违规 prompt）。

```
HTTP 502 Bad Gateway
```
```json
{
  "error": {
    "message": "很抱歉，我无法生成该图片，因为它违反了关于...(上游原文)",
    "type": "invalid_request_error",
    "code": "content_policy"
  }
}
```

### 场景 4：无可用账号

```
HTTP 503 Service Unavailable
```
```json
{
  "error": {
    "message": "账号池暂无可用账号,请稍后重试",
    "type": "invalid_request_error",
    "code": "no_available_account"
  }
}
```

### 场景 5：上游限流

```
HTTP 503 Service Unavailable
```
```json
{
  "error": {
    "message": "上游风控,请稍后再试:...",
    "type": "invalid_request_error",
    "code": "rate_limited"
  }
}
```

---

## 总结：NewAPI 扣费判断逻辑

```
if HTTP_STATUS == 200:
    扣费（data[].b64_json 必定有图片内容）
else:
    不扣费（body 必定是 {"error":{...}} 格式，无 data 字段）
```

**永远不会出现的情况：**
- ❌ HTTP 200 但 `data` 为空数组
- ❌ HTTP 200 但 `data[].b64_json` 为空字符串
- ❌ HTTP 非 200 但 body 里有 `data` 字段
- ❌ HTTP 非 200 但 body 里没有 `error` 字段

---

_最后更新：2026-05-10_
