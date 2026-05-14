<template>
  <div class="analysis-content">
    <div class="field">
      <label>分析提示词</label>
      <textarea
        v-model="node.config.prompt"
        class="textarea prompt-input"
        rows="4"
        placeholder="请输入分析要求..."
        @click.stop
      />
    </div>
    <button class="btn-run" @click.stop="runAnalysis">
      ▶ 运行分析
    </button>
  </div>
</template>

<script setup>
const props = defineProps({ node: { type: Object, required: true } })

async function runAnalysis() {
  // 通过 agent chat 触发分析
  const upstream = props.node._upstream || []
  const sources = upstream.filter(n => n.type === 'data-source')
  let prompt = '请分析以下数据：\n\n'
  sources.forEach(ds => {
    prompt += `- ${ds.config.fileName}: ${ds.config.description}\n`
    if (ds.config.sampleData) prompt += `\`\`\`\n${ds.config.sampleData}\n\`\`\`\n`
  })
  prompt += `\n分析要求：${props.node.config.prompt || '请分析数据并给出洞察。'}`

  await fetch('/api/agent/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: prompt }),
  })
}
</script>

<style scoped>
.analysis-content { display: flex; flex-direction: column; gap: 8px; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; }
.textarea {
  font-size: 12px; padding: 6px 8px; border-radius: 4px;
  border: 1px solid var(--border-color); background: var(--bg-primary);
  color: var(--text-primary); outline: none; transition: border-color 0.15s;
  width: 100%; font-family: inherit; resize: vertical; min-height: 60px;
}
.textarea:focus { border-color: var(--accent-purple); }
.btn-run {
  width: 100%; padding: 8px; border: none; border-radius: var(--radius-sm);
  background: var(--accent-purple); color: white; font-size: 13px;
  font-weight: 600; cursor: pointer; transition: all 0.15s ease;
}
.btn-run:hover { background: #8b6cfc; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(124, 92, 252, 0.3); }
</style>
