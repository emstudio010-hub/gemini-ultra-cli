# Gemini Ultra CLI Swarm 互斥运行测试交接

2026-11-15；WI-257 / E-568至569 / F-215；基线5cd75ea1d89ddc1021caa537f95c98c8f932e4bc，分支codex/ultra-agent-portable。上一阶段为模型目录取消接线；本阶段补上 Swarm 入口互斥保护并完成真实运行锁测试。goal active，源码优先、Windows 定向验证、暂不打包。

## Evidence → Finding → Path

`/swarm <任务>` 现在在创建前检查 `isAgentWorkflowRunning(root)`。若 Teamwork/Boost/Grill me 工作流已持有执行锁，立即显示中英文冲突提示，阻止第二协作路径；原有 Plan Mode、空任务、正常创建逻辑保持。

## E-568至569 定向验证

新增测试创建真实 ready Boost 工作流并运行两个 reader，使工作流持有执行状态；随后调用 `/swarm Second concurrent swarm`，命令被拒绝且不创建蜂群；取消原工作流后两个 reader 收尾，测试退出0。CLI tsc build、swarmCommand/swarmCommand.test eslint、Prettier与diff check通过。选择性 Vitest 1项通过；未跑全量/冒烟/真实供应商。

## 边界与保全

不证明真实复杂协作质量、外部模型效果或最终三平台分发。个人provider/locale/数据库/PATH/工具安装未改，四旧真实失败与SHA、ULQ凭据删除、全局83保全。交接、目标池和case同步后显式stage，skip ci推隔离分支，不合master/Release。继续认证/设置加载、演练台和可移植逆向收敛，goal保持active。
