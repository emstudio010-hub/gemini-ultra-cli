# Gemini Ultra CLI 技能名称去重交接

日期2026-11-13。WI-195 / E-443至444 / F-152。基线5d231664bca2392ee1970761a567f377d25b2aba，分支codex/ultra-agent-portable。上一阶段有源码/验证/提交进展，整体goal active。继续源码优先、Windows必要定向验证、最后统一打包；无打包/重装/升版本/多平台CI/旧付费任务重跑，安装preview.83保持。

## 源码

SkillManager查找与禁用名称已经toLowerCase，但合并Map与activeSkillNames区分大小写。Writer/writer因此重复显示，并且大小写别名激活状态不一致。merge键及activate/isActive统一toLowerCase，保留胜出SkillDefinition的原name/body/location，顺序和来源优先级不改，不新增模糊匹配或trim/Unicode归一化。writer-tools仍是独立名称；workspace trust保持。

去掉原未使用silentConflicts参数及对应true实参（其原本不控制任何行为）；prettier仅整理既有长行。本轮没有解决发现期间的清空/并发刷新归属，也没有新增技能读取缓存或声称启动加速。

## E-443 源码定向

skillNameIdentity.test.ts旧2项实际失败：merge出现3项非2、activate大小写别名无法识别。修后2通过；既有skillManager.test.ts9通过/1原skipped，合计11实际通过、1原跳过。首次旧测试4失败是读取175个个人额外技能根导致数量污染：记录unisolated log/JUnit后仅在测试mock getMultiSourceSkillDirs为空，保留其余真实文件夹具，不改产品扫描规则。未修改个人技能。原冲突UI警告测试已skipped，本轮未新跳过或更改其合同。

core/CLI严格tsc、3修改/新增文件eslint --max-warnings 0与prettier --check、git diff --check最终退出0。首lint发现既有silentConflicts未用并删除，旧log最终覆盖为通过。未跑全量/冒烟。

## E-444 Windows实际发现与命令生成

Node v24.19.0，独立home/profile/workspace，真实SKILL.md四目录user/user-agent/project/project-agent及一个extension定义，大小写不同同名；编译SkillManager.loadSkillsFromDir与真实SkillCommandLoader。未信任时胜出user-agent，信任时胜出project-agent，完整body/name保持、仅一个同名结果/命令，action只生成toolArgs含胜出原始WrItEr和用户task，不执行。激活别名一致、disable/re-enable/reset与独立名称匹配正确，夹具文件原字节保持。

10条件true，5153ms/退出0，无外部/模型/付费，临时根finally清理成功。这是名称身份及优先级验证，不是模型技能质量、ConPTY、启动挂钟基准或最终包验收。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：
- skill-name-identity-before-test.log/-before-junit.xml（2旧失败）；-unisolated-test.log/-unisolated-junit.xml（旧测试个人根污染）；-test.log/-junit.xml（11通过/1旧skipped）。
- skill-name-identity-core-compile.log、-cli-compile.log、-lint.log、-format.log、-format-check.log。
- verify-source-skill-name-identity.mjs、source-skill-name-identity.log/-result.json；verify-skill-name-identity-preservation.mjs、source-skill-name-identity-preservation.json。

F-152 -> skillManager合并/激活名称身份与查找/禁用不一致。统一大小写身份修复重复菜单/错误激活，原命令工具名称及来源优先级保持。

## 保全与接续

preservation passed=true：个人provider/locale/skill-tags精确SHA保持、ultra-tools.json不存在、preview.83；E-294/E-364旧真实复杂任务SHA/false保持，无覆盖或付费重跑。不改个人数据库/凭据/工具安装/PATH。先前被拒清理的ultra-cockpit-review-scope-S0wWvh不重试删除。

沿用granted case/PRIMARY R26 code-audit，lead/cae/doc同会话，无Codex子代理/外部扫描。维护目标池/case四项，三份全文SHA一致，显式stage本轮文件、skip ci推codex隔离分支，不合并master/Release。继续源码收敛；复杂真实任务质量、更多模型和最终Windows/macOS/Linux统一包仍待，整体goal active。
