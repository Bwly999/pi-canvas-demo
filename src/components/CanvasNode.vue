<template>
  <div
    class="canvas-node"
    :class="{ active: isActive, running: isRunning }"
    :style="{ left: node.x + 'px', top: node.y + 'px', width: node.width + 'px' }"
    :draggable="false"
  >
    <!-- 节点头部（拖拽区域） -->
    <div
      class="node-header"
      @mousedown.prevent="startDrag"
      @dblclick="$emit('select')"
      :style="{ borderLeftColor: node.color }"
    >
      <span class="node-type-icon">{{ node.label.split(' ')[0] }}</span>
      <span class="node-title">{{ node.label }}</span>
      <span class="node-controls">
        <button class="node-btn-close" @mousedown.stop @click.stop="$emit('remove')">✕</button>
      </span>
    </div>

    <!-- 节点内容体 -->
    <div class="node-body" @mousedown.stop>
      <!-- 输入端口（左侧） -->
      <div
        class="port port-input"
        @mousedown.stop
        @mouseup.stop="$emit('connect-to')"
      >
        <div class="port-dot input" :class="{ connecting: isConnecting }" />
      </div>

      <!-- 根据不同节点类型展示内容 -->
      <DataSourceContent v-if="node.type === 'data-source'" :node="node" />
      <AnalysisContent v-else-if="node.type === 'analysis'" :node="node" @run="$emit('run')" />
      <ResultContent v-else-if="node.type === 'result'" :node="node" />

      <!-- 输出端口（右侧） -->
      <div
        class="port port-output"
        @mousedown.stop="$emit('start-connect')"
        @mouseup.stop=""
      >
        <div class="port-dot output" :class="{ connecting: isConnecting }" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import DataSourceContent from './DataSourceNode.vue'
import AnalysisContent from './AnalysisNode.vue'
import ResultContent from './ResultNode.vue'

const props = defineProps({
  node: { type: Object, required: true },
  isActive: Boolean,
  isConnecting: Boolean,
})

const emit = defineEmits(['select', 'move', 'start-connect', 'connect-to', 'run', 'remove'])

const isRunning = computed(() => props.node.type === 'analysis' && props.node._running)

// ── 拖拽 ──
const dragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

function startDrag(e) {
  dragging.value = true
  dragOffset.value = {
    x: e.clientX - props.node.x,
    y: e.clientY - props.node.y,
  }
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e) {
  if (!dragging.value) return
  emit('move', {
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y,
  })
}

function stopDrag() {
  dragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}
</script>

<style scoped>
.canvas-node {
  position: absolute;
  z-index: 10;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  transition: box-shadow 0.2s, border-color 0.2s;
  cursor: default;
}

.canvas-node:hover {
  box-shadow: 0 6px 32px rgba(0, 0, 0, 0.4);
}

.canvas-node.active {
  border-color: var(--accent-purple);
  box-shadow: 0 0 0 1px var(--accent-purple), 0 6px 32px rgba(0, 0, 0, 0.4);
}

/* 头部 */
.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  cursor: grab;
  border-left: 3px solid var(--accent-purple);
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--bg-tertiary);
  user-select: none;
}

.canvas-node.active .node-header {
  background: rgba(124, 92, 252, 0.08);
}

.node-header:active {
  cursor: grabbing;
}

.node-type-icon {
  font-size: 14px;
}

.node-title {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.node-controls {
  display: flex;
  gap: 4px;
}

.node-btn-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}

.node-btn-close:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--accent-red);
}

/* 节点体 */
.node-body {
  position: relative;
  padding: 12px;
  min-height: 60px;
}

/* 端口 */
.port {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 5;
  display: flex;
  align-items: center;
}

.port-input {
  left: -6px;
}

.port-output {
  right: -6px;
}

.port-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  cursor: crosshair;
  transition: all 0.15s ease;
  background: var(--bg-card);
}

.port-dot:hover {
  transform: scale(1.4);
}

.port-dot.input {
  border-color: var(--text-muted);
}
.port-dot.input:hover {
  border-color: var(--accent-green);
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.4);
}
.port-dot.output {
  border-color: var(--accent-blue);
}
.port-dot.output:hover {
  border-color: var(--accent-blue);
  box-shadow: 0 0 8px rgba(79, 156, 247, 0.4);
}
.port-dot.connecting {
  animation: port-pulse 0.8s ease-in-out infinite;
}

@keyframes port-pulse {
  0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(124, 92, 252, 0.4); }
  50% { transform: scale(1.4); box-shadow: 0 0 12px 2px rgba(124, 92, 252, 0.3); }
}
</style>
