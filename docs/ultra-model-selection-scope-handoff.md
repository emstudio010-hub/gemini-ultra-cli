# Gemini Ultra CLI 模型选择保存范围交接

日期：2026-11-13。WI-147 / E-347至348 / F-105。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装保持preview.83，本轮无打包、重装、版本变化或跨平台CI。

## 修复

ModelDialog默认Remember=false，但原外接模型选择仍调用setActiveSelection，改写ultra-providers.json的活动供应商/默认模型。现移除此共享默认写入；限定模型ID仍由原Config.setModel精确路由。临时切换只作用于当前会话；Remember沿用onModelChange/saveModelChange保存settings.json/model.name。/provider use继续负责显式供应商默认选择。

不声称保存失败恢复已解决：Config.setModel先改live模型、saveModelChange及saveSettings存在吞写入错误的既有边界，另列后续源码工作。此修复只调整保存作用域，不改变环境变量高于保存模型的既有优先级。

## Evidence → Finding → Path

E-347：remember=false/true两项旧复现均因供应商文件变化失败；修后两项加主视图选择/Tab Remember对照共4通过、14跳过。CLI严格类型与源码编译退出0；两个修改文件最终eslint退出0、git diff --check通过。首次lint发现原重复core import，合并后通过；没有全量或冒烟。命令：packages/cli下npx vitest run src/ui/components/ModelDialog.test.tsx -t "keeps provider defaults|sets model and closes|toggles persist mode" --coverage.enabled=false；根目录npx tsc -p packages/cli/tsconfig.json及针对两个文件eslint。

E-348：Windows Node v24.19.0实际编译源码CLI、三个独立ConPTY，真实/model、Down/Enter、Remember Tab及/quit。9条件通过、37415ms、三个产品进程与外层验证器退出0、0HTTP/模型请求。临时first:shared→second:shared不改供应商或settings字节；记住只保存settings.model.name，供应商默认first保持；新进程不带-m读取second:shared。preload仅在真实Config.initialize/setModel完成后观察，不替代行为。

首轮新进程被祖先环境文件覆盖，未当产品失败；第二轮误用未注册--ignore-env参数启动失败；第三轮ignoreLocalEnv只排除普通.env，仍读可信.gemini/.env而发现环境变量存在。最终在隔离workspace写空.gemini/.env阻断祖先发现，三次初始化均environmentModelPresent=false，原优先级不变。以上失败结果/日志保留；仅修验证器环境，不改个人配置。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：model-selection-scope-before.log/-before-junit.xml、model-selection-scope-test.log/-junit.xml、model-selection-scope-source-compile.log、model-selection-scope-lint.log/-final-lint.log及format日志；verify-source-model-selection-scope.mjs、observe-source-model-selection.mjs、source-model-selection-scope-result.json/-final.log、三个-terminal-output.txt及env-override/unsupported-ignore-env/gemini-env-override保留记录。验证器不随包分发。

## 边界与接续

沿用work/gemini-ultra-agent-20261110/scope.md/R26自有源码，lead/cae/doc同会话承担。隔离home、providers、locale、runtime和工作目录；没有改个人配置、数据库、PATH或原生工具。个人locale/provider哈希核对保持4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8 / e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，个人ultra-tools.json仍不存在。

此为Windows源码模型窗口选择/持久化验收，不是真实供应商生成、磁盘故障恢复或最终分发验收。下一步继续源码模型界面语言与保存失败处理，再推进长会话/真实协作质量；最后才统一平台打包。隔离codex分支同步，skip ci，不合并master、不正式Release，goal保持active。
