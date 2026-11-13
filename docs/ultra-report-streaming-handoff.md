# Gemini Ultra CLI 完整报告有界内存导出交接

日期：2026-11-13。WI-189 / E-431至432 / F-146。源码基线07511dc242f5fb5eddcbfcf48669c99ff4ca21e5，分支codex/ultra-agent-portable。上一阶段为源码/验证/提交进展，整体goal active。继续源码→Windows必要定向验证→最终统一打包；无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 源码性能缺口与修复

上一轮已保存跨100条历史，但完整导出仍使用readWorkflowReports构造全部历史元数据数组，再map读取每一份完整长正文，publish开始写出前所有正文字符串同时留存。Swarm成员长结果导出也先map聚合正文。长任务导出会随正文总量占用大量JS堆；这不是模型输出或启动认证超时问题，不声称本轮已证明所有卡顿根因。

agentReports.ts现在接受Iterable<Entry>，每次生成一份正文、验证既有归档、计算SHA/字节、立即writeUnchanged，再保留轻量清单项；完整正文不加入累计数组。Workflow与Swarm都改为generator，原顺序/标签/状态/locale/哈希/文件名保持。workflowReportHistory.ts的历史读取改为逐批yield，再yield最近报告，不同时拼接所有历史批次元数据。最终审核原有逐批校验保持，演练台详情/轮询没有扩大读取范围，无新增依赖。

只有所有正文成功写出后，才写snapshot/board/manifest/index并返回完整导出结果。初次导出若中间归档损坏，已校验写出的前部报告会保留，但不发布新的manifest/index，不返回伪完整成功；原任务、被改归档与已有成功导出不覆盖、不回写。不声称多文件磁盘事务或所有I/O失败零残留，也没有强删部分输出。

每次仍需读取一份完整正文做既有8MiB上限内的哈希校验，并保留任务快照与轻量清单/索引。不是零内存、异步导出、可取消流或无限数据集；本轮未改变同步导出的事件循环占用方式，只减少正文总量留存。大规模文件数量及索引本身仍有成本。

## E-431 必要源码验证

agentReports.test.ts新增Workflow/Swarm两种“后续归档损坏”场景：第一份完整Unicode报告已落盘，第二份未写出，manifest/index不存在，源state字节与外部改动归档保持。既有同快照重复导出、用户改动快照拒绝、中英文/空访谈/取消/状态保持仍通过。

与workflowReportHistory.test.ts跨100/205排序、长文、历史损坏及最终审核阻断合计10不同相关检查通过。没有伪造旧行为输出错误：旧导出正文原本也可正确完成，主要缺陷为内存总量留存，旧/新真实对照见E-432。core/CLI严格tsc、3个修改文件eslint --max-warnings 0、prettier --check及git diff --check均退出0，无产品/夹具失败重跑。未跑全量/冒烟、未调用模型。

## E-432 Windows真实编译导出器内存对照

Node v24.19.0，独立profile和临时根。开始修改前已从07511dc对应编译目录保存agentReports与workflowReportHistory JS，旧对照仅调整模块导入路径到当前依赖/保存的旧history reader，没有改其算法。新的导出器直接用本轮编译源码。每个在独立Windows进程运行，旧/新各一遍。

同一任务120个保存报告夹具跨1批100+最近20，正文每份512KiB（共62,917,320字节，约60MiB），各份文本相同以隔离正文存储和导出分配；不是120次模型执行。两份源fixture精确复制，分别导出。每个进程先导入/GC建立heap基线，在第1份及每10份报告实际writeFileSync边界强制GC采样（各13样本），不替换真实文件读写或归档校验；完成后逐文件验证正文哈希/字节、全部120清单项及源state字节。

观测：
- 旧baselineHeap=8,367,720，采样peakHeap=71,948,824，留存增量63,581,104字节（60.64MiB）。
- 新baselineHeap=7,696,000，采样peakHeap=8,741,664，留存增量1,045,664字节（1.00MiB），小于旧四分之一。
- 两者全部120报告SHA与bytes精确，输出snapshotSHA相同、state原字节保持、0网络；5汇总条件通过，整体2623ms/验证器退出0，临时fixture finally清理成功。导出计时689/635ms包含GC采样，不作为稳定速度改善结论。

这是受控单次、强制GC后“写出边界留存JS堆”观测，不是进程峰值RSS/未采样瞬时分配/跨机器基准，也不证明生产启动速度或所有数据形态。没有堆预算调大、减少正文、改变导出数量或跳过归档校验来通过指标。模型/外部/付费请求均0，无ConPTY或最终包验收。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- report-streaming-test.log / -junit.xml（10通过）；report-streaming-core-compile.log / -cli-compile.log / -lint.log / -format.log / -format-check.log。
- agentReports-before-streaming.js、workflowReportHistory-before-streaming.js（修改前编译快照）；measure-report-export-memory.mjs、verify-source-report-streaming.mjs。
- source-report-streaming.log / -result.json；verify-report-streaming-preservation.mjs / source-report-streaming-preservation.json。

F-146 -> agentReports.map完整正文与workflowReportHistory.flatMap全部批次元数据造成导出前聚集。逐份/逐批迭代并保持完整输出修复该性能路径，不把模型任务品质与导出正确性混为一谈。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持，ultra-tools.json不存在，全局preview.83；E-294/E-364旧真实复杂任务SHA及passed=false保持，不覆盖、不付费重跑。不改个人数据库、凭据、工具安装或PATH。先前被拒清理的ultra-cockpit-review-scope-S0wWvh不重试删除。

沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。目标池与case四项更新，源码/工程/Obsidian三份全文SHA一致；显式stage本轮文件、skip ci提交推codex隔离分支，不合并master/Release。

继续Agent实际交付、长任务完整性和Windows源码收敛；复杂真实任务质量、更多模型、最后Windows/macOS/Linux统一包仍待，整体goal active。
