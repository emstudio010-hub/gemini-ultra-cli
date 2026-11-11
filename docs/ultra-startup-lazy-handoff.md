# Gemini Ultra CLI 启动阻塞修复交接

日期：2026-11-11。WI-076/E-167，preview.44候选。沿用自有源码case
R26/code-audit、lead/cae/doc，仅本地启动路径与分发核对，不改个人供应商配置、数据库或逆向工具。

## 证据与根因

当前已安装preview.43在隔离profile、Windows
ConPTY、默认监督进程、loopback配置下实际输入/effort
low再/quit：输入框4025ms、本地命令5047ms、CLI退出0、零模型请求。新测量取代将preview.11旧时间误当当前事实；单次观察不是跨机器冷启动基准。

启动阶段观察显示，认证约0.3ms、工具发现约83ms，cli_startup结束后有约2.2秒同步等待，再进入界面与命令加载。对已安装interactiveCli模块的独立隔离CPU采样确认：EditorSettingsManager在模块导入时检查16种编辑器，hasValidEditorCommand→commandExists→execSync→spawnSync，采样约2094ms耗在同步编辑器进程等待。另一处约57ms来自systeminformation导入时getCodepage的同步探测。它们不是模型服务延迟或工具初始化卡死；这些采样值包含同步等待，不是纯CPU指令耗时。

Evidence→Finding→Path：preview43-startup-phases.jsonl、preview43-interactive-import.cpuprofile及-cpu-summary.json
→ F-043启动导入提前同步探测 →
E-167按需异步编辑器发现及遥测硬件库延迟加载。原CLI主/子进程均有退出0记录；首次诊断将NODE_OPTIONS注入了node-pty宿主，观察脚本在报告后仍保活。确认CLI已退出后只结束对应宿主PID，原日志保留，不将辅助脚本退出1改写为0。后续将探针限定注入CLI，最终安装观察无需该注入。

## 实现

- 编辑器管理器导入时不探测；打开/editor才异步查找，每批3种编辑器，保留原排序、未安装/沙箱禁用标记，每次重新打开重新发现。关闭对话框取消当前查找并停止后续批次，不在卸载后更新React状态。
- 异步编辑器查找单次3秒超时、支持AbortSignal、隐藏窗口。Windows直接execFile
  where.exe，避免仅取消cmd包装进程而留下查找；Unix仍用command
  -v。此处是查找，不启动编辑器。不改变同步调用者的公开API。
- 设置页加载时可按Esc/Tab，未完成探测不报“编辑器不支持”；完成后显示原选项与偏好。当前偏好展示复用发现结果，不在每次渲染重新同步探测。
- systeminformation仅在启用遥测且实际获取GPU信息时动态导入，保留原GPU正常/空/失败结果逻辑，不改变遥测用户设置。

## 必要核对

2个管理器场景通过：导入零探测、顺序/禁用/重开刷新、并发与取消。7个设置页场景通过，含探测中Esc及卸载取消、原界面快照和偏好反馈；2个外部编辑器审批焦点场景通过。11个core异步查找与4个GPU遥测场景通过。未运行全量/冒烟；异步改造后测试首次未等待发现完成而失败，已按真实异步行为修正，保留初始日志，不更新原界面快照掩盖变化。

源码同类实际ConPTY观察：输入框2012ms、本地命令2809ms，CLI退出0、零模型请求。与修前4025/5047相比约少2秒；源码与已安装包、文件缓存、探针宿主方式不同，因此不宣称稳定加速百分比，最终包观察追加后再交付。剩余内置命令发现仍约0.5至0.7秒，不称启动零开销或所有加载路径已解决。

工程证据目录C:\Users\Administrator\Documents\ChatGPT\gmncliu：preview43-interactive-profile-result.json/-output.txt、preview43-startup-phases.jsonl、preview43-interactive-import.cpuprofile/-result.json、preview43-startup-cpu-summary.json、startup-lazy-source-result.json/-phases.jsonl、startup-editor-dialog-final-junit.xml、startup-deferred-editors-final-junit.xml、startup-editor-async-final-junit.xml、startup-telemetry-lazy-junit.xml、startup-lazy-delivery-lint.log/-types.log。观察工具observe-interactive-startup.mjs、observe-startup-phases.mjs、profile-interactive-import.mjs均在工程目录；不用个人凭据，不做真实付费调用。

```mermaid
flowchart LR
  A[导入界面] --> B[直接显示输入]
  B --> C[用户打开编辑器设置]
  C --> D[异步分批查找]
  D --> E[显示已安装与禁用状态]
  C --> F[Esc关闭并取消查找]
```

## 分发与目标池

候选preview.44准备隔离分支三平台工件、Windows安装及一次最终包启动/编辑器设置观察；不重复其他本机fixture或付费任务，不合并master、不正式Release。goal保持active，真实Boost/Swarm有界成功证据保留；更多模型/Teamwork长任务、复杂逆向及摘要准确性仍有未验收边界。此修复不证明真实外部编辑器能启动，也不证明所有电脑的启动性能。
