# Gemini Ultra CLI 真实协作失败与地址对照交接

日期：2026-11-12。WI-119/E-294及WI-120/E-295。goal active，前置preview.82。

## 真实任务及失败边界

一次新的当前供应商原生Swarm对上一阶段三函数原生工件做综合交付，不提供宿主已解结论。2个researcher分别分析调用流和原型，协调者写MULTIFUNCTION_REVIEW.md/evidence.json，再由独立workflow-auditor核对。已安装82，24调度/1失败/3唤醒上限，观察器28请求/420秒，实际21请求/206965ms、CLI退出1、Swarm
blocked且failedTurns=1；三个成员各一轮，没有超时、重试或重新反编译。输入和个人供应商字节保持，临时凭据已删除。

独立审核正确拒绝：报告把CALL的4198537/4198468误写成0x401091/0x401064，实际应为0x401089/0x401044；算术和部分指令位置也有同类换算错误。7条连续单行引用精确、完整样本SHA正确，报告识别原型丢失且标明静态推导，仍因地址要求失败。不是整体完成证据，原报告/判决/日志全部保留，不手改结果、不自动重跑付费任务。宿主另保留语义边界：不能从pop/ret不显式读取eax推出返回值被丢弃，写edi会清零rdi高位；这些文字也不能直接当已验收分析。

## 产品改进

原生data已保存精确整数，实际失败发生在模型十六进制换算。新增binary_analyze.addressFormats，按itemIndex关联返回data行，hex对象由BigInt计算常见顶层地址字段addr/offset/from/to/jump/fail/ptr/fcn_addr/minaddr/maxaddr。保留原data，只有非负安全整数或精确十进制/0x字符串且不超过64位才格式化；无效值、负sentinel和数量字段不伪装为地址，未返回行不出现在表里。不递归推测嵌套引用含义，不声称能保证模型报告正确。

工具描述和随包local-reverse指引要求直接复制这些形式，并区分CALL位点from/addr与包含函数入口fcn_addr。2项新增接口检查在旧代码失败，修改后连同3项受影响高64位用例共5项通过；strict
core types和相关lint通过。不跑全量/冒烟或重复真实任务。

候选preview.83待实际包三视图检查、既有自建样本必要地址核对、native-address-precision范围三平台分发及安装。该范围沿用Node22.19最低运行时，改为仅执行本次地址对照检查，不重跑旧逆向/协作链。工程证据：preview82-live-multifunction-swarm-result.json/-output.txt/-requests.jsonl/-wire.jsonl、-records/-workspace、address-formats-before-junit.xml/-before.log、address-formats-junit.xml/-log、address-formats-types.log、address-formats-lint.log、address-formats-script-lint.log。没有个人配置、DB或逆向工具改动。不合并master、不正式Release。
