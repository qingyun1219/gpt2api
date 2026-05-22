# NewAPI 图片异步接口适配方案

## 背景

当前图片生成走同步模式，前端等待上游返回（1~5 分钟），存在以下问题：

- 上游生图耗时长（尤其 2K/4K），**前端/网关超时导致用户看到失败，但上游实际已生成成功**
- 网络波动、用户关页面 → 请求中断，费用已扣但拿不到图
- NewAPI 自身也有请求超时限制（通常 60~120s），同步等 5 分钟不现实

**上游（image.jiyongai.top）已原生支持异步模式**，NewAPI 只需透传即可。

---

## 上游异步接口格式

### 第 1 步：提交任务（秒回）

异步使用**独立路径** `/v1/images/generations/async`。

```
POST /v1/images/generations/async
Authorization: Bearer {CHANNEL_KEY}
Content-Type: application/json

{
  "model": "gpt-image-2",
  "prompt": "A cute orange cat",
  "n": 1,
  "size": "1024x1024",
  "response_format": "b64_json"
}
```

**响应 202 Accepted（秒回）：**

```json
{
  "task_id": "img_xxxxxxxx",
  "status": "dispatched",
  "message": "任务已提交,请通过 GET /v1/images/tasks/img_xxxxxxxx 查询结果"
}
```

### 第 2 步：轮询结果

```
GET /v1/images/tasks/{task_id}
Authorization: Bearer {CHANNEL_KEY}
```

**进行中：**

```json
{
  "task_id": "img_xxxxxxxx",
  "status": "running"
}
```

**成功：**

```json
{
  "task_id": "img_xxxxxxxx",
  "status": "success",
  "data": [
    { "b64_json": "/9j/4AAQ...", "file_id": "file-xxx" }
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

**status 流转：** `queued → dispatched → running → success / failed`

---

## NewAPI 需要做的改动

### 改动 1：透传 `wait` 字段

确保 `/v1/images/generations` 转发到上游时，**不要丢弃 `wait` 字段**。

如果当前代码是先 unmarshal 到 struct 再 marshal 转发的，需要在 struct 里加上：

```go
type ImageRequest struct {
    // ... 已有字段
    Wait *bool `json:"wait,omitempty"` // 新增：异步模式
}
```

或者直接用 `map[string]interface{}` / `json.RawMessage` 原样透传 body。

### 改动 2：新增任务查询路由

在路由中新增一条 **GET** 路由：

```
GET /v1/images/tasks/:task_id
```

处理逻辑：**鉴权 → 透传到上游 → 原样返回**

```go
// 伪代码参考
func ImageTaskProxy(c *gin.Context) {
    // 1. 鉴权（和 /v1/images/generations 一样，验证 API Key）
    apiKey := getApiKeyFromRequest(c)
    if !validateKey(apiKey) {
        c.JSON(401, gin.H{"error": "invalid api key"})
        return
    }

    // 2. 获取上游渠道信息（找到该 key 对应的图片渠道）
    channel := getChannelForModel(apiKey, "gpt-image-2")
    
    // 3. 转发到上游
    taskID := c.Param("task_id")
    upstreamURL := channel.BaseURL + "/v1/images/tasks/" + taskID
    
    req, _ := http.NewRequest("GET", upstreamURL, nil)
    req.Header.Set("Authorization", "Bearer " + channel.Key)
    
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        c.JSON(502, gin.H{"error": "upstream unreachable"})
        return
    }
    defer resp.Body.Close()

    // 4. 原样返回（包括 status code）
    body, _ := io.ReadAll(resp.Body)
    c.Data(resp.StatusCode, "application/json", body)
}
```

路由注册：

```go
// 和 /v1/images/generations 同组
imageGroup.GET("/tasks/:task_id", authMiddleware, ImageTaskProxy)
```

### 改动 3：计费（可选）

| 方案 | 说明 | 推荐 |
|------|------|------|
| 提交时扣费 | 和现在同步模式一样，`wait:false` 提交时就扣 | ✅ 最简单 |
| 成功时扣费 | 前端轮询到 success 后调扣费接口 | 复杂，需额外接口 |
| 预扣 + 退还 | 提交预扣，failed 时退还 | 最合理但改动大 |

**建议先用「提交时扣费」**，和现在行为一致，零改动。

---

## 前端调用流程

适配完成后，前端调用方式：

```
1. POST /v1/images/generations  { ..., "wait": false }
   → 秒回 { task_id: "img_xxx", status: "dispatched" }

2. 每 4 秒轮询 GET /v1/images/tasks/img_xxx
   → { status: "running" }     继续轮询
   → { status: "success", data: [...] }  拿到图片
   → { status: "failed", error: "..." }  显示错误
```

---

## 验证方式

适配完成后，可用 curl 测试：

```bash
# 1. 提交异步任务
curl -X POST "${NEWAPI_URL}/v1/images/generations" \
  -H "Authorization: Bearer ${USER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-2","prompt":"a cat","wait":false}'

# 应返回 202 + task_id

# 2. 查询任务
curl "${NEWAPI_URL}/v1/images/tasks/${TASK_ID}" \
  -H "Authorization: Bearer ${USER_KEY}"

# 应返回 status + data（成功时）
```

---

## 总结

| 项 | 工作量 | 说明 |
|----|--------|------|
| 透传 `wait` 字段 | 5 分钟 | struct 加字段 或 原样转发 body |
| 新增 GET 轮询路由 | 30 分钟 | 鉴权 + 透传 + 返回，无业务逻辑 |
| 计费 | 0 | 沿用现有提交时扣费 |
| **合计** | **~30 分钟** | |
