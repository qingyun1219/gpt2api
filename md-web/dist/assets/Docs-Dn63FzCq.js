import{h as f,q as v,d as e,a,u as d,e as c,f as i,s as q,k as s,_ as r}from"./index-BlKbLs-u.js";const l={class:"docs"},p={class:"nav"},m={class:"nav-in"},h={style:{display:"flex","align-items":"center",gap:"12px"}},g=["title"],x={key:0,viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"},_={key:1,viewBox:"0 0 24 24",width:"18",height:"18",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"},k=f({__name:"Docs",setup(y){const u=q(),o=v();return(b,t)=>(s(),e("div",l,[a("header",p,[a("div",m,[a("a",{class:"logo",onClick:t[0]||(t[0]=n=>d(u).push("/"))},[...t[3]||(t[3]=[a("svg",{class:"lo-i",viewBox:"0 0 24 24",width:"24",height:"24"},[a("path",{fill:"currentColor",d:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"})],-1),a("span",{class:"lo-t"},"AI Studio",-1)])]),a("div",h,[a("button",{class:"nav-btn-icon",onClick:t[1]||(t[1]=n=>d(o).dark=!d(o).dark),title:d(o).dark?"切换浅色模式":"切换深色模式"},[d(o).dark?(s(),e("svg",x,[...t[4]||(t[4]=[c('<circle cx="12" cy="12" r="5" data-v-af69d637></circle><line x1="12" y1="1" x2="12" y2="3" data-v-af69d637></line><line x1="12" y1="21" x2="12" y2="23" data-v-af69d637></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" data-v-af69d637></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" data-v-af69d637></line><line x1="1" y1="12" x2="3" y2="12" data-v-af69d637></line><line x1="21" y1="12" x2="23" y2="12" data-v-af69d637></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" data-v-af69d637></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" data-v-af69d637></line>',9)])])):(s(),e("svg",_,[...t[5]||(t[5]=[a("path",{d:"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"},null,-1)])]))],8,g),a("button",{class:"nav-btn-primary",onClick:t[2]||(t[2]=n=>d(u).push("/"))},[...t[6]||(t[6]=[i(" 工作台 ",-1),a("svg",{viewBox:"0 0 24 24",width:"16",height:"16",fill:"none",stroke:"currentColor","stroke-width":"2","stroke-linecap":"round","stroke-linejoin":"round"},[a("line",{x1:"5",y1:"12",x2:"19",y2:"12"}),a("polyline",{points:"12 5 19 12 12 19"})],-1)])])])])]),t[7]||(t[7]=c(`<main class="doc-body" data-v-af69d637><h1 class="doc-title" data-v-af69d637>📖 API 开发文档</h1><p class="doc-intro" data-v-af69d637>所有接口兼容 OpenAI 格式，设置 <code data-v-af69d637>base_url</code> 和 <code data-v-af69d637>Authorization: Bearer YOUR_KEY</code> 即可调用。</p><section class="card" data-v-af69d637><h2 data-v-af69d637>可用模型</h2><table class="tb" data-v-af69d637><thead data-v-af69d637><tr data-v-af69d637><th data-v-af69d637>模型 ID</th><th data-v-af69d637>说明</th></tr></thead><tbody data-v-af69d637><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>gpt-image-2</code></td><td data-v-af69d637>GPT Image 2 高清生图（支持 1K / 2K / 4K 输出）</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>gemini-3.1-flash-image</code></td><td data-v-af69d637>Gemini Flash 生图（走 chat/completions）</td></tr></tbody></table><h3 data-v-af69d637>分辨率控制</h3><p class="note" data-v-af69d637>通过 <code data-v-af69d637>size</code> 自动推断输出档位：<code data-v-af69d637>1024x1024</code> / <code data-v-af69d637>1k</code> 为原图，<code data-v-af69d637>2048x2048</code> / <code data-v-af69d637>2k</code> 为 2K，<code data-v-af69d637>4096x4096</code> / <code data-v-af69d637>4k</code> 为 4K。也可显式传 <code data-v-af69d637>upscale</code> 参数覆盖（值：<code data-v-af69d637>2k</code> / <code data-v-af69d637>4k</code>）。</p></section><section class="card" data-v-af69d637><h2 data-v-af69d637>① 文生图</h2><p class="ep" data-v-af69d637>POST <code data-v-af69d637>/v1/images/generations</code></p><pre class="code" data-v-af69d637>{
  &quot;model&quot;: &quot;gpt-image-2&quot;,
  &quot;prompt&quot;: &quot;A cute orange cat playing with yarn, studio ghibli style&quot;,
  &quot;n&quot;: 1,
  &quot;size&quot;: &quot;1024x1024&quot;,
  &quot;response_format&quot;: &quot;b64_json&quot;
}</pre><p class="note" data-v-af69d637>size 可选：<code data-v-af69d637>1024x1024</code>（1K）　<code data-v-af69d637>1792x1024</code>（横屏）　<code data-v-af69d637>1024x1792</code>（竖版）　<code data-v-af69d637>2048x2048</code>（2K）　<code data-v-af69d637>4096x4096</code>（4K）</p><p class="note" data-v-af69d637>画面比例通过 prompt 前缀控制，例如 <code data-v-af69d637>&quot;prompt&quot;: &quot;Make the aspect ratio 16:9 , A cute cat&quot;</code>。支持的比例：auto、1:1、16:9、9:16、5:4、4:5、4:3、3:4、3:2、2:3、21:9。</p><h3 data-v-af69d637>2K / 4K 高清输出示例</h3><pre class="code" data-v-af69d637>{
  &quot;model&quot;: &quot;gpt-image-2&quot;,
  &quot;prompt&quot;: &quot;A beautiful landscape&quot;,
  &quot;size&quot;: &quot;2048x2048&quot;,
  &quot;response_format&quot;: &quot;b64_json&quot;
}
// 或使用 upscale 参数
{
  &quot;model&quot;: &quot;gpt-image-2&quot;,
  &quot;prompt&quot;: &quot;A beautiful landscape&quot;,
  &quot;size&quot;: &quot;1024x1024&quot;,
  &quot;upscale&quot;: &quot;4k&quot;,
  &quot;response_format&quot;: &quot;b64_json&quot;
}</pre></section><section class="card" data-v-af69d637><h2 data-v-af69d637>② 图生图（multipart）</h2><p class="ep" data-v-af69d637>POST <code data-v-af69d637>/v1/images/edits</code>　<span class="tag" data-v-af69d637>multipart/form-data</span></p><pre class="code" data-v-af69d637>curl -X POST &quot;\${BASE_URL}/v1/images/edits&quot; \\
  -H &quot;Authorization: Bearer \${API_KEY}&quot; \\
  -F &quot;model=gpt-image-2&quot; \\
  -F &quot;prompt=Restyle this image as a watercolor painting&quot; \\
  -F &quot;image=@photo.png&quot; \\
  -F &quot;n=1&quot; -F &quot;size=1024x1024&quot;</pre><p class="note" data-v-af69d637>支持多张参考图（最多 4 张，单张最大 20MB）：重复 <code data-v-af69d637>-F &quot;image=@xxx.png&quot;</code>。也可加 <code data-v-af69d637>-F &quot;upscale=2k&quot;</code> 输出高清。</p></section><section class="card" data-v-af69d637><h2 data-v-af69d637>③ 图生图（JSON）</h2><p class="ep" data-v-af69d637>POST <code data-v-af69d637>/v1/images/generations</code>　+ <code data-v-af69d637>reference_images</code></p><pre class="code" data-v-af69d637>{
  &quot;model&quot;: &quot;gpt-image-2&quot;,
  &quot;prompt&quot;: &quot;根据参考图生成卡通版本&quot;,
  &quot;reference_images&quot;: [
    &quot;data:image/png;base64,iVBORw0KGgo...&quot;,
    &quot;https://example.com/photo.jpg&quot;
  ]
}</pre><p class="note" data-v-af69d637>每项支持：data URL / https URL / 纯 base64 字符串</p></section><section class="card" data-v-af69d637><h2 data-v-af69d637>④ 异步生图（推荐）</h2><p class="note" data-v-af69d637>异步模式提交秒回 task_id，通过轮询获取结果，不怕超时和网络波动。</p><h3 data-v-af69d637>第 1 步：提交任务</h3><p class="ep" data-v-af69d637>POST <code data-v-af69d637>/v1/images/generations/async</code></p><pre class="code" data-v-af69d637>{
  &quot;model&quot;: &quot;gpt-image-2&quot;,
  &quot;prompt&quot;: &quot;A futuristic city at sunset&quot;,
  &quot;n&quot;: 1,
  &quot;size&quot;: &quot;1024x1024&quot;,
  &quot;response_format&quot;: &quot;b64_json&quot;
}
// → 202 Accepted（秒回）
{
  &quot;task_id&quot;: &quot;img_xxxxxxxx&quot;,
  &quot;status&quot;: &quot;dispatched&quot;
}</pre><h3 data-v-af69d637>第 2 步：轮询结果</h3><p class="ep" data-v-af69d637>GET <code data-v-af69d637>/v1/images/tasks/{task_id}</code></p><pre class="code" data-v-af69d637>{
  &quot;task_id&quot;: &quot;img_xxxxxxxx&quot;,
  &quot;status&quot;: &quot;success&quot;,
  &quot;data&quot;: [{ &quot;b64_json&quot;: &quot;/9j/4AAQ...&quot; }]
}
// status 流转：dispatched → running → success / failed / violated</pre><p class="note" data-v-af69d637>建议提交后先等 30 秒再开始轮询，之后每 5 秒查询一次。status 为 <code data-v-af69d637>success</code>、<code data-v-af69d637>failed</code> 或 <code data-v-af69d637>violated</code> 时停止。</p></section><section class="card" data-v-af69d637><h2 data-v-af69d637>⑤ 通过 chat 接口生图</h2><p class="ep" data-v-af69d637>POST <code data-v-af69d637>/v1/chat/completions</code></p><p class="note" data-v-af69d637>支持 Gemini 生图和 GPT Image 生图，统一走 chat 接口。model 设为图片模型即可。</p><pre class="code" data-v-af69d637>{
  &quot;model&quot;: &quot;gpt-image-2&quot;,
  &quot;stream&quot;: false,
  &quot;messages&quot;: [{ &quot;role&quot;: &quot;user&quot;, &quot;content&quot;: &quot;画一只在月光下的狼&quot; }]
}</pre><p class="note" data-v-af69d637>也支持 <code data-v-af69d637>gemini-3.1-flash-image</code>。返回标准 ChatCompletion 格式，图片以 markdown data URL 嵌入 content。</p></section><section class="card" data-v-af69d637><h2 data-v-af69d637>⑥ 响应格式</h2><h3 data-v-af69d637>/v1/images/generations · /v1/images/edits</h3><pre class="code" data-v-af69d637>{
  &quot;created&quot;: 1234567890,
  &quot;data&quot;: [{ &quot;b64_json&quot;: &quot;/9j/4AAQ...&quot; }]
}</pre><h3 data-v-af69d637>/v1/chat/completions（图片模型）</h3><pre class="code" data-v-af69d637>{
  &quot;id&quot;: &quot;chatcmpl-img-img_xxxxxxxx&quot;,
  &quot;object&quot;: &quot;chat.completion&quot;,
  &quot;model&quot;: &quot;gpt-image-2&quot;,
  &quot;choices&quot;: [{
    &quot;index&quot;: 0,
    &quot;message&quot;: {
      &quot;role&quot;: &quot;assistant&quot;,
      &quot;content&quot;: &quot;![image_0](data:image/png;base64,iVBOR...)&quot;
    },
    &quot;finish_reason&quot;: &quot;stop&quot;
  }],
  &quot;usage&quot;: { &quot;prompt_tokens&quot;: 10, &quot;completion_tokens&quot;: 1, &quot;total_tokens&quot;: 11 },
  &quot;data&quot;: [{ &quot;b64_json&quot;: &quot;iVBOR...&quot;, &quot;file_id&quot;: &quot;...&quot; }]
}</pre><p class="note" data-v-af69d637>图片在 <code data-v-af69d637>choices[0].message.content</code> 中以 markdown data URL 返回。同时 <code data-v-af69d637>data</code> 字段也保留，可按任一方式取图。</p></section><section class="card" data-v-af69d637><h2 data-v-af69d637>⑦ 错误码参考</h2><p class="note" data-v-af69d637>错误返回 OpenAI 格式：<code data-v-af69d637>{&quot;error&quot;:{&quot;code&quot;:&quot;xxx&quot;,&quot;message&quot;:&quot;...&quot;}}</code></p><table class="tb" data-v-af69d637><thead data-v-af69d637><tr data-v-af69d637><th data-v-af69d637>错误码</th><th data-v-af69d637>HTTP</th><th data-v-af69d637>含义</th><th data-v-af69d637>建议</th></tr></thead><tbody data-v-af69d637><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>no_available_account</code></td><td data-v-af69d637>503</td><td data-v-af69d637>账号池暂无可用账号</td><td data-v-af69d637>等 30s 重试</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>rate_limited</code></td><td data-v-af69d637>503</td><td data-v-af69d637>上游限流</td><td data-v-af69d637>等 30s 重试</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>rate_limit_rpm</code></td><td data-v-af69d637>429</td><td data-v-af69d637>触发每分钟请求数限制</td><td data-v-af69d637>降低频率</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>insufficient_balance</code></td><td data-v-af69d637>402</td><td data-v-af69d637>积分不足</td><td data-v-af69d637>充值</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>model_not_allowed</code></td><td data-v-af69d637>403</td><td data-v-af69d637>Key 无权调用该模型</td><td data-v-af69d637>联系管理员</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>model_not_found</code></td><td data-v-af69d637>400</td><td data-v-af69d637>模型不存在或已下架</td><td data-v-af69d637>检查 model 字段</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>upstream_error</code></td><td data-v-af69d637>502</td><td data-v-af69d637>上游服务返回错误</td><td data-v-af69d637>重试</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>poll_timeout</code></td><td data-v-af69d637>502</td><td data-v-af69d637>图片生成超时</td><td data-v-af69d637>重试</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>network_transient</code></td><td data-v-af69d637>502</td><td data-v-af69d637>网络波动</td><td data-v-af69d637>自动重试</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>auth_required</code></td><td data-v-af69d637>502</td><td data-v-af69d637>上游鉴权失败</td><td data-v-af69d637>自动换号重试</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>download_failed</code></td><td data-v-af69d637>502</td><td data-v-af69d637>图片下载失败</td><td data-v-af69d637>重试</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>invalid_response</code></td><td data-v-af69d637>502</td><td data-v-af69d637>上游返回数据异常</td><td data-v-af69d637>重试</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>invalid_request_error</code></td><td data-v-af69d637>400</td><td data-v-af69d637>请求参数有误</td><td data-v-af69d637>检查请求体</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>invalid_reference_image</code></td><td data-v-af69d637>400</td><td data-v-af69d637>参考图解析失败</td><td data-v-af69d637>检查图片格式/大小</td></tr><tr data-v-af69d637><td data-v-af69d637><code data-v-af69d637>billing_error</code></td><td data-v-af69d637>500</td><td data-v-af69d637>计费系统异常</td><td data-v-af69d637>联系管理员</td></tr></tbody></table></section></main>`,1))]))}}),A=r(k,[["__scopeId","data-v-af69d637"]]);export{A as default};
