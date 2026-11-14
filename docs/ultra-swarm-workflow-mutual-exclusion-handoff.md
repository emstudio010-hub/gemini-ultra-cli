# Gemini Ultra CLI Swarm 工作流互斥交接

2026-11-15；WI-257 / E-568 / F-215；基线5cd75ea1d89ddc1021caa537f95c98c8f932e4bc，分支codex/ultra-agent-portable。上一goal turn为progress（模型目录生命周期已接线）。goal active；源码→Windows必要定向验证→功能收敛后最终三平台包；preview.83保留，无打包/重装/升版/三平台CI/付费重跑/子代理。

## Evidence → Finding → Path

F-215：`/swarm <任务>` 命令入口只依赖后层状态/预算拒绝；当另一条 Teamwork/Boost 工作流已经运行时，用户会先看到蜂群创建尝试再得到底层冲突，反馈不直接。现命令入口先检查 `isAgentWorkflowRunning(root)`，运行中立即给出中英文状态提示并要求先查看/取消；空任务、Plan Mode和正常Swarm创建行为保持。

## E-568 定向验证

修改packages/cli/src/ui/commands/swarmCommand.ts单点。CLI tsc build退出0；Swarm command 选择性测试（prepare/status）通过；eslint零warning。没有真实模型、外部网络或工作区写入；不重跑全量/冒烟。

## 保全与接续

个人provider/locale/数据库/PATH/工具安装未改；四旧真实失败SHA与passed=false、ULQ凭据删除、全局83保持。三份交接/目标池/case同步后显式stage，skip ci推隔离分支，不合master/Release。下一继续认证/设置与其他协作状态边界，随后回演练台和可移植逆向收敛，goal保持active。
