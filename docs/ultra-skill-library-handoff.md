# Gemini Ultra CLI 技能标签库可靠保存交接

日期：2026-11-13。WI-152 / E-357至358 / F-110。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装preview.83保持，无打包、重装、版本变化或跨平台CI。

## 修复

activate_skill原Allow once提示“不写标签库”却实际registerSkillInLibrary并持久化native-passthrough；读取标签库会创建全局config目录，损坏JSON被吞并返回空对象，下一次永久保存可覆盖原内容。非对象/错误字段直接被类型断言当记录使用，原型继承键可能被当成技能项。写入无互斥、备份或临时替换。

拆出skillLibrary.ts，旧skillOrchestrator公共导出保持，删除上一阶段旧any断言边界。缺失文件只读返回空且不创建目录；现存文件使用文件类型/符号链接/1MiB上限、UTF-8和Zod记录结构检查，关键名与技能名对应、拒绝控制/原型保留键，查找仅own property。损坏/错误结构不回退空库，不覆盖；通过新增GEMINI_ULTRA_SKILL_LIBRARY_FILE可隔离运行，默认仍~/.gemini/config/skill-tags.json。

明确永久选择（ProceedAlways/ProceedAlwaysAndSave）才存标签。锁内重读最新记录并合并，1MiB输出上限、唯一临时文件/600权限、原文唯一.bak备份、rename替换，失败清理临时文件和锁，不做direct-write回退；繁忙立即明确拒绝，可显式重试。写入前比对最新字节帮助检测不遵守锁的编辑器修改，不保证消灭最终检查至rename间的所有竞争。

工具把标签当可选元数据：损坏时确认与结果中显示当前语言警告，Allow once仍返回完整技能正文且不写标签；永久保存失败直接抛出安全提示，未继续发布永久policy。已存在旧native-passthrough记录保留，不自动迁移或删除。标签保存不承诺技能本体安装、工具部署或自动执行。

## Evidence → Finding → Path

E-357：首次7项检查因测试默认os导入未命中named homedir mock全在夹具初始化失败，未访问个人标签库；改namespace mock后7项旧实际复现全失败，覆盖读取创建目录、3种损坏/错误结构被覆盖、继承键、缺备份及Allow once写盘。修后这7项先通过，增加繁忙锁/超限、损坏元数据once送达/永久失败不发policy、永久选择保留他项对照，最终12项定向通过。首次core编译为测试index-signature访问错误、lint为控制字符表达式失败；修方括号访问及Unicode控制类别表达式后core/CLI严格编译通过，最终5文件eslint退出0。中间替代字符串spread触发lint的记录保留，未当产品缺陷。最后控制字符表达式调整后再次core编译退出0并据此执行Windows链，没有全量/冒烟或无关模块重验。

命令：packages/core下npx vitest run src/skills/skillLibrary.test.ts src/tools/activateSkillLibrary.test.ts --coverage.enabled=false。根目录依次npx tsc -p packages/core/tsconfig.json、npx tsc -p packages/cli/tsconfig.json，最后npx tsc -p packages/core/tsconfig.json；eslint仅skillLibrary.ts、skillLibrary.test.ts、skillOrchestrator.ts、activate-skill.ts及activateSkillLibrary.test.ts。git diff --check通过。

E-358：Windows Node v24.19.0实际Config.initialize/SkillManager.addSkills及公开ActivateSkillTool的shouldConfirmExecute(signal,ask_user)/onConfirm/execute。一次允许完整正文送达且metadata目录不创建，永久选择真实保存tags。真实只读文件rename失败，原文保持/无tmp和lock；解除只读明确重试合并成功，备份逐字等于前文。损坏文件警告可见、once正文保持、永久选择拒绝且原文未变。第二真实Node进程获得同一锁，父写入小于1000ms拒绝且字节保持；子释放锁后保存child并自然退出0，父显式重试后fixture/recovered/child/parent四项均保持。14条件通过、10999ms、验证器与子进程退出0、0fetch/模型请求，无遗留tmp/lock。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：skill-library-before.log/-before-junit.xml（首夹具失败）、skill-library-reproduced.log/-reproduced-junit.xml（旧真实复现）、skill-library-test.log/-junit.xml、skill-library-final-test.log/-final-junit.xml、core-compile/final-core-compile/final-cli-compile/native-core-compile、lint/final-lint/final2-lint及format日志均以skill-library-为前缀；verify-source-skill-library.mjs、verify-source-skill-library-worker.mjs、source-skill-library-result.json/-final.log。验证器不随包分发。

## 边界与接续

沿用既有reverse-skill R26自有源码scope，同会话lead/cae/doc；本轮无外部安全目标/原生逆向执行。home/workspace/providers/locale/tools/metadata与数据库路径均隔离，不安装工具或改PATH。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人skill-tags SHA核对保持33a88098707f0383b34286ad83d7bc979f48f80441f4569cb1641ccfef89ca10，ultra-tools.json仍不存在。不改个人标签库、数据库或供应商配置。

Windows验证是实际工具确认处理器与真实文件/双进程锁，不是终端审批按键/浏览器视觉、真实模型或最终分发包验收。不承诺掉电持久化、任意编辑器最终竞态或恶意进程同时替换路径的全部情形；拒绝文件本身符号链接，父路径真实锁用于正常路径别名，不把它当通用恶意目录防护。备份明确保留，不自动删除历史备份。损坏元数据不影响一次正文送达，但永久选择仍需恢复配置。

后续继续共享配额语言、更多会话/协作入口和复杂逆向/长会话模型质量，最终才统一Windows/macOS/Linux打包。隔离codex分支同步skip ci，不合并master或正式Release；goal保持active。
