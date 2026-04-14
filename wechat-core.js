// ============================================
// WeChat Core Engine
// 微信核心引擎 - 管理所有页面状态和渲染
// ============================================

export class WeChatCore {
    constructor(plugin) {
        this.plugin = plugin;
        this.currentPage = 'chatList'; // chatList | chat | contacts | moments | discover
        this.currentChat = null;
        this.pageHistory = [];
        this.chatMessages = {};
        this.chatList = [];
        this.contacts = [];
        this.moments = [];
        this.groups = [];
        this.selfUser = {
            id: 'self',
            name: '我',
            avatar: '',
            wxId: 'wxid_self'
        };
    }

    // 初始化自己的信息
    setSelfUser(info) {
        Object.assign(this.selfUser, info);
    }

    // SVG Icons
    static ICONS = {
        back: `<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
        more: `<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`,
        search: `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
        add: `<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
        voice: `<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>`,
        emoji: `<svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>`,
        plus: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/></svg>`,
        photo: `<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
        camera: `<svg viewBox="0 0 24 24"><path d="M12 15.2c1.77 0 3.2-1.43 3.2-3.2S13.77 8.8 12 8.8 8.8 10.23 8.8 12s1.43 3.2 3.2 3.2zM9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9z"/></svg>`,
        video: `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`,
        location: `<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
        redpacket: `<svg viewBox="0 0 24 24"><path fill="#E53935" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>`,
        transfer: `<svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>`,
        gift: `<svg viewBox="0 0 24 24"><path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/></svg>`,
        file: `<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zM13 9V3.5L18.5 9H13z"/></svg>`,
        heart: `<svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>`,
        wechat: `<svg viewBox="0 0 24 24"><path d="M8.5 7C5.47 7 3 9.13 3 11.75c0 1.37.66 2.62 1.73 3.5L4 17l1.97-.99c.7.27 1.49.42 2.32.46-.06-.3-.09-.61-.09-.93C8.2 12.85 10.97 11 14.2 11c.37 0 .74.03 1.1.08C14.76 8.76 11.88 7 8.5 7zM6.27 10c-.41 0-.75-.34-.75-.75S5.86 8.5 6.27 8.5s.75.34.75.75S6.68 10 6.27 10zm4.46 0c-.41 0-.75-.34-.75-.75S10.32 8.5 10.73 8.5s.75.34.75.75-.34.75-.75.75zM21 14.54c0-2.2-2.22-3.99-4.97-3.99-2.89 0-5.13 1.78-5.13 3.99s2.24 3.99 5.13 3.99c.6 0 1.18-.08 1.72-.22L19.5 19.5l-.54-1.62c.93-.75 1.54-1.81 1.54-2.99v-.35zm-6.43-.36c-.35 0-.63-.28-.63-.63s.28-.63.63-.63.63.28.63.63-.28.63-.63.63zm2.92 0c-.35 0-.63-.28-.63-.63s.28-.63.63-.63.63.28.63.63-.28.63-.63.63z"/></svg>`,
        contacts: `<svg viewBox="0 0 24 24"><path d="M12 5.9c1.16 0 2.1.94 2.1 2.1s-.94 2.1-2.1 2.1S9.9 9.16 9.9 8s.94-2.1 2.1-2.1m0 9c2.97 0 6.1 1.46 6.1 2.1v1.1H5.9V17c0-.64 3.13-2.1 6.1-2.1M12 4C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 9c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z"/></svg>`,
        discover: `<svg viewBox="0 0 24 24"><path d="M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z"/></svg>`,
        me: `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`,
    };

    // 格式化时间
    static formatTime(date) {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const diff = now - d;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);

        if (minutes < 1) return '刚刚';
        if (minutes < 60) return `${minutes}分钟前`;
        if (hours < 24 && d.getDate() === now.getDate()) {
            return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        }
        if (hours < 48) return '昨天';
        if (hours < 168) {
            const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return days[d.getDay()];
        }
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    static formatChatTime(date) {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const hours = d.getHours().toString().padStart(2, '0');
        const mins = d.getMinutes().toString().padStart(2, '0');
        const time = `${hours}:${mins}`;

        if (d.getDate() === now.getDate() && d.getMonth() === now.getMonth()) {
            return time;
        }
        if (now - d < 86400000 * 2) {
            return `昨天 ${time}`;
        }
        return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
    }

