<template>
  <aside class="agent-chat" :class="{ collapsed: !visible }">
    <!-- 头部 -->
    <div class="chat-header" @click="visible = !visible">
      <div class="header-left">
        <span class="agent-avatar">🤖</span>
        <div class="agent-info">
          <span class="agent-name">Pi Agent</span>
          <span class="agent-status" :class="statusClass">{{ statusText }}</span>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn-icon" @click.stop="clearChat" title="清空对话">🗑️</button>
        <button class="btn-icon toggle-btn">{{ visible ? '▶' : '◀' }}</button>
      </div>
    </div>

    <template v-if="visible">
      <!-- 消息列表 -->
      <div class="messages" ref="messagesRef">
        <div v-for="(msg, i) in messages" :key="i" class="message" :class="msg.role">
          <!-- 用户消息 -->
          <div v-if="msg.role === 'user'" class="bubble user-bubble">
            <div class="bubble-text">{{ msg.text }}</div>
          </div>

          <!-- Agent 消息 -->
          <div v-else class="bubble agent-bubble">
            <!-- 思考块 -->
            <div v-if="msg.thinking" class="thinking-block" @click="msg._expanded = !msg._expanded">
              <div class="thinking-header">
                <span class="thinking-icon">🧠</span>
                <span>思考过程</span>
                <span class="expand-btn">{{ msg._expanded ? '收起' : '展开' }}</span>
              </div>
              <div v-show="msg._expanded" class="thinking-content">{{ msg.thinking }}</div>
            </div>

            <!-- 工具调用 -->
            <div v-for="(tc, j) in (msg.toolCalls || [])" :key="j" class="tool-call-card" :class="{ done: tc.done }">
              <div class="tool-header">
                <span class="tool-icon">{{ tc.done ? '✅' : '🛠️' }}</span>
                <span class="tool-name">{{ tc.name }}</span>
                <span v-if="tc.done" class="tool-status">完成</span>
                <span v-else class="tool-status running">执行中...</span>
              </div>
              <div v-if="tc.args" class="tool-args">
                <code>{{ truncate(JSON.stringify(tc.args), 100) }}</code>
              </div>
              <div v-if="tc.result && tc._expanded" class="tool-result">
                <pre>{{ truncate(tc.result, 500) }}</pre>
              </div>
            </div>

            <!-- 文本内容（流式） -->
            <div v-if="msg.text" class="agent-text" :class="{ streaming: msg._streaming }">
              <span v-for="(chunk, ci) in tokenize(msg.text)" :key="ci">{{ chunk }}</span>
              <span v-if="msg._streaming" class="cursor-blink" />
            </div>
          </div>
        </div>

        <!-- 加载指示器 -->
        <div v-if="waiting" class="message agent">
          <div class="bubble agent-bubble waiting-bubble">
            <div class="thinking-dots">
              <span>●</span><span>●</span><span>●</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入栏 -->
      <div class="chat-input-bar">
        <textarea
          ref="inputRef"
          v-model="inputText"
          class="input-field"
          placeholder="输入消息，按 Enter 发送..."
          @keydown.enter.prevent="sendMessage"
          :disabled="waiting"
          rows="1"
          @input="autoResize"
        />
        <button
          class="send-btn"
          @click="sendMessage"
          :disabled="waiting || !inputText.trim()"
        >
          {{ waiting ? '⏳' : '↑' }}
        </button>
      </div>
    </template>
  </aside>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useWorkflow } from '../stores/workflow.js'

const workflow = useWorkflow()
const visible = ref(true)
const messages = reactive([])
const inputText = ref('')
const waiting = ref(false)
const messagesRef = ref(null)
const inputRef = ref(null)

// SSE 连接
let eventSource = null

// ── 流式渲染器 ──────────────────────────────
// 用 requestAnimationFrame 逐字展示文本，模拟打字机效果
let streamingRAF = null

function startStreamingRenderer() {
  function tick() {
    let dirty = false
    for (const msg of messages) {
      if (msg._streaming && msg._fullText != null) {
        const targetLen = msg._fullText.length
        if (msg._displayIndex < targetLen) {
          // 每次推进 2~3 个字符，手感自然
          const step = Math.max(1, Math.floor(targetLen / 120) || 2)
          msg._displayIndex = Math.min(msg._displayIndex + step, targetLen)
          msg.text = msg._fullText.slice(0, msg._displayIndex)
          dirty = true
        }
      }
    }
    if (dirty) scrollDown()
    streamingRAF = requestAnimationFrame(tick)
  }
  streamingRAF = requestAnimationFrame(tick)
}

