<template>
  <div class="app-layout">
    <!-- 顶部栏 -->
    <header class="app-header">
      <div class="header-left">
        <span class="logo">🧩 Pi Canvas</span>
        <span class="divider">|</span>
        <span class="subtitle">数据分析工作流</span>
      </div>
      <div class="header-center">
        <span class="badge" :class="statusClass">
          <span class="dot" />
          {{ statusText }}
        </span>
        <span class="badge mode-badge">
          ⚡ SDK
        </span>
        <span v-if="modelName" class="badge model-badge">
          {{ modelName }}
        </span>
      </div>
      <div class="header-right">
        <button class="btn btn-sm" @click="showPalette = !showPalette" :class="{ active: showPalette }">
          📦 节点
        </button>
        <button class="btn btn-sm" @click="showChat = !showChat" :class="{ active: showChat }">
          💬 对话
        </button>
        <button class="btn btn-sm btn-danger" @click="workflow.clearCanvas()">
          🗑️ 清空
        </button>
      </div>
    </header>

    <!-- 主体 -->
    <div class="app-body">
      <NodePalette v-if="showPalette" />

      <WorkflowCanvas ref="canvasRef" />

      <!-- 右侧：Inspector + Agent Chat 双面板 -->
      <div class="right-panels">
        <NodeInspector
          v-if="selectedNode"
          :node="selectedNode"
          @close="workflow.state.activeNodeId = null"
          @remove="workflow.removeNode(selectedNode.id)"
        />
        <AgentChat ref="chatRef" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkflow } from './stores/workflow.js'
import WorkflowCanvas from './components/WorkflowCanvas.vue'
import NodePalette from './components/NodePalette.vue'
import NodeInspector from './components/NodeInspector.vue'
import AgentChat from './components/AgentChat.vue'

const workflow = useWorkflow()
const showPalette = ref(true)
const showChat = ref(true)
const canvasRef = ref(null)
const chatRef = ref(null)
const modelName = ref('')

const selectedNode = computed(() => {
  return workflow.state.nodes.find(n => n.id === workflow.state.activeNodeId) || null
})

const statusClass = computed(() => {
  switch (workflow.state.executionState) {
    case 'running': return 'status-running'
    case 'done': return 'status-done'
    default: return 'status-idle'
  }
})

const statusText = computed(() => {
  switch (workflow.state.executionState) {
    case 'running': return '运行中'
    case 'done': return '就绪'
    default: return '就绪'
  }
})

onMounted(async () => {
  try {
    const resp = await fetch('/api/status')
    const data = await resp.json()
    if (data.model) {
      modelName.value = `${data.model.provider}/${data.model.name || data.model.id}`
    }
  } catch {}
})
</script>

<style scoped>
.app-layout {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.app-header {
  height: 52px;
  min-height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.divider {
  color: var(--text-muted);
  font-size: 14px;
}

.subtitle {
  color: var(--text-secondary);
  font-size: 13px;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-right {
  display: flex;
  gap: 8px;
}

/* 状态徽章 */
.badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 20px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
}

.badge .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
}

.status-idle .dot { background: var(--accent-green); }
.status-running .dot { background: var(--accent-orange); animation: spin 1s linear infinite; }
.status-done .dot { background: var(--accent-green); }

.mode-badge {
  color: var(--accent-purple);
  border-color: var(--accent-purple);
  background: rgba(124, 92, 252, 0.1);
}

.model-badge {
  color: var(--accent-blue);
  border-color: var(--accent-blue);
  background: rgba(79, 156, 247, 0.1);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 按钮 */
.btn {
  font-size: 13px;
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
  border-color: var(--text-muted);
}

.btn.active {
  background: rgba(124, 92, 252, 0.15);
  border-color: var(--accent-purple);
  color: var(--accent-purple);
}

.btn-sm {
  padding: 4px 10px;
  font-size: 12px;
}

.btn-danger:hover {
  border-color: var(--accent-red);
  color: var(--accent-red);
}

/* 主体布局 */
.app-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}

.right-panels {
  display: flex;
  overflow: hidden;
}
</style>
