<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useConfigStore } from '@/stores/config'
import { fetchModels, generateImage, editImage, generateGemini, type ModelInfo } from '@/api/image'
import { idbGet, idbSet } from '@/api/idb'
import { ElMessage } from 'element-plus'
const config = useConfigStore()
// ===== Auth =====
const authOk = ref(!!config.apiKey && !!localStorage.getItem('ai_auth'))
const keyInput = ref(''); const authLoading = ref(false)
async function verifyKey() {
  const k = keyInput.value.trim(); if (!k) return ElMessage.warning('请输入卡密')
  authLoading.value = true; config.apiKey = k
  try { const m = await fetchModels(); if (!m.length) throw new Error('无可用模型'); models.value = m; if (!selectedModel.value) selectedModel.value = m[0].id; localStorage.setItem('ai_auth','1'); authOk.value = true }
  catch (e:any) { ElMessage.error('卡密无效: '+e.message); config.apiKey=''; localStorage.removeItem('ai_auth') }
  finally { authLoading.value = false }
}
function logout() { config.apiKey=''; localStorage.removeItem('ai_auth'); authOk.value=false }
// ===== Models =====
const models = ref<ModelInfo[]>([]); const selectedModel = ref(localStorage.getItem('ai_model')||'')
watch(selectedModel, v => localStorage.setItem('ai_model', v))
const prompt = ref('Generate a nature landscape image captured by a Hasselblad camera, featuring extreme visual impact. It should appear surrealistic, yet depict a place that actually exists in reality.'); const uploadedImages = ref<string[]>([])
const previewVisible = ref(false); const previewUrl = ref(''); const sideOpen = ref(false); const modelOpen = ref(false)
interface RO { label:string; ratio:string; size:string }
const RATIOS:RO[] = [{label:'1:1',ratio:'1:1',size:'1024x1024'},{label:'16:9',ratio:'16:9',size:'1792x1024'},{label:'9:16',ratio:'9:16',size:'1024x1792'},{label:'4:3',ratio:'4:3',size:'1792x1024'},{label:'3:4',ratio:'3:4',size:'1024x1792'}]
const gptRatio = ref('1:1'); const gptN = ref(1)
const gptSize = computed(() => RATIOS.find(r => r.ratio===gptRatio.value)?.size??'1024x1024')
const isGemini = computed(() => selectedModel.value.includes('gemini'))
// ===== Convs (IndexedDB 持久化) =====
interface Msg { role:'user'|'ai'; prompt?:string; model?:string; ratio?:string; count?:number; images:string[]; text?:string; status?:string; time:string; refs?:string[] }
interface Conv { id:string; title:string; msgs:Msg[]; ts:number }
const convs = ref<Conv[]>([]); const curId = ref('')
const curConv = computed(() => convs.value.find(c => c.id===curId.value))
const convsLoaded = ref(false)
// 计时器：用独立 reactive 对象，key=msg的time, val=秒数（不依赖深层 Proxy）
const timers = reactive<Record<string, number>>({})
// 显式保存（不依赖 watch，在关键节点手动调用）
async function doSave() {
  try {
    const raw = convs.value.slice(0, 30).map(c => ({
      id: c.id, title: c.title, ts: c.ts,
      msgs: c.msgs.map(m => ({
        role: m.role, prompt: m.prompt, model: m.model,
        ratio: m.ratio, count: m.count, status: m.status,
        time: m.time, text: m.text,
        images: m.images ? [...m.images] : [],
      }))
    }))
    await idbSet('convs', raw)
    if (curId.value) localStorage.setItem('ai_cur', curId.value)
  } catch (e) { console.warn('[ai_save]', e) }
}
function onBeforeUnload() { doSave() }
function newConv() { const id='c_'+Date.now(); convs.value.unshift({id,title:'新对话',msgs:[],ts:Date.now()}); curId.value=id; sideOpen.value=false; doSave() }
function switchConv(id:string) { curId.value=id; sideOpen.value=false; scrollBot(); localStorage.setItem('ai_cur',id) }
function delConv(id:string) { convs.value=convs.value.filter(c=>c.id!==id); if(curId.value===id) curId.value=convs.value[0]?.id||''; doSave() }
onMounted(async () => {
  document.addEventListener('paste',onPaste)
  window.addEventListener('beforeunload', onBeforeUnload)
  // 从 IndexedDB 恢复对话 (或从 localStorage 迁移旧数据)
  let loaded = await idbGet<Conv[]>('convs')
  if (!loaded) {
    // 兼容旧版 localStorage 数据迁移
    try { const old = localStorage.getItem('ai_convs'); if (old) { loaded = JSON.parse(old); localStorage.removeItem('ai_convs') } } catch {}
    // 也兼容更旧的 ai_history 格式
    if (!loaded) {
      try { const h = localStorage.getItem('ai_history'); if (h) { const arr = JSON.parse(h); if (arr.length) { loaded = [{ id:'c_migrated', title:'历史记录', msgs: arr.flatMap((b:any) => {
        const msgs: Msg[] = []
        msgs.push({ role:'user', prompt:b.prompt, model:b.model, images:[], time:b.time })
        msgs.push({ role:'ai', images:b.images||[], text:b.text, status: (b.images?.length?'done':'failed'), time:b.time })
        return msgs
      }), ts: Date.now() }]; localStorage.removeItem('ai_history') } } } catch {}
    }
  }
  if (loaded?.length) {
    // 修复残留 generating 状态
    for (const c of loaded) for (const m of c.msgs) if (m.status==='generating') m.status = m.images.length ? 'done' : 'failed'
    convs.value = loaded
  }
  curId.value = localStorage.getItem('ai_cur') || ''
  if (!convs.value.length) newConv()
  else if (!curId.value || !convs.value.find(c=>c.id===curId.value)) curId.value = convs.value[0].id
  convsLoaded.value = true
  if(authOk.value) { try { models.value=await fetchModels(); if(models.value.length&&!selectedModel.value) selectedModel.value=models.value[0].id } catch {} }
})
onUnmounted(() => { document.removeEventListener('paste',onPaste); window.removeEventListener('beforeunload', onBeforeUnload) })
// ===== Upload =====
function triggerUpload() { const i=document.createElement('input'); i.type='file'; i.accept='image/*'; i.multiple=true; i.onchange=()=>{if(i.files) addF(i.files)}; i.click() }
function addF(fs:FileList|File[]) { for(const f of Array.from(fs)){if(uploadedImages.value.length>=4) break; if(!f.type.startsWith('image/')) continue; const r=new FileReader(); r.onload=e=>uploadedImages.value.push(e.target?.result as string); r.readAsDataURL(f)} }
function onPaste(e:ClipboardEvent) { if(!authOk.value) return; const it=e.clipboardData?.items; if(!it) return; const im:File[]=[]; for(const x of Array.from(it)){if(x.type.startsWith('image/')){const f=x.getAsFile(); if(f) im.push(f)}}; if(im.length){e.preventDefault(); addF(im)} }
// 拖拽上传
const dragging = ref(false)
function onDragOver(e:DragEvent) { e.preventDefault(); dragging.value = true }
function onDragLeave() { dragging.value = false }
function onDrop(e:DragEvent) { e.preventDefault(); dragging.value = false; if(e.dataTransfer?.files.length) addF(e.dataTransfer.files) }
function openPv(u:string){previewUrl.value=u;previewVisible.value=true}
function dlImg(u:string,i:number){const a=document.createElement('a');a.href=u;a.download=`ai_${Date.now()}_${i}.png`;a.click()}
const chatEl=ref<HTMLElement>()
function scrollBot(){nextTick(()=>{if(chatEl.value) chatEl.value.scrollTop=chatEl.value.scrollHeight})}
function fmtT(t:string){if(!t) return '';const d=new Date(t);if(isNaN(d.getTime())) return t;const p=(n:number)=>String(n).padStart(2,'0');return `${p(d.getHours())}:${p(d.getMinutes())}`}
// ===== Generate（并行多任务，独立计时+超时） =====
const activeTasks = ref(0)
const TIMEOUT = 120_000
async function generate() {
  const p=prompt.value.trim(); if(!p||!selectedModel.value) return
  const conv=curConv.value; if(!conv) return
  const mdl=selectedModel.value; const ratio=gptRatio.value; const sz=gptSize.value
  const gem=isGemini.value; const total=gptN.value; const refs=[...uploadedImages.value]
  let fp=p; if(!gem&&ratio!=='1:1') fp=`Make the aspect ratio ${ratio} , ${p}`
  // 用时间戳做计时器 key
  const tKey = 't_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)
  // 插入消息（直接操作 reactive 数组）
  const userMsg: Msg = {role:'user',prompt:p,model:mdl,ratio,count:total,images:[],time:new Date().toISOString(),refs}
  const aiMsg: Msg = {role:'ai',images:[],status:'generating',time:tKey}
  conv.msgs.push(userMsg, aiMsg)
  if(conv.title==='新对话') conv.title=p.slice(0,20)||'图片生成'
  conv.ts=Date.now(); prompt.value=''; uploadedImages.value=[]; scrollBot()
  // 独立计时（reactive 顶层属性，100% 触发响应性）
  timers[tKey] = 0
  const timer = setInterval(()=>{ timers[tKey]++ }, 1000)
  const ac = new AbortController()
  const to = setTimeout(()=>ac.abort(), TIMEOUT)
  activeTasks.value++
  // 找到 push 后的 Proxy 引用
  const aiIdx = conv.msgs.length - 1
  try {
    if(gem) {
      for(let i=0;i<total;i++) for(let a=1;a<=3;a++) {
        try {
          const r=await generateGemini(mdl,fp,ac.signal)
          if(r.imageUrls.length){ conv.msgs[aiIdx].images.push(...r.imageUrls); scrollBot(); break }
          if(r.text) conv.msgs[aiIdx].text=r.text
        } catch(e:any){if(ac.signal.aborted){conv.msgs[aiIdx].text='⏱ 生成超时';break};if(a===3)break;await new Promise(r=>setTimeout(r,a*2000))}
      }
    } else {
      const errors: string[] = []
      const tasks=Array.from({length:total},()=>(refs.length?editImage(mdl,fp,refs,1,sz,ac.signal):generateImage(mdl,fp,1,sz,ac.signal))
        .then(r=>{if(r.imageUrls.length){conv.msgs[aiIdx].images.push(...r.imageUrls);scrollBot()}}).catch((e:any)=>{if(e?.message) errors.push(e.message)}))
      await Promise.allSettled(tasks)
      if(!conv.msgs[aiIdx].images.length && errors.length) conv.msgs[aiIdx].text = errors[0]
    }
    conv.msgs[aiIdx].status = conv.msgs[aiIdx].images.length ? 'done' : 'failed'
    conv.msgs[aiIdx].time = new Date().toISOString() // 完成后改为真实时间
  } catch{ conv.msgs[aiIdx].status='failed'; conv.msgs[aiIdx].time=new Date().toISOString() }
  finally { activeTasks.value--; clearInterval(timer); clearTimeout(to); delete timers[tKey]; doSave() }
}
function handleEnter(e:KeyboardEvent){if(!e.shiftKey){e.preventDefault();generate()}}
// v-click-outside directive
const vClickOutside = { mounted(el:any,binding:any){ el._co=((e:Event)=>{if(!el.contains(e.target)) binding.value(e)}); document.addEventListener('click',el._co) }, unmounted(el:any){ document.removeEventListener('click',el._co) } }
</script>

