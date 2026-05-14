/**
 * Express 服务器 — Pi SDK 集成模式
 *
 * 不再 spawn RPC 子进程，而是用 SDK 在服务端直接创建 AgentSession。
 * 提供：
 *   GET  /api/status       — 服务状态
 *   GET  /api/models       — 可用模型列表
 *   POST /api/model        — 切换模型
 *   GET  /api/agent/events — SSE 事件流（Chat 面板专用）
 *   POST /api/agent/prompt — 向 agent 发消息
 *   POST /api/agent/abort  — 中止 agent
 *   GET  /api/workflow     — 获取画布状态
 *   POST /api/workflow/sync— 前端画布状态同步给后端
 */
import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import { EventEmitter } from 'events'

import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  SessionManager,
  defineTool,
} from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import { workflowState } from './workflow-state.js'

const app = express()
app.use(cors())
app.use(express.json())

// ── 全局事件总线（agent 事件 → SSE 广播） ──────
const agentEvents = new EventEmitter()
agentEvents.setMaxListeners(100)

// ── Agent Session 状态 ─────────────────────────
let agentSession = null
let currentModel = null
let isStreaming = false
let sessionReady = false

// ── 初始化 Agent Session ───────────────────────
async function initAgent() {
  const authStorage = AuthStorage.create()
  const modelRegistry = ModelRegistry.create(authStorage)
  const available = await modelRegistry.getAvailable()
  const model = available[0] || null
  currentModel = model

  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    authStorage,
    modelRegistry,
    model,
    thinkingLevel: 'low',
    cwd: process.cwd(),
    customTools: createCanvasTools(),
  })

  agentSession = session

  // 订阅所有 agent 事件 → 广播到 SSE
  session.subscribe((event) => {
    if (event.type === 'agent_start') {
      isStreaming = true
    } else if (event.type === 'agent_end') {
      isStreaming = false
    }
    agentEvents.emit('agent_event', event)
  })

  sessionReady = true
  console.log(`[agent] ✅ SDK AgentSession ready (model: ${currentModel?.provider}/${currentModel?.id})`)
}

// ── 画布控制工具（agent 通过这些工具操控工作流） ──
function createCanvasTools() {
  return [
    defineTool({
      name: 'canvas_get_state',
      label: 'Canvas Get State',
      description: '获取当前画布上所有节点和连接的完整状态。调用此工具来查看当前工作流的结构。',
      parameters: Type.Object({}),
      async execute() {
        const s = workflowState.getState()
        return {
          content: [{ type: 'text', text: JSON.stringify(s, null, 2) }],
          details: {},
        }
      },
    }),

    defineTool({
      name: 'canvas_add_node',
      label: 'Canvas Add Node',
      description: '在画布上添加一个新节点。type 可选: data-source（数据源）, analysis（AI 分析）, result（结果展示）。返回新节点的 id。',
      parameters: Type.Object({
        type: Type.String({ description: '节点类型: data-source / analysis / result' }),
        x: Type.Number({ description: 'X 坐标' }),
        y: Type.Number({ description: 'Y 坐标' }),
        config: Type.Optional(Type.Any({ description: '节点配置，如 { prompt, fileName }' })),
      }),
      async execute(_callId, params) {
        const node = workflowState.addNode(params.type, params.x, params.y)
        if (!node) {
          return { content: [{ type: 'text', text: `无效节点类型: ${params.type}` }], details: {}, isError: true }
        }
        if (params.config) Object.assign(node.config, params.config)
        // 通知前端画布更新
        agentEvents.emit('canvas_update', { action: 'node_added', node: { ...node } })
        return {
          content: [{ type: 'text', text: `✅ 已创建 ${node.label} 节点 (id: ${node.id})` }],
          details: { nodeId: node.id },
        }
      },
    }),

    defineTool({
      name: 'canvas_connect',
      label: 'Canvas Connect',
      description: '连接两个节点。fromNodeId 连接到 toNodeId（数据从 from 流向 to）。',
      parameters: Type.Object({
        fromNodeId: Type.String({ description: '源节点 id' }),
        toNodeId: Type.String({ description: '目标节点 id' }),
      }),
      async execute(_callId, params) {
        const ok = workflowState.addConnection(params.fromNodeId, params.toNodeId)
        if (!ok) {
          return { content: [{ type: 'text', text: '连接失败：节点不存在或已连接' }], details: {}, isError: true }
        }
        agentEvents.emit('canvas_update', { action: 'connected', from: params.fromNodeId, to: params.toNodeId })
        return {
          content: [{ type: 'text', text: `✅ 已连接 ${params.fromNodeId} → ${params.toNodeId}` }],
          details: {},
        }
      },
    }),

    defineTool({
      name: 'canvas_run_analysis',
      label: 'Canvas Run Analysis',
      description: '运行指定 analysis 节点的分析。自动收集上游数据源内容构建 prompt，发送给当前模型分析。',
      parameters: Type.Object({
        nodeId: Type.String({ description: 'analysis 节点的 id' }),
      }),
      async execute(_callId, params) {
        const node = workflowState.state.nodes.find(n => n.id === params.nodeId)
        if (!node || node.type !== 'analysis') {
          return { content: [{ type: 'text', text: `节点 ${params.nodeId} 不存在或不是 analysis 类型` }], details: {}, isError: true }
        }

        // 构建 prompt
        const upstream = workflowState.state.connections
          .filter(c => c.to === params.nodeId)
          .map(c => workflowState.state.nodes.find(n => n.id === c.from))
          .filter(Boolean)

        const sources = upstream.filter(n => n.type === 'data-source')
        let prompt = '你是一个数据分析专家。请分析以下数据并给出洞察。\n\n'
        if (sources.length > 0) {
          prompt += '## 输入数据\n\n'
          sources.forEach(ds => {
            prompt += `- **${ds.config.fileName || '数据'}**: ${ds.config.description || ''}\n`
            if (ds.config.sampleData) {
              prompt += `\`\`\`\n${ds.config.sampleData}\n\`\`\`\n`
            }
          })
          prompt += '\n'
        }
        prompt += `## 分析要求\n\n${node.config.prompt || '请分析数据并给出洞察。'}`

        agentEvents.emit('agent_event', {
          type: 'custom_prompt',
          payload: { nodeId: params.nodeId, prompt: prompt.slice(0, 200) + '...' },
        })

        // 不要在这里调 prompt()——agent 正在执行工具调用中
        // 把构建好的 prompt 作为工具结果返回，让 LLM 自然继续分析
        return {
          content: [{ type: 'text', text: `## 分析任务已接收\n\n以下是根据上游数据构建的完整分析 prompt，请直接执行分析：\n\n${prompt}` }],
          details: {},
        }
      },
    }),

    defineTool({
      name: 'canvas_remove_node',
      label: 'Canvas Remove Node',
      description: '删除指定的节点及其所有连接。',
      parameters: Type.Object({
        nodeId: Type.String({ description: '要删除的节点 id' }),
      }),
      async execute(_callId, params) {
        workflowState.removeNode(params.nodeId)
        agentEvents.emit('canvas_update', { action: 'node_removed', nodeId: params.nodeId })
        return {
          content: [{ type: 'text', text: `✅ 已删除节点 ${params.nodeId}` }],
          details: {},
        }
      },
    }),
  ]
}

