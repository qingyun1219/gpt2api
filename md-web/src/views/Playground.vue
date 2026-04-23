<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { fetchModels, generateImage, editImage, generateGemini, type ModelInfo } from '@/api/image'
import { ElMessage } from 'element-plus'

const router = useRouter()
const config = useConfigStore()
const models = ref<ModelInfo[]>([])
const selectedModel = ref('')
const prompt = ref('一只可爱的橘猫趴在窗台上晒太阳，窗外是樱花盛开的春天')
const uploadedImages = ref<string[]>([])
const generating = ref(false)
const logs = ref<string[]>([])
const previewVisible = ref(false)
const previewUrl = ref('')

interface RatioOpt { label: string; ratio: string; size: string }
const RATIOS: RatioOpt[] = [
  { label: '1:1', ratio: '1:1', size: '1024x1024' },
  { label: '16:9', ratio: '16:9', size: '1792x1024' },
  { label: '9:16', ratio: '9:16', size: '1024x1792' },
  { label: '4:3', ratio: '4:3', size: '1792x1024' },
  { label: '3:4', ratio: '3:4', size: '1024x1792' },
  { label: '21:9', ratio: '21:9', size: '1792x1024' },
]
const gptRatio = ref('1:1')
const gptN = ref(1)
const gptSize = computed(() => RATIOS.find(r => r.ratio === gptRatio.value)?.size ?? '1024x1024')
const isGemini = computed(() => selectedModel.value.includes('gemini'))

// 比例对所有模型通用：通过 prompt 前缀控制
const RATIO_RE = /^\s*Make the aspect ratio\s+\S+\s*,\s*/i
watch(gptRatio, (nv) => {
  const prefix = `Make the aspect ratio ${nv} , `
  const lines = prompt.value.split(/\r?\n/)
  if (lines.length > 0 && RATIO_RE.test(lines[0])) {
    lines[0] = lines[0].replace(RATIO_RE, prefix); prompt.value = lines.join('\n')
  } else { prompt.value = prefix + prompt.value }
})

function addLog(msg: string) { logs.value.push(`[${new Date().toLocaleTimeString()}] ${msg}`) }
const connecting = ref(false)
const connected = ref(false)

async function loadModels() {
  if (!config.apiKey) { ElMessage.warning('请先输入 API Key'); return }
  connecting.value = true
  try {
    models.value = await fetchModels()
    if (models.value.length && !selectedModel.value) selectedModel.value = models.value[0].id
    connected.value = true; ElMessage.success(`已加载 ${models.value.length} 个模型`)
  } catch (e: any) { ElMessage.error('连接失败: ' + e.message); connected.value = false }
  finally { connecting.value = false }
}

function triggerFileInput() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = 'image/*'; input.multiple = true
  input.onchange = () => { if (!input.files) return
    for (const f of Array.from(input.files)) { if (uploadedImages.value.length >= 4) break
      if (!f.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = (ev) => { uploadedImages.value.push(ev.target?.result as string) }
      reader.readAsDataURL(f) } }
  input.click()
}
function removeImage(i: number) { uploadedImages.value.splice(i, 1) }
function openPreview(url: string) { previewUrl.value = url; previewVisible.value = true }
function downloadImage(url: string, idx: number) {
  const a = document.createElement('a'); a.href = url; a.download = `ai_${Date.now()}_${idx}.png`; a.click()
}

// 历史结果：每次生成追加，不清空
interface ResultBatch { model: string; time: string; images: string[]; text?: string }
const history = ref<ResultBatch[]>([])

async function generate() {
  if (!selectedModel.value || !prompt.value.trim() || !config.apiKey) return
  generating.value = true; logs.value = []
  addLog(`模型: ${selectedModel.value}`); const t0 = Date.now()
  const total = gptN.value
  try {
    if (isGemini.value) {
      addLog(`${total} 张并发请求中...`)
      // Gemini 也并发请求 N 次
      const tasks = Array.from({ length: total }, () => generateGemini(selectedModel.value, prompt.value))
      const results = await Promise.allSettled(tasks)
      const urls: string[] = []; let lastText = ''
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          if (r.value.imageUrls.length) urls.push(...r.value.imageUrls)
          if (r.value.text) lastText = r.value.text
        } else { addLog(`⚠️ 第${i+1}张失败: ${r.reason?.message}`) }
      })
      if (urls.length) {
        history.value.unshift({ model: selectedModel.value, time: new Date().toLocaleTimeString(), images: urls })
        addLog(`✅ ${urls.length}张 ${((Date.now()-t0)/1000).toFixed(1)}s`)
      } else {
        addLog('⚠️ 未返回图片')
        if (lastText) history.value.unshift({ model: selectedModel.value, time: new Date().toLocaleTimeString(), images: [], text: lastText })
      }
    } else {
      const hasRef = uploadedImages.value.length > 0
      addLog(`${hasRef?'图生图':'文生图'} · ${gptRatio.value} · ${total}张`)
      addLog('⏳ 生图中...')
      // GPT 也是并发 N 个请求
      const tasks = Array.from({ length: total }, () => hasRef
        ? editImage(selectedModel.value, prompt.value, uploadedImages.value, 1, gptSize.value)
        : generateImage(selectedModel.value, prompt.value, 1, gptSize.value))
      const results = await Promise.allSettled(tasks)
      const urls: string[] = []
      results.forEach((r, i) => { if (r.status==='fulfilled' && r.value.imageUrls.length) urls.push(...r.value.imageUrls)
        else addLog(`⚠️ 第${i+1}张失败`) })
      if (urls.length) {
        history.value.unshift({ model: selectedModel.value, time: new Date().toLocaleTimeString(), images: urls })
        addLog(`✅ ${urls.length}张 ${((Date.now()-t0)/1000).toFixed(1)}s`)
      } else addLog('❌ 全部失败')
    }
  } catch (e: any) { addLog(`❌ ${e.message}`) }
  finally { generating.value = false }
}
</script>

