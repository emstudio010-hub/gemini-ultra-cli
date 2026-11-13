# Gemini Ultra CLI 自定义命令有界加载与取消交接

日期：2026-11-13。WI-192 / E-437至438 / F-149。源码基线0d7f20f4c99fd16c46013d722c9fbfc79dc9a788，分支codex/ultra-agent-portable。上一阶段源码/Windows验证/提交进展，整体goal active。继续源码优先→Windows必要定向验证→最终统一打包；无打包、重装、升版本、多平台CI或旧付费重跑，全局preview.83保持。

## 启动与重载路径缺口

交互CommandService等待FileCommandLoader的loadCommands；其原先对一个目录的全部TOML文件map+Promise.all，单目录24个文件便同时启动24个readFile。取消只传glob，未传readFile；在加载重启/卸载后仍可读取全部文件、解析迟到数据并发布错误反馈。已取消信号也仍调用目录扫描。

FileCommandLoader.ts改为每目录最多8个异步worker，结果写回原索引，保留glob顺序及用户→项目→扩展的合并顺序，不截断命令数量或改变冲突处理。取消在入口、目录前、glob返回后、worker迭代和发布结果前检查，立即返回空列表，不启动后续读取/目录。原生fs.promises.readFile使用encoding+signal，前后检查；取消异常静默返回null，迟到内容不进入TOML解析/反馈。普通真实读取/解析/校验错误仍原样反馈，信任边界及prompt processor不变。

本轮没有懒加载/跳过用户命令、改变同名规则、缓存陈旧文件或加入超时猜测；核心Config和模型逻辑未改。每目录glob仍收集路径列表、每个TOML仍完整读取，CPU同步parse不可中途抢占；网络盘/极大单文件/OS异常读不保证全局启动上限，不声称所有卡顿已解决。

## E-437 定向源码证据

新增fileCommandLoading.test.ts三个场景。旧源码3项实际均失败：24读取并发而非≤8；取消后仍24读取并解析迟到非法数据；预取消仍scan。不是夹具缺接口失败。

修后上述3项通过，既有FileCommandLoader.test.ts47项中的45通过/原有2 skipped，合计48实际通过、2旧跳过。覆盖原有自定义命令、frontmatter/TOML验证、trust、扩展、shell/@file processor接线、同名/显示与取消反馈等原文件检查；不运行shell或模型任务。无全量/冒烟。CLI严格tsc、两个修改/新增文件eslint --max-warnings 0、prettier --check及git diff --check均退出0；core未改未重复编译。

## E-438 Windows真实文件读取与命令解析

Node v24.19.0，独立profile/home/workspace。编译FileCommandLoader调用实际glob和fs.promises.readFile，32个user TOML+2个trusted project TOML，共34。先直接load验证34全数和原顺序，再用真实CommandService重载一次验证同名user.command-00/workspace.command-00均保留，原提示词action正确返回submit_prompt，但验证器不提交、不执行shell/模型。

测并发时仅在实际fs边界加5ms等待产生可观察重叠，原文件内容与原readFile照常执行；两次正常读取68次、peak=8。取消场景在原生读取前设定局部门闩，首批8已开始后abort并释放，原始readFile全部收到传入信号并真实抛AbortError，8次native abort、active归零；后24个user排队文件与2个project文件未读取，返回[]、无user-feedback。已取消再调用不新增读取。

11条件true、5884ms/退出0、0外部网络/模型/付费，fixture finally清理成功。第一次验证器错误假定同名project会保留裸名，读取chosen.action时失败；核对真实SlashCommandResolver后改为user./workspace.并存合同重验，产品规则未改，首失败log保留。不是从假fixture结果反向放宽产品。

这是有界I/O、原生取消和原命令行为证据，5ms/门闩仅用于观察逻辑，不是启动速度提升百分比或挂钟基准，不涵盖ConPTY/最终分发包/网络盘性能。未改个人命令、providers或locale。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- file-command-loading-before-test.log/-before-junit.xml（旧3失败）；-test.log/-junit.xml（48通过/2旧skipped）。
- file-command-loading-cli-compile.log / -lint.log / -format.log / -format-check.log。
- verify-source-file-command-loading.mjs、source-file-command-loading.log/-result.json；source-file-command-loading-fixture-name-failure.log。
- verify-file-command-loading-preservation.mjs、source-file-command-loading-preservation.json。

F-149 -> FileCommandLoader全文件无界Promise.all/readFile无信号使启动/重载I/O集中、取消后残留工作。8worker按索引合并及信号贯通修复该路径，不承诺完整启动全局时间上限。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持、ultra-tools.json不存在、全局preview.83；旧E-294/E-364真实复杂任务SHA与passed=false保持，无覆盖/付费重跑。不改个人数据库、凭据、工具安装或PATH。旧被拒清理的ultra-cockpit-review-scope-S0wWvh不重试删除。

沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。维护源码目标池、case四项，三份全文SHA一致；显式stage本轮文件、skip ci提交推codex隔离分支，不合并master/Release。

后续继续真实启动/加载交互与Agent源码收敛；复杂真实任务质量、更多模型和最终Windows/macOS/Linux统一包仍待，整体goal active。
