# Gemini Ultra CLI 位运算真实协作与失败交接

日期：2026-11-13。WI-155（真实质量未通过）、WI-156（源码诊断修复本地通过）；E-363至366 / F-113。持续目标 active。源码基线 c095775；沿用本地 DSH-purge 参考与既有功能，不打包、重装、升版本或启动多平台 CI，全局安装保持 preview.83。

## 本轮结果

新的真实 Swarm 未交付最终报告，不算质量验收通过。两个 researcher 各一轮，flow 完成，prototypes 因输出 token 上限失败；24 应用调度、28 HTTP 请求观察上限、1 失败轮次、3 成员轮次、420 秒 live 外层时限。实际 14 请求（main 5 / researcher 9），424303ms 含本地准备，CLI 退出 1、验证运行器退出 0，没有触发外层 kill、没有自动重试或追加请求，没有创建 verifier。状态 blocked、已有结果保留，无 BITMIX_REVIEW.md / analysis.json。运行器退出 0 仅说明证据收集正常，不能视为产品任务成功。

最后失败响应 HTTP 200、finish_reason=length、completion_tokens=10240，单次约 281508ms；观察到 26366 个 reasoning 字符、3043 个正文字符、0 工具调用。是生成响应截断，不是 HTTP 故障或已证明的超时失效。model.requestTimeoutMs 描述的是响应开始等待，不是生成总时限，不据此改写超时实现。未执行样本、shell、测试、扫描或重复反编译；使用现有配置的模型服务，不是对供应商做安全测试。任务不会原样重跑。

## Evidence → Finding → Path

E-363：run-source-bitmix-native.mjs 调用实际编译 core 的 binary_triage / binary_inspect / binary_analyze / binary_decompile，共 11 次，55873ms、进程退出 0、0 模型请求。实际 Windows r2/rabin2/Ghidra/Java 静态分析新生成无害 ELF64，完整 C/报告/原始指令与 xref 均保存。样本 SHA256 c82d6440a250ae133fcb0e393b712e8029e18a6edb3ca48f304859f3769859a3。宿主读取真实指令和 C 独立复核：CALL 0x405089→0x405040、0x405044→0x405000；入口低 32 位 0xffffffe1，经 xor/ROL32/mask 得 0xdf，奇分支 xor 0x33 得 0xec=236。此值仅静态推导，不是实际输出或退出码。三个 pdj 窗口 truncated=true 且混入 ret 后字节，不声称全函数或全二进制覆盖；Ghidra 元数据与 C 原型不一致，compiler=gcc 不是构建来源证明。

E-364：run-source-bitmix-live.mjs / observe-source-bitmix.mjs 用当前源码 CLI dist、隔离 home/workspace 和独立配置运行一次新任务。只复制实际原生工件，未把生成器或宿主已解答案给模型。准备及 budget 两本地命令 0 请求，再仅一次 resume。启动前用 node ../../scripts/copy_files.js 在 core 同步非 TypeScript 运行资产，local-reverse 源/dist SHA 均为 6273910a2d9db8497c8e0b0791006eebe8d66ce283e589cd291e3392d175a342，避免使用旧技能文档。这是源码运行准备，不是打包或最终分发验收。

真实失败状态与 flow 部分成果保留。宿主另发现 flow 把偶分支可达上限写成 0xFF+0x17=0x116；但偶分支要求 r&1=0，r∈[0,255] 的最大偶数为 254，故最大值是 277=0x115。这是模型写作的静态推断错误，不能包装成工具或运行时代码缺陷。调用位点和特定入口 236 算对，也不能抵消该错误。source-bitmix-quality-review.json 明确 accepted=false。旧 E-294 的 21 请求失败、全部输入 SHA 和状态原样保留；本轮既不覆盖，也不声称已经修复旧任务。

F-113：原本地预算交接只列 failed-turn budget exhausted 和路径，没有显示实际暂停成员原因，用户看不到 prototypes 的 output token limit。路径 packages/core/src/agents/swarm.ts 的 swarmBudgetHandoff 现在在现有独立复核信息之外列最多 3 个暂停成员，每段最多 1200 字；优先 lastError，避免用旧成功结果遮住新错误。摘要明确不代表本轮完成，不把 waiting 成员列为失败；完整归档路径保持。中英文均提示先读成员原因与完整结果，增加调度预算不会修复成员错误，仅按用户允许范围续跑。不改预算、状态、归档、模型输出上限或自动重试策略，不把摘要当新的复核结论。

E-365：新增 3 场景在旧源码失败，原 2 场景保持通过；修后 swarmBudgetHandoff.test.ts 共 5 项通过，覆盖双语失败原因、lastError 优先、waiting 同伴不误列、单次运行及状态字节保持。npx vitest run src/agents/swarmBudgetHandoff.test.ts --coverage.enabled=false；strict core 编译 npx tsc -p packages/core/tsconfig.json 与仅两修改文件 eslint 均退出 0，git diff --check 通过。只做必要定向，无全量/冒烟。

E-366：seed-source-member-handoff.mjs / verify-source-member-handoff.mjs 在独立 profile 重建本次真实失败成员快照，使用实际 Windows 编译源码 CLI 非交互入口触发本地预算拒绝，不重放模型任务。14 条件通过、9054ms、产品预期退出 1、验证器退出 0；错误摘要包含 prototypes、截断原因和先检查提示，不伪造复核，不列 waiting flow 为失败。状态字节保持，loopback 请求 0，没有 API 故障报告。此验证证明真实 CLI 交接，不是交互终端视觉、模型质量或跨平台验收。

## 配置、证据与接续

原始证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：source-bitmix-native/（含 result.json、independent-review.json、11 工具结果及完整反编译工件）、source-bitmix-live-swarm-result.json / -requests.jsonl / -wire.jsonl / -records / -workspace / -output.txt，source-bitmix-quality-review.json，swarm-member-handoff-before.log / -test.log / -junit.xml / -source-compile.log / -lint.log，source-member-handoff-result.json / -output.txt，以及 source-bitmix-stage-preservation.json。真实模型任务失败已保留，后续不把这些验证器作为最终用户功能分发。

临时凭据文件已删除，个人 provider / locale SHA 保持 e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332 / 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8；真实个人 .gemini/config/skill-tags.json SHA 保持 33a88098707f0383b34286ad83d7bc979f48f80441f4569cb1641ccfef89ca10，ultra-tools.json 仍不存在，安装版本仍 83。运行器 personalHashes 的顶层 skill-tags.json=null 只代表该非标准位置不存在，不能替代真实 config 路径检查；补充保全验证已明确检查真实路径。没有改个人数据库、账户、工具安装或 PATH。

沿用 case gemini-ultra-agent-20261110 granted 范围；本会话承担 lead/cae/doc，R26 源码、R7 静态指令和 R22 Ghidra 工件按既有路由，没有启动 Codex 子代理。源码修复可回退独立提交，保留全部失败工件；只同步隔离 codex 分支并 skip ci，不合并 master、不正式 Release。整体上线目标仍 active，模型复杂任务质量与最终分发尚未完成。

后续顺序：1. 继续源码中的协作可用性及结果质量问题，保留两次真实失败，禁止原样付费重跑；2. 收敛剩余 CLI 语言与现有功能，仅做 Windows 必要定向验证；3. 全部功能收敛后统一最终 Windows/macOS/Linux 包及平台验收。
