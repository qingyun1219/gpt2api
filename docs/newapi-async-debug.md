# NewAPI 异步图片接口排查 — `wait` 字段未透传

## 问题现象

前端请求 `POST /v1/images/generations` 时已携带 `"wait": false`，但 NewAPI 返回的是 **HTTP 200**（同步等待生成完毕后才返回），而不是预期的 **HTTP 202**（秒回 task_id）。

说明 `wait` 字段在 NewAPI 转发给上游时被丢弃了，上游没收到这个参数，走了同步模式。

## 前端实际发送的请求体

```json
{
  "model": "gpt-image-2",
  "prompt": "A cute cat",
  "n": 1,
  "size": "1024x1024",
  "response_format": "b64_json",
  "wait": false
}
```

## 预期行为

| 步骤 | 预期 | 实际 |
|------|------|------|
| POST 到 NewAPI | NewAPI 透传给上游（含 `wait: false`） | ✅ 请求到达了 |
| 上游收到 `wait: false` | 返回 **202** + `{ task_id, status }` | ❌ 返回了 200 + data（同步） |
| NewAPI 返回给前端 | **202** + `{ task_id, status }` | ❌ 返回了 200 + data |
| 前端轮询 | `GET /v1/images/tasks/{task_id}` | ❌ 没有轮询（因为没拿到 task_id） |

## 最可能的原因

请求体在 NewAPI 内部经过了 **unmarshal → marshal** 转发，struct 中没有 `Wait` 字段，导致转发时被丢弃。

### 排查方法

在 NewAPI 转发图片请求的代码中（通常在 `relay/channel/openai/image.go` 或类似位置），搜索处理 `/v1/images/generations` 请求体的 struct，类似：

```go
type ImageRequest struct {
    Model          string `json:"model"`
    Prompt         string `json:"prompt"`
    N              int    `json:"n,omitempty"`
    Size           string `json:"size,omitempty"`
    Quality        string `json:"quality,omitempty"`
    ResponseFormat string `json:"response_format,omitempty"`
    // ... 其他字段
}
```

**如果没有 `Wait` 字段，转发时就会被丢弃。**

### 修复方案

#### 方案 A：struct 加字段（推荐）

```go
type ImageRequest struct {
    // ... 已有字段
    Wait *bool `json:"wait,omitempty"`  // 新增
}
```

用 `*bool` 而不是 `bool`，这样不传时 omitempty 会省略，传 `false` 时能正确序列化为 `"wait": false`。

#### 方案 B：原样透传 body

如果不想改 struct，可以直接把原始请求 body 透传给上游，不做 unmarshal：

```go
// 读取原始 body
bodyBytes, _ := io.ReadAll(c.Request.Body)

// 直接转发给上游
upstreamReq, _ := http.NewRequest("POST", upstreamURL, bytes.NewReader(bodyBytes))
upstreamReq.Header.Set("Content-Type", "application/json")
upstreamReq.Header.Set("Authorization", "Bearer " + channelKey)
```

### 额外注意：HTTP 状态码透传

修复 `wait` 透传后，上游会返回 **HTTP 202**。NewAPI 需要把这个 202 原样返回给前端，不能强制改成 200。

检查转发响应的代码，确保：

```go
// ✅ 正确：使用上游的 status code
c.Data(upstreamResp.StatusCode, "application/json", body)

// ❌ 错误：强制 200
c.JSON(200, result)
```

## 验证

修复后用 curl 测试：

```bash
curl -i -X POST "https://cc.jispul.com/v1/images/generations" \
  -H "Authorization: Bearer sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-2","prompt":"a cat","wait":false}'
```

预期结果：

```
HTTP/2 202                          ← 状态码 202，不是 200
content-type: application/json

{
  "task_id": "img_xxxxxxxx",        ← 有 task_id
  "status": "dispatched"
}
```

如果还是返回 200 + 完整图片数据，说明 `wait` 仍然没到达上游。

## 同时确认轮询接口

```bash
curl "https://cc.jispul.com/v1/images/tasks/img_xxxxxxxx" \
  -H "Authorization: Bearer sk-xxx"
```

应返回任务状态（running/success/failed）。如果返回 404，说明轮询路由还没注册。
