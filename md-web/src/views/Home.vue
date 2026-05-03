<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
const router = useRouter()
const config = useConfigStore()
function go() { router.push('/play') }

const features = [
  { icon: 'MagicStick', title: 'AI 文生图', desc: '输入文字描述，AI 为你生成高清图片。支持多种模型和风格。' },
  { icon: 'Picture', title: '图生图编辑', desc: '上传参考图片，AI 理解内容并生成全新创作，支持多图参考。' },
  { icon: 'FullScreen', title: '2K / 4K 放大', desc: '一键输出 2K 或 4K 高清大图，满足印刷、海报等高分辨率需求。' },
  { icon: 'Grid', title: '多比例 · 多张数', desc: '1:1、16:9、9:16 等多种画面比例，单次最多 4 张并发生成。' },
]
</script>

<template><div class="home">
  <header class="nav"><div class="nav-in">
    <a class="logo">
      <svg class="lo-i" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>
      <span class="lo-t">AI Studio</span>
    </a>
    <div style="display:flex;align-items:center;gap:12px">
      <button class="nav-btn-icon" @click="config.dark=!config.dark" :title="config.dark?'切换浅色模式':'切换深色模式'">
        <svg v-if="config.dark" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      <button class="nav-btn-secondary" @click="router.push('/docs')">
        开发文档
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
      </button>
      <button class="nav-btn-primary" @click="go">
        开始创作
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>
    </div>
  </div></header>

  <section class="hero">
    <div class="hero-in">
      <p class="eyebrow">GPT Image 2 · 文生图 · 图生图 · 2K/4K 放大</p>
      <h1 class="title"><span class="gradient-text">AI 图片生成</span><br/>高清创作，一键完成</h1>
      <p class="sub">专业级 AI 图片生成平台，支持文生图、图生图、多比例、2K/4K 高清放大<br/>OpenAI 兼容 API · 即开即用</p>
      <button class="hero-btn" @click="go">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        立即体验
      </button>
    </div>
  </section>

  <section class="sec">
    <h2 class="sec-h">核心能力</h2>
    <div class="feat-grid">
      <div v-for="f in features" :key="f.title" class="feat-card">
        <div class="feat-icon">
          <svg v-if="f.icon==='MagicStick'" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
          <svg v-else-if="f.icon==='Picture'" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <svg v-else-if="f.icon==='FullScreen'" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 3 3 3 3 8"/><polyline points="16 3 21 3 21 8"/><polyline points="8 21 3 21 3 16"/><polyline points="16 21 21 21 21 16"/></svg>
          <svg v-else viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </div>
        <div class="feat-title">{{ f.title }}</div>
        <div class="feat-desc">{{ f.desc }}</div>
      </div>
    </div>
  </section>
</div></template>

<style scoped lang="scss">
.home{min-height:100vh;display:flex;flex-direction:column;background:var(--bg)}
.nav{position:sticky;top:0;z-index:50;padding:16px 0;background:var(--nav-bg);border-bottom:1px solid var(--border);backdrop-filter:saturate(180%) blur(20px)}
.nav-in{max-width:1100px;margin:0 auto;padding:0 32px;display:flex;align-items:center;justify-content:space-between}
.logo{display:inline-flex;align-items:center;gap:10px;cursor:pointer;text-decoration:none;color:var(--text);transition:opacity 0.2s}
.logo:hover{opacity:0.8}
.lo-i{color:var(--primary)}
.lo-t{font-size:18px;font-weight:700;letter-spacing:-0.5px}

.nav-btn-icon{width:36px;height:36px;border-radius:50%;border:1px solid transparent;background:transparent;color:var(--text-soft);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s}
.nav-btn-icon:hover{background:var(--bg-soft);color:var(--text)}
.nav-btn-secondary{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;border-radius:18px;border:1px solid var(--border);background:var(--bg-card-solid);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s}
.nav-btn-secondary:hover{background:var(--bg-soft);border-color:var(--text-mute)}
.nav-btn-primary{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;border-radius:18px;border:none;background:var(--primary);color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(var(--primary-rgb),0.2)}
.nav-btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(var(--primary-rgb),0.3)}
.hero{text-align:center;padding:120px 24px 80px;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:-20%;z-index:0;pointer-events:none;
  background:radial-gradient(800px 400px at 30% 40%,rgba(0,113,227,.04),transparent 60%),
             radial-gradient(600px 400px at 70% 30%,rgba(191,90,242,.03),transparent 60%)}
html.dark .hero::before{background:radial-gradient(800px 400px at 30% 40%,rgba(0,113,227,.08),transparent 60%),
                                    radial-gradient(600px 400px at 70% 30%,rgba(191,90,242,.06),transparent 60%)}
.hero-in{position:relative;z-index:1;max-width:760px;margin:0 auto}
.eyebrow{display:inline-block;padding:6px 20px;border-radius:980px;border:1px solid var(--border);font-size:13px;color:var(--text-soft);letter-spacing:.02em;background:var(--bg-card-solid);box-shadow:var(--shadow-sm);font-weight:500}
.title{font-size:clamp(44px,6vw,72px);line-height:1.05;margin:32px 0 24px;font-weight:800;letter-spacing:-2px}
.sub{font-size:19px;color:var(--text-soft);line-height:1.6;font-weight:400;margin-bottom:40px}
.hero-btn{display:inline-flex;align-items:center;gap:8px;font-size:17px;padding:16px 40px;border-radius:30px;border:none;background:var(--primary);color:#fff;font-weight:600;cursor:pointer;transition:all 0.2s;box-shadow:0 4px 16px rgba(var(--primary-rgb),0.3)}
.hero-btn:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(var(--primary-rgb),0.4)}
.sec{padding:80px 24px 100px;max-width:1100px;margin:0 auto;width:100%}
.sec-h{text-align:center;font-size:32px;font-weight:700;margin-bottom:48px;letter-spacing:-.8px}
.feat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.feat-card{background:var(--bg-card-solid);border:1px solid var(--border);border-radius:24px;padding:32px 24px;transition:transform .3s cubic-bezier(0.25, 0.1, 0.25, 1),box-shadow .3s ease}
.feat-card:hover{transform:translateY(-6px);box-shadow:var(--shadow-lg)}
.feat-icon{width:56px;height:56px;border-radius:16px;background:var(--primary-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:inset 0 0 0 1px rgba(0,113,227,0.1)}
.feat-title{font-size:18px;font-weight:600;margin-bottom:12px;letter-spacing:-0.3px}
.feat-desc{font-size:15px;color:var(--text-soft);line-height:1.6}
@media(max-width:900px){.feat-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:600px){.feat-grid{grid-template-columns:1fr} .hero{padding:60px 20px 50px}}
</style>