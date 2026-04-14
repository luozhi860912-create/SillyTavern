// ============================================
// WeChat Media Manager
// 处理图片、视频、GIF的上传和显示
// ============================================

export class WeChatMedia {
    constructor(plugin) {
        this.plugin = plugin;
        this.localFiles = new Map(); // 本地文件缓存 id -> blob URL
    }

    // 创建文件选择器
    createFileInput(accept, multiple = false) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = accept;
            input.multiple = multiple;
            input.className = 'wechat-file-input';

            input.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                resolve(files);
                input.remove();
            });

            document.body.appendChild(input);
            input.click();
        });
    }

    // 选择图片
    async selectImages() {
        return this.createFileInput('image/*', true);
    }

    // 选择视频
    async selectVideo() {
        const files = await this.createFileInput('video/*', false);
        return files[0] || null;
    }

    // 选择GIF
    async selectGif() {
        const files = await this.createFileInput('image/gif', false);
        return files[0] || null;
    }

    // 选择任意文件
    async selectFile() {
        const files = await this.createFileInput('*/*', false);
        return files[0] || null;
    }

    // 文件转为本地URL
    fileToUrl(file) {
        const url = URL.createObjectURL(file);
        const id = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        this.localFiles.set(id, url);
        return { id, url };
    }

    // 文件转为Base64 data URL
    fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // 从URL加载图片
    async loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = url;
        });
    }

    // 获取视频缩略图
    getVideoThumbnail(videoUrl) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.currentTime = 1;

            video.addEventListener('loadeddata', () => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0);
                resolve(canvas.toDataURL('image/jpeg'));
            });

            video.addEventListener('error', () => {
                resolve(null);
            });

            video.src = videoUrl;
        });
    }

    // 获取视频时长
    getVideoDuration(videoUrl) {
        return new Promise((resolve) => {
            const video = document.createElement('video');
            video.addEventListener('loadedmetadata', () => {
                const duration = Math.floor(video.duration);
                const mins = Math.floor(duration / 60);
                const secs = duration % 60;
                resolve(`${mins}:${secs.toString().padStart(2, '0')}`);
            });
            video.addEventListener('error', () => resolve('0:00'));
            video.src = videoUrl;
        });
    }

    // 获取文件大小格式化
    static formatFileSize(bytes) {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
        if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
        return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
    }

    // 获取文件扩展名
    static getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }

    // 获取文件图标类型
    static getFileIconType(filename) {
        const ext = this.getFileExtension(filename);
        if (['pdf'].includes(ext)) return 'pdf';
        if (['doc', 'docx'].includes(ext)) return 'doc';
        if (['xls', 'xlsx'].includes(ext)) return 'xls';
        if (['ppt', 'pptx'].includes(ext)) return 'ppt';
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip';
        return 'other';
    }

    // 检测URL是否为图片
    static isImageUrl(url) {
        return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
    }

    // 检测URL是否为视频
    static isVideoUrl(url) {
        return /\.(mp4|webm|ogg|mov|avi|mkv)(\?.*)?$/i.test(url);
    }

    // 检测URL是否为GIF
    static isGifUrl(url) {
        return /\.gif(\?.*)?$/i.test(url);
    }

    // 显示图片查看器
    showImageViewer(imageUrl) {
        const existing = document.querySelector('.wechat-image-viewer');
        if (existing) existing.remove();

        const viewer = document.createElement('div');
        viewer.className = 'wechat-image-viewer';
        viewer.innerHTML = `
            <button class="close-btn"></button>
            <img src="${imageUrl}" />
        `;

        viewer.addEventListener('click', (e) => {
            if (e.target === viewer || e.target.classList.contains('close-btn')) {
                viewer.classList.remove('show');
                setTimeout(() => viewer.remove(), 300);
            }
        });

        document.body.appendChild(viewer);
        requestAnimationFrame(() => viewer.classList.add('show'));
    }

    // 显示视频播放器
    showVideoPlayer(videoUrl) {
        const existing = document.querySelector('.wechat-video-player');
        if (existing) existing.remove();

        const player = document.createElement('div');
        player.className = 'wechat-video-player';
        player.innerHTML = `
            <video src="${videoUrl}" controls autoplay style="max-width:95%;max-height:95vh"></video>
        `;

        player.addEventListener('click', (e) => {
            if (e.target === player) {
                const video = player.querySelector('video');
                video.pause();
                player.remove();
            }
        });

        document.body.appendChild(player);
    }

    // 显示上传模态框
    showUploadModal(type = 'image') {
        return new Promise((resolve) => {
            const existing = document.querySelector('.wechat-upload-modal');
            if (existing) existing.remove();

            const typeNames = {
                image: '图片',
                video: '视频',
                gif: '动图',
                file: '文件'
            };
            const acceptTypes = {
                image: 'image/*',
                video: 'video/*',
                gif: 'image/gif',
                file: '*/*'
            };

            const modal = document.createElement('div');
            modal.className = 'wechat-upload-modal';
            modal.innerHTML = `
                <div class="wechat-upload-modal-body wechat-slide-up">
                    <div class="wechat-upload-modal-title">发送${typeNames[type]}</div>
                    <div class="wechat-upload-zone" id="wechat-upload-zone">
                        <div class="wechat-upload-zone-icon">📁</div>
                        <div class="wechat-upload-zone-text">点击选择或拖拽${typeNames[type]}到此处</div>
                    </div>
                    <input type="text" class="wechat-upload-url-input" 
                           placeholder="或粘贴网络链接 / 本地路径..." id="wechat-upload-url" />
                    <div class="wechat-upload-preview" id="wechat-upload-preview"></div>
                    <div class="wechat-upload-actions">
                        <button class="wechat-profile-card-btn secondary" id="wechat-upload-cancel">取消</button>
                        <button class="wechat-profile-card-btn primary" id="wechat-upload-confirm" disabled>发送</button>
                    </div>
                </div>
            `;

            let selectedUrl = null;
            let selectedFile = null;

            const zone = modal.querySelector('#wechat-upload-zone');
            const urlInput = modal.querySelector('#wechat-upload-url');
            const preview = modal.querySelector('#wechat-upload-preview');
            const confirmBtn = modal.querySelector('#wechat-upload-confirm');
            const cancelBtn = modal.querySelector('#wechat-upload-cancel');

            // 点击选择文件
            zone.addEventListener('click', async () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = acceptTypes[type];
                input.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        selectedFile = file;
                        selectedUrl = URL.createObjectURL(file);
                        this.updateUploadPreview(preview, selectedUrl, type);
                        confirmBtn.disabled = false;
                    }
                });
                input.click();
            });

            // 拖拽
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('dragover');
            });
            zone.addEventListener('dragleave', () => {
                zone.classList.remove('dragover');
            });
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file) {
                    selectedFile = file;
                    selectedUrl = URL.createObjectURL(file);
                    this.updateUploadPreview(preview, selectedUrl, type);
                    confirmBtn.disabled = false;
                }
            });

            // URL输入
            urlInput.addEventListener('input', () => {
                const url = urlInput.value.trim();
                if (url) {
                    selectedUrl = url;
                    selectedFile = null;
                    this.updateUploadPreview(preview, url, type);
                    confirmBtn.disabled = false;
                } else {
                    confirmBtn.disabled = !selectedFile;
                }
            });

            cancelBtn.addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });

            confirmBtn.addEventListener('click', () => {
                modal.remove();
                resolve({
                    url: selectedUrl,
                    file: selectedFile,
                    type: type
                });
            });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(null);
                }
            });

            document.body.appendChild(modal);
        });
    }

    updateUploadPreview(container, url, type) {
        if (type === 'video') {
            container.innerHTML = `<video src="${url}" style="max-width:100%;max-height:200px;border-radius:8px" controls></video>`;
        } else {
            container.innerHTML = `<img src="${url}" style="max-width:100%;max-height:200px;border-radius:8px" 
                                   onerror="this.parentElement.innerHTML='<p style=\\'color:#999\\'>预览加载失败，但仍可发送</p>'" />`;
        }
    }

    // 清理
    cleanup() {
        this.localFiles.forEach(url => URL.revokeObjectURL(url));
        this.localFiles.clear();
    }
}

export default WeChatMedia;
