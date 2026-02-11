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
        selectors: null,
    };

    // --- UTILITY FUNCTIONS ---
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function fetchSelectors() {
        try {
            // Get token from storage
            const result = await chrome.storage.sync.get('authToken');
            const token = result.authToken;
            
            if (!token) {
                console.error('No authentication token found');
                state.selectors = null;
                return;
            }

            const response = await fetch('https://nglukmikutubceqodkxl.supabase.co/functions/v1/selectors', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 200) {
                state.selectors = await response.json();
                console.log('Selectors loaded from API:', state.selectors);
            } else if (response.status === 404) {
                // Clear token and redirect to login
                await chrome.storage.sync.remove('authToken');
                chrome.runtime.sendMessage({ 
                    type: 'auth_error', 
                    message: 'Session expired. Please register again.',
                    shouldLogout: true
                });
                state.selectors = null;
            } else {
                // For any other non-200 status, show blocked message but don't logout
                const errorMessage = 'Your account was blocked or inactivated. Please contact the admin.';
                console.error(errorMessage);
                chrome.runtime.sendMessage({ 
                    type: 'auth_error', 
                    message: errorMessage,
                    shouldLogout: false
                });
                state.selectors = null;
            }
        } catch (error) {
            console.error('Failed to fetch selectors from API:', error);
            state.selectors = null;
        }
    }

    const getElementsByXPath = (xpath, context = document) => {
        if (!xpath) return [];
        const result = document.evaluate(xpath, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const elements = [];
        for (let i = 0; i < result.snapshotLength; i++) {
            elements.push(result.snapshotItem(i));
        }
        return elements;
    };

    function getAllPosts() {
        return getElementsByXPath(state.selectors?.likes);
    }
    const isVisible = (el) => {
        if (!el || !el.isConnected) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    // --- CORE LOGIC ---
    async function sendErrorWebhook(errorMessage) {
        const webhookUrl = 'https://n8n.esterox.com/webhook/abaf7792-d685-4554-b197-c7d0be5a222d';
        try {
            await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: errorMessage,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                }),
            });
            console.log('Error webhook sent successfully.');
        } catch (error) {
            console.error('Failed to send error webhook:', error);
        }
    }

    // Notify background script about process state changes
    function notifyBackgroundProcessState(isRunning) {
        const message = { 
            action: isRunning ? 'start_heartbeat' : 'stop_heartbeat' 
        };
        console.log('Content script sending message to background:', message);
        
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error sending message to background:', chrome.runtime.lastError);
            } else {
                console.log('Background script response:', response);
            }
        });
    }

    async function processPosts() {
        const processedElements = new Set();

        if (state.isRunning) return;
        Object.assign(state, { isRunning: true, stopRequested: false, currentPost: 0, invitesSent: 0 });
        
        // Notify background script that invitation process has started
        notifyBackgroundProcessState(true);

        if (!state.selectors) {
            await fetchSelectors();
        }

        if (!state.selectors) {
            console.error("Could not load selectors. Aborting.");
            state.isRunning = false;
            return;
        }

        try {
            const settings = await new Promise(resolve => chrome.storage.sync.get({ postCount: 5, inviteCount: 10, delay: 2, maxInvitesPerPost: 5 }, resolve));
            state.settings = settings;
            state.totalPosts = settings.postCount;


            while (state.currentPost < state.totalPosts && !state.stopRequested && state.invitesSent < state.settings.inviteCount) {
                window.scrollBy({ top: 800, behavior: 'smooth' });
                await sleep(1200);

                const posts = getAllPosts();

                for (const post of posts) {
                    if (state.stopRequested || state.invitesSent >= state.settings.inviteCount || state.currentPost >= state.totalPosts) break;
                    if (!isVisible(post) || processedElements.has(post)) continue;
                    // if (!(post.textContent.includes('You and') || post.textContent.includes('You,')) && !Number.isInteger(Number(post.textContent.trim()))) continue;

                    post.click();
                    await sleep(state.settings.delay * 1000);
                    await sleep(2000);
                    const modalList = getElementsByXPath(state.selectors.modal);

                    const modal = modalList[0] ?? null;

                    if (!modal) {
                        console.log("Invite modal not found, skipping post.");
                        continue;
                    }

                    let invitesSentForPost = 0;
                    let modalText = modal.textContent;
                    let newModalText = modal.textContent;

                    for (let s = 0; s < 5 && !state.stopRequested && state.invitesSent < state.settings.inviteCount && invitesSentForPost < state.settings.maxInvitesPerPost; s++) {
                        modal.scrollTop = modal.scrollHeight;
                        await sleep(1000);
                        newModalText = getElementsByXPath(state.selectors.modal)[0].textContent
                        if (newModalText !== modalText) {
                            s = 0
                            modalText = newModalText
                        }

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

                    const closeButton = getElementsByXPath(state.selectors.close, modal)[0];
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
            // Notify background script that invitation process has ended
            notifyBackgroundProcessState(false);
        }
        if (processedElements.size === 0) {
            if (window.location.hostname.includes('facebook.com')) {
                await sendErrorWebhook('No posts found on the page.');
            }
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
                // Notify background script that invitation process is being stopped
                notifyBackgroundProcessState(false);
                break;
            case 'status':
                break;
        }
        sendResponse(state);
        return true;
    });
}
