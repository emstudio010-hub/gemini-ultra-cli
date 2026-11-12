# Gemini Ultra CLI 技能激活取消与状态顺序交接

日期：2026-11-13。WI-153 / E-359至360 / F-111。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装preview.83保持，无打包、重装、版本变化或跨平台CI。

## 修复

activate_skill原execute忽略abortSignal，在目录读取前就activateSkill并扩展资源目录；因此预取消、读取中取消或目录准备失败仍可能标active。确认回调也不检查原请求是否取消，迟到的永久选择仍可能写标签/规则；对话等待期间注册定义更换或停用也未重新核对。

新增内部withAbortSignal包装不可取消的异步读取等待，预取消不调用operation，取消保留原reason，Promise.race持续接管迟到拒绝并移除监听。目录遍历增加可选signal，每次目录读取/循环检查；共享getFolderStructure保持默认展示诊断行为，仅激活调用显式throwOnError拒绝根目录读失败。多来源技能发现也接信号，取消后不继续下一来源目录。

工具解析/确认/目录缓存/执行均传入原信号。目录结果成功且未取消才缓存，缓存按来源路径区分。注册定义用浅拷贝保存正文/路径快照；确认回调及准备完成后重新核对，已停用/管理设置关闭/注册正文或路径变化均拒绝，避免旧提示激活新定义。确认取消不写标签/规则；延续上一阶段显式永久选择的保存语义。目录准备与检查成功后才扩展资源，最后以规范技能名标active。目录准备失败、预取消、取消等待不再扩展scope或标active，显式重试可用新signal重建准备缓存。

## Evidence → Finding → Path

E-359：5项旧复现全部失败：预取消仍执行、根资源准备拒绝后active已变、等待取消没有及时返回、已取消确认仍保存、建调用后停用仍返回正文。修后6项工具（另加注册正文在确认期间变化）+3项目录取消/严格根错误+4项相关标签once/permanent对照共13通过；2项既有普通目录/不存在目录对照通过，合计15项必要定向，无全量/冒烟。core/CLI严格源码编译及6相关文件eslint退出0，git diff --check通过。

命令：core下npx vitest run src/tools/activateSkillCancellation.test.ts src/tools/activateSkillLibrary.test.ts src/utils/getFolderStructureCancellation.test.ts --coverage.enabled=false；原getFolderStructure.test.ts只按basic folder structure|non-existent directory过滤。根目录依次npx tsc -p packages/core/tsconfig.json、npx tsc -p packages/cli/tsconfig.json。eslint只withAbortSignal.ts、getFolderStructure.ts、其取消测试、activate-skill.ts、其取消测试和skillOrchestrator.ts。首次5项修后加4对照共9通过，中间日志保留；后发现根函数会吞错误转展示字符串，故补显式严格根读取并完成上述最终检查，没有仅靠Mock通过就结束。

E-360：Windows Node v24.19.0实际编译Config/SkillManager/ActivateSkillTool，技能资源目录在workspace外。仅对该目录的原生fs.readdir结果延迟释放或注入EACCES，其他读取和工具逻辑均真实。预取消零目录读；等待期间取消在小于1000ms内返回相同reason，未激活/未扩scope；随后释放真实目录结果仍无迟到状态。EACCES根失败同样保持，显式同调用新signal重试读到取消后新增资源marker，完整正文/规范active与资源可读。已取消确认不能写metadata，注册正文在提示后更换拒绝，目录等待期间setDisabledSkills后拒绝。12条件通过、5712ms、6次原生资源读、验证器退出0、0fetch/模型请求。

验证器没有替换getFolderStructure或工具实现；只在该资源目录fs.readdir边界持有真实结果/注入失败，取消后明确释放并等待，检查无迟到副作用。注册定义变化/停用由真实SkillManager内存操作模拟重载，不是磁盘文件自动监视验收。Config显式addSkills提供无害技能，skillsSupport=false用于关闭不相关自动扫描，未把这当全局功能开关验收。此为编译工具/资源状态链，不是完整终端审批按键或真实模型理解。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：skill-activation-cancel-before.log/-before-junit.xml、skill-activation-cancel-test.log/-junit.xml、skill-activation-cancel-final-test.log/-final-junit.xml、skill-activation-directory-controls.log；skill-activation-cancel-core-compile.log/-cli-compile.log/-lint.log及format日志；verify-source-skill-activation-cancel.mjs、source-skill-activation-cancel-result.json/-final.log。验证器不随包分发。

## 边界与接续

沿用既有R26自有源码scope与同会话lead/cae/doc，无外部安全目标/原生逆向执行。隔离home/workspace/技能/metadata/providers/locale/tools与数据库路径，不安装工具/改PATH。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人skill-tags保持33a88098707f0383b34286ad83d7bc979f48f80441f4569cb1641ccfef89ca10，ultra-tools.json仍不存在。

取消中断等待与后续状态提交，不强杀操作系统在途目录读取；这类读取可能稍后完成，迟到结果被忽略。多来源当前已开始的SkillLoader内部读取可能在后台收尾，但不会由本次发现继续下一来源；未扩张所有文件加载接口。资源scope扩展与active标记仍非通用事务，扩展成功后极晚取消可能保留目录访问，不承诺撤销已明确保存的永久标签或原有active技能。快照检查基于已注册/重新发现定义，不自动监视所有磁盘编辑。缺失技能错误文字尚沿用现有not found描述，完整底层提示双语另列。

继续源码功能与会话/协作收敛，复杂逆向/长会话质量与最终分发仍未整体完成；最后才统一Windows/macOS/Linux包。隔离codex分支skip ci同步，不合并master或正式Release，goal保持active。
