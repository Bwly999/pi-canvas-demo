/**
 * 工作流状态管理 — 节点、连接、执行状态
 * 既供前端 UI 拖拽使用，也监听后端 agent 的 canvas_update 事件
 */
import { reactive } from 'vue'

export const NODE_TYPES = {
  DATA_SOURCE: { type: 'data-source', label: '📂 数据源', color: '#4f9cf7', defaultConfig: { fileName: 'dataset.csv', description: '' } },
  ANALYSIS:    { type: 'analysis',    label: '🤖 AI 分析',  color: '#a78bfa', defaultConfig: { prompt: '请分析数据', model: '' } },
  RESULT:      { type: 'result',      label: '📊 结果',     color: '#34d399', defaultConfig: { content: '' } },
}

let _nodeIdCounter = 0
const nextNodeId = () => `node_${++_nodeIdCounter}`

const state = reactive({
  nodes: [],
  connections: [],
  executionState: 'idle',
  activeNodeId: null,
  showNodePalette: true,
})

function addNode(type, x = 200, y = 200) {
  const def = Object.values(NODE_TYPES).find(n => n.type === type)
  if (!def) return null
  const node = {
    id: nextNodeId(),
    type: def.type,
    label: def.label,
    color: def.color,
    x, y,
    width: 260,
    height: def.type === 'analysis' ? 240 : def.type === 'result' ? 200 : 160,
    config: { ...def.defaultConfig },
  }
  state.nodes.push(node)
  return node
}

function removeNode(nodeId) {
  state.nodes = state.nodes.filter(n => n.id !== nodeId)
  state.connections = state.connections.filter(c => c.from !== nodeId && c.to !== nodeId)
  if (state.activeNodeId === nodeId) state.activeNodeId = null
}

function addConnection(from, to) {
  if (from === to) return false
  if (state.connections.some(c => c.from === from && c.to === to)) return false
  state.connections.push({ from, to, id: `conn_${Date.now()}` })
  return true
}

function removeConnection(connId) {
  state.connections = state.connections.filter(c => c.id !== connId)
}

function getUpstreamNodes(nodeId) {
  return state.connections.filter(c => c.to === nodeId).map(c => state.nodes.find(n => n.id === c.from)).filter(Boolean)
}

function getDownstreamNodes(nodeId) {
  return state.connections.filter(c => c.from === nodeId).map(c => state.nodes.find(n => n.id === c.to)).filter(Boolean)
}

function getPortPosition(nodeId, side) {
  const node = state.nodes.find(n => n.id === nodeId)
  if (!node) return null
  const cy = node.y + node.height / 2
  return side === 'input' ? { x: node.x, y: cy } : { x: node.x + node.width, y: cy }
}

function clearCanvas() {
  state.nodes = []
  state.connections = []
  state.executionState = 'idle'
  state.activeNodeId = null
  _nodeIdCounter = 0
}

// 同步画布状态到后端（供 agent 工具使用）
async function syncToBackend() {
  try {
    await fetch('/api/workflow/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: state.nodes.map(n => ({ ...n })),
        connections: state.connections.map(c => ({ ...c })),
      }),
    })
  } catch {}
}

// 监听后端 agent 发来的 canvas_update 事件
let _canvasSource = null
function startCanvasListener() {
  _canvasSource = new EventSource('/api/agent/events')
  _canvasSource.onmessage = (e) => {
    if (e.data === 'ping' || !e.data.trim()) return
    try {
      const event = JSON.parse(e.data)
      if (event.action === 'node_added' && event.node) {
        // agent 添加了节点 → 同步到前端
        if (!state.nodes.find(n => n.id === event.node.id)) {
          state.nodes.push(event.node)
        }
      } else if (event.action === 'node_removed') {
        state.nodes = state.nodes.filter(n => n.id !== event.nodeId)
        state.connections = state.connections.filter(c => c.from !== event.nodeId && c.to !== event.nodeId)
      } else if (event.action === 'connected') {
        addConnection(event.from, event.to)
      }
    } catch {}
  }
}
startCanvasListener()

export function useWorkflow() {
  return {
    state, addNode, removeNode, addConnection, removeConnection,
    getUpstreamNodes, getDownstreamNodes, getPortPosition,
    clearCanvas, syncToBackend,
  }
}
