/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { cockpitTranslations } from './cockpitLocale.js';

export function cockpitHtml(nonce: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>演练台 · Gemini Ultra CLI</title>
<style nonce="${nonce}">
:root{color-scheme:light;font-family:system-ui,"Microsoft YaHei",sans-serif;color:#202522;background:#f3f4ef}
[hidden]{display:none!important}*{box-sizing:border-box}body{max-width:1220px;margin:auto;padding:32px 24px}header{display:flex;justify-content:space-between;gap:24px;align-items:center;margin-bottom:28px}
h1{font-size:28px;margin:0 0 8px}h2{font-size:18px;margin:0 0 18px}h3{font-size:15px;margin:24px 0 12px}p{line-height:1.6;margin:8px 0;color:#536059}.layout{display:grid;grid-template-columns:minmax(280px,390px) minmax(0,1fr);gap:20px;align-items:start}
section{padding:24px;border:1px solid #d6dcd4;background:#fff;border-radius:12px;margin-bottom:20px}label{display:block;font-size:14px;font-weight:600;margin:16px 0 8px}
input,select,textarea,button{font:inherit}select,textarea{width:100%;border:1px solid #9ba99e;border-radius:6px;padding:10px;background:#fff;color:#202522}textarea{resize:vertical;min-height:180px;line-height:1.6}
nav{margin-bottom:20px}fieldset{border:1px solid #d6dcd4;border-radius:6px;margin:16px 0;padding:16px}input[type=text]{width:100%;border:1px solid #9ba99e;border-radius:6px;padding:10px}a{color:#246144}footer{padding-bottom:20px}
button{border:1px solid #8a9b8e;background:#fff;color:#202522;padding:9px 14px;border-radius:6px;cursor:pointer}button.primary{background:#246144;border-color:#246144;color:#fff;width:100%;margin-top:12px}
button:hover{filter:brightness(.95)}button:disabled{opacity:.6;cursor:wait}button:focus-visible,select:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid #246144;outline-offset:3px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.toggle{display:flex;gap:10px;align-items:center;font-weight:400}.toggle input{width:18px;height:18px;accent-color:#246144}.subtle{font-size:13px}.status{padding:10px 14px;border:1px solid #b7c8ba;border-radius:6px;font-size:13px;max-width:480px;white-space:pre-wrap}
#feedback{min-height:48px;white-space:pre-wrap;font-size:14px}#native-task-selection{overflow-wrap:anywhere}#native-task-detail p{overflow-wrap:anywhere}#native-task-detail h4{margin:18px 0 6px;font-size:14px}#tool-path-feedback,#tool-path-file{overflow-wrap:anywhere;white-space:pre-wrap}table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}th,td{text-align:left;border-bottom:1px solid #dce1da;padding:10px 8px;vertical-align:top;overflow-wrap:anywhere}th{color:#536059;font-weight:500}td{font-variant-numeric:tabular-nums}details{margin-top:8px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 ui-monospace,monospace}.empty{padding:16px 0;color:#536059;font-size:14px}
@media(max-width:800px){body{padding:20px 14px}.layout{grid-template-columns:1fr}header{align-items:flex-start;flex-direction:column}section{padding:18px}}
.icon{width:19px;height:19px;flex:none;vertical-align:middle;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}button{display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform 140ms ease-out,opacity 140ms ease-out}button:active{transform:scale(.98)}button[aria-pressed=true]{background:#246144;color:#fff;border-color:#246144}.session-head{display:flex;gap:16px;align-items:center}.effort-art{width:62px;height:62px;flex:none;position:relative;display:grid;place-items:center;color:#246144}.effort-art svg{width:30px;height:30px}.orbit{position:absolute;inset:5px;border:1px solid #7d9b87;border-radius:50%;transform:rotate(-25deg) scaleY(.55);opacity:.6}.orbit.second{transform:rotate(45deg) scaleY(.55)}.effort-art.awaken .orbit{animation:orbit-arrive 650ms ease-out both}.effort-art.awaken .second{animation-delay:50ms}#effort-title{font-size:22px;font-weight:650;color:#246144}#effort-description{margin:4px 0;max-width:46ch}.status{border:0;padding:0;margin-top:6px;font-size:12px}#locale{width:auto;padding:7px 12px}.runtime-grid{display:grid;grid-template-columns:1fr 90px;gap:12px}#parallel{width:100%;padding:10px;border:1px solid #9ba99e;border-radius:6px}#agent-tasks td:first-child{font-weight:600}details summary{cursor:pointer;padding:8px 0;font-weight:600}details[open]{margin-top:16px}input[type=password],input[type=url],#provider-limits input{width:100%;padding:10px;border:1px solid #9ba99e;border-radius:6px}input{color:inherit;background:#fff}#provider-feedback{white-space:pre-wrap}::selection{background:#c9e1d0;color:#143622}textarea,input{caret-color:#246144}a{text-underline-offset:3px}
@keyframes orbit-arrive{from{transform:rotate(-110deg) scaleY(.55);opacity:.2}to{transform:rotate(-25deg) scaleY(.55);opacity:.65}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
</style></head><body>
<header><div><h1>演练台</h1><p>Gemini Ultra CLI · 当前会话控制中心</p></div><div class="session-head"><div id="effort-art" class="effort-art" aria-hidden="true"><span class="orbit"></span><span class="orbit second"></span><svg viewBox="0 0 24 24" class="icon"><path id="effort-path" d="M12 3L14.7 9.3L21 12L14.7 14.7L12 21L9.3 14.7L3 12L9.3 9.3Z"></path></svg></div><div><div id="effort-title">…</div><p id="effort-description" class="subtle"></p><div id="state" class="status" role="status">正在连接 CLI…</div></div></div><div><label for="locale" class="subtle">界面语言</label><select id="locale" aria-describedby="locale-feedback"><option value="zh">中文</option><option value="en">English</option></select><p id="locale-feedback" class="subtle" role="status" aria-live="polite"></p></div></header>
<nav class="row" aria-label="控制中心页面"><button id="show-config" type="button" aria-pressed="true">提示词与规则</button><button id="show-drill" type="button" aria-pressed="false">演练台</button></nav>
<div id="configuration"><section aria-labelledby="config-title"><h2 id="config-title">提示词与规则</h2>
<p class="subtle">参考 dsh-purge 的提示词与规则集管理。保留 Gemini 原生系统提示，在后续主会话与子代理请求中追加已启用的内容。</p>
<form id="prompts"><label class="toggle"><input id="prompt-enabled" type="checkbox" checked>启用自定义提示词与规则</label>
<label for="system-prompt">自定义提示词</label><textarea id="system-prompt" aria-describedby="config-feedback" placeholder="填写角色、写作风格、编码习惯或项目要求…"></textarea>
<h3>规则集</h3><div id="rules"></div><button id="add-rule" type="button">添加规则</button><button class="primary" type="submit">保存并应用到后续请求</button></form>
<p id="config-feedback" role="status" aria-live="polite"></p><p id="config-path" class="subtle"></p></section><section aria-labelledby="providers-title"><h2 id="providers-title">模型供应商配置</h2><label for="provider-edit">选择配置</label><select id="provider-edit"><option value="">新增供应商</option></select><form id="provider-form"><label for="provider-name">名称</label><input id="provider-name" type="text" maxlength="64" required><label for="provider-url">端点地址</label><input id="provider-url" type="url" required placeholder="https://api.example.com/v1"><label for="provider-protocol">通信协议</label><select id="provider-protocol"><option value="openai-chat">OpenAI Chat</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic">Anthropic Messages</option><option value="gemini">Gemini</option></select><label for="provider-key">密钥</label><input id="provider-key" type="password" autocomplete="new-password" placeholder="留空保留已有密钥"><label for="provider-models">模型名称</label><textarea id="provider-models" aria-describedby="provider-models-help provider-feedback"></textarea><p id="provider-models-help" class="subtle">多个模型用逗号或换行分隔。新增时首个为默认模型，编辑时保留仍可用的默认模型。</p><details id="provider-limits"><summary>生成与上下文设置</summary><p id="provider-limits-help" class="subtle">填写正整数 Token 数。留空清除供应商覆盖；任务自己的输出上限优先。容量应适用于此供应商的所有模型，不能超过实际支持范围。</p><label for="provider-output-limit">输出上限</label><input id="provider-output-limit" type="number" min="1" step="1" max="9007199254740991" placeholder="留空使用默认值" aria-describedby="provider-limits-help provider-feedback"><label for="provider-context-window">上下文容量</label><input id="provider-context-window" type="number" min="1" step="1" max="9007199254740991" placeholder="留空使用默认值" aria-describedby="provider-limits-help provider-feedback"></details><div class="row"><button id="fetch-models" type="button">获取模型清单</button><button type="submit">保存供应商</button></div></form><p id="provider-feedback" role="status" aria-live="polite"></p></section></div>
<div id="drill" hidden><div class="layout"><div>
<section aria-labelledby="task-title"><h2 id="task-title">提交任务</h2>
<label for="preset">快捷任务</label><select id="preset"><option value="">选择一个起点</option><option value="writing">AI 写作</option><option value="coding">深度编码</option><option value="audit">源码审阅</option><option value="binary">本地样本分析</option></select>
<form id="task"><label for="prompt">目标与要求</label><textarea id="prompt" required aria-describedby="prompt-help feedback" placeholder="描述目标、文件路径和完成要求…"></textarea>
<p id="prompt-help" class="subtle">任务进入当前 CLI 对话，执行过程和审批在终端查看。</p><button class="primary" id="submit" type="submit">发送到当前会话</button></form>
<p id="feedback" role="status" aria-live="polite"></p></section>
<section aria-labelledby="settings-title"><h2 id="settings-title">会话设置</h2>
<label for="model">供应商 / 模型</label><select id="model"><option value="">当前通道</option></select>
<label for="effort">推理强度</label><select id="effort">${['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map((v) => `<option value="${v}">${v}</option>`).join('')}</select>
<p class="subtle">实际推理预算取决于模型和端点支持。</p>
<label class="toggle"><input id="bypass" type="checkbox">Bypass · 免人工审批</label>
<label class="toggle"><input id="grant" type="checkbox">演练授权记录</label>
<p class="subtle" id="scope"></p></section></div>
<div><section aria-labelledby="collaboration-title"><h2 id="collaboration-title">多代理协作</h2><div class="runtime-grid"><div><label for="collaboration">协作方式</label><select id="collaboration"><option value="auto">按任务自动判断</option><option value="single">单代理</option><option value="team">多代理协作</option></select></div><div><label for="parallel">并发上限</label><input id="parallel" type="number" min="1" max="8" value="3"></div></div><label for="workflow">工作流</label><select id="workflow"><option value="general">通用写作与编码</option><option value="redteam">授权红队分析</option></select><p class="subtle">独立任务并行，依赖任务顺序执行。超出并发上限的任务自动排队。</p><div id="agent-tasks"></div></section><section aria-labelledby="facts-title"><h2 id="facts-title">当前会话的事实与工件</h2><p class="subtle">每 4 秒同步，最多显示 50 条。使用 CLI 工具记录后将在此出现。</p><div id="facts"></div>
<h3>补丁事务</h3><div id="patches"></div></section>
<section aria-labelledby="native-tasks-title"><h2 id="native-tasks-title">原生 Agent 任务</h2><p class="subtle">读取当前项目的 Teamwork、Boost、Grill me 和 Swarm。选择任务查看进度，打开演练台时每4秒更新所选详情；目录按需刷新。</p><button id="native-tasks-load" type="button">读取项目任务</button><p id="native-tasks-feedback" role="status" aria-live="polite"></p><div id="native-tasks-list"></div><div class="row"><button id="native-tasks-prev" type="button" hidden>上一页</button><span id="native-tasks-page" class="subtle"></span><button id="native-tasks-next" type="button" hidden>下一页</button></div><div id="native-task-detail" hidden></div></section>
<section aria-labelledby="tools-title"><div class="row"><h2 id="tools-title">本机工具链</h2><button id="preflight" type="button">查看就绪状态</button></div><p class="subtle">仅检查本机工具是否可用。</p><div id="tools" aria-live="polite"></div>
<details id="tool-path-editor"><summary>配置工具路径</summary><p id="tool-path-help" class="subtle">填写这台电脑上的可执行文件完整路径。保存后跨终端生效，不会安装或运行工具。环境变量优先；Java还优先使用JAVA_HOME。</p>
<form id="tool-path-form"><fieldset id="tool-path-fields" disabled><label for="tool-path-name">工具名称</label><select id="tool-path-name" aria-describedby="tool-path-help"></select><label for="tool-path-value">可执行文件路径</label><input id="tool-path-value" type="text" maxlength="32768" spellcheck="false" aria-describedby="tool-path-help tool-path-feedback" placeholder="粘贴完整路径，无需引号"><div class="row"><button id="tool-path-save" type="submit">保存路径</button><button id="tool-path-reset" type="button">清除保存路径</button></div></fieldset></form><button id="tool-path-reload" type="button">重新读取路径</button><p id="tool-path-feedback" role="status" aria-live="polite"></p><p id="tool-path-file" class="subtle"></p></details>
</section><section aria-labelledby="skills-title"><div class="row"><h2 id="skills-title">当前技能目录</h2><button id="skills-button" type="button">查看已发现的技能</button></div><div id="skills"></div></section></div></div></div>
<footer class="subtle">功能结构参考 <a href="https://github.com/YuJunZhiXue/dsh-purge" target="_blank" rel="noopener noreferrer">YuJunZhiXue/dsh-purge 1.1.71</a> · Gemini Ultra CLI 原生实现 · <a href="https://www.morphicons.com" target="_blank" rel="noopener noreferrer">Morphicons 2.0.2 · MIT</a></footer>
<script src="/assets/morphicons.js" nonce="${nonce}"></script>
<script nonce="${nonce}">
const $ = id => document.getElementById(id);
const translations=${JSON.stringify(cockpitTranslations)};
let locale='zh';
const t=(zh,en)=>locale==='zh'?zh:en;
const staticText=[];
const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(walker.nextNode()){const node=walker.currentNode;if(node.parentElement?.closest('script,style'))continue;const text=node.textContent.trim();if(translations[text])staticText.push({node,zh:node.textContent,en:node.textContent.replace(text,translations[text])});}
const placeholders=Array.from(document.querySelectorAll('[placeholder]')).map(node=>({node,zh:node.placeholder,en:translations[node.placeholder]||node.placeholder}));
function applyLocale(next){const changed=locale!==next;locale=next;document.documentElement.lang=next==='zh'?'zh-CN':'en';document.title=t('演练台 · Gemini Ultra CLI','Drill cockpit · Gemini Ultra CLI');for(let index=staticText.length-1;index>=0;index--){const item=staticText[index];if(!item.node.isConnected){staticText.splice(index,1);continue;}item.node.textContent=item[next];}placeholders.forEach(item=>{item.node.placeholder=item[next];});$('locale').value=next;if(changed)refreshLocaleViews();}
function localizedText(zh,en){const node=document.createTextNode(t(zh,en));staticText.push({node,zh,en});return node;}
const shapes={plus:'M12 4V20M4 12H20',check:'M4 12L9 17L20 6',send:'M3 3L21 12L3 21L6 12L3 3ZM6 12H21',busy:'M12 3A9 9 0 1 0 21 12',rules:'M5 5H19V19H5ZM8 9H16M8 13H16',grid:'M3 3H10V10H3ZM14 3H21V10H14ZM3 14H10V21H3ZM14 14H21V21H14Z',star:'M12 3L14.7 9.3L21 12L14.7 14.7L12 21L9.3 14.7L3 12L9.3 9.3Z',spark:'M12 2V7M12 17V22M2 12H7M17 12H22M5 5L8 8M16 16L19 19M5 19L8 16M16 8L19 5'};
const morphs=[];
function icon(button,shape){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','icon');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',shapes[shape]);svg.append(path);button.prepend(svg);if(!globalThis.Morphicons)return {set:()=>{},morphTo:()=>{}};const driver=Morphicons.createMorph(path,shapes[shape],{reducedMotion:'user'});morphs.push(driver);return driver;}
icon($('show-config'),'rules');icon($('show-drill'),'grid');icon($('add-rule'),'plus');
const sendIcon=icon($('submit'),'send');const toolsIcon=icon($('preflight'),'spark');
const effortIcon=globalThis.Morphicons?Morphicons.createMorph($('effort-path'),shapes.star,{reducedMotion:'user'}):null;
if(effortIcon)morphs.push(effortIcon);
document.addEventListener('visibilitychange',()=>{if(document.hidden)morphs.forEach(m=>{m.progress=1;});});
addEventListener('pagehide',()=>morphs.forEach(m=>m.destroy?.()),{once:true});
const tokenKey = 'drill-token';
const token = location.hash.slice(1) || sessionStorage.getItem(tokenKey) || '';
if (location.hash) { sessionStorage.setItem(tokenKey, token); history.replaceState(null, '', location.pathname); }
let statusRequest;
let modelSignature = '';
let providers=[];let runtime={collaboration:'auto',maxParallel:3,workflow:'general'};let lastEffort='';let lastTaskSignature='';
function showPage(page) {
  $('configuration').hidden=page!=='config';$('drill').hidden=page!=='drill';
  $('show-config').setAttribute('aria-pressed',String(page==='config'));$('show-drill').setAttribute('aria-pressed',String(page==='drill'));
}
$('show-config').onclick=()=>showPage('config');$('show-drill').onclick=()=>showPage('drill');
function addRule(rule={id:crypto.randomUUID(),name:t('新规则','New rule'),enabled:true,content:''}) {
  const fieldset=document.createElement('fieldset');fieldset.dataset.ruleId=rule.id;
  const legend=document.createElement('legend');legend.append(localizedText('规则','Rule'));fieldset.append(legend);
  const nameLabel=document.createElement('label'),name=document.createElement('input');name.type='text';name.required=true;name.maxLength=64;name.value=rule.name;name.dataset.field='name';nameLabel.append(localizedText('规则名称 ','Rule name '),name);fieldset.append(nameLabel);
  const toggleLabel=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=rule.enabled;toggle.dataset.field='enabled';toggleLabel.append(toggle,localizedText(' 启用此规则',' Enable rule'));fieldset.append(toggleLabel);
  const contentLabel=document.createElement('label'),content=document.createElement('textarea');content.value=rule.content;content.dataset.field='content';contentLabel.append(localizedText('规则正文','Rule content'),content);fieldset.append(contentLabel);
  const remove=document.createElement('button');remove.type='button';remove.append(localizedText('移除此规则','Remove rule'));remove.onclick=()=>{fieldset.remove();$('add-rule').focus();};fieldset.append(remove);$('rules').append(fieldset);
}
$('add-rule').onclick=()=>addRule();
let promptConfigPath='';
function renderPromptConfigPath(){if(promptConfigPath)$('config-path').textContent=t('保存位置：','Saved at: ')+promptConfigPath+t('；上次保存内容保留在 .bak 文件。','; the previous version is kept in a .bak file.');}
async function loadPrompts() {
  try {const data=await api('prompts');$('prompt-enabled').checked=data.config.enabled;$('system-prompt').value=data.config.prompt;$('rules').replaceChildren();data.config.rules.forEach(addRule);promptConfigPath=data.path;renderPromptConfigPath();}
  catch(error){$('config-feedback').textContent=error.message;}
}
$('prompts').onsubmit=async event=>{
  event.preventDefault();
  const rules=Array.from($('rules').children).map(row=>({id:row.dataset.ruleId,name:row.querySelector('[data-field="name"]').value,enabled:row.querySelector('[data-field="enabled"]').checked,content:row.querySelector('[data-field="content"]').value}));
  try {const result=await api('prompts',{config:{enabled:$('prompt-enabled').checked,prompt:$('system-prompt').value,rules}});$('config-feedback').textContent=result.message;}
  catch(error){$('config-feedback').textContent=error.message;}
};
async function api(path, body, signal) {
  const timeout=AbortSignal.timeout(12000);
  const response = await fetch('/api/' + path, {method:body ? 'POST':'GET', signal:signal?AbortSignal.any([signal,timeout]):timeout,headers:{'X-Drill-Token':token,'Content-Type':'application/json'},body:body ? JSON.stringify(body):undefined});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '请求失败。');
  return data;
}
function table(target, headings, rows) {
  const node = $(target); node.replaceChildren();
  if (!rows.length) { const p=document.createElement('p');p.className='empty';p.textContent=t('暂无记录。提交任务后将在这里显示。','No entries yet. Submit a task to get started.');node.append(p);return; }
  const tableElement=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
  headings.forEach(text=>{const th=document.createElement('th');th.scope='col';th.textContent=text;tr.append(th);});head.append(tr);tableElement.append(head);
  const body=document.createElement('tbody');rows.forEach(row=>{const tr=document.createElement('tr');row.forEach(text=>{const td=document.createElement('td');td.textContent=String(text ?? '—');tr.append(td);});body.append(tr);});tableElement.append(body);node.append(tableElement);
}
async function refresh(force=false) {
  if(statusRequest){await statusRequest;if(!force)return;}
  if(statusRequest)return statusRequest;
  statusRequest=(async()=>{
  try {
    const s=await api('status');
    applyLocale(s.locale||'zh');
    providers=s.providers;
    runtime=s.runtime||runtime;
    const effortOptions=s.effortOptions||[];
    const effort=effortOptions.find(o=>o.level===s.effort);
    $('effort-title').textContent=effort?.label||s.effort;
    $('effort-description').textContent=effort?.description||'';
    $('state').textContent=(s.ready?t('就绪','Ready'):t('执行中 / 等待终端确认','Running / awaiting terminal approval'))+' · '+s.activeModel;
    if(lastEffort!==s.effort){lastEffort=s.effort;effortIcon?.morphTo(['max','ultra'].includes(s.effort)?shapes.spark:shapes.star,'smooth');$('effort-art').classList.remove('awaken');requestAnimationFrame(()=>{if(!document.hidden)$('effort-art').classList.add('awaken');});}
    $('submit').disabled=!s.ready;
    sendIcon.morphTo(s.ready?shapes.send:shapes.busy);
    const signature=JSON.stringify([locale,s.providers]);
    if (signature!==modelSignature) {
      modelSignature=signature;$('model').replaceChildren();
      const option=document.createElement('option');option.value='';option.textContent=t('当前通道（在 CLI 中切换原生模型）','Native channel (select in CLI)');$('model').append(option);
      s.providers.forEach(p=>p.models.forEach(model=>{const o=document.createElement('option');o.value=JSON.stringify([p.id,model]);o.textContent=p.name+' / '+model;$('model').append(o);}));
      const selected=$('provider-edit').value;$('provider-edit').replaceChildren();const add=document.createElement('option');add.value='';add.textContent=t('新增供应商','Add provider');$('provider-edit').append(add);s.providers.forEach(p=>{const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('provider-edit').append(option);});$('provider-edit').value=selected;
    }
    $('model').value=s.activeProviderId?JSON.stringify([s.activeProviderId,s.activeModel]):'';
    $('effort').replaceChildren(...effortOptions.map(option=>{const item=document.createElement('option');item.value=option.level;item.textContent=option.label;return item;}));
    $('effort').value=s.effort;$('bypass').checked=s.bypass;$('grant').checked=s.grant.granted;
    if(document.activeElement!==$('collaboration'))$('collaboration').value=runtime.collaboration;if(document.activeElement!==$('parallel'))$('parallel').value=runtime.maxParallel;if(document.activeElement!==$('workflow'))$('workflow').value=runtime.workflow;
    $('scope').textContent=t('授权网段：','Authorized network scope: ')+(s.grant.allowedNetScope||[]).join(', ');
    table('facts',t(['类型 / 状态','标题 / 路径','证据'],['Type / status','Title / path','Evidence']),s.facts.map(f=>[f.factType+(f.severity?' · '+f.severity:'')+(f.factType==='vuln'?' · '+findingStatus(f.status):''),f.title||f.sample_path,f.sha256?f.sha256+' · '+t('熵 ','entropy ')+f.entropy:([f.evidence,f.content].filter(Boolean).join(' · ')||f.status)]));
    table('patches',t(['目标 / 状态','备份 / 修改副本','Diff / 回滚脚本'],['Target / status','Backup / modified','Diff / rollback']),s.patches.map(p=>[p.original_path+' · '+p.status,p.backup_path+'\\n'+p.modified_path,p.diff_path+'\\n'+p.rollback_script]));
    const states={queued:t('排队','Queued'),running:t('运行中','Running'),completed:t('完成','Completed'),failed:t('失败','Failed'),cancelled:t('已取消','Cancelled')};
    const taskSignature=JSON.stringify([locale,s.collaborationTasks]);if(taskSignature!==lastTaskSignature){lastTaskSignature=taskSignature;table('agent-tasks',t(['代理','状态','结果'],['Agent','State','Result']),(s.collaborationTasks||[]).slice(-20).reverse().map(task=>[task.agent,states[task.status]||task.status,task.error||task.finishedAt||task.startedAt||'—']));}
  } catch(error) { $('state').textContent=error.message;$('submit').disabled=true; }
  finally { statusRequest=undefined; }
  })();
  return statusRequest;
}
async function setting(action,value,extra={}) {
  try { const result=await api('settings',{action,value,...extra});$('feedback').textContent=result.message; }
  catch(error) { $('feedback').textContent=error.message; }
  await refresh();
}
$('effort').onchange=()=>setting('effort',$('effort').value);
$('locale').onchange=async()=>{const control=$('locale');control.disabled=true;$('locale-feedback').textContent=t('正在保存语言…','Saving language…');try{const result=await api('settings',{action:'language',value:control.value});await refresh();$('locale-feedback').textContent=result.message;}catch(error){control.value=locale;$('locale-feedback').textContent=t('语言未保存：','Language not saved: ')+error.message;}finally{control.disabled=false;}};
function saveRuntime(){return setting('runtime',{collaboration:$('collaboration').value,maxParallel:Number($('parallel').value),workflow:$('workflow').value});}
$('collaboration').onchange=saveRuntime;$('parallel').onchange=saveRuntime;$('workflow').onchange=saveRuntime;
$('bypass').onchange=()=>setting('bypass',$('bypass').checked);
$('grant').onchange=()=>setting('grant',$('grant').checked);
$('model').onchange=()=>{if(!$('model').value)return;const [providerId,model]=JSON.parse($('model').value);void setting('model',null,{providerId,model});};
let providerRevision=0;let providerEditId='';let providerEditRevision;let providerCatalogController;let providerSaving=false;
function invalidateProviderEditor(){providerRevision++;providerCatalogController?.abort();providerCatalogController=undefined;$('fetch-models').disabled=false;$('provider-feedback').textContent='';}
$('provider-form').addEventListener('input',invalidateProviderEditor);$('provider-form').addEventListener('change',invalidateProviderEditor);
$('provider-edit').onchange=()=>{invalidateProviderEditor();providerEditId=$('provider-edit').value;const p=providers.find(p=>p.id===providerEditId);providerEditRevision=p?.revision;$('provider-name').value=p?.name||'';$('provider-url').value=p?.baseUrl||'';$('provider-protocol').value=p?.protocol||'openai-chat';$('provider-key').value='';$('provider-models').value=(p?.models||[]).join(', ');$('provider-output-limit').value=p?.maxOutputTokens??'';$('provider-context-window').value=p?.contextWindow??'';};
function providerTokenLimit(id){const value=$(id).value.trim();if(!value)return null;const limit=Number(value);if(!Number.isSafeInteger(limit)||limit<1)throw new Error(t('Token 数必须是正整数。','Token counts must be positive integers.'));return limit;}
function providerInput(){return {id:providerEditId||undefined,revision:providerEditRevision,name:$('provider-name').value.trim(),baseUrl:$('provider-url').value.trim(),apiKey:$('provider-key').value,maxOutputTokens:providerTokenLimit('provider-output-limit'),contextWindow:providerTokenLimit('provider-context-window'),protocol:$('provider-protocol').value,models:$('provider-models').value.split(/[,\\s]+/).filter(Boolean)};}
$('fetch-models').onclick=async()=>{invalidateProviderEditor();const revision=providerRevision,controller=new AbortController();providerCatalogController=controller;const button=$('fetch-models');button.disabled=true;$('provider-feedback').textContent=t('加载中…','Loading…');try{const result=await api('provider-models',providerInput(),controller.signal);if(revision!==providerRevision||controller.signal.aborted)return;if(result.models.length){$('provider-models').value=result.models.join(', ');providerRevision++;}$('provider-feedback').textContent=result.error||t('模型清单已加载，可编辑后保存。','Catalog loaded. Edit your selection, then save.');}catch(error){if(revision===providerRevision&&!controller.signal.aborted)$('provider-feedback').textContent=error.message;}finally{if(providerCatalogController===controller){providerCatalogController=undefined;button.disabled=false;}}};
$('provider-form').onsubmit=async event=>{event.preventDefault();if(providerSaving)return;invalidateProviderEditor();const revision=providerRevision,button=$('provider-form').querySelector('[type=submit]');providerSaving=true;button.disabled=true;try{const result=await api('providers',providerInput());modelSignature='';await refresh(true);if(revision!==providerRevision)return;$('provider-key').value='';$('provider-edit').value=result.id;providerEditId=result.id;providerEditRevision=result.revision;$('provider-feedback').textContent=result.message;}catch(error){if(revision===providerRevision)$('provider-feedback').textContent=error.message;}finally{providerSaving=false;button.disabled=false;}};
const presets={writing:'请帮助完成以下写作任务：\\n主题：\\n读者与用途：\\n篇幅与风格：\\n先梳理结构，再输出可直接使用的正文；不编造来源。',coding:'请完成以下编码任务：\\n项目路径：\\n目标：\\n约束：尽量简洁，先阅读相关代码，再直接实施。只运行与改动直接相关的必要检查，不做额外冒烟测试。',audit:'请审阅以下本地源码，重点找出可复现的实际缺陷并修复：\\n路径：\\n范围：',binary:'请分析以下已获授权的本地样本，记录观察依据与不确定项：\\n文件路径：\\n目标：'};
const englishPresets={writing:'Complete this writing task.\\nTopic:\\nAudience and purpose:\\nLength and style:\\nOutline the structure, then produce usable prose. Do not invent sources.',coding:'Complete this coding task.\\nProject path:\\nGoal:\\nConstraints: Keep it concise. Read relevant code, then implement. Run only necessary checks related to the change.',audit:'Review authorized local source and fix concrete, reproducible defects.\\nPath:\\nScope:',binary:'Analyze this authorized local sample and record evidence and uncertainties.\\nFile path:\\nGoal:'};
$('preset').onchange=()=>{const template=(locale==='zh'?presets:englishPresets)[$('preset').value];if(template){$('prompt').value=template;$('prompt').focus();}};
$('task').onsubmit=async event=>{
  event.preventDefault();$('submit').disabled=true;$('prompt').removeAttribute('aria-invalid');
  try {const result=await api('prompt',{prompt:$('prompt').value});$('feedback').textContent=result.message;}
  catch(error){$('feedback').textContent=error.message;$('prompt').setAttribute('aria-invalid','true');}
  await refresh();
};
let toolPathData;let toolPathsBusy=false;let toolPathRevision=0;
function showToolPathData(data){toolPathData=data;const selected=$('tool-path-name').value;$('tool-path-name').replaceChildren(...data.tools.map(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;return option;}));if(data.tools.includes(selected))$('tool-path-name').value=selected;selectToolPath();$('tool-path-file').textContent=t('保存位置：','Saved at: ')+data.file;}
function selectToolPath(){$('tool-path-value').value=toolPathData?.paths[$('tool-path-name').value]||'';$('tool-path-value').removeAttribute('aria-invalid');}
async function loadToolPaths(){if(toolPathsBusy)return;toolPathsBusy=true;$('tool-path-fields').disabled=true;$('tool-path-reload').disabled=true;$('tool-path-feedback').textContent=t('加载中…','Loading…');try{showToolPathData(await api('tool-paths'));$('tool-path-feedback').textContent='';}catch(error){toolPathData=undefined;$('tool-path-feedback').textContent=error.message;}finally{toolPathsBusy=false;$('tool-path-fields').disabled=!toolPathData;$('tool-path-reload').disabled=false;}}
$('tool-path-editor').ontoggle=()=>{if($('tool-path-editor').open)void loadToolPaths();};
$('tool-path-reload').onclick=loadToolPaths;$('tool-path-name').onchange=selectToolPath;
async function saveToolPath(action){if(toolPathsBusy||!toolPathData)return;const input={action,name:$('tool-path-name').value,...(action==='save'?{path:$('tool-path-value').value}:{})};toolPathsBusy=true;$('tool-path-fields').disabled=true;$('tool-path-reload').disabled=true;$('tool-path-value').removeAttribute('aria-invalid');$('tool-path-feedback').textContent=t('保存中…','Saving…');try{const result=await api('tool-paths',input);showToolPathData(result);$('tool-path-feedback').textContent=result.message+(result.backup?t(' 原文件备份：',' Original backup: ')+result.backup:'');renderToolsLocale=()=>{$('tools').textContent=t('配置已更新，请重新查看就绪状态。','Configuration changed. Check availability again.');};renderToolsLocale();}catch(error){$('tool-path-feedback').textContent=error.message;$('tool-path-value').setAttribute('aria-invalid','true');}finally{toolPathsBusy=false;$('tool-path-fields').disabled=false;$('tool-path-reload').disabled=false;}}
$('tool-path-form').onsubmit=event=>{event.preventDefault();void saveToolPath('save');};$('tool-path-reset').onclick=()=>saveToolPath('reset');
let renderToolsLocale=()=>{};let renderSkillsLocale=()=>{};
$('preflight').onclick=async()=>{
  renderToolsLocale=()=>{};const revision=toolPathRevision;toolsIcon.morphTo(shapes.busy);
  $('preflight').disabled=true;$('tools').textContent=t('正在检查本机工具…','Checking local tools…');
  try{const result=await api('preflight');if(revision!==toolPathRevision)return;renderToolsLocale=()=>table('tools',t(['工具','状态','路径 / 说明'],['Tool','State','Path / details']),Object.entries(result.tools).map(([name,tool])=>[name,tool.available?t('就绪','Available'):t('缺失','Missing'),tool.pathOrStatus]));renderToolsLocale();toolsIcon.morphTo(shapes.check);}
  catch(error){$('tools').textContent=error.message;toolsIcon.morphTo(shapes.spark);}finally{$('preflight').disabled=false;}
};
$('skills-button').onclick=async()=>{
  renderSkillsLocale=()=>{};$('skills-button').disabled=true;
  try{const skills=await api('skills');renderSkillsLocale=()=>table('skills',t(['技能','说明','状态'],['Skill','Description','State']),skills.map(s=>[s.name,s.description,s.disabled?t('已停用','Disabled'):t('可用','Enabled')]));renderSkillsLocale();}
  catch(error){$('skills').textContent=error.message;}finally{$('skills-button').disabled=false;}
};
let nativeCatalogLoaded=false;
function refreshLocaleViews(){renderPromptConfigPath();renderToolsLocale();renderSkillsLocale();if(toolPathData)$('tool-path-file').textContent=t('保存位置：','Saved at: ')+toolPathData.file;if(nativeCatalogLoaded)void loadNativeTasks(nativePage);if(nativeSelection)void loadNativeDetail();}
let nativePage=1;let nativeCatalogBusy=false;let nativeDetailBusy=false;let nativeSelection;let nativeDetailSignature='';let nativeSelectionRevision=0;
const nativePhases={scoping:['需求对齐中','Scoping'],ready:['已就绪','Ready'],running:['运行中','Running'],active:['进行中','Active'],blocked:['已受阻','Blocked'],completed:['已完成','Completed'],cancelled:['已取消','Cancelled'],queued:['排队','Queued'],working:['工作中','Working'],waiting:['等待','Waiting'],paused:['已暂停','Paused'],killed:['已停止','Stopped']};
function findingStatus(value){const labels={'unverified':['待验证','Unverified'],'static-reviewed':['已静态审查','Static review'],'verified':['已验证','Verified']};const label=Object.hasOwn(labels,value)?labels[value]:undefined;return label?t(...label):(value||t('未知','Unknown'));}
function nativePhase(value){const label=nativePhases[value];return label?t(...label):value||t('详情未加载','Details unavailable');}
function nativeParagraph(parent,text,tag='p'){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
function nativeFailureHistory(parent,history,member){if(!history||(!history.count&&!history.incomplete))return;const section=document.createElement('details');section.dataset.failureMember=member||'';nativeParagraph(section,t('失败历史 · '+history.count+' 次','Failed attempts · '+history.count)+(history.incomplete?t(' · 历史不完整',' · History incomplete'):''),'summary');if(history.incomplete)nativeParagraph(section,t('历史不完整，完整导出不可用。原任务和已有记录已保留。','History incomplete; full export unavailable. The task and available records are retained.'));nativeParagraph(section,t('以下为已保存的归档引用，本面板未校验正文。失败记录不代表当前结果或审核通过。','Saved archive references; this panel has not checked their contents. Failed attempts are not current results or accepted reviews.'));const outcomes={incomplete:['未完成','Incomplete'],stopped:['已停止','Stopped'],timeout:['超时','Timeout'],error:['错误','Error'],review:['复核错误','Review error'],admission:['调度错误','Dispatch error']};for(const item of history.recent){const label=Object.hasOwn(outcomes,item.outcome)?t(...outcomes[item.outcome]):item.outcome;nativeParagraph(section,t('回合 ','Turn ')+item.turn+' · '+label,'h4');nativeParagraph(section,item.fullResultPath,'pre');}if(history.omitted)nativeParagraph(section,t('另有 '+history.omitted+' 次记录，请用下方 reports 命令导出。',history.omitted+' earlier attempts; use the reports command below to export.'));parent.append(section);}
function nativeResult(parent,result){nativeFailureHistory(parent,result.failureHistory,result.name);if(result.lastError)nativeParagraph(parent,t('最近一轮错误：','Latest turn error: ')+result.lastError,'pre');nativeParagraph(parent,result.preview||t('暂无结果正文。','No result text yet.'),'pre');if(result.previewOnly)nativeParagraph(parent,t('仅显示结果预览，请用下方 reports 命令读取完整报告。','Preview only. Use the reports command below for full results.'));if(result.fullResultPath)nativeParagraph(parent,t('全文档案路径（本面板未校验正文）：','Full archive path (content not validated by this panel): ')+result.fullResultPath,'pre');}
function nativeReview(parent,review){if(!review)return;const heading=review.kind==='undeclared'?t('复核范围：未声明，执行或续接前需明确。','Review scope: undeclared; declare before execution or resume.'):review.kind==='member-reports'?t('复核范围：仅成员报告，不含工作区文件。','Review scope: member reports only, no workspace files.'):t('复核范围：','Review scope: ')+review.totalFiles+t(' 个文件',' files');nativeParagraph(parent,heading,'h4');if(review.files.length)nativeParagraph(parent,review.files.join('\\n'),'pre');if(review.omittedFiles)nativeParagraph(parent,t('另有 '+review.omittedFiles+' 个文件，请用下方 status 命令查看完整范围。',review.omittedFiles+' more files; use the status command below for the complete scope.'));const note=nativeParagraph(parent,review.snapshotSaved?t('复核快照：已保存，仅为历史记录；此面板未重新核对当前文件。','Review snapshot: saved historical record; this panel has not rechecked current files.'):t('复核快照：尚未保存；此面板不会执行文件检查或批准任务。','Review snapshot: not saved; this panel does not check files or approve tasks.'));note.className='subtle';}
async function loadNativeTasks(page=nativePage){
  if(nativeCatalogBusy)return;nativeCatalogBusy=true;$('native-tasks-load').disabled=true;$('native-tasks-prev').disabled=true;$('native-tasks-next').disabled=true;$('native-tasks-feedback').textContent=t('加载中…','Loading…');
  try{
    const data=await api('agent-tasks?page='+page);nativeCatalogLoaded=true;nativePage=data.page;const list=$('native-tasks-list');list.replaceChildren();
    const selectedValue=nativeSelection?nativeSelection.mode+':'+nativeSelection.id:'';
    if(!data.entries.some(item=>item.mode+':'+item.id===selectedValue&&!item.detailsUnavailable)){nativeSelection=undefined;nativeSelectionRevision++;nativeDetailSignature='';$('native-task-detail').hidden=true;}
    if(!data.entries.length)nativeParagraph(list,t('当前页没有任务。可在终端使用 /teamwork、/boost、/grill-me 或 /swarm 创建任务。','No tasks on this page. Create one in the terminal with /teamwork, /boost, /grill-me or /swarm.'));
    else{
      const label=document.createElement('label');label.htmlFor='native-task-choice';label.textContent=t('选择任务','Choose a task');list.append(label);
      const choice=document.createElement('select');choice.id='native-task-choice';choice.setAttribute('aria-describedby','native-task-selection');const empty=document.createElement('option');empty.value='';empty.textContent=t('选择一项查看详情','Select a task for details');choice.append(empty);
      for(const item of data.entries){const option=document.createElement('option');option.value=item.mode+':'+item.id;option.disabled=!!item.detailsUnavailable;option.textContent=item.mode+' · '+nativePhase(item.phase)+' · '+(item.objective||t('记录不可读取','Record unavailable')).slice(0,60)+' · '+item.id.slice(0,8);choice.append(option);}
      const selection=document.createElement('p');selection.id='native-task-selection';selection.className='subtle';list.append(choice,selection);
      const describe=()=>{const item=data.entries.find(item=>item.mode+':'+item.id===choice.value);selection.textContent=item?item.id+' · '+t('保存时间：','Saved: ')+item.savedAt:'';return item;};
      choice.value=nativeSelection?selectedValue:'';describe();choice.onchange=()=>{const item=describe();nativeSelection=item?{id:item.id,mode:item.mode}:undefined;nativeSelectionRevision++;nativeDetailSignature='';$('native-task-detail').hidden=true;void loadNativeDetail();};
      if(data.entries.some(item=>item.detailsUnavailable))nativeParagraph(list,t('不可读取的记录保留在目录中，但无法选择；可在终端按ID进一步检查。','Unavailable records remain listed but cannot be selected. Inspect them by ID in the terminal.')+' '+data.entries.filter(item=>item.detailsUnavailable).map(item=>item.mode+' '+item.id).join(' · '));
    }
    $('native-tasks-page').textContent=t('第 '+data.page+' 页 · 共 '+data.total+' 项','Page '+data.page+' · '+data.total+' total');$('native-tasks-prev').hidden=data.page===1;$('native-tasks-next').hidden=!data.hasMore;$('native-tasks-feedback').textContent='';
  }catch(error){$('native-tasks-feedback').textContent=error.message;}finally{nativeCatalogBusy=false;$('native-tasks-load').disabled=false;$('native-tasks-prev').disabled=false;$('native-tasks-next').disabled=false;}
}
async function loadNativeDetail(){if(!nativeSelection||nativeDetailBusy)return;const revision=nativeSelectionRevision;const selected={...nativeSelection};nativeDetailBusy=true;try{const data=await api('agent-task?mode='+encodeURIComponent(selected.mode)+'&id='+encodeURIComponent(selected.id));if(revision!==nativeSelectionRevision)return;const signature=JSON.stringify([locale,data]);if(signature===nativeDetailSignature)return;nativeDetailSignature=signature;const detail=$('native-task-detail');const openFailures=new Set(detail.dataset.taskId===data.id?Array.from(detail.querySelectorAll('details[data-failure-member][open]')).map(node=>node.dataset.failureMember):[]);detail.dataset.taskId=data.id;detail.hidden=false;detail.replaceChildren();nativeParagraph(detail,data.mode+' · '+nativePhase(data.phase),'h3');nativeParagraph(detail,data.objective);nativeParagraph(detail,t('请求用量：','Requests: ')+(data.usage.known?data.usage.requests+' / '+data.usage.maxRequests:t('未知，未补建预算','Unknown; no budget reconstructed')));for(const warning of data.warnings)nativeParagraph(detail,warning==='budget-unavailable'?t('历史用量不可确认。','Historical usage unavailable.'):t('共享留言无法读取，原文件保留。','Shared board unavailable; original retained.'));if(data.kind==='swarm'){nativeParagraph(detail,t('成员与结果','Members and results'),'h3');for(const member of data.members){nativeParagraph(detail,member.name+' · '+member.agent+' · '+nativePhase(member.state)+t(' · 回合 ',' · turns ')+member.turns,'h4');nativeReview(detail,member.review);nativeResult(detail,member);}if(!data.members.length)nativeParagraph(detail,t('尚未添加成员。','No members yet.'));nativeParagraph(detail,t('最近共享留言','Recent shared messages'),'h3');for(const post of data.posts){nativeParagraph(detail,post.sender+' · '+post.time,'h4');nativeParagraph(detail,post.text,'pre');}if(data.stopReason)nativeParagraph(detail,data.stopReason);}else{nativeParagraph(detail,t('当前阶段：','Stage: ')+(data.stage||'—')+t(' · 已批准：',' · Approved: ')+(data.approved?t('是','Yes'):t('否','No')));nativeReview(detail,data.review);nativeParagraph(detail,t('里程碑','Milestones'),'h3');for(const item of data.milestones){nativeParagraph(detail,(item.completed?'✓ ':'○ ')+item.title,'h4');nativeParagraph(detail,item.acceptance);}nativeParagraph(detail,t('最近阶段结果 · 共 ','Recent stage results · ')+data.reportCount,'h3');for(const report of data.reports){nativeParagraph(detail,report.agent+' · '+report.stage+' · '+t(report.completed?'完成':'未完成',report.completed?'Complete':'Incomplete'),'h4');nativeResult(detail,report);}}nativeParagraph(detail,t('在终端查看或导出完整结果：','Inspect or export full results in the terminal: '));nativeParagraph(detail,data.commands.status,'pre');nativeParagraph(detail,data.commands.reports,'pre');for(const node of detail.querySelectorAll('details[data-failure-member]'))node.open=openFailures.has(node.dataset.failureMember);$('native-tasks-feedback').textContent='';}catch(error){if(revision===nativeSelectionRevision){nativeDetailSignature='';$('native-task-detail').hidden=true;$('native-tasks-feedback').textContent=error.message;}}finally{nativeDetailBusy=false;if(revision!==nativeSelectionRevision)void loadNativeDetail();}}
$('native-tasks-load').onclick=()=>loadNativeTasks();$('native-tasks-prev').onclick=()=>loadNativeTasks(nativePage-1);$('native-tasks-next').onclick=()=>loadNativeTasks(nativePage+1);
void refresh().then(loadPrompts);setInterval(()=>{if(!document.hidden){void refresh();if(!$('drill').hidden)void loadNativeDetail();}},4000);
</script></body></html>`;
}
