<template>
  <div
    class="canvas-container"
    @mousemove="onCanvasMouseMove"
    @mouseup="onCanvasMouseUp"
    @click.self="deselectAll"
    @dragover.prevent
    @drop="onNodeDrop"
    ref="containerRef"
  >
    <svg class="grid-bg" width="100%" height="100%">
      <defs>
        <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
    </svg>

    <svg class="connections-svg" width="100%" height="100%">
      <g v-for="conn in state.connections" :key="conn.id">
        <path :d="getConnectionPath(conn)" class="connection-line" @click.stop="workflow.removeConnection(conn.id)" />
      </g>
      <path v-if="connecting" :d="getDraggingPath()" class="connection-line dragging" />
    </svg>

    <CanvasNode
      v-for="node in state.nodes"
      :key="node.id"
      :node="node"
      :is-active="state.activeNodeId === node.id"
      :is-connecting="connecting === node.id"
      @select="selectNode(node.id)"
      @move="onNodeMove(node.id, $event)"
      @start-connect="startConnect(node.id)"
      @connect-to="tryConnect(node.id)"
      @remove="workflow.removeNode(node.id)"
      @enddrag="workflow.syncToBackend()"
    />

    <div v-if="state.nodes.length === 0" class="empty-hint">
      <div class="empty-icon">🧩</div>
      <h3>从左侧面板拖拽节点到此处</h3>
      <p>或用右侧 Agent Chat 🤖 让 AI 帮你搭建工作流</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useWorkflow } from '../stores/workflow.js'
import CanvasNode from './CanvasNode.vue'

const workflow = useWorkflow()
const { state } = workflow

const containerRef = ref(null)
const connecting = ref(null)
const connectMouse = reactive({ x: 0, y: 0 })

function selectNode(id) {
  state.activeNodeId = state.activeNodeId === id ? null : id
}
function deselectAll() {
  if (connecting.value) return
  state.activeNodeId = null
}
function startConnect(nodeId) { connecting.value = nodeId }
function tryConnect(targetId) {
  if (connecting.value && connecting.value !== targetId) {
    workflow.addConnection(connecting.value, targetId)
    workflow.syncToBackend()
  }
  connecting.value = null
}
function onCanvasMouseUp() { connecting.value = null }
function onNodeMove(nodeId, { x, y }) {
  const node = state.nodes.find(n => n.id === nodeId)
  if (node) { node.x = Math.max(0, x); node.y = Math.max(0, y) }
}

function onNodeDrop(e) {
  const type = e.dataTransfer.getData('text/plain')
  if (!type) return
  const rect = containerRef.value?.getBoundingClientRect()
  const sx = Math.round(Math.max(0, e.clientX - (rect?.left || 0) - 130) / 20) * 20
  const sy = Math.round(Math.max(0, e.clientY - (rect?.top || 0) - 60) / 20) * 20
  const node = workflow.addNode(type, sx, sy)
  if (node) { selectNode(node.id); workflow.syncToBackend() }
}

function onCanvasMouseMove(e) {
  if (connecting.value) {
    const rect = containerRef.value?.getBoundingClientRect()
    connectMouse.x = e.clientX - (rect?.left || 0)
    connectMouse.y = e.clientY - (rect?.top || 0)
  }
}

function getConnectionPath(conn) {
  const from = workflow.getPortPosition(conn.from, 'output')
  const to = workflow.getPortPosition(conn.to, 'input')
  if (!from || !to) return ''
  const dx = Math.max(50, Math.abs(to.x - from.x) * 0.5)
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
}

function getDraggingPath() {
  if (!connecting.value) return ''
  const from = workflow.getPortPosition(connecting.value, 'output')
  if (!from) return ''
  const dx = Math.max(50, Math.abs(connectMouse.x - from.x) * 0.5)
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${connectMouse.x - dx} ${connectMouse.y}, ${connectMouse.x} ${connectMouse.y}`
}

onMounted(() => {
  setTimeout(() => {
    if (state.nodes.length === 0) {
      const ds = workflow.addNode('data-source', 60, 180)
      if (ds) { ds.config.fileName = 'sales_2024.csv'; ds.config.description = '2024 年度销售数据'; ds.config.sampleData = 'date,revenue,users,conversion\n2024-01,$45k,1200,3.2%\n2024-02,$52k,1350,3.5%' }
      const analysis = workflow.addNode('analysis', 400, 150)
      if (analysis) analysis.config.prompt = '分析销售数据趋势和洞察'
      const result = workflow.addNode('result', 740, 180)
      if (ds && analysis) workflow.addConnection(ds.id, analysis.id)
      if (analysis && result) workflow.addConnection(analysis.id, result.id)
      workflow.syncToBackend()
    }
  }, 100)
})
</script>

<style scoped>
.canvas-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.grid-bg, .connections-svg {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  pointer-events: none;
}
.connections-svg { z-index: 1; }

.connection-line {
  fill: none; stroke: var(--text-muted); stroke-width: 2;
  stroke-linecap: round; cursor: pointer; transition: stroke 0.2s;
  pointer-events: stroke;
}
.connection-line:hover { stroke: var(--accent-red); stroke-width: 3; }
.connection-line.dragging {
  stroke: var(--accent-purple); stroke-width: 2.5; stroke-dasharray: 6 4;
}

.empty-hint {
  position: absolute; top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  text-align: center; color: var(--text-muted);
  pointer-events: none;
}
.empty-hint .empty-icon { font-size: 64px; margin-bottom: 16px; opacity: 0.5; }
.empty-hint h3 { font-size: 18px; font-weight: 600; color: var(--text-secondary); margin-bottom: 8px; }
.empty-hint p { font-size: 14px; }
</style>
