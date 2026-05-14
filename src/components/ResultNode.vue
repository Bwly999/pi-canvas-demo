<template>
  <div class="result-content" ref="contentRef">
    <div v-if="!hasContent" class="result-empty">
      等待分析结果...
    </div>
    <div v-else class="result-markdown" v-html="renderedContent" />
    <div v-if="isStreaming" class="streaming-indicator">
      <span class="spinner" />
      <span>接收中</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const contentRef = ref(null)
const isStreaming = ref(false)

const hasContent = computed(() => {
  return props.node.config.content && props.node.config.content.length > 0
})

// 简易 Markdown 渲染 (table/headers/bold/code)
const renderedContent = computed(() => {
  if (!props.node.config.content) return ''
  let html = props.node.config.content
    // headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // inline code
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // tables
    .replace(/\|(.+)\|/g, (m) => {
      if (m.includes('---')) return '<hr class="table-sep" />'
      const cells = m.split('|').filter(c => c.trim())
      return `<tr>${cells.map(c => `<td>${c.trim()}</td>`).join('')}</tr>`
    })
    // lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
  return `<p>${html}</p>`
})

watch(() => props.node.config.content, () => {
  isStreaming.value = true
  // 自动滚动到底部
  setTimeout(() => {
    if (contentRef.value) {
      contentRef.value.scrollTop = contentRef.value.scrollHeight
    }
  }, 50)
  // 停止后清理
  setTimeout(() => { isStreaming.value = false }, 2000)
})
</script>

<style scoped>
.result-content {
  max-height: 180px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.6;
}

.result-empty {
  color: var(--text-muted);
  text-align: center;
  padding: 20px 0;
  font-size: 13px;
}

.result-markdown {
  color: var(--text-primary);
}

.result-markdown :deep(h1) { font-size: 15px; margin: 8px 0 4px; color: var(--accent-green); }
.result-markdown :deep(h2) { font-size: 14px; margin: 6px 0 3px; color: var(--accent-blue); }
.result-markdown :deep(h3) { font-size: 13px; margin: 4px 0 2px; color: var(--text-primary); }
.result-markdown :deep(strong) { color: var(--accent-purple); }
.result-markdown :deep(code) {
  background: var(--bg-primary);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  font-family: 'SF Mono', monospace;
  color: var(--accent-orange);
}
.result-markdown :deep(li) {
  margin-left: 12px;
  padding: 1px 0;
}
.result-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 6px 0;
}
.result-markdown :deep(td) {
  padding: 3px 6px;
  border: 1px solid var(--border-color);
  font-size: 11px;
}
.result-markdown :deep(hr.table-sep) {
  display: none;
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--accent-purple);
}

.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid rgba(124, 92, 252, 0.2);
  border-top-color: var(--accent-purple);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