<template><div class="pg">
  <header class="nav"><div class="nav-in">
    <a class="logo" @click="router.push('/')"><span class="lo-i">✦</span><span class="lo-t">AI Studio</span></a>
    <div style="display:flex;align-items:center;gap:8px">
      <el-button link @click="config.dark=!config.dark"><el-icon :size="18"><component :is="config.dark?'Sunny':'Moon'"/></el-icon></el-button>
    </div>
  </div></header>

  <div class="body"><aside class="side">
    <div class="pnl"><div class="pnl-h"><span>API 配置</span>
      <el-tag v-if="connected" type="success" size="small" round effect="plain">已连接</el-tag></div>
      <el-select v-model="config.baseUrl" style="width:100%;margin-bottom:10px">
        <el-option v-for="n in config.nodes" :key="n.value" :label="n.label" :value="n.value"/></el-select>
      <el-input v-model="config.apiKey" type="password" show-password placeholder="API Key"/>
      <el-button :loading="connecting" @click="loadModels" type="primary" round style="width:100%;margin-top:12px">
        {{ connecting?'连接中...':'连接' }}</el-button>
    </div>

    <div class="pnl"><div class="pnl-h">提示词</div>
      <el-input v-model="prompt" type="textarea" :rows="4" placeholder="描述你想生成的内容..." resize="vertical"/>
    </div>

    <div class="pnl"><div class="pnl-h">画面比例 <span class="sub">{{ gptRatio }}</span></div>
      <div class="ratio-row">
        <button v-for="r in RATIOS" :key="r.ratio" :class="['r-btn',{active:gptRatio===r.ratio}]" @click="gptRatio=r.ratio">{{ r.label }}</button>
      </div>
    </div>

    <div class="pnl"><div class="pnl-h">生成张数 <span class="sub">{{ gptN }}</span></div>
      <el-slider v-model="gptN" :min="1" :max="4" show-stops/>
    </div>

    <div v-if="!isGemini" class="pnl"><div class="pnl-h">参考图片 <span class="sub">可选 · 图生图</span></div>
      <el-button size="small" round @click="triggerFileInput" :disabled="uploadedImages.length>=4"><el-icon><Plus/></el-icon> 选择图片</el-button>
      <div v-if="uploadedImages.length" class="thumbs">
        <div v-for="(img,i) in uploadedImages" :key="i" class="th">
          <img :src="img" @click="openPreview(img)"/>
          <span class="th-x" @click="removeImage(i)">×</span>
        </div>
      </div>
    </div>

    <el-button type="primary" size="large" round :loading="generating" :disabled="!selectedModel||!prompt.trim()" @click="generate" class="gen-btn">
      {{ generating?'生成中...':'生成图片' }}</el-button>
  </aside>

  <main class="main">
    <!-- 模型选择在右侧上方 -->
    <div class="pnl"><div class="pnl-h">选择模型</div>
      <div class="model-row">
        <div v-for="m in models" :key="m.id" :class="['m-chip', {active: selectedModel===m.id}]"
          @click="selectedModel=m.id">
          {{ m.id }}
        </div>
        <div v-if="!models.length" class="hint">请先连接 API</div>
      </div>
    </div>

    <!-- 日志 -->
    <div class="pnl log-pnl"><div class="pnl-h">
      <span class="dot" :class="generating?'run':history.length?'ok':'idle'"></span>
      {{ generating?'生成中...':history.length?'已完成':'等待中' }}</div>
      <div class="log-box"><div v-if="!logs.length" class="log-ph">选择模型并点击生成按钮</div>
        <div v-for="(l,i) in logs" :key="i" class="log-ln">{{ l }}</div></div>
    </div>

    <!-- 历史结果（每次生成追加，不清空） -->
    <div v-for="(batch, bi) in history" :key="bi" class="pnl">
      <div class="pnl-h">{{ batch.model }} <span class="sub">{{ batch.time }}</span></div>
      <div v-if="batch.images.length" class="r-grid">
        <div v-for="(url,i) in batch.images" :key="i" class="r-item">
          <img :src="url" @click="openPreview(url)"/>
          <div class="r-actions">
            <button @click="openPreview(url)">预览</button>
            <button @click="downloadImage(url,i)">下载</button>
          </div>
        </div>
      </div>
      <pre v-if="batch.text" class="r-text">{{ batch.text }}</pre>
    </div>
  </main></div>

  <el-dialog v-model="previewVisible" width="90%" :show-close="true" destroy-on-close>
    <img :src="previewUrl" style="width:100%;border-radius:12px"/>
  </el-dialog>