// ── API 端点 ────────────────────────────────────

// 状态
app.get('/api/status', (req, res) => {
  res.json({
    ready: sessionReady,
    streaming: isStreaming,
    model: currentModel ? { id: currentModel.id, name: currentModel.name, provider: currentModel.provider } : null,
    mode: 'sdk',
  })
})

// 可用模型
app.get('/api/models', async (req, res) => {
  try {
    const authStorage = AuthStorage.create()
    const modelRegistry = ModelRegistry.create(authStorage)
    const available = await modelRegistry.getAvailable()
    const models = available.map(m => ({
      id: m.id,
      name: m.name || m.id,
      provider: m.provider,
      contextWindow: m.contextWindow,
    }))
    res.json({
      models,
      activeModel: currentModel ? { id: currentModel.id, provider: currentModel.provider } : null,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 切换模型
app.post('/api/model', async (req, res) => {
  const { provider, modelId } = req.body
  if (!provider || !modelId) return res.status(400).json({ error: 'provider and modelId required' })
  try {
    const authStorage = AuthStorage.create()
    const modelRegistry = ModelRegistry.create(authStorage)
    const model = modelRegistry.find(provider, modelId)
    if (!model) return res.status(404).json({ error: `Model ${provider}/${modelId} not found` })
    if (agentSession) {
      await agentSession.setModel(model)
    }
    currentModel = model
    res.json({ ok: true, model: { id: model.id, name: model.name, provider: model.provider } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Agent 事件 SSE 流（给 Chat 面板用）
app.get('/api/agent/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  res.write('\n')

  const onEvent = (event) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`) } catch {}
  }
  const onCanvas = (data) => {
    try { res.write(`data: ${JSON.stringify({ type: 'canvas_update', ...data })}\n\n`) } catch {}
  }

  agentEvents.on('agent_event', onEvent)
  agentEvents.on('canvas_update', onCanvas)

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n') } catch { clearInterval(keepAlive) }
  }, 15000)

  req.on('close', () => {
    agentEvents.off('agent_event', onEvent)
    agentEvents.off('canvas_update', onCanvas)
    clearInterval(keepAlive)
  })
})

// 向 agent 发消息
app.post('/api/agent/prompt', async (req, res) => {
  const { message } = req.body
  if (!message) return res.status(400).json({ error: 'message required' })
  if (!agentSession || !sessionReady) return res.status(503).json({ error: 'Agent not ready' })

  res.json({ ok: true })

  try {
    if (isStreaming) {
      // agent 正在处理中 → 排队等处理完
      isStreaming = true
      await agentSession.followUp(message)
    } else {
      isStreaming = true
      await agentSession.prompt(message)
    }
  } catch (err) {
    console.error('[agent] prompt error:', err.message)
    agentEvents.emit('agent_event', { type: 'error', error: err.message })
  } finally {
    isStreaming = false
  }
})

// 中止
app.post('/api/agent/abort', async (req, res) => {
  if (agentSession) await agentSession.abort()
  isStreaming = false
  res.json({ ok: true })
})

// 获取画布状态（前端同步用）
app.get('/api/workflow', (req, res) => {
  res.json(workflowState.getState())
})

// 前端画布状态同步到后端（前端拖拽后同步）
app.post('/api/workflow/sync', (req, res) => {
  const { nodes, connections } = req.body
  if (nodes) workflowState.state.nodes = nodes
  if (connections) workflowState.state.connections = connections
  res.json({ ok: true })
})

// ── 启动 ────────────────────────────────────────
const PORT = 3456

app.listen(PORT, async () => {
  console.log(`🧩 Pi Canvas 后端 (SDK 模式) 运行在 http://localhost:${PORT}`)
  console.log(`   API: /api/status | /api/agent/events | /api/agent/prompt`)

  try {
    await initAgent()
    console.log('   🚀 Agent ready')
  } catch (err) {
    console.error('   ❌ Agent init failed:', err.message)
  }
})
