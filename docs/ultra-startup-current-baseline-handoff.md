# Gemini Ultra CLI 当前启动基线交接

日期：2026-11-12。WI-106/E-259。上一阶段preview.72已安装，产品源ba1d006f0be2a1e2a3dbcec78711caae8e643bd4，交接HEAD
f8f7f5e。本阶段为原始启动/加载目标的当前观测，没有产品源码修改或新版本，不重复三平台构建。goal
active。

## 当前证据

已安装preview.72在真实Windows
ConPTY启动，一份独立临时用户profile、生成工作区和loopback供应商，自动执行本地 /effort
low 和 /quit。输入框1913ms，本地斜杠命令完成2240ms，退出0、timedOut=false、modelRequests=0。保留profiled原始PTY及性能条目；这是单机一次观测，包含预加载观察器开销，不是跨机器冷启动或真实账号登录基准。不用它声称相较preview.46单次1771/2018ms结果有显著回归或改善。

性能条目显示：child
preload在32ms附近，cli_startup起始约1155ms；load_settings约13ms、parse_arguments约47ms、load_cli_config约79ms、setup_terminal约4ms、initialize_app约1ms。首轮load_builtin_commands约143ms、discover_tools约86ms；后续一次命令表加载约16ms。多个条目交叠，不相加当作端到端延迟；观察器的at/elapsed记录是回调时间，分析使用条目的start/duration。主要待调查部分是开始cli_startup之前约1.1秒的模块加载，不把目录扫描当已确认卡点。

另一次源码SkillManager发现读取已有本地技能目录，不执行技能正文：发现179个最终技能、耗时187ms、233条debug消息、0warn；计时只涵盖discoverSkills，排除源码模块导入且收集debug输出，因此不代表完整CLI启动。目录元数据仅只读核对，没有发现相同realpath的目录别名重复。SkillManager目录并发3、skillLoader文件并发8、仅扫描两级，常见个人技能正文最大约40KB；未确认本机技能加载卡死。loadSkillFromFile仍整文件读取，保留为后续代码线索，不凭假设修改或新增无关压力测试。

第一次ConPTY观测在CLI执行前被观察器参数拦住：NODE_OPTIONS --import传入Windows
C:/绝对路径，Node报ERR_UNSUPPORTED_ESM_URL_SCHEME；改为file:///C:/
URL后完成上述一次真实观测。原失败输出和result.json保留，不能把此观察器错误算成产品启动故障或把首次记录说成通过。

Evidence → Finding →
Path：preview.72当前安装内容与CI包逐文件匹配的既有证据 + 当前ConPTY与phase观测 → 本机正常启动且主要延迟先于cli_startup，技能扫描尚不足以归因 → 保留基线，后续优先分析模块导入或真实有界任务的实际阻塞；没有新缺陷结论。

## 工件与接续

工程目录C:/Users/Administrator/Documents/ChatGPT/gmncliu：startup-skill-discovery-observation.json，preview72-startup-observation-result.json/-output.txt/-log（观察器路径失败），preview72-startup-profiled-result.json/-output.txt/-log（通过），preview72-startup-phases.jsonl。工具复用observe-interactive-startup.mjs与observe-startup-phases.mjs；预加载URL为file:///C:/Users/Administrator/Documents/ChatGPT/gmncliu/observe-startup-phases.mjs，事件输出ULTRA_STARTUP_OBSERVATION指定独立文件。没有全量/冒烟、额外模型或未受影响业务重跑，没有改个人配置/数据库/逆向工具。

下一阶段应结合原始功能交付边界继续：原生Teamwork/Boost/Grill
me/Swarm已有有界真实任务证据，71新增红队Swarm及72异常成果保留有三平台受控响应证据；新组合的真实模型任务质量、复杂跨机逆向及生产长会话仍不能据此称全面验收。不要用不断扩大测试矩阵替代实际任务交付；需要真实供应商时使用现有授权的一次有界生成本地任务，不自动重复探索调用。
