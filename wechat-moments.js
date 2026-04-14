// ============================================
// WeChat Moments (朋友圈)
// ============================================

export class WeChatMoments {
    constructor(plugin) {
        this.plugin = plugin;
        this.moments = [];
    }

    // 添加朋友圈
    addMoment(moment) {
        moment.id = moment.id || 'moment_' + Date.now();
        moment.time = moment.time || new Date().toISOString();
        moment.likes = moment.likes || [];
        moment.comments = moment.comments || [];
        this.moments.unshift(moment);
        return moment;
    }

    // 渲染朋友圈页面
    renderMomentsPage() {
        const selfUser = this.plugin.core.selfUser;
        let html = `
            <div class="wechat-moments-page">
                <!-- 封面区域 -->
                <div class="wechat-moments-cover">
                    <img class="wechat-moments-cover-bg" 
                         src="${selfUser.momentCover || 'https://picsum.photos/400/280?random=1'}" 
                         onerror="this.src='https://picsum.photos/400/280?random=cover'" />
                    <div class="wechat-moments-cover-user">
                        <span class="wechat-moments-cover-name">${selfUser.name}</span>
                        <img class="wechat-moments-cover-avatar" 
                             src="${selfUser.avatar || ''}"
                             onerror="this.style.background='#3498DB'" />
                    </div>
                </div>
                
                <!-- 朋友圈列表 -->
                <div class="wechat-moments-list">
        `;

        this.moments.forEach(moment => {
            html += this.renderMomentItem(moment);
        });

        html += `
                </div>
            </div>
        `;

        return html;
    }

    // 渲染单条朋友圈
    renderMomentItem(moment) {
        const user = this.plugin.core.findContact(moment.userId) || {
            name: moment.userName || '未知',
            avatar: moment.userAvatar || ''
        };

        let mediaHtml = '';

        // 图片
        if (moment.images && moment.images.length > 0) {
            const count = Math.min(moment.images.length, 9);
            mediaHtml += `<div class="wechat-moment-images count-${count}">`;
            moment.images.slice(0, 9).forEach(img => {
                mediaHtml += `<img src="${img}" 
                              onclick="window.wechatPlugin?.media?.showImageViewer('${img}')"
                              onerror="this.src='https://picsum.photos/200/200?random=${Math.random()}'" />`;
            });
            mediaHtml += '</div>';
        }

        // 视频
        if (moment.video) {
            mediaHtml += `
                <div class="wechat-moment-video" onclick="window.wechatPlugin?.media?.showVideoPlayer('${moment.video}')">
                    <video src="${moment.video}" preload="metadata"></video>
                    <div class="video-play-btn"></div>
                </div>
            `;
        }

        // 链接
        if (moment.link) {
            mediaHtml += `
                <div class="wechat-moment-link" onclick="window.open('${moment.link.url}', '_blank')">
                    ${moment.link.thumb ? `<img src="${moment.link.thumb}" />` : ''}
                    <span>${moment.link.title || moment.link.url}</span>
                </div>
            `;
        }

        // 互动区域
        let interactionHtml = '';
        if ((moment.likes && moment.likes.length > 0) ||
            (moment.comments && moment.comments.length > 0)) {
            interactionHtml = '<div class="wechat-moment-comments">';

            if (moment.likes && moment.likes.length > 0) {
                interactionHtml += `
                    <div class="wechat-moment-likes">
                        <svg class="heart-icon" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                        ${moment.likes.map(l => `<a>${l}</a>`).join(', ')}
                    </div>
                `;
            }

            if (moment.comments && moment.comments.length > 0) {
                interactionHtml += '<div class="wechat-moment-comment-list">';
                moment.comments.forEach(c => {
                    interactionHtml += `
                        <div class="wechat-moment-comment">
                            <span class="commenter">${c.from}</span>
                            ${c.replyTo ? `<span class="reply-to">回复</span><span class="commenter">${c.replyTo}</span>` : ''}
                            ：${c.text}
                        </div>
                    `;
                });
                interactionHtml += '</div>';
            }

            interactionHtml += '</div>';
        }

        // 文字截断
        let textHtml = '';
        if (moment.text) {
            if (moment.text.length > 120) {
                textHtml = `
                    <div class="wechat-moment-text">
                        <span class="moment-text-content">${moment.text.substring(0, 120)}...</span>
                        <span class="see-more" onclick="this.parentElement.querySelector('.moment-text-content').textContent='${moment.text.replace(/'/g, "\\'")}';this.remove()">全文</span>
                    </div>
                `;
            } else {
                textHtml = `<div class="wechat-moment-text">${moment.text}</div>`;
            }
        }

        const WeChatCore = this.plugin.core.constructor;

        return `
            <div class="wechat-moment-item wechat-fade-in" data-moment-id="${moment.id}">
                <div class="wechat-moment-avatar">
                    ${WeChatCore.renderAvatar(user, 40).replace('wechat-avatar', 'wechat-avatar').replace(/<div/, '<img style="width:100%;height:100%;object-fit:cover" src="' + (user.avatar || '') + '" onerror="this.style.display=\'none\'" /><div')}
                </div>
                <div class="wechat-moment-content">
                    <div class="wechat-moment-name">${user.name}</div>
                    ${textHtml}
                    ${mediaHtml}
                    <div class="wechat-moment-meta">
                        <span class="wechat-moment-time">${WeChatCore.formatTime(moment.time)}</span>
                        <div class="wechat-moment-actions">
                            <button class="wechat-moment-action-btn" title="评论">
                                <svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
                            </button>
                        </div>
                    </div>
                    ${interactionHtml}
                </div>
            </div>
        `;
    }

    // 从AI回复中解析朋友圈内容
    parseMomentFromText(text, userId) {
        // 智能解析回复中的朋友圈格式
        const moment = {
            userId: userId,
            text: '',
            images: [],
            video: null,
            link: null,
            likes: [],
            comments: []
        };

        // 解析图片URL
        const imgRegex = /\[(?:图片|photo|img)\]\s*(https?:\/\/[^\s\]]+|\/[^\s\]]+|[A-Z]:\\[^\s\]]+)/gi;
        let match;
        while ((match = imgRegex.exec(text)) !== null) {
            moment.images.push(match[1]);
        }

        // 解析视频URL
        const videoRegex = /\[(?:视频|video)\]\s*(https?:\/\/[^\s\]]+|\/[^\s\]]+)/gi;
        match = videoRegex.exec(text);
        if (match) {
            moment.video = match[1];
        }

        // 移除标记后的纯文本
        let cleanText = text
            .replace(/\[(?:图片|photo|img)\]\s*[^\s\]]+/gi, '')
            .replace(/\[(?:视频|video)\]\s*[^\s\]]+/gi, '')
            .trim();

        moment.text = cleanText;

        return moment;
    }
}

export default WeChatMoments;
