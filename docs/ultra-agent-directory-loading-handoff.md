# Gemini Ultra CLI 自定义 Agent 目录限时加载交接

日期2026-11-14。WI-209 / E-473至474 / F-167。基线c050b4a0809e4e9a6b116d61f7ebcfd697166fe4，分支codex/ultra-agent-portable。上一goal turn为progress（访谈连续性源码和跨进程证据）。整体goal active，源码优先→Windows必要定向验证→功能收敛后统一打包；不打包、重装、升版本、多平台CI或付费任务重跑，全局preview.83保持。

## 缺陷与源码

AgentRegistry.initialize在Config启动必经路径等待loadAgentsFromDirectory。原目录readdir无时限，每个自定义Agent.md又顺序readFile；任一悬置读取可无限阻塞启动，多个正常慢文件也串行累计。已有远程card/技能限时不覆盖本地Agent目录。

仅agentLoader.ts修改生产逻辑：每次目录调用独立AbortController与10秒时限，可选调用方signal；内部复用withAbortSignal，目录readdir可停止等待，文件readFile接收原生signal；解析后再检查取消。文件读取经既有mapWithConcurrency限制8并发，各文件先收集局部结果，最后按原目录顺序归并（包括单文件多个remote定义顺序和错误顺序），不按完成顺序改变优先级。

目录超时返回agents=[]与一条AgentLoadError，中文/英文按现有I18n，明确跳过整个当前目录并提示/agents reload。即使一部分文件先完成，也不部分发布该目录；其他目录与内置Agent按原Registry流程继续。显式调用方取消抛原reason，不伪装成普通文件错误。timer finally清除；超时或取消后的迟到readdir/readFile不能触发新读取或改已返回结果。

本轮不改AgentRegistry重载/信任/acknowledgement/策略/远程注册逻辑；Registry既有error反馈会展示新诊断。每目录10秒，不是完整AgentRegistry或整个Config初始化10秒：项目与用户目录可各耗一次上限，acknowledgement、远程注册、内存刷新等步骤仍按各自实现。readFile信号能中止Node可取消部分，不能保证撤销任意底层不可取消的文件系统系统调用；这里只保证结束等待与拒绝迟到发布。同步YAML解析占用事件循环时计时器也不能抢占，未新增文件大小/解析CPU上限。

## E-473 定向检查

新增agentLoaderCancellation.test.ts 7项：目录挂起中英文超时诊断/时钟清理2项，迟到目录不启动文件、迟到文件不改变跳过结果2项，调用方目录/文件阶段取消及信号/时钟2项，12文件最多8并发/乱序完成仍目录顺序/单文件错误1项。与既有agentLoader59项共66项通过，退出0；首次lint报新增测试one-var和未await链式expect3处，修测试写法后最终lint退出0，再运行受改7项通过。不重复既有59项。

core严格tsc初次/最终退出0，双TS最终eslint --max-warnings0、最终Prettier、git diff --check退出0。无全量/冒烟、CLI重编、新依赖。原版无限等待基于实际可达的无界await源码确认，本轮未单独运行旧版卡住基准，不虚构修前超时实测。

## E-474 Windows实际初始化与重载

verify-source-agent-directory.mjs独立home/profile与实际Config.initialize/AgentRegistry。用户目录两真实Agent文件，开发fs adapter只hold命名slow.md的readFile，不理会signal，用于模拟不可取消读取；没有修改业务模块方法或伪造注册结果。等待实际10秒时限后，Config.isInitialized=true，中文超时与/agents reload反馈出现，researcher/coder/workflow-auditor/redteam-analyst内置定义保持，整个超时目录无部分发布（ready和slow都未加入）。

返回后手动release旧slow读取，再一个事件循环检查Registry名称列表逐字不变；恢复原生fs后显式调用真实registry.reload（/agents reload使用的入口），两个自定义Agent均加载且无错误。不是实际终端输入命令证据。

接着hold相同目录readdir，通过公开loader可选signal显式取消，原reason在目录未返回时即交付；release迟到目录后没有异常。最后24个受控乱序文件读取，真实编译loader输出24个按目录顺序Agent、peak8、无错误。10条件全true，28024ms/退出0、0网络模型。耗时包括模块加载及真实10秒等待，不是改善幅度或普通启动性能基准。没有真实网络盘挂死、UI渲染/并发多个Registry重载或跨平台验收。

finally恢复fs adapter/全局fetch、解除反馈listener、dispose Config与DrillStore、清理仅自有前缀临时根。个人provider/locale/config skill-tags精确SHA、ultra-tools不存在、全局83、旧E-294/E-364/E-466三次失败SHA和passed=false、E-466临时凭据删除状态全部保全true。

## 证据与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：agent-directory-tests.log/-junit.xml（66项）、-final-tests.log/-final-junit.xml（7项）、-core-compile.log/-final-core-compile.log、-lint.log/-final-lint.log、-format.log/-format-check.log/-final-format-write.log/-final-format-check.log；verify-source-agent-directory.mjs、source-agent-directory.log/-result.json；verify-agent-directory-preservation.mjs、source-agent-directory-preservation.json。

沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描；未改个人数据库、工具安装或PATH，旧被拒清理目录不动。目标池/case四项及证据更新，三份交接同SHA；显式stage、skip ci推隔离分支，不合并master/Release。其他初始化阶段等待与真实复杂模型质量F-164、最终分发仍未验收，goal active。
