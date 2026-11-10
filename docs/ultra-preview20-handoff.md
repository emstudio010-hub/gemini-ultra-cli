# Gemini Ultra CLI preview.20 输出上限与真实流观察

日期：2026-11-10。源码 C:\Users\Administrator\work\gemini-ultra-cli；分支 codex/ultra-agent-portable。功能提交 1f98705a6ebc6be9dde5a036d3d4dc8527644d6e。本机双命令已安装 1.0.0-preview.20，整体目标 active，完整上线未验收。

## E-074：可选输出上限

/provider 新增「输出上限」，按供应商保存正安全整数 maxOutputTokens。留空恢复现有默认，任务显式上限优先；未传字段的普通编辑和演练台保存保留旧值，显式 undefined 清除。两个公开生成入口统一注入，四协议已有参数映射不变，Anthropic 现有推理预算默认保留。用户个人供应商配置未被修改，不增加首次创建供应商的必经步骤。

12项必要定向检查通过，覆盖持久化、保留、清除、非法值拒绝时内存/磁盘不变、四协议流式/非流式参数和优先级、Chat两种Token字段。严格ESLint及核心/CLI
TypeScript通过。首次两个断言误把Anthropic高强度默认24192写成8192，已修正检查预期；产品默认未变，原日志保留。没有全量或冒烟检查。

真实Windows
ConPTY输入核对通过：菜单显示、0就地报错、32768保存、重开读回、留空清除、正常退出，10,789ms；没有模型请求。

## E-075 / E-076：分发与安装

[三平台运行42764054577](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42764054577)
completed/success。Windows x64、Linux x64、macOS
arm64独立构建、打包和隔离安装链通过；模型为fixture。工件版本、安装报告、SHA-256、六个rg文件hash与0755核对通过。

| 平台    | 包SHA-256                                                        |
| ------- | ---------------------------------------------------------------- |
| Windows | 11c7fdb0292165eee3a0099df57223c46cee8d88f9de5523de6ec5b3a048e0c9 |
| Linux   | 963df61c1741fa25deb1193d73638d6c1791cb6dd8f39f334354f13382417e51 |
| macOS   | da0df912e4099b7403922d15a331d9563c585b8ce40cc6091909ce08cc7a9482 |

本机 gemini-ultra 与 gemini-ultra-cli 均为1.0.0-preview.20，入口SHA-256
8e7153b32b4d37eaafb3bc961a3dcce99d57333b98ac43721be8b9600c762ebc 与Windows工件一致。已有npm缓存offline安装9秒，不代表无缓存新电脑离线安装。

已安装CLI的实际HTTP工具闭环通过：两个请求均发送32768，分片write_file参数真实落盘，最终正文和usage完整、无误重试，2,566ms。响应为loopback
fixture，不能当真实供应商验收。Windows包：C:\Users\Administrator\Documents\ChatGPT\gmncliu\github-run-42764054577\gemini-ultra-cli-windows-latest\gemini-ultra-cli-1.0.0-preview.20.tgz。未合并master，未正式发布Release。

## E-077：一次有界真实续接仍失败

沿用已授权case和当前Ess /
deepseek/deepseek-v4.1-flash，恢复E-070最新完整会话及一致性笔记库，八份源码仍取E-063原快照。原生--resume保持442e90eb-db6c-4ebd-b6ca-b10843721b53；正常工具权限保留，不重启三个子代理，不强制压缩，不限制为仅写报告。仅隔离配置设置maxOutputTokens=32768、maxAttempts=2、maxSessionTurns=8、240秒观察上限。

167,219ms自行结束，未触及观察上限，退出1，INVALID_STREAM/thinking-only，仍无报告。4次主API请求、0新子代理请求、1次read_file成功；总Token195,654，其中缓存46,080，非账单金额。原笔记仍1条且逐行相同、八份源码及用户供应商配置哈希不变，保存会话前缀和SQLite
backup重开复核通过。E-063、E-070原失败结果保留。

独立fetch观察器仅保存参数、长度、状态、结束原因及数字usage，不记录密钥/端点/响应正文。四请求都确实发送32768、HTTP200；全部textChars=0，思考长度分别2072/4188/5178/3969；第二次有tool_calls结束原因，其余三次未提供finish_reason。未保存原始网络流，也未盘点DONE标记，不能声称上游缺少DONE或确定超时/模型/网关/适配器谁是根因。提高请求上限没有解决当前失败，不把预算配置作为根因修复。

## 接续入口与边界

工程证据均在 C:\Users\Administrator\Documents\ChatGPT\gmncliu：

- provider-output-limit-tests.log、-initial-expectation.log、-lint.log、-types.log。
- dev-preview20-output-limit-dialog-result.json / -output.txt。
- github-preview20-artifacts-result.json、global-install-github-preview20-result.json、installed-preview20-output-limit-result.json。
- preview20-live-audit-budget-result.json / -analysis.json / -wire.jsonl /
  -sessions / -facts.sqlite；原失败结果passed=false不得改写。
- resume-live-audit20.mjs、observe-provider-wire.mjs、analyze-native-resume20.mjs。

目标池 docs/ultra-goals.md 维护至E-077。下一阶段先离线追踪真实思考流的结束语义和timeout链，结合已保存统计；不原样重复付费续跑。若需后续恢复，最新会话和数据库用preview20-live-audit-budget，源码快照继续用preview17-live-autonomous-handoff-sources。复杂反编译、更多原生工具与完整自主任务仍未验收。
