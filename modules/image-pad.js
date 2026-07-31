/**
 * image-pad.js - 图片暂存板
 * 特性：
 *   - 右下角悬浮🖼️按钮
 *   - 面板支持Ctrl+V粘贴图片
 *   - 图片存储于IndexedDB，自动加载
 *   - 点击图片复制到剪贴板
 *   - 全屏/ESC关闭
 *   - 清空全部
 */
(function() {
    'use strict';

    // ========== IndexedDB 辅助类 ==========
    class ImagePadDB {
        constructor() { this.db = null; }
        async open() {
            return new Promise((resolve, reject) => {
                const req = indexedDB.open('ImagePadDB', 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('images')) {
                        const store = db.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
                        store.createIndex('createdAt', 'createdAt', { unique: false });
                    }
                };
                req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
                req.onerror = () => reject(req.error);
            });
        }
        async add(item) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction('images', 'readwrite');
                const store = tx.objectStore('images');
                const req = store.add(item);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        async getAll() {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction('images', 'readonly');
                const store = tx.objectStore('images');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        async delete(id) {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction('images', 'readwrite');
                const store = tx.objectStore('images');
                const req = store.delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
        async clear() {
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction('images', 'readwrite');
                const store = tx.objectStore('images');
                const req = store.clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }
    }

    // ========== 初始化图片暂存板 ==========
    async function initImagePad() {
        const db = new ImagePadDB();
        await db.open();

        let images = await db.getAll();

        // 创建悬浮按钮
        const btn = document.createElement('button');
        btn.id = 'imagepadToggle';
        btn.innerHTML = '🖼️';
        btn.title = '图片暂存板';
        document.body.appendChild(btn);

        // 创建面板
        const panel = document.createElement('div');
        panel.id = 'imagepadPanel';
        panel.innerHTML = `
            <div class="imghdr">
                <span>图片暂存 (${images.length})</span>
                <div>
                    <button id="imgFullscreenBtn" title="全屏">⛶</button>
                    <button id="imgClearBtn" title="清空">🗑️</button>
                </div>
            </div>
            <div id="imgGrid" class="img-grid">
                ${renderGrid(images)}
            </div>
            <div id="imgStatus">支持 Ctrl+V 粘贴图片，点击图片复制</div>
        `;
        document.body.appendChild(panel);

        const gridEl = document.getElementById('imgGrid');
        const statusEl = document.getElementById('imgStatus');
        const clearBtn = document.getElementById('imgClearBtn');
        const fullscreenBtn = document.getElementById('imgFullscreenBtn');

        // 渲染网格
        function renderGrid(imgs) {
            if (!imgs.length) return '<div style="color:#ccc;text-align:center;padding:40px;">暂无图片</div>';
            const sorted = [...imgs].sort((a,b) => b.createdAt - a.createdAt);
            return sorted.map(img => `
                <div class="img-item" data-id="${img.id}">
                    <img src="${img.dataUrl}" title="点击复制到剪贴板">
                    <button class="img-del-btn" data-id="${img.id}">×</button>
                </div>
            `).join('');
        }

        async function refreshGrid() {
            images = await db.getAll();
            gridEl.innerHTML = renderGrid(images);
            document.querySelector('#imagepadPanel .imghdr span').textContent = `图片暂存 (${images.length})`;
        }

        // 粘贴图片
        panel.addEventListener('paste', async (e) => {
            const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                        const dataUrl = ev.target.result;
                        const newImg = { dataUrl, createdAt: Date.now() };
                        const id = await db.add(newImg);
                        newImg.id = id;
                        images.push(newImg);
                        // 最多保留50张
                        if (images.length > 50) {
                            const sorted = [...images].sort((a,b) => a.createdAt - b.createdAt);
                            const toDelete = sorted.slice(0, images.length - 50);
                            for (const img of toDelete) await db.delete(img.id);
                            images = images.filter(img => !toDelete.includes(img));
                        }
                        await refreshGrid();
                        statusEl.textContent = '已添加图片，点击图片复制到剪贴板';
                    };
                    reader.readAsDataURL(blob);
                }
            }
        });

        // 点击图片复制
        gridEl.addEventListener('click', async (e) => {
            const imgItem = e.target.closest('.img-item');
            if (!imgItem) return;
            const id = parseInt(imgItem.dataset.id);
            const imgData = images.find(i => i.id === id);
            if (!imgData) return;
            try {
                const resp = await fetch(imgData.dataUrl);
                const blob = await resp.blob();
                await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                statusEl.textContent = '已复制图片到剪贴板';
            } catch (err) {
                statusEl.textContent = '复制失败，请重试';
            }
        });

        // 删除单张
        gridEl.addEventListener('click', async (e) => {
            const delBtn = e.target.closest('.img-del-btn');
            if (!delBtn) return;
            e.stopPropagation();
            const id = parseInt(delBtn.dataset.id);
            await db.delete(id);
            images = images.filter(i => i.id !== id);
            await refreshGrid();
        });

        // 清空
        clearBtn.addEventListener('click', async () => {
            if (!confirm('清空所有图片？')) return;
            await db.clear();
            images = [];
            await refreshGrid();
        });

        // 全屏切换
        fullscreenBtn.addEventListener('click', () => {
            panel.classList.toggle('fullscreen');
        });

        // 显示/隐藏
        btn.addEventListener('click', () => {
            panel.classList.toggle('show');
        });

        // ESC关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && panel.classList.contains('show')) {
                panel.classList.remove('show');
            }
        });

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!panel.contains(e.target) && e.target !== btn) {
                panel.classList.remove('show');
            }
        });
    }

    // 页面加载后自动初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initImagePad);
    } else {
        initImagePad();
    }
})();