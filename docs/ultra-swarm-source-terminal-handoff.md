# Gemini Ultra CLI Swarm Windows源码终端交接

日期：2026-11-12。WI-133 /
E-321。持续目标active。本阶段补齐最近Swarm修复的真实Windows终端证据，没有新增业务源码改动。保持源码优先、Windows先验收、最后统一打包；全局安装仍preview.83，未打包、重装、升版本或运行跨平台CI。

## 实际终端结果

使用Windows
ConPTY启动packages/cli/dist/index.js源码编译入口，读取当前最新core编译产物。隔离home/workspace和本地模拟供应商端点；preload通过实际Config.storage初始化同项目Swarm，使用受控运行器先接受长成果，再保留一个运行中的后续成员。没有修改个人配置或向真实供应商发起请求。

实际终端输入依次为`/swarm resume <ID>`、`/swarm cancel <ID>`、清理未释放时再次`/swarm resume <ID>`、收尾后`/swarm status <ID>`、`/swarm reports <ID>`、`/quit`。两次resume在终端显示仍在执行/清理的错误，没有提交协调提示；第一次拒绝时状态字节保持。cancel显示已停止、磁盘phase=cancelled，但受控成员清理仍待显式释放，第二次恢复继续拒绝。

释放受控清理后，运行器故意迟到返回completed=true：running归零、成员paused、原长成果及canonical归档保持、迟到输出未接受、累计两次唤醒/失败0。状态命令在真实终端显示`@reader: paused`，报告导出显示manifestPath，实际导出的成员报告全文仍逐字等于此前接受的成果。`/quit`自然退出0，无超时，整体23834ms，本地供应商端点收到0请求。11个针对该流程的条件通过。原PTY文本另直接核对恢复错误、停止、暂停成员、manifestPath及迟到未接受提示均存在。

## 证据与复现

工程目录：C:/Users/Administrator/Documents/ChatGPT/gmncliu。

- `seed-source-swarm-terminal.mjs`：在被启动的CLI进程内预置隔离任务和受控执行器，复用当前源码模块，没有mock
  CLI斜杠命令或终端渲染。
- `verify-source-swarm-terminal.mjs`：原生ConPTY输入和结果观察；复现命令`node C:/Users/Administrator/Documents/ChatGPT/gmncliu/verify-source-swarm-terminal.mjs`，不需要构建安装包。
- `source-swarm-terminal-output.txt`：实际终端输出，保留ANSI/重绘信息。
- `source-swarm-terminal-result.json`、`source-swarm-terminal.log`：11条件、退出码、时长、零请求及验证范围。

使用已装CLI自带的@lydell/node-pty作为观察工具，没有安装新依赖。临时profile、任务及导出仅为夹具，完成后清理自己的mkdtemp目录。没有为本轮纯验证资料再运行类型检查、lint或新测试套件，最近源码的既有类型和lint记录保持。

## 边界与接续

本阶段证明源码CLI的该英文终端流程与最近修复能接通；受控运行器不是实际模型自主协作，preload不是正常任务创建过程，不把它当作新的真实供应商语义或完整所有功能验收。未另跑中英文切换或启动基准，也不把整体23834ms作为启动时间。真实终端的source入口是编译后的模块，非最终分发包；当前安装83与新源码分列。

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码范围，lead/cae/doc由当前会话承担。没有外部安全目标、付费任务重跑、个人数据库改动或原生逆向工具执行。个人locale/provider
SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 /
e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

长期任务/真实模型质量、进一步源码完整性及最终Windows/macOS/Linux交付仍待收敛，持续目标保持active。隔离codex分支同步文档带skip
ci，不合并master或正式Release。
