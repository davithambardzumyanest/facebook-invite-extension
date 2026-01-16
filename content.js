if (window.hasRun) {
    // The script has already been injected, so we don't need to do anything.
} else {
    window.hasRun = true;

    const state = {
        isRunning: false,
        stopRequested: false,
        currentPost: 0,
        totalPosts: 0,
        invitesSent: 0,
        settings: {
            postCount: 5,
            inviteCount: 10,
            delay: 2,
            maxInvitesPerPost: 5,
        },
    };

    // --- UTILITY FUNCTIONS ---
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const getElementsByXPath = (xpath, context = document) => {
        const result = document.evaluate(xpath, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const elements = [];
        for (let i = 0; i < result.snapshotLength; i++) {
            elements.push(result.snapshotItem(i));
        }
        return elements;
    };

    function getAllPosts() {
        return getElementsByXPath(
            '//div/div/div/div/div/div/div/div/div/div/div/div[13]/div/div/div[5]/div[@data-visualcompletion="ignore-dynamic"]/div/div/div/div[1]/div/div[1]/div/span/div/span[2]/span/span'
        );
    }
    const isVisible = (el) => {
        if (!el || !el.isConnected) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    // --- CORE LOGIC ---
    async function processPosts() {
        if (state.isRunning) return;
        Object.assign(state, { isRunning: true, stopRequested: false, currentPost: 0, invitesSent: 0 });

        try {
            const settings = await new Promise(resolve => chrome.storage.sync.get({ postCount: 5, inviteCount: 10, delay: 2, maxInvitesPerPost: 5 }, resolve));
            state.settings = settings;
            state.totalPosts = settings.postCount;

            const processedElements = new Set();

            while (state.currentPost < state.totalPosts && !state.stopRequested && state.invitesSent < state.settings.inviteCount) {
                window.scrollBy({ top: 800, behavior: 'smooth' });
                await sleep(1200);

                const posts = getAllPosts();
                for (const post of posts) {
                    if (state.stopRequested || state.invitesSent >= state.settings.inviteCount || state.currentPost >= state.totalPosts) break;
                    if (!isVisible(post) || processedElements.has(post)) continue;
                    if (!post.textContent.includes('You and') && !Number.isInteger(Number(post.textContent.trim()))) continue;

                    post.click();
                    await sleep(state.settings.delay * 1000);
                    const modalList = getElementsByXPath('//div/div[1]/div/div[4]/div/div/div[1]/div/div[2]/div/div/div/div/div/div/div[2]/div[2]/div/div');

                    const modal = modalList[0] ?? null;

                    if (!modal) {
                        console.log("Invite modal not found, skipping post.");
                        continue;
                    }

                    let invitesSentForPost = 0;
                    for (let s = 0; s < 50 && !state.stopRequested && state.invitesSent < state.settings.inviteCount && invitesSentForPost < state.settings.maxInvitesPerPost; s++) {
                        modal.scrollTop = modal.scrollHeight;
                        await sleep(240);

                        const inviteBtns = Array.from(modal.querySelectorAll('span')).filter(span => span.textContent.trim() === 'Invite');
                        for (const btn of inviteBtns) {
                            if (state.stopRequested || state.invitesSent >= state.settings.inviteCount || invitesSentForPost >= state.settings.maxInvitesPerPost) break;
                            btn.click();
                            state.invitesSent++;
                            invitesSentForPost++;
                            await sleep(state.settings.delay * 1000);
                            await sleep(1000);
                            s = 0
                        }
                    }

                    const closeButton = getElementsByXPath('//div[@aria-label="Close"]', modal)[0];
                    if (closeButton) closeButton.click();
                    await sleep(1200);

                    processedElements.add(post);
                    state.currentPost++;
                }
            }
        } catch (error) {
            console.error('Error during post processing:', error);
        } finally {
            state.isRunning = false;
        }
    }

    // --- MESSAGE HANDLING ---
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.action) {
            case 'start':
                processPosts();
                break;
            case 'stop':
                state.stopRequested = true;
                break;
            case 'status':
                break;
        }
        sendResponse(state);
        return true;
    });
}
