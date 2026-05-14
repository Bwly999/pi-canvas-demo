<template>
  <aside class="node-palette">
    <div class="palette-header">
      <h3>📦 节点库</h3>
    </div>

    <div
      v-for="nt in nodeTypes"
      :key="nt.type"
      class="palette-item"
      draggable="true"
      @dragstart="onDragStart($event, nt)"
    >
      <div class="palette-icon" :style="{ background: nt.color + '22', color: nt.color }">
        {{ nt.label.split(' ')[0] }}
      </div>
      <div class="palette-info">
        <div class="palette-name">{{ nt.label }}</div>
        <div class="palette-desc">{{ nt.description }}</div>
      </div>
    </div>

    <div class="palette-divider" />

    <div class="palette-tips">
      <div class="tip-title">💡 使用提示</div>
      <ul>
        <li>将节点从面板<strong>拖入</strong>画布</li>
        <li>从节点右侧端口<strong>拖出</strong>连接线</li>
        <li>点击节点查看<strong>配置</strong>面板</li>
        <li>选中分析节点 → 点击<strong>运行</strong></li>
      </ul>
    </div>
  </aside>
</template>

<script setup>
import { useWorkflow } from '../stores/workflow.js'

const workflow = useWorkflow()

const nodeTypes = [
  {
    type: 'data-source',
    label: '📂 数据源',
    color: '#4f9cf7',
    description: '数据文件、CSV、数据库或 API',
  },
  {
    type: 'analysis',
    label: '🤖 AI 分析',
    color: '#a78bfa',
    description: 'Pi 驱动的智能数据分析',
  },
  {
    type: 'result',
    label: '📊 结果展示',
    color: '#34d399',
    description: 'Markdown 报告输出',
  },
]

function onDragStart(e, nt) {
  e.dataTransfer.setData('text/plain', nt.type)
  e.dataTransfer.effectAllowed = 'copy'
}
</script>

<style scoped>
.node-palette {
  width: 220px;
  min-width: 220px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow-y: auto;
}

.palette-header h3 {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: grab;
  transition: all 0.15s ease;
  margin-bottom: 6px;
}

.palette-item:hover {
  background: var(--bg-card);
  border-color: var(--border-color);
}

.palette-item:active {
  cursor: grabbing;
  transform: scale(0.97);
}

.palette-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.palette-info {
  min-width: 0;
}

.palette-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.palette-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
}

.palette-divider {
  height: 1px;
  background: var(--border-color);
  margin: 16px 0;
}

.palette-tips {
  font-size: 12px;
  color: var(--text-muted);
}

.tip-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.palette-tips ul {
  list-style: none;
  line-height: 1.8;
}

.palette-tips li::before {
  content: '· ';
  color: var(--accent-purple);
}
</style>
