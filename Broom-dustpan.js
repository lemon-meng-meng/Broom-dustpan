// ==UserScript==
// @name         OCR 一键识别 (Alt+Q)
// @namespace    https://example.com
// @version      1.5
// @description  浏览器内截图后按 Alt+Q 一键 OCR（使用者需自备 OCR.space 免费 API Key）
// @author       you
// @match        *://*/*
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @license      MIT
// @homepageURL  https://github.com/<你的用户名>/<仓库名>
// @supportURL   https://github.com/<你的用户名>/<仓库名>/issues
// ==/UserScript==

(() => {
    'use strict';

    // 1. 使用者把 OCR.space 免费 API Key 填到这里
    const OCR_API_KEY = 'YOUR_API_KEY_HERE';   // ← 留空或示例字符串，不暴露真实 Key

    async function ocrSpace(blob) {
        if (OCR_API_KEY === 'YOUR_API_KEY_HERE' || !OCR_API_KEY) {
            throw new Error('请先申请并替换 YOUR_API_KEY_HERE');
        }
        const form = new FormData();
        form.append('file', blob, 'clipboard.png');
        form.append('language', 'chs');
        form.append('isOverlayRequired', 'false');
        const res = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: form,
            headers: { apikey: OCR_API_KEY }
        });
        const data = await res.json();
        if (data.IsErroredOnProcessing) throw new Error(data.ErrorMessage);
        return data.ParsedResults?.[0]?.ParsedText || '';
    }

    async function main() {
        try {
            const items = await navigator.clipboard.read();
            const imgItem = items.find(i => i.types.includes('image/png'));
            if (!imgItem) {
                alert('剪贴板里没有图片！\n请先截图（Win+Shift+S 或 Cmd+Shift+4）再按 Alt+Q。');
                return;
            }
            const blob = await imgItem.getType('image/png');
            const ok = confirm('检测到剪贴板图片，是否进行 OCR？');
            if (!ok) return;
            const text = await ocrSpace(blob);
            if (!text.trim()) {
                alert('未识别到文字');
                return;
            }
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            GM_notification(`${text.length} 字已复制到剪贴板`, 'OCR 完成');
        } catch (err) {
            console.error(err);
            alert('出错了：' + err.message);
        }
    }

    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'q') {
            e.preventDefault();
            main();
        }
    });
    GM_registerMenuCommand('OCR 剪贴板图片', main, 'Q');
})();