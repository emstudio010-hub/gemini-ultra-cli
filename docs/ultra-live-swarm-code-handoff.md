# Gemini Ultra CLI 真实 Swarm 代码交付交接

日期：2026-11-11。WI-074/E-163。本机preview.42，产品源895dad5235999b0fad4464d2cea21115a1dc1383。本阶段未改产品源码或安装。沿用自有源码case，R26/code-audit、lead/cae/doc；目标仅本次生成的JavaScript仓库，不改用户业务源码、个人配置、数据库或逆向工具。

## 新任务与真实运行

这是全新时长解析器修复，不是旧源码审查或ELF报告。初始parseDuration只有Number.parseInt；SPEC.md给出h/m语法、精确整数分钟、范围0至10080、错误类型等契约。原始verify.mjs只含8正例、12非法字符串、4非字符串断言。修前宿主运行一次，退出1；包括1h30m应为90等实际缺陷。

实际已安装CLI先
`/swarm prepare`、`/swarm budget 28 1 3`、`/swarm workspace on`，三条本地命令0模型请求，再一次
`/swarm resume`。当前配置真实模型deepseek/deepseek-v4.1-flash；凭据与设置只复制进隔离profile，原配置SHA保持。隔离观察约束：low、32768输出上限、64000上下文、maxAttempts1、28次任务调度、3次成员轮次、1次失败额度、32次HTTP外层限制、480秒期限；不是默认值或供应商权益。

协调者仅编排，三个具名原生成员各一轮：scout/researcher只读调查；author/coder修复parse-duration.mjs并写中文DELIVERY.md；verifier/workflow-auditor在作者之后只读独立核对。模型内部不提供shell工具，不运行测试，不安装依赖；只允许两个文件改动，用户SPEC/验收脚本/已暂存+未暂存+未跟踪示例禁止更改。没有Codex子代理、人工补提示、代写、修正轮次或重新开始。

结果347247ms（含本地准备/回写/验收/报告导出）、23真实请求（main12/researcher3/coder5/auditor3）、自然退出0、未超时未触预算。任务内累计20/28调度、3/3成员轮次、0失败，三个waiting成员turns均1；verifier的verifiedRevision=4，与当前revision一致。Swarm
phase=completed，主会话自然给出SWARM_CODE_DELIVERED。

23响应报告554946输入+26510输出=581456Token，不等于账单。非流式含state_snapshot的响应2份，主会话已发生上下文压缩活动；协调者工具交互与完整上下文仍较重，不称为高效。本次不自动重复付费；不能与E-156不同任务直接比较成本改善。

## 隔离、回写与实际功能验收

任务在原生Git工作树执行，原生成仓库包含不同内容的暂存/未暂存USER.md及未跟踪user-notes.txt。成员结束后、回写前，原parse-duration仍为原错误代码且无DELIVERY.md；完整成果在隔离目录内。当前独立审查接受的tree与导出result相同。宿主随后实际执行本地
`/swarm workspace export`、`/swarm workspace apply`，均退出0且不增加模型请求；回写仅两个目标文件，不改变原真实index/HEAD或用户示例字节。

回写后宿主仅运行一次未改动的原verify.mjs，退出0，输出：

```text
DURATION_ACCEPTED: 8 valid, 12 invalid, 4 type cases
```

然后 `/swarm reports ID`
本地导出三成员报告及板，仍无新增模型请求。主会话所说“未回写”是其结束时事实，后续宿主显式回写发生在模型完成之后，两者按顺序区分。原模型报告写明“未执行验收脚本”，未虚构自身运行结果。此次功能验收不等于模型曾调用测试工具。

补丁只含DELIVERY.md和parse-duration.mjs，SHA-256
d837c23e8a9320d03871d80e6afe23d1804ad2c2b893478a69c6257757a57604。完整原生工具记录为read_file21、post_swarm_message3、complete_task3、write_file2、manage_swarm7，无run_shell_command。13条公开板记录含三成员真实身份；无成员重启或额外唤醒。

独立复核对已保存结果、原补丁、代码/契约/用户文件hash和会话调用记录再次核对，没有新增模型请求或执行代码。代码使用锚定正则校验顺序/单位/数值语法，以BigInt分数精确换算，避免0.1h浮点乘法判整误拒；与24项原验收相符。DELIVERY明确未对超长数字串做资源约束；本契约未规定极端长度上限，因此本次通过不能扩大成任意输入资源安全或所有程序正确性证明。

## 保留工件与边界

工程根C:\Users\Administrator\Documents\ChatGPT\gmncliu：

- preview42-live-swarm-duration-result.json、-requests.jsonl、-wire.jsonl、-output.txt、-run.log：真实运行/状态/用量与原回复，脱敏。
- preview42-live-swarm-duration-workspace/：可直接打开的修复模块、原SPEC/verify、DELIVERY及用户示例副本。
- preview42-live-swarm-duration-records/：原生会话/成员/公开板/报告、worktree状态/补丁与隔离成果。
- preview42-live-swarm-duration-independent-review.json、-delivery.md：独立核对及可点击交付链接。
- preview42-live-swarm-duration-scratch.json：原生成临时仓库仍保留，隔离worktree处于applied，凭据文件已删除；保留已应用成果和Git原index/HEAD以便调查，不强制清理或丢弃它们。
- verify-live-swarm42.mjs、observe-live-swarm42.mjs、review-live-swarm42.mjs：单次真实运行/请求界限/已有证据复核脚本，不作为自动付费重跑入口。

```mermaid
flowchart LR
  A[生成有缺陷仓库与原契约] --> B[修前必要断言失败]
  B --> C[prepare与预算及隔离工作树]
  C --> D[scout调查]
  D --> E[author只改两个文件]
  E --> F[verifier独立静态审查]
  F --> G[Swarm自然completed]
  G --> H[宿主显式apply]
  H --> I[原24项断言通过]
  I --> J[本地reports与原证据保留]
```

Evidence→Finding→Path：用户要求真实Swarm与深度coding →
WI-074/E-163真实具名调查/编码/独立审查、工作树与显式回写、功能结果及用户改动保留 → 本次有界生成程序代码交付通过。E-124旧真实Swarm审查失败保留，不将旧任务或其他模型改写为成功。

## 目标池接续

WI-074交付。真实Boost逆向报告与真实Swarm代码修复各有一次有界成功证据，整体goal仍active。真实Teamwork长任务/更多模型、跨平台交互启动、摘要准确性、复杂格式/多函数/动态逆向等尚有边界，不以小程序24项推断完整上线。下一步可依据本次已保留协调请求/压缩及板/成员快照分析重复上下文，减少非必要成本；不为追数字重新付费同样任务，不无止境增加检查。

本阶段只提交目标池/交接到已授权codex隔离分支，不触发无变更的重打包，不合并master、不正式Release。源码/工程/Obsidian交接同步。
