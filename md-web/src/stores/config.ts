import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useConfigStore = defineStore('config', () => {
  const nodes = [
    { label: '🇺🇸 美国节点（推荐）', value: 'https://cc.qycnas.cn' },
    { label: '🇭🇰 香港节点', value: 'https://cc.jispul.com' },
  ]

  const baseUrl = ref(localStorage.getItem('ai_node') || nodes[0].value)
  const apiKey = ref(localStorage.getItem('ai_key') || '')
  const dark = ref(localStorage.getItem('ai_dark') === '1')

  watch(baseUrl, v => localStorage.setItem('ai_node', v))
  watch(apiKey, v => localStorage.setItem('ai_key', v))
  watch(dark, v => {
    localStorage.setItem('ai_dark', v ? '1' : '0')
    document.documentElement.classList.toggle('dark', v)
  }, { immediate: true })

  function save() {
    localStorage.setItem('ai_node', baseUrl.value)
    localStorage.setItem('ai_key', apiKey.value)
  }

  return { nodes, baseUrl, apiKey, dark, save }
})
