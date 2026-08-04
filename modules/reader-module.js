/**
 * reader-module.js - 文本阅读器模块（单编辑区版，极简建议高亮）
 * 
 * 改动：
 *   - 移除中间对照列，高亮直接在编辑区显示
 *   - 移除@@标记相关功能
 *   - 修复切换页面/模块编辑内容丢失的问题
 *   - 左侧修改记录完整显示原始行（包括<数字>前缀）
 *   - 高亮规则：
 *       • 建议原文：旧词红色（提取第一对引号内容）
 *       • 普通改为：新词黄色
 *       • 插入：新词绿色
 *       • 删除/保留：无高亮
 *   - 解析支持 <数字> 前缀
 *   - 建议解析极简版：仅识别“建议原文”后的引号内容，红色高亮
 *   - 修复：手动换行在切换页面/软件后丢失（_extractText 加强块级元素换行捕获，恢复与查找替换时统一处理 \n -> <br>）
 */
(function(window) {
    'use strict';

    const module = {
        name: 'reader',

        cachedAiInput: '',
        cachedAiInput2: '',
        cachedReaderData: null,
        cachedReaderData2: null,
        scrollLocked: false,
        scrollLocked2: false,
        syncTimer: null,
        syncTimer2: null,
        rafId: null,
        rafId2: null,

        init(container, App) {
            this.App = App;
            this.container = container;
            this._injectStyles();
            this.render();
        },

        activate(App) {
            this.App = App;
            this.render();
        },

        destroy() {
            const editor1 = document.getElementById('rightEditor');
            const editor2 = document.getElementById('rightEditor2');
            if (editor1 && this.cachedReaderData) {
                this.cachedReaderData.editedText = this._extractText(editor1);
            }
            if (editor2 && this.cachedReaderData2) {
                this.cachedReaderData2.editedText = this._extractText(editor2);
            }
            if (this.rafId) cancelAnimationFrame(this.rafId);
            if (this.rafId2) cancelAnimationFrame(this.rafId2);
            if (this.syncTimer) clearTimeout(this.syncTimer);
            if (this.syncTimer2) clearTimeout(this.syncTimer2);
            if (this._findKeyHandler) document.removeEventListener('keydown', this._findKeyHandler);
            this.container.innerHTML = '';
        },

        _injectStyles() {
            if (document.getElementById('reader-dynamic-styles')) return;
            const style = document.createElement('style');
            style.id = 'reader-dynamic-styles';
            style.textContent = `
                .highlight { background: #ffeb3b; padding: 0 2px; border-radius: 2px; }
                .highlight-insert { background: #b7eb8f; padding: 0 2px; border-radius: 2px; }
                .highlight-before { background: #ffccc7; padding: 0 2px; border-radius: 2px; }
                .find-highlight { background: #ff9632; padding: 0 2px; border-radius: 2px; }
                .find-highlight-active { background: #ff6b00; color: #fff; }
                .find-replace-group {
                    display: flex; align-items: center; gap: 4px; margin-left: auto; flex-wrap: wrap;
                }
                .find-replace-group input {
                    width: 80px; height: 30px; padding: 2px 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px; box-sizing: border-box;
                }
                .find-replace-group button {
                    height: 30px; padding: 0 8px; font-size: 12px; box-sizing: border-box;
                }
            `;
            document.head.appendChild(style);
        },

        render() {
            const con = this.container;
            con.innerHTML = `
                <div class="reader-parse-area">
                    <textarea id="aiInput" placeholder="粘贴AI输出（含【优化稿】和【修改记录】）"></textarea>
                    <button class="btn btn-dark" id="clearAllBtn_reader">🧹 清空</button>
                    <button class="btn btn-primary" id="parseBtn">🔍 解析并生成对照</button>
                </div>
                <div id="threeColArea" style="display:none;">
                    <div class="reader-three-col">
                        <div class="reader-col reader-col-left" style="width:220px;">
                            <div class="col-title">📋 修改记录</div>
                            <div class="col-content" id="recordList"></div>
                        </div>
                        <div class="reader-col" style="flex:1;">
                            <div class="col-title">✏️ 编辑区（高亮为修改处）</div>
                            <div class="col-content" id="rightEditor" contenteditable="true"></div>
                        </div>
                    </div>
                    <div class="reader-buttons">
                        <button class="btn btn-success" id="copyCleanBtn">📋 复制纯净文本</button>
                        <div class="find-replace-group" id="findReplaceGroup1">
                            <input type="text" class="find-input" placeholder="查找...">
                            <button class="btn btn-light btn-sm find-all-btn">全部</button>
                            <button class="btn btn-light btn-sm find-next-btn">下一处</button>
                            <input type="text" class="replace-input" placeholder="替换为...">
                            <button class="btn btn-light btn-sm replace-next-btn">替换</button>
                            <button class="btn btn-light btn-sm replace-all-btn">全部替换</button>
                            <button class="btn btn-light btn-sm clear-find-btn">✕</button>
                        </div>
                    </div>
                </div>

                <div class="reader-collapse-section" style="margin-top:20px;border-top:2px solid #e0e0e0;padding-top:15px;">
                    <div id="secondWindowHeader" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:10px 15px;background:#f5f5f5;border-radius:8px;margin-bottom:10px;">
                        <span style="font-weight:bold;font-size:15px;">📑 第二个对照窗口 & 文本比对（点击展开）</span>
                        <span id="secondWindowToggleIcon" style="font-size:18px;">▶</span>
                    </div>
                    <div id="secondWindowBody" style="display:none;">
                        <div class="reader-parse-area">
                            <textarea id="aiInput2" placeholder="粘贴AI输出"></textarea>
                            <button class="btn btn-dark" id="clearAllBtn_reader2">🧹 清空</button>
                            <button class="btn btn-primary" id="parseBtn2">🔍 解析并生成对照</button>
                        </div>
                        <div id="threeColArea2" style="display:none;">
                            <div class="reader-three-col">
                                <div class="reader-col reader-col-left" style="width:220px;">
                                    <div class="col-title">📋 修改记录</div>
                                    <div class="col-content" id="recordList2"></div>
                                </div>
                                <div class="reader-col" style="flex:1;">
                                    <div class="col-title">✏️ 编辑区（高亮为修改处）</div>
                                    <div class="col-content" id="rightEditor2" contenteditable="true"></div>
                                </div>
                            </div>
                            <div class="reader-buttons">
                                <button class="btn btn-success" id="copyCleanBtn2">📋 复制纯净文本</button>
                                <div class="find-replace-group" id="findReplaceGroup2">
                                    <input type="text" class="find-input" placeholder="查找...">
                                    <button class="btn btn-light btn-sm find-all-btn">全部</button>
                                    <button class="btn btn-light btn-sm find-next-btn">下一处</button>
                                    <input type="text" class="replace-input" placeholder="替换为...">
                                    <button class="btn btn-light btn-sm replace-next-btn">替换</button>
                                    <button class="btn btn-light btn-sm replace-all-btn">全部替换</button>
                                    <button class="btn btn-light btn-sm clear-find-btn">✕</button>
                                </div>
                            </div>
                        </div>

                        <div style="margin-top:15px;border-top:1px dashed #ddd;padding-top:12px;">
                            <div style="font-weight:bold;font-size:13px;margin-bottom:8px;">📄 文本左右对照（两个普通窗口，直接粘贴即可并排查看）</div>
                            <div style="display:flex;gap:10px;margin-bottom:10px;align-items:center;">
                                <button class="btn btn-light" id="clearDiffBtn" style="font-size:12px;">🗑️ 清空</button>
                                <span style="font-size:12px;color:#888;">左=原文，右=对比稿；仅并排查看，无自动对比</span>
                            </div>
                            <div class="reader-three-col" style="height:55vh;min-height:400px;">
                                <div class="reader-col" style="flex:1;">
                                    <div class="col-title">📄 文本一（左 / 原文）</div>
                                    <div class="col-content" id="diffLeftContent" contenteditable="true" style="font-family:monospace;font-size:13px;white-space:pre-wrap;"></div>
                                    <button class="btn btn-light btn-sm copy-diff-btn" data-target="diffLeftContent" style="margin:4px;">📋 复制左侧</button>
                                </div>
                                <div class="reader-col" style="flex:1;">
                                    <div class="col-title">✏️ 文本二（右 / 对比稿）</div>
                                    <div class="col-content" id="diffRightContent" contenteditable="true" style="font-family:monospace;font-size:13px;white-space:pre-wrap;"></div>
                                    <button class="btn btn-light btn-sm copy-diff-btn" data-target="diffRightContent" style="margin:4px;">📋 复制右侧</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            if (this.cachedAiInput) document.getElementById('aiInput').value = this.cachedAiInput;
            if (this.cachedAiInput2) document.getElementById('aiInput2').value = this.cachedAiInput2;

            if (this.cachedReaderData) this._restoreWindow('recordList', 'rightEditor', 'threeColArea', this.cachedReaderData, 'syncTimer', 'rafId', 'cachedReaderData');
            if (this.cachedReaderData2) this._restoreWindow('recordList2', 'rightEditor2', 'threeColArea2', this.cachedReaderData2, 'syncTimer2', 'rafId2', 'cachedReaderData2');

            this._bindWindow1();
            this._bindWindow2();
            this._bindCollapse();
            this._bindDiff();
            this._bindDiffCopyButtons();
            this._preventScrollBubble();

            this._initFindReplace('rightEditor', 'cachedReaderData', 'findReplaceGroup1');
            this._initFindReplace('rightEditor2', 'cachedReaderData2', 'findReplaceGroup2');
        },

        _restoreWindow(recId, editorId, areaId, data, timerKey, rafKey, cacheKey) {
            document.getElementById(recId).innerHTML = data.recordListHTML;
            if (data.editedText !== undefined) {
                // 修复：将纯文本中的 \n 还原为 <br>，保证手动换行不丢失
                document.getElementById(editorId).innerHTML = this._escape(data.editedText).replace(/\n/g, '<br>');
            } else {
                document.getElementById(editorId).innerHTML = data.editorHTML || '';
            }
            document.getElementById(areaId).style.display = 'block';
            const editorEl = document.getElementById(editorId);
            this._bindSimpleEditorSync(editorEl, data.records || [], timerKey, rafKey, cacheKey);
            this._bindRecordClicks(recId);
        },

        _bindWindow1() {
            document.getElementById('aiInput').addEventListener('input', e => this.cachedAiInput = e.target.value);
            document.getElementById('parseBtn').addEventListener('click', () => this._parse('aiInput', 'recordList', 'rightEditor', 'threeColArea', 'cachedReaderData', 'syncTimer', 'rafId'));
            document.getElementById('clearAllBtn_reader').addEventListener('click', () => {
                this._clearWindow('aiInput', 'recordList', 'rightEditor', 'threeColArea');
                this.cachedAiInput = ''; this.cachedReaderData = null; this.scrollLocked = false;
            });
            document.getElementById('copyCleanBtn').addEventListener('click', () => {
                const ed = document.getElementById('rightEditor');
                if (ed) this.App.api.copyText(this._extractText(ed));
            });
        },

        _bindWindow2() {
            document.getElementById('aiInput2').addEventListener('input', e => this.cachedAiInput2 = e.target.value);
            document.getElementById('parseBtn2').addEventListener('click', () => this._parse('aiInput2', 'recordList2', 'rightEditor2', 'threeColArea2', 'cachedReaderData2', 'syncTimer2', 'rafId2'));
            document.getElementById('clearAllBtn_reader2').addEventListener('click', () => {
                this._clearWindow('aiInput2', 'recordList2', 'rightEditor2', 'threeColArea2');
                this.cachedAiInput2 = ''; this.cachedReaderData2 = null; this.scrollLocked2 = false;
            });
            document.getElementById('copyCleanBtn2').addEventListener('click', () => {
                const ed = document.getElementById('rightEditor2');
                if (ed) this.App.api.copyText(this._extractText(ed));
            });
        },

        _clearWindow(inputId, recId, editorId, areaId) {
            document.getElementById(inputId).value = '';
            document.getElementById(recId).innerHTML = '';
            document.getElementById(editorId).innerHTML = '';
            document.getElementById(areaId).style.display = 'none';
        },

        _bindCollapse() {
            const header = document.getElementById('secondWindowHeader');
            const body = document.getElementById('secondWindowBody');
            const icon = document.getElementById('secondWindowToggleIcon');
            if (!header || !body || !icon) return;
            header.addEventListener('click', () => {
                if (body.style.display === 'none' || !body.style.display) {
                    body.style.display = 'block'; icon.textContent = '▼';
                    header.querySelector('span:first-child').textContent = '📑 第二个对照窗口 & 文本比对（点击折叠）';
                } else {
                    body.style.display = 'none'; icon.textContent = '▶';
                    header.querySelector('span:first-child').textContent = '📑 第二个对照窗口 & 文本比对（点击展开）';
                }
            });
        },

        _preventScrollBubble() {
            document.querySelectorAll('.col-content').forEach(el => {
                el.addEventListener('wheel', function(e) {
                    const st = el.scrollTop, sh = el.scrollHeight, ch = el.clientHeight;
                    if ((e.deltaY < 0 && st === 0) || (e.deltaY > 0 && st + ch >= sh - 1)) e.preventDefault();
                });
            });
        },

        /** 解析独立的【文字修改建议】区块（与【修改记录】中的建议逻辑相同） */
        _parseSuggestions(text) {
            const lines = text.split('\n').filter(l => l.trim());
            const records = [];
            const q = '[""“”]';
            lines.forEach(line => {
                const cleanedLine = line.replace(/^<\d+>\s*/, '').trim();
                const beforeMatch = cleanedLine.match(new RegExp(`原文${q}(.+?)${q}`));
                if (beforeMatch) {
                    records.push({
                        type: 'suggestion',
                        keyword: beforeMatch[1],
                        before: beforeMatch[1],
                        after: '',          // 不提取新词
                        raw: line
                    });
                } else {
                    records.push({ type: 'raw', raw: line });
                }
            });
            return records;
        },

        _parse(inputId, recId, editorId, areaId, cacheKey, timerKey, rafKey) {
            const raw = document.getElementById(inputId).value;
            if (inputId === 'aiInput') this.cachedAiInput = raw; else this.cachedAiInput2 = raw;

            // 1. 分离独立的【文字修改建议】区块
            let articleRaw = raw;
            let suggestionRecords = [];
            const suggTitle = '【文字修改建议】';
            const suggIdx = articleRaw.indexOf(suggTitle);
            if (suggIdx !== -1) {
                const before = articleRaw.substring(0, suggIdx);
                const after = articleRaw.substring(suggIdx);
                const suggestionText = after.replace(suggTitle, '').trim();
                suggestionRecords = this._parseSuggestions(suggestionText);
                articleRaw = before.trim();
            }

            // 2. 分离【修改记录】和【优化稿】
            let recordText = '';
            let records = [];
            const recordTitle = '【修改记录】';
            const optTitle = '【优化稿】';
            const hasRecord = articleRaw.includes(recordTitle);
            if (hasRecord) {
                const parts = articleRaw.split(recordTitle);
                articleRaw = (parts[0] || '').replace(optTitle, '').trim();
                recordText = parts[1] || '';
                records = recordText ? this._parseRecords(recordText) : [];
            } else {
                articleRaw = articleRaw.replace(optTitle, '').trim();
            }

            // 合并建议
            records = records.concat(suggestionRecords);

            // 3. 生成高亮HTML（注意：结果可能包含原文中的换行符）
            const escapedArticle = this._escape(articleRaw);
            const editorHTML = records.length ? this._applyRecordHighlights(escapedArticle, records) : escapedArticle;

            // 4. 左侧修改记录列表
            const recordHTML = records.length > 0 ? records.map((r, i) => {
                if (r.raw) return `<div class="record-item" data-index="${i}">${this._escapeHtml(r.raw)}</div>`;
                let t = '';
                if (r.type === 'replace') t = `✏️ "${r.before}" → "${r.after}"`;
                else if (r.type === 'delete') t = `🗑️ 删除 "${r.before}"`;
                else if (r.type === 'insert') t = `➕ 在 "${r.keyword}" 后增加 "${r.after}"`;
                else if (r.type === 'keep') t = `📌 保留 "${r.text}"`;
                else if (r.type === 'suggestion') t = `💡 "${r.before}"（红色高亮）`;
                else t = `❓ ${r.raw || ''}`;
                return `<div class="record-item" data-index="${i}">${t}</div>`;
            }).join('') : '<div class="record-item" style="color:#999">无修改记录</div>';

            document.getElementById(recId).innerHTML = recordHTML;
            // 重要：将普通 \n 转换为 <br> 以保持段落结构
            document.getElementById(editorId).innerHTML = editorHTML.replace(/\n/g, '<br>');
            document.getElementById(areaId).style.display = 'block';

            const cacheData = {
                recordListHTML: recordHTML,
                editorHTML: editorHTML, // 保留原始高亮HTML，用于无 editedText 时恢复
                records: records,
                editedText: undefined
            };
            this[cacheKey] = cacheData;

            const editorEl = document.getElementById(editorId);
            this._bindSimpleEditorSync(editorEl, records, timerKey, rafKey, cacheKey);
            this._bindRecordClicks(recId);
        },

        _bindSimpleEditorSync(editor, records, timerKey, rafKey, cacheKey) {
            if (!editor) return;
            const self = this;
            const update = () => {
                if (self[timerKey]) clearTimeout(self[timerKey]);
                self[timerKey] = setTimeout(() => {
                    if (self[rafKey]) cancelAnimationFrame(self[rafKey]);
                    self[rafKey] = requestAnimationFrame(() => {
                        const currentText = self._extractText(editor);
                        if (self[cacheKey]) self[cacheKey].editedText = currentText;
                        self[rafKey] = null;
                    });
                }, 150);
            };
            editor.addEventListener('input', update);
            editor.addEventListener('paste', () => setTimeout(update, 50));
            editor.addEventListener('cut', () => setTimeout(update, 50));
        },

        // 高亮规则
        _applyRecordHighlights(escapedHTML, records) {
            const map = new Map();
            records.forEach(r => {
                if (r.type === 'suggestion') {
                    if (r.before && !/^[\s，。！？、；：""''【】《》（）]+$/.test(r.before)) {
                        map.set(r.before, 'highlight-before');
                    }
                } else if (r.type === 'replace') {
                    if (r.after) map.set(r.after, 'highlight');
                } else if (r.type === 'insert') {
                    if (r.after) map.set(r.after, 'highlight-insert');
                }
            });

            const words = [...map.entries()].sort((a,b) => b[0].length - a[0].length);
            let result = escapedHTML;
            const phs = [];
            words.forEach(([text, cls], i) => {
                const escaped = this._escape(text);
                const ph = `__HL_${i}__`;
                if (result.includes(escaped)) {
                    result = result.split(escaped).join(ph);
                    phs.push({ ph, escaped, cls });
                }
            });
            phs.forEach(({ ph, escaped, cls }) => {
                result = result.split(ph).join(`<span class="${cls}">${escaped}</span>`);
            });
            return result;
        },

        // 解析【修改记录】（支持常规记录 + 极简建议提取）
        _parseRecords(text) {
            const lines = text.split('\n').filter(l => l.trim());
            const records = [];
            const q = '[""“”]';

            lines.forEach(line => {
                const cleanedLine = line.replace(/^<\d+>\s*/, '').trim();
                let m;

                // 常规记录
                const reReplace = new RegExp(`${q}(.+?)${q}\\s*改为\\s*${q}(.+?)${q}`);
                if ((m = cleanedLine.match(reReplace))) {
                    records.push({ type:'replace', keyword:m[1], before:m[1], after:m[2], raw: line });
                    return;
                }
                const reDelete = new RegExp(`删除\\s*${q}(.+?)${q}`);
                if ((m = cleanedLine.match(reDelete))) {
                    records.push({ type:'delete', keyword:m[1], before:m[1], raw: line });
                    return;
                }
                const reInsert = new RegExp(`在\\s*${q}(.+?)${q}\\s*后增加\\s*${q}(.+?)${q}`);
                if ((m = cleanedLine.match(reInsert))) {
                    records.push({ type:'insert', keyword:m[1], after:m[2], raw: line });
                    return;
                }
                const reKeep = new RegExp(`保留原文${q}(.+?)${q}`);
                if ((m = cleanedLine.match(reKeep))) {
                    records.push({ type:'keep', keyword:m[1], text:m[1], raw: line });
                    return;
                }

                // 极简建议：找到“建议原文”后的第一对引号内容
                const beforeMatch = cleanedLine.match(new RegExp(`原文${q}(.+?)${q}`));
                if (beforeMatch) {
                    records.push({
                        type: 'suggestion',
                        keyword: beforeMatch[1],
                        before: beforeMatch[1],
                        after: '',
                        raw: line
                    });
                    return;
                }

                records.push({ type:'unknown', raw: line });
            });
            return records;
        },

        _escape(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },
        _escapeHtml(text) { return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); },

        /** 提取编辑器纯文本，加强块级元素换行支持 */
        _extractText(node) {
            let result = '';
            const walk = (n, blockLevel) => {
                if (n.nodeType === Node.TEXT_NODE) {
                    result += n.textContent;
                } else if (n.nodeType === Node.ELEMENT_NODE) {
                    const tag = n.tagName.toLowerCase();
                    if (tag === 'br') {
                        result += '\n';
                    } else {
                        const isBlock = ['div','p','li','h1','h2','h3','h4','h5','h6','blockquote','section','article'].includes(tag);
                        n.childNodes.forEach(child => walk(child, isBlock));
                        if (isBlock) result += '\n';
                    }
                }
            };
            walk(node, false);
            return result;
        },

        /* ========== 文本左右对照（普通并排窗口） ========== */
        _bindDiff() {
            document.getElementById('clearDiffBtn')?.addEventListener('click', () => {
                document.getElementById('diffLeftContent').innerHTML = '';
                document.getElementById('diffRightContent').innerHTML = '';
            });
        },
        _bindDiffCopyButtons() {
            document.querySelectorAll('.copy-diff-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const target = document.getElementById(btn.dataset.target);
                    if (target) this.App.api.copyText(this._extractText(target));
                });
            });
        },
        _html(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); },

        _bindRecordClicks(listId) {
            document.querySelectorAll(`#${listId} .record-item`).forEach(item => {
                item.addEventListener('click', function() {
                    document.querySelectorAll(`#${listId} .record-item`).forEach(el => el.classList.remove('active'));
                    this.classList.add('active');
                });
            });
        },

        /* ========== 查找替换 ========== */
        _initFindReplace(editorId, cacheKey, groupId) {
            const editor = document.getElementById(editorId); if (!editor) return;
            const group = document.getElementById(groupId); if (!group) return;
            const findInput = group.querySelector('.find-input'), replaceInput = group.querySelector('.replace-input');
            const findAllBtn = group.querySelector('.find-all-btn'), findNextBtn = group.querySelector('.find-next-btn');
            const replaceNextBtn = group.querySelector('.replace-next-btn'), replaceAllBtn = group.querySelector('.replace-all-btn'), clearBtn = group.querySelector('.clear-find-btn');
            let highlights = [], currentHighlightIndex = -1;

            findInput.addEventListener('focus', () => findInput.select());
            replaceInput.addEventListener('focus', () => replaceInput.select());

            const clearFindHighlights = () => {
                highlights.forEach(mark => {
                    const p = mark.parentNode;
                    if (p) { p.replaceChild(document.createTextNode(mark.textContent), mark); p.normalize(); }
                });
                highlights = []; currentHighlightIndex = -1;
            };
            const activateHighlight = (index) => {
                if (highlights.length === 0) return;
                highlights.forEach(h => h.classList.remove('find-highlight-active'));
                if (index >= 0 && index < highlights.length) {
                    highlights[index].classList.add('find-highlight-active');
                    highlights[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            };
            const findAll = () => {
                clearFindHighlights();
                const findText = findInput.value;
                if (!findText) return;
                const text = this._extractText(editor);
                const escaped = this._escapeRegex(findText);
                const regex = new RegExp(escaped, 'gi');
                // 修复：先转义再替换，保证换行不丢失
                editor.innerHTML = this._escape(text).replace(/\n/g, '<br>').replace(regex, m => `<mark class="find-highlight">${m}</mark>`);
                highlights = [...editor.querySelectorAll('mark.find-highlight')];
                currentHighlightIndex = -1;
                editor.focus({ preventScroll: true });
                const cacheData = this[cacheKey];
                if (cacheData) cacheData.editedText = this._extractText(editor);
            };
            const findNext = (e) => {
                e?.preventDefault();
                if (highlights.length === 0) { findAll(); if (highlights.length > 0) { currentHighlightIndex = 0; activateHighlight(0); } }
                else { currentHighlightIndex = (currentHighlightIndex + 1) % highlights.length; activateHighlight(currentHighlightIndex); }
                editor.focus({ preventScroll: true });
            };
            const replaceCurrent = (e) => {
                e?.preventDefault();
                if (highlights.length === 0) return;
                if (currentHighlightIndex < 0 || currentHighlightIndex >= highlights.length) { currentHighlightIndex = 0; activateHighlight(0); }
                const replaceText = replaceInput.value;
                const currentMark = highlights[currentHighlightIndex];
                currentMark.parentNode.replaceChild(document.createTextNode(replaceText), currentMark);
                highlights.splice(currentHighlightIndex, 1);
                if (highlights.length > 0) { if (currentHighlightIndex >= highlights.length) currentHighlightIndex = 0; activateHighlight(currentHighlightIndex); }
                else { currentHighlightIndex = -1; }
                editor.focus({ preventScroll: true });
                const cacheData = this[cacheKey];
                if (cacheData) cacheData.editedText = this._extractText(editor);
            };
            const replaceAll = () => {
                const findText = findInput.value; if (!findText) return;
                const replaceText = replaceInput.value;
                const text = this._extractText(editor);
                const newText = text.replace(new RegExp(this._escapeRegex(findText), 'gi'), replaceText);
                const cacheData = this[cacheKey];
                const records = cacheData && cacheData.records;
                if (records && records.length > 0) {
                    // 重新应用高亮并保留换行
                    editor.innerHTML = this._applyRecordHighlights(this._escape(newText), records).replace(/\n/g, '<br>');
                } else {
                    editor.innerHTML = this._escape(newText).replace(/\n/g, '<br>');
                }
                clearFindHighlights();
                findInput.value = ''; replaceInput.value = '';
                if (cacheData) cacheData.editedText = newText;
                editor.focus({ preventScroll: true });
            };
            const clearInputs = () => { findInput.value = ''; replaceInput.value = ''; clearFindHighlights(); editor.focus({ preventScroll: true }); };

            findInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); findAll(); } });
            replaceInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); replaceAll(); } });
            findAllBtn.addEventListener('click', (e) => { e.preventDefault(); findAll(); });
            findNextBtn.addEventListener('click', findNext);
            replaceNextBtn.addEventListener('click', replaceCurrent);
            replaceAllBtn.addEventListener('click', (e) => { e.preventDefault(); replaceAll(); });
            clearBtn.addEventListener('click', (e) => { e.preventDefault(); clearInputs(); });

            if (this._findKeyHandler) document.removeEventListener('keydown', this._findKeyHandler);
            const keyHandler = (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                    const active = document.activeElement;
                    if (active === editor || editor.contains(active) || active.closest('.reader-col-right') === editor.closest('.reader-col-right')) {
                        e.preventDefault();
                        findInput.focus();
                        findInput.select();
                    }
                }
            };
            this._findKeyHandler = keyHandler;
            document.addEventListener('keydown', keyHandler);
        },

        _escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    };

    window.__modules = window.__modules || {};
    window.__modules['reader'] = module;
})(window);