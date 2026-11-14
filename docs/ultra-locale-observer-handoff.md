# Gemini Ultra CLI 语言通知隔离与目标重建交接

2026-11-15；WI-234 / E-523至524 / F-192；基线 bda9c2f6c0d6805926f14bc67c080be739cb6af0，分支 codex/ultra-agent-portable。用户清除旧goal后明确“重新列goal，继续”，已重建active目标，未缩小产品范围。源码优先、Windows必要验证、功能收敛后统一最后打包，preview.83保持，不重装/升版/多平台CI/旧付费重跑。

## 当前目标池

1. 启动与加载：收敛卡住、超时、取消和异步生命周期缺陷。
2. 语言与模型：/language中文英文、六档推理去重、模型配置及会话路由可靠。
3. 产品交互：延续下载目录DSH-purge参考、Morphicons及演练台动效，保持可取消和错误恢复。
4. Agent能力：完善Teamwork/Boost/Grill me/Swarm及原生红队、可移植逆向工具链，真实复杂协作质量仍未全面验收。
5. 验收分发：仅必要定向检查，先Windows源码功能；功能收敛后最后Windows/macOS/Linux统一打包。

## Evidence → Finding → Path

F-192：I18nManager.setLocale先成功写盘并更新内存，随后直接遍历listeners；单个listener抛错会让/lang命令和对话框报告“未保存”，尽管磁盘已切换，且后续健康视图漏通知。遍历Set期间新增订阅也会立刻收到同一轮通知，极端情况下可持续扩张。

沿用已有isolateObserver，以原listener→wrapper的Map保留重复订阅和取消语义；出错同步/异步订阅停用，固定双语warning不带原异常，健康订阅按调用前快照依次通知，本轮新增订阅留到下次。磁盘保存与内存更新顺序不改，写入错误仍抛回并保留原语言，不吞保存错误、不改模型/供应商/推理配置。目标路径只涉及core/i18n。

E-523：基线新3场景2实际失败/正常1过；修后5个通知/异步/去重/正常场景通过。第6个写入失败检查最初spy默认fs未命中产品namespace，原记录5过1失败保留；改为真实不可用父路径，只补该用例通过。6不同核心场景+既有LanguageDialog真实写失败后原位重试1通过，共7不同必要检查，无全量冒烟。首lint单行多let拆分后双TS最终零warning；core初最终tsc及3文件最终格式/diff退出0。CLI生产未变，不重编。

E-524：实际编译Windows CLI/ConPTY、独立profile，预加载仅增加一个抛错订阅器/一个健康订阅器、记录原有effort选项并阻断fetch。/language中文成功且偏好zh，/effort中文六档可见；/language en成功且偏好en，英文六档可见；/provider英文菜单正常，/quit退出0。坏订阅只触发一次，健康订阅收到zh/en，无原异常和虚假保存失败，供应商及settings原字节保持。两个locale各6唯一level/label；不是完整ANSI屏幕单元或全UI审计。

终端首轮23226ms，13功能/保全条件true，额外noNetworkOrInference=false导致原result passed=false，SHA c5329fc1d9eaf701a97272e061b016aa1b990b8e4d36853726a6c3a4112e1918保持。原guard无条件reject所有fetch，不调用网络，不能把fetch次数当网络次数。为查来源只补startup→quit观察，20853ms：唯一调用为Yoga内嵌data:application/octet-stream;base64 WebAssembly，stack指向yoga-wasm-base64-esm.js，无外部传输。该probe不证明首轮未记录输入的确切身份；原guard独立证明首轮零transport delegation，不需重跑已通过菜单。record-locale-observer-validation严格核首轮仅该条件false、probe来源/guard实现，改按零实际网络传递条件导出validation passed=true，原false不覆盖。无模型/付费/旧任务重跑，未观察到供应商请求。

## 证据、保全与同步

工程 C:/Users/Administrator/Documents/ChatGPT/gmncliu：locale-observer-baseline.log/-baseline-junit.xml；-tests.log/-junit.xml（5过/写失败spy未命中）；-write-failure-tests.log/-write-failure-junit.xml；-dialog-tests.log/-dialog-junit.xml；-core-compile.log/-final-core-compile.log；-lint.log/-final-lint.log；-format-write.log/-final-format-write.log/-format.log/-final-format.log；observe-source-locale-listener.mjs、verify-source-locale-observer.mjs、source-locale-observer.log/-result.json/-terminal-output.txt；make-locale-startup-observation.mjs、verify-source-locale-startup-observation.mjs、source-locale-startup-observation.log/-result.json/-terminal-output.txt；record-locale-observer-validation.mjs、source-locale-observer-validation.json；verify-locale-observer-preservation.mjs、source-locale-observer-preservation.json。

个人provider/locale/skill-tags精确SHA、ultra-tools不存在、全局83、四份旧真实失败SHA与passed=false及ULQ临时凭据已删均保全true。数据库/PATH/工具安装/旧未跟踪文件/旧被拒清理目录不动。复用granted R26 code-audit case，lead/cae/doc同会话，无Codex子代理。源码/Obsidian/工程交接同SHA，目标池/case追加，显式stage/skip ci推隔离分支，不合并master/Release。

接续：继续模型配置与语言/运行状态一致性，按目标池优先实际使用缺陷；真实复杂任务、最终分发仍待，不把本地故障夹具当实际模型质量通过。goal active。
