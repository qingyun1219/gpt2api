import { createRouter, createWebHashHistory } from 'vue-router'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('@/views/Playground.vue') },
    { path: '/play', redirect: '/' },
    { path: '/home', component: () => import('@/views/Home.vue') },
    { path: '/docs', component: () => import('@/views/Docs.vue') },
  ],
})
