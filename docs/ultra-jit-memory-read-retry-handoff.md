# Gemini Ultra CLI 记忆部分读取失败恢复交接

日期2026-11-14，WI-213 / E-481至482 / F-171。基线35a03e3289643b39bea5a5bb15b2409b6eed2b9d，分支codex/ultra-agent-portable。上一goal turn为progress：记忆刷新事务及JIT取消/队列/关闭隔离源码和Windows证据已推送。整体goal active。源码优先→Windows必要定向验证→功能收敛后统一打包；无打包/重装/升版本/多平台CI/付费重跑，全局preview.83保持。

## Evidence → Finding → Path

F-171：loadJitSubdirectoryMemory在readGeminiMdFiles之前给所有候选文件收集fileIdentities，正文则只返回成功文件。两个GEMINI.md中一个失败另一个成功时，manager会提交成功正文与所有身份；失败文件之后即使恢复可读、inode未变，也被当已加载跳过。若所有文件均失败，manager原本因files空而未提交身份；本次重点是部分失败。

仅生产文件packages/core/src/utils/memoryDiscovery.ts修改：读取后先生成成功files，再按这些files查同一newPathsIdentityMap生成fileIdentities，不再为失败读取预登记身份。content===null才剔除，合法空文本仍按成功处理；未知身份仍不缓存。保留已有文件顺序、同身份去重及读取错误转null行为，无强制全量刷新/重启或文件替换。原始底层IO取消、导入局部错误传播、整批失败策略、Config早期关闭仍不在本轮范围。

## E-481 定向复现与检查

memoryDiscovery.test.ts新增parent/root及leaf两个展开用例：真实临时目录和文件，用readFile adapter仅对命名文件返回EACCES、另一个正常；第一轮仅缓存成功身份，解除错误后以第一轮路径/身份缓存再调用，失败文件正常读入且inode不变。

首尝试spy原生ESM namespace不可配置，2项在夹具安装阶段失败，保全jit-memory-read-retry-before.log/-before-junit.xml，不当产品缺陷证据。测试增加返回实际fs导出副本的模块工厂，仅用例期间spy readFile，finally恢复；原生产源码未改时baseline两项在失败身份仍存在的断言实际失败，退出1，日志/XML保全。随后改生产源码，筛选loadJitSubdirectoryMemory：新增2+既有11=13通过，19未选中；274ms测试/1.91s总耗时，退出0，非性能基准。未全量/冒烟，也未重跑上轮43项。

core严格tsc、双文件eslint --max-warnings0、Prettier及git diff --check均退出0。无新依赖/CLI重编。只改该loader与对应测试，manager和五工具取消逻辑未动。

## E-482 Windows实际文件工具

verify-source-jit-memory-read-retry.mjs独立home/workspace，实际编译Config.initialize与ReadFileTool，初始化后再创建两套嵌套parent/src规则文件。保留真实发现、stat/身份去重、读取/解析和manager缓存；fs adapter只对选定命名文件返回EACCES，不替换manager/工具业务方法，不修改物理ACL。

父规则失败和叶规则失败分别验证：第一次文件正文与成功规则保留、失败路径不标缓存；解除adapter错误后同一inode文件被下一次文件操作加载，成功规则不重复；第三次操作两规则均去重且正文正常。每组实际失败文件共读2次、成功文件只读1次。13条件true/7132ms/退出0/0网络模型。无需/memory refresh、Config重建或重写规则文件。未模拟真实Windows文件锁/网络共享故障、终端渲染或多平台行为。

finally恢复fs/fetch、dispose自有Config/DrillStore，仅删除realpath验证在真实temp下且ultra-jit-read-retry前缀的自有根。个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83、E-294/E-364/E-466原失败SHA及passed=false、临时凭据删除状态全部保全true。未改个人数据库/PATH/工具安装，旧被拒清理目录不动。

## 工件与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：jit-memory-read-retry-before.log/-before-junit.xml（ESM spy夹具失败）、-baseline.log/-baseline-junit.xml（原版实际缺陷）、-tests.log/-junit.xml、-core-compile.log、-lint.log、-test-format.log/-format.log/-format-check.log；verify-source-jit-memory-read-retry.mjs、source-jit-memory-read-retry.log/-result.json；verify-jit-memory-read-retry-preservation.mjs、source-jit-memory-read-retry-preservation.json。

沿用granted case与PRIMARY R26 code-audit，lead/cae/doc同会话，无子代理/外部扫描。目标池/case workitems/timeline/field-journal及E-481-482更新，Obsidian/源码docs/工程报告同全文SHA；显式stage、skip ci推codex隔离分支，不合并master或Release。下一步继续Config.initialize早期dispose之后的迟到初始化和全需求剩余质量核对。真实复杂多Agent质量F-164和最终分发仍未验收，goal继续active。
