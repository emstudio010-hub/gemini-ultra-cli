# Gemini Ultra CLI 取消分类与有界续接交接

日期：2026-11-10。源码分支 `codex/ultra-agent-portable`，功能提交
`2b2f348000439251b257f06977539a7cd2215e05`。整体目标 active，原多 Agent 长任务交付仍未验收。

## E-096：原任务压缩续接

已安装 preview.25 恢复原会话
`442e90eb-db6c-4ebd-b6ca-b10843721b53`，原八份源码、原 checkpoint 和一致性笔记库。没有重新启动子代理。离线恢复得到 31 个历史 turn，估算 34,753
Token；压缩切分点为 9，批次结果进入摘要范围，最近历史保留。原 checkpoint
SHA-256 不变。

当前真实 Ess/DeepSeek 服务，隔离配置输出 8192、上下文观察预算 64000、压缩阈值 0.5、主聊天 maxAttempts=2、maxSessionTurns=6、响应头超时 45000ms、外部观察器 180 秒。这些不是修改用户配置，也不代表核实了网关实际容量。

运行在 180,185ms 被观察器结束，未返回最终 JSON 或报告。前两次非流式压缩请求分别在 48,266ms、48,413ms 失败，stderr 明确
`UND_ERR_HEADERS_TIMEOUT`，对应本次隔离响应头设置。第三次在 36,703ms 返回 HTTP
200、7,566 字符首轮摘要和 stop，复核尚未完成，未持久化新快照。不能写成 CLI 自行崩溃或再次只有思考输出。

已完成响应的 usage 为 32,528
Token；超时及在途请求用量未知。观察器只记录已结束的尝试，不能把 3 条记录当成完整请求总数。`general.maxAttempts`
文档限定主聊天；utility
BaseLlmClient 默认独立重试 5 次，不能称本次全局只有两次请求。

失败 aggregate 的 sameSessionId 和 twoCompressorRequests 依赖缺失的最终 JSON/stats，因此为 false。独立 analysis 已从保存 checkpoint
header 核实同一原 ID、原始前缀保持；数据库重开后原 note 整行比较一致、没有重复，源码和用户实际供应商配置保持。原 false 记录保留，分析补充其证据边界。原任务仍未交付，没有追加一轮相同付费续接。

## E-097 / F-030：普通错误被误显示为取消

复用原 researcher 报告提出的候选，在当前 local-invocation 和 local-session-invocation 核实：catch 用错误正文包含
`Aborted` 判断取消。普通
`Error('Provider returned AbortedQuota: remaining credits exhausted.')`
也会发送 CANCELLED 并抛出。两个入口的对照用例修前失败，普通不含该词的错误两项通过。

现在仅依据调用方 `signal.aborted` 或标准 `AbortError`
分类。普通错误保留 ERROR 显示和原错误信息；真实取消，包括
`AbortController.abort(new Error(...))`
的普通 Error 原因，继续传播取消。批次 catch 自有分类，本修复证据不宣称旧版批次完成/失败数量错误，也不是 E-077 无正文失败的根因。

10 项必要选择检查最终通过，覆盖两个入口的普通/含 Aborted 文案错误、标准取消、ABORTED 返回值和普通 Error 取消原因。新增取消断言首次缺 SubagentState 导入，原失败日志和类型错误保留；补齐测试导入后通过。受影响文件严格 ESLint、格式及核心/CLI 类型构建通过，没有全量或冒烟。产品重试策略没有改动。

## 分发状态

E-098：功能提交已推送开发分支。GitHub
API 多次 TLS 握手失败；直连 curl、已配置代理和外部状态通道也出现连接失败，没有取得本次 Actions
run
ID 或结果，没有重新触发构建。preview.26 三平台状态与工件待后续核对；最近已验收三平台工件仍为 preview.25/run42776699623。

同一提交在本机完成 package:ultra，生成 Windows 本地包；源码功能文件与提交一致，版本、包 SHA-256、六个内置 rg
hash/0755 核对通过。这是本地构建，不标为 GitHub CI 工件。

E-099：已用现有缓存 offline 安装本地 preview.26（9秒），两个命令版本一致，安装后的424个包内文件逐一与解出的本地工件比较一致。此核对覆盖文件身份，不宣称新一轮真实子代理执行路径或三平台运行。10项定向代码检查和类型构建证据见上文，没有额外重跑未受改动影响的模型任务。

包：`C:/Users/Administrator/work/gemini-ultra-cli/artifacts/ultra-release/gemini-ultra-cli-1.0.0-preview.26.tgz`。

包 SHA-256：`c5699b1a7d28646f47398ecbc844707378b15e3855b6436eeba045a8de53383d`；入口 SHA-256：`0b7ae4baa69fbc565e71f66fbcc635239048f22d9502f85247776053506dfffb`。

已有缓存离线安装不代表无缓存新电脑可以离线安装。本机当前使用本地构建的 preview.26；若后续取到 CI 工件，先核对相同源提交和工件再决定是否替换，不把来源混写。

## 工程证据

根目录：`C:\Users\Administrator\Documents\ChatGPT\gmncliu`。

- preview25-resume-preflight.json、resume-live-audit25.mjs。
- observe-provider-wire-stream.mjs：按接收块累计脱敏字段、状态、finish
  reason 和 usage，不记录正文或密钥。观察副本失败不作为上游截断证明。
- preview25-live-audit-compressed-result.json、-analysis.json、-wire.jsonl、-output.txt、-sessions、-facts.sqlite；数据库为 Node
  SQLite backup。
- subagent-abort-classification-before.log、-after.log、-final-tests.log（缺测试导入）、-final-recheck.log。
- subagent-abort-classification-lint.log、-final-lint.log、-types.log（缺测试导入）、-final-types.log。
- preview26-local-package.log、verify-local-preview26.mjs、local-preview26-artifacts-result.json。
- verify-installed-local26.mjs、global-install-local-preview26-result.json、preview26-ci-status-final-attempt.log。

## 接续方向

原长任务继续保留，不重新审查三子代理。先离线核对非流式压缩响应头预算、utility 独立重试和两阶段摘要的时间成本，再决定必要有界调用。此次隔离 45 秒设置不能归因为生产默认或旧流式失败根因。复杂逆向、真实摘要质量和完整自主交付仍未通过；不合并 master、不正式发布 Release。

## 最终同步记录

功能提交2b2f348000439251b257f06977539a7cd2215e05已成功推送。最终交接文档已在本地提交，但推送因GitHub
TLS握手失败未完成；源码docs、工程目录和Obsidian均已有完整交接。下次重试现有文档提交并按相同功能提交查询CI，不重新触发构建。

## 2026-11-11 网络恢复后的补充

E-103：原功能提交2b2f348000439251b257f06977539a7cd2215e05对应运行42778862788已确认三平台completed/success，三个工件版本/安装报告/SHA和六rg
hash/0755核对通过，未重启工作流。此前未知状态是网络故障所致。本机现已安装preview.27的Windows
CI包，详见ultra-preview27-handoff.md；未为旧工件核对降级安装。
