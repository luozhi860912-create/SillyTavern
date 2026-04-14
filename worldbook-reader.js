// ============================================
// World Book Reader
// 从世界书读取角色信息、媒体链接
// ============================================

export class WorldBookReader {
    constructor(plugin) {
        this.plugin = plugin;
        this.worldData = null;
        this.characterMedia = new Map();
    }

    // 从SillyTavern获取世界书数据
    async loadWorldBook() {
        try {
            // 尝试通过ST API获取世界书
            const response = await fetch('/api/worldinfo/get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'WeChat_Contacts' })
            });

            if (response.ok) {
                this.worldData = await response.json();
                this.parseWorldData();
                return true;
            }
        } catch (e) {
            console.log('[WeChat] 尝试API加载世界书失败，使用内置数据');
        }

        // 尝试从全局context获取
        try {
            if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
                const context = SillyTavern.getContext();
                if (context.worldInfo) {
                    this.worldData = context.worldInfo;
                    this.parseWorldData();
                    return true;
                }
            }
        } catch (e) {
            console.log('[WeChat] 无法从context获取世界书');
        }

        // 使用默认数据
        this.loadDefaultData();
        return false;
    }

    // 解析世界书数据
    parseWorldData() {
        if (!this.worldData || !this.worldData.entries) return;

        const entries = this.worldData.entries;

        for (const key in entries) {
            const entry = entries[key];
            if (!entry.content) continue;

            // 解析角色条目
            try {
                const data = this.parseEntryContent(entry.content);
                if (data && data.type === 'contact') {
                    this.processContactData(data);
                } else if (data && data.type === 'group') {
                    this.processGroupData(data);
                } else if (data && data.type === 'moment') {
                    this.processMomentData(data);
                } else if (data && data.type === 'media') {
                    this.processMediaData(data);
                }
            } catch (e) {
                console.warn('[WeChat] 解析世界书条目失败:', key, e);
            }
        }
    }

    // 解析条目内容 - 支持JSON和特殊格式
    parseEntryContent(content) {
        // 尝试JSON解析
        try {
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[1]);
            }
            // 直接JSON
            if (content.trim().startsWith('{')) {
                return JSON.parse(content);
            }
        } catch (e) { }

        // 解析自定义标记格式
        const parsed = {};
        const typeMatch = content.match(/\[type:\s*(\w+)\]/i);
        if (typeMatch) parsed.type = typeMatch[1];

        const idMatch = content.match(/\[id:\s*([^\]]+)\]/i);
        if (idMatch) parsed.id = idMatch[1].trim();

        const nameMatch = content.match(/\[name:\s*([^\]]+)\]/i);
        if (nameMatch) parsed.name = nameMatch[1].trim();

        const avatarMatch = content.match(/\[avatar:\s*([^\]]+)\]/i);
        if (avatarMatch) parsed.avatar = avatarMatch[1].trim();

        // 媒体链接
        const photos = [];
        const photoRegex = /\[photo:\s*([^\]]+)\]/gi;
        let m;
        while ((m = photoRegex.exec(content)) !== null) {
            photos.push(m[1].trim());
        }
        if (photos.length > 0) parsed.photos = photos;

        const videos = [];
        const videoRegex = /\[video:\s*([^\]]+)\]/gi;
        while ((m = videoRegex.exec(content)) !== null) {
            videos.push(m[1].trim());
        }
        if (videos.length > 0) parsed.videos = videos;

        const gifs = [];
        const gifRegex = /\[gif:\s*([^\]]+)\]/gi;
        while ((m = gifRegex.exec(content)) !== null) {
            gifs.push(m[1].trim());
        }
        if (gifs.length > 0) parsed.gifs = gifs;

        // 本地路径
        const localPaths = [];
        const localRegex = /\[local:\s*([^\]]+)\]/gi;
        while ((m = localRegex.exec(content)) !== null) {
            localPaths.push(m[1].trim());
        }
        if (localPaths.length > 0) parsed.localPaths = localPaths;

        if (Object.keys(parsed).length > 1) return parsed;
        return null;
    }

    // 处理联系人数据
    processContactData(data) {
        const contact = {
            id: data.id || 'contact_' + Date.now(),
            name: data.name || '未知联系人',
            avatar: data.avatar || '',
            wxId: data.wxId || '',
            gender: data.gender || '',
            region: data.region || '',
            signature: data.signature || '',
            phone: data.phone || '',
            remark: data.remark || '',
            photos: data.photos || [],
            videos: data.videos || [],
            gifs: data.gifs || [],
            localPaths: data.localPaths || [],
            momentCover: data.momentCover || '',
            personality: data.personality || '',
            relationship: data.relationship || ''
        };

        // 添加到核心数据
        const existing = this.plugin.core.contacts.findIndex(c => c.id === contact.id);
        if (existing >= 0) {
            this.plugin.core.contacts[existing] = { ...this.plugin.core.contacts[existing], ...contact };
        } else {
            this.plugin.core.contacts.push(contact);
        }

        // 存储媒体映射
        this.characterMedia.set(contact.id, {
            photos: contact.photos,
            videos: contact.videos,
            gifs: contact.gifs,
            localPaths: contact.localPaths
        });

        // 自动添加到聊天列表
        if (!this.plugin.core.chatList.find(c => c.id === contact.id)) {
            this.plugin.core.chatList.push({
                id: contact.id,
                name: contact.remark || contact.name,
                avatar: contact.avatar,
                isGroup: false,
                lastMsg: '',
                lastTime: new Date().toISOString(),
                unread: 0,
                pinned: false,
                muted: false
            });
        }
    }

    // 处理群组数据
    processGroupData(data) {
        const group = {
            id: data.id || 'group_' + Date.now(),
            name: data.name || '群聊',
            avatar: data.avatar || '',
            members: data.members || [],
            notice: data.notice || '',
            owner: data.owner || ''
        };

        const existing = this.plugin.core.groups.findIndex(g => g.id === group.id);
        if (existing >= 0) {
            this.plugin.core.groups[existing] = { ...this.plugin.core.groups[existing], ...group };
        } else {
            this.plugin.core.groups.push(group);
        }

        // 添加到聊天列表
        if (!this.plugin.core.chatList.find(c => c.id === group.id)) {
            this.plugin.core.chatList.push({
                id: group.id,
                name: group.name,
                avatar: group.avatar,
                isGroup: true,
                memberCount: group.members.length,
                lastMsg: '',
                lastTime: new Date().toISOString(),
                unread: 0,
                pinned: false,
                muted: false
            });
        }
    }

    // 处理朋友圈数据
    processMomentData(data) {
        this.plugin.moments.addMoment({
            id: data.id,
            userId: data.userId,
            userName: data.userName,
            userAvatar: data.userAvatar,
            text: data.text || '',
            images: data.images || [],
            video: data.video || null,
            link: data.link || null,
            likes: data.likes || [],
            comments: data.comments || [],
            time: data.time || new Date().toISOString()
        });
    }

    // 处理媒体数据
    processMediaData(data) {
        if (data.characterId) {
            const existing = this.characterMedia.get(data.characterId) || {
                photos: [], videos: [], gifs: [], localPaths: []
            };
            if (data.photos) existing.photos.push(...data.photos);
            if (data.videos) existing.videos.push(...data.videos);
            if (data.gifs) existing.gifs.push(...data.gifs);
            if (data.localPaths) existing.localPaths.push(...data.localPaths);
            this.characterMedia.set(data.characterId, existing);
        }
    }

    // 获取角色的随机媒体
    getRandomMedia(characterId, type = 'photo') {
        const media = this.characterMedia.get(characterId);
        if (!media) return null;

        let pool;
        switch (type) {
            case 'photo': pool = media.photos; break;
            case 'video': pool = media.videos; break;
            case 'gif': pool = media.gifs; break;
            case 'local': pool = media.localPaths; break;
            default: pool = media.photos;
        }

        if (!pool || pool.length === 0) return null;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // 获取角色所有媒体
    getAllMedia(characterId) {
        return this.characterMedia.get(characterId) || { photos: [], videos: [], gifs: [], localPaths: [] };
    }

    // 加载默认数据（没有世界书时使用）
    loadDefaultData() {
        console.log('[WeChat] 使用默认联系人数据');

        const defaultContacts = [
            {
                type: 'contact',
                id: 'char_001',
                name: '小美',
                avatar: 'https://i.pravatar.cc/150?img=1',
                wxId: 'xiaomei_wx',
                gender: 'female',
                region: '北京',
                signature: '每天都要开心 ✨',
                photos: [
                    'https://picsum.photos/400/300?random=1',
                    'https://picsum.photos/300/400?random=2',
                    'https://picsum.photos/400/400?random=3'
                ],
                gifs: [],
                videos: [],
                personality: '活泼开朗'
            },
            {
                type: 'contact',
                id: 'char_002',
                name: '大明',
                avatar: 'https://i.pravatar.cc/150?img=3',
                wxId: 'daming_wx',
                gender: 'male',
                region: '上海',
                signature: '代码改变世界',
                photos: [
                    'https://picsum.photos/400/300?random=4',
                    'https://picsum.photos/300/400?random=5'
                ],
                gifs: [],
                videos: [],
                personality: '理性冷静'
            }
        ];

        defaultContacts.forEach(c => this.processContactData(c));

        // 默认群聊
        this.processGroupData({
            type: 'group',
            id: 'group_001',
            name: '好朋友们',
            members: [
                { id: 'char_001', name: '小美', avatar: 'https://i.pravatar.cc/150?img=1' },
                { id: 'char_002', name: '大明', avatar: 'https://i.pravatar.cc/150?img=3' },
                { id: 'self', name: '我', avatar: '' }
            ]
        });

        // 默认朋友圈
        this.processMomentData({
            type: 'moment',
            userId: 'char_001',
            userName: '小美',
            userAvatar: 'https://i.pravatar.cc/150?img=1',
            text: '今天天气真好~出去散步了 🌸',
            images: [
                'https://picsum.photos/400/300?random=10',
                'https://picsum.photos/300/400?random=11',
                'https://picsum.photos/400/400?random=12'
            ],
            likes: ['大明', '小红', '我'],
            comments: [
                { from: '大明', text: '风景不错！' },
                { from: '小美', replyTo: '大明', text: '谢谢夸奖~' }
            ],
            time: new Date(Date.now() - 3600000).toISOString()
        });
    }
}

export default WorldBookReader;
