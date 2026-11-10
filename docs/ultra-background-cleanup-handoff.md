# Gemini Ultra CLI 后台清理计时交接

日期：2026-11-11。候选版本：1.0.0-preview.29；产品工件和安装结果待本次构建确认。

## 问题与修复

E-113 /
F-032：preview.28 的 Linux 成功记录中，cleanup_ops 先报告未结束，随后报告 start
mark 已被清除。源码可达路径是 gemini.tsx 发起后台 Promise.all 清理，同时启动 cleanup_ops 计时；config.initialize 完成后 flush 会警告并清除尚未结束的阶段；后台 finally 再调用 end，因计时标记消失产生第二条告警。交互界面刷新启动指标时也存在相同的异步时序。

修复仅移除后台清理的启动阶段计时。checkpoint、工具输出和后台日志清理仍独立执行，原错误处理保留，启动流程不增加 await。真实清理错误仍会报告；不通过屏蔽日志掩盖错误，也不修改全局 profiler 的正常阶段语义。

Evidence：原 Linux
native-analysis-output.txt 两条告警，以及 gemini.tsx 和 startupProfiler.ts 的生命周期核对。Finding：后台工作生命周期超过启动统计窗口，引起虚假异常与不完整的启动指标。Path：移除非启动等待路径的计时，继续异步清理；对应 WI-058。

## 必要检查

- 受影响 gemini.tsx 与打包脚本严格 ESLint 退出0。
- npx tsc -b packages/core packages/cli 退出0。
- Prettier 与 git diff --check 通过。
- 低影响删减不新增测试，不跑全量或冒烟；不为此重复付费任务或原生逆向链。

## 分发与边界

仅更新 preview 版本与安装说明，沿用现有可分发安装流程。当前已安装 preview.28 的三平台原生 r2 三视图证据继续保留；没有把源码修复提前称为已安装成果。后续记录当前构建与本机安装的确切身份。

复杂反编译、完整无人介入多 Agent 收尾及模型引用可靠性仍待完成；整体目标保持 active。
