# Gemini Ultra CLI 真实协作失败与地址对照交接

日期：2026-11-12。WI-119/E-294及WI-120/E-295。goal active，preview.83已安装。

## 真实任务及失败边界

一次新的当前供应商原生Swarm对上一阶段三函数原生工件做综合交付，不提供宿主已解结论。2个researcher分别分析调用流和原型，协调者写MULTIFUNCTION_REVIEW.md/evidence.json，再由独立workflow-auditor核对。已安装82，24调度/1失败/3唤醒上限，观察器28请求/420秒，实际21请求/206965ms、CLI退出1、Swarm
blocked且failedTurns=1；三个成员各一轮，没有超时、重试或重新反编译。输入和个人供应商字节保持，临时凭据已删除。

独立审核正确拒绝：报告把CALL的4198537/4198468误写成0x401091/0x401064，实际应为0x401089/0x401044；算术和部分指令位置也有同类换算错误。7条连续单行引用精确、完整样本SHA正确，报告识别原型丢失且标明静态推导，仍因地址要求失败。不是整体完成证据，原报告/判决/日志全部保留，不手改结果、不自动重跑付费任务。宿主另保留语义边界：不能从pop/ret不显式读取eax推出返回值被丢弃，写edi会清零rdi高位；这些文字也不能直接当已验收分析。

## 产品改进

原生data已保存精确整数，实际失败发生在模型十六进制换算。新增binary_analyze.addressFormats，按itemIndex关联返回data行，hex对象由BigInt计算常见顶层地址字段addr/offset/from/to/jump/fail/ptr/fcn_addr/minaddr/maxaddr。保留原data，只有非负安全整数或精确十进制/0x字符串且不超过64位才格式化；无效值、负sentinel和数量字段不伪装为地址，未返回行不出现在表里。不递归推测嵌套引用含义，不声称能保证模型报告正确。

工具描述和随包local-reverse指引要求直接复制这些形式，并区分CALL位点from/addr与包含函数入口fcn_addr。2项新增接口检查在旧代码失败，修改后连同3项受影响高64位用例共5项通过；strict
core types和相关lint通过。不跑全量/冒烟或重复真实任务。

preview.83已完成实际包三视图检查、既有自建样本必要地址核对、native-address-precision范围三平台分发及安装。该范围沿用Node22.19最低运行时，改为仅执行本次地址对照检查，不重跑旧逆向/协作链。工程证据：preview82-live-multifunction-swarm-result.json/-output.txt/-requests.jsonl/-wire.jsonl、-records/-workspace、address-formats-before-junit.xml/-before.log、address-formats-junit.xml/-log、address-formats-types.log、address-formats-lint.log、address-formats-script-lint.log。没有个人配置、DB或逆向工具改动。不合并master、不正式Release。

## 三平台与本机交付

E-296：产品源734806fd8c48a0cfa0260920cc955fed9ef8b0eb/run43236115019三平台地址对照定向通过：原run43236115019整体failure，Linux/macOS检查success，Windows首次因检查器的realpathSync路径别名断言失败。改用native规范路径后，Windows在补run43237449798对原tgz完成success，包SHA相同/未重建，Node22.19.0；补run只执行Windows重验，package/minimum-node跳过。独立工作流首次因未在默认分支注册返回404（无运行），随后使用已有工作流，原失败/接口边界保留。补验报告首次下载遇存储端503，之后同一工件读取成功，没有新执行。原未变更业务链skipped。独立核对三包83/源chunk、包/入口SHA、六rg身份权限及安装4基础工具。每平台实际安装包BinaryAnalyzeTool接受受控原生JSON，三视图原data逐字段保持，真实失败报告CALL数值4198537/4198468分别给出0x401089/0x401044，高64位字符串给出精确hex；只映射返回行，不把size/负sentinel变成地址，原hex转后续参数命令保持。0模型/网络。另本机实际r2在既有三函数样本上只做三个受影响视图，CALL位点/目标与对照逐项相符；没有重跑Ghidra或付费任务。

E-297：offline已有缓存安装7179ms/退出0，双命令preview.83、425文件匹配Windows
CI归档。包SHA256
a3c39334b1b82ea39c2f9b83c7f0332ae6d3326043a9eb82a7df5519d26c8700，入口SHA256
2ffaeaa755ce29c5a97da4b4150cdab08ad28783e4273c80dd5fdc169b5d5692。个人locale/provider哈希保持82末值，ultra-tools.json仍未创建，原样本SHA保持，旧包保留。WI-120地址对照交付；这只减少转换负担，不保证模型复用或报告正确，E-294真实任务仍失败且不重跑。WI-119请求用量日志合计prompt
423533/completion 25792
tokens，属服务返回累计用量、不推测费用。没有全量/冒烟或其他未变更链重复；goal
active，不合并master或正式Release。

最终证据：github-preview83-failed.log、github-preview83-windows-recheck-run.json、github-address-recheck-43237449798/gemini-ultra-address-recheck-windows-latest/address-formats-recheck-report.json、preview82-live-multifunction-swarm-independent-review.json/-log、github-preview83-run.json、github-preview83-artifacts-result.json、github-run-43236115019/gemini-ultra-cli-\*/analysis-address-formats-verification.json、analysis-address-formats-package.json/-log、analysis-address-formats-native.json/-log、global-preview83-install-result.json、global-install-github-preview83-full-result.json、address-formats-personal-config.json。源码报告/工程报告/Obsidian全文同步。

下一步已定位实际失败交互缺口：E-294预算阻断经Turn.run输出Error when talking to
Gemini
API，最终JSON仅通用Error/stopReason，没有审核摘要和已存报告路径。后续应以本地受阻交接清楚显示判决/保留工件，不增加预算或额外模型调用；须先定向复现，不先声称修复。不将审核拒绝当全任务成功；无需重复这个付费任务来证明地址表生效。更长任务、更多模型、动态/复杂逆向及整体上线仍未完成。