<template>
<div v-if="!authOk" class="auth-page">
  <div class="auth-card">
    <div class="auth-logo">✦ AI Studio</div>
    <div class="auth-desc">输入卡密开始创作</div>
    <input v-model="keyInput" type="password" placeholder="请输入卡密" class="auth-input" @keydown.enter="verifyKey"/>
    <button class="auth-btn" :disabled="authLoading" @click="verifyKey">{{ authLoading ? '验证中...' : '进入' }}</button>
  </div>
</div>
<div v-else class="app">
  <div v-if="sideOpen" class="side-mask" @click="sideOpen=false"></div>
  <aside class="side" :class="{open:sideOpen}">
    <div class="side-top"><span class="side-title">对话</span><button class="btn-icon" @click="newConv">＋</button></div>
    <div class="conv-list">
      <div v-for="c in convs" :key="c.id" class="conv-item" :class="{active:c.id===curId}" @click="switchConv(c.id)">
        <span class="conv-t">{{ c.title }}</span><button class="conv-del" @click.stop="delConv(c.id)">×</button>
      </div>
      <div v-if="!convs.length" class="conv-empty">暂无对话</div>
    </div>
    <div class="side-bot"><button class="btn-text-sm" @click="logout">退出登录</button></div>
  </aside>
  <main class="main">
    <header class="topbar">
      <button class="btn-icon mobile-only" @click="sideOpen=!sideOpen">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <span class="topbar-t">{{ curConv?.title||'AI Studio' }}<span v-if="activeTasks>0" class="topbar-badge">{{ activeTasks }}个任务生成中</span></span>
      <div style="width:32px;display:flex;align-items:center;justify-content:flex-end">
        <button class="btn-icon" @click="config.dark=!config.dark" :title="config.dark?'切换浅色模式':'切换深色模式'" style="width:28px;height:28px;padding:0;display:flex;align-items:center;justify-content:center">
          <svg v-if="config.dark" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        </button>
      </div>
    </header>
    <div class="chat" ref="chatEl">
      <div v-if="!convsLoaded" class="chat-empty"><div class="gen-spin" style="width:28px;height:28px"></div></div>
      <div v-else-if="!curConv?.msgs.length" class="chat-empty"><div class="ce-icon">✨</div><div class="ce-title">开始创作</div><div class="ce-sub">输入描述，生成你想要的图片</div></div>
      <template v-for="(msg,mi) in (curConv?.msgs||[])" :key="mi">
        <div v-if="msg.role==='user'" class="msg msg-user"><div class="msg-bubble u-bbl">
          <div class="msg-text">{{ msg.prompt }}</div>
          <div class="msg-tags"><span class="tag">{{ msg.model }}</span><span class="tag" v-if="msg.ratio">{{ msg.ratio }}</span><span class="tag" v-if="(msg.count||0)>1">{{ msg.count }}张</span></div>
          <div v-if="msg.refs?.length" class="msg-refs"><img v-for="(r,ri) in msg.refs" :key="ri" :src="r" class="ref-thumb"/></div>
          <div class="msg-time-r">{{ fmtT(msg.time) }}</div>
        </div></div>
        <div v-else class="msg msg-ai"><div class="msg-bubble a-bbl">
          <div v-if="msg.status==='generating'" class="gen-loading"><div class="gen-spin"></div><span>生成中 · {{ timers[msg.time] || 0 }}s</span></div>
          <div v-else-if="msg.status==='failed'" class="gen-fail">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style="flex:1">{{ msg.text || '生成失败，请重试' }}</span>
          </div>
          <div v-if="msg.images.length" class="img-row">
            <div v-for="(url,ii) in msg.images" :key="ii" class="img-card" @click="openPv(url)">
              <img :src="url"/><div class="img-hover"><button @click.stop="dlImg(url,ii)">↓</button></div>
            </div>
          </div>
          <pre v-if="msg.text && msg.status!=='failed'" class="ai-text">{{ msg.text }}</pre>
          <div class="msg-time-l" v-if="msg.status!=='generating'">{{ fmtT(msg.time) }}</div>
        </div></div>
      </template>
    </div>
    <div class="input-area">
      <div class="input-card" :class="{dragover:dragging}" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
        <!-- 参考图预览 -->
        <div v-if="uploadedImages.length" class="ref-bar">
          <div v-for="(img,i) in uploadedImages" :key="i" class="ref-item">
            <img :src="img"/><button class="ref-x" @click="uploadedImages.splice(i,1)">×</button>
          </div>
        </div>
        <!-- 拖拽提示 -->
        <div v-if="dragging" class="drag-hint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>拖放图片到这里</span>
        </div>
        <!-- 输入行 -->
        <div class="input-row">
          <button class="add-btn" @click="triggerUpload" title="上传参考图">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          </button>
          <textarea v-model="prompt" rows="3" placeholder="描述你想生成的图片，支持粘贴或拖入参考图..." class="input-box" @keydown.enter="handleEnter"></textarea>
          <button class="send-btn" :disabled="!prompt.trim()" @click="generate">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <!-- 工具栏 -->
        <div class="toolbar">
          <!-- 模型选择 -->
          <div class="model-picker" v-click-outside="()=>modelOpen=false">
            <button class="model-btn" @click="modelOpen=!modelOpen">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              <span>{{ selectedModel || '选择模型' }}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div v-if="modelOpen" class="model-drop">
              <div v-for="m in models" :key="m.id" class="model-opt" :class="{sel:m.id===selectedModel}" @click="selectedModel=m.id;modelOpen=false">
                {{ m.id }}
                <svg v-if="m.id===selectedModel" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
            </div>
          </div>
          <!-- 比例 -->
          <div class="tb-ratios">
            <button v-for="r in RATIOS" :key="r.ratio" class="tb-r" :class="{act:gptRatio===r.ratio}" @click="gptRatio=r.ratio">{{ r.label }}</button>
          </div>
          <!-- 张数（紧跟比例后面） -->
          <div class="tb-n">
            <button class="tb-nb" :disabled="gptN<=1" @click="gptN--">−</button>
            <span class="tb-nv">{{ gptN }}张</span>
            <button class="tb-nb" :disabled="gptN>=4" @click="gptN++">＋</button>
          </div>
        </div>
      </div>
    </div>
  </main>
