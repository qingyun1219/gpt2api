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
    <a class="logo"><span class="lo-i">✦</span><span class="lo-t">AI Studio</span></a>
    <div style="display:flex;align-items:center;gap:10px">
      <el-button link @click="config.dark=!config.dark"><el-icon :size="18"><component :is="config.dark?'Sunny':'Moon'"/></el-icon></el-button>
      <el-button type="primary" round @click="go">开始创作 <el-icon><ArrowRight/></el-icon></el-button>
    </div>
  </div></header>

  <section class="hero">
    <div class="hero-in">
      <p class="eyebrow">GPT Image 2 · 文生图 · 图生图 · 2K/4K 放大</p>
      <h1 class="title"><span class="gradient-text">AI 图片生成</span><br/>高清创作，一键完成</h1>
      <p class="sub">专业级 AI 图片生成平台，支持文生图、图生图、多比例、2K/4K 高清放大<br/>OpenAI 兼容 API · 即开即用</p>
      <el-button size="large" type="primary" round @click="go" class="hero-btn"><el-icon><VideoPlay/></el-icon> 立即体验</el-button>
    </div>
  </section>

  <section class="sec">
    <h2 class="sec-h">核心能力</h2>
    <div class="feat-grid">
      <div v-for="f in features" :key="f.title" class="feat-card">
        <div class="feat-icon"><el-icon :size="24"><component :is="f.icon"/></el-icon></div>
        <div class="feat-title">{{ f.title }}</div>
        <div class="feat-desc">{{ f.desc }}</div>
      </div>
    </div>
  </section>

  <section class="sec cta-sec">
    <h2 class="sec-h" style="margin-bottom:16px">准备好了吗？</h2>
    <p class="sub" style="margin-bottom:32px">输入 API Key，选择模型，即刻开始 AI 创作</p>
    <el-button size="large" type="primary" round @click="go">进入工作台 <el-icon><ArrowRight/></el-icon></el-button>
  </section>

  <footer class="ft"><span>© {{ new Date().getFullYear() }} AI Studio · OpenAI 兼容图片生成</span></footer>
</div></template>

<style scoped lang="scss">
.home{min-height:100vh;display:flex;flex-direction:column}
.nav{position:sticky;top:0;z-index:50;padding:14px 0;background:var(--nav-bg);border-bottom:1px solid var(--border);backdrop-filter:saturate(180%) blur(16px)}
.nav-in{max-width:1100px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between}
.logo{display:inline-flex;align-items:center;gap:8px;cursor:pointer;text-decoration:none}
.lo-i{font-size:20px} .lo-t{font-size:17px;font-weight:700;color:var(--text);letter-spacing:-0.3px}
.hero{text-align:center;padding:100px 24px 80px;position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;inset:-20%;z-index:0;pointer-events:none;
  background:radial-gradient(600px 300px at 30% 40%,rgba(0,113,227,.06),transparent 60%),
             radial-gradient(500px 300px at 70% 30%,rgba(191,90,242,.05),transparent 60%)}
html.dark .hero::before{background:radial-gradient(600px 300px at 30% 40%,rgba(0,113,227,.1),transparent 60%),
                                    radial-gradient(500px 300px at 70% 30%,rgba(191,90,242,.08),transparent 60%)}
.hero-in{position:relative;z-index:1;max-width:720px;margin:0 auto}
.eyebrow{display:inline-block;padding:6px 16px;border-radius:980px;border:1px solid var(--border);font-size:12px;color:var(--text-mute);letter-spacing:.02em;background:var(--bg-card)}
.title{font-size:clamp(38px,5.5vw,64px);line-height:1.1;margin:28px 0 20px;font-weight:800;letter-spacing:-1px}
.sub{font-size:17px;color:var(--text-soft);line-height:1.7}
.hero-btn{font-size:16px;padding:12px 32px;height:auto}
.sec{padding:64px 24px 80px;max-width:1100px;margin:0 auto;width:100%}
.sec-h{text-align:center;font-size:28px;font-weight:800;margin-bottom:40px;letter-spacing:-.5px}
.feat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.feat-card{background:var(--bg-card-solid);border:1px solid var(--border);border-radius:var(--radius);padding:28px 22px;transition:transform .2s,box-shadow .2s}
.feat-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-lg)}
.feat-icon{width:48px;height:48px;border-radius:12px;background:var(--primary-soft);color:var(--primary);display:flex;align-items:center;justify-content:center;margin-bottom:16px}
.feat-title{font-size:16px;font-weight:700;margin-bottom:8px}
.feat-desc{font-size:14px;color:var(--text-soft);line-height:1.7}
.cta-sec{text-align:center;padding:80px 24px 100px}
.ft{margin-top:auto;border-top:1px solid var(--border);padding:24px;text-align:center;font-size:12px;color:var(--text-mute)}
@media(max-width:900px){.feat-grid{grid-template-columns:repeat(2,1fr)}}
@media(max-width:600px){.feat-grid{grid-template-columns:1fr} .hero{padding:60px 20px 50px}}
</style>