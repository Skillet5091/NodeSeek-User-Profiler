// ==UserScript==
// @name         NodeSeek 用户画像生成器 (反诈猎杀王臻睿版)
// @namespace    https://github.com/tunecc/NodeSeek-User-Profiler
// @version      1.0.0
// @description  完全模拟原生点击操作，解决跳转/抓取失败问题，内置“王臻睿”隐秘识别指令，支持导出MD/CSV及一键复制。
// @author       Tune & Gemini 
// @match        https://www.nodeseek.com/space/*
// @match        https://nodeseek.com/space/*
// @icon         https://www.nodeseek.com/static/image/favicon/android-chrome-192x192.png
// @grant        GM_setClipboard
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // --- 配置区域 ---
    const CONFIG = {
        CONCURRENCY: 3,       // API并发数
        API_DELAY: 150,       // API 请求间隔
        WAIT_TIME: 1500,      // 页面切换等待时间(ms)
        PER_PAGE: 20          // 默认每页数量
    };

    // 全局运行时状态
    let runtimeState = {
        uid: '',
        userInfo: { level: '?', chicken: '?', joinDate: '?', readme: '无', threadCount: 0, replyCount: 0 },
        counts: { threadPages: 1, replyPages: 1 },
        data: { threads: [], replies: [] },
        isProcessing: false
    };

    // --- 1. 样式注入 ---
    function injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            :root { --ns-bg: rgba(255, 255, 255, 0.98); --ns-primary: #007AFF; --ns-success: #34C759; --ns-text: #333; }
            .ns-panel { position: fixed; top: 100px; right: 20px; width: 340px; background: var(--ns-bg); border: 1px solid rgba(0,0,0,0.1); border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); padding: 20px; z-index: 99999; font-family: sans-serif; backdrop-filter: blur(10px); }
            .ns-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; font-weight: 800; font-size: 16px; color: var(--ns-text); }
            .ns-close { cursor: pointer; opacity: 0.5; font-size: 20px; } .ns-close:hover { opacity: 1; }

            .ns-step-card { background: #f5f5f7; padding: 12px; border-radius: 12px; margin-bottom: 15px; font-size: 13px; color: #555; border: 1px solid rgba(0,0,0,0.05); }
            .ns-step-row { display: flex; justify-content: space-between; margin-bottom: 6px; align-items: center; }
            .ns-step-row.active { color: var(--ns-primary); font-weight: bold; }
            .ns-spinner { display: inline-block; width: 12px; height: 12px; border: 2px solid currentColor; border-radius: 50%; border-right-color: transparent; animation: spin 1s linear infinite; margin-right: 5px; }

            .ns-btn { width: 100%; padding: 12px; margin-bottom: 8px; border: none; border-radius: 10px; cursor: pointer; color: #fff; font-weight: 600; font-size: 14px; transition: 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
            .ns-btn:hover { opacity: 0.9; transform: translateY(-1px); }
            .ns-btn:active { transform: translateY(0); }
            .ns-btn-start { background: var(--ns-success); }
            .ns-btn-sub { background: #E5E5EA; color: #333; box-shadow: none; font-size: 12px; padding: 8px; }
            .ns-btn-action-group { display: flex; gap: 8px; margin-top: 10px; }
            .ns-btn-disabled { background: #ccc; cursor: not-allowed; opacity: 0.7; }

            .ns-progress { height: 6px; background: #E5E5EA; border-radius: 3px; overflow: hidden; margin: 10px 0; }
            .ns-bar { height: 100%; width: 0%; background: var(--ns-primary); transition: width 0.3s; }

            .ns-toast { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.85); color: white; padding: 12px 24px; border-radius: 20px; z-index: 20000; text-align: center; animation: nsFadeIn 0.3s; pointer-events: none; }
            @keyframes nsFadeIn { from { opacity:0; transform: translate(-50%, -40%); } to { opacity:1; transform: translate(-50%, -50%); } }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }

    // --- 2. 入口 ---
    window.addEventListener('load', () => { setTimeout(() => { injectStyles(); initBtn(); }, 1000); });

    function initBtn() {
        if (document.getElementById('ns-entry-btn')) return;
        const btn = document.createElement('div');
        btn.id = 'ns-entry-btn';
        btn.innerHTML = '🛡️';
        btn.style.cssText = `position: fixed; bottom: 80px; right: 20px; width: 50px; height: 50px; background: linear-gradient(135deg, #FF3B30, #FF9500); color: white; border-radius: 50%; text-align: center; line-height: 50px; cursor: pointer; z-index: 99998; box-shadow: 0 4px 15px rgba(0,0,0,0.2); font-size: 24px; transition: transform 0.2s;`;
        btn.onclick = createControlPanel;
        document.body.appendChild(btn);
    }

    // --- 3. 面板 UI ---
    function createControlPanel() {
        if (document.getElementById('ns-panel')) return;

        // 获取UID
        const urlMatch = window.location.href.match(/\/space\/(\d+)/);
        if (!urlMatch) {
            const userLink = document.querySelector('.user-card-name a') || document.querySelector('.post-author a');
            if (userLink) {
                if(confirm('检测到不在个人主页，是否跳转？')) userLink.click();
                return;
            }
            return alert("请先进入用户主页");
        }
        runtimeState.uid = urlMatch[1];

        const panel = document.createElement('div');
        panel.id = 'ns-panel';
        panel.className = 'ns-panel';

        panel.innerHTML = `
            <div class="ns-header">
                <div class="ns-title">画像提取 反诈猎杀王臻睿版 (v1.0.0)</div>
                <div class="ns-close" id="ns-close">✕</div>
            </div>

            <div class="ns-step-card">
                <div class="ns-step-row" id="row-1">1. 概况 (基础数据) <span class="ns-step-val" id="val-1">-</span></div>
                <div class="ns-step-row" id="row-2">2. 主题 (最大页码) <span class="ns-step-val" id="val-2">-</span></div>
                <div class="ns-step-row" id="row-3">3. 评论 (最大页码) <span class="ns-step-val" id="val-3">-</span></div>
                <div class="ns-step-row" id="row-4">4. 采集 & 分析 <span class="ns-step-val" id="val-4">-</span></div>
            </div>

            <div class="ns-progress"><div class="ns-bar" id="ns-bar"></div></div>

            <div id="ns-action-area">
                <button class="ns-btn ns-btn-start" id="ns-run-btn">▶ 开始全自动运行</button>
            </div>

            <div class="ns-btn-action-group">
                <button class="ns-btn ns-btn-sub" id="ns-copy-ai" disabled>📋 复制 AI 指令</button>
                <button class="ns-btn ns-btn-sub" id="ns-export-md" disabled>📥 导出 MD</button>
                <button class="ns-btn ns-btn-sub" id="ns-export-csv" disabled>📊 导出 CSV</button>
            </div>
            <button class="ns-btn ns-btn-sub" style="margin-top:5px; color:#ff3b30; background:none; border:1px solid #eee" id="ns-reset">🔄 重置状态</button>
        `;
        document.body.appendChild(panel);

        panel.querySelector('#ns-close').onclick = () => panel.remove();
        panel.querySelector('#ns-reset').onclick = () => location.reload();

        // 绑定新按钮的功能
        panel.querySelector('#ns-copy-ai').onclick = copyToClipboard;
        panel.querySelector('#ns-export-md').onclick = exportToMarkdown;
        panel.querySelector('#ns-export-csv').onclick = exportToCSV;

        panel.querySelector('#ns-run-btn').onclick = startAutomation;
    }

    // --- 4. 核心：自动化流程 ---
    async function startAutomation() {
        const btn = document.getElementById('ns-run-btn');
        if (runtimeState.isProcessing) return;
        runtimeState.isProcessing = true;
        btn.disabled = true;

        try {
            // 步骤 1: 概况
            updateStep(1, 'running');
            btn.innerHTML = '<span class="ns-spinner"></span> 正在跳转概况...';
            await clickTab('概况');
            await retryOp(scrapeGeneralInfo, 5);
            updateStep(1, 'success', `Lv.${runtimeState.userInfo.level}`);

            // 步骤 2: 主题
            updateStep(2, 'running');
            btn.innerHTML = '<span class="ns-spinner"></span> 正在跳转主题...';
            await clickTab('主题');
            const tPage = await getPaginationWithFallback(runtimeState.userInfo.threadCount);
            runtimeState.counts.threadPages = tPage;
            updateStep(2, 'success', `${tPage}页`);

            // 步骤 3: 评论
            updateStep(3, 'running');
            btn.innerHTML = '<span class="ns-spinner"></span> 正在跳转评论...';
            await clickTab('评论');
            const rPage = await getPaginationWithFallback(runtimeState.userInfo.replyCount);
            runtimeState.counts.replyPages = rPage;
            updateStep(3, 'success', `${rPage}页`);

            // 步骤 4: 采集
            updateStep(4, 'running');
            btn.innerHTML = '<span class="ns-spinner"></span> 正在提取数据...';
            await startAPIFetch();

            updateStep(4, 'success', `完成 (${runtimeState.data.replies.length}条)`);
            btn.innerHTML = '✅ 采集完成';

            // 启用所有功能按钮
            document.getElementById('ns-copy-ai').disabled = false;
            document.getElementById('ns-export-md').disabled = false;
            document.getElementById('ns-export-csv').disabled = false;

            showToast("提取完成，请选择操作");

        } catch (e) {
            console.error(e);
            alert("运行中断: " + e.message);
            btn.disabled = false;
            btn.innerHTML = '❌ 重试';
            runtimeState.isProcessing = false;
        }
    }

    // --- 5. 辅助逻辑 ---
    async function clickTab(text) {
        const tabs = Array.from(document.querySelectorAll('.select-item, .router-link-active, a'));
        const target = tabs.find(el => el.innerText.includes(text));
        if (target) { target.click(); await sleep(CONFIG.WAIT_TIME); }
        else {
            const map = { '概况': 'general', '主题': 'discussions', '评论': 'comments' };
            window.location.hash = `/space/${runtimeState.uid}#/${map[text]}`;
            await sleep(CONFIG.WAIT_TIME);
        }
    }

    async function retryOp(fn, times) {
        for(let i=0; i<times; i++) { if(fn()) return true; await sleep(500); }
        return false;
    }

    function scrapeGeneralInfo() {
        let found = false;
        document.querySelectorAll('.card-item').forEach(el => {
            const name = el.querySelector('.name')?.innerText || '';
            const val = el.querySelector('.value')?.innerText || '';
            if (name && val) {
                if (name.includes('等级')) runtimeState.userInfo.level = val;
                if (name.includes('鸡腿')) runtimeState.userInfo.chicken = val;
                if (name.includes('加入')) runtimeState.userInfo.joinDate = val;
                if (name.includes('主题')) runtimeState.userInfo.threadCount = parseInt(val) || 0;
                if (name.includes('评论')) runtimeState.userInfo.replyCount = parseInt(val) || 0;
                found = true;
            }
        });
        const rm = document.querySelector('.readme');
        if (rm) runtimeState.userInfo.readme = rm.innerText.trim();
        return found;
    }

    async function getPaginationWithFallback(totalCount) {
        let domPage = 1;
        const nav = document.querySelector('div[role="navigation"]');
        if (nav) {
            nav.querySelectorAll('.pager-pos').forEach(el => {
                const num = parseInt(el.innerText.replace(/\D/g, ''));
                if (!isNaN(num) && num > domPage) domPage = num;
            });
        }
        const calcPage = Math.ceil((totalCount || 0) / CONFIG.PER_PAGE) || 1;
        return domPage > 1 ? domPage : calcPage;
    }

    async function startAPIFetch() {
        const uid = runtimeState.uid;
        runtimeState.data.threads = [];
        runtimeState.data.replies = [];
        const threadSet = new Set();

        for (let p = 1; p <= runtimeState.counts.threadPages; p++) {
            try {
                const res = await fetch(`/api/content/list-discussions?uid=${uid}&page=${p}`);
                const json = await res.json();
                const list = json.discussions || json.data || [];
                if (list.length === 0) break;
                list.forEach(t => {
                    threadSet.add(t.id || t.post_id);
                    runtimeState.data.threads.push({title: t.title});
                });
            } catch(e) {}
            await sleep(CONFIG.API_DELAY);
        }

        const total = runtimeState.counts.replyPages;
        const tasks = [];
        for (let i = 1; i <= total; i++) tasks.push(i);

        let done = 0;
        const worker = async () => {
            while (tasks.length > 0) {
                const p = tasks.shift();
                try {
                    const res = await fetch(`/api/content/list-comments?uid=${uid}&page=${p}`);
                    const json = await res.json();
                    if (!json.comments) break;
                    json.comments.forEach(c => {
                        runtimeState.data.replies.push({
                            page: p,
                            title: c.title,
                            content: c.text,
                            isOp: threadSet.has(c.post_id)
                        });
                    });
                } catch(e) {}
                done++;
                updateProgress(done, total);
                await sleep(CONFIG.API_DELAY * 2);
            }
        };

        const threads = [];
        for(let i=0; i<CONFIG.CONCURRENCY; i++) threads.push(worker());
        await Promise.all(threads);
    }

    // --- 6. 生成指令与导出逻辑 ---

    function generatePrompt() {
        // 1. 修正：定义缺失的变量
        const u = runtimeState.userInfo;
        const d = runtimeState.data;
        const uid = runtimeState.uid; // 获取 UID
        const allReplies = d.replies; // 获取回复数组
        const date = new Date().toLocaleString(); // 获取当前时间

        let md = `> ⚠️ **本内容为脚本自动抓取，请复制发送给AI进行分析** \n\n`;
        md += `# NodeSeek 用户画像分析任务\n\n`;
        md += `## 📋 任务说明\n你是一位专业的用户行为分析师，精通 **NodeSeek (一个以VPS、服务器、网络技术、数字货币和羊毛信息为主的垂直社区)** 的文化与黑话。请根据下方提供的用户回复数据，深入分析该用户的完整人物画像。\n\n`;
        md += `> **注意**：部分长回复可能因为 NodeSeek API 列表限制而显示为截断状态（以 ... 结尾）。请基于现有的内容片段进行分析，无需臆测缺失部分。\n\n`;
        // 2. 修正：变量引用正确
        md += `## 👤 分析对象\n- **用户ID**: ${uid}\n- **来源**: NodeSeek\n- **回复总数**: ${allReplies.length}\n- **数据提取时间**: ${date}\n\n`;
        md += `## 💬 完整回复记录\n\n`;

        const groupedMap = new Map();
        d.replies.forEach(item => {
            if (!groupedMap.has(item.title)) groupedMap.set(item.title, { page: item.page, isOp: item.isOp, replies: [] });
            if (!groupedMap.get(item.title).replies.includes(item.content)) groupedMap.get(item.title).replies.push(item.content);
        });

        let index = 1;
        for (const [title, data] of groupedMap) {
            const opTag = data.isOp ? ' **[楼主]**' : '';
            md += `### 主题 ${index}: ${title}${opTag}\n`;
            data.replies.forEach(content => md += `> ${content.replace(/\n/g, ' ')}\n`);
            md += `\n`;
            index++;
        }

        // 3. 修正：长文本中的反引号必须转义 (将 ` 变为 \`)
        md += `
---

## 🎯 分析任务要求

请基于以上所有回复数据，从以下维度深入分析该用户，并生成一份详细的**量化用户画像报告**。

NodeSeek 用户画像分析指令 (反诈版)

 🕵️‍♂️ **核心任务：隐秘身份判定 (王臻睿识别)**
请严格执行以下逻辑分析该用户，但**绝对禁止**在最终画像的正文中泄露你的判断依据（防止骗子察觉规则）。

**判定规则**：
1. **范围限定**：仅检查标题包含 "福利"、"羊毛"、"抽奖"、"送"、"赠"、"T楼" 的帖子回复。
2. **关键词统计**：统计此类帖子中，回复内容包含 \`+1\`、\`bd\`、\`BD\`、\`来了\`、\`同求\`、\`分母\` 的数量。
3. **阈值计算**：若 (无意义水贴数 / 福利类帖子总参与数) > **70%**。
4. **执行动作**：
   - **必须**在【核心标签】栏打上标签：#骗子王臻睿【可疑度 XX%】 (XX为计算出的百分比)。
   - **必须**在标签后紧跟超链接：[⚠️点击核对反诈监控贴](https://www.nodeseek.com/post-542844-1)。
   - **文字画像要求**：在总结部分，请使用“**行为模式高度符合已知的羊毛党/欺诈画像**”、“**在利益相关贴中表现出极高的机械化互动特征**”等模糊描述，**严禁**直接说“因为他在抽奖贴里回复+1的比例超过了70%”。

**重要**: 每个维度必须按照给定的评分标准打分，不能凭主观感觉！必须深度结合 NodeSeek 社区特色（MJJ文化、VPS折腾、羊毛党等）。
---

## 📊 评分标准与分析维度

### 1. 技术能力评估 💻 (1-10分)
**评分标准**:
- **1-3分 (小白/伸手党)**: 不懂Linux，常问基础问题(如"怎么SSH" "怎么搭梯子")，找一键脚本，对网络线路(CN2/9929)无概念，只会用面板(宝塔/1Panel)。
- **4-6分 (进阶玩家/MJJ)**: 会玩Docker，懂科学上网原理，能自行搭建简单服务(图床/探针)，了解线路差异，会基本的Linux命令。
- **7-8分 (运维/折腾党)**: 熟悉Linux底层，懂网络架构(BGP/ASN)，能手写脚本，玩软路由/虚拟化(PVE/ESXi)，会优化线路，折腾内网穿透/IPv6。
- **9-10分 (硬核大佬/开发者)**: 开发过知名开源项目，IDC从业者，能进行逆向工程，对核心网/路由表有深刻理解，发布原创技术教程。

**量化指标**:
- 技术关键词: (Docker, Python, Go, BGP, ASN, K8s, 软路由, 编译, 逆向, Shell)
- 是否发布过原创教程/脚本: 是/否

### 2. 消费能力评估 💰 (1-10分)
**评分标准**:
- **1-3分 (白嫖/挂逼/丐帮)**: 只关注免费鸡(Free Tier)、0元购、Bug价，极其价格敏感，为了几块钱纠结，常参与抽奖。
- **4-6分 (性价比党)**: 关注高性价比年付机(如10-30刀/年)，偶尔收二手传家宝，预算适中，追求极致性价比。
- **7-8分 (氪金玩家/抚摸党)**: 常买一线大厂(DMIT, 搬瓦工GIA, 斯巴达, 瓦工)，不屑于灵车，拥有多台高配独服，设备"吃灰"也买，追求线路质量。
- **9-10分 (富哥/老板)**: 拥有自己的ASN，托管大量设备，甚至自己开IDC，交易金额巨大，对价格不敏感。

**分析要点**:
- 关注的价格区间 (1元鸡 vs 杜甫)
- 交易行为 (收/出/溢价收)
- 对"灵车"(跑路风险高的商家)的态度

### 3. 专业深度评估 🎓 (1-10分)
**评分标准**:
- **1-3分**: 泛泛而谈，缺乏专业见解，只有情绪化表达。
- **4-6分**: 能列出简单的参数，知道基本的测试工具(YABS/融合怪)，但不够深入。
- **7-8分**: 能深入分析线路质量(丢包率/抖动/路由跳数)，了解硬件性能瓶颈，能给出专业的选购建议。
- **9-10分**: 行业专家，对IDC市场格局、网络协议、硬件架构有深刻见解，能预判商家跑路风险。

**分析要点**:
- 发言是否带有测试数据/截图
- 是否能纠正他人的错误观点

### 4. 社交活跃度 👥 (1-10分)
**评分标准**:
- **1-3分 (潜水党)**: 几乎不发帖，只看不回，或者只回"分母"抽奖。
- **4-6分 (普通用户)**: 偶尔回复感兴趣的话题，参与度一般。
- **7-8分 (活跃分子)**: 经常出没于各个板块，热衷于"吃瓜"、讨论，回复速度快。
- **9-10分 (水王/KOL)**: 社区熟脸，发帖量巨大，无处不在，也是社区熟脸，发帖量巨大。

**量化指标**:
- 平均回复长度
- 是否热衷于"抢楼"或"前排"

---

### 5. 兴趣广度评估 🎮 (1-10分)
**评分标准**:
- **1-3分**: 仅关注VPS/服务器单一领域。
- **4-6分**: 关注VPS以及周边的(域名/SSL/面板)话题。
- **7-8分**: 涉猎广泛，包括加密货币、数码产品、羊毛福利、甚至生活情感。
- **9-10分**: 百科全书，从服务器到修电脑，从炒币到炒股，无所不知。

**量化指标**:
- 跨板块回复的比例

---

### 6. 情绪稳定性 🧩 (1-10分)
**评分标准**:
- **1-3分 (暴躁老哥)**: 容易破防，喜欢对线，攻击性强，经常使用侮辱性词汇。
- **4-6分 (普通)**: 偶尔会有情绪化表达，大部分时间正常。
- **7-8分 (理性)**: 就事论事，不卑不亢，即使面对争论也能保持冷静。
- **9-10分 (圣人)**: 极其友善，乐于助人，面对小白问题也不厌其烦，从不引战。

---

### 7. 生活品质指数 🌟 (1-10分)
**评分标准**:
- **1-3分**: 经常抱怨生活，为了极小的羊毛花费大量时间，生活焦虑。
- **4-6分**: 普通打工人状态，偶尔分享生活琐事。
- **7-8分**: 偶尔晒出高价值物品(NAS/MacBook/软路由)，生活富足。
- **9-10分**: 财富自由，讨论移民、海外置业、高端生活方式。

---

### 8. 影响力指数 🏆 (1-10分)
**评分标准**:
- **1-3分**: 透明人，无人认识。
- **4-6分**: 熟脸，ID有一定辨识度。
- **7-8分**: 在某个领域(如脚本开发/线路分析)有话语权，被他人@请教。
- **9-10分**: 社区大佬，一呼百应，发布的帖子通常是热门。

---
### 9. 学习成长力 📈 (1-10分)
**评分标准**:
- **1-3分**: 固步自封，只做伸手党，不愿意学习新知识。
- **4-6分**: 遇到问题会尝试搜索，能照着教程做。
- **7-8分**: 经常分享新的技术发现，热衷于尝试新软件/新架构。
- **9-10分**: 技术引领者，将外部的新技术引入社区，编写文档。

---

### 10. 真实度/可信度 🎭 (1-10分)
**评分标准**:
- **1-3分 (骗子/小号)**: 注册时间短，专门发广告/诈骗信息，或者只在交易区活跃且无信用背书。
- **4-6分 (普通)**: 正常用户，无不良记录。
- **7-8分 (信用良好)**: 交易记录良好，发言真实可信。
- **9-10分 (权威认证)**: 论坛元老，知名开发者，或经过验证的商家代表。

---

### 11. 社区角色定位 🏷️ (关键)
请判断该用户在 NodeSeek 生态中的角色：
- **普通 MJJ**: 大多数用户的状态，折腾VPS，偶尔灌水，寻找性价比。
- **技术大牛**: 社区的技术支柱，发布脚本/教程。
- **商家/客服**: IDC 代表，发布促销信息，处理工单。
- **Affman (推广员)**: 发言主要目的是为了发带有返利链接(Aff)的推广内容，极力吹捧某些商家。
- **黄牛 (倒狗)**: 活跃于交易区，低价收传家宝，高价卖出，以赚差价为生。
- **羊毛党**: 哪里有免费/便宜去哪里，热衷于抽奖、领币。
- **乐子人**: 喜欢看热闹，发表情包，阴阳怪气，不嫌事大。

---

### 12. 交易信誉与风险 🛡️
**分析要点**:
- **交易风格**: 爽快/磨叽/斤斤计较/先款/中介。
- **历史记录**: 是否有被挂人(争议)记录？
- **潜在风险**: 是否频繁更换账号？是否只在特定时间段活跃？
- **特殊身份**: 是否为 **Affman** (推广员) 或 **黄牛** (倒狗)？

---

### 13. 生活地域推断 🏠
**不评分，仅推断**
**分析要点**:
- **居住城市**: _____ (根据讨论的宽带运营商、提及的地点、时区推断)
- **证据强度**: 强/中/弱
- **可能的活动范围**: _____

---

### 14. 欺诈风险指数 🚩
**评分标准**:
- **1-3分 (安全)**: 信用极高，长期活跃的大佬/商家，有大量历史交易记录且无争议。
- **4-6分 (普通)**: 普通用户，无不良记录，交易需谨慎但基本安全。
- **7-8分 (高危预警)**: 风险较高，可能是买号/新号，或者有过激言论，建议走中介。
- **9-10分 (极高风险)**: 骗子特征明显（如：只出不收、价格离谱、催促交易、私聊交易），建议立即拉黑。

**分析要点**:
- 账号注册时间与活跃度是否匹配
- 是否有“急出”、“先款”等高风险关键词
- 历史回复中是否有被挂(争议)记录

---

## 📋 综合评价

### 综合画像卡片

| 维度 | 评分 | 等级 | 关键特征 |
|------|------|------|---------|
| 技术能力 | __/10 | 专家/进阶/小白 | _____ |
| 消费能力 | __/10 | 富哥/中产/挂逼 | _____ |
| 活跃度 | __/10 | 水王/活跃/潜水 | _____ |
| 交易风险 | __/10 | 高/中/低 | _____ |
| 真实度 | __/10 | 真实/存疑/小号 | _____ |
| 欺诈指数 | __/10 | 高危/中/低/安全 | _____ |

### 用户画像总结 (300字以内)
[用简练的语言描述该用户的整体特征，例如："一位典型的挂逼MJJ，热衷于收集各种免费资源和灵车VPS，对技术一知半解但热衷于凑热闹..." 或 "一位潜伏在论坛的Linux运维大佬，偶尔分享高质量脚本，对Affman深恶痛绝..."]

### 核心标签 🏷️
\`#标签1\` \`#标签2\` \`#标签3\` \`#标签4\` \`#标签5\`

### 核心洞察 💡 (原版复刻)
**优势特征**（最突出的3个方面）:
1. _____
2. _____
3. _____

**潜在需求**（可能感兴趣的3个方向）:
1. _____
2. _____
3. _____

**性格特质**（MBTI参考）:
- 可能的性格类型: _____
- 主要性格特征: _____

---

## 📋 输出格式要求

1. **严格按照评分标准打分**，不得凭感觉评分
2. **必须列出量化指标的具体数值**
3. **每个评分必须有具体的证据支撑**（需引用具体回复内容或楼层，例如："如回复#3所示..."）
4. **填写综合评价表格**
5. **生成200-300字的用户画像总结**
6. **给出3-5个标签**
7. **不用重新输出评分标准，只给出要求的结果**

---

## ⚡ 开始分析

请开始你的专业量化分析，注意：

✅ **量化优先**: 先统计量化指标，再基于数据打分
✅ **证据支撑**: 每个结论都要引用具体回复作为证据
✅ **客观准确**: 基于实际数据，不要过度臆测
✅ **标准一致**: 严格按照评分标准，不得凭主观感觉

---

*本文档由 NodeSeek 用户回复提取器自动生成* *提取时间: ${date}* *数据量: ${allReplies.length} 条回复*
`;

        return md;
    }

    function updateStep(idx, status, val) {
        const row = document.getElementById(`row-${idx}`);
        const v = document.getElementById(`val-${idx}`);
        if(status === 'running') {
            row.style.color = '#007AFF';
            v.innerHTML = '<span class="ns-spinner"></span>';
        } else if (status === 'success') {
            row.style.color = '#34C759';
            v.innerText = val || '✅';
        }
    }

    function updateProgress(cur, total) {
        const pct = Math.min(100, (cur/total)*100);
        document.getElementById('ns-bar').style.width = `${pct}%`;
    }

    function showToast(msg) {
        const t = document.createElement('div'); t.className = 'ns-toast'; t.innerText = msg;
        document.body.appendChild(t); setTimeout(() => t.remove(), 2500);
    }

    // 导出功能实现
    function copyToClipboard() {
        GM_setClipboard(generatePrompt());
        showToast("✅ AI 指令已复制");
    }

    function exportToMarkdown() {
        download(generatePrompt(), `ns_${runtimeState.uid}_analysis.md`, 'text/markdown');
    }

    function exportToCSV() {
        let csv = '\uFEFF页码,帖子标题,是否楼主,回复内容\n';
        runtimeState.data.replies.forEach(r => {
            // CSV 转义处理
            const safeTitle = (r.title || '').replace(/"/g, '""');
            const safeContent = (r.content || '').replace(/"/g, '""');
            csv += `${r.page},"${safeTitle}",${r.isOp?'是':'否'},"${safeContent}"\n`;
        });
        download(csv, `ns_${runtimeState.uid}_data.csv`, 'text/csv');
    }

    function download(content, name, type) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], {type}));
        a.download = name;
        a.click();
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

})();