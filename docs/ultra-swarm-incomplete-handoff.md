# Gemini Ultra CLI Swarm 未完成续接恢复交接

日期：2026-11-12。WI-115/E-282/F-079。goal
active，preview.80已安装；本阶段维护Swarm长任务成果与恢复，0付费模型，不改个人配置、数据库或逆向工具。

## 复现与修复

Swarm此前仅在抛异常时保留旧成果；WorkflowAgentResult正常返回completed:false时仍无条件覆盖result/fullResult/modelsUsed。已有长报告后继续追问，短的未完成输出或较长部分输出均会替代原报告；两项新增定向用例在旧源码实际失败。

现在有既存结果的未完成返回保留原result/fullResult/modelsUsed，成员仍paused且累计失败轮数正常增加。最近错误注明未完成，并保存这次部分输出；错误加正文超过12000字符时使用既有SHA全文档案，错误附独立路径，归档沿用8MiB限制，超限拒绝而不覆盖原结果。首次未完成没有旧成果时仍保存部分结果。有效重试收到新结果后才更新成果并清除最近错误，旧部分档案不删除。

这不把模型自报completed:true升级为真实完成；Swarm仍须独立验证且禁止paused成员完成。取消与归档失败语义保持，旧版本已丢失文本不能恢复。

留言补查发现未完成返回仍在最后一条公开留言复述旧成果；两项新增留言断言实际失败。现在有最近错误时公开留言记录该错误及部分输出路径，保持旧报告由result/fullResult引用。首轮三平台检查中macOS/Linux已通过，但最终源码尚需此留言修复；取消仍在运行的Windows构建，首run43226977865保留，不当作最终验收。

6项相关核心用例通过，包含新增短/长未完成续接、现有抛异常/超大输出/唤醒上限路径；strict
core
typecheck与相关eslint退出0。新随包检查使用两个依次退出的独立进程：第一进程生成已接收报告、未完成续接及独立部分档案，第二进程明确resume并核对原模型/报告/累计预算后重试与独立验证；执行器受控、0模型/网络。不会用此fixture证明真实供应商或长时间压力验收。

工程证据：swarm-incomplete-before-junit.xml/-before.log、swarm-incomplete-junit.xml/-log、swarm-incomplete-types.log、swarm-incomplete-lint.log、swarm-incomplete-script-lint.log。新脚本首lint因全局AbortSignal引用失败，改用globalThis后复核；首次本地包检查误将详情面板的1200字符错误预览与完整错误比较，按既有预览契约修正观察器，原失败保留，产品未因此改变。preview.80已完成swarm-result-recovery范围三平台分发与本机安装；其他链跳过，不全量/冒烟，不重跑既有付费任务。不合并master、不正式Release。

## 三平台与本机交付

E-283：产品源f4b476b1d4cf1d7602203fb4e063221da0fc85c4/run43227654191三平台swarm-result-recovery范围completed/success，minimum-node、native-address-recheck和未变更业务链skipped。独立核对三包80/源chunk、包与入口SHA、六rg身份权限及安装4基础工具。每平台实际安装包Config/SwarmEngine在两个自然退出进程中完成：已接收长报告后completed:false的长部分输出单独归档，原报告/模型记录保持；详情、模型上下文及导出原正文保持；暂停不能完成，原所有者进程退出后明确恢复，同ID/累计预算/成员记录保持，再明确重试并由受控独立验证成员完成。0模型/外部网络，无付费或旧协作任务重跑。初本地包观察器1200字符详情预览比较失败已按契约修正，原日志保留；补修留言前的本地包同链随后通过，最终源码以本run为准；留言补修后仅重跑2项直接受影响用例并通过，原2项留言失败保留。首run43226977865为cancelled，不当作最终三平台验收。本地独立归档核对器首将JSONL原文与带换行错误正文直接比较，修为逐行JSON.parse后比较，原失败日志保留；随包脚本已使用解析后留言，本次无产品变更或CI重跑。

E-284：offline已有缓存安装7346ms/退出0，双命令preview.80、425文件匹配Windows
CI归档。包SHA256
bf82c960b1c09a3f4a2ca8d0ced71bb89d451602414ccc575b271a534461ecb5，入口SHA256
7b5a6fb4fae24a0e816a2c8d72aa79b6bcd897012b43183683478896422861d6。个人locale/provider哈希保持79末值，ultra-tools.json仍未创建，旧包保留。WI-115/F-079未完成续接成果保持及跨进程恢复交付；受控执行器/独立验证不代表真实供应商语义质量或长时间稳定性，不重跑已有E-260付费任务。无全量/冒烟或未变更链重复；goal
active，不合并master或正式Release。

最终证据：github-preview80-artifacts-first-verification.log、swarm-incomplete-board-before-junit.xml/-before.log、swarm-incomplete-board-junit.xml/-log、github-preview80-first-run.json、github-preview80-run.json、github-preview80-artifacts-result.json、github-run-43227654191/gemini-ultra-cli-\*/swarm-incomplete-verification.json、swarm-incomplete-package.json/-log、swarm-incomplete-package-first.log、global-preview80-install-result.json、global-install-github-preview80-full-result.json、swarm-incomplete-personal-config.json。源码报告/工程报告/Obsidian全文同步。

持续目标仍开启。后续依据实际任务或可复现缺陷推进更长协作与跨机逆向，不将此fixture当作全面上线证明。
