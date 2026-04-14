// ============================================
// SillyTavern WeChat UI Plugin - Main Entry
// 微信UI插件主入口
// ============================================

import { WeChatCore } from './wechat-core.js';
import { WeChatMedia } from './wechat-media.js';
import { WeChatMoments } from './wechat-moments.js';
import { WeChatGifts } from './wechat-gifts.js';
import { WorldBookReader } from './worldbook-reader.js';

(function () {
    // 获取 SillyTavern 的API
    const getContext = () => {
        try {
            return SillyTavern.getContext();
        } catch (e) {
            return null;
        }
    };

    const getEventSource = () => {
        try {
            return window.eventSource || (SillyTavern && SillyTavern.getContext()?.eventSource);
        } catch (e) {
            return null;
        }
    };

    const getEventTypes = () => {
        try {
            return window.event_types || (SillyTavern && SillyTavern.getContext()?.event_types);
        } catch (e) {
            return null;
        }
    };

    class WeChatPlugin {
        constructor() {
            this.core = new WeChatCore(this);
            this.media = new WeChatMedia(this);
            this.moments = new WeChatMoments(this);
            this.gifts = new WeChatGifts(this);
            this.worldBookReader = new WorldBookReader(this);

            this.container = null;
            this.toggleBtn = null;
            this.isVisible = true;
            this.currentTab = 'chat'; // chat | contacts | discover | me
            this.showExtraPanel = false;
            this.contextMenu = null;

            // 暴露到全局以供事件处理
            window.wechatPlugin = this;
        }

        // 初始化
        async init() {
            console.log('[WeChat Plugin] 初始化中...');

            // 加载世界书数据
            await this.worldBookReader.loadWorldBook();

            // 创建UI
            this.createContainer();
            this.createToggleButton();

            // 绑定ST事件
            this.bindSTEvents();

            // 初始渲染
            this.render();

            console.log('[WeChat Plugin] 初始化完成 ✓');
        }

        // 创建主容器
        createContainer() {
            this.container = document.createElement('div');
            this.container.id = 'wechat-plugin-container';
            document.body.appendChild(this.container);
        }

        // 创建切换按钮
        createToggleButton() {
            this.toggleBtn = document.createElement('button');
            this.toggleBtn.id = 'wechat-toggle-btn';
            this.toggleBtn.innerHTML = WeChatCore.ICONS.wechat;
            this.toggleBtn.title = '微信界面';
            this.toggleBtn.addEventListener('click', () => this.toggleVisibility());
            document.body.appendChild(this.toggleBtn);
        }

        // 切换显示
        toggleVisibility() {
            this.isVisible = !this.isVisible;
            if (this.isVisible) {
                this.container.classList.remove('wechat-hidden');
                this.toggleBtn.classList.remove('wechat-btn-hidden');
            } else {
                this.container.classList.add('wechat-hidden');
                this.toggleBtn.classList.add('wechat-btn-hidden');
            }
        }

        // 绑定SillyTavern事件
        bindSTEvents() {
            const eventSource = getEventSource();
            const eventTypes = getEventTypes();

            if (!eventSource || !eventTypes) {
                console.warn('[WeChat] 无法获取ST事件系统，将使用定时轮询');
                this.startPolling();
                return;
            }

            // 监听消息生成完成
            if (eventTypes.MESSAGE_RECEIVED) {
                eventSource.on(eventTypes.MESSAGE_RECEIVED, (msgId) => {
                    this.onSTMessageReceived(msgId);
                });
            }

            if (eventTypes.GENERATION_ENDED) {
                eventSource.on(eventTypes.GENERATION_ENDED, () => {
                    this.onSTGenerationEnded();
                });
            }

            // 监听角色切换
            if (eventTypes.CHAT_CHANGED) {
                eventSource.on(eventTypes.CHAT_CHANGED, () => {
                    this.onSTChatChanged();
                });
            }

            // 监听消息发送
            if (eventTypes.MESSAGE_SENT) {
                eventSource.on(eventTypes.MESSAGE_SENT, (msgId) => {
                    this.onSTMessageSent(msgId);
                });
            }
        }

        // 轮询模式
        startPolling() {
            let lastMsgCount = 0;
            setInterval(() => {
                const context = getContext();
                if (!context || !context.chat) return;

                if (context.chat.length !== lastMsgCount) {
                    lastMsgCount = context.chat.length;
                    this.syncFromSTChat();
                }
            }, 1000);
        }

        // 从ST聊天同步消息
        syncFromSTChat() {
            const context = getContext();
            if (!context || !context.chat) return;

            const charName = context.name2 || '角色';
            const charAvatar = context.characters?.[context.characterId]?.avatar || '';

            // 确保当前角色在联系人中
            let charContact = this.core.contacts.find(c => c.name === charName);
            if (!charContact) {
                charContact = {
                    id: 'st_char_' + (context.characterId || '0'),
                    name: charName,
                    avatar: charAvatar ? `/characters/${charAvatar}` : '',
                    wxId: charName.toLowerCase().replace(/\s/g, '_')
                };
                this.core.contacts.push(charContact);

                // 添加到聊天列表
                if (!this.core.chatList.find(c => c.id === charContact.id)) {
                    this.core.chatList.unshift({
                        id: charContact.id,
                        name: charName,
                        avatar: charContact.avatar,
                        isGroup: false,
                        lastMsg: '',
                        lastTime: new Date().toISOString(),
                        unread: 0
                    });
                }
            }

            // 同步消息
            const chatId = charContact.id;
            const existingMsgs = this.core.getMessages(chatId);
            const stChat = context.chat;

            // 只处理新消息
            for (let i = existingMsgs.length; i < stChat.length; i++) {
                const stMsg = stChat[i];
                const isUser = stMsg.is_user;

                // 解析消息内容
                const parsedMsgs = this.parseSTMessage(stMsg.mes, isUser ? 'self' : charContact.id, charContact);

                parsedMsgs.forEach(msg => {
                    this.core.addMessage(chatId, msg);
                });
            }

            this.render();
        }

        // 解析ST消息，提取媒体内容
        parseSTMessage(text, senderId, contact) {
            const messages = [];
            let remainingText = text;

            // 提取图片标记 [图片:url] 或 [photo:url] 或 <img src="url">
            const imgPatterns = [
                /\[(?:图片|photo|img)[:\s]+([^\]]+)\]/gi,
                /<img[^>]+src=["']([^"']+)["'][^>]*>/gi,
                /!\[([^\]]*)\]\(([^)]+)\)/gi, // markdown
            ];

            imgPatterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(remainingText)) !== null) {
                    const url = match[2] || match[1];
                    if (WeChatMedia.isGifUrl(url)) {
                        messages.push({
                            type: 'gif',
                            senderId: senderId,
                            url: url,
                            time: new Date().toISOString()
                        });
                    } else {
                        messages.push({
                            type: 'image',
                            senderId: senderId,
                            url: url,
                            time: new Date().toISOString()
                        });
                    }
                }
                remainingText = remainingText.replace(pattern, '');
            });

            // 提取视频标记
            const videoPatterns = [
                /\[(?:视频|video)[:\s]+([^\]]+)\]/gi,
                /<video[^>]+src=["']([^"']+)["'][^>]*>/gi,
            ];

            videoPatterns.forEach(pattern => {
                let match;
                while ((match = pattern.exec(remainingText)) !== null) {
                    const url = match[1];
                    messages.push({
                        type: 'video',
                        senderId: senderId,
                        url: url,
                        time: new Date().toISOString()
                    });
                }
                remainingText = remainingText.replace(pattern, '');
            });

            // 提取红包标记
            const redpacketPattern = /\[(?:红包|redpacket)[:\s]*([^\]]*)\]/gi;
            let rpMatch;
            while ((rpMatch = redpacketPattern.exec(remainingText)) !== null) {
                messages.push({
                    type: 'redpacket',
                    senderId: senderId,
                    text: rpMatch[1] || '恭喜发财，大吉大利',
                    time: new Date().toISOString()
                });
            }
            remainingText = remainingText.replace(redpacketPattern, '');

            // 提取转账标记
            const transferPattern = /\[(?:转账|transfer)[:\s]*([^\]]*)\]/gi;
            let trMatch;
            while ((trMatch = transferPattern.exec(remainingText)) !== null) {
                const amountMatch = trMatch[1].match(/([\d.]+)/);
                messages.push({
                    type: 'transfer',
                    senderId: senderId,
                    amount: amountMatch ? amountMatch[1] : '0.00',
                    desc: trMatch[1].replace(/([\d.]+)/, '').trim() || '转账',
                    time: new Date().toISOString()
                });
            }
            remainingText = remainingText.replace(transferPattern, '');

            // 提取礼物标记
            const giftPattern = /\[(?:礼物|gift)[:\s]*([^\]]*)\]/gi;
            let giftMatch;
            while ((giftMatch = giftPattern.exec(remainingText)) !== null) {
                const giftName = giftMatch[1].trim();
                const gift = WeChatGifts.GIFT_LIST.find(g =>
                    g.name === giftName || g.id === giftName
                ) || WeChatGifts.GIFT_LIST[0];

                messages.push({
                    type: 'gift',
                    senderId: senderId,
                    giftId: gift.id,
                    giftName: gift.name,
                    giftIcon: gift.icon,
                    giftPrice: gift.price,
                    giftDesc: gift.desc,
                    time: new Date().toISOString()
                });
            }
            remainingText = remainingText.replace(giftPattern, '');

            // 提取朋友圈标记
            const momentPattern = /\[(?:朋友圈|moment)\]([\s\S]*?)\[\/(?:朋友圈|moment)\]/gi;
            let momentMatch;
            while ((momentMatch = momentPattern.exec(remainingText)) !== null) {
                const momentData = this.moments.parseMomentFromText(momentMatch[1], senderId);
                // 如果没有图片，尝试从世界书获取
                if (momentData.images.length === 0 && contact) {
                    const media = this.worldBookReader.getAllMedia(contact.id);
                    if (media.photos.length > 0) {
                        const count = Math.min(3, media.photos.length);
                        for (let i = 0; i < count; i++) {
                            momentData.images.push(media.photos[Math.floor(Math.random() * media.photos.length)]);
                        }
                    }
                }
                this.moments.addMoment(momentData);
            }
            remainingText = remainingText.replace(momentPattern, '');

            // 如果消息中提到发送照片但没有实际URL，从世界书获取
            if (senderId !== 'self' && contact) {
                const sendPhotoKeywords = ['发.*照片', '发.*图片', '给.*看看', '发张.*给你', '这是.*照片', '拍了.*照'];
                const hasPhotoKeyword = sendPhotoKeywords.some(kw => new RegExp(kw).test(remainingText));

                if (hasPhotoKeyword && messages.filter(m => m.type === 'image').length === 0) {
                    const photoUrl = this.worldBookReader.getRandomMedia(contact.id, 'photo');
                    if (photoUrl) {
                        messages.push({
                            type: 'image',
                            senderId: senderId,
                            url: photoUrl,
                            time: new Date().toISOString()
                        });
                    }
                }

                // 视频关键词
                const sendVideoKeywords = ['发.*视频', '录.*视频', '这是.*视频'];
                const hasVideoKeyword = sendVideoKeywords.some(kw => new RegExp(kw).test(remainingText));
                if (hasVideoKeyword && messages.filter(m => m.type === 'video').length === 0) {
                    const videoUrl = this.worldBookReader.getRandomMedia(contact.id, 'video');
                    if (videoUrl) {
                        messages.push({
                            type: 'video',
                            senderId: senderId,
                            url: videoUrl,
                            time: new Date().toISOString()
                        });
                    }
                }
            }

            // 剩余文字作为文本消息
            remainingText = remainingText.replace(/<[^>]+>/g, '').trim();
            if (remainingText) {
                messages.unshift({
                    type: 'text',
                    senderId: senderId,
                    content: remainingText,
                    time: new Date().toISOString()
                });
            }

            // 如果没有解析出任何消息，至少保留原文
            if (messages.length === 0) {
                messages.push({
                    type: 'text',
                    senderId: senderId,
                    content: text,
                    time: new Date().toISOString()
                });
            }

            return messages;
        }

        // ST事件处理
        onSTMessageReceived(msgId) {
            this.syncFromSTChat();
        }

        onSTGenerationEnded() {
            setTimeout(() => this.syncFromSTChat(), 500);
        }

        onSTChatChanged() {
            this.syncFromSTChat();
        }

        onSTMessageSent(msgId) {
            this.syncFromSTChat();
        }

        // ==========================================
        // 渲染系统
        // ==========================================

        render() {
            if (!this.container) return;

            let html = '';

            switch (this.core.currentPage) {
                case 'chatList':
                    html = this.renderMainPage();
                    break;
                case 'chat':
                    html = this.renderChatPage();
                    break;
                case 'contacts':
                    html = this.renderMainPage();
                    break;
                case 'moments':
                    html = this.renderMomentsPage();
                    break;
                case 'discover':
                    html = this.renderMainPage();
                    break;
                case 'me':
                    html = this.renderMainPage();
                    break;
            }

            this.container.innerHTML = html;
            this.bindEvents();

            // 滚动到底部
            if (this.core.currentPage === 'chat') {
                const msgContainer = this.container.querySelector('.wechat-chat-messages');
                if (msgContainer) {
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                }
            }
        }

        // 渲染主页面（含标签栏）
        renderMainPage() {
            let pageContent = '';

            switch (this.currentTab) {
                case 'chat':
                    pageContent = this.renderChatList();
                    break;
                case 'contacts':
                    pageContent = this.renderContacts();
                    break;
                case 'discover':
                    pageContent = this.renderDiscover();
                    break;
                case 'me':
                    pageContent = this.renderMe();
                    break;
            }

            const tabTitles = {
                chat: '微信',
                contacts: '通讯录',
                discover: '发现',
                me: '我'
            };

            return `
                <!-- Navbar -->
                <div class="wechat-navbar">
                    <div class="wechat-navbar-left">
                        <span class="wechat-navbar-title">${tabTitles[this.currentTab]}</span>
                    </div>
                    <div class="wechat-navbar-right">
                        <button class="wechat-navbar-icon" id="wechat-search-btn" title="搜索">
                            ${WeChatCore.ICONS.search}
                        </button>
                        <button class="wechat-navbar-icon" id="wechat-add-btn" title="添加">
                            ${WeChatCore.ICONS.add}
                        </button>
                    </div>
                </div>

                <!-- Page Content -->
                <div class="wechat-page">
                    ${pageContent}
                </div>

                <!-- Tab Bar -->
                ${this.renderTabBar()}
            `;
        }

        // 渲染标签栏
        renderTabBar() {
            const tabs = [
                { id: 'chat', label: '微信', icon: WeChatCore.ICONS.wechat },
                { id: 'contacts', label: '通讯录', icon: WeChatCore.ICONS.contacts },
                { id: 'discover', label: '发现', icon: WeChatCore.ICONS.discover },
                { id: 'me', label: '我', icon: WeChatCore.ICONS.me },
            ];

            const totalUnread = this.core.chatList.reduce((sum, c) => sum + (c.unread || 0), 0);

            return `
                <div class="wechat-tabbar">
                    ${tabs.map(tab => `
                        <button class="wechat-tab-item ${this.currentTab === tab.id ? 'active' : ''}"
                                data-tab="${tab.id}">
                            ${tab.icon}
                            ${tab.id === 'chat' && totalUnread > 0 ?
                                `<span class="wechat-tab-badge">${totalUnread > 99 ? '99+' : totalUnread}</span>` : ''}
                            <span>${tab.label}</span>
                        </button>
                    `).join('')}
                </div>
            `;
        }

        // 渲染聊天列表
        renderChatList() {
            // 按时间排序，置顶的在前
            const sortedList = [...this.core.chatList].sort((a, b) => {
                if (a.pinned && !b.pinned) return -1;
                if (!a.pinned && b.pinned) return 1;
                return new Date(b.lastTime) - new Date(a.lastTime);
            });

            let html = `
                <div class="wechat-search-bar">
                    <input type="text" class="wechat-search-input" placeholder="搜索" id="wechat-chat-search" />
                </div>
            `;

            if (sortedList.length === 0) {
                html += `
                    <div style="text-align:center;padding:60px 20px;color:var(--wechat-text-secondary)">
                        <div style="font-size:48px;margin-bottom:12px">💬</div>
                        <div>暂无聊天记录</div>
                        <div style="font-size:13px;margin-top:8px">当前ST角色的对话会自动显示在这里</div>
                    </div>
                `;
            }

            sortedList.forEach(chat => {
                const isGroup = chat.isGroup;
                const avatarHtml = isGroup
                    ? this.renderGroupChatAvatar(chat)
                    : WeChatCore.renderAvatar(chat, 48);

                html += `
                    <div class="wechat-chat-list-item ${chat.pinned ? 'pinned' : ''} ${chat.muted ? 'muted' : ''}"
                         data-chat-id="${chat.id}" 
                         data-is-group="${isGroup}">
                        <div style="position:relative">
                            ${avatarHtml}
                            ${chat.unread > 0 ? `<span class="wechat-avatar-badge">${chat.unread > 99 ? '99+' : chat.unread}</span>` : ''}
                        </div>
                        <div class="wechat-chat-list-content">
                            <div class="wechat-chat-list-top">
                                <span class="wechat-chat-list-name">
                                    ${chat.name}
                                    ${isGroup ? `(${chat.memberCount || ''})` : ''}
                                </span>
                                <span class="wechat-chat-list-time">
                                    ${WeChatCore.formatTime(chat.lastTime)}
                                </span>
                            </div>
                            <div class="wechat-chat-list-msg">
                                ${chat.draft ? `<span class="draft">[草稿]</span> ${chat.draft}` :
                                    (chat.lastMsg || '暂无消息')}
                            </div>
                        </div>
                    </div>
                `;
            });

            return html;
        }

        renderGroupChatAvatar(chat) {
            const group = this.core.findGroup(chat.id);
            if (group && group.members) {
                return WeChatCore.renderGroupAvatar(group.members, 48);
            }
            return WeChatCore.renderAvatar(chat, 48);
        }

        // 渲染通讯录
        renderContacts() {
            const specialItems = [
                { icon: '👥', name: '新的朋友', color: '#FA9D3B' },
                { icon: '👫', name: '群聊', color: '#07C160' },
                { icon: '🏷️', name: '标签', color: '#576B95' },
                { icon: '🔔', name: '公众号', color: '#576B95' },
            ];

            let html = `
                <div class="wechat-search-bar">
                    <input type="text" class="wechat-search-input" placeholder="搜索" />
                </div>
                <div class="wechat-contacts-section">
                    ${specialItems.map(item => `
                        <div class="wechat-contacts-header">
                            <div class="wechat-contacts-header-icon" style="background:${item.color}">${item.icon}</div>
                            <span class="wechat-contact-name">${item.name}</span>
                        </div>
                    `).join('')}
                </div>
            `;

            // 按首字母分组
            const grouped = {};
            this.core.contacts.forEach(contact => {
                const firstChar = (contact.name || '?')[0].toUpperCase();
                const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
                if (!grouped[letter]) grouped[letter] = [];
                grouped[letter].push(contact);
            });

            const sortedLetters = Object.keys(grouped).sort();
            sortedLetters.forEach(letter => {
                html += `<div class="wechat-contacts-letter">${letter}</div>`;
                grouped[letter].forEach(contact => {
                    html += `
                        <div class="wechat-contact-item" data-contact-id="${contact.id}">
                            ${WeChatCore.renderAvatar(contact, 40)}
                            <span class="wechat-contact-name">${contact.remark || contact.name}</span>
                        </div>
                    `;
                });
            });

            html += `
                <div style="text-align:center;padding:16px;color:var(--wechat-text-secondary);font-size:13px">
                    ${this.core.contacts.length}位联系人
                </div>
            `;

            return html;
        }

        // 渲染发现页
        renderDiscover() {
            const items = [
                { icon: '🔵', name: '朋友圈', action: 'moments', hasNew: true },
                { icon: '📹', name: '视频号', action: '', divider: true },
                { icon: '🔍', name: '扫一扫', action: '' },
                { icon: '🤝', name: '摇一摇', action: '', divider: true },
                { icon: '📺', name: '看一看', action: '' },
                { icon: '🔎', name: '搜一搜', action: '', divider: true },
                { icon: '🎮', name: '游戏', action: '' },
                { icon: '🛍️', name: '购物', action: '' },
            ];

            let html = '<div style="padding-top:8px">';

            items.forEach((item, i) => {
                if (item.divider && i > 0) {
                    html += '<div style="height:8px;background:var(--wechat-bg)"></div>';
                }
                html += `
                    <div class="wechat-chat-list-item" data-action="${item.action}" style="padding:14px 16px">
                        <span style="font-size:24px;width:28px;text-align:center">${item.icon}</span>
                        <span class="wechat-contact-name" style="flex:1">${item.name}</span>
                        ${item.hasNew ? '<span class="wechat-tab-dot" style="position:static"></span>' : ''}
                        <span style="color:var(--wechat-text-secondary);font-size:18px">›</span>
                    </div>
                `;
            });

            html += '</div>';
            return html;
        }

        // 渲染"我"页面
        renderMe() {
            const self = this.core.selfUser;

            return `
                <div style="padding-top:8px">
                    <!-- 个人信息 -->
                    <div class="wechat-chat-list-item" style="padding:20px 16px;gap:16px">
                        ${WeChatCore.renderAvatar(self, 64)}
                        <div style="flex:1">
                            <div style="font-size:18px;font-weight:600">${self.name}</div>
                            <div style="font-size:13px;color:var(--wechat-text-secondary);margin-top:4px">
                                微信号：${self.wxId || 'wxid_self'}
                            </div>
                        </div>
                        <span style="color:var(--wechat-text-secondary);font-size:18px">›</span>
                    </div>

                    <div style="height:8px;background:var(--wechat-bg)"></div>

                    ${[
                        { icon: '💰', name: '服务' },
                        { icon: '⭐', name: '收藏', divider: true },
                        { icon: '😊', name: '朋友圈' },
                        { icon: '🎴', name: '卡包' },
                        { icon: '😀', name: '表情', divider: true },
                        { icon: '⚙️', name: '设置' },
                    ].map((item, i) => `
                        ${item.divider ? '<div style="height:8px;background:var(--wechat-bg)"></div>' : ''}
                        <div class="wechat-chat-list-item" style="padding:14px 16px">
                            <span style="font-size:24px;width:28px;text-align:center">${item.icon}</span>
                            <span class="wechat-contact-name" style="flex:1">${item.name}</span>
                            <span style="color:var(--wechat-text-secondary);font-size:18px">›</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // ==========================================
        // 聊天页面渲染
        // ==========================================

        renderChatPage() {
            const chatId = this.core.currentChat?.id;
            if (!chatId) return this.renderMainPage();

            const chatInfo = this.core.getChatInfo(chatId);
            const messages = this.core.getMessages(chatId);
            const isGroup = this.core.currentChat?.isGroup;

            return `
                <div class="wechat-chat-page">
                    <!-- Chat Navbar -->
                    <div class="wechat-navbar">
                        <div class="wechat-navbar-left">
                            <button class="wechat-navbar-back" id="wechat-chat-back">
                                ${WeChatCore.ICONS.back}
                            </button>
                            <div>
                                <span class="wechat-navbar-title">
                                    ${chatInfo?.name || '聊天'}
                                    ${isGroup && chatInfo?.memberCount ? `(${chatInfo.memberCount})` : ''}
                                </span>
                            </div>
                        </div>
                        <div class="wechat-navbar-right">
                            <button class="wechat-navbar-icon" id="wechat-chat-more" title="更多">
                                ${WeChatCore.ICONS.more}
                            </button>
                        </div>
                    </div>

                    <!-- Messages -->
                    <div class="wechat-chat-messages" id="wechat-messages">
                        ${this.renderMessages(messages, chatId, isGroup)}
                    </div>

                    <!-- Input Bar -->
                    <div class="wechat-input-bar">
                        <button class="wechat-input-btn" id="wechat-voice-btn" title="语音">
                            ${WeChatCore.ICONS.voice}
                        </button>
                        <textarea class="wechat-input-textarea" id="wechat-input" 
                                  placeholder="输入消息..." rows="1"></textarea>
                        <button class="wechat-input-btn" id="wechat-emoji-btn" title="表情">
                            ${WeChatCore.ICONS.emoji}
                        </button>
                        <button class="wechat-input-btn" id="wechat-extra-btn" title="更多">
                            ${WeChatCore.ICONS.plus}
                        </button>
                        <button class="wechat-send-btn" id="wechat-send-btn" disabled>发送</button>
                    </div>

                    <!-- Extra Panel -->
                    <div class="wechat-extra-panel ${this.showExtraPanel ? 'show' : ''}" id="wechat-extra-panel">
                        <div class="wechat-extra-grid">
                            <button class="wechat-extra-item" data-action="photo">
                                <div class="wechat-extra-item-icon">📷</div>
                                <span>照片</span>
                            </button>
                            <button class="wechat-extra-item" data-action="camera">
                                <div class="wechat-extra-item-icon">📸</div>
                                <span>拍摄</span>
                            </button>
                            <button class="wechat-extra-item" data-action="video-send">
                                <div class="wechat-extra-item-icon">📹</div>
                                <span>视频</span>
                            </button>
                            <button class="wechat-extra-item" data-action="gif-send">
                                <div class="wechat-extra-item-icon">🎭</div>
                                <span>动图</span>
                            </button>
                            <button class="wechat-extra-item" data-action="redpacket">
                                <div class="wechat-extra-item-icon" style="background:#FA9D3B">🧧</div>
                                <span>红包</span>
                            </button>
                            <button class="wechat-extra-item" data-action="transfer">
                                <div class="wechat-extra-item-icon">💰</div>
                                <span>转账</span>
                            </button>
                            <button class="wechat-extra-item" data-action="gift">
                                <div class="wechat-extra-item-icon" style="background:#FF6B6B">🎁</div>
                                <span>礼物</span>
                            </button>
                            <button class="wechat-extra-item" data-action="location">
                                <div class="wechat-extra-item-icon">📍</div>
                                <span>位置</span>
                            </button>
                            <button class="wechat-extra-item" data-action="file">
                                <div class="wechat-extra-item-icon">📄</div>
                                <span>文件</span>
                            </button>
                            <button class="wechat-extra-item" data-action="link">
                                <div class="wechat-extra-item-icon">🔗</div>
                                <span>链接</span>
                            </button>
                            <button class="wechat-extra-item" data-action="url-image">
                                <div class="wechat-extra-item-icon">🌐</div>
                                <span>网络图片</span>
                            </button>
                            <button class="wechat-extra-item" data-action="local-file">
                                <div class="wechat-extra-item-icon">💻</div>
                                <span>本地文件</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        // 渲染消息列表
        renderMessages(messages, chatId, isGroup) {
            if (!messages || messages.length === 0) {
                return `
                    <div style="text-align:center;padding:40px;color:var(--wechat-text-secondary);font-size:13px">
                        暂无消息记录
                    </div>
                `;
            }

            let html = '';
            let lastTime = null;

            messages.forEach((msg, index) => {
                // 时间分隔符
                if (msg.time) {
                    const msgTime = new Date(msg.time);
                    if (!lastTime || (msgTime - lastTime) > 300000) { // 5分钟间隔
                        html += `
                            <div class="wechat-msg-time-divider">
                                <span>${WeChatCore.formatChatTime(msg.time)}</span>
                            </div>
                        `;
                    }
                    lastTime = new Date(msg.time);
                }

                // 系统消息
                if (msg.type === 'system') {
                    html += `<div class="wechat-msg-system">${msg.content}</div>`;
                    return;
                }

                // 撤回消息
                if (msg.type === 'recalled') {
                    html += `
                        <div class="wechat-msg-recalled">
                            ${msg.senderName || '对方'}撤回了一条消息
                            ${msg.senderId === 'self' ? '<a class="re-edit">重新编辑</a>' : ''}
                        </div>
                    `;
                    return;
                }

                const isSelf = msg.senderId === 'self';
                let sender = null;

                if (isSelf) {
                    sender = this.core.selfUser;
                } else {
                    sender = this.core.findContact(msg.senderId) || {
                        name: msg.senderName || '未知',
                        avatar: msg.senderAvatar || ''
                    };
                }

                html += `
                    <div class="wechat-msg-row ${isSelf ? 'self' : ''} wechat-msg-appear" 
                         data-msg-id="${msg.id}">
                        <div class="wechat-msg-avatar" data-user-id="${msg.senderId}">
                            <img src="${sender.avatar || ''}" 
                                 onerror="this.style.display='none';this.parentElement.style.background='${this.getAvatarColor(sender.name)}';this.parentElement.innerHTML='<div style=\\'width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:white;font-size:18px;border-radius:6px;background:${this.getAvatarColor(sender.name)}\\'>${(sender.name || '?')[0]}</div>'" />
                        </div>
                        <div class="wechat-msg-body">
                            ${isGroup && !isSelf ? `<div class="wechat-msg-sender-name">${sender.name}</div>` : ''}
                            ${this.renderMessageContent(msg)}
                        </div>
                    </div>
                `;
            });

            return html;
        }

        getAvatarColor(name) {
            const colors = ['#7EC8E3', '#3498DB', '#E74C3C', '#2ECC71', '#F39C12', '#9B59B6', '#1ABC9C'];
            const index = (name || '').charCodeAt(0) % colors.length;
            return colors[index];
        }

        // 渲染消息内容
        renderMessageContent(msg) {
            switch (msg.type) {
                case 'text':
                    return `<div class="wechat-msg-bubble">${WeChatCore.parseLinks(this.escapeHtml(msg.content))}</div>`;

                case 'image':
                    return `
                        <div class="wechat-msg-image" onclick="window.wechatPlugin?.media?.showImageViewer('${msg.url}')">
                            <img src="${msg.url}" 
                                 onerror="this.src='https://picsum.photos/200/200?random=${Math.random()}'" 
                                 loading="lazy" />
                        </div>
                    `;

                case 'gif':
                    return `
                        <div class="wechat-msg-gif" onclick="window.wechatPlugin?.media?.showImageViewer('${msg.url}')">
                            <img src="${msg.url}" loading="lazy" />
                            <span class="gif-tag">GIF</span>
                        </div>
                    `;

                case 'video':
                    return `
                        <div class="wechat-msg-video" onclick="window.wechatPlugin?.media?.showVideoPlayer('${msg.url}')">
                            <video src="${msg.url}" preload="metadata"></video>
                            <div class="video-play-btn"></div>
                            ${msg.duration ? `<span class="video-duration">${msg.duration}</span>` : ''}
                        </div>
                    `;

                case 'voice':
                    return `
                        <div class="wechat-msg-voice" style="width:${Math.min(60 + (msg.duration || 3) * 10, 200)}px">
                            <svg class="voice-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3z"/></svg>
                            <span class="voice-duration">${msg.duration || 3}"</span>
                        </div>
                    `;

                case 'redpacket':
                    return `
                        <div class="wechat-msg-redpacket">
                            <div class="wechat-msg-redpacket-body">
                                <div class="wechat-msg-redpacket-icon">🧧</div>
                                <div class="wechat-msg-redpacket-text">${msg.text || '恭喜发财，大吉大利'}</div>
                            </div>
                            <div class="wechat-msg-redpacket-footer">
                                <span>微信红包</span>
                            </div>
                        </div>
                    `;

                case 'transfer':
                    return `
                        <div class="wechat-msg-transfer">
                            <div class="wechat-msg-transfer-body">
                                <div class="wechat-msg-transfer-icon">💰</div>
                                <div class="wechat-msg-transfer-info">
                                    <div class="wechat-msg-transfer-amount">¥${msg.amount || '0.00'}</div>
                                    <div class="wechat-msg-transfer-desc">${msg.desc || '转账'}</div>
                                </div>
                            </div>
                            <div class="wechat-msg-transfer-footer">微信转账</div>
                        </div>
                    `;

                case 'gift':
                    return WeChatGifts.renderGiftBubble(msg);

                case 'link':
                    return `
                        <div class="wechat-msg-link" onclick="window.open('${msg.url}','_blank')">
                            <div class="wechat-msg-link-body">
                                <div class="wechat-msg-link-text">${msg.title || msg.url}</div>
                                ${msg.thumb ? `<img class="wechat-msg-link-thumb" src="${msg.thumb}" />` : ''}
                            </div>
                            <div class="wechat-msg-link-footer">
                                <span>${msg.source || '网页链接'}</span>
                            </div>
                        </div>
                    `;

                case 'file':
                    const fileType = WeChatMedia.getFileIconType(msg.fileName || 'file.dat');
                    return `
                        <div class="wechat-msg-file">
                            <div class="wechat-msg-file-icon ${fileType}">${fileType.toUpperCase()}</div>
                            <div class="wechat-msg-file-info">
                                <div class="wechat-msg-file-name">${msg.fileName || '文件'}</div>
                                <div class="wechat-msg-file-size">${msg.fileSize || ''}</div>
                            </div>
                        </div>
                    `;

                case 'location':
                    return `
                        <div class="wechat-msg-location">
                            <div class="wechat-msg-location-info">
                                <div class="wechat-msg-location-name">${msg.locationName || '位置'}</div>
                                <div class="wechat-msg-location-addr">${msg.address || ''}</div>
                            </div>
                            <div class="wechat-msg-location-map">📍</div>
                        </div>
                    `;

                default:
                    return `<div class="wechat-msg-bubble">${msg.content || ''}</div>`;
            }
        }

        // 渲染朋友圈页面
        renderMomentsPage() {
            return `
                <div class="wechat-chat-page">
                    <div class="wechat-navbar">
                        <div class="wechat-navbar-left">
                            <button class="wechat-navbar-back" id="wechat-moments-back">
                                ${WeChatCore.ICONS.back}
                            </button>
                            <span class="wechat-navbar-title">朋友圈</span>
                        </div>
                        <div class="wechat-navbar-right">
                            <button class="wechat-navbar-icon" id="wechat-moments-post" title="发布">
                                ${WeChatCore.ICONS.camera}
                            </button>
                        </div>
                    </div>
                    <div class="wechat-page">
                        ${this.moments.renderMomentsPage()}
                    </div>
                </div>
            `;
        }

        // ==========================================
        // 事件绑定
        // ==========================================

        bindEvents() {
            // Tab切换
            this.container.querySelectorAll('.wechat-tab-item').forEach(tab => {
                tab.addEventListener('click', () => {
                    this.currentTab = tab.dataset.tab;
                    this.core.currentPage = this.currentTab === 'chat' ? 'chatList' : this.currentTab;
                    this.render();
                });
            });

            // 聊天列表点击
            this.container.querySelectorAll('.wechat-chat-list-item[data-chat-id]').forEach(item => {
                item.addEventListener('click', () => {
                    const chatId = item.dataset.chatId;
                    const chat = this.core.chatList.find(c => c.id === chatId);
                    if (chat) {
                        chat.unread = 0;
                        this.core.currentChat = chat;
                        this.core.currentPage = 'chat';
                        this.render();
                    }
                });

                // 右键菜单
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.showContextMenu(e, item.dataset.chatId);
                });
            });

            // 返回按钮
            const backBtn = this.container.querySelector('#wechat-chat-back');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    this.core.currentPage = 'chatList';
                    this.core.currentChat = null;
                    this.render();
                });
            }

            // 朋友圈返回
            const momentsBack = this.container.querySelector('#wechat-moments-back');
            if (momentsBack) {
                momentsBack.addEventListener('click', () => {
                    this.currentTab = 'discover';
                    this.core.currentPage = 'discover';
                    this.render();
                });
            }

            // 发现页 - 朋友圈入口
            this.container.querySelectorAll('[data-action="moments"]').forEach(el => {
                el.addEventListener('click', () => {
                    this.core.currentPage = 'moments';
                    this.render();
                });
            });

            // 联系人点击
            this.container.querySelectorAll('.wechat-contact-item').forEach(item => {
                item.addEventListener('click', () => {
                    const contactId = item.dataset.contactId;
                    this.showProfileCard(contactId);
                });
            });

            // 输入框事件
            const input = this.container.querySelector('#wechat-input');
            const sendBtn = this.container.querySelector('#wechat-send-btn');
            if (input && sendBtn) {
                input.addEventListener('input', () => {
                    sendBtn.disabled = !input.value.trim();
                    // 自动调整高度
                    input.style.height = 'auto';
                    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (input.value.trim()) {
                            this.sendTextMessage(input.value.trim());
                            input.value = '';
                            input.style.height = 'auto';
                            sendBtn.disabled = true;
                        }
                    }
                });

                sendBtn.addEventListener('click', () => {
                    if (input.value.trim()) {
                        this.sendTextMessage(input.value.trim());
                        input.value = '';
                        input.style.height = 'auto';
                        sendBtn.disabled = true;
                    }
                });
            }

            // 更多面板切换
            const extraBtn = this.container.querySelector('#wechat-extra-btn');
            if (extraBtn) {
                extraBtn.addEventListener('click', () => {
                    this.showExtraPanel = !this.showExtraPanel;
                    const panel = this.container.querySelector('#wechat-extra-panel');
                    if (panel) {
                        panel.classList.toggle('show', this.showExtraPanel);
                    }
                });
            }

            // 更多面板功能按钮
            this.container.querySelectorAll('.wechat-extra-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.handleExtraAction(item.dataset.action);
                });
            });

            // 头像点击 - 显示个人资料
            this.container.querySelectorAll('.wechat-msg-avatar').forEach(avatar => {
                avatar.addEventListener('click', () => {
                    const userId = avatar.dataset.userId;
                    if (userId && userId !== 'self') {
                        this.showProfileCard(userId);
                    }
                });
            });

            // 搜索
            const searchInput = this.container.querySelector('#wechat-chat-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase();
                    this.container.querySelectorAll('.wechat-chat-list-item').forEach(item => {
                        const name = item.querySelector('.wechat-chat-list-name')?.textContent.toLowerCase() || '';
                        item.style.display = name.includes(query) ? '' : 'none';
                    });
                });
            }
        }

        // ==========================================
        // 功能处理
        // ==========================================

        // 发送文本消息
        async sendTextMessage(text) {
            const chatId = this.core.currentChat?.id;
            if (!chatId) return;

            // 添加到微信消息
            this.core.addMessage(chatId, {
                type: 'text',
                senderId: 'self',
                content: text,
                time: new Date().toISOString()
            });

            this.render();

            // 发送到SillyTavern
            this.sendToST(text);
        }

        // 发送到SillyTavern
        async sendToST(text) {
            try {
                const context = getContext();
                if (context && context.sendMessage) {
                    // 使用ST的发送功能
                    await context.sendMessage(text);
                } else {
                    // 备用: 直接操作输入框
                    const stInput = document.querySelector('#send_textarea');
                    if (stInput) {
                        stInput.value = text;
                        stInput.dispatchEvent(new Event('input', { bubbles: true }));
                        const sendBtn = document.querySelector('#send_but');
                        if (sendBtn) sendBtn.click();
                    }
                }
            } catch (e) {
                console.warn('[WeChat] 发送到ST失败:', e);
            }
        }

        // 处理更多面板操作
        async handleExtraAction(action) {
            const chatId = this.core.currentChat?.id;
            if (!chatId) return;

            this.showExtraPanel = false;

            switch (action) {
                case 'photo':
                case 'camera':
                case 'url-image': {
                    const result = await this.media.showUploadModal('image');
                    if (result) {
                        this.core.addMessage(chatId, {
                            type: 'image',
                            senderId: 'self',
                            url: result.url,
                            time: new Date().toISOString()
                        });
                        this.render();
                        this.sendToST(`[发送了一张图片]`);
                    }
                    break;
                }

                case 'video-send': {
                    const result = await this.media.showUploadModal('video');
                    if (result) {
                        this.core.addMessage(chatId, {
                            type: 'video',
                            senderId: 'self',
                            url: result.url,
                            time: new Date().toISOString()
                        });
                        this.render();
                        this.sendToST(`[发送了一个视频]`);
                    }
                    break;
                }

                case 'gif-send': {
                    const result = await this.media.showUploadModal('gif');
                    if (result) {
                        this.core.addMessage(chatId, {
                            type: 'gif',
                            senderId: 'self',
                            url: result.url,
                            time: new Date().toISOString()
                        });
                        this.render();
                        this.sendToST(`[发送了一个动图]`);
                    }
                    break;
                }

                case 'redpacket': {
                    const text = prompt('红包留言:', '恭喜发财，大吉大利');
                    if (text !== null) {
                        this.core.addMessage(chatId, {
                            type: 'redpacket',
                            senderId: 'self',
                            text: text || '恭喜发财，大吉大利',
                            time: new Date().toISOString()
                        });
                        this.render();
                        this.sendToST(`[发送了一个红包: ${text}]`);
                    }
                    break;
                }

                case 'transfer': {
                    const amount = prompt('转账金额:', '0.00');
                    if (amount !== null) {
                        const desc = prompt('转账说明(可选):', '');
                        this.core.addMessage(chatId, {
                            type: 'transfer',
                            senderId: 'self',
                            amount: amount,
                            desc: desc || '转账',
                            time: new Date().toISOString()
                        });
                        this.render();
                        this.sendToST(`[转账 ¥${amount}${desc ? ': ' + desc : ''}]`);
                    }
                    break;
                }

                case 'gift': {
                    const targetContact = this.core.findContact(chatId);
                    const gift = await this.gifts.showGiftPanel(targetContact);
                    if (gift) {
                        const giftMsg = this.gifts.createGiftMessage(gift);
                        this.core.addMessage(chatId, giftMsg);
                        this.render();
                        this.sendToST(`[送了一个礼物: ${gift.name}]`);
                    }
                    break;
                }

                case 'location': {
                    const locName = prompt('位置名称:', '我的位置');
                    if (locName !== null) {
                        this.core.addMessage(chatId, {
                            type: 'location',
                            senderId: 'self',
                            locationName: locName,
                            address: '正在分享位置...',
                            time: new Date().toISOString()
                        });
                        this.render();
                        this.sendToST(`[分享了位置: ${locName}]`);
                    }
                    break;
                }

                case 'file': {
                    const result = await this.media.showUploadModal('file');
                    if (result) {
                        const fileName = result.file?.name || 'file.dat';
                        const fileSize = result.file ? WeChatMedia.formatFileSize(result.file.size) : '';
                        this.core.addMessage(chatId, {
                            type: 'file',
                            senderId: 'self',
                            fileName: fileName,
                            fileSize: fileSize,
                            url: result.url,
                            time: new Date().toISOString()
                        });
                        this.render();
                        this.sendToST(`[发送了文件: ${fileName}]`);
                    }
                    break;
                }

                case 'link': {
                    const url = prompt('链接地址:', 'https://');
                    if (url && url !== 'https://') {
                        const title = prompt('链接标题:', url);
                        this.core.addMessage(chatId, {
                            type: 'link',
                            senderId: 'self',
                            url: url,
                            title: title || url,
                            source: new URL(url).hostname,
                            time: new Date().toISOString()
                        });
                        this.render();
                        this.sendToST(`[分享了链接: ${title || url}]`);
                    }
                    break;
                }

                case 'local-file': {
                    const result = await this.media.showUploadModal('image');
                    if (result) {
                        const isVideo = result.file && result.file.type.startsWith('video/');
                        this.core.addMessage(chatId, {
                            type: isVideo ? 'video' : 'image',
                            senderId: 'self',
                            url: result.url,
                            time: new Date().toISOString()
                        });
                        this.render();
                        this.sendToST(`[发送了本地${isVideo ? '视频' : '图片'}]`);
                    }
                    break;
                }
            }

            this.render();
        }

        // 显示个人资料卡
        showProfileCard(userId) {
            const contact = this.core.findContact(userId);
            if (!contact) return;

            const existing = document.querySelector('.wechat-profile-card');
            if (existing) existing.remove();

            const card = document.createElement('div');
            card.className = 'wechat-profile-card';
            card.innerHTML = `
                <div class="wechat-profile-card-body wechat-fade-in">
                    <div class="wechat-profile-card-header">
                        <img class="wechat-profile-card-avatar" 
                             src="${contact.avatar || ''}"
                             onerror="this.style.background='${this.getAvatarColor(contact.name)}';this.src=''" />
                        <div class="wechat-profile-card-info">
                            <div class="wechat-profile-card-name">${contact.name}</div>
                            <div class="wechat-profile-card-id">微信号: ${contact.wxId || '-'}</div>
                            <div class="wechat-profile-card-region">${contact.region || ''} ${contact.gender === 'male' ? '♂' : contact.gender === 'female' ? '♀' : ''}</div>
                        </div>
                    </div>
                    ${contact.signature ? `
                        <div style="padding:0 20px 16px;font-size:13px;color:var(--wechat-text-secondary)">
                            个性签名: ${contact.signature}
                        </div>
                    ` : ''}
                    <div class="wechat-profile-card-actions">
                        <button class="wechat-profile-card-btn primary" id="profile-send-msg">
                            💬 发消息
                        </button>
                        <button class="wechat-profile-card-btn secondary" id="profile-view-moments">
                            📷 朋友圈
                        </button>
                    </div>
                </div>
            `;

            card.addEventListener('click', (e) => {
                if (e.target === card) card.remove();
            });

            card.querySelector('#profile-send-msg').addEventListener('click', () => {
                card.remove();
                // 打开聊天
                let chat = this.core.chatList.find(c => c.id === userId);
                if (!chat) {
                    chat = {
                        id: userId,
                        name: contact.name,
                        avatar: contact.avatar,
                        isGroup: false,
                        lastMsg: '',
                        lastTime: new Date().toISOString(),
                        unread: 0
                    };
                    this.core.chatList.push(chat);
                }
                this.core.currentChat = chat;
                this.core.currentPage = 'chat';
                this.render();
            });

            card.querySelector('#profile-view-moments').addEventListener('click', () => {
                card.remove();
                this.core.currentPage = 'moments';
                this.render();
            });

            document.body.appendChild(card);
        }

        // 显示右键菜单
        showContextMenu(event, chatId) {
            const existing = document.querySelector('.wechat-context-menu');
            if (existing) existing.remove();

            const chat = this.core.chatList.find(c => c.id === chatId);
            if (!chat) return;

            const menu = document.createElement('div');
            menu.className = 'wechat-context-menu';
            menu.style.left = event.clientX + 'px';
            menu.style.top = event.clientY + 'px';

            menu.innerHTML = `
                <div class="wechat-context-menu-item" data-action="pin">
                    ${chat.pinned ? '取消置顶' : '置顶聊天'}
                </div>
                <div class="wechat-context-menu-item" data-action="mute">
                    ${chat.muted ? '取消免打扰' : '消息免打扰'}
                </div>
                <div class="wechat-context-menu-item" data-action="read">
                    标为已读
                </div>
                <div class="wechat-context-menu-item" data-action="delete" style="color:#FF4444">
                    删除聊天
                </div>
            `;

            menu.querySelectorAll('.wechat-context-menu-item').forEach(item => {
                item.addEventListener('click', () => {
                    const action = item.dataset.action;
                    switch (action) {
                        case 'pin':
                            chat.pinned = !chat.pinned;
                            break;
                        case 'mute':
                            chat.muted = !chat.muted;
                            break;
                        case 'read':
                            chat.unread = 0;
                            break;
                        case 'delete':
                            const idx = this.core.chatList.findIndex(c => c.id === chatId);
                            if (idx >= 0) this.core.chatList.splice(idx, 1);
                            break;
                    }
                    menu.remove();
                    this.render();
                });
            });

            document.body.appendChild(menu);

            // 点击其他地方关闭
            setTimeout(() => {
                document.addEventListener('click', function closeMenu() {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                });
            }, 0);
        }

        // HTML转义
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

    // ==========================================
    // 启动插件
    // ==========================================

    async function initPlugin() {
        console.log('[WeChat Plugin] 等待页面加载...');

        // 等待DOM就绪
        if (document.readyState !== 'complete') {
            await new Promise(resolve => window.addEventListener('load', resolve));
        }

        // 延迟启动确保ST完全加载
        await new Promise(resolve => setTimeout(resolve, 2000));

        const plugin = new WeChatPlugin();
        await plugin.init();
    }

    // 使用jQuery ready或直接启动
    if (typeof jQuery !== 'undefined') {
        jQuery(async () => {
            await initPlugin();
        });
    } else {
        initPlugin();
    }

})();
