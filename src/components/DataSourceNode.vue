<template>
  <div class="data-source-content">
    <div class="field">
      <label>文件名</label>
      <input v-model="node.config.fileName" class="input" placeholder="文件名" @click.stop />
    </div>
    <div class="field">
      <label>描述</label>
      <textarea
        v-model="node.config.description"
        class="textarea"
        rows="2"
        placeholder="数据描述"
        @click.stop
      />
    </div>
    <div class="field" v-if="node.config.sampleData">
      <label>示例数据</label>
      <pre class="data-preview">{{ node.config.sampleData.slice(0, 120) }}{{ node.config.sampleData.length > 120 ? '...' : '' }}</pre>
    </div>
  </div>
</template>

<script setup>
defineProps({
  node: { type: Object, required: true },
})
</script>

<style scoped>
.data-source-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.input, .textarea {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
}

.input:focus, .textarea:focus {
  border-color: var(--accent-blue);
}

.textarea {
  resize: vertical;
  font-family: inherit;
}

.data-preview {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 6px 8px;
  overflow: hidden;
  white-space: pre;
  font-family: 'SF Mono', 'Fira Code', monospace;
  max-height: 60px;
}
</style>
