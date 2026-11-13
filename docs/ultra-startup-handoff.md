# Gemini Ultra CLI 两段启动元数据沿用交接

日期：2026-11-13。WI-165 / E-383至384 / F-122。源码基线 38e1ef906f6ba62ec256bd9f2ba02264af7b5f7d，分支 codex/ultra-agent-portable，goal active。继续源码完善 → Windows 必要定向验证 → 最终各平台打包，全局 preview.83 保留。本轮无打包、重装、升版本、多平台 CI 或付费模型任务。

## 修复与适用条件

上一轮已使单次 bootstrap quota/experiments 有 10 秒上限，但 partial/full 两个 Config 会先后再读一轮，相同挂起服务仍可累计等待约 20 秒。本轮 CLI 在完整 Config 创建后显式调用 reuseStartupAuthMetadataFrom(partialConfig)，沿用这一轮已完成的元数据读取结果，成功或未知结果均只供下一次认证初始化消费。

完整 Config 仍执行 createContentGeneratorConfig/createContentGenerator，并使用自己的 BaseLlmClient；不把绑定 partial Config 的生成器搬过来。认证创建、管理员设置读取/轮询、模型权限检查和完整配置初始化保留。只减少重复的 quota 与 experiments 读取，不跳过 Google 登录或账号 setup。

沿用严格限定为同会话、同目录、同认证方式、同 AuthClient 对象、同项目/端点/HTTP options/凭据指纹，且源仍为同一已完成认证结果、距原完成时间不超过 30 秒。身份指纹只在进程内比较，不输出或持久化凭据。源重新认证或失败、会话变更、目标进入新的 refreshAuth 时使相应记录/待消费状态失效；不匹配就走正常请求。

WeakMap 保存记录和一次性待消费关系，不给 Config 添加含客户端/凭据的可枚举快照字段，不做磁盘或跨进程/沙箱传递。实验与原始配额深拷贝，复用提取的 applyUserQuota 重新在目标上下文计算模型配额；保留真实原抓取时间，经过中间 Config 也不延长元数据原有效期。未知配额/实验仍未知，手动 /model 和显式刷新不受影响，后续主动重新认证仍正常读取。

## Evidence → Finding → Path

E-383：上一轮 E-382 的真实 Windows 记录已定位 partial/full 两次初始化分别 10020/10008ms，不把本轮测试自己构造的期望当作旧问题证据。

本轮 Config 文件定向 32 项通过，再对中间 Config 不延长有效期补 1 项，共 33 个不同场景：15 个新增交接场景和 18 个已有 quota/bootstrap 对照。直接核对目标生成器重新创建、管理员设置两端仍检查、源缓存改动不改变目标快照、原配额抓取时间保持、未知结果不自动重试但显式刷新可恢复、一次消费后重新认证会请求。

11 类拒绝沿用的条件分别为会话、目录、客户端对象、凭据、项目、端点、headers、过期、认证方式、源重新认证、源认证失败；均核对正常读取仍发生。另检查中间 Config 沿用 20 秒前的结果后，35 秒时第三个 Config 正常请求，不能通过转交“续期”。旧配额标准化、preview、取消/迟到保护等相关对照通过。

复现命令在 packages/core：
npx vitest run src/config/config.test.ts -t 'startup auth metadata handoff|Config Quota.*refreshUserQuota|bounds optional bootstrap quota' --coverage.enabled=false
补充：
npx vitest run src/config/config.test.ts -t 'does not extend the metadata age' --coverage.enabled=false
根目录 core/CLI npx tsc -p packages/{core,cli}/tsconfig.json、仅 config.ts / config.test.ts / gemini.tsx 的 eslint、prettier --check 及 git diff --check 均最终退出 0。首 lint 的两处 const 并行声明已拆开，日志保留，无产品断言失败。没有全量、冒烟或不相关 UI 快照检查。

