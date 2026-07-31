/**
 * calc-module.js - 计算器模块
 * 包含：时间累加/时间戳计算器（默认时间戳模式）、时间差计算器
 * 新增：视频开始时间，打戳时显示视频内时间
 * 优化：所有时间输入框点击后自动全选
 */
(function(window) {
    'use strict';

    const module = {
        name: 'calc',

        totalSeconds: 0,
        timeRecords: [],
        currentMode: 'timestamp',

        diffRecords: [],

        init(App) {
            this.App = App;
            this._renderTimeModule();
            this._renderDiffModule();
        },

        _renderTimeModule() {
            const sumContainer = document.getElementById('sumModule');
            const segContainer = document.getElementById('segmentModule');

            if (segContainer) segContainer.style.display = 'none';
            if (!sumContainer) return;

            sumContainer.style.flex = '2';
            sumContainer.style.minWidth = '420px';

            sumContainer.innerHTML = `
                <h4>⏱️ 时间累加器</h4>
                <div style="display:flex;gap:12px;align-items:stretch;flex-wrap:wrap;">
                    <div style="flex:1;min-width:140px;display:flex;flex-direction:column;">
                        <div id="timeRecordList" style="flex:1;min-height:90px;max-height:130px;overflow-y:auto;border:1px solid #eee;border-radius:4px;padding:5px 8px;background:#fafafa;font-size:11px;line-height:1.5;color:#666;">
                            <div style="color:#ccc;text-align:center;padding-top:12px;font-size:12px;">记录</div>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
                        <div style="font-size:11px;color:#999;">当前时间</div>
                        <div style="display:flex;align-items:center;gap:2px;">
                            <input type="text" id="timeH" value="00" style="width:40px;padding:4px 2px;text-align:center;border:1px solid #dcdcdc;border-radius:4px;font-size:13px;outline:none;">
                            <span style="font-size:13px;color:#999;">:</span>
                            <input type="text" id="timeM" value="00" style="width:40px;padding:4px 2px;text-align:center;border:1px solid #dcdcdc;border-radius:4px;font-size:13px;outline:none;">
                            <span style="font-size:13px;color:#999;">:</span>
                            <input type="text" id="timeS" value="00" style="width:40px;padding:4px 2px;text-align:center;border:1px solid #dcdcdc;border-radius:4px;font-size:13px;outline:none;">
                        </div>
                        <div style="font-size:10px;color:#999;margin-top:2px;">视频开始</div>
                        <div style="display:flex;align-items:center;gap:2px;">
                            <input type="text" id="vidStartH" value="00" style="width:32px;padding:2px;text-align:center;border:1px solid #dcdcdc;border-radius:3px;font-size:11px;outline:none;">
                            <span style="font-size:11px;color:#999;">:</span>
                            <input type="text" id="vidStartM" value="00" style="width:32px;padding:2px;text-align:center;border:1px solid #dcdcdc;border-radius:3px;font-size:11px;outline:none;">
                            <span style="font-size:11px;color:#999;">:</span>
                            <input type="text" id="vidStartS" value="00" style="width:32px;padding:2px;text-align:center;border:1px solid #dcdcdc;border-radius:3px;font-size:11px;outline:none;">
                        </div>
                        <div class="result" id="totalTimeDisplay" style="text-align:center;margin-top:0;">
                            <span id="totalTimeValue">0分00秒</span>
                        </div>
                        <div id="modeIndicator" style="font-size:10px;color:#ff7d00;background:#fff7e6;padding:1px 8px;border-radius:10px;">时间戳模式</div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px;justify-content:center;min-width:55px;">
                        <button id="timeActionBtn" style="background:#009e5f;color:#fff;border:none;padding:5px 6px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">📌 打戳</button>
                        <button id="timeClearBtn" style="background:#f5f5f5;color:#666;border:1px solid #e0e0e0;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">🔄 清零</button>
                        <button id="timeModeBtn" style="background:#f0f7ff;color:#1677ff;border:1px solid #b3d8ff;padding:4px 6px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">➕ 累加</button>
                    </div>
                </div>
            `;

            this._renderTimeRecords();
            this._updateTotalDisplay();

            const hInput = sumContainer.querySelector('#timeH');
            const mInput = sumContainer.querySelector('#timeM');
            const sInput = sumContainer.querySelector('#timeS');
            const inputs = [hInput, mInput, sInput];

            const bindAutoSelect = (inp) => {
                inp.addEventListener('click', () => inp.select());
                inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
            };

            inputs.forEach((inp, idx) => {
                bindAutoSelect(inp);
                inp.addEventListener('input', () => {
                    let v = inp.value.replace(/\D/g, '');
                    if (v.length > 2) v = v.slice(0, 2);
                    const n = parseInt(v) || 0;
                    if (idx === 0 && n > 99) v = '99';
                    else if (idx > 0 && n > 59) v = '59';
                    inp.value = v;
                    if (v.length === 2 && idx < 2) inputs[idx + 1].focus();
                });
                inp.addEventListener('blur', () => {
                    if (inp.value === '' || inp.value === '0') inp.value = '00';
                    else inp.value = inp.value.padStart(2, '0');
                });
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this._performTimeAction();
                });
            });

            const vidH = sumContainer.querySelector('#vidStartH');
            const vidM = sumContainer.querySelector('#vidStartM');
            const vidS = sumContainer.querySelector('#vidStartS');
            [vidH, vidM, vidS].forEach(inp => {
                bindAutoSelect(inp);
                inp.addEventListener('input', () => {
                    let v = inp.value.replace(/\D/g, '');
                    if (v.length > 2) v = v.slice(0, 2);
                    inp.value = v;
                });
                inp.addEventListener('blur', () => {
                    if (inp.value === '') inp.value = '00';
                    else inp.value = inp.value.padStart(2, '0');
                });
            });

            sumContainer.querySelector('#timeActionBtn').addEventListener('click', () => this._performTimeAction());
            sumContainer.querySelector('#timeClearBtn').addEventListener('click', () => {
                if (!confirm('确定清空累计时间和记录？')) return;
                this.totalSeconds = 0;
                this.timeRecords = [];
                hInput.value = '00'; mInput.value = '00'; sInput.value = '00';
                this._updateTotalDisplay();
                this._renderTimeRecords();
            });
            sumContainer.querySelector('#timeModeBtn').addEventListener('click', () => this._toggleTimeMode());
        },

        _performTimeAction() {
            const h = parseInt(document.getElementById('timeH')?.value) || 0;
            const m = parseInt(document.getElementById('timeM')?.value) || 0;
            const s = parseInt(document.getElementById('timeS')?.value) || 0;
            const inputSeconds = h * 3600 + m * 60 + s;

            if (this.currentMode === 'accumulate') {
                const prevTotal = this.totalSeconds;
                this.totalSeconds += inputSeconds;
                const inputTime = this._fmtTime(h, m, s);
                const prevTime = this._fmtShort(prevTotal);
                const newTime = this._fmtShort(this.totalSeconds);
                const record = `${inputTime} + ${prevTime} → ${newTime}`;
                this.timeRecords.push(record);
            } else {
                const now = new Date();
                const nowStr = `${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
                let record = `${nowStr} | ${this._fmtTime(h, m, s)}`;
                const vh = parseInt(document.getElementById('vidStartH')?.value) || 0;
                const vm = parseInt(document.getElementById('vidStartM')?.value) || 0;
                const vs = parseInt(document.getElementById('vidStartS')?.value) || 0;
                if (vh > 0 || vm > 0 || vs > 0) {
                    const videoStartSec = vh * 3600 + vm * 60 + vs;
                    const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
                    let diffSec = nowSec - videoStartSec;
                    if (diffSec < 0) diffSec += 86400;
                    const dh = Math.floor(diffSec / 3600);
                    const dm = Math.floor((diffSec % 3600) / 60);
                    const ds = diffSec % 60;
                    record += ` | 视频内 ${dh}:${String(dm).padStart(2,'0')}:${String(ds).padStart(2,'0')}`;
                }
                this.timeRecords.push(record);
            }

            this._updateTotalDisplay();
            this._renderTimeRecords();

            document.getElementById('timeH').value = '00';
            document.getElementById('timeM').value = '00';
            document.getElementById('timeS').value = '00';
            document.getElementById('timeH').focus();
        },

        _toggleTimeMode() {
            const actionBtn = document.getElementById('timeActionBtn');
            const modeBtn = document.getElementById('timeModeBtn');
            const modeIndicator = document.getElementById('modeIndicator');

            if (this.currentMode === 'accumulate') {
                this.currentMode = 'timestamp';
                actionBtn.textContent = '📌 打戳';
                actionBtn.style.background = '#009e5f';
                modeBtn.textContent = '➕ 累加';
                modeBtn.style.background = '#f0f7ff';
                modeBtn.style.color = '#1677ff';
                modeBtn.style.borderColor = '#b3d8ff';
                if (modeIndicator) {
                    modeIndicator.textContent = '时间戳模式';
                    modeIndicator.style.background = '#fff7e6';
                    modeIndicator.style.color = '#ff7d00';
                }
            } else {
                this.currentMode = 'accumulate';
                actionBtn.textContent = '➕ 累加';
                actionBtn.style.background = '#1677ff';
                modeBtn.textContent = '📌 戳';
                modeBtn.style.background = '#f0faf5';
                modeBtn.style.color = '#009e5f';
                modeBtn.style.borderColor = '#b7ebd0';
                if (modeIndicator) {
                    modeIndicator.textContent = '累加模式';
                    modeIndicator.style.background = '#f0faf5';
                    modeIndicator.style.color = '#009e5f';
                }
            }
        },

        _fmtTime(h, m, s) {
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        },

        _fmtShort(totalSec) {
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            return `${m}分${String(s).padStart(2, '0')}秒`;
        },

        _updateTotalDisplay() {
            const display = document.getElementById('totalTimeValue');
            if (display) display.textContent = this._fmtShort(this.totalSeconds);
        },

        _renderTimeRecords() {
            const recordsDiv = document.getElementById('timeRecordList');
            if (!recordsDiv) return;
            if (this.timeRecords.length === 0) {
                recordsDiv.innerHTML = '<div style="color:#ccc;text-align:center;padding-top:12px;font-size:12px;">记录</div>';
                return;
            }
            const recent = this.timeRecords.slice(-20);
            let html = '';
            recent.forEach((r, i) => {
                const idx = this.timeRecords.length - recent.length + i + 1;
                html += `<div style="padding:1px 0;border-bottom:1px dotted #f0f0f0;font-size:11px;"><span style="color:#ccc;">${idx}</span> ${r}</div>`;
            });
            recordsDiv.innerHTML = html;
            recordsDiv.scrollTop = recordsDiv.scrollHeight;
        },

        // ========== 时间差计算器（新增自动全选） ==========
        _renderDiffModule() {
            const container = document.getElementById('diffModule');
            if (!container) return;

            container.innerHTML = `
                <h4>🕒 时间差计算器（时:分:秒 - 时:分:秒）</h4>
                <div class="time-group">
                    <label>开始：</label>
                    <input type="text" id="diffH1" placeholder="时" value="0">
                    <span>:</span>
                    <input type="text" id="diffM1" placeholder="分" value="0">
                    <span>:</span>
                    <input type="text" id="diffS1" placeholder="秒" value="0">
                </div>
                <div class="time-group">
                    <label>结束：</label>
                    <input type="text" id="diffH2" placeholder="时" value="0">
                    <span>:</span>
                    <input type="text" id="diffM2" placeholder="分" value="0">
                    <span>:</span>
                    <input type="text" id="diffS2" placeholder="秒" value="0">
                </div>
                <button id="diffBtn">计算差值（|开始 - 结束|）</button>
                <div class="result" id="diffResult"></div>
            `;

            // ★ 为所有时间差输入框添加自动全选
            ['diffH1','diffM1','diffS1','diffH2','diffM2','diffS2'].forEach(id => {
                const inp = document.getElementById(id);
                if (inp) {
                    inp.addEventListener('click', () => inp.select());
                    inp.addEventListener('focus', () => setTimeout(() => inp.select(), 0));
                }
            });

            document.getElementById('diffBtn').addEventListener('click', () => {
                const h1 = parseInt(document.getElementById('diffH1').value) || 0;
                const m1 = parseInt(document.getElementById('diffM1').value) || 0;
                const s1 = parseInt(document.getElementById('diffS1').value) || 0;
                const h2 = parseInt(document.getElementById('diffH2').value) || 0;
                const m2 = parseInt(document.getElementById('diffM2').value) || 0;
                const s2 = parseInt(document.getElementById('diffS2').value) || 0;

                const totalSec1 = h1 * 3600 + m1 * 60 + s1;
                const totalSec2 = h2 * 3600 + m2 * 60 + s2;
                const diffSec = Math.abs(totalSec1 - totalSec2);

                const h = Math.floor(diffSec / 3600);
                const m = Math.floor((diffSec % 3600) / 60);
                const s = Math.floor(diffSec % 60);

                document.getElementById('diffResult').innerText =
                    `差值：${diffSec} 秒 (${h}时${m}分${s}秒)`;
            });
        }
    };

    window.__modules = window.__modules || {};
    window.__modules['calc'] = module;

})(window);