</div></template>

<style scoped lang="scss">
.pg{min-height:100vh;display:flex;flex-direction:column;background:var(--bg-soft)}
.nav{background:var(--nav-bg);border-bottom:1px solid var(--border);backdrop-filter:saturate(180%) blur(16px);padding:12px 0;position:sticky;top:0;z-index:50}
.nav-in{max-width:1360px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between}
.logo{display:inline-flex;align-items:center;gap:8px;cursor:pointer;text-decoration:none}
.lo-i{font-size:20px} .lo-t{font-size:17px;font-weight:700;color:var(--text);letter-spacing:-0.3px}
.body{flex:1;display:flex;gap:24px;max-width:1360px;width:100%;margin:0 auto;padding:24px}
.side{width:340px;flex-shrink:0;display:flex;flex-direction:column;gap:16px;overflow-y:auto;max-height:calc(100vh - 80px)}
.main{flex:1;min-width:0;display:flex;flex-direction:column;gap:20px}
.pnl{background:var(--bg-card-solid);border:1px solid var(--border);border-radius:var(--radius);padding:20px;box-shadow:var(--shadow-sm)}
.pnl-h{font-size:14px;font-weight:600;margin-bottom:14px;color:var(--text);display:flex;align-items:center;gap:8px}
.sub{font-size:12px;color:var(--text-mute);font-weight:400}
.hint{color:var(--text-mute);font-size:13px;padding:12px 0;text-align:center}

.model-row{display:flex;flex-wrap:wrap;gap:8px}
.m-chip{padding:8px 16px;border-radius:980px;border:1.5px solid var(--border);cursor:pointer;font-size:13px;font-weight:500;color:var(--text-soft);transition:all .15s;background:var(--bg-soft);white-space:nowrap}
.m-chip:hover{border-color:var(--primary);color:var(--primary)}
.m-chip.active{border-color:var(--primary);background:var(--primary-soft);color:var(--primary);font-weight:600}

.ratio-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.r-btn{background:var(--bg-soft);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:10px 4px;cursor:pointer;font-size:13px;font-weight:500;color:var(--text-soft);transition:all .15s;font-family:inherit}
.r-btn:hover{border-color:var(--primary);color:var(--primary)}
.r-btn.active{border-color:var(--primary);background:var(--primary-soft);color:var(--primary);font-weight:600}

.thumbs{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.th{position:relative;width:72px;height:72px;border-radius:var(--radius-sm);overflow:hidden;border:1px solid var(--border);cursor:pointer;
  img{width:100%;height:100%;object-fit:cover}}
.th-x{position:absolute;top:3px;right:3px;width:20px;height:20px;background:rgba(0,0,0,.5);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;line-height:1;transition:background .15s}
.th-x:hover{background:#ff3b30}

.gen-btn{width:100%;font-size:15px;height:48px;font-weight:600;letter-spacing:0.02em}

.dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.dot.idle{background:var(--text-mute)} .dot.run{background:#ff9500;animation:pulse 1.5s infinite} .dot.ok{background:var(--green)}
@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(255,149,0,.4)}70%{opacity:.7;box-shadow:0 0 0 6px transparent}}

.log-box{background:var(--bg-soft);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px;font-size:12px;max-height:200px;overflow-y:auto;font-family:'SF Mono',Menlo,Consolas,monospace;color:var(--text-soft)}
.log-ph{color:var(--text-mute);text-align:center;padding:20px 0}
.log-ln{line-height:1.8}

.r-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.r-item{border-radius:var(--radius);overflow:hidden;border:1px solid var(--border);transition:transform .2s,box-shadow .2s;background:var(--bg-card-solid);
  img{display:block;width:100%;height:auto;cursor:pointer}}
.r-item:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg)}
.r-actions{display:flex;border-top:1px solid var(--border);
  button{flex:1;padding:10px;border:none;background:transparent;color:var(--text-soft);cursor:pointer;font-size:13px;font-family:inherit;transition:all .15s}
  button:first-child{border-right:1px solid var(--border)}
  button:hover{background:var(--primary-soft);color:var(--primary)}}

.r-text{font-size:13px;color:var(--text-soft);white-space:pre-wrap;word-break:break-all;font-family:'SF Mono',Menlo,Consolas,monospace;line-height:1.7}

@media(max-width:900px){.body{flex-direction:column} .side{width:100%;max-height:none}}
</style>
