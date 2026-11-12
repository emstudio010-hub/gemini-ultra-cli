# Gemini Ultra CLI 技能巡检异步取消交接

日期：2026-11-13。WI-151 / E-355至356 / F-109。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装preview.83保持，无打包、重装、版本变化或跨平台CI。

## 修复

技能窗口上一轮已将工具巡检改为按P显式触发，但preflightSkillTools仍逐项同步checkBinary/where/which且忽略取消，按键可被定位器阻塞；关闭窗口只丢弃结果、不取消定位。音视频报告还将找到FFmpeg直接写成GPU加速已就绪；逆向分支只检查Ghidra启动器且漏r2/Python别名及既有工具路径/JDK配置能力。

现普通域使用公开复用的checkBinaryAsync并行定位，保留其1500ms超时与原信号取消；异步定位器同同步入口校验工具名。安全逆向域复用runDrillPreflight的信号、IDA端口、Ghidra反编译器/Java就绪及r2/radare2、python3/python别名，返回5个相关项目。技能巡检支持signal和当前locale；成功只说明路径/状态已发现、版本与能力未验证，不执行媒体/逆向工具或推断GPU。未发现时提供当前语言配置提示。

窗口每次P巡检创建AbortController，重试/语言变化/卸载均中断前次信号，旧结果不能覆盖当前报告。关闭窗口立即返回正常输入；P仍是唯一首次触发入口。语言改变后已展开的检查会取消并重新生成该语言报告，不更改模型/effort/技能激活状态。

## Evidence → Finding → Path

E-355：3项旧复现失败，覆盖预取消仍返回、没有异步共享信号、旧报告含GPU宣称。首观察器用rejects断言未立即捕获旧实现的成功返回，另报1个未处理断言；改为立即收集settled结果，原日志保留，不把观察器错误当额外产品缺陷。修后4项技能核心检查加3项既有drill取消对照均通过；2项UI检查通过，覆盖按需P、语言转发、重复P/语言变更取消、卸载取消、迟到报告忽略，共9项必要定向通过，无全量/冒烟。

core与CLI严格源码编译退出0、最终5文件eslint退出0，git diff --check通过。首次lint发现skillOrchestrator原空catch/多余正则转义/旧标签库any断言，补catch说明、等价正则并在原未验证registry边界明确eslint注释，保留其既有行为；没有将旧注册表声明为已验证或扩张修改持久化。整文件格式化导致的无关diff已恢复，保留新函数格式和最小lint处理。最后仅等价正则和注释调整，未因此重复源码编译/套件。

命令：core下npx vitest run src/skills/skillPreflight.test.ts src/tools/drillPreflightCancellation.test.ts --coverage.enabled=false；CLI下npx vitest run src/ui/components/SkillSpecialSessionDialog.test.tsx -t "cancels replaced|draft choices across" --coverage.enabled=false。根目录依次npx tsc -p packages/core/tsconfig.json、npx tsc -p packages/cli/tsconfig.json；eslint仅skillOrchestrator.ts、skillPreflight.test.ts、drillTools.ts及窗口/窗口测试。

E-356：Windows Node v24.19.0实际编译源码CLI、ConPTY真实/skills launch/P/Escape/reopen/P/Escape/quit。preload仅将where/which定位子进程替换为真实延迟Node子进程，保留产品signal/1500ms timeout选项。两个首轮子进程同时等待，Esc卸载后均SIGTERM/close且在原定位器超时前（断言小于1400ms）结束；重开P两个短进程退出0、报告显示Tools ready 2及版本/能力未验证；CLI和验证器自然退出0。11条件通过、18720ms、0HTTP/模型请求，provider/settings字节保持，所有4子进程close。独立实际编译媒体报告以Node路径作配置占位，仅发现不执行媒体工具，三项均无GPU宣称。

首Windows尝试取消/子进程结束已通过，但观察器包装execFile丢失其专用promisify返回结构，成功子进程的stdout未按对象交给产品，导致重试Tools ready 0、验证器超时/外层退出1；产品进程受控结束不当成功验收。修观察器恢复{stdout,stderr}返回后完成上述最终链，未为夹具改变产品，首result/log/terminal保留。不是对任意工具进程强杀、实际FFmpeg GPU、真实IDA/Ghidra/JDK或跨机性能的验收。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：skill-preflight-before.log/-before-junit.xml、skill-preflight-core-test.log/-core-junit.xml、skill-preflight-ui-test.log/-ui-junit.xml、skill-preflight-core-compile.log/-cli-compile.log、skill-preflight-lint.log/-final-lint.log及format日志；observe-source-skill-preflight.mjs、verify-source-skill-preflight.mjs、source-skill-preflight-result.json/-final.log/-terminal-output.txt、promisify-first保留记录。验证器不随包分发。

## 边界与接续

按reverse-skill R26自有源码路由，沿用work/gemini-ultra-agent-20261110/scope.md和同会话lead/cae/doc，无外部安全目标、原生分析或工具安装。隔离home、workspace技能、providers/locale/tools/事实库路径。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，ultra-tools.json仍不存在；不修改个人数据库/PATH。

此修复消除该技能巡检路径中的同步定位器，不承诺所有同步文件操作消失或总体稳定提速；配置路径检查和Ghidra安装文件检查仍含本地文件读取。核心Mock只验证分流与别名，Windows真实子进程是受控定位器，不能当已安装逆向工具就绪。旧技能标签库JSON未验证边界仍待单独收敛。共享配额语言、更多会话/协作入口和复杂逆向/长会话模型质量仍未整体完成，最终才统一Windows/macOS/Linux包。隔离codex分支同步skip ci，不合并master、不正式Release，goal保持active。
