# GPT 拒绝生图快速返回方案

## 问题描述

当用户 prompt 触发上游 ChatGPT 内容策略（content policy）时，GPT 不会生成图片，而是返回一段纯文本拒绝回复，例如：

> 很抱歉，我无法生成该图片，因为它违反了关于暴力内容的防护限制。

**现有行为**：系统不知道上游已经拒绝，继续 poll 轮询 conversation，傻等 300 秒超时才返回失败。

**期望行为**：检测到拒绝后 **立即返回**，告知用户具体拒绝原因，不浪费等待时间。

---

## 解决方案概览

在 **SSE 阶段**（而非 poll 阶段）检测 assistant 的纯文本拒绝回复，命中关键词后立即返回 `content_policy` 不可重试错误。

```
正常流程: SSE → 有 image_gen_task_id → poll 等图 → 返回图片
拒绝流程: SSE → 无图片引用 + assistant 纯文本命中拒绝关键词 → 立即返回错误（~30s）
```

---

## 涉及文件与改动

### 1. `internal/upstream/chatgpt/image.go`

#### 1.1 `ImageSSEResult` 新增 `AssistantText` 字段

```go
type ImageSSEResult struct {
    ConversationID string
    FileIDs        []string
    SedimentIDs    []string
    FinishType     string
    ImageGenTaskID string
    AssistantText  string // 新增：assistant 纯文本回复（拒绝时有内容）
}
```

#### 1.2 `ParseImageSSE` 提取 assistant 文本

在 SSE 事件解析循环中，当检测到 `author.role == "assistant"` 且 `content_type == "text"` 时，拼接 `parts` 中的字符串到 `AssistantText`：

```go
// 在 ParseImageSSE 的 JSON 解析部分
if author, _ := msg["author"].(map[string]interface{}); author != nil {
    if role, _ := author["role"].(string); role == "assistant" {
        if ct, _ := content["content_type"].(string); ct == "text" {
            if parts, _ := content["parts"].([]interface{}); len(parts) > 0 {
                for _, p := range parts {
                    if s, ok := p.(string); ok && s != "" {
                        r.AssistantText += s
                    }
                }
            }
        }
    }
}
```

#### 1.3 拒绝关键词列表

```go
var RefusalKeywords = []string{
    "违反了关于",
    "防护限制",
    "内容政策",
    "无法生成该图片",
    "content policy",
    "I can't generate",
    "I'm unable to generate",
    "I'm not able to generate",
    "violates our",
    "couldn't generate",
}
```

### 2. `internal/image/model.go`

新增不可重试错误码：

```go
const ErrContentPolicy = "content_policy"
```

### 3. `internal/image/runner.go`

#### 3.1 SSE 阶段拒绝检测（在 `runOnce` 中）

**位置**：在 `ParseImageSSE` 之后、聚合 fileRefs 之前。

**触发条件**（必须全部满足）：
- `sseResult.AssistantText != ""`（有文本回复）
- `len(sseResult.FileIDs) == 0`（无 file-service 引用）
- `len(sseResult.SedimentIDs) == 0`（无 sediment 引用）
- `sseResult.ImageGenTaskID == ""`（未触发图片生成任务）

```go
if sseResult.AssistantText != "" && len(sseResult.FileIDs) == 0 &&
    len(sseResult.SedimentIDs) == 0 && sseResult.ImageGenTaskID == "" {
    if isRefusalText(sseResult.AssistantText) {
        return false, ErrContentPolicy, fmt.Errorf("%s", sseResult.AssistantText)
    }
}
```

#### 3.2 关键词匹配函数

```go
func isRefusalText(text string) bool {
    for _, kw := range chatgpt.RefusalKeywords {
        if strings.Contains(text, kw) {
            return true
        }
    }
    return false
}
```

### 4. `internal/gateway/images.go`

`localizeImageErr` 中对 `content_policy` 的处理——直接返回上游原文：

```go
case image.ErrContentPolicy:
    if raw != "" {
        return raw  // 直接透传上游拒绝文本
    }
    zh = "上游内容策略拒绝生成此图片"
```

---

## ⚠️ 重要：不要在 Poll 循环中做拒绝检测

早期实现曾在 `PollConversationForImages` 的每一轮循环中调用 `extractAssistantRefusal` 检测拒绝。

**这会导致图生图（img2img）全部失败**，原因：
- 图生图时，GPT 会先发一段正常的 assistant 文本回复（如"好的，我来帮你..."），然后才触发 image_gen tool
- 在图片还没生成完时，poll 每轮都会拉 conversation mapping
- mapping 中已有 assistant 文本消息，但还没有 image_gen tool 消息
- 如果 assistant 的正常回复文本恰好命中某个关键词，就会被误判为拒绝

**正确做法**：拒绝检测只在 SSE 阶段做，且条件极为严格（必须同时无 FileIDs、无 SedimentIDs、无 ImageGenTaskID）。

---

## 效果对比

| 场景 | 修复前 | 修复后 |
|---|---|---|
| GPT 拒绝生图 | 等 300s 超时 → "poll timeout" | ~30s 返回 → 显示具体拒绝原因 |
| 是否换号重试 | 是（浪费配额） | 否（`ErrContentPolicy` 不可重试） |
| 用户看到的信息 | "图片生成失败" | "很抱歉，我无法生成该图片，因为它违反了关于..." |
| 对正常生图的影响 | 无 | 无 |
| 对图生图的影响 | 无 | 无（检测条件排除了有 ImageGenTaskID 的情况） |