</div>
<el-dialog v-model="previewVisible" width="80%" :show-close="true" destroy-on-close align-center class="preview-dlg">
  <img :src="previewUrl" style="max-width:100%;max-height:80vh;display:block;margin:0 auto;border-radius:12px;object-fit:contain"/>
</el-dialog>
</template>


<style scoped lang="scss">
// Auth
.auth-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)}
.auth-card{background:var(--bg-card-solid);border:1px solid var(--border);border-radius:20px;padding:48px 40px;max-width:380px;width:90%;text-align:center;box-shadow:var(--shadow-md)}
.auth-logo{font-size:28px;font-weight:700;margin-bottom:8px;color:var(--text)}
.auth-desc{font-size:14px;color:var(--text-mute);margin-bottom:28px}
.auth-input{width:100%;padding:14px 16px;border:1px solid var(--border);border-radius:12px;font-size:15px;background:var(--bg-soft);color:var(--text);outline:none;box-sizing:border-box;margin-bottom:16px;font-family:inherit}
.auth-input:focus{border-color:var(--primary)}
.auth-btn{width:100%;padding:14px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-size:16px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .2s}
.auth-btn:disabled{opacity:.5;cursor:not-allowed}
// Layout
.app{display:flex;height:100vh;overflow:hidden;background:var(--bg)}
.side-mask{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:90;backdrop-filter:blur(4px)}
.side{width:280px;flex-shrink:0;background:var(--bg-soft);border-right:1px solid var(--border);display:flex;flex-direction:column;z-index:91}
.side-top{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)}
.side-title{font-weight:700;font-size:16px;color:var(--text);letter-spacing:-0.3px}
.conv-list{flex:1;overflow-y:auto;padding:12px}
.conv-item{padding:12px 14px;border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;transition:all .2s;border:1px solid transparent}
.conv-item:hover{background:var(--bg-card-solid);border-color:var(--border)}
.conv-item.active{background:var(--primary-soft);border-color:rgba(var(--primary-rgb),0.1);color:var(--primary)}
.conv-t{font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-weight:500}
.conv-del{border:none;background:transparent;color:var(--text-mute);cursor:pointer;font-size:18px;opacity:0;transition:all .2s;padding:2px 6px;border-radius:6px;line-height:1}
.conv-item:hover .conv-del{opacity:.6}
.conv-del:hover{opacity:1!important;color:#ff3b30;background:rgba(255,59,48,0.1)}
.conv-empty{color:var(--text-mute);text-align:center;padding:40px 0;font-size:13px}
.side-bot{padding:16px 20px;border-top:1px solid var(--border)}
.btn-text-sm{border:none;background:transparent;color:var(--text-soft);cursor:pointer;font-size:13px;font-family:inherit;font-weight:500;transition:color 0.2s}
.btn-text-sm:hover{color:var(--text)}
.btn-icon{border:none;background:transparent;color:var(--text-soft);cursor:pointer;font-size:20px;padding:6px;border-radius:10px;transition:all .2s;font-family:inherit;display:flex;align-items:center;justify-content:center}
.btn-icon:hover{background:var(--bg-card-solid);color:var(--text);box-shadow:var(--shadow-sm)}
// Main
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--border);background:var(--bg-card-solid)}
.topbar-t{font-size:15px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:8px}
.topbar-badge{font-size:11px;font-weight:500;color:var(--primary);background:var(--primary-soft);padding:2px 8px;border-radius:10px;white-space:nowrap;flex-shrink:0;animation:pulse 1.5s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.mobile-only{display:none}
// Chat
.chat{flex:1;overflow-y:auto;padding:24px 20px;display:flex;flex-direction:column;gap:24px}
.chat-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-mute)}
.ce-icon{font-size:48px;margin-bottom:16px;opacity:.8}
.ce-title{font-size:22px;font-weight:700;color:var(--text);margin-bottom:8px;letter-spacing:-0.5px}
.ce-sub{font-size:15px;color:var(--text-soft)}
.msg{display:flex;gap:12px;margin:0 auto;width:100%;max-width:800px}
.msg-user{justify-content:flex-end}
.msg-ai{justify-content:flex-start}
.msg-bubble{max-width:85%;padding:16px 20px;border-radius:20px;font-size:15px;line-height:1.6;word-break:break-word}
.u-bbl{background:var(--primary);color:#fff;border-radius:20px 20px 4px 20px;box-shadow:0 4px 16px rgba(var(--primary-rgb),0.2)}
.a-bbl{background:var(--bg-card-solid);border:1px solid var(--border);border-radius:20px 20px 20px 4px;box-shadow:var(--shadow-sm)}
.msg-text{margin-bottom:8px}
.msg-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px}
.tag{font-size:11px;padding:3px 8px;border-radius:8px;background:rgba(255,255,255,.2);font-weight:600;letter-spacing:.3px}
.a-bbl .tag{background:var(--bg-soft);color:var(--text-mute);border:1px solid var(--border)}
.msg-refs{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.ref-thumb{width:64px;height:64px;border-radius:12px;object-fit:cover;border:2px solid rgba(255,255,255,.4);box-shadow:0 2px 8px rgba(0,0,0,0.1)}
.msg-time-r{font-size:12px;text-align:right;opacity:.6;margin-top:6px;font-weight:500}
.msg-time-l{font-size:12px;opacity:.5;margin-top:8px;font-weight:500}
// Gen
.gen-loading{display:flex;align-items:center;gap:12px;font-size:15px;color:var(--text);padding:8px 0;font-weight:500}
.gen-spin{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--border);border-top-color:var(--primary);animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
.gen-fail{color:#ff3b30;font-size:15px;padding:12px 16px;font-weight:500;background:rgba(255,59,48,0.1);border-radius:12px;display:flex;align-items:flex-start;gap:8px}
.img-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
.img-card{position:relative;width:240px;height:240px;border-radius:16px;overflow:hidden;cursor:zoom-in;border:1px solid var(--border);flex-shrink:0;box-shadow:var(--shadow-sm);transition:all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)}
.img-card img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}
.img-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px)}
.img-card:hover img{transform:scale(1.05)}
.img-hover{position:absolute;bottom:0;left:0;right:0;padding:12px;display:flex;justify-content:flex-end;opacity:0;transition:opacity .2s;background:linear-gradient(transparent,rgba(0,0,0,.6))}
.img-card:hover .img-hover{opacity:1}
.img-hover button{width:36px;height:36px;border-radius:10px;border:none;background:rgba(255,255,255,.95);cursor:pointer;font-size:18px;font-weight:700;color:#1d1d1f;display:flex;align-items:center;justify-content:center;transition:all 0.2s;box-shadow:0 2px 10px rgba(0,0,0,0.2)}
.img-hover button:hover{background:#fff;transform:scale(1.05)}
.ai-text{font-size:14px;color:var(--text-soft);white-space:pre-wrap;word-break:break-all;line-height:1.6;margin-top:12px;font-family:'SF Mono',Menlo,monospace;background:var(--bg-soft);padding:12px 16px;border-radius:12px;border:1px solid var(--border)}
// Input Area
.input-area{padding:12px 20px 24px;background:linear-gradient(transparent,var(--bg) 20px)}
.input-card{background:var(--bg-card-solid);border:1px solid var(--border);border-radius:24px;padding:12px 16px;box-shadow:var(--shadow-md);transition:all .3s cubic-bezier(0.25, 0.1, 0.25, 1);max-width:800px;margin:0 auto}
.input-card:focus-within{border-color:var(--primary);box-shadow:0 8px 30px rgba(var(--primary-rgb),0.15), 0 0 0 4px var(--primary-soft)}
.input-card.dragover{border-color:var(--primary);background:var(--primary-soft)}
.ref-bar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.ref-item{position:relative;width:64px;height:64px;border-radius:12px;overflow:hidden;border:1px solid var(--border);box-shadow:var(--shadow-sm)}
.ref-item img{width:100%;height:100%;object-fit:cover}
.ref-x{position:absolute;top:4px;right:4px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;backdrop-filter:blur(4px);transition:all 0.2s}
.ref-x:hover{background:#ff3b30;transform:scale(1.1)}
.input-row{display:flex;align-items:flex-end;gap:12px}
.add-btn{width:40px;height:40px;border-radius:50%;border:1px solid var(--border);background:var(--bg-soft);color:var(--text-soft);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;margin-bottom:4px}
.add-btn:hover{border-color:var(--primary);color:var(--primary);background:var(--primary-soft)}
.input-box{flex:1;resize:none;border:none;border-radius:0;padding:8px 4px;font-size:15px;background:transparent;color:var(--text);outline:none;font-family:inherit;min-height:48px;max-height:160px;line-height:1.5}
.input-box::placeholder{color:var(--text-mute)}
.send-btn{width:40px;height:40px;border-radius:50%;border:none;background:var(--primary);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s;box-shadow:0 4px 12px rgba(var(--primary-rgb),.3);margin-bottom:4px}
.send-btn:not(:disabled):hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(var(--primary-rgb),.4)}
.send-btn:disabled{opacity:.4;cursor:not-allowed;box-shadow:none;background:var(--border);color:var(--text-mute)}
.send-spin{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:sp .8s linear infinite}
// Drag hint
.drag-hint{display:flex;align-items:center;justify-content:center;gap:8px;padding:20px;color:var(--primary);font-size:14px;font-weight:600;background:var(--primary-soft);border-radius:12px;margin-bottom:12px;border:1px dashed rgba(var(--primary-rgb),0.3)}
// Toolbar
.toolbar{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);flex-wrap:wrap;max-width:800px;margin-left:auto;margin-right:auto}
// Model picker
.model-picker{position:relative}
.model-btn{display:flex;align-items:center;gap:6px;border:1px solid var(--border);background:var(--bg-soft);border-radius:10px;padding:6px 12px;font-size:13px;cursor:pointer;color:var(--text-soft);font-family:inherit;transition:all .2s;white-space:nowrap;max-width:180px;font-weight:500}
.model-btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.model-btn:hover{border-color:var(--border);color:var(--text);background:var(--bg-card-solid);box-shadow:var(--shadow-sm)}
.model-drop{position:absolute;bottom:calc(100% + 8px);left:0;min-width:220px;max-height:280px;overflow-y:auto;background:var(--bg-card-solid);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow-lg);padding:6px;z-index:100;backdrop-filter:blur(20px)}
.model-opt{padding:10px 14px;border-radius:10px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--text);transition:all .15s}
.model-opt:hover{background:var(--bg-soft)}
.model-opt.sel{color:var(--primary);font-weight:600;background:var(--primary-soft)}
// Ratios
.tb-ratios{display:flex;gap:4px;background:var(--bg-soft);border-radius:10px;padding:4px;border:1px solid var(--border)}
.tb-r{border:none;background:transparent;border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;color:var(--text-mute);font-family:inherit;transition:all .2s;font-weight:600}
.tb-r.act{background:var(--bg-card-solid);color:var(--text);box-shadow:var(--shadow-sm)}
.tb-r:hover:not(.act){color:var(--text)}
// Count
.tb-n{display:flex;align-items:center;gap:4px;background:var(--bg-soft);border-radius:10px;padding:4px;border:1px solid var(--border)}
.tb-nb{border:none;background:transparent;border-radius:8px;width:32px;height:28px;cursor:pointer;font-size:16px;color:var(--text-soft);display:flex;align-items:center;justify-content:center;font-family:inherit;transition:all .2s;line-height:1}
.tb-nb:hover:not(:disabled){background:var(--bg-card-solid);color:var(--text);box-shadow:var(--shadow-sm)}
.tb-nb:disabled{opacity:.2;cursor:not-allowed}
.tb-nv{font-size:13px;color:var(--text);min-width:32px;text-align:center;font-weight:700}
// Scrollbar
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
// Mobile
@media(max-width:768px){
  .side{position:fixed;left:-280px;top:0;bottom:0;width:260px;transition:left .25s ease;z-index:91;box-shadow:4px 0 20px rgba(0,0,0,.15)}
  .side.open{left:0}
  .mobile-only{display:flex !important}
  .img-card{width:160px;height:160px}
  .msg-bubble{max-width:92%}
  .input-area{padding:8px 12px 12px;background:var(--bg)}
  .input-card{border-radius:18px;padding:10px 12px}
  .model-drop{min-width:180px}
  .toolbar{gap:6px}
}
</style>
<style lang="scss">
.preview-dlg .el-dialog{margin-top:5vh !important;margin-bottom:5vh !important;max-height:90vh;display:flex;flex-direction:column}
.preview-dlg .el-dialog__body{padding:12px;overflow:auto;display:flex;align-items:center;justify-content:center;flex:1;min-height:0}
</style>