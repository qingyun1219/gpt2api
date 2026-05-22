# NewAPI 图片生成失败仍扣费问题修复

## 问题描述

通过 NewAPI 转发 gpt2api 的 `/v1/images/generations` 和 `/v1/images/edits` 接口时，
即使 gpt2api 返回 **HTTP 502/503**（生成失败），NewAPI 仍然按模型价格扣费。

**表现**：
- gpt2api 管理后台显示任务 `failed`（如 `poll_timeout`）
- gpt2api 已自动退款（内部额度）
- 但 NewAPI 日志显示 **"消费" $0.14**，计费模式 "上游返回"

## 根因

NewAPI 对 `/v1/images/generations` 的计费逻辑与 `/v1/chat/completions` 不同：
- **chat/completions**：解析响应里的 `usage.total_tokens` 字段计费，HTTP 非 200 时无 usage → 不扣费 ✅
- **images/generations**：不解析响应内容，**只要请求发出就按 `模型价格 × n` 扣费** → 失败也扣 ❌

## gpt2api 的错误响应格式（供参考）

**生成失败**时返回：
```
HTTP 502 Bad Gateway  或  HTTP 503 Service Unavailable
```
```json
{
  "error": {
    "message": "上游返回错误:poll timeout: no image produced within deadline",
    "type": "invalid_request_error",
    "code": "upstream_error"
  }
}
```

**生成成功**时返回：
```
HTTP 200 OK
```
```json
{
  "created": 1715000000,
  "data": [
    { "b64_json": "/9j/4AAQ...(base64图片数据)" }
  ]
}
```

## 修复方案

### 方案 A：修改 NewAPI 源码（推荐）

找到 NewAPI 中处理图片生成计费的代码，在扣费前检查 HTTP 状态码。

**关键文件**（以 Calcium-Ion/new-api 为例）：
```
relay/channel/openai/adaptor.go  或
relay/controller/image.go
```

在计费逻辑中加入状态码检查：
```go
// 原逻辑：只要请求完成就扣费
// quota := int(modelRatio * 1000 * n)

// 修复：HTTP 非 200 不扣费
if resp.StatusCode != http.StatusOK {
    // 上游返回错误，不扣费
    return
}
```

### 方案 B：NewAPI 渠道配置调整

如果不想改代码，可以在 NewAPI 后台调整：

1. **模型价格设为 0**：在 NewAPI 的模型定价中，把 `gpt-image-2` 的价格设为 0
   - 优点：简单，失败不扣费
   - 缺点：成功也不扣费（如果你需要 NewAPI 侧也扣费则不适用）

2. **使用"固定额度"模式**：如果 NewAPI 支持，把图片模型改为固定额度扣费模式，
   并依赖 gpt2api 自身的计费系统做扣费/退款

### 方案 C：让 gpt2api 在成功响应中带上 usage 字段

在 `/v1/images/generations` 成功时的响应中添加 `usage` 字段，
让 NewAPI 可以像处理 chat/completions 一样按 usage 计费：

**当前成功响应**：
```json
{"created": 1715000000, "data": [...]}
```

**改造后的成功响应**：
```json
{
  "created": 1715000000,
  "data": [...],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 0,
    "total_tokens": 100
  }
}
```

然后在 NewAPI 侧将图片模型的计费模式改为"按 tokens 计费"。
`prompt_tokens` 可以设为一个固定值（如 100），配合 NewAPI 的模型倍率实现精确扣费。
失败时不返回 usage → NewAPI 不扣费。

> **注意**：方案 C 需要同时修改 gpt2api 和 NewAPI 的配置，但改动最小且最灵活。

## 各错误码与 HTTP 状态码对照表

| gpt2api 错误码 | HTTP 状态码 | 含义 | NewAPI 应扣费？ |
|---|---|---|---|
| （无错误） | 200 | 生成成功 | ✅ 是 |
| `no_account` | 503 | 无可用账号 | ❌ 否 |
| `rate_limited` | 503 | 上游风控 | ❌ 否 |
| `upstream_error` | 502 | 上游错误 | ❌ 否 |
| `poll_timeout` | 502 | 轮询超时 | ❌ 否 |
| `content_policy` | 502 | 内容策略拒绝 | ❌ 否 |
| `download_failed` | 502 | 图片下载失败 | ❌ 否 |

**判断规则很简单：HTTP 200 = 扣费，非 200 = 不扣费。**
