# Gemini Ultra CLI 真实Swarm交付与诊断交接

日期：2026-11-11。本机已安装 **preview.32**，产品源提交
`72ef7ad310ffe5efa6af3c7bea731f6d067b357a`。本次真实任务未交付；后续离线修复结果分别记录。

## E-124 真实任务未交付

实际已安装CLI，在Windows
ConPTY通过/swarm创建全新任务；真实当前配置服务Ess、模型deepseek/deepseek-v4.1-flash。只审查当前公开swarm.ts、swarmTools.ts两份副本，author负责带连续原文证据的中文报告/JSON，verifier独立复核。无外部目标、动态测试或旧八文件任务重跑。

隔离设置：low、maxOutputTokens=8192、contextWindow=64000、maxAttempts=1；24请求/10分钟任务预算，不改真实配置。这些是验证约束，不是产品默认值。

未通过：229400ms，15次真实请求（9主/6coder），两次明确finish_reason=length、各8192输出Token且正文0字符。作者进入第3轮，超出约定“最多一轮修正”；为避免继续消耗，核对ownerPid对应本隔离CLI后主动停止进程。原active、author
working/turns=3保留，无报告/verifier/最终完成。不是CLI自行崩溃，不能称为自主成功；额外轮次是协调者再次@提及，不是重跑整个验证。

14份观察到的响应报告用量276458Token（输入257150、输出19308）；第15个请求中断、用量未完整，不等于账单。clone观察器incompleteRead在正常清理时也会出现，不作上游截断证据；两次length来自服务明确的输出上限。

源码副本hash和原供应商配置hash未变；隔离凭据/目录已清理。两份源码快照从原Git提交重建后与实际记录hash逐一匹配，脱敏会话/板/请求保留。此失败不由后续fixture成功覆盖，也不归因为生产默认8192。自然语言修正轮数未被模型遵守仍是未验收边界。

## E-125 / F-033 错误交接丢失

LocalSubagentInvocation/LocalSessionInvocation捕获错误时，为保持丰富UI返回，不填ToolResult.error或progress.result，具体信息在llmContent与recentActivity。Swarm和Boost/Teamwork新适配器只读result/error，成员只剩“No
structured member result.”，协调者未得到输出上限原因。

两个系统边界用例修前均失败。共同结果提取器现保留llmContent/错误活动和终止原因，仍严格以COMPLETED+GOAL且无error判断成功；只解包单字段response，审查员JSON保持原状。提示协调者先诊断失败并遵守用户修正/请求预算；提示不等于原生强制任意自然语言预算。

修后两条故障用例及结构化审查成功门控共3项通过；受影响严格lint/core-cli类型构建通过。首次lint禁止typeof直接访问对象属性，改为类型守卫读取局部值；不放宽类型检查。仅必要检查，不跑全量/冒烟，不再调用真实模型。

Evidence→Finding→Path：E-124真实length/无信息暂停和E-125修前复现→F-033本地错误返回契约被新适配器漏读→共享提取器保留具体诊断，完成门控不放宽。

## 证据与接续

工程目录：preview31-live-swarm-review-result.json、-observer-stop.json、-requests.jsonl、-wire.jsonl、-output.txt、-records/、-sources/；workflow-diagnostic-before.log、-after.log、-final.log。

preview.32通过现有三平台分发后，用本地HTTP输出上限响应触发实际已安装执行器，确认错误进入成员/板/协调者且不标完成。不自动再次付费审查；完整真实供应商自主交付、引用准确性、复杂逆向与隔离工作树仍待做。goal
active，仅codex分支，不合并master或正式Release。

## E-126 三平台分发

[运行42884758726](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42884758726)三平台completed/success，源72ef7ad310ffe5efa6af3c7bea731f6d067b357a。三个工件版本/源提交/校验和、安装记录、六rg
hash/Unix权限与每平台20请求的现有native Swarm正常链均核对通过。

| 平台        | 包SHA-256                                                        |
| ----------- | ---------------------------------------------------------------- |
| Windows x64 | aea674633d78f113219825219058caafff1c85cc24a64612a00ad5c1715df8b5 |
| Linux x64   | 58e480f1cb805cd9deef9065587a345dd2f4cb60b3d037d5cae03a4ccd65d3d8 |
| macOS arm64 | 93f5fa5f15540d7337273f90c93e4d2d7ad67e1e0b07c8342a7b5b77832cb0d7 |

## E-127 安装及实际错误链

本机已有缓存offline安装6秒，双命令preview.32，424包内文件与Windows
CI工件逐一一致，入口7904d27c06729ab403b05f0d1b53f1be222dc39a9432f47464cbad0454f02a02。

仅额外运行一次已安装CLI的diagnostic离线场景：4个loopback请求/1781ms/退出0，通过原生管理器、真实本地执行器、模拟服务finish_reason=length触发实际异常。成员author维持paused，具体结果为：

```
Subagent 'coder' failed. Error: OpenAI output token limit reached; response is incomplete.
```

原始具体诊断进入成员记录、追加板和协调者工具响应；Swarm仍active，不误写completed。该脚本只发起一次成员轮次，不证明真实模型将来必然遵守重试次数。没有进一步真实供应商调用；E-124未交付结论保持不变。

补充证据：workflow-diagnostic-preview32-source-result.json、workflow-diagnostic-final-junit.xml、github-preview32-run.json、github-preview32-artifacts-result.json、global-install-github-preview32-full-result.json、installed-preview32-swarm-diagnostic.json及-output.txt。

源码、工程报告与Obsidian交接已同步。后续先处理可执行的修正/请求预算和模型输出约束，使失败能够有界收尾，再安排有明确收益的真实工作验收；不重复原样付费试跑。完整自主交付/引用可靠性/复杂逆向仍未完成，整体goal
active。
