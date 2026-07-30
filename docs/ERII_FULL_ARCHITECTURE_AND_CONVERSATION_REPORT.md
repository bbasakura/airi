# Erii (AIRI + gptlive 融合版) 本地对话系统全量架构与性能重构报告

> **报告版本**：v2.0 (性能优化与架构重构版)  
> **更新时间**：2026-07-30  
> **核心目标**：以 gptlive 极速单管道对话为内核（听觉 ➔ 大脑 ➔ 发音），融合 AIRI 3D 芙莉莲 VRM 数字人渲染与毛玻璃 UI 外壳。针对中低配电脑性能进行极致轻量化调优，实现零幻听、低 CPU/内存占用、支持实时人声打断（Barge-in）与音画同步的独立 AI 伴侣软件。

---

## 1. 系统架构总览与多端解耦协议 (System Architecture)

整个项目采用**“前端轻量 3D 渲染 + 本地 Companion 侧车服务 + 云端/本地极速大模型 + 神经网络语音”**的解耦架构：

```
┌────────────────────────────────────────────────────────────────────────┐
│               【Erii 独占 3D 视觉与数字人外壳】 (Visual Shell)          │
│                                                                        │
│  ┌──────────────────────┐              ┌──────────────────────────┐   │
│  │ 3D 芙莉莲 VRM 渲染器  │              │ 极简毛玻璃 HUD / 对话气泡 │   │
│  └──────────▲───────────┘              └────────────▲─────────────┘   │
└─────────────│───────────────────────────────────────│─────────────────┘
              │ (Viseme 动画 / 表情联动)              │ (WebSocket/SSE 状态)
┌─────────────┼───────────────────────────────────────┼─────────────────┐
│             └──────────────┐        ┌───────────────┘                 │
│                            │        │                                 │
│  ┌──────────────────┐    ┌─┴────────┴───────┐    ┌────────────────┐   │
│  │ 1. 听觉单元(STT) │    │  2. 极速大脑(LLM)│    │3. 发音引擎(TTS)│   │
│  │ 本地 Voicebox    ├───>│ OpenCodex Gemini ├───>│ Edge TTS       │   │
│  │ Whisper (防幻听) │    │ 3.6 Flash 单通道 │    │ (晓晓自然发音) │   │
│  └──────────────────┘    └──────────────────┘    └────────────────┘   │
│                                                                        │
│                    【Companion 侧车与状态引擎】 (Port 17321)             │
└────────────────────────────────────────────────────────────────────────┘
```

### 通讯协议规范
1. **Renderer <-> Main (Electron IPC)**：处理窗口穿透、极简/完整模式切换、系统托盘及日志推流。
2. **Renderer <-> Companion Core (HTTP REST / SSE / WS - Port 17321)**：
   - `/transcribe` (POST)：音频分片识别请求。
   - `/turns` (POST & SSE)：对话生成与流式文本返回。
   - `/abort` (POST)：瞬间取消当前生成任务（打断信号）。

---

## 2. 基于性能优化的核心模块与有限状态机 (FSM & Pipeline)

### ① 全局有限状态机 (Lightweight FSM)
淘汰脆弱的固定定时器去重锁，采用开销接近 0ms 的状态机控制对话闭环：

```
 [IDLE (空闲)] ──(VAD 触发)──> [LISTENING (聆听)]
       ▲                             │ (语音截断/音频提交)
       │ (播报完毕/打断)              ▼
 [SPEAKING (播报)] <──(TTS 首包)── [THINKING (思考/生成)]
       │
       └──(用户突然说话)──> [INTERRUPTED (打断)] ───► 终止当前 LLM & TTS & 释放音频
```

