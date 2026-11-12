# Gemini Ultra CLI 模型窗口语言交接

日期：2026-11-13。WI-148 / E-349至350 / F-106。持续目标active。源码优先、Windows必要定向验证、功能收敛后最终统一打包。全局安装保持preview.83；无打包、重装、版本变化或跨平台CI。

## 修复

ModelDialog原中文模式仍显示Select Model/Remember/Manual和英文操作提示，英文模式外接供应商说明却固定中文。现沿用useLocale订阅，在静态/动态模型列表同步标题、自动/手动选项、外接供应商说明、记住开关、Tab/Esc和启动参数提示。记住状态中文显示开启/关闭，英文保留true/false。手动页Esc按真实行为显示返回；模型ID、供应商名称和协议标识保持原值。用量区标题跟随语言；共享配额行的日期/Resets及服务返回模型元信息本轮未扩张翻译。

## Evidence → Finding → Path

E-349：新增静态/动态两条语言往返场景，旧实现均因英文模式含中文外接说明失败。修后这两条及初始主视图、Remember Tab、临时/记住保存范围对照共6通过、14跳过。语言在已打开组件中往返时Remember保持开启、不自动setModel或改provider；最终Enter仍选原route:shared且persist=false参数正确。所有组件检查使用隔离locale/providers文件。CLI严格源码编译、两修改文件eslint及git diff --check退出0。没有全量/冒烟。

命令：packages/cli下npx vitest run src/ui/components/ModelDialog.test.tsx -t "updates model dialog language|keeps provider defaults|toggles persist mode|renders the initial" --coverage.enabled=false；根目录npx tsc -p packages/cli/tsconfig.json，针对两个文件eslint/prettier。UI路由ui-skills-root选baseline-ui，只复用既有Ink键盘控件与主题，不引入Web组件/新布局或依赖。

E-350：Windows Node v24.19.0实际编译源码CLI，无preload。ConPTY真实/model、Remember Tab、Esc、/language中文、/model/Tab/Esc、/language英文、/model/Esc和/quit；8步骤/10条件通过、17409ms、产品及验证器退出0，零HTTP/模型请求。三窗口标题/说明/提示按当前语言展示、最终英文恢复，provider和settings字节保持，只有明确语言操作保存locale。隔离home与workspace空.gemini/.env，避免祖先环境覆盖。

证据根C:/Users/Administrator/Documents/ChatGPT/gmncliu：model-dialog-locale-before.log/-before-junit.xml、model-dialog-locale-test.log/-junit.xml、model-dialog-locale-source-compile.log、model-dialog-locale-lint.log/-format.log；verify-source-model-dialog-locale.mjs、source-model-dialog-locale-result.json/-final.log/-terminal-output.txt。验证器不随包分发。

## 边界与接续

沿用既有R26自有源码scope，同会话lead/cae/doc。个人配置哈希保持locale 4fcce506592e55074156cab2f5fea35cce0d48ea5f8c919b69cd71ffc735f2c8、provider e0bff750cd1f18458cffc175ad3683d1851bbc58958fb4182dd15d9e128e4332，ultra-tools.json仍不存在。无真实供应商/配额行/保存失败/最终分发或跨平台新验收，不把界面语言检查当模型质量证明。

下一步继续保存失败的真实反馈与状态顺序，随后源码功能收敛、Windows定向验收，最终才统一平台打包。隔离codex分支同步skip ci，不合并master或正式Release；goal active。