function stopStreamingRenderer() {
  if (streamingRAF) {
    cancelAnimationFrame(streamingRAF)
    streamingRAF = null
  }
}

onMounted(() => {
  eventSource = new EventSource('/api/agent/events')
  eventSource.onmessage = (e) => {
    if (e.data === 'ping' || !e.data.trim()) return
    try {
      const event = JSON.parse(e.data)
      handleAgentEvent(event)
    } catch {}
  }
  eventSource.onerror = () => {}
  startStreamingRenderer()
})

onUnmounted(() => {
  if (eventSource) eventSource.close()
  stopStreamingRenderer()
})

// 当前处理中的消息
let currentAssistantMsg = null

function handleAgentEvent(event) {
  switch (event.type) {
    case 'agent_start':
      waiting.value = true
      currentAssistantMsg = {
        role: 'assistant',
        text: '',
        _fullText: '',        // 完整文本缓存（流式渲染器从此取字符）
        _displayIndex: 0,     // 已展示到的字符位置
        thinking: '',
        toolCalls: [],
        _streaming: true,
        _expanded: false,
      }
      messages.push(currentAssistantMsg)
      scrollDown()
      break

    case 'agent_end':
      waiting.value = false
      if (currentAssistantMsg) {
        // 立即展示所有剩余文本
        currentAssistantMsg._displayIndex = currentAssistantMsg._fullText.length
        currentAssistantMsg.text = currentAssistantMsg._fullText
        currentAssistantMsg._streaming = false
      }
      currentAssistantMsg = null
      scrollDown()
      break

    case 'message_update': {
      const delta = event.assistantMessageEvent
      if (!delta || !currentAssistantMsg) return

      if (delta.type === 'thinking_delta') {
        currentAssistantMsg.thinking += delta.delta || ''
      } else if (delta.type === 'text_delta') {
        // 追加到完整文本缓存，渲染器会逐字展示
        currentAssistantMsg._fullText += delta.delta || ''
        // 如果是第一条 delta，立即显示第一个字符减少空白等待感
        if (currentAssistantMsg._displayIndex === 0 && currentAssistantMsg._fullText.length > 0) {
          currentAssistantMsg._displayIndex = 1
          currentAssistantMsg.text = currentAssistantMsg._fullText[0]
        }
      } else if (delta.type === 'text_start') {
        // 新文本块开始
      }
      break
    }

    case 'tool_execution_start': {
      if (!currentAssistantMsg) break
      const tc = {
        name: event.toolName,
        args: event.args,
        done: false,
        result: '',
        _expanded: false,
      }
      currentAssistantMsg.toolCalls.push(tc)
      scrollDown()
      break
    }

    case 'tool_execution_update': {
      if (!currentAssistantMsg) break
      const tc = currentAssistantMsg.toolCalls.find(t => t.name === event.toolName)
      if (tc && event.partialResult?.content?.[0]?.text) {
        tc.result += event.partialResult.content[0].text
      }
      break
    }

    case 'tool_execution_end': {
      if (!currentAssistantMsg) break
      const tc = currentAssistantMsg.toolCalls.find(t => t.name === event.toolName)
      if (tc) {
        tc.done = true
        if (event.result?.content?.[0]?.text) {
          tc.result = event.result.content[0].text
        }
      }
      scrollDown()
      break
    }

    case 'turn_start':
      // 新的一轮思考
      break

    case 'turn_end': {
      // 一轮结束，可能还有下一轮
      break
    }

    case 'message_start': {
      // 新消息开始（可能是用户消息或助手消息）
      break
    }

    case 'message_end': {
      // 消息结束
      break
    }

    case 'error':
      waiting.value = false
      if (currentAssistantMsg) {
        const errText = `\n\n\`\`\`error\n${event.error}\n\`\`\``
        currentAssistantMsg._fullText += errText
        currentAssistantMsg._displayIndex = currentAssistantMsg._fullText.length
        currentAssistantMsg.text = currentAssistantMsg._fullText
        currentAssistantMsg._streaming = false
      }
      currentAssistantMsg = null
      break
  }
}

// 发送消息
async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || waiting.value) return

  inputText.value = ''

  // 添加用户消息
  messages.push({ role: 'user', text })
  scrollDown()

  // 发送到后端
  try {
    await fetch('/api/agent/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
  } catch (err) {
    messages.push({ role: 'assistant', text: `\`\`\`error\n${err.message}\n\`\`\``, _streaming: false })
  }

  if (inputRef.value) inputRef.value.focus()
}

// 清空
function clearChat() {
  messages.length = 0
  currentAssistantMsg = null
  waiting.value = false
}