E-384：实际 Windows Node v24.19.0 编译源码 CLI + ConPTY，独立 profile/workspace。沿用上一轮受控 account transport：真正运行 partial/full Config、getExperiments、CodeAssistServer/requestPost、配额缓存与 CLI/UI，仅在元数据拥有者期间把 native backend/HTTP 适配到 loopback；认证仍为隔离假凭据的 gateway，没有 Google OAuth/setup 或付费模型。

timeout 场景：第一段 quota/experiments 均挂起，10 秒取消实际连接；第二段沿用未知结果。两次 refreshAuth 为 10016ms / 11ms，实际生成器 ID 分别为 1/2，均就绪，未知配额/实验没有伪造。随后手动 /model 取得 remainingFraction=0.15 并显示 85% 已用，中文统计和退出正常。4 步/22 条件通过，24962ms，CLI/验证器退出 0。

success 场景：第一段真实本地 HTTP 返回 remainingFraction=0.5 和 experimentIds=[4242]，第二段精确保留这两项；两次 refreshAuth 为 41ms / 1ms，生成器 ID 仍为 1/2。后续手动 /model 仍发新请求更新为 85% 已用，中文统计/退出可用。4 步/22 条件通过，13547ms，CLI/验证器退出 0。

每个场景共 3 次本地元数据请求，即启动 quota/experiments 各 1 次，加手动 quota 1 次；原先第二段的 2 次重复元数据请求消除。0 模型生成、0 尝试外部 fetch，provider/settings 原字节保持。两个场景各有独立结果/日志/终端文件，未覆盖旧阶段失败或重跑旧付费任务。

这些单次时延是受控调用链观测，不能宣称整体秒级启动、真实 Google 登录同样快、所有账户都能命中沿用条件或最终安装包已经包含本轮源码。条件不符时正常读取及其上限保持；跨机器、原生真实账号和最终各平台包仍未验收。管理员服务自身的挂起/取消及并行认证事务不由本轮证明。

F-122 → Path：gemini.tsx 创建完整 Config 后未交接部分 Config 已完成的可选元数据尝试，config.ts 因而顺序重复读取。同身份短时单次沿用、重新创建目标生成器与继续管理员检查，使重复读取减少且不复制错误上下文客户端。

## 证据与保全

工程根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
startup-handoff-test.log / -junit.xml、startup-handoff-age-test.log / -age-junit.xml；
startup-handoff-core-final-compile.log / -cli-compile.log、startup-handoff-lint.log / -final-lint.log、startup-handoff-format.log；
extract-startup-quota-application.mjs、prepare-startup-handoff-verifier.mjs、observe-source-startup-handoff.mjs、verify-source-startup-handoff.mjs；
source-startup-handoff-{timeout,success}.log、source-startup-handoff-{timeout,success}-result.json / -terminal-output.txt；
verify-startup-handoff-preservation.mjs、source-startup-handoff-preservation.json。开发验证脚本不随产品分发。

保全 passed=true：个人 provider / locale / config/skill-tags.json SHA 保持，ultra-tools.json 仍不存在，全局仍 1.0.0-preview.83，旧 E-294/E-364 失败文件 SHA 与 passed=false 保持。未改个人数据库、工具安装、PATH 或真实凭据，仅隔离临时目录和假凭据；清理 mkdtemp 前核对绝对父目录与专用前缀。

沿用 granted case work/gemini-ultra-agent-20261110，PRIMARY R26/code-audit、同会话 lead/cae/doc，无 Codex 子代理或无关扫描。目标池/workitems/timeline/field-journal 同步；三份正式报告全文 SHA 相同，只显式提交本轮源码/目标池/交接，推隔离分支并 skip ci，不合并 master、不正式 Release。

接续：继续认证取消与迟到状态保护、管理员元数据加载和其余功能收敛；真实复杂 Swarm 的 E-294/E-364 失败边界仍在，完整 Agent 上线和最终平台包未完成，goal active。
