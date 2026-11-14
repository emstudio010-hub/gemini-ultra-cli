# Gemini Ultra CLI 工具发现取消、时限与结果保全交接

日期2026-11-14，WI-215 / E-485至486 / F-173。基线ba9a650613b1ca06b58c34935b3c7c32e806c206，分支codex/ultra-agent-portable。上一goal turn为progress（初始化关闭主流程/聊天隔离已推送），整体goal active。源码→Windows必要定向验证→收敛后统一打包；不打包/重装/升版/多平台CI/付费重跑，全局preview.83保持。

## Finding → Path

ToolRegistry.discoverAllTools原先清空发现工具后，无时限等待沙箱prepare与spawn命令；没有调用方signal。Config关闭后即便主层拒绝，底层仍可启动命令、输出并注册工具；失败刷新也丢旧目录。

现在discoverAllTools可接signal，每请求独立controller/10秒期限，新请求中止旧请求；prepare与进程等待用withAbortSignal，Config.createToolRegistry传生命周期signal。命令输出先解析/构建局部DiscoveredTool数组，最后检查取消后同步替换，失败/超时/取消保留旧目录。无命令的成功刷新仍按原语义清空发现目录。超时给中英ToolDiscoveryTimeoutError，首次启动仍失败，不静默跳过配置命令。

prepare返回时立即接管cleanup所有权，统一幂等cleanup；准备尚未完成时取消及prepare已resolve/消费者尚未接手时取消都能释放一次，无迟到spawn。执行前再检查signal。命令用隐藏窗口/管道stdio，Unix非Bun独立进程组；取消/超限复用killProcessGroup，Windows taskkill /f /t，Unix沿既有helper；等待方立即拒绝，底层finally等终止helper再cleanup。取消后不积累输出、close不发正常失败反馈、不解析注册迟到声明。既有stdout/stderr各10MiB限制保持。

边界：同步JSON解析不可被timer抢占；底层prepare不可取消但迟到会cleanup。10秒包含prepare和执行，是本步而非整启动上限。进程树验证仅Windows自建普通父子进程，不证明逃逸/重归属后代或Unix/Bun。既有removeDiscoveredTools仍同时移除DiscoveredTool与DiscoveredMCPTool；成功命令刷新可能清除当前MCP目录，这点本轮未改、需下阶段与MCP生命周期一起处理，不声明MCP刷新保全已验收。MCP/扩展/Hook/认证与活动生成的内部退出仍待。

## E-485 原版与定向检查

先加入6项原版实际失败：预取消、pending prepare取消及迟到cleanup、进程取消/迟到声明、被新发现取代、失败目录保留、悬置命令10秒界限。baseline日志/XML保全，无夹具错误/未处理拒绝。修后6+既有3项通过；复核补prepare resolve与取消微任务之间的所有权窗口，新增第7项并修cleanup覆盖范围。最终新7+既有3=10通过/29未选中，191ms测试/32.95s总耗时（非启动指标）。没有全量/冒烟或上轮14项重跑。

最终core严格tsc、3文件eslint --max-warnings0、Prettier与git diff --check均退出0。工具发现参数parametersJsonSchema、调用失败与MessageBus既有3项保持通过。无新依赖/CLI重编，process-utils helper自身未改。

## E-486 Windows实际命令与进程

verify-source-tool-discovery-cancel.mjs独立home/workspace，真实编译Config/ToolRegistry与Node发现脚本。两套hang脚本实际各spawn一个子进程，退出前确认父/子都活，Config.dispose和一次实际10秒发现超时分别触发取消；process.kill(pid,0)观察父子均消失，主初始化不继续建memory或变就绪。父/子PID只来自本fixture文件，finally仅清理自有进程。

另一个Config在sandbox prepare接口受控hold，关闭立即拒绝，release后cleanup恰一次，脚本started文件不存在。第四Config真实成功命令加载retained工具，脚本控制文件切坏JSON后失败仍保留retained，切回成功updated后新目录替换且旧工具消失。未替换ToolRegistry/Config业务方法；prepare用Noop实现接口受控等待，不是真实沙箱验收。15条件true/17622ms/退出0/0网络模型。

首次验证器误导入dist/utils/process-utils.js，真实输出在dist/src/utils，任何发现命令启动前失败，import-failure日志保全；按rg --files纠正验证器路径再执行通过，未改产品迁就验证。finally恢复接口/fetch、dispose自有Config/DrillStore、清自有父子进程，realpath检查后只删真实temp下ultra-tool-discovery-cancel前缀目录。没有真实外部工具/付费模型或旧任务重跑。

## 工件、保全与接续

工程根C:/Users/Administrator/Documents/ChatGPT/gmncliu：tool-discovery-cancel-baseline.log/-baseline-junit.xml、-tests.log/-junit.xml、-final-tests.log/-final-junit.xml、-core-compile.log/-final-core-compile.log、-lint.log/-final-lint.log、-test-format.log/-format.log/-final-format.log/-format-check.log；verify-source-tool-discovery-cancel.mjs、source-tool-discovery-cancel-import-failure.log、source-tool-discovery-cancel.log/-result.json；verify-tool-discovery-cancel-preservation.mjs、source-tool-discovery-cancel-preservation.json。

个人provider/locale/config skill-tags SHA、ultra-tools不存在、全局83、三次真实失败E-294/E-364/E-466 SHA及false、E-466临时凭据删除全部保全true；个人数据库/PATH/工具安装不动，旧被拒清理目录不动。沿用granted scope/PRIMARY R26 code-audit，lead/cae/doc同会话，无子代理/外部扫描。

目标池/case workitems/timeline/field-journal和E-485-486更新，Obsidian/源码docs/工程报告同全文SHA，显式stage、skip ci推隔离分支，不合并master/Release。下一阶段修MCP发现/stop与ExtensionLoader迟到注册，并检查成功命令刷新保留连接中的MCP工具。复杂真实多Agent质量F-164和最终分发仍未验收，goal active。