    // 生成唯一ID
    static genId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // 渲染头像
    static renderAvatar(user, size = 40, extraClass = '') {
        if (!user) {
            return `<div class="wechat-avatar ${extraClass}" style="width:${size}px;height:${size}px;min-width:${size}px">
                <div class="wechat-avatar-placeholder">?</div>
            </div>`;
        }

        if (user.avatar && user.avatar.trim()) {
            return `<div class="wechat-avatar ${extraClass}" style="width:${size}px;height:${size}px;min-width:${size}px">
                <img src="${this.sanitizeUrl(user.avatar)}" alt="${user.name}" 
                     onerror="this.parentElement.innerHTML='<div class=\\'wechat-avatar-placeholder\\'>${(user.name || '?')[0]}</div>'" />
            </div>`;
        }

        const colors = ['#7EC8E3', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C'];
        const colorIndex = (user.name || '').charCodeAt(0) % colors.length;
        const bgColor = colors[colorIndex];

        return `<div class="wechat-avatar ${extraClass}" style="width:${size}px;height:${size}px;min-width:${size}px">
            <div class="wechat-avatar-placeholder" style="background:${bgColor}">${(user.name || '?')[0]}</div>
        </div>`;
    }

    // 群聊头像(九宫格)
    static renderGroupAvatar(members, size = 40) {
        if (!members || members.length === 0) {
            return this.renderAvatar(null, size);
        }
        if (members.length === 1) {
            return this.renderAvatar(members[0], size);
        }

        const show = members.slice(0, 4);
        const imgSize = Math.floor((size - 4) / 2);
        let html = `<div class="wechat-avatar-group" style="width:${size}px;height:${size}px;min-width:${size}px">`;
        show.forEach(m => {
            if (m.avatar) {
                html += `<img src="${this.sanitizeUrl(m.avatar)}" style="width:${imgSize}px;height:${imgSize}px" />`;
            } else {
                const colors = ['#7EC8E3', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12'];
                const c = colors[((m.name || '').charCodeAt(0) || 0) % colors.length];
                html += `<div style="width:${imgSize}px;height:${imgSize}px;background:${c};display:flex;align-items:center;justify-content:center;color:white;font-size:${Math.floor(imgSize/2)}px">${(m.name || '?')[0]}</div>`;
            }
        });
        html += '</div>';
        return html;
    }

    // URL安全处理
    static sanitizeUrl(url) {
        if (!url) return '';
        // 支持本地文件路径
        if (url.startsWith('file://') || url.startsWith('/') || url.match(/^[A-Z]:\\/i)) {
            return url;
        }
        // 支持data URL
        if (url.startsWith('data:')) {
            return url;
        }
        // 支持http(s)
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        // 相对路径
        return url;
    }

    // 解析消息中的链接
    static parseLinks(text) {
        if (!text) return '';
        const urlRegex = /(https?:\/\/[^\s<]+)/g;
        return text.replace(urlRegex, '<a href="$1" target="_blank" style="color:var(--wechat-text-link)">$1</a>');
    }

    // 导航到页面
    navigateTo(page, data = null) {
        this.pageHistory.push({ page: this.currentPage, data: this.currentChat });
        this.currentPage = page;
        if (data) this.currentChat = data;
        this.plugin.render();
    }

    // 返回上一页
    goBack() {
        const prev = this.pageHistory.pop();
        if (prev) {
            this.currentPage = prev.page;
            this.currentChat = prev.data;
        } else {
            this.currentPage = 'chatList';
            this.currentChat = null;
        }
        this.plugin.render();
    }

    // 添加消息
    addMessage(chatId, message) {
        if (!this.chatMessages[chatId]) {
            this.chatMessages[chatId] = [];
        }
        message.id = message.id || WeChatCore.genId();
        message.time = message.time || new Date().toISOString();
        this.chatMessages[chatId].push(message);

        // 更新chatList最后消息
        const chat = this.chatList.find(c => c.id === chatId);
        if (chat) {
            chat.lastMsg = this.getMessagePreview(message);
            chat.lastTime = message.time;
            chat.unread = (chat.unread || 0) + (message.senderId !== 'self' ? 1 : 0);
        }

        return message;
    }

    // 获取消息预览文本
    getMessagePreview(msg) {
        switch (msg.type) {
            case 'text': return msg.content;
            case 'image': return '[图片]';
            case 'gif': return '[动图]';
            case 'video': return '[视频]';
            case 'voice': return '[语音]';
            case 'redpacket': return '[红包]';
            case 'transfer': return '[转账]';
            case 'link': return `[链接] ${msg.title || ''}`;
            case 'file': return `[文件] ${msg.fileName || ''}`;
            case 'location': return `[位置] ${msg.locationName || ''}`;
            case 'gift': return `[礼物] ${msg.giftName || ''}`;
            case 'system': return msg.content;
            default: return '';
        }
    }

    // 获取聊天消息
    getMessages(chatId) {
        return this.chatMessages[chatId] || [];
    }

    // 查找联系人
    findContact(id) {
        return this.contacts.find(c => c.id === id);
    }

    // 查找群组
    findGroup(id) {
        return this.groups.find(g => g.id === id);
    }

    // 获取聊天对象信息
    getChatInfo(chatId) {
        const chat = this.chatList.find(c => c.id === chatId);
        if (!chat) return null;

        if (chat.isGroup) {
            const group = this.findGroup(chatId);
            return { ...chat, ...group };
        }

        const contact = this.findContact(chatId);
        return { ...chat, ...contact };
    }
}

export default WeChatCore;
