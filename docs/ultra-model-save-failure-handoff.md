# Gemini Ultra CLI 模型偏好保存失败交接

日期：2026-11-13。WI-149 / E-351至352 / F-107。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装仍preview.83；本轮无打包、重装、版本变化或跨平台CI。

## 修复

原Config.setModel先切换live/active模型再调用偏好保存，saveModelChange/saveSettings吞写入错误；底层commentJson还可能在解析错误后返回成功路径。于是/model set --persist可显示persisted，模型窗口关闭，但偏好并未保存；当前会话却已切换。

现在仅模型偏好使用严格保存：LoadedSettings.setValue增加默认关闭的requirePersistence参数，严格时克隆待写设置、拒绝readOnly，写成功后才发布settings/originalSettings与snapshot；saveSettings严格模式抛原写入错误，commentJson严格解析拒绝损坏JSON、数组和null而不覆盖。其他设置调用保持原默认行为。Config在持久化回调成功后才更新live/active模型、发model/quota事件及重置availability；临时选择不调用保存。

模型窗口失败保留选项与Remember、显示当前语言通用提示，允许原位重试或Tab关闭Remember；不输出底层路径/错误细节，不记录成功日志或关闭窗口。/model set失败返回ERROR而无persisted成功信息。另一个持久化调用入口/skills launch捕获同类错误，在保存成功前不移除特殊会话窗口或激活技能。技能窗口预先切换的effort不在此次事务内，不宣称整体技能启动原子性。

## Evidence → Finding → Path

E-351：旧实现1项core复现证明回调抛错后模型已变；2项settings复现证明写失败和只读设置未抛出。修后core 4项通过（含既有临时/相同模型转保存对照），CLI settings/ModelDialog/modelCommand共11项相关通过。继续发现底层解析吞错后补严格通路，最后storage 6项通过，其中2项settings重验、3项实际临时文件损坏/数组/null拒绝及1项原注释保持对照。以上19个不同场景，无全量/冒烟。core与CLI严格源码编译退出0；原10个相关文件eslint退出0，最终4个storage文件eslint退出0；最终git diff --check通过。最后skillsCommand只展开三行格式，编译行为未变，没有因此重复检查。

命令：core下npx vitest run src/config/config.test.ts -t "keeps live model and fallback|onModelChange|persisting a model" --coverage.enabled=false；CLI下分别对settings/ModelDialog/modelCommand按preferred model/saveSettings/save failure/persistence过滤，以及settings/commentJson按preferred model/invalid storage/comments过滤。依次npx tsc -p packages/core/tsconfig.json、npx tsc -p packages/cli/tsconfig.json；底层解析补充后CLI最终编译再次退出0。旧复现、初编译和最终编译日志分别保留。

E-352：Windows Node v24.19.0实际编译源码CLI，两独立ConPTY，共14条件通过、27384ms、两个产品进程及验证器退出0、0HTTP/模型请求。启动后将隔离settings真实设只读：窗口Remember选择second:shared及/model set second:shared --persist均实际EPERM；观察原Config方法抛原错后live/active仍first:shared，settings/provider字节保持且无tmp泄漏。窗口解除只读后原位Enter保存second:shared、注释保持；slash路径仍只读时不带--persist临时切换成功，settings字节保持。供应商默认始终不变。preload仅观察原方法成功/失败及状态，不模拟保存/错误或替代方法行为。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：model-save-core-before.log、model-save-settings-before.log、model-save-core-test.log/-core-junit.xml、model-save-cli-test.log/-cli-junit.xml、model-save-storage-test.log/-storage-junit.xml；core-source-compile、cli-source-compile、cli-final-source-compile、lint、storage-final-lint与format日志均以model-save-为前缀；verify-source-model-save-failure.mjs、observe-source-model-save-failure.mjs、source-model-save-failure-result.json/-final.log、source-model-save-dialog-terminal-output.txt及slash对应输出。验证器不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md的R26自有源码，同会话lead/cae/doc。隔离home/workspace/providers/locale、workspace空.gemini/.env，无外部安全目标/真实供应商或原生逆向任务。个人locale/provider SHA保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，ultra-tools.json仍不存在。

验证覆盖权限拒绝、明确重试/临时恢复及损坏文件保护，不承诺磁盘掉电原子性、同时跨进程修改设置的冲突合并或真实模型质量。继承原commentJson rename失败后的direct-write回退，不把此修复称完整存储事务。/skills launch只做保存失败入口保护及编译核对，没有重跑完整技能会话。共享配额行语言、特殊技能会话六档/输入键及真实复杂协作质量继续列目标池；最后才统一Windows/macOS/Linux打包。隔离codex分支同步skip ci，不合并master或正式Release；goal active。
