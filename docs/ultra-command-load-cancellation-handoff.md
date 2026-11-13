# Gemini Ultra CLI 命令聚合取消与故障隔离交接

日期：2026-11-13。WI-193 / E-439至440 / F-150。源码基线0f35bed28ff005a07b1e1bece58e4fc424c680b2，分支codex/ultra-agent-portable。上一阶段源码/Windows验证及提交进展，整体goal active。继续源码→Windows必要定向验证→最终统一打包；无打包、重装、升版本、多平台CI或旧付费任务重跑，全局preview.83保持。

## 实际加载取消缺口

上一阶段原生文件读取已取消，但CommandService仍直接Promise.allSettled等待所有loader。任一loader不处理signal且悬置，交互reload清理之后旧create也无法结束；一个loadCommands同步抛错会在map时跳出，其他loader未必启动。原来的UI已有signal.aborted guard防迟到setLoadedCommands，本轮不声称修复原本不存在的旧UI覆盖。

CommandService现已有取消信号立即返回冻结空service且不启动loader；活跃加载注册一次abort等待，与已观察所有子Promise的allSettled竞争。abort结束聚合等待，清理事件listener，返回空service，不resolve冲突或发遥测；子Promise即使迟到reject仍由allSettled观察，不发布旧失败日志/命令。每个loader用async包装，隔离同步throw，其他loader继续按原数组顺序收集。真实加载失败仍debug日志，未取消时冲突分流及冻结数组保持。

非交互handleSlashCommand在入口及聚合返回后throwIfAborted，避免空service取消结果当作未识别命令落入后续处理，也不会执行刚加载的action。交互现有caller仍先核signal再发布，未扩大界面改动。

这是停止等待与结果发布，不会强制终止不合作loader的内部OS/网络操作；signal照常传给所有实际loader，自身可取消能力由其实现。没有增加自动重试、超时放弃、跳过有效命令或改变权限/同名优先级，不承诺未主动取消时的全局启动上限。

## E-439 源码定向

新增commandLoadingCancellation.test.ts4项，旧源码实际4失败：
- loader忽略signal并永不settle时取消后等待仍未完成；
- pre-aborted仍启动loader；
- 同步throw中断其他loader；
- 旧加载迟到reject场景取消等待悬置，无法正常接续验证。

修后4通过，观察旧reject无unhandled及无冲突/旧debug日志；CommandService原7项通过。nonInteractiveCliCommands补入口已取消不create，以及create期间取消不执行已返回action两项，与既有provider未识别保护共3项通过。合计14不同相关检查，无全量/冒烟。

CLI严格tsc、4个修改/新增文件eslint --max-warnings 0、prettier --check、git diff --check最终退出0；首lint PromiseSettledResult数组泛型写法按仓库要求改Array<T>，纯类型无运行时变化，无产品测试失败重跑。core未改不重编译。

## E-440 Windows真实组合加载

Node v24.19.0，独立home/profile/workspace，实际编译CommandService/BuiltinCommandLoader/FileCommandLoader/SlashCommandResolver/noninteractive handleSlashCommand。真实user TOML包含local-fixture和与内置language同名文件；只在公开service边界插入一个受控不合作loader，不伪造内置和文件读取。

旧组合load启动后明确abort，空service及时返回，冲突事件0；新真实内置+文件load生成58条命令，language/effort/drill/swarm/local-fixture均在，内置language与user.language同名分流保持。释放旧loader为reject后无unhandled、旧冲突/失败日志，当前service不变。同步throw对照仍保留真实文件命令且debug仅1条预期失败。pre-aborted不调用loader。对真实非交互/stats调用插入同样悬置loader，明确取消后返回同一个abort reason，不执行任何action/模型回退。

9条件true，8968ms/退出0，本机单次cancellationMs=1，仅主动取消后等待退出观测，非所有机器时限。0外部网络/模型/付费，临时根finally清理成功；Yoga data:本地加载按原实现放行，不算网络。未创建真实provider或修改个人配置、未使用ConPTY或打包。

证据根 C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- command-load-cancellation-before-test.log/-before-junit.xml（旧4失败）、-test.log/-junit.xml（14通过）。
- command-load-cancellation-cli-compile.log / -lint.log / -format.log / -format-check.log。
- verify-source-command-load-cancellation.mjs、source-command-load-cancellation.log/-result.json。
- verify-command-load-cancellation-preservation.mjs、source-command-load-cancellation-preservation.json。

F-150 -> CommandService所有loader无条件等待/同步throw逃逸及非交互取消结果继续解析。abort race、子Promise观察、同步隔离及入口取消检查修复该路径；不把主动取消当作任务已完成或旧底层操作已停止。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持、ultra-tools.json不存在、全局preview.83；E-294/E-364旧真实复杂任务SHA与passed=false保持，无覆盖/付费重跑。不改个人数据库、凭据、工具安装或PATH。旧被拒清理ultra-cockpit-review-scope-S0wWvh不重试删除。

沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。更新源码目标池/case四项，三份全文SHA一致；显式stage本轮文件，skip ci提交推codex隔离分支，不合并master/Release。继续启动加载及Agent源码收敛，复杂真实任务质量、更多模型及最终Windows/macOS/Linux统一包仍待；整体goal active。
