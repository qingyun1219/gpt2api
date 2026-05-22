# NewAPI 异步图片接口 — URL 代理方案

## 问题

异步轮询 `GET /v1/images/tasks/{task_id}` 返回的图片是上游 URL：

```json
{
  "status": "success",
  "data": [{ "url": "https://image.jiyongai.top/p/img/img_xxx/0?exp=...&sig=..." }]
}
```

直接返回会**暴露上游域名**。

## 方案：nginx 反代 + NewAPI 域名替换

### 第 1 步：NewAPI 替换 URL 域名

轮询接口透传上游响应时，把 URL 中的上游域名替换为自己的域名：

```
原始: https://image.jiyongai.top/p/img/img_xxx/0?exp=...&sig=...
替换: https://cc.jispul.com/p/img/img_xxx/0?exp=...&sig=...
```

伪代码：

```go
// 透传轮询结果时做字符串替换
body = bytes.ReplaceAll(body,
    []byte("https://image.jiyongai.top"),
    []byte("https://cc.jispul.com"),
)
c.Data(resp.StatusCode, "application/json", body)
```

NewAPI 只做字符串替换，不下载图片，零内存开销。

### 第 2 步：nginx 加图片反代规则

在 `cc.jispul.com` 的 nginx 配置中加一条：

```nginx
# 代理上游图片（流式转发，不缓存）
location /p/img/ {
    proxy_pass https://image.jiyongai.top;
    proxy_set_header Host image.jiyongai.top;
    proxy_ssl_server_name on;
    proxy_buffering off;
    proxy_cache off;
}
```

客户访问 `https://cc.jispul.com/p/img/xxx` 时，nginx 实时转发到上游，流式传输不占内存。

### 效果

```
客户 GET /v1/images/tasks/{id}
  → 返回 { data: [{ url: "https://cc.jispul.com/p/img/xxx" }] }

客户 GET https://cc.jispul.com/p/img/xxx
  → nginx 转发到 image.jiyongai.top → 流式返回图片
```

- ✅ 不暴露上游域名
- ✅ NewAPI 零内存开销（只替换字符串）
- ✅ nginx 流式转发不缓存
- ✅ 和同步模式带宽消耗一样