// 自动滚动
function scrollDown() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

function autoResize(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}

function truncate(str, max) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '...' : str
}

// 将文本拆分为单个字符，每个字符独立 span 渲染
// 结合流式渲染器实现逐字出现的打字机效果
function tokenize(text) {
  if (!text) return []
  // 使用 spread 或 Array.from 以正确处理 emoji 和代理对
  return [...text]
}

// 状态
const statusClass = computed(() => {
  if (waiting.value) return 'status-thinking'
  return 'status-idle'
})

const statusText = computed(() => {
  if (waiting.value) return '思考中...'
  return '就绪'
})
</script>

<style scoped>
.agent-chat {
  width: 380px;
  min-width: 380px;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.25s ease, min-width 0.25s ease;
  overflow: hidden;
}

.agent-chat.collapsed {
  width: 48px;
  min-width: 48px;
}

/* 头部 */
.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-avatar {
  font-size: 22px;
}

.agent-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.agent-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.agent-status {
  font-size: 11px;
  color: var(--text-muted);
}

.agent-status.status-thinking {
  color: var(--accent-orange);
}

.agent-status.status-idle {
  color: var(--accent-green);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.btn-icon {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 13px;
  padding: 4px 6px;
  border-radius: 4px;
  transition: all 0.15s;
}

.btn-icon:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.toggle-btn {
  font-size: 10px;
}

/* 消息列表 */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 100%;
}

.message.user {
  align-items: flex-end;
}

.message.agent {
  align-items: flex-start;
}

/* 气泡 */
.bubble {
  max-width: 100%;
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
}

.user-bubble {
  background: var(--accent-purple);
  color: white;
  border-bottom-right-radius: 4px;
}

.user-bubble .bubble-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-bubble {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-bottom-left-radius: 4px;
}

/* 思考块 */
.thinking-block {
  background: rgba(124, 92, 252, 0.06);
  border: 1px solid rgba(124, 92, 252, 0.15);
  border-radius: 8px;
  margin-bottom: 8px;
  cursor: pointer;
}

.thinking-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--accent-purple);
}

.thinking-icon {
  font-size: 14px;
}

.expand-btn {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
}

.thinking-content {
  padding: 0 10px 8px;
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  font-style: italic;
  border-top: 1px solid rgba(124, 92, 252, 0.1);
  padding-top: 6px;
}

/* 工具调用卡片 */
.tool-call-card {
  background: rgba(79, 156, 247, 0.05);
  border: 1px solid rgba(79, 156, 247, 0.12);
  border-radius: 8px;
  padding: 6px 10px;
  margin-bottom: 6px;
  font-size: 12px;
}

.tool-call-card.done {
  border-color: rgba(52, 211, 153, 0.2);
  background: rgba(52, 211, 153, 0.04);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-icon {
  font-size: 13px;
}

.tool-name {
  font-weight: 600;
  color: var(--accent-blue);
  font-family: 'SF Mono', monospace;
  font-size: 12px;
}

.tool-status {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
}

.tool-status.running {
  color: var(--accent-orange);
}

.tool-args {
  margin-top: 4px;
  padding: 4px 6px;
  background: var(--bg-primary);
  border-radius: 4px;
}

.tool-args code {
  font-size: 11px;
  color: var(--text-secondary);
  word-break: break-all;
}

.tool-result {
  margin-top: 4px;
  padding: 4px 6px;
  background: var(--bg-primary);
  border-radius: 4px;
  max-height: 80px;
  overflow-y: auto;
  cursor: pointer;
}

.tool-result pre {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
  font-family: 'SF Mono', monospace;
}

/* Agent 文本 */
.agent-text {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
}

.agent-text.streaming {
  border-right: 2px solid var(--accent-purple);
}

.cursor-blink {
  animation: blink 0.8s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* 等待气泡 */
.waiting-bubble {
  padding: 10px 16px;
}

.thinking-dots {
  display: flex;
  gap: 4px;
  font-size: 12px;
  color: var(--accent-purple);
}

.thinking-dots span {
  animation: dot-bounce 1.4s ease-in-out infinite;
}

.thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-4px); opacity: 1; }
}

/* 输入栏 */
.chat-input-bar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.input-field {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  resize: none;
  min-height: 36px;
  max-height: 120px;
  line-height: 1.5;
  transition: border-color 0.15s;
}

.input-field:focus {
  border-color: var(--accent-purple);
}

.input-field::placeholder {
  color: var(--text-muted);
}

.send-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--accent-purple);
  color: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.send-btn:hover:not(:disabled) {
  background: #8b6cfc;
  transform: scale(1.05);
}

.send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
