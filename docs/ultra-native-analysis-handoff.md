# Gemini Ultra CLI 跨平台原生分析交接

日期：2026-11-11。产品版本保持 **1.0.0-preview.28**，产品源码提交
`eace895008859c4787ffa6033557c1e951db9dce`。本阶段只增加便携验证脚本和专用工作流，复用原构建工件，不重新构建、不改产品版本。

## E-110：验证方式与工件身份

`scripts/verify-ultra-native-analysis.mjs`
去除了开发机路径和固定端口，使用当前 runner 的已安装入口、报告路径、原生 r2 路径；端口由操作系统分配，模型只连接隔离 loopback。脚本记录平台、架构、Node、产品版本、原工件 SHA 和原产品源码提交。

专用工作流 `.github/workflows/ultra-native-analysis.yml` 在验证分支
`codex/ultra-agent-native-analysis`
触发，原包来自已完成的运行 42868353559。安装前校验原运行 success 和源提交，下载对应系统工件并校验 SHA；随后在临时目录正常 npm 安装。没有源码开发依赖或作者用户配置。

固定安装官方 radare2 6.2.2：Linux x64 使用 `.deb`，SHA-256
`09234e4139bf8dfcbb7fc1fdb2519859ad516e63c19d3c27d92aaecdf463b1ad`；macOS
arm64 使用 `.pkg`，SHA-256
`6d674844aacb3c72de0fd1e01353d6dd03d4235a3629b607d1fe74c98e2a5f24`。安装操作仅发生在隔离 CI
runner，不安装到用户电脑，不随产品包分发。

验证使用与 Windows 证据相同的生成 ELF64：两个函数、helper 中立即数 42 的指令及 ret、entry0 到 helper 的 CALL。实际调用已安装 CLI 的 binary_analyze 三视图，并把静态证据写入 SQLite
note 再查回；核对样本 hash 不变、错误为空、最终正文和进程正常结束。模型响应为 HTTP
fixture，不调用真实供应商，不执行样本。

脚本语法、格式、严格 ESLint 和工作流 YAML/矩阵校验通过。首次导入便携脚本时缺少显式 Node 全局导入及一个空 catch 的说明，lint 报错后已补齐，原日志保留。未跑全量或冒烟。

## 当前结果

[专用运行 42869801303](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42869801303)已确认存在，验证代码提交
`77d4cbf6c5939703b98a43f65ba8745fae0ce53e`。

Linux x64 已成功：原产品包 SHA
`b2cb180fb5921707a0fe35e5e861b336368a205253453075edf1a917a060ee34`，Node
v24.22.2、原生 r2 6.2.2
linux-x86_64，6 请求/1,425ms/退出0。三视图各成功一次、笔记写入和查回成功、原样本 hash 不变。该时间不是跨系统性能对照。

E-112：macOS arm64 也已成功：原产品包 SHA
`2fa9008baade553d188bf8a41801d8b0557685e8c30be12a1b205a6a606ea611`，Node
v24.22.2、原生 r2 6.2.2
darwin-arm_64，6 请求/1,814ms/退出0。函数、指令、CALL 引用和 SQLite 笔记写入/查询均通过，样本 hash 不变。原排队任务正常开始并完成，没有重启或重建产品。

整次运行现为 completed/success。`verify-native-cross-platform.mjs`
退出0，核对 Linux/macOS 报告的版本、源提交、原包 SHA、六次请求、全部检查项、工具成功计数、无超时和空失败列表，并与上阶段 Windows 同一样本哈希和原生 r2 身份交叉核对。三平台已安装 preview.28 的新静态分析路径均有实际执行证据。

## 工程证据

`C:\Users\Administrator\Documents\ChatGPT\gmncliu`：

- native-cross-platform-script-lint.log、native-cross-platform-script-final-lint.log。
- native-analysis-run.json。
- native-analysis-42869801303/native-analysis-ubuntu-latest/native-analysis.json 与 native-analysis-output.txt。
- 上一阶段 Windows
  installed-preview28-binary-analysis-result.json，以及原 github-preview28-artifacts-result.json。
- native-analysis-42869801303/native-analysis-macos-latest/native-analysis.json 与 native-analysis-output.txt。
- native-analysis-cross-platform-result.json：跨平台证据一致性核对结果。

Linux 成功记录的 stderr 中另有 cleanup_ops 未结束及 start
mark 缺失的启动遥测告警，已列入 WI-058；不影响此次成功退出，也不据此推断启动速度回退。

## 范围

已验证安装的 CLI 与相应系统原生解析器协作，不把模型 fixture 当成真实供应商理解能力或复杂逆向验收。输入是 x86-64
ELF，macOS arm64 上的解析若成功仅证明静态跨架构解析，不代表执行该文件。

本机已安装 preview.28 Windows
CI 包，无需为本阶段更改安装或再次跑 Windows 链。其他电脑仍需自己安装工具、模型配置和合法许可。更深反编译、完整无人介入协作、引用可靠性继续在目标池中；整体 goal
active，不合并 master、不发布正式 Release。
