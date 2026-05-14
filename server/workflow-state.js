/**
 * 共享画布工作流状态（服务端）
 * 被 agent 的 custom tools 和 HTTP API 共同读写
 */

let _nodeIdCounter = 0
const nextId = () => `node_${++_nodeIdCounter}`

const state = {
  nodes: [],
  connections: [],
}

function addNode(type, x = 200, y = 200) {
  const defs = {
    'data-source': { label: '📂 数据源', color: '#4f9cf7', defaultConfig: { fileName: 'dataset.csv', description: '' } },
    'analysis':    { label: '🤖 AI 分析',  color: '#a78bfa', defaultConfig: { prompt: '请分析数据' } },
    'result':      { label: '📊 结果',     color: '#34d399', defaultConfig: { content: '' } },
  }
  const def = defs[type]
  if (!def) return null
  const node = {
    id: nextId(),
    type,
    label: def.label,
    color: def.color,
    x,
    y,
    width: 260,
    height: type === 'analysis' ? 340 : type === 'result' ? 280 : 180,
    config: { ...def.defaultConfig },
  }
  state.nodes.push(node)
  return node
}

function removeNode(nodeId) {
  state.nodes = state.nodes.filter(n => n.id !== nodeId)
  state.connections = state.connections.filter(c => c.from !== nodeId && c.to !== nodeId)
}

function addConnection(fromId, toId) {
  if (fromId === toId) return false
  const exists = state.connections.some(c => c.from === fromId && c.to === toId)
  if (exists) return false
  state.connections.push({ from: fromId, to: toId, id: `conn_${Date.now()}` })
  return true
}

function getState() {
  return {
    nodes: state.nodes.map(n => ({ ...n })),
    connections: state.connections.map(c => ({ ...c })),
  }
}

function reset() {
  state.nodes = []
  state.connections = []
  _nodeIdCounter = 0
}

export const workflowState = { state, addNode, removeNode, addConnection, getState, reset }
