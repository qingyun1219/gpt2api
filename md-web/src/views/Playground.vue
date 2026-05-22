<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { fetchModels, submitImageTask, generateImage, editImage, generateGemini, pollTask, type ModelInfo } from '@/api/image'
import { idbGet, idbSet } from '@/api/idb'
import { ElMessage } from 'element-plus'
const config = useConfigStore()
const router = useRouter()
const authFeatures = [
  { title: '文生图创作', desc: '输入自然语言描述，快速生成高质量图片。' },
  { title: '图生图编辑', desc: '上传参考图，延展、重绘或转换视觉风格。' },
  { title: '2K / 4K 高清', desc: '支持高清放大输出，适合海报、封面和商业素材。' },
  { title: 'OpenAI 兼容 API', desc: '卡密通过后即可在工作台和开发文档间切换。' },
]
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
const prompt = ref(''); const uploadedImages = ref<string[]>([])
const previewVisible = ref(false); const previewUrl = ref(''); const sideOpen = ref(false); const modelOpen = ref(false); const ratioOpen = ref(false)
interface RO { label:string; ratio:string; size:string }
const RATIOS:RO[] = [
  {label:'自动',ratio:'auto',size:'1024x1024'},
  {label:'1:1 方形',ratio:'1:1',size:'1024x1024'},
  {label:'16:9 宽屏',ratio:'16:9',size:'1792x1024'},
  {label:'9:16 竖版',ratio:'9:16',size:'1024x1792'},
  {label:'5:4 横屏',ratio:'5:4',size:'1792x1024'},
  {label:'4:5 标准',ratio:'4:5',size:'1024x1792'},
  {label:'4:3 横屏',ratio:'4:3',size:'1792x1024'},
  {label:'3:4 竖版',ratio:'3:4',size:'1024x1792'},
  {label:'3:2 宽幅',ratio:'3:2',size:'1792x1024'},
  {label:'2:3 竖版',ratio:'2:3',size:'1024x1792'},
  {label:'21:9 超宽屏',ratio:'21:9',size:'1792x1024'},
]
const gptRatio = ref('auto'); const gptN = ref(1)
const gptSize = computed(() => RATIOS.find(r => r.ratio===gptRatio.value)?.size??'1024x1024')
const isGemini = computed(() => selectedModel.value.includes('gemini'))
// ===== 画质（upscale） =====
interface QO { label:string; value:string }
const QUALITIES:QO[] = [{label:'标准',value:'1k'},{label:'2K 高清',value:'2k'},{label:'4K 超清',value:'4k'}]
const gptQuality = ref('1k'); const qualityOpen = ref(false)
// ===== Convs (IndexedDB 持久化) =====
interface Msg { role:'user'|'ai'; prompt?:string; model?:string; ratio?:string; quality?:string; count?:number; images:string[]; text?:string; status?:string; time:string; refs?:string[]; taskId?:string }
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
        ratio: m.ratio, quality: m.quality, count: m.count, status: m.status,
        time: m.time, text: m.text, taskId: m.taskId,
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
    convs.value = loaded
  }
  curId.value = localStorage.getItem('ai_cur') || ''
  if (!convs.value.length) newConv()
  else if (!curId.value || !convs.value.find(c=>c.id===curId.value)) curId.value = convs.value[0].id
  convsLoaded.value = true
  if(authOk.value) { try { models.value=await fetchModels(); if(models.value.length&&!selectedModel.value) selectedModel.value=models.value[0].id } catch {} }
  // 恢复未完成的异步任务轮询
  resumePendingTasks()
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
function dlImg(u:string,i:number){
  const name=`ai_${Date.now()}_${i}.png`
  if(u.startsWith('data:')){const a=document.createElement('a');a.href=u;a.download=name;a.click();return}
  fetch(u).then(r=>r.blob()).then(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href)}).catch(()=>{window.open(u,'_blank')})
}
const chatEl=ref<HTMLElement>()
function scrollBot(){nextTick(()=>{if(chatEl.value) chatEl.value.scrollTop=chatEl.value.scrollHeight})}
function fmtT(t:string){if(!t) return '';const d=new Date(t);if(isNaN(d.getTime())) return t;const p=(n:number)=>String(n).padStart(2,'0');return `${p(d.getHours())}:${p(d.getMinutes())}`}
// ===== Generate（异步：提交秒回 + 轮询拿结果） =====
const activeTasks = ref(0)
async function generate() {
  const p=prompt.value.trim(); if(!p||!selectedModel.value) return
  const conv=curConv.value; if(!conv) return
  const mdl=selectedModel.value; const ratio=gptRatio.value; const sz=gptSize.value
  const gem=isGemini.value; const total=gptN.value; const refs=[...uploadedImages.value]
  const qual=gptQuality.value
  let fp=p; if(!gem&&ratio!=='1:1'&&ratio!=='auto') fp=`Make the aspect ratio ${ratio} , ${p}`
  const tKey = 't_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)
  const userMsg: Msg = {role:'user',prompt:p,model:mdl,ratio,quality:qual,count:total,images:[],time:new Date().toISOString(),refs}
  const aiMsg: Msg = {role:'ai',images:[],status:'generating',time:tKey,count:total}
  conv.msgs.push(userMsg, aiMsg)
  if(conv.title==='新对话') conv.title=p.slice(0,20)||'图片生成'
  conv.ts=Date.now(); prompt.value=''; uploadedImages.value=[]; scrollBot()
  timers[tKey] = 0
  const timer = setInterval(()=>{ timers[tKey]++ }, 1000)
  activeTasks.value++
  const aiIdx = conv.msgs.length - 1
  try {
    if(gem) {
      for(let i=0;i<total;i++) for(let a=1;a<=3;a++) {
        try {
          const r=await generateGemini(mdl,fp)
          if(r.imageUrls.length){ conv.msgs[aiIdx].images.push(...r.imageUrls); scrollBot(); break }
          if(r.text) conv.msgs[aiIdx].text=r.text
        } catch(e:any){if(a===3)break;await new Promise(r=>setTimeout(r,a*2000))}
      }
    } else {
      const errors: string[] = []
      const tasks=Array.from({length:total},async ()=>{
        if(refs.length) {
          // 图生图走同步
          try {
            const r=await editImage(mdl,fp,refs,1,sz,undefined,qual)
            if(r.imageUrls.length){conv.msgs[aiIdx].images.push(...r.imageUrls);scrollBot()}
          } catch(e:any){if(e?.message) errors.push(e.message)}
        } else {
          // 文生图走异步：先提交拿 taskId，存到消息，再轮询
          try {
            const sub=await submitImageTask(mdl,fp,1,sz,qual)
            if('imageUrls' in sub){if(sub.imageUrls.length){conv.msgs[aiIdx].images.push(...sub.imageUrls);scrollBot()};return}
            conv.msgs[aiIdx].taskId=sub.taskId; doSave()  // 存 taskId，关页面可恢复
            const r=await pollTask(sub.taskId)
            if(r.imageUrls.length){conv.msgs[aiIdx].images.push(...r.imageUrls);scrollBot()}
          } catch(e:any){if(e?.message) errors.push(e.message)}
        }
      })
      await Promise.allSettled(tasks)
      if(!conv.msgs[aiIdx].images.length && errors.length) conv.msgs[aiIdx].text = errors[0]
    }
    conv.msgs[aiIdx].status = conv.msgs[aiIdx].images.length ? 'done' : 'failed'
    conv.msgs[aiIdx].time = new Date().toISOString()
  } catch{ conv.msgs[aiIdx].status='failed'; conv.msgs[aiIdx].time=new Date().toISOString() }
  finally { activeTasks.value--; clearInterval(timer); delete timers[tKey]; doSave() }
}
// ===== 恢复未完成的异步任务 =====
function resumePendingTasks() {
  for (const conv of convs.value) {
    for (let i = 0; i < conv.msgs.length; i++) {
      const m = conv.msgs[i]
      if (m.role === 'ai' && m.status === 'generating' && m.taskId) {
        // 有 taskId 的 generating 消息 → 恢复轮询
        const aiIdx = i; const tKey = m.time
        timers[tKey] = 0
        const timer = setInterval(() => { timers[tKey]++ }, 1000)
        activeTasks.value++
        pollTask(m.taskId, undefined, true).then(r => {
          if (r.imageUrls.length) { conv.msgs[aiIdx].images.push(...r.imageUrls); scrollBot() }
          conv.msgs[aiIdx].status = conv.msgs[aiIdx].images.length ? 'done' : 'failed'
          conv.msgs[aiIdx].time = new Date().toISOString()
        }).catch(() => {
          conv.msgs[aiIdx].status = 'failed'; conv.msgs[aiIdx].time = new Date().toISOString()
        }).finally(() => {
          activeTasks.value--; clearInterval(timer); delete timers[tKey]; doSave()
        })
      } else if (m.role === 'ai' && m.status === 'generating' && !m.taskId) {
        // 没有 taskId 的 generating → 旧数据，直接标失败
        m.status = m.images.length ? 'done' : 'failed'
      }
    }
  }
}
function copyPrompt(text?:string) {
  if(!text) return
  navigator.clipboard.writeText(text).then(()=>ElMessage.success('已复制')).catch(()=>ElMessage.error('复制失败'))
}
function useAsRef(url:string) {
  if(uploadedImages.value.length>=4) { ElMessage.warning('最多4张参考图'); return }
  uploadedImages.value.push(url)
  ElMessage.success('已添加为参考图')
  nextTick(()=>{ const el = document.querySelector('.input-box') as HTMLTextAreaElement; el?.focus() })
}
function editPrompt(msg:Msg) {
  if(msg.prompt) prompt.value = msg.prompt
  if(msg.refs?.length) uploadedImages.value = [...msg.refs]
  if(msg.model) selectedModel.value = msg.model
  if(msg.ratio) gptRatio.value = msg.ratio
  if(msg.quality) gptQuality.value = msg.quality
  if(msg.count && msg.count >= 1) gptN.value = msg.count
  nextTick(()=>{ const el = document.querySelector('.input-box') as HTMLTextAreaElement; el?.focus() })
}
function handleEnter(e:KeyboardEvent){if(!e.shiftKey){e.preventDefault();generate()}}
// v-click-outside directive
const vClickOutside = { mounted(el:any,binding:any){ el._co=((e:Event)=>{if(!el.contains(e.target)) binding.value(e)}); document.addEventListener('click',el._co) }, unmounted(el:any){ document.removeEventListener('click',el._co) } }
</script>

