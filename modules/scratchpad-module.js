/**
 * scratchpad-module.js - 随手记模块（轻量级碎片笔记）
 * 
 * 功能：
 * - 输入即自动保存（无需点击保存按钮）
 * - 所有笔记按最后修改时间倒序排列
 * - 支持搜索过滤
 * - 每条笔记显示时间戳，右侧有删除按钮
 * - 置顶功能（钉住重要笔记）
 * - 数据存储在浏览器 IndexedDB 中
 * - 可作为独立标签页嵌入到你的工具框架中
 */
(function(window) {
    'use strict';

    // ========== IndexedDB 数据库类 ==========
    class ScratchDB {
        constructor() {
            this.dbName = 'ScratchPadDB';
            this.storeName = 'notes';
            this.db = null;
        }
        async open() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, 1);
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        const store = db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
                        store.createIndex('updatedAt', 'updatedAt', { unique: false });
                        store.createIndex('pinned', 'pinned', { unique: false });
                    }
                };
                request.onsuccess = (event) => { this.db = event.target.result; resolve(); };
                request.onerror = (event) => reject(event.target.error);
            });
        }
        async add(note) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.add(note);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        async put(note) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.put(note);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        async delete(id) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.delete(id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
        async getAll() {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        async clear() {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }

    // ========== 模块主体 ==========
    const module = {
        name: 'scratchpad',

        // 数据缓存
        notes: [],
        // 当前正在编辑的笔记 ID（用于自动保存更新）
        currentEditId: null,
        // 防抖定时器
        saveTimer: null,
        // 搜索关键词
        searchKeyword: '',

        async init(container, App) {
            this.App = App;
            this.container = container;
            try {
                this.db = new ScratchDB();
                await this.db.open();
                // 加载已有笔记
                this.notes = await this.db.getAll();
                this._sortNotes();
                this.initialized = true;
                this.render();
            } catch (e) {
                console.error('[scratchpad] 初始化失败:', e);
                if (this.container) {
                    this.container.innerHTML = '<div style="padding:40px;text-align:center;color:#f53f3f;">初始化失败</div>';
                }
            }
        },

        activate(App) {
            this.App = App;
            this.render();
        },

        destroy() {
            if (this.container) this.container.innerHTML = '';
        },

        // 排序：置顶优先，然后按 updatedAt 倒序
        _sortNotes() {
            this.notes.sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return (b.updatedAt || '').localeCompare(a.updatedAt || '');
            });
        },

        // ========== 渲染 ==========
        render() {
            const con = this.container;
            con.innerHTML = `
                <div style="padding:10px;">
                    <!-- 搜索框 -->
                    <div style="margin-bottom:10px;">
                        <input type="text" id="scratchSearch" placeholder="🔍 搜索笔记..." value="${this._escapeHtml(this.searchKeyword)}" style="width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box;">
                    </div>

                    <!-- 笔记列表 -->
                    <div id="notesList" style="max-height:calc(100vh - 250px);overflow-y:auto;margin-bottom:10px;">
                        ${this._renderNotesList()}
                    </div>

                    <!-- 输入区域 -->
                    <div style="border-top:1px solid #eee;padding-top:10px;">
                        <textarea id="newNoteInput" placeholder="写点什么... 回车自动保存为新笔记" style="width:100%;height:60px;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>
                    </div>

                    <!-- 底部操作 -->
                    <div style="display:flex;justify-content:flex-end;margin-top:8px;">
                        <button id="clearAllNotesBtn" style="font-size:11px;padding:4px 12px;background:#f5f5f5;border:1px solid #ddd;border-radius:4px;cursor:pointer;color:#999;">🗑️ 清空全部</button>
                    </div>
                </div>
            `;

            this._bindEvents();
        },

        _renderNotesList() {
            const filtered = this.searchKeyword
                ? this.notes.filter(n => n.content.toLowerCase().includes(this.searchKeyword.toLowerCase()))
                : this.notes;

            if (filtered.length === 0) {
                return '<div style="color:#ccc;text-align:center;padding:40px;">暂无笔记，在下方输入框开始记录</div>';
            }

            return filtered.map(note => {
                const time = note.updatedAt ? this._formatTime(note.updatedAt) : '';
                const pinnedClass = note.pinned ? 'background:#fffbe6;' : 'background:#fff;';
                return `
                    <div class="note-item" data-id="${note.id}" style="${pinnedClass}padding:8px;margin-bottom:6px;border:1px solid #e8e8e8;border-radius:6px;display:flex;align-items:flex-start;gap:8px;">
                        <div style="flex:1;cursor:pointer;" class="note-content" data-id="${note.id}">
                            <pre style="margin:0;white-space:pre-wrap;font-size:13px;line-height:1.6;color:#333;word-break:break-word;">${this._escapeHtml(note.content)}</pre>
                            <div style="font-size:10px;color:#bbb;margin-top:4px;">${time} ${note.pinned ? '📌' : ''}</div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;">
                            <button class="pin-note-btn" data-id="${note.id}" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px;" title="${note.pinned ? '取消置顶' : '置顶'}">${note.pinned ? '📌' : '📍'}</button>
                            <button class="delete-note-btn" data-id="${note.id}" style="background:none;border:none;cursor:pointer;font-size:16px;color:#f53f3f;padding:2px;" title="删除">×</button>
                        </div>
                    </div>
                `;
            }).join('');
        },

        _formatTime(isoStr) {
            if (!isoStr) return '';
            const d = new Date(isoStr);
            const now = new Date();
            const diffMs = now - d;
            const diffMin = Math.floor(diffMs / 60000);
            if (diffMin < 1) return '刚刚';
            if (diffMin < 60) return `${diffMin}分钟前`;
            const diffHour = Math.floor(diffMin / 60);
            if (diffHour < 24) return `${diffHour}小时前`;
            const diffDay = Math.floor(diffHour / 24);
            if (diffDay < 7) return `${diffDay}天前`;
            return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
        },

        _escapeHtml(text) {
            return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },

        // ========== 事件绑定 ==========
        _bindEvents() {
            const newNoteInput = document.getElementById('newNoteInput');
            const searchInput = document.getElementById('scratchSearch');
            const clearBtn = document.getElementById('clearAllNotesBtn');

            // 新笔记输入：回车自动保存，同时自动保存已有笔记的修改
            newNoteInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const content = newNoteInput.value.trim();
                    if (content) {
                        this._saveNewNote(content);
                        newNoteInput.value = '';
                    }
                }
            });

            // 如果正在编辑某条笔记（点击进入编辑模式），输入后自动保存
            // 此处简化：点击笔记内容可以编辑（通过 prompt 或 内联编辑），但为了保持简洁，
            // 我们让用户直接在列表上点击，弹出编辑窗口。
            if (this.container._noteClickHandler) this.container.removeEventListener('click', this.container._noteClickHandler);
            const noteClickHandler = (e) => {
                const noteContent = e.target.closest('.note-content');
                if (noteContent) {
                    const id = parseInt(noteContent.dataset.id);
                    this._editNote(id);
                }
                const pinBtn = e.target.closest('.pin-note-btn');
                if (pinBtn) {
                    e.stopPropagation();
                    const id = parseInt(pinBtn.dataset.id);
                    this._togglePin(id);
                }
                const deleteBtn = e.target.closest('.delete-note-btn');
                if (deleteBtn) {
                    e.stopPropagation();
                    const id = parseInt(deleteBtn.dataset.id);
                    this._deleteNote(id);
                }
            };
            this.container._noteClickHandler = noteClickHandler;
            this.container.addEventListener('click', noteClickHandler);

            // 搜索过滤
            searchInput.addEventListener('input', (e) => {
                this.searchKeyword = e.target.value;
                this._refreshNotesList();
            });

            // 清空全部
            clearBtn.addEventListener('click', () => {
                if (!confirm('确定清空所有随手记？')) return;
                this._clearAll();
            });
        },

        _refreshNotesList() {
            const list = document.getElementById('notesList');
            if (list) list.innerHTML = this._renderNotesList();
        },

        // ========== 数据操作 ==========
        async _saveNewNote(content) {
            const now = new Date().toISOString();
            const note = { content, updatedAt: now, pinned: false };
            const id = await this.db.add(note);
            note.id = id;
            this.notes.push(note);
            this._sortNotes();
            this._refreshNotesList();
        },

        _editNote(id) {
            const note = this.notes.find(n => n.id === id);
            if (!note) return;
            const newContent = prompt('编辑笔记：', note.content);
            if (newContent === null) return; // 取消
            const trimmed = newContent.trim();
            if (trimmed === '') {
                // 内容为空则删除
                this._deleteNote(id);
                return;
            }
            note.content = trimmed;
            note.updatedAt = new Date().toISOString();
            this.db.put(note);
            this._sortNotes();
            this._refreshNotesList();
        },

        async _togglePin(id) {
            const note = this.notes.find(n => n.id === id);
            if (!note) return;
            note.pinned = !note.pinned;
            await this.db.put(note);
            this._sortNotes();
            this._refreshNotesList();
        },

        async _deleteNote(id) {
            await this.db.delete(id);
            this.notes = this.notes.filter(n => n.id !== id);
            this._refreshNotesList();
        },

        async _clearAll() {
            await this.db.clear();
            this.notes = [];
            this._refreshNotesList();
        }
    };

    // ========== 注册模块 ==========
    window.__modules = window.__modules || {};
    window.__modules['scratchpad'] = module;
})(window);