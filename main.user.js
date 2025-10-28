// ==UserScript==
// @name         better_zhihu
// @namespace    https://github.com/erertertet/betterZhihu
// @version      1.5.0
// @description  在知乎回答和文章中标记评论/点赞比，将编辑时间和发布时间显示在标题下方，隐藏原始时间，优化分享和按钮布局，启用文本复制
// @author       Erertertet
// @match        https://www.zhihu.com/*
// @downloadURL  https://github.com/erertertet/betterZhihu/blob/main/main.user.js?raw=true
// @updateURL    https://github.com/erertertet/betterZhihu/blob/main/main.meta.js?raw=true
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_THEME = 'light';

    function isDeviceThemeDark() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    // 知乎实际上有一套隐藏的深色主题 style
    // - 向网址后添加 `?theme=dark` 可以切换到深色模式
    // - 与此同时，<html> 的 "data-theme" 属性也会随之变化
    function getCurrentPageTheme() {
        const dataTheme = document.documentElement.getAttribute('data-theme');
        if (dataTheme === 'dark' || dataTheme === 'light') {
            return dataTheme;
        }
        const urlParams = new URLSearchParams(window.location.search);
        const urlTheme = urlParams.get('theme');
        if (urlTheme === 'dark' || urlTheme === 'light') {
            return urlTheme;
        }
        return DEFAULT_THEME;
    }

    const expectedTheme = isDeviceThemeDark() ? 'dark' : 'light';
    const actualTheme = getCurrentPageTheme();
    // console.log(`Device wants: ${expectedTheme}, Page has: ${actualTheme}`);

    // 根据浏览器主题自动切换深浅模式
    if (actualTheme !== expectedTheme) {
        // console.log(`Theme mismatch detected. Attempting to switch to ${expectedTheme}...`);
        const url = new URL(window.location.href);
        url.searchParams.set('theme', expectedTheme);
        window.location.href = url.toString();
    }

    // ==================== 启用文本复制功能 ====================
    // 拦截复制事件，阻止知乎的限制
    document.addEventListener('copy', function(e) {
        e.stopPropagation(); // 阻止知乎的事件处理器
    }, true); // capture phase - 优先级最高

    // 格式化时间
    function formatTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}`;
    }

    // 从 data-za-extra-module 中提取数据
    function extractDataFromJson(element) {
        try {
            const dataAttr = element.getAttribute('data-za-extra-module');
            if (!dataAttr) return null;
            const data = JSON.parse(dataAttr);
            return data.card?.content || null;
        } catch (e) {
            return null;
        }
    }

    // 获取完整的分享文本
    function getShareText(contentItem) {
        const isAnswer = contentItem.classList.contains('AnswerItem');
        const isArticle = contentItem.classList.contains('ArticleItem');

        const jsonData = JSON.parse(contentItem.getAttribute('data-zop'));
        const jsonExtra = JSON.parse(contentItem.getAttribute('data-za-extra-module'));

        const jsonDataCombined = { ...jsonData, ...jsonExtra };

        // console.log(jsonDataCombined);

        let title = jsonDataCombined.title;
        let author = jsonDataCombined.authorName;
        let ids = jsonDataCombined.card.content;

        if (isAnswer) {


            // 获取URL - 注意不要重复添加域名
            let url = `https://www.zhihu.com/question/${ids.parent_token}/answer/${ids.token}`;

            return `${title} - ${author}的回答 - 知乎\n${url}`;
        } else if (isArticle) {

            let url = `https://zhuanlan.zhihu.com/p/${ids.token}`;

            return `${title} - ${author}的文章 - 知乎\n${url}`;
        }
        return null;
    }

    // 复制到剪贴板
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                showCopyNotification('链接已复制到剪贴板');
            }).catch(() => {
                fallbackCopy(text);
            });
        } else {
            fallbackCopy(text);
        }
    }

    // 备用复制方法
    function fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showCopyNotification('链接已复制到剪贴板');
        } catch (err) {
            showCopyNotification('复制失败，请手动复制');
        }
        document.body.removeChild(textarea);
    }

    // 显示复制提示
    // 修改颜色代码 rgba(0, 0, 0, 0.8) -> oklch(0%, 0%, 0%)
    function showCopyNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: oklch(0% 0 none / 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10000;
            animation: fadeInOut 2s ease-in-out;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeInOut {
                0% { opacity: 0; }
                15% { opacity: 1; }
                85% { opacity: 1; }
                100% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(notification);

        setTimeout(() => {
            document.body.removeChild(notification);
        }, 2000);
    }

    // 修改分享按钮为一键复制链接
    function modifyShareButton(contentItem) {
        const shareMenu = contentItem.querySelector('.ShareMenu');
        if (!shareMenu) return;

        const shareText = getShareText(contentItem);
        if (!shareText) return;

        // 找到分享按钮的容器
        const shareToggler = shareMenu.querySelector('.ShareMenu-toggler');
        if (!shareToggler) return;

        const shareButton = shareToggler.querySelector('button');
        if (!shareButton) return;

        // 检查是否已经修改过
        if (shareButton.dataset.customShare === 'true') return;
        shareButton.dataset.customShare = 'true';

        // 移除原有的点击事件，添加新的复制功能
        const newShareButton = shareButton.cloneNode(true);
        newShareButton.dataset.customShare = 'true';
        shareButton.parentNode.replaceChild(newShareButton, shareButton);

        newShareButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(shareText);
        });
    }

    // 隐藏收藏和喜欢按钮
    function hideCollectAndLikeButtons(contentItem) {
        // 查找所有按钮
        const buttons = contentItem.querySelectorAll('.ContentItem-action');

        buttons.forEach(button => {
            const buttonText = button.textContent || button.getAttribute('aria-label') || '';

            // 隐藏收藏按钮
            if (buttonText.includes('收藏') || button.querySelector('.Zi--Star')) {
                button.style.display = 'none';
                button.dataset.originalButton = 'collect';
            }

            // 隐藏喜欢按钮
            if (buttonText.includes('喜欢') || button.querySelector('.Zi--Heart')) {
                button.style.display = 'none';
                button.dataset.originalButton = 'like';
            }
        });
    }

    // 在更多菜单中添加收藏和喜欢选项
    function addButtonsToMenu(contentItem) {
        // 找到更多按钮
        const moreButton = contentItem.querySelector('.OptionsButton');
        if (!moreButton || moreButton.dataset.menuEnhanced) return;

        moreButton.dataset.menuEnhanced = 'true';

        // 监听菜单打开
        const observer = new MutationObserver(() => {
            const popoverId = moreButton.getAttribute('aria-controls') || moreButton.id.replace('-toggle', '-content');
            const menu = document.getElementById(popoverId);

            if (menu && menu.classList.contains('Popover-content-enter-done')) {
                const menuContainer = menu.querySelector('.Menu');
                if (!menuContainer || menuContainer.dataset.itemsAdded) return;

                menuContainer.dataset.itemsAdded = 'true';

                // 获取原始按钮
                const collectBtn = contentItem.querySelector('[data-original-button="collect"]');
                const likeBtn = contentItem.querySelector('[data-original-button="like"]');

                // 添加收藏菜单项
                if (collectBtn) {
                    const collectMenuItem = document.createElement('button');
                    collectMenuItem.type = 'button';
                    collectMenuItem.className = 'Button Menu-item Button--plain';
                    collectMenuItem.innerHTML = `
                        <svg width="1.2em" height="1.2em" viewBox="0 0 24 24" class="Zi Zi--Star" fill="currentColor" style="margin-right: 8px;">
                            <path d="M10.484 3.307c.673-1.168 2.358-1.168 3.032 0l2.377 4.122a.25.25 0 0 0 .165.12l4.655.987c1.319.28 1.84 1.882.937 2.884l-3.186 3.535a.25.25 0 0 0-.063.193l.5 4.733c.142 1.34-1.222 2.33-2.453 1.782l-4.346-1.938a.25.25 0 0 0-.204 0l-4.346 1.938c-1.231.549-2.595-.442-2.453-1.782l.5-4.733a.25.25 0 0 0-.064-.193L2.35 11.42c-.903-1.002-.382-2.604.937-2.884l4.655-.987a.25.25 0 0 0 .164-.12l2.378-4.122Z"></path>
                        </svg>
                        收藏
                    `;
                    collectMenuItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        collectBtn.click();
                        // 关闭菜单
                        menu.style.display = 'none';
                    });
                    menuContainer.appendChild(collectMenuItem);
                }

                // 添加喜欢菜单项
                if (likeBtn) {
                    const likeMenuItem = document.createElement('button');
                    likeMenuItem.type = 'button';
                    likeMenuItem.className = 'Button Menu-item Button--plain';
                    likeMenuItem.innerHTML = `
                        <svg width="1.2em" height="1.2em" viewBox="0 0 24 24" class="Zi Zi--Heart" fill="currentColor" style="margin-right: 8px;">
                            <path fill-rule="evenodd" d="M17.142 3.041c1.785.325 3.223 1.518 4.167 3.071 1.953 3.215.782 7.21-1.427 9.858a23.968 23.968 0 0 1-4.085 3.855c-.681.5-1.349.923-1.962 1.234-.597.303-1.203.532-1.748.587a.878.878 0 0 1-.15.002c-.545-.04-1.162-.276-1.762-.582a14.845 14.845 0 0 1-2.008-1.27 24.254 24.254 0 0 1-4.21-4.002c-2.1-2.56-3.16-6.347-1.394-9.463.92-1.624 2.362-2.892 4.173-3.266 1.657-.341 3.469.097 5.264 1.44 1.75-1.309 3.516-1.76 5.142-1.464Z" clip-rule="evenodd"></path>
                        </svg>
                        喜欢
                    `;
                    likeMenuItem.addEventListener('click', (e) => {
                        e.stopPropagation();
                        likeBtn.click();
                        // 关闭菜单
                        menu.style.display = 'none';
                    });
                    menuContainer.appendChild(likeMenuItem);
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    // 处理单个内容项（回答或文章）
    function processContentItem(contentItem) {
        // 判断是回答还是文章
        const isAnswer = contentItem.classList.contains('AnswerItem');
        const isArticle = contentItem.classList.contains('ArticleItem');

        if (!isAnswer && !isArticle) return;

        // 获取数据 - 优先从 meta 标签获取，其次从 JSON 获取
        let upvoteCount, commentCount, dateCreated, dateModified;

        // 从 meta 标签获取
        if (isAnswer) {
            upvoteCount = parseInt(contentItem.querySelector('meta[itemprop="upvoteCount"]')?.content || 0);
            commentCount = parseInt(contentItem.querySelector('meta[itemprop="commentCount"]')?.content || 0);
            dateCreated = contentItem.querySelector('meta[itemprop="dateCreated"]')?.content;
            dateModified = contentItem.querySelector('meta[itemprop="dateModified"]')?.content;
        } else {
            // 文章使用不同的 itemprop
            commentCount = parseInt(contentItem.querySelector('meta[itemprop="commentCount"]')?.content || 0);
            dateCreated = contentItem.querySelector('meta[itemprop="datePublished"]')?.content;
            dateModified = contentItem.querySelector('meta[itemprop="dateModified"]')?.content;

            // 从 JSON 中获取点赞数（文章没有 upvoteCount 的 meta 标签）
            const jsonData = extractDataFromJson(contentItem);
            upvoteCount = jsonData?.upvote_num || 0;
        }

        // 3. 修改分享按钮（每次都检查，因为展开/收起会重新渲染）
        modifyShareButton(contentItem);

        // 4. 隐藏收藏和喜欢按钮（每次都检查）
        hideCollectAndLikeButtons(contentItem);

        // 5. 在更多菜单中添加收藏和喜欢选项
        addButtonsToMenu(contentItem);

        // 2. 如果是文章，在标题内部添加"文章"标签（链接前）
        if (isArticle && !contentItem.querySelector('.custom-article-tag')) {
            const articleTag = document.createElement('span');
            articleTag.className = 'custom-article-tag';
            articleTag.textContent = '文章';

            // #1677ff44 (RGBA: 22, 119, 255, 0.27) -> oklch(60% 0.22 260 / 0.27)
            // #1677ff (RGB: 22, 119, 255) -> oklch(60% 0.22 260)
            articleTag.style.cssText = `
                display: inline-block;
                margin-right: 8px;
                padding: 1px 4px;
                background-color: oklch(60% 0.22 260 / 0.27);
                color: oklch(60% 0.22 260);
                border-radius: 3px;
                font-size: 12px;
                font-weight: 500;
                vertical-align: middle;
            `;

            const titleSpan = contentItem.querySelector('.ContentItem-title span');
            if (titleSpan) {
                const link = titleSpan.querySelector('a');
                if (link) {
                    titleSpan.insertBefore(articleTag, link);
                }
            }
        }

        // 3. 添加时间信息到标题下方（仅在展开状态）
        const richContent = contentItem.querySelector('.RichContent');
        const isCollapsed = richContent?.classList.contains('is-collapsed');

        // 只在展开状态下显示时间信息
        if (!isCollapsed) {
            const title = contentItem.querySelector('.ContentItem-title');
            const meta = contentItem.querySelector('.ContentItem-meta');

            if (title && (dateCreated || dateModified)) {
                // 检查是否已经添加过时间信息
                const existingTimeInfo = contentItem.querySelector('.custom-time-info');
                if (existingTimeInfo) return;

                const timeInfoDiv = document.createElement('div');
                timeInfoDiv.className = 'custom-time-info';

                // #8590a6 (RGB: 133, 144, 166) -> oklch(65% 0.04 260)
                // #f0f0f044 (RGBA: 240, 240, 240, 0.27) -> oklch(96% 0 none / 0.27)
                timeInfoDiv.style.cssText = `
                    padding: 8px 0;
                    font-size: 13px;
                    color: oklch(65% 0.04 260);
                    border-bottom: 1px solid oklch(96% 0 none / 0.27);
                    margin-bottom: 12px;
                `;

                const createdTime = formatTime(dateCreated);
                const modifiedTime = formatTime(dateModified);

                let timeHTML = "";
                if (createdTime) {
                    timeHTML += `发布于 ${createdTime}`;
                }
                if (modifiedTime && modifiedTime !== createdTime) {
                    timeHTML += `<br/> 编辑于 ${modifiedTime}`;
                }

                timeInfoDiv.innerHTML = timeHTML;

                // 插入到标题和meta之间，如果没有meta就插入到标题后面
                if (meta) {
                    title.parentNode.insertBefore(timeInfoDiv, meta);
                } else {
                    title.insertAdjacentElement('afterend', timeInfoDiv);
                }

                // 隐藏原始的时间显示元素
                hideOriginalTime(contentItem);
            } else if (
                isAnswer &&
                window.location.href.includes('/question/')
            ) {
                // 在问题详情页才执行的逻辑（没有成功插入时间信息时）
                // TODO: 在这里添加需要的处理代码

                const author_Info = contentItem.querySelector('.AuthorInfo');

                // 检查是否已经添加过时间信息
                const existingTimeInfo = contentItem.querySelector('.custom-time-info');
                if (existingTimeInfo) return;

                const timeInfoDiv = document.createElement('div');
                timeInfoDiv.className = 'custom-time-info';

                // #8590a6 (RGB: 133, 144, 166) -> oklch(65% 0.04 260)
                // #f0f0f044 (RGBA: 240, 240, 240, 0.27) -> oklch(96% 0 none / 0.27)
                timeInfoDiv.style.cssText = `
                padding: 8px 0;
                font-size: 13px;
                color: oklch(65% 0.04 260);
                border-bottom: 1px solid oklch(96% 0 none / 0.27);
                margin-bottom: 12px;
            `;

                const createdTime = formatTime(dateCreated);
                const modifiedTime = formatTime(dateModified);

                let timeHTML = '';
                if (createdTime) {
                    timeHTML += `发布于 ${createdTime}`;
                }
                if (modifiedTime && modifiedTime !== createdTime) {
                    timeHTML += ` | 编辑于 ${modifiedTime}`;
                }

                timeInfoDiv.innerHTML = timeHTML;

                author_Info.insertAdjacentElement('afterend', timeInfoDiv);

                // 隐藏原始的时间显示元素
                hideOriginalTime(contentItem);

            }

        } else {
            // 如果是折叠状态，移除可能存在的时间信息
            const existingTimeInfo = contentItem.querySelector('.custom-time-info');
            if (existingTimeInfo) {
                existingTimeInfo.remove();
            }
        }

        
        // 1. 添加评论/点赞比标签到标题内部（链接前）
        if (!contentItem.querySelector('.custom-ratio-tag')) {
            let ratio = 0;
            if (upvoteCount > 0) {
                ratio = (commentCount / upvoteCount).toFixed(2);
            } else {
                ratio = 0.00.toFixed(2);
            }
            const ratioElement = document.createElement('span');
            ratioElement.className = 'custom-ratio-tag';

            // 默认颜色：#64646444 和 #888888 转换为 Oklch
            // #64646444 (RGBA: 100, 100, 100, 0.27) -> oklch(50% 0 none / 0.27)
            // #888888 (RGB: 136, 136, 136) -> oklch(63% 0 none)
            let backgroundColor = 'oklch(50% 0 none / 0.27)';
            let color = 'oklch(63% 0 none)';
            let fontWeight = '500';

            // 根据比例设置颜色
            if (upvoteCount >= 500 && ratio < 0.1) {
                // 高赞且低评论比 - 高质量回答标识
                // #2e7d3244 (RGBA: 46, 125, 50, 0.27) -> oklch(52% 0.13 140 / 0.27)
                // #2e7d32 (RGB: 46, 125, 50) -> oklch(52% 0.13 140)
                backgroundColor = 'oklch(52% 0.13 140 / 0.27)';
                color = 'oklch(52% 0.13 140)';
                fontWeight = 'bold';
            } else if (ratio > 1) {
                // 高评论比
                // #d32f2f44 (RGBA: 211, 47, 47, 0.27) -> oklch(57% 0.2 26 / 0.27)
                // #d32f2f (RGB: 211, 47, 47) -> oklch(57% 0.2 26)
                backgroundColor = 'oklch(57% 0.2 26 / 0.27)';
                color = 'oklch(57% 0.2 26)';
                fontWeight = 'bold';
            } else if (ratio > 0.5) {
                // 中高评论比
                // #e6510044 (RGBA: 230, 81, 0, 0.27) -> oklch(63% 0.2 40 / 0.27)
                // #e65100 (RGB: 230, 81, 0) -> oklch(63% 0.2 40)
                backgroundColor = 'oklch(63% 0.2 40 / 0.27)';
                color = 'oklch(63% 0.2 40)';
            } else if (ratio > 0.25) {
                // 中评论比
                // #f57c0044 (RGBA: 245, 124, 0, 0.27) -> oklch(71% 0.18 54 / 0.27)
                // #f57c00 (RGB: 245, 124, 0) -> oklch(71% 0.18 54)
                backgroundColor = 'oklch(71% 0.18 54 / 0.27)';
                color = 'oklch(71% 0.18 54)';
            }

            ratioElement.style.cssText = `
                display: inline-block;
                margin-right: 8px;
                padding: 1px 4px;
                background-color: ${backgroundColor};
                border-radius: 3px;
                font-size: 12px;
                font-weight: ${fontWeight};
                color: ${color};
                white-space: nowrap;
                vertical-align: middle;
            `;
            ratioElement.textContent = ratio;

            // 插入到问题div内部（链接之前）
            const questionDiv = contentItem.querySelector('[itemprop="zhihu:question"]');

            if (questionDiv) {
                const link = questionDiv.querySelector('a');
                if (link) {
                    questionDiv.insertBefore(ratioElement, link);
                }
            } else if (isArticle) {
                // 文章没有 zhihu:question，直接插入到标题span内部
                const titleSpan = contentItem.querySelector('.ContentItem-title span');
                if (titleSpan) {
                    const link = titleSpan.querySelector('a');
                    if (link) {
                        titleSpan.insertBefore(ratioElement, link);
                    }
                }
            } else if (
                isAnswer &&
                window.location.href.includes('/question/')
            ) {
                const content_meta = contentItem.querySelector('.custom-time-info');
                if (content_meta) {
                    content_meta.insertBefore(ratioElement, content_meta.firstChild);
                }
            }
        }
    }

    // 隐藏原始的时间显示
    function hideOriginalTime(contentItem) {
        // 隐藏回答底部的"发布于"时间
        const timeElement = contentItem.querySelector('.ContentItem-time');
        if (timeElement && !timeElement.dataset.hidden) {
            timeElement.style.display = 'none';
            timeElement.dataset.hidden = 'true';
        }
    }

    // 监听DOM变化
    function observeContent() {
        const observer = new MutationObserver((mutations) => {
            // 处理回答
            const answers = document.querySelectorAll('.ContentItem.AnswerItem');
            answers.forEach(processContentItem);

            // 处理文章
            const articles = document.querySelectorAll('.ContentItem.ArticleItem');
            articles.forEach(processContentItem);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class'] // 监听 class 变化（展开/折叠会改变 class）
        });

        // 初始处理已存在的内容
        const answers = document.querySelectorAll('.ContentItem.AnswerItem');
        answers.forEach(processContentItem);

        const articles = document.querySelectorAll('.ContentItem.ArticleItem');
        articles.forEach(processContentItem);

        // 额外添加一个定时检查，确保按钮修改不会丢失
        setInterval(() => {
            const allItems = document.querySelectorAll('.ContentItem.AnswerItem, .ContentItem.ArticleItem');
            allItems.forEach(item => {
                // 重新应用分享按钮修改
                modifyShareButton(item);
                // 重新隐藏收藏和喜欢按钮
                hideCollectAndLikeButtons(item);
            });
        }, 1000); // 每秒检查一次
    }

    // 等待页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeContent);
    } else {
        observeContent();
    }
})();