# Gemini Ultra CLI 原生静态分析交接

日期：2026-11-11。源码分支 `codex/ultra-agent-portable`；功能提交
`eace895008859c4787ffa6033557c1e951db9dce`。整体目标 active。

## E-106：函数、指令和引用的原生接入

此前 binary_triage 提供字符串候选，binary_inspect 通过 rabin2 读取元数据和导入表。新增
`binary_analyze`，模型现在可以通过固定命令调用当前电脑的原生 radare2/r2 读取实际函数与指令，不再只能依靠 shell 临时拼装。

| view              | 方法     | 用途                                         |
| ----------------- | -------- | -------------------------------------------- |
| functions（默认） | aa;aflj  | 识别入口与符号关联的函数                     |
| instructions      | pdj      | 指令窗口，默认从入口开始，也可传数值虚拟地址 |
| xrefs             | aaa;axtj | 指定地址的静态传入引用，要求 address         |

发现使用 PATH 或用户的
`GEMINI_ULTRA_TOOL_R2`，缺失显示安装/配置说明。Windows 需要原生 r2.exe，拒绝 batch 包装器。产品没有开发机目录。工具已接入实际注册表、ALL_BUILTIN_TOOL_NAMES、PLAN_MODE_TOOLS、只读子 Agent 白名单和随包 local-reverse 技能；安装说明同步更新。

调用无 shell、无写模式、无调试模式，使用 `-NN -q -x`
忽略用户设置、启动脚本和外部插件，以只读静态方式打开文件。地址只允许非负安全整数或不超过 64 位的数值字符串，规范为十六进制后进入固定命令模板，不接受 r2 符号/表达式/命令。参数、真实路径和普通文件检查在创建进程前完成。

每次最多 30 秒、4 MiB 输出、64
MiB 样本，沿调用方 signal 取消。非法/不完整 JSON、无效行结构、超时和溢出均报错，不将部分输出当完整分析。列表默认100/最大500；截断明确标记。指令只称为窗口，不报告为完整函数。空结果不证明没有函数或调用者。原生输出地址还需可用 JavaScript 安全整数精确表示；不以失真地址作为证据。

## 必要检查

5 项定向用例通过：固定只读命令/字面文件名/窗口上限、命令表达式及越界地址拒绝、函数与空引用计数及计划模式声明、缺工具及预取消、坏 JSON/结构/超时/溢出分类。受影响文件严格 ESLint、格式、核心/CLI
TypeScript 构建通过。首次 lint 的三处 one-var 格式问题已修正，原日志保留，没有语义改动；未跑全量或冒烟。

本机实际 radare2
6.2.2 读取生成的256字节 ELF64：entry0=0x400080、helper=0x400090，函数列表含二者，静态引用含从 entry0 到 helper 的 CALL。样本没有被执行。这是工具环境和命令的初步实际证据，安装后的完整 CLI 链另行核对。

## 分发状态

[运行 42868353559](https://github.com/emstudio010-hub/gemini-ultra-cli/actions/runs/42868353559)已completed/success，对应上述提交。Windows
x64、Linux x64和macOS
arm64各自构建/打包/隔离安装通过；三个工件版本、安装报告、SHA及六rg
hash/0755核对通过（E-108）。CI模型响应为fixture，不连接真实供应商，尚不等于三平台新native-r2路径均运行通过。

## 工程证据

根目录 `C:\Users\Administrator\Documents\ChatGPT\gmncliu`：

- binary-analyze-tests.log、binary-analyze-lint.log（首次 one-var）、binary-analyze-final-lint.log、binary-analyze-types.log。
- binary-analyze-sample.elf：人工生成 ELF64，只读读取，未执行。
- verify-binary-analyze-cli.mjs：真实 CLI/本机 r2 三视图、SQLite 笔记写入及查询的隔离 HTTP
  fixture。

## 验收边界与下一阶段

静态反汇编不等于反编译、动态验证或完整复杂逆向。工具不自动安装 radare2、不携带商业工具或许可，不复制开发机模型配置和笔记数据库。其他电脑需要独立安装对应工具并设置 PATH 或环境变量。

三平台构建/安装结果不直接代表各平台新工具的原生执行；实际 native-r2 路径按平台另记。本阶段不做真实供应商调用，没有外部安全目标。后续继续当前源码无人介入协作及复杂逆向能力，旧报告已恢复交付，不重复付费续接旧任务。目标池持续维护，不合并 master、不正式发布 Release。

## E-107 / E-109：安装后原生链与文件身份

本机双命令已安装Windows
CI工件preview.28，已有缓存offline安装6秒；424个包内文件逐一与该CI包一致。入口SHA-256
59f6a36c271c6b39a09e4b91a004596a4bf36755666e7584247af157afae1f1f，包SHA-256
7376d91354aa286080d027913f0b3c67856d603de054d8e6aa4b7e1381c410e0。已有缓存不代表无缓存新电脑可以离线安装。

实际已安装CLI、原生radare2
6.2.2、生成256字节ELF和隔离HTTP模型fixture：6请求/2,515ms/退出0，binary_analyze三个视图各成功一次，核对两个函数、helper中mov
eax,0x2a及ret、entry0到helper的CALL；drill_record_fact写入一条note，drill_query_facts查回，保存的内容含实际调用地址和样本哈希，输入样本哈希不变。不是只验证JSON转发，也没有执行样本；没有真实模型调用。

样本SHA-256
b445a821a0a4e6af9d74611e979cecec6c521b18651454cc11df4994157b2d27。本轮native执行证据限Windows
x64，Linux/macOS仅完成构建/隔离安装，未重复上轮rabin2旧原生链。

| 平台           | 工件SHA-256                                                        |
| -------------- | ------------------------------------------------------------------ |
| windows-latest | `7376d91354aa286080d027913f0b3c67856d603de054d8e6aa4b7e1381c410e0` |
| ubuntu-latest  | `b2cb180fb5921707a0fe35e5e861b336368a205253453075edf1a917a060ee34` |
| macos-latest   | `2fa9008baade553d188bf8a41801d8b0557685e8c30be12a1b205a6a606ea611` |

Windows包：C:\Users\Administrator\Documents\ChatGPT\gmncliu\github-run-42868353559\gemini-ultra-cli-windows-latest\gemini-ultra-cli-1.0.0-preview.28.tgz。

最终证据：github-preview28-run.json、github-preview28-artifacts-result.json、verify-installed-ci28.mjs、global-install-github-preview28-full-result.json、installed-preview28-binary-analysis-result.json及-output.txt。源码目标池维护至E-109，整体目标active。