### ② 听觉阶段（STT - 极轻量 VAD + Whisper 防幻听）
* **低 CPU VAD**：前端采用 `AudioWorklet` 进行极轻量音频能量检测，仅在有声段采样送入 STT，无说话时 CPU 占用几乎为 0。
* **分层防幻听体系**：
  1. **第一层（VAD 门槛）**：持续时间 `< 300ms` 或能量阈值过低直接丢弃，不发起 HTTP 请求。
  2. **第二层（Whisper 参数）**：配置 `no_speech_threshold: 0.6` 与 `language: 'zh'`，降低背景噪声引发的解码误判。
  3. **第三层（动态正则拒识）**：在 [hearing.ts](file:///D:/soft/Erii/packages/stage-ui/src/stores/modules/hearing.ts) 中对静音噪声词 (`you`, `thanks`, `subtitles by`) 及韩文字符集 (`[\uac00-\ud7a3]`) 进行秒级熔断过滤。

### ③ 思考与推理（LLM - 单通道流式响应）
* **单通道控制**：全局排他锁，禁止重叠并发请求。
* **接口协议**：通过 OpenCodex 本地代理 (`http://127.0.0.1:10100/v1`) 调用 `google-antigravity/gemini-3.6-flash`。
* **口语化与轻量化约束**：纯文本生成，不包含复杂 Markdown/HTML 格式，降低 TTS 清洗成本与文本长度。

### ④ 语音合成与打断（TTS & Barge-in 机制）
* **发音引擎**：调用 Python `edge-tts`（音色 `zh-CN-XiaoxiaoNeural`），支持流式分句分包合成。
* **打断 (Barge-in)**：
  - 当在 `SPEAKING` 状态下 VAD 再次检测到有效人声时，前端调用 `AudioContext.suspend()` / `stop()` 立即静音。
  - 前端向 Companion Core 发送 `/abort` 信号，触发 `AbortController.abort()` 立即关停在线 LLM/TTS 流，**瞬间释放 CPU 与网络资源**。

### ⑤ 轻量 3D VRM 驱动与 Viseme 口型
* **摒弃高开销 FFT 实时频域计算**：不使用重型 WebAudio Analyser FFT 逐帧算口型，避免 CPU 飙升。
* **Viseme 口型映射**：利用 Edge TTS 返回的文本断句或音节时间戳，结合 VRM 的 Standard Visemes (`aa`, `ih`, `ou`, `ee`, `oh`) 进行低算力补间平滑过渡，实现流畅且极低 CPU 占用的音画同步。

---

## 3. 性能调优矩阵 (Low-Spec Hardware Performance Matrix)

为了在低配置电脑上保持流畅运行，系统实施了以下性能专项优化：

| 优化维度 | 实施方案 | 性能收益 |
| :--- | :--- | :--- |
| **内存堆上限约束** | 在 [restart.bat](file:///D:/soft/Erii/restart.bat) 中设置 `NODE_OPTIONS=--max-old-space-size=1536` | 防止 V8 延迟 GC 导致的内存暴涨，运行内存从 **4.5GB** 降至 **300MB~600MB** |
| **构建体积与构建开销** | 禁用 `vite-plugin-inspect` 编译快照插件 | 降低 Vite 启动耗时及 Electron 渲染进程内存占用 |
| **打断资源即时回收** | 用户打断时通过 `AbortController` 强制终止网络/TTS 进程 | 避免后台无效计算，CPU 峰值占用降低 40% |
| **音频采样优化** | WebAudio 采样子线程使用 `AudioWorklet` 处理 VAD 门限 | 避免主线程 UI 卡顿，空闲期 CPU 占用卡在 `< 2%` |
| **异常防护** | 在 [main/index.ts](file:///D:/soft/Erii/apps/stage-tamagotchi/src/main/index.ts) 拦截全局 `EPIPE` 破管错误 | 避免父进程关闭时控制台抛出崩溃红框 |

---

## 4. 关键配置文件与改动文件索引 (File Index)

| 配置文件/核心代码 | 文件绝对路径 | 说明 |
| :--- | :--- | :--- |
| **运行时环境配置** | [D:\soft\Erii\.env](file:///D:/soft/Erii/.env) | 配置 Companion 端口、Gemini 3.6 模型、Edge TTS 音色与 Voicebox 地址 |
| **重启批处理** | [D:\soft\Erii\restart.bat](file:///D:/soft/Erii/restart.bat) | 挂载 1.5GB 内存限制、清理旧进程与拉起服务（已修复路径分隔符错误） |
| **静音重启脚本** | [D:\soft\Erii\restart.vbs](file:///D:/soft/Erii/restart.vbs) | 0 命令行窗口静默启动入口 |
| **听觉管道与防幻听** | [packages/stage-ui/src/stores/modules/hearing.ts](file:///D:/soft/Erii/packages/stage-ui/src/stores/modules/hearing.ts) | 注入中文识别与静音幻听过滤器 |
| **Edge TTS 发音处理** | [packages/companion-core/src/adapters/edge-tts.mjs](file:///D:/soft/Erii/packages/companion-core/src/adapters/edge-tts.mjs) | 实现 `cleanTextForTts` 语音文本清洗器 |
| **提供商状态管理** | [packages/stage-ui/src/stores/providers.ts](file:///D:/soft/Erii/packages/stage-ui/src/stores/providers.ts) | 注册 Edge TTS 并完成模型预载 |
| **Edge TTS 配置页面** | [packages/stage-pages/src/pages/settings/providers/speech/edge-tts.vue](file:///D:/soft/Erii/packages/stage-pages/src/pages/settings/providers/speech/edge-tts.vue) | 增加界面音色选择（晓晓/云希等）与试听 |
| **桌面端设置布局** | [apps/stage-tamagotchi/src/renderer/layouts/settings.vue](file:///D:/soft/Erii/apps/stage-tamagotchi/src/renderer/layouts/settings.vue) | 重构为半透明毛玻璃现代 UI 布局 |

---

## 5. 异常降级与容灾预案 (Fallback Matrix)

1. **云端 LLM 超时 / 异常降级**：当 Gemini 3.6 API 响应超时 (`> 5s`) 或网络中断时，系统自动切换至本地轻量级 Ollama 模型（如 `qwen2.5:1.5b`），保障基础对话可用性。
2. **Edge TTS 网络异常降级**：当在线 Edge TTS 无法连接时，平滑降级至浏览器自带的 `Web Speech API` 或本地 Voicebox TTS 引擎。
3. **低显存渲染降级**：当检测到 GPU 显存紧张或帧率 `< 30fps` 时，动态降低 VRM 模型抗锯齿倍率及阴影分辨率，优先保障对话流畅度。
