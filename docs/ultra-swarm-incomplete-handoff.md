# Gemini Ultra CLI Swarm 未完成续接恢复交接

日期：2026-11-12。WI-115/E-282/F-079。goal
active，前置preview.79；本阶段维护Swarm长任务成果与恢复，0付费模型，不改个人配置、数据库或逆向工具。

## 复现与修复

Swarm此前仅在抛异常时保留旧成果；WorkflowAgentResult正常返回completed:false时仍无条件覆盖result/fullResult/modelsUsed。已有长报告后继续追问，短的未完成输出或较长部分输出均会替代原报告；两项新增定向用例在旧源码实际失败。

现在有既存结果的未完成返回保留原result/fullResult/modelsUsed，成员仍paused且累计失败轮数正常增加。最近错误注明未完成，并保存这次部分输出；错误加正文超过12000字符时使用既有SHA全文档案，错误附独立路径，归档沿用8MiB限制，超限拒绝而不覆盖原结果。首次未完成没有旧成果时仍保存部分结果。有效重试收到新结果后才更新成果并清除最近错误，旧部分档案不删除。

这不把模型自报completed:true升级为真实完成；Swarm仍须独立验证且禁止paused成员完成。取消与归档失败语义保持，旧版本已丢失文本不能恢复。

6项相关核心用例通过，包含新增短/长未完成续接、现有抛异常/超大输出/唤醒上限路径；strict
core
typecheck与相关eslint退出0。新随包检查使用两个依次退出的独立进程：第一进程生成已接收报告、未完成续接及独立部分档案，第二进程明确resume并核对原模型/报告/累计预算后重试与独立验证；执行器受控、0模型/网络。不会用此fixture证明真实供应商或长时间压力验收。

工程证据：swarm-incomplete-before-junit.xml/-before.log、swarm-incomplete-junit.xml/-log、swarm-incomplete-types.log、swarm-incomplete-lint.log、swarm-incomplete-script-lint.log。新脚本首lint因全局AbortSignal引用失败，改用globalThis后复核；首次本地包检查误将详情面板的1200字符错误预览与完整错误比较，按既有预览契约修正观察器，原失败保留，产品未因此改变。候选preview.80待swarm-result-recovery范围三平台分发与本机安装；其他链跳过，不全量/冒烟，不重跑既有付费任务。不合并master、不正式Release。
