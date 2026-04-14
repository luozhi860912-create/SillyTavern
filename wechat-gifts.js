// ============================================
// WeChat Gifts System (礼物系统)
// ============================================

export class WeChatGifts {
    constructor(plugin) {
        this.plugin = plugin;
    }

    // 礼物列表
    static GIFT_LIST = [
        { id: 'rose', icon: '🌹', name: '玫瑰花', price: '1.00', desc: '送你一朵玫瑰' },
        { id: 'heart', icon: '❤️', name: '爱心', price: '2.00', desc: '你是我的最爱' },
        { id: 'ring', icon: '💍', name: '钻戒', price: '520.00', desc: '嫁给我吧' },
        { id: 'cake', icon: '🎂', name: '蛋糕', price: '6.66', desc: '生日快乐' },
        { id: 'firework', icon: '🎆', name: '烟花', price: '8.88', desc: '与你一起看烟花' },
        { id: 'bear', icon: '🧸', name: '小熊', price: '13.14', desc: '送你一只小熊' },
        { id: 'crown', icon: '👑', name: '皇冠', price: '66.66', desc: '你是我的女王/国王' },
        { id: 'rocket', icon: '🚀', name: '火箭', price: '99.99', desc: '一飞冲天' },
        { id: 'star', icon: '⭐', name: '星星', price: '5.20', desc: '你是我的星辰' },
        { id: 'kiss', icon: '💋', name: '么么哒', price: '3.33', desc: 'mua~' },
        { id: 'chocolate', icon: '🍫', name: '巧克力', price: '9.99', desc: '甜蜜的礼物' },
        { id: 'bouquet', icon: '💐', name: '花束', price: '18.88', desc: '整束花送给你' },
        { id: 'wine', icon: '🍷', name: '红酒', price: '28.88', desc: '与你小酌一杯' },
        { id: 'diamond', icon: '💎', name: '钻石', price: '188.00', desc: '璀璨如你' },
        { id: 'castle', icon: '🏰', name: '城堡', price: '1314.00', desc: '给你一座城堡' },
    ];

    // 显示礼物面板
    showGiftPanel(targetUser) {
        return new Promise((resolve) => {
            const existing = document.querySelector('.wechat-gift-panel');
            if (existing) existing.remove();

            const panel = document.createElement('div');
            panel.className = 'wechat-gift-panel';

            let selectedGift = null;

            panel.innerHTML = `
                <div class="wechat-gift-panel-body wechat-slide-up">
                    <div class="wechat-gift-panel-title">
                        送礼物给 ${targetUser?.name || '好友'}
                    </div>
                    <div class="wechat-gift-grid">
                        ${WeChatGifts.GIFT_LIST.map(gift => `
                            <div class="wechat-gift-item" data-gift-id="${gift.id}">
                                <div class="wechat-gift-item-icon">${gift.icon}</div>
                                <div class="wechat-gift-item-name">${gift.name}</div>
                                <div class="wechat-gift-item-price">¥${gift.price}</div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="wechat-gift-send-btn" id="wechat-gift-send" disabled>
                        选择礼物后发送
                    </button>
                </div>
            `;

            // 选择礼物
            panel.querySelectorAll('.wechat-gift-item').forEach(item => {
                item.addEventListener('click', () => {
                    panel.querySelectorAll('.wechat-gift-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                    selectedGift = WeChatGifts.GIFT_LIST.find(g => g.id === item.dataset.giftId);
                    const btn = panel.querySelector('#wechat-gift-send');
                    btn.disabled = false;
                    btn.textContent = `发送 ${selectedGift.name} ¥${selectedGift.price}`;
                });
            });

            // 发送
            panel.querySelector('#wechat-gift-send').addEventListener('click', () => {
                if (selectedGift) {
                    panel.remove();
                    resolve(selectedGift);
                }
            });

            // 关闭
            panel.addEventListener('click', (e) => {
                if (e.target === panel) {
                    panel.remove();
                    resolve(null);
                }
            });

            document.body.appendChild(panel);
        });
    }

    // 创建礼物消息
    createGiftMessage(gift, senderId = 'self') {
        return {
            id: 'msg_' + Date.now(),
            type: 'gift',
            senderId: senderId,
            giftId: gift.id,
            giftName: gift.name,
            giftIcon: gift.icon,
            giftPrice: gift.price,
            giftDesc: gift.desc,
            time: new Date().toISOString()
        };
    }

    // 渲染礼物消息气泡
    static renderGiftBubble(msg) {
        return `
            <div class="wechat-msg-gift">
                <div class="wechat-msg-gift-particles">
                    ${Array.from({length: 8}).map((_, i) => 
                        `<span style="left:${Math.random()*100}%;top:${60+Math.random()*40}%;animation-delay:${Math.random()*2}s"></span>`
                    ).join('')}
                </div>
                <div class="wechat-msg-gift-body">
                    <div class="wechat-msg-gift-icon">${msg.giftIcon}</div>
                    <div class="wechat-msg-gift-name">${msg.giftName}</div>
                    <div class="wechat-msg-gift-desc">${msg.giftDesc || ''}</div>
                </div>
            </div>
        `;
    }
}

export default WeChatGifts;