<template>
<div v-if="!authOk" class="auth-page">
  <div class="auth-orb auth-orb-a"></div>
  <div class="auth-orb auth-orb-b"></div>
  <div class="auth-shell">
    <section class="auth-hero">
      <div class="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none"><path d="M32 6c6.2 0 11.3 4.4 12.5 10.2A13.3 13.3 0 0 1 58 29.4c0 5.6-3.5 10.5-8.4 12.4A13.1 13.1 0 0 1 36.7 58c-4 0-7.7-1.8-10.1-4.6A13.2 13.2 0 0 1 8 41.8 13.1 13.1 0 0 1 6 29.4c0-5.6 3.5-10.5 8.4-12.4A13.1 13.1 0 0 1 27.3 6H32Z" stroke="currentColor" stroke-width="3.6" stroke-linejoin="round"/><path d="M21 19.7 32 13l11 6.7v12.8L32 39.2l-11-6.7V19.7Z" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"/><path d="m21 32.5 11-6.7 11 6.7M32 13v12.8M32 39.2V52" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <p class="auth-kicker">GPT Image Studio</p>
      <h1 class="auth-title">输入卡密后，直接进入创作工作台</h1>
      <p class="auth-sub">支持文生图、图生图、多比例和高清放大，验证卡密后即可开始。</p>
      <div class="auth-actions">
        <button class="auth-link-btn" @click="router.push('/docs')">查看开发文档</button>
        <button class="theme-btn" @click="config.dark=!config.dark">{{ config.dark ? '浅色模式' : '深色模式' }}</button>
      </div>
      <div class="auth-feature-grid">
        <article v-for="f in authFeatures" :key="f.title" class="auth-feature">
          <div class="feature-dot"></div>
          <div><h3>{{ f.title }}</h3><p>{{ f.desc }}</p></div>
        </article>
      </div>
    </section>
    <section class="auth-card">
      <div class="auth-card-head">
        <div class="auth-card-icon" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none"><path d="M16 4.5c2.7 0 5 1.9 5.5 4.4a5.8 5.8 0 0 1 2.3 10.8 5.8 5.8 0 0 1-7.8 7.6 5.8 5.8 0 0 1-7.8-7.6A5.8 5.8 0 0 1 10.5 8.9 5.7 5.7 0 0 1 16 4.5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M11.4 12.5 16 9.7l4.6 2.8v5.4L16 20.7l-4.6-2.8v-5.4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        </div>
        <div>
          <div class="auth-logo">AI Studio</div>
          <div class="auth-desc">验证卡密后开始生成图片</div>
        </div>
      </div>
      <label class="auth-label" for="api-key-input">访问卡密</label>
      <input id="api-key-input" v-model="keyInput" type="password" placeholder="请输入你的卡密" class="auth-input" @keydown.enter="verifyKey"/>
      <button class="auth-btn" :disabled="authLoading" @click="verifyKey">
        <span>{{ authLoading ? '验证中...' : '进入工作台' }}</span>
        <svg v-if="!authLoading" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
      <div class="auth-footnote">支持 GPT Image 2、图生图、多比例和高清放大。</div>
    </section>
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
      <div v-else-if="!curConv?.msgs.length" class="chat-empty"><div class="ce-icon"><svg viewBox="0 0 64 64" fill="none"><path d="M32 6c6.2 0 11.3 4.4 12.5 10.2A13.3 13.3 0 0 1 58 29.4c0 5.6-3.5 10.5-8.4 12.4A13.1 13.1 0 0 1 36.7 58c-4 0-7.7-1.8-10.1-4.6A13.2 13.2 0 0 1 8 41.8 13.1 13.1 0 0 1 6 29.4c0-5.6 3.5-10.5 8.4-12.4A13.1 13.1 0 0 1 27.3 6H32Z" stroke="currentColor" stroke-width="3.6" stroke-linejoin="round"/><path d="M21 19.7 32 13l11 6.7v12.8L32 39.2l-11-6.7V19.7Z" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"/><path d="m21 32.5 11-6.7 11 6.7M32 13v12.8M32 39.2V52" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="ce-title">开始创作</div><div class="ce-sub">输入描述，生成你想要的图片</div></div>
      <template v-for="(msg,mi) in (curConv?.msgs||[])" :key="mi">
        <div v-if="msg.role==='user'" class="msg msg-user">
          <div class="msg-bubble u-bbl">
            <div class="msg-text">{{ msg.prompt }}</div>
          </div>
          <div class="msg-under">
            <div class="msg-actions">
              <button class="msg-act-btn" title="复制" @click.stop="copyPrompt(msg.prompt)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
              <button class="msg-act-btn" title="编辑" @click.stop="editPrompt(msg)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            </div>
            <div class="msg-time">{{ fmtT(msg.time) }}</div>
          </div>
        </div>
        <div v-else class="msg msg-ai">
          <div v-if="msg.status==='generating'" class="img-row-bare">
            <template v-for="(url,ii) in msg.images" :key="'done_'+ii">
              <div class="img-card" @click="openPv(url)">
                <img :src="url"/>
                <div class="img-hover">
                  <button class="img-act" @click.stop="useAsRef(url)" title="图生图">编辑</button>
                  <button class="img-act img-act-dl" @click.stop="dlImg(url,ii)" title="下载">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                </div>
              </div>
            </template>
            <div v-for="s in Math.max(0, (msg.count||1) - msg.images.length)" :key="'sk_'+s" class="img-skeleton">
              <div class="skeleton-shimmer"></div>
              <div class="skeleton-info">
                <div class="gen-spin-sm"></div>
                <span>{{ timers[msg.time] || 0 }}s</span>
              </div>
            </div>
          </div>
          <div v-else-if="msg.status==='failed'" class="msg-bubble a-bbl"><div class="gen-fail">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0;margin-top:2px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span style="flex:1">{{ msg.text || '生成失败，请重试' }}</span>
          </div></div>
          <div v-if="msg.images.length" class="img-row-bare">
            <div v-for="(url,ii) in msg.images" :key="ii" class="img-card" @click="openPv(url)">
              <img :src="url"/>
              <div class="img-hover">
                <button class="img-act" @click.stop="useAsRef(url)" title="图生图">编辑</button>
                <button class="img-act img-act-dl" @click.stop="dlImg(url,ii)" title="下载">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
              </div>
            </div>
          </div>
          <div v-if="msg.images.length && mi>0 && curConv?.msgs[mi-1]?.role==='user'" class="img-info">
            <span>{{ curConv.msgs[mi-1].model }}</span>
            <span v-if="curConv.msgs[mi-1].ratio">{{ curConv.msgs[mi-1].ratio }}</span>
            <span v-if="curConv.msgs[mi-1].quality && curConv.msgs[mi-1].quality!=='1k'">{{ curConv.msgs[mi-1].quality?.toUpperCase() }}</span>
            <span v-if="(curConv.msgs[mi-1].count||0)>1">{{ curConv.msgs[mi-1].count }}张</span>
          </div>
          <pre v-if="msg.text && msg.status!=='failed'" class="ai-text">{{ msg.text }}</pre>
        </div>
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
        <!-- 输入框 -->
        <textarea v-model="prompt" rows="1" placeholder="描述或编辑图片" class="input-box" @keydown.enter="handleEnter"></textarea>
        <!-- 底部工具栏 -->
        <div class="toolbar">
          <div class="tb-left">
            <button class="tb-icon-btn" @click="triggerUpload" title="图片">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>图片</span>
            </button>
            <!-- 模型 -->
            <div class="model-picker" v-click-outside="()=>modelOpen=false">
              <button class="tb-icon-btn" @click="modelOpen=!modelOpen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                <span>{{ selectedModel ? selectedModel.replace('gpt-image-2','GPT').replace('gemini-3.1-flash-image','Gemini') : '模型' }}</span>
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
            <div class="ratio-picker" v-click-outside="()=>ratioOpen=false">
              <button class="tb-icon-btn" @click="ratioOpen=!ratioOpen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                <span>{{ RATIOS.find(r=>r.ratio===gptRatio)?.label || gptRatio }}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div v-if="ratioOpen" class="model-drop">
                <div v-for="r in RATIOS" :key="r.ratio" class="model-opt" :class="{sel:gptRatio===r.ratio}" @click="gptRatio=r.ratio;ratioOpen=false">
                  {{ r.label }}
                  <svg v-if="gptRatio===r.ratio" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
            </div>
            <!-- 画质（Gemini 不支持） -->
            <div v-if="!isGemini" class="quality-picker" v-click-outside="()=>qualityOpen=false">
              <button class="tb-icon-btn" @click="qualityOpen=!qualityOpen">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"/></svg>
                <span>{{ QUALITIES.find(q=>q.value===gptQuality)?.label || '标准' }}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div v-if="qualityOpen" class="model-drop">
                <div v-for="q in QUALITIES" :key="q.value" class="model-opt" :class="{sel:gptQuality===q.value}" @click="gptQuality=q.value;qualityOpen=false">
                  {{ q.label }}
                  <svg v-if="gptQuality===q.value" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
              </div>
            </div>
            <!-- 张数 -->
            <div class="tb-n">
              <button class="tb-nb" :disabled="gptN<=1" @click="gptN--">−</button>
              <span class="tb-nv">{{ gptN }}张</span>
              <button class="tb-nb" :disabled="gptN>=4" @click="gptN++">＋</button>
            </div>
          </div>
          <button class="send-btn" :disabled="!prompt.trim()" @click="generate">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
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
// Auth - new design
.auth-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);position:relative;overflow:hidden}
.auth-orb{position:absolute;border-radius:50%;filter:blur(100px);opacity:.15;pointer-events:none}
.auth-orb-a{width:600px;height:600px;background:var(--primary);top:-200px;left:-100px}
.auth-orb-b{width:500px;height:500px;background:var(--accent);bottom:-150px;right:-80px}
.auth-shell{position:relative;z-index:1;display:flex;gap:48px;align-items:stretch;max-width:960px;width:92%;padding:40px 0}
.auth-hero{flex:1;display:flex;flex-direction:column;justify-content:center}
.brand-mark{width:56px;height:56px;color:var(--primary);margin-bottom:20px}
.brand-mark svg{width:100%;height:100%}
.auth-kicker{font-size:13px;font-weight:600;color:var(--primary);letter-spacing:.04em;margin-bottom:12px}
.auth-title{font-size:clamp(26px,3.2vw,36px);font-weight:800;line-height:1.2;letter-spacing:-1px;color:var(--text);margin:0 0 16px}
.auth-sub{font-size:15px;color:var(--text-soft);line-height:1.6;margin-bottom:24px}
.auth-actions{display:flex;gap:10px;margin-bottom:32px}
.auth-link-btn{border:1px solid var(--border);background:var(--bg-card-solid);color:var(--text);padding:8px 18px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .2s}
.auth-link-btn:hover{border-color:var(--text-mute);background:var(--bg-soft)}
.theme-btn{border:1px solid var(--border);background:transparent;color:var(--text-soft);padding:8px 18px;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:all .2s}
.theme-btn:hover{color:var(--text);border-color:var(--text-mute)}
.auth-feature-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.auth-feature{display:flex;gap:12px;align-items:flex-start}
.feature-dot{width:8px;height:8px;border-radius:50%;background:var(--primary);margin-top:6px;flex-shrink:0;opacity:.7}
.auth-feature h3{font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px}
.auth-feature p{font-size:13px;color:var(--text-soft);margin:0;line-height:1.5}
.auth-card{width:360px;flex-shrink:0;background:var(--bg-card-solid);border:1px solid var(--border);border-radius:20px;padding:36px 32px;box-shadow:var(--shadow-md);display:flex;flex-direction:column}
.auth-card-head{display:flex;align-items:center;gap:14px;margin-bottom:24px}
.auth-card-icon{width:44px;height:44px;border-radius:12px;background:var(--primary-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.auth-card-icon svg{width:24px;height:24px}
.auth-logo{font-size:18px;font-weight:700;color:var(--text)}
.auth-desc{font-size:13px;color:var(--text-mute)}
.auth-label{font-size:12px;font-weight:600;color:var(--text-soft);margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em}
.auth-input{width:100%;padding:14px 16px;border:1px solid var(--border);border-radius:12px;font-size:15px;background:var(--bg-soft);color:var(--text);outline:none;box-sizing:border-box;margin-bottom:16px;font-family:inherit}
.auth-input:focus{border-color:var(--primary)}
.auth-btn{width:100%;padding:14px;border:none;border-radius:12px;background:var(--primary);color:#fff;font-size:15px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px}
.auth-btn:disabled{opacity:.5;cursor:not-allowed}
.auth-btn:not(:disabled):hover{opacity:.9}
.auth-footnote{font-size:12px;color:var(--text-mute);text-align:center;margin-top:16px}
@media(max-width:768px){
  .auth-shell{flex-direction:column;gap:32px;padding:24px 0}
  .auth-card{width:100%}
  .auth-feature-grid{grid-template-columns:1fr}
}
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
.ce-icon{width:64px;height:64px;margin-bottom:16px;opacity:.8;color:var(--text-soft)}
.ce-icon svg{width:100%;height:100%}
.ce-title{font-size:22px;font-weight:700;color:var(--text);margin-bottom:8px;letter-spacing:-0.5px}
.ce-sub{font-size:15px;color:var(--text-soft)}
.msg{display:flex;gap:12px;margin:0 auto;width:100%;max-width:800px}
.msg-ai{justify-content:flex-start;flex-direction:column;align-items:flex-start}
.msg-bubble{max-width:85%;padding:16px 20px;border-radius:20px;font-size:15px;line-height:1.6;word-break:break-word}
.u-bbl{background:var(--bg-card-solid);color:var(--text);border:1px solid var(--border);border-radius:20px 20px 4px 20px;box-shadow:var(--shadow-sm)}
.a-bbl{background:var(--bg-card-solid);border:1px solid var(--border);border-radius:20px 20px 20px 4px;box-shadow:var(--shadow-sm)}
.msg-user{flex-direction:column;align-items:flex-end}
.msg-text{margin-bottom:0}
.msg-under{display:flex;align-items:center;justify-content:space-between;margin-top:4px;padding:0 4px;opacity:0;transition:opacity .2s}
.msg-user:hover .msg-under{opacity:1}
.msg-actions{display:flex;gap:2px}
.msg-time{font-size:12px;color:var(--text-mute)}
.msg-act-btn{width:28px;height:28px;border-radius:8px;border:none;background:transparent;color:var(--text-mute);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;padding:0}
.msg-act-btn:hover{color:var(--text)}
.img-info{display:flex;gap:8px;font-size:12px;color:var(--text-mute);margin-top:6px;opacity:0;transition:opacity .2s}
.msg-ai:hover .img-info{opacity:1}
// Gen
.gen-loading{display:flex;align-items:center;gap:12px;font-size:15px;color:var(--text);padding:8px 0;font-weight:500}
.gen-spin{width:22px;height:22px;border-radius:50%;border:2.5px solid var(--border);border-top-color:var(--primary);animation:sp .8s linear infinite}
.gen-spin-sm{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
// Skeleton
.img-skeleton{position:relative;width:240px;height:240px;border-radius:24px;overflow:hidden;background:var(--bg-soft);border:1px solid var(--border);flex-shrink:0}
.skeleton-shimmer{position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(var(--primary-rgb),0.04) 50%,transparent 70%);background-size:300% 100%;animation:shimmer 1.8s ease-in-out infinite}
html.dark .skeleton-shimmer{background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,0.03) 50%,transparent 70%);background-size:300% 100%;animation:shimmer 1.8s ease-in-out infinite}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.skeleton-info{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 16px;border-radius:20px;background:rgba(0,0,0,.45);backdrop-filter:blur(8px);color:#fff;font-size:13px;font-weight:500;white-space:nowrap}
.gen-fail{color:#ff3b30;font-size:15px;padding:12px 16px;font-weight:500;background:rgba(255,59,48,0.1);border-radius:12px;display:flex;align-items:flex-start;gap:8px}
.img-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
.img-row-bare{display:flex;gap:12px;flex-wrap:wrap}
.img-card{position:relative;width:auto;max-width:480px;border-radius:24px;overflow:hidden;cursor:zoom-in;flex-shrink:0;transition:none}
.img-card img{width:100%;display:block}
.img-card:hover{}
.img-hover{position:absolute;bottom:0;left:0;right:0;padding:14px;display:flex;justify-content:space-between;align-items:flex-end;opacity:0;transition:opacity .2s;background:linear-gradient(transparent,rgba(0,0,0,.5))}
.img-card:hover .img-hover{opacity:1}
.img-act{height:32px;border-radius:10px;border:none;background:rgba(255,255,255,.2);cursor:pointer;font-size:13px;font-weight:600;color:#fff;display:flex;align-items:center;justify-content:center;padding:0 14px;gap:4px;transition:all 0.2s;backdrop-filter:blur(8px)}
.img-act:hover{background:rgba(255,255,255,.35)}
.img-act-dl{width:32px;padding:0}
.img-hover button:hover{background:rgba(255,255,255,.35)}
.ai-text{font-size:14px;color:var(--text-soft);white-space:pre-wrap;word-break:break-all;line-height:1.6;margin-top:12px;font-family:'SF Mono',Menlo,monospace;background:var(--bg-soft);padding:12px 16px;border-radius:12px;border:1px solid var(--border)}
// Input Area
.input-area{padding:0 20px 20px;max-width:800px;margin:0 auto;width:100%}
.input-card{background:var(--bg-card-solid);border:1px solid var(--border);border-radius:24px;padding:16px 20px 12px;box-shadow:var(--shadow-sm);transition:border-color .2s,box-shadow .2s}
.input-card:focus-within{border-color:var(--text-mute);box-shadow:var(--shadow-md)}
.input-card.dragover{border-color:var(--primary);background:var(--primary-soft)}
.ref-bar{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.ref-item{position:relative;width:56px;height:56px;border-radius:10px;overflow:hidden;border:1px solid var(--border);box-shadow:var(--shadow-sm)}
.ref-item img{width:100%;height:100%;object-fit:cover}
.ref-x{position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;backdrop-filter:blur(4px);transition:all 0.2s}
.ref-x:hover{background:#ff3b30;transform:scale(1.1)}
.input-box{width:100%;resize:none;border:none;padding:0 0 8px;font-size:16px;background:transparent;color:var(--text);outline:none;font-family:inherit;min-height:28px;max-height:160px;line-height:1.5;display:block}
.input-box::placeholder{color:var(--text-mute)}
// Drag hint
.drag-hint{display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;color:var(--primary);font-size:14px;font-weight:600;background:var(--primary-soft);border-radius:12px;margin-bottom:12px;border:1px dashed rgba(var(--primary-rgb),0.3)}
// Toolbar
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px}
.tb-left{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.tb-icon-btn{display:inline-flex;align-items:center;gap:5px;border:none;background:transparent;border-radius:10px;padding:6px 10px;font-size:13px;cursor:pointer;color:var(--text-soft);font-family:inherit;transition:all .15s;white-space:nowrap;font-weight:500}
.tb-icon-btn:hover{background:var(--bg-soft);color:var(--text)}
.tb-icon-btn span{font-weight:600}
.send-btn{width:36px;height:36px;border-radius:50%;border:none;background:#1d1d1f;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s}
html.dark .send-btn{background:#f5f5f7;color:#1d1d1f}
.send-btn:not(:disabled):hover{opacity:.8;transform:scale(1.05)}
.send-btn:disabled{opacity:.2;cursor:not-allowed}
// Model / Ratio / Quality picker
.model-picker,.ratio-picker,.quality-picker{position:relative}
.model-drop{position:absolute;bottom:calc(100% + 8px);left:0;min-width:200px;max-height:280px;overflow-y:auto;background:var(--bg-card-solid);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-lg);padding:4px;z-index:100;backdrop-filter:blur(20px)}
.model-opt{padding:10px 14px;border-radius:10px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--text);transition:all .15s}
.model-opt:hover{background:var(--bg-soft)}
.model-opt.sel{color:var(--primary);font-weight:600;background:var(--primary-soft)}
// Count
.tb-n{display:flex;align-items:center;gap:2px;border-radius:10px}
.tb-nb{border:none;background:transparent;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:15px;color:var(--text-soft);display:flex;align-items:center;justify-content:center;font-family:inherit;transition:all .2s;line-height:1}
.tb-nb:hover:not(:disabled){background:var(--bg-soft);color:var(--text)}
.tb-nb:disabled{opacity:.2;cursor:not-allowed}
.tb-nv{font-size:13px;color:var(--text);min-width:28px;text-align:center;font-weight:600}
// Scrollbar
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
// Mobile
@media(max-width:768px){
  .side{position:fixed;left:-280px;top:0;bottom:0;width:260px;transition:left .25s ease;z-index:91;box-shadow:4px 0 20px rgba(0,0,0,.15)}
  .side.open{left:0}
  .mobile-only{display:flex !important}
  .img-card{max-width:100%}
  .msg-bubble{max-width:92%}
  .input-area{padding:0 10px 12px}
  .input-card{border-radius:18px;padding:12px 14px 8px}
  .model-drop{min-width:160px}
  .tb-icon-btn span{display:none}
}
</style>
<style lang="scss">
.preview-dlg .el-dialog{margin-top:5vh !important;margin-bottom:5vh !important;max-height:90vh;display:flex;flex-direction:column}
.preview-dlg .el-dialog__body{padding:12px;overflow:auto;display:flex;align-items:center;justify-content:center;flex:1;min-height:0}
</style>