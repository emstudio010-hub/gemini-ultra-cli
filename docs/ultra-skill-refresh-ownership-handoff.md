# Gemini Ultra CLI 技能刷新归属交接

日期2026-11-13。WI-196 / E-445至446 / F-153。基线3ef9b90fe3aab08de4d5cab504601dddd69ffc2d，分支codex/ultra-agent-portable。整体goal active；源码优先→Windows必要定向验证→功能收敛后统一打包。无打包、全局重装、升版本、多平台CI或旧付费任务重跑，安装preview.83保持。

## 源码与边界

原SkillManager.discoverSkills先clear，再按读取结果分段写回。等待时列表变空；重复刷新会让较早慢结果混入新列表；clear/admin关闭后未完成读取还能回填；disabled更新可能丢失。改为本次候选列表收集完一次发布，以discoveryRevision绑定归属；显式clear/add/filter及admin关闭使旧刷新失效。最新disabled名称副本在发布时应用。来源优先级、原始技能正文及active会话名称保留。

信任降级是保留旧列表的例外：上一已发布目录包含受信任项目技能而新刷新不受信任时，立即撤下旧列表，再发现允许来源，避免项目内容继续可用。较旧可信刷新不能重新发布。意外reject时保留已发布目录（信任降级已撤除部分不恢复）。loadSkillsFromDir原本会自行catch普通文件读取问题返回空，因此不宣称所有目录损坏事务回滚。没有新增底层取消、读取超时或启动速度基准；旧读取仍可能完成，但不得发布。

## E-445 源码定向

skillRefreshOwnership.test.ts旧实现六场景实际失败；修后新增信任降级场景共7通过，与名称身份2及原skillManager9通过/1原跳过合计18实际通过/1原skipped。未新增跳过。core/CLI严格tsc退出0；两个本轮文件eslint --max-warnings 0、prettier --check、git diff --check退出0。

首lint拒绝预先持有expect(...).rejects的异步断言，改为立即安装then拒绝观察器、结束时断言error；该文件最后7通过。最后重验首次误在仓库根运行core配置，setup相对路径错误，零测试执行，wrong-root log/JUnit保留；改在packages/core运行后退出0。不改产品以迁就夹具，未跑全量/冒烟。

## E-446 Windows实际文件

Node v24.19.0。独立home/profile和两个真实项目，编译SkillManager、真实glob/SKILL.md安全读取、SkillCommandLoader。fs.promises.open前设置5个确定门闩，释放后原生open/stat/read/close及文件内容照常使用：验证旧列表/命令保持、旧慢刷新不混入新结果、clear不回填、admin关闭不回填、最新禁用清单应用、故意storage lookup异常保持已发布目录、信任降级立即撤项目内容、非可信只加载允许来源。会话active名称和夹具原字节保持。

12条件true，6747ms/退出0/blockedReads=5，临时根finally清理成功。零模型、外网、工具执行或付费；非ConPTY/最终包/真实模型技能质量/启动挂钟基准。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- skill-refresh-ownership-before-test.log/-before-junit.xml（旧6失败）；-test.log/-junit.xml（18通过/1旧skip）；-final-test.log/-final-junit.xml（断言修正后7通过）；-wrong-root-test.log/-wrong-root-junit.xml（启动路径错误零测试）。
- skill-refresh-ownership-core-compile.log、-cli-compile.log、-lint.log（首失败）、-final-lint.log（通过）、-final-format.log、-format-check.log。
- verify-source-skill-refresh-ownership.mjs、source-skill-refresh-ownership.log/-result.json；verify-skill-refresh-ownership-preservation.mjs、source-skill-refresh-ownership-preservation.json。

F-153 -> 技能刷新无发布归属及一次提交，导致可用列表空窗/旧结果混入/显式清空回填。revision和候选列表修复，可读来源与信任边界保持。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局preview.83保持；E-294/E-364旧真实复杂任务文件SHA和passed=false保持，无付费重跑。未改个人数据库/凭据/工具安装/PATH。旧ultra-cockpit-review-scope-S0wWvh拒绝清理不重试。

沿用granted case / PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理或外部扫描。维护目标池、workitems/timeline/field-journal与证据；三份交接全文SHA一致。仅显式stage本轮文件、skip ci推隔离分支，不合并master/Release。继续源码级加载链收敛，复杂真实任务质量及最终Windows/macOS/Linux统一包未验收，整体goal active。
