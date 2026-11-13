# Gemini Ultra CLI 会话模型工具统计语言交接

日期：2026-11-13。WI-159 / E-371至372 / F-116。持续目标 active，源码基线 e77eacf。继续源码优先与 Windows 必要定向验证，功能收敛后再统一最终平台包。全局 preview.83 保持，无打包、重装、版本变化、多平台 CI 或外部/付费模型请求。

## 修复

StatsDisplay、ModelStatsDisplay、ToolStatsDisplay 原来没有订阅语言，中文模式下会话概览、模型表格、工具统计和空状态仍固定英文。现在三组件与会话概览中的模型用量表复用 useLocale，标题、分组、字段、表头、Google 登录说明、审核数量和空状态均按当前语言显示；英文原文保持。新增 statsLabels.ts 仅集中映射十二种 LlmRole 的中文展示名，主代理/子代理及各辅助角色可读，未知角色原值回退，类型约束保证新增枚举必须补齐映射。

保留模型 ID、工具名、会话 ID、认证方式协议值、账户等级品牌和数字；未改统计计算、数据写入、请求、刷新频率、布局列宽、颜色或单位格式。用户传入的自定义标题/页脚仍按原文显示。只复用现有 Ink 组件与主题，没有新 UI 依赖、轮询或动画。此轮补齐三个常用统计视图，不能扩大声称整个 CLI 已全中文。

## Evidence → Finding → Path

E-371：statsLocale.test.tsx 在旧源码五项均失败，包括会话、模型、工具三视图的英→中→英，以及模型/工具两个空状态。修后五项通过；输入 metrics 的 JSON 始终保持，切回英文后模型和工具 ID 保留。夹具补齐了角色指标的 totalErrors 字段，未改变产品计算。五个测试使用隔离 locale 文件，不写个人语言偏好。

另从 StatsDisplay.test.tsx / ModelStatsDisplay.test.tsx / ToolStatsDisplay.test.tsx 各取一个相关既有场景：所有会话分组、模型角色分解、单工具统计。三个英文快照逐字通过、没有更新快照；其余三十项未运行。共八项必要定向，无全量/冒烟。旧组件对照通过独立英文 locale 文件隔离，避免读取个人偏好。

命令在 packages/cli：npx vitest run src/ui/components/statsLocale.test.tsx --coverage.enabled=false；三个旧文件只用 -t 'renders all sections when all data is present|should display role breakdown correctly|should display stats for a single tool correctly'。strict CLI 源码编译 npx tsc -p packages/cli/tsconfig.json 最终退出 0，五修改文件 eslint 最终退出 0；首 lint 的 one-var 与不安全类型断言已改为独立声明和静态 Map，不靠禁用规则。相关格式与 git diff --check 通过。

E-372：verify-source-stats-locale.mjs 使用实际 Windows Node v24.19.0 编译源码 CLI、ConPTY、独立 home/workspace/providers/locale，未使用 preload 或注入假 metrics。唯一生成任务通过两条 loopback OpenAI 流响应，第一条请求真实 list_directory，第二条收到该工具实际结果后给出确认。确认第二次请求具有相同 tool_call_id 的 tool 消息后，才进入三个统计视图的验证；没有执行 shell、样本或外部安全工具。

依次真实输入普通提示、/stats session、/stats model、/stats tools、/language 中文、三个中文统计视图、/language 英文、英文工具统计及 /quit。11 步、12 条件通过，19760ms，CLI 和验证进程均退出 0，共两条 loopback 请求、零外部/付费调用。中英文标题/字段/认证标签、中文主代理、工具名、英文恢复正确，provider/settings 文件字节保持，只显式语言操作保存隔离 locale。

首原生验证器准备时重复 listen 本地服务器，尚未启动 CLI 即退出；已修验证器并保留 source-stats-locale-final.log，不记作产品故障。观察条件选择表格后部字段，避免在仅收到标题的分块输出上过早判断。最终验证器退出 0。这里的模型服务响应是受控 fixture，工具执行、metrics 生成、命令及渲染真实；不证明真实模型质量、截图像素/所有终端尺寸或最终跨平台分发。

F-116 → Path：三个统计组件原固定文字没有语言订阅；接入既有 useLocale 并只翻译展示层，统计数据、模型路由、权限与核心预算不动。十二种角色只转换可见标签，不改 LlmRole 或持久化键。

## 证据与保全

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：stats-locale-before.log / -before-junit.xml、stats-locale-test.log / -junit.xml、stats-locale-controls.log / -controls-junit.xml、stats-locale-source-compile.log / -final-source-compile.log、stats-locale-lint.log / -final-lint.log；implement-stats-locale.mjs、prepare-stats-terminal-verifier.mjs、verify-source-stats-locale.mjs、source-stats-locale-final.log / -final-run.log / -terminal-output.txt / -result.json，以及 source-stats-stage-preservation.json。工程验证脚本不作为 CLI 用户功能分发。

结束时单独核对个人 provider / locale / config/skill-tags.json 与旧 E-294/E-364 失败 SHA 保持、ultra-tools.json 仍不存在、全局仍 1.0.0-preview.83，保全 passed=true。个人三文件 SHA 为 e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332 / 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / 33a88098707f0383b34286ad83d7bc979f48f80441f4569cb1641ccfef89ca10。未重放任何付费失败任务，未改个人数据库、账户、工具安装或 PATH；只删除核实后的本验证 mkdtemp。

UI 沿用 ui-skills-root 选择的 baseline-ui 最小上下文，使用现有 Ink 原语。既有 case 的同会话 lead/cae/doc、workitems/timeline/field-journal 持续更新，无 Codex 子代理。只同步隔离 codex 分支并 skip ci，不合并 master、不正式 Release。

剩余边界：退出 SessionSummaryDisplay 的默认告别/恢复文案、命令描述、热力图及底层错误未由本轮统一；时长使用既有 h/m/s/ms 缩写。固定列宽与截断策略保持，未宣称极窄终端或异常 metrics 的展示校验全部完成。复杂协作模型质量和最终分发仍待，不把本地协议场景当上线验收。后续继续源码和 Windows 必要验证，所有功能收敛后再统一最终 Windows/macOS/Linux 包，goal 保持 active。
