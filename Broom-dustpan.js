// ==UserScript==
// @name         OCR 一键识别 (Alt+Q)
// @namespace    https://github.com/lemon-meng-meng/Broom-dustpan
// @version      1.7.0
// @description  浏览器内截图后按 Alt+Q 一键 OCR（使用者需自备 OCR.space 免费 API Key）
// @author       lemon-meng-meng
// @match        *://*/*
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @license      MIT
// @homepageURL  https://github.com/lemon-meng-meng/Broom-dustpan
// @supportURL   https://github.com/lemon-meng-meng/Broom-dustpan/issues
// @updateURL    https://raw.githubusercontent.com/lemon-meng-meng/Broom-dustpan/main/OCR%E8%84%9A%E6%9C%AC%EF%BC%88%E4%B8%AA%E4%BA%BA%E7%94%A8%EF%BC%89.js
// ==/UserScript==

(() => {
    'use strict';

    const CONFIG = {
        OCR_API_KEY: null,
        IMAGE_TYPE_MAPPING: {
            'image/png': 'PNG',
            'image/jpeg': 'JPG',
            'image/jpg': 'JPG',
            'image/webp': 'WEBP',
            'image/bmp': 'BMP',
            'image/gif': 'GIF'
        }
    };

    function initConfig() {
        CONFIG.OCR_API_KEY = GM_getValue('OCR_API_KEY', '');
    }

    function registerApiKeyMenu() {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('设置 OCR API Key', () => {
                const currentKey = GM_getValue('OCR_API_KEY', '');
                const newKey = prompt(
                    '🔑 设置 OCR.space API Key\n\n' +
                    '免费获取步骤：\n' +
                    '1. 访问 https://ocr.space/ocrapi/freekey\n' +
                    '2. 输入邮箱获取免费 Key\n' +
                    '3. 将 Key 粘贴到此处\n\n' +
                    '当前 Key：' + (currentKey ? '***' + currentKey.slice(-4) : '未设置'),
                    currentKey || ''
                );
                
                if (newKey !== null) {
                    const trimmedKey = newKey.trim();
                    if (trimmedKey) {
                        GM_setValue('OCR_API_KEY', trimmedKey);
                        CONFIG.OCR_API_KEY = trimmedKey;
                        GM_notification({
                            title: '设置成功',
                            text: 'API Key 已更新',
                            timeout: 3000
                        });
                    } else if (currentKey) {
                        const confirmClear = confirm('确定要清空 API Key 吗？\n清空后将无法使用OCR功能。');
                        if (confirmClear) {
                            GM_setValue('OCR_API_KEY', '');
                            CONFIG.OCR_API_KEY = '';
                            GM_notification({
                                title: '设置成功',
                                text: 'API Key 已清空',
                                timeout: 3000
                            });
                        }
                    }
                }
            }, 'K');
        }
    }

    function validateApiKey() {
        if (!CONFIG.OCR_API_KEY || CONFIG.OCR_API_KEY.trim() === '') {
            throw new Error('请先设置 OCR API Key\n\n点击Tampermonkey图标 → OCR 一键识别 → 设置 OCR API Key');
        }
        if (CONFIG.OCR_API_KEY.length < 10) {
            throw new Error('API Key 格式不正确\n长度至少应为10个字符');
        }
    }

    async function ocrSpace(blob, fileType) {
        validateApiKey();

        const filetype = CONFIG.IMAGE_TYPE_MAPPING[fileType] || 'PNG';
        const fileName = `screenshot_${Date.now()}.${filetype.toLowerCase()}`;
        
        const form = new FormData();
        const fileBlob = new Blob([blob], { type: fileType || 'image/png' });
        form.append('file', fileBlob, fileName);
        form.append('language', 'chs');
        form.append('isOverlayRequired', 'false');
        form.append('detectOrientation', 'true');
        form.append('scale', 'true');
        form.append('OCREngine', '2');
        form.append('filetype', filetype); // 关键修复

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const res = await fetch('https://api.ocr.space/parse/image', {
                method: 'POST',
                body: form,
                headers: { apikey: CONFIG.OCR_API_KEY },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            const responseText = await res.text();
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (e) {
                throw new Error(`响应解析失败: ${responseText.substring(0, 100)}`);
            }
            
            if (!res.ok || data.IsErroredOnProcessing) {
                let errorMsg = data.ErrorMessage || data.ErrorDetails || `HTTP ${res.status}`;
                
                if (errorMsg.includes('Unable to recognize the file type') || 
                    errorMsg.includes('E216') ||
                    errorMsg.includes('file extension')) {
                    
                    // 尝试备用方案
                    return await ocrSpaceAlternative(blob, fileType);
                }
                
                if (errorMsg.includes('Invalid API key') || errorMsg.includes('unauthorized')) {
                    throw new Error('API Key 无效或已过期\n请重新获取：https://ocr.space/ocrapi/freekey');
                }
                
                throw new Error(errorMsg);
            }

            const allText = data.ParsedResults
                ?.map(result => result.ParsedText?.trim() || '')
                .filter(text => text.length > 0)
                .join('\n\n') || '';

            return allText;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('识别超时，请稍后重试');
            }
            throw error;
        }
    }

    async function ocrSpaceAlternative(blob, fileType) {
        try {
            const base64Data = await blobToBase64(blob);
            const filetype = CONFIG.IMAGE_TYPE_MAPPING[fileType] || 'PNG';
            
            const formData = new FormData();
            formData.append('base64Image', `data:${fileType};base64,${base64Data}`);
            formData.append('language', 'chs');
            formData.append('isOverlayRequired', 'false');
            formData.append('detectOrientation', 'true');
            formData.append('scale', 'true');
            formData.append('OCREngine', '2');
            formData.append('filetype', filetype);
            
            const res = await fetch('https://api.ocr.space/parse/image', {
                method: 'POST',
                body: formData,
                headers: { apikey: CONFIG.OCR_API_KEY }
            });
            
            const data = await res.json();
            
            if (data.IsErroredOnProcessing) {
                throw new Error(data.ErrorMessage || 'OCR处理失败');
            }
            
            return data.ParsedResults?.[0]?.ParsedText?.trim() || '';
        } catch (error) {
            console.error('备用方案失败:', error);
            throw new Error('文件类型不支持\n建议：重新截图或保存为PNG格式');
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function getImageFromClipboard() {
        try {
            if (!navigator.clipboard || !navigator.clipboard.read) {
                throw new Error('浏览器不支持剪贴板读取功能');
            }

            const items = await navigator.clipboard.read();
            
            for (const item of items) {
                for (const type in CONFIG.IMAGE_TYPE_MAPPING) {
                    if (item.types.includes(type)) {
                        try {
                            const blob = await item.getType(type);
                            if (blob && blob.size > 0) {
                                return { blob, type };
                            }
                        } catch (e) {
                            console.warn(`获取 ${type} 失败:`, e);
                        }
                    }
                }
            }
            
            for (const item of items) {
                for (const type of item.types) {
                    if (type.startsWith('image/')) {
                        try {
                            const blob = await item.getType(type);
                            if (blob && blob.size > 0) {
                                return { blob, type };
                            }
                        } catch (e) {
                            console.warn(`获取 ${type} 失败:`, e);
                        }
                    }
                }
            }
            
            return null;
        } catch (error) {
            console.error('剪贴板读取失败:', error);
            
            if (error.name === 'NotAllowedError') {
                throw new Error('需要剪贴板读取权限\n请点击地址栏左侧的权限图标，允许剪贴板访问');
            } else if (error.name === 'DataError') {
                throw new Error('剪贴板数据读取失败\n请确保剪贴板中包含图片');
            }
            
            throw error;
        }
    }

    async function main() {
        try {
            GM_notification({
                title: 'OCR 处理中',
                text: '正在检查剪贴板...',
                timeout: 3000,
                silent: true
            });

            const imgData = await getImageFromClipboard();
            
            if (!imgData) {
                throw new Error('剪贴板中没有检测到图片\n请先截图（Win+Shift+S / Cmd+Shift+4）');
            }

            const { blob, type } = imgData;
            
            if (blob.size > 1024 * 1024) {
                throw new Error(`图片过大 (${Math.round(blob.size / 1024)}KB)\n最大支持 1MB`);
            }

            if (blob.size === 0) {
                throw new Error('图片为空\n请重新截图');
            }

            const ok = confirm(`检测到 ${type} 格式图片 (${Math.round(blob.size / 1024)}KB)\n是否进行 OCR 文字识别？\n\n注意：图片将发送至 OCR.space 服务器处理`);
            if (!ok) return;

            GM_notification({
                title: 'OCR 处理中',
                text: '正在识别文字...',
                timeout: 5000,
                silent: true
            });

            const text = await ocrSpace(blob, type);
            
            if (!text || text.trim() === '') {
                throw new Error('未识别到文字\n请确保图片清晰且包含文字');
            }

            await copyToClipboard(text);

            const preview = text.length > 60 ? text.substring(0, 60) + '...' : text;
            const charCount = text.replace(/\s/g, '').length;
            
            GM_notification({
                title: 'OCR 完成 ✓',
                text: `已识别 ${text.length} 字符 (${charCount} 字)\n${preview}`,
                timeout: 8000,
                onclick: () => {
                    showResultDialog(text);
                }
            });

        } catch (err) {
            console.error('OCR 错误:', err);
            
            GM_notification({
                title: 'OCR 失败',
                text: err.message.split('\n')[0],
                timeout: 5000
            });
            
            setTimeout(() => {
                if (err.message.includes('API Key')) {
                    alert(`${err.message}\n\n免费获取 API Key:\n1. 访问 https://ocr.space/ocrapi/freekey\n2. 输入邮箱获取 Key\n3. 点击Tampermonkey图标 → 设置 OCR API Key`);
                } else if (err.message.includes('文件类型不支持')) {
                    alert(`${err.message}\n\n解决方案：\n1. 重新截图\n2. 截图后保存为PNG格式\n3. 使用截图工具的"复制为PNG"功能`);
                } else if (err.message.includes('权限')) {
                    alert(`${err.message}\n\n解决方法:\n1. 点击浏览器地址栏左侧的权限图标\n2. 允许"剪贴板"权限\n3. 重新截图尝试`);
                } else {
                    alert(`错误: ${err.message}`);
                }
            }, 100);
        }
    }

    async function copyToClipboard(text) {
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text, 'text');
                return;
            }
            
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, text.length);
            
            const success = document.execCommand('copy');
            document.body.removeChild(ta);
            
            if (!success) {
                throw new Error('复制失败');
            }
        } catch (error) {
            console.warn('剪贴板写入失败:', error);
            throw new Error('复制到剪贴板失败\n请手动复制文本');
        }
    }

    function showResultDialog(text) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 8px 40px rgba(0,0,0,0.2);
            max-width: 500px;
            max-height: 80vh;
            overflow: auto;
            font-family: system-ui, -apple-system, sans-serif;
        `;
        
        const title = document.createElement('h3');
        title.textContent = 'OCR 识别结果';
        title.style.marginTop = '0';
        
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = `
            width: 100%;
            height: 200px;
            margin: 10px 0;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-family: 'Segoe UI', monospace;
            font-size: 14px;
            line-height: 1.5;
            resize: vertical;
            box-sizing: border-box;
        `;
        
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'text-align:center;margin-top:15px;';
        
        const copyBtn = document.createElement('button');
        copyBtn.textContent = '复制';
        copyBtn.style.cssText = 'margin-right:10px;padding:5px 15px;cursor:pointer;';
        copyBtn.onclick = () => {
            copyToClipboard(text);
            copyBtn.textContent = '已复制!';
            copyBtn.style.background = '#4CAF50';
            copyBtn.style.color = 'white';
            setTimeout(() => {
                copyBtn.textContent = '复制';
                copyBtn.style.background = '';
                copyBtn.style.color = '';
            }, 2000);
        };
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '关闭';
        closeBtn.style.cssText = 'padding:5px 15px;cursor:pointer;';
        closeBtn.onclick = () => {
            document.body.removeChild(overlay);
        };
        
        buttonContainer.appendChild(copyBtn);
        buttonContainer.appendChild(closeBtn);
        
        dialog.appendChild(title);
        dialog.appendChild(textarea);
        dialog.appendChild(buttonContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        };
        
        textarea.focus();
        textarea.select();
    }

    document.addEventListener('keydown', (e) => {
        if (e.altKey && e.key === 'q' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            main();
        }
    }, true);

    function init() {
        initConfig();
        
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('OCR 剪贴板图片 (Alt+Q)', main, 'Q');
            registerApiKeyMenu();
            
            GM_registerMenuCommand('使用帮助', () => {
                alert(`OCR 一键识别 v1.7.0\n\n使用方法:\n1. 截图到剪贴板 (Win+Shift+S / Cmd+Shift+4)\n2. 按 Alt+Q 或点击菜单\n3. 自动识别并复制文字\n\n首次使用需设置 API Key:\n1. 访问 https://ocr.space/ocrapi/freekey\n2. 输入邮箱获取免费 Key\n3. 点击Tampermonkey图标 → 设置 OCR API Key\n\n如遇文件类型错误，请使用PNG格式截图`);
            }, 'H');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
