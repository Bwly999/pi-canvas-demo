<template>
  <aside class="node-inspector">
    <div class="inspector-header">
      <h3>🔧 节点配置</h3>
      <button class="btn-close" @click="$emit('close')">✕</button>
    </div>

    <div class="inspector-body">
      <!-- 数据源配置 -->
      <template v-if="node.type === 'data-source'">
        <div class="section">
          <div class="section-title">📂 {{ node.config.fileName }}</div>
          <div class="field">
            <label>文件名</label>
            <input v-model="node.config.fileName" class="input" />
          </div>
          <div class="field">
            <label>描述</label>
            <textarea v-model="node.config.description" class="textarea" rows="3" />
          </div>
          <div class="field">
            <label>样本数据</label>
            <textarea
              v-model="node.config.sampleData"
              class="textarea code"
              rows="5"
              placeholder="粘贴示例数据行..."
            />
          </div>
        </div>
      </template>

      <!-- AI 分析配置 -->
      <template v-if="node.type === 'analysis'">
        <div class="section">
          <div class="section-title">🤖 AI 分析</div>
          <div class="field">
            <label>模型选择</label>
            <select v-model="selectedModel" class="select" @change="onModelChange">
              <option v-if="models.length === 0" value="">加载模型中...</option>
              <option v-for="m in models" :key="m.provider + '/' + m.id" :value="m.provider + '/' + m.id">
                {{ m.provider }}/{{ m.name }}
              </option>
            </select>
          </div>
          <div class="field">
            <label>分析提示词</label>
            <textarea
              v-model="node.config.prompt"
              class="textarea prompt-large"
              rows="8"
              placeholder="设定分析目标和方向..."
            />
          </div>
          <div class="field">
            <label>构建的 Prompt</label>
            <pre class="prompt-preview">{{ buildPromptPreview }}</pre>
          </div>
          <button
            class="btn-run-large"
            @click="runAnalysis"
            :disabled="!node.config.prompt.trim() || isRunning"
          >
            <span v-if="isRunning" class="spinner" />
            <span v-else>▶</span>
            运行分析
          </button>
        </div>
      </template>

      <!-- 结果配置 -->
      <template v-if="node.type === 'result'">
        <div class="section">
          <div class="section-title">📊 结果展示</div>
          <div class="field">
            <label>内容 (Markdown)</label>
            <textarea
              v-model="node.config.content"
              class="textarea code"
              rows="12"
              readonly
            />
          </div>
          <div class="stats" v-if="node.config.content">
            <span>{{ node.config.content.length }} 字符</span>
            <span>{{ node.config.content.split('\n').length }} 行</span>
          </div>
        </div>
      </template>

      <!-- 连接信息 -->
      <div class="section connections-info">
        <div class="section-title">🔗 连接</div>
        <div class="conn-item">
          <span class="conn-label">上游节点</span>
          <span class="conn-value">{{ upstreamNames || '无' }}</span>
        </div>
        <div class="conn-item">
          <span class="conn-label">下游节点</span>
          <span class="conn-value">{{ downstreamNames || '无' }}</span>
        </div>
      </div>

      <!-- 操作 -->
      <div class="section actions">
        <button class="btn-danger" @click="$emit('remove')">🗑️ 删除节点</button>
      </div>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useWorkflow } from '../stores/workflow.js'

const props = defineProps({
  node: { type: Object, required: true },
})

const emit = defineEmits(['close', 'remove', 'run'])

const workflow = useWorkflow()
const isRunning = ref(false)

// ── 动态模型列表 ──
const models = ref([])
const modelsLoading = ref(true)

const selectedModel = computed({
  get: () => {
    const m = props.node.config.model
    if (!m) return models.value[0]?.provider + '/' + models.value[0]?.id || ''
    if (!m.includes('/')) {
      const found = models.value.find((x) => x.id === m)
      return found ? found.provider + '/' + found.id : ''
    }
    return m
  },
  set: (val) => {
    props.node.config.model = val
  },
})

async function fetchModels() {
  if (props.node.type !== 'analysis') return
  modelsLoading.value = true
  try {
    const resp = await fetch('/api/models')
    const data = await resp.json()
    models.value = data.models || []
    if (data.activeModel && !props.node.config.model) {
      props.node.config.model = data.activeModel.provider + '/' + data.activeModel.id
    } else if (models.value.length > 0 && !props.node.config.model) {
      props.node.config.model = models.value[0].provider + '/' + models.value[0].id
    }
  } catch {
    models.value = [
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic' },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
    ]
  } finally {
    modelsLoading.value = false
  }
}

async function onModelChange() {
  const parts = selectedModel.value.split('/')
  if (parts.length !== 2) return
  try {
    await fetch('/api/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: parts[0], modelId: parts[1] }),
    })
  } catch {}
}

onMounted(fetchModels)

const upstreamNames = computed(() => {
  return workflow.getUpstreamNodes(props.node.id)
    .map((n) => n.label)
    .join(', ')
})

const downstreamNames = computed(() => {
  return workflow.getDownstreamNodes(props.node.id)
    .map((n) => n.label)
    .join(', ')
})

const buildPromptPreview = computed(() => {
  return workflow.buildWorkflowPrompt(props.node.id)
})

function runAnalysis() {
  isRunning.value = true
  emit('run')
  // 状态由 workflow 管理
  watch(
    () => workflow.state.executionState,
    (val) => {
      if (val === 'idle' || val === 'done' || val === 'error') {
        isRunning.value = false
      }
    },
    { once: true }
  )
}
</script>

<style scoped>
.node-inspector {
  width: 300px;
  min-width: 300px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.inspector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
}

.inspector-header h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.btn-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
}
.btn-close:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
}

.inspector-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}

.section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-color);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.field label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.input, .textarea, .select {
  font-size: 12px;
  padding: 6px 8px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  font-family: inherit;
}

.input:focus, .textarea:focus, .select:focus {
  border-color: var(--accent-purple);
}

.textarea {
  resize: vertical;
}

.textarea.code {
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 11px;
}

.prompt-large {
  min-height: 120px;
}

.select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6' fill='%238b8fa3'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  padding-right: 24px;
}

.prompt-preview {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 8px;
  max-height: 150px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-family: 'SF Mono', monospace;
  line-height: 1.5;
}

.btn-run-large {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: var(--radius-sm);
  background: var(--accent-purple);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-top: 8px;
}
.btn-run-large:hover:not(:disabled) {
  background: #8b6cfc;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(124, 92, 252, 0.3);
}
.btn-run-large:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 连接信息 */
.conn-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 12px;
}
.conn-label {
  color: var(--text-muted);
}
.conn-value {
  color: var(--text-secondary);
}

/* 操作 */
.actions {
  padding-top: 8px;
}

.btn-danger {
  width: 100%;
  padding: 8px;
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: var(--radius-sm);
  background: rgba(239, 68, 68, 0.08);
  color: var(--accent-red);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* 统计 */
.stats {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
