# Gemini Ultra CLI 技能发现限时与刷新中止交接

日期2026-11-13。WI-198 / E-449至450 / F-155。基线a379b786270edd0609d8a8957923b3833a885dd8，分支codex/ultra-agent-portable。上一轮已提交两项源码修复，属progress；本轮继续源码优先→Windows必要定向验证→功能收敛后统一打包，整体goal active。无打包、全局重装、升版本、多平台CI或旧付费任务重跑，preview.83保持。

## 源码

SkillManager原普通启动/刷新没有signal、无整次时限，revision只能阻止迟到发布，无法及时结束旧请求或底层读取。新增每次独立AbortController、10秒整次发现deadline和可选调用方signal；信号贯通内置、用户并发根、项目两层、安全读取。外层withAbortSignal也结束对不合作loader的等待；clear/add/filter/admin关闭与新刷新使旧generation失效并abort，旧请求安静返回，调用方取消按原reason拒绝，预取消不影响已在运行的刷新。所有终态清timer，旧finally不得清新controller。

超时抛SkillDiscoveryTimeoutError，按当前语言给出检查目录和/skills reload重试提示；超时保持已发布目录，信任降级仍按原规则立即撤旧项目内容，不能借回退恢复。Config.initialize只对该超时发当前语言warning并继续剩余初始化；其他意外错误仍抛出。/skills reload仍报告失败且清等待UI，不把超时误称成功；重载缺配置、等待、成功计数和失败统一双语。

这是技能发现这一步的10秒上限，不是整个Config.initialize、onReload设置回调或所有启动依赖的总上限。不可取消的OS stat/open等只能停止等待并检查迟到结果/关闭句柄，不能强停；同步大量解析也受事件循环调度限制。本轮不新增缓存、不自动重试，不声称所有卡顿消失。

## E-449 源码定向

skillDiscoveryLifetime.test.ts旧实现8项实际全部失败；新实现8通过（deadline、supersede、clear/admin/add/filter四种显式中止、外部取消、预取消隔离）。相关刷新7/原manager9通过、1原skipped，三文件24实际通过/1旧skip。Config reloadSkills范围7通过（含双语启动超时恢复与非超时错误传播3项新增），279未选择；CLI reload范围9通过（含双语timeout待状态清理2项新增），17未选择。共40不同实际检查通过，296按范围过滤未执行，未新增skip。test one-var五处声明拆分后该新文件最终8通过。

首次CLI测试与core编译并发，读到旧dist导出，新增两项因SkillDiscoveryTimeoutError不是constructor失败；保留stale-dist日志/JUnit，等core编译完成再验9通过，未为夹具伪造错误类型。Config最初7通过，随后加入隔离扫描的suite hooks时全局restoreAllMocks破坏了原文件依赖mock，产生6个虚拟/tmp/test不存在失败；保留restore日志/JUnit，改仅恢复本suite自有SkillManager/i18n/events spy，7再通过。该scope默认mock技能发现，避免配置行为测试扫描个人技能；产品真实读取另见E-450。

core严格tsc首次及最新fixture修正后最终均退出0；CLI严格tsc退出0；6个本轮文件eslint --max-warnings 0最终、prettier --check和git diff --check退出0。首lint为新测试5处one-var，局部fix只拆声明。未跑全量/冒烟，未新增实际供应商任务。

## E-450 Windows实际初始化/重载

Node v24.19.0，独立home/profile/workspace、24真实SKILL.md中文正文，真实编译Config.initialize/SkillManager/glob/stat/安全句柄及/skills reload命令handler。门闩仅在8个真实FileHandle.readFile进入原生调用前等待，不替换文件内容。

1. 中文启动：真实10秒deadline触发，initialize完成（10082ms），warning含CLI继续启动与/skills reload，原已发布saved技能/激活会话名称/ActivateSkillTool保持。返回时8读取尚未释放；释放后8原生ABORT_ERR/8close/8signal/8open。
2. 英文reload handler：真实deadline（10005ms），英文错误和重试命令可见，pending先显示后清空，不调用reloadCommands、不发成功；旧目录保持。释放后另8原生中止/关闭；显式重试24完整中文正文发布，命令刷新和工具保持。
3. 普通刷新被新刷新替代：旧8读取阻塞时新刷新完成，旧请求在释放前已返回，释放后8原生中止/关闭，发布列表不受旧读取影响。

17条件true，总26174ms/退出0；三组各8open/read/signal/ABORT_ERR/close，合计24原生中止与关闭；原文件字节保持、无未处理迟到reject、无模型或外网请求，临时根finally清理成功。UI为实际handler回调记录，非ConPTY/视觉交互验收；实测挂钟只证明本机受控技能超时路径，不作整体启动性能基准或最终包证明。未认证、未执行模型/安全工具或付费。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- skill-discovery-lifetime-before-test.log/-before-junit.xml（旧8失败）；-test.log/-junit.xml（24通过/1旧skip）、-final-test.log/-final-junit.xml（声明修正后8通过）。
- skill-discovery-lifetime-config-test.log/-config-junit.xml（7通过/279未选）；-config-restore-test.log/-config-restore-junit.xml（fixture恢复破坏mock的6失败）。
- skill-discovery-lifetime-cli-test.log/-cli-junit.xml（9通过/17未选）；-cli-stale-dist-test.log/-cli-stale-dist-junit.xml（旧编译导出导致新2失败）。
- skill-discovery-lifetime-core-compile.log/-final-core-compile.log、-cli-compile.log、-lint.log（首失败）/-test-lint-fix.log/-final-lint.log、-format.log/-fixture-format.log/-final-format.log/-format-check.log。
- verify-source-skill-discovery-lifetime.mjs、source-skill-discovery-lifetime.log/-result.json；verify-skill-discovery-lifetime-preservation.mjs、source-skill-discovery-lifetime-preservation.json。

F-155 -> 普通技能发现无整次deadline和真实读取归属取消，导致旧刷新/不可用磁盘读拖住等待。10秒、独立controller、底层signal及startup限定恢复修复；工具原权限、来源优先级和信任边界保持。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持，ultra-tools不存在，全局preview.83保持；E-294/E-364旧复杂真实任务SHA和passed=false保持，无覆盖或付费重跑。不改个人数据库/凭据/工具安装/PATH；旧ultra-cockpit-review-scope-S0wWvh拒绝清理不重试。

沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。维护目标池、case四项和证据，三份交接全文SHA一致；显式stage、skip ci推隔离分支，不合并master/Release。继续源码功能收敛与剩余真实交付质量问题，更多模型/长会话和最终Windows/macOS/Linux统一包仍待，整体goal active。
