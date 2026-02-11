if (window.hasRun) {
    // The script has already been injected, so we don't need to do anything.
} else {
    console.log('Content script loaded and initialized');
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
        processAbortController: null,
        currentModal: null,
    };

    // --- UTILITY FUNCTIONS ---
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Cancellable sleep that respects stop requests
    const cancellableSleep = async (ms) => {
        const startTime = Date.now();
        while (Date.now() - startTime < ms) {
            if (state.stopRequested) {
                console.log('Sleep interrupted by stop request');
                throw new Error('Process stopped during sleep');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    };

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

    // Check if modal is still visible
    const isModalVisible = (modal) => {
        if (!modal) return false;
        return isVisible(modal) && modal.style.display !== 'none';
    };

    // Force kill the current process
    function forceKillProcess() {
        console.log('FORCE KILL: Terminating all processes');
        
        // Set all stop flags
        state.stopRequested = true;
        state.isRunning = false;
        
        // Abort any ongoing operations
        if (state.processAbortController) {
            state.processAbortController.abort();
            state.processAbortController = null;
        }
        
        // Force close any open modal
        if (state.currentModal) {
            try {
                state.currentModal.style.display = 'none';
                state.currentModal.remove();
                console.log('Force closed modal');
            } catch (error) {
                console.log('Failed to force close modal:', error);
            }
            state.currentModal = null;
        }
        
        // Clear any pending timeouts/intervals
        if (window.processTimeout) {
            clearTimeout(window.processTimeout);
            window.processTimeout = null;
        }
        
        // Reset state to clean values
        state.currentPost = 0;
        state.invitesSent = 0;
        
        console.log('Process force killed successfully');
    }
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
        
        // Create abort controller for this process
        state.processAbortController = new AbortController();
        
        Object.assign(state, { isRunning: true, stopRequested: false, currentPost: 0, invitesSent: 0 });
        console.log("Process started - state:", { isRunning: state.isRunning, stopRequested: state.stopRequested });

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
                // Check stop request before each major operation
                if (state.stopRequested) {
                    console.log('Stop requested detected, breaking main loop');
                    throw new Error('Process stopped by user');
                }
                
                // Check if process was aborted
                if (state.processAbortController?.signal.aborted) {
                    console.log('Process aborted, breaking main loop');
                    throw new Error('Process aborted');
                }
                
                window.scrollBy({ top: 800, behavior: 'smooth' });
                await cancellableSleep(1200);
                
                // Check stop request after scroll
                if (state.stopRequested) {
                    console.log('Stop requested detected after scroll');
                    throw new Error('Process stopped by user');
                }

                const posts = getAllPosts();

                for (const post of posts) {
                    if (state.stopRequested || state.invitesSent >= state.settings.inviteCount || state.currentPost >= state.totalPosts) {
                        console.log('Stop condition met in post loop');
                        throw new Error('Process stopped by user or limits reached');
                    }
                    if (!isVisible(post) || processedElements.has(post)) continue;
                    // if (!(post.textContent.includes('You and') || post.textContent.includes('You,')) && !Number.isInteger(Number(post.textContent.trim()))) continue;

                    post.click();
                    await cancellableSleep(state.settings.delay * 1000);
                    
                    // Check stop request after clicking post
                    if (state.stopRequested) {
                        console.log('Stop requested after post click');
                        throw new Error('Process stopped by user');
                    }
                    
                    await cancellableSleep(2000);
                    const modalList = getElementsByXPath(state.selectors.modal);
                    const modal = modalList[0] ?? null;
                    state.currentModal = modal; // Track current modal for force close

                    if (!modal) {
                        console.log("Invite modal not found, skipping post.");
                        state.currentModal = null;
                        continue;
                    }

                    let invitesSentForPost = 0;
                    let modalText = modal.textContent;
                    let newModalText = modal.textContent;

                    for (let s = 0; s < 5 && !state.stopRequested && state.invitesSent < state.settings.inviteCount && invitesSentForPost < state.settings.maxInvitesPerPost; s++) {
                        // Check stop request before scrolling modal
                        if (state.stopRequested) {
                            console.log('Stop requested in modal processing');
                            throw new Error('Process stopped by user');
                        }
                        
                        // Check if process was aborted
                        if (state.processAbortController?.signal.aborted) {
                            console.log('Process aborted during modal processing');
                            throw new Error('Process aborted');
                        }
                        
                        modal.scrollTop = modal.scrollHeight;
                        await cancellableSleep(1000);
                        
                        // Check stop request after scroll
                        if (state.stopRequested) {
                            console.log('Stop requested after modal scroll');
                            throw new Error('Process stopped by user');
                        }
                        
                        newModalText = getElementsByXPath(state.selectors.modal)[0].textContent
                        if (newModalText !== modalText) {
                            s = 0
                            modalText = newModalText
                        }

                        const inviteBtns = Array.from(modal.querySelectorAll('span')).filter(span => span.textContent.trim() === 'Invite');
                        for (const btn of inviteBtns) {
                            if (state.stopRequested || state.invitesSent >= state.settings.inviteCount || invitesSentForPost >= state.settings.maxInvitesPerPost) {
                                console.log('Stop condition in invite buttons loop');
                                throw new Error('Process stopped by user or limits reached');
                            }
                            btn.click();
                            state.invitesSent++;
                            invitesSentForPost++;
                            await cancellableSleep(state.settings.delay * 1000);
                            await cancellableSleep(1000);
                            s = 0
                        }
                    }

                    const closeButton = getElementsByXPath(state.selectors.close, modal)[0];
                    if (closeButton) {
                        console.log('Found close button, clicking it');
                        closeButton.click();
                        await sleep(1200);
                    } else {
                        console.log('Primary close selector failed, trying fallback methods');
                        
                        // Fallback 1: Try common close button selectors within modal
                        const fallbackSelectors = [
                            './/div[@aria-label="Close"]',
                            './/div[@aria-label="Close dialog"]', 
                            './/button[@aria-label="Close"]',
                            './/span[@aria-label="Close"]',
                            './/div[contains(@class, "close")]',
                            './/button[contains(@class, "close")]',
                            './/div[contains(@data-testid, "close")]',
                            './/button[contains(@data-testid, "close")]',
                            './/div[@role="button" and contains(@class, "close")]',
                            './/svg[@aria-label="Close"]',
                            './/div[contains(@class, "x1i10hfl") and contains(@class, "xj7lmb")]', // Facebook's close button classes
                            './/div[contains(@class, "x6s0dn4") and contains(@class, "x78zum5")]' // Another common pattern
                        ];
                        
                        let closed = false;
                        for (const selector of fallbackSelectors) {
                            try {
                                const elements = getElementsByXPath(selector, modal);
                                if (elements.length > 0) {
                                    console.log(`Found fallback close element with selector: ${selector}`);
                                    elements[0].click();
                                    await sleep(1200);
                                    closed = true;
                                    break;
                                }
                            } catch (error) {
                                console.log(`Fallback selector failed: ${selector}`, error);
                                continue;
                            }
                        }
                        
                        // Fallback 2: Try ESC key
                        if (!closed) {
                            console.log('Trying ESC key to close modal');
                            try {
                                const escEvent = new KeyboardEvent('keydown', {
                                    key: 'Escape',
                                    code: 'Escape',
                                    keyCode: 27,
                                    which: 27,
                                    bubbles: true,
                                    cancelable: true
                                });
                                document.activeElement?.dispatchEvent(escEvent);
                                document.dispatchEvent(escEvent);
                                await sleep(1000);
                            } catch (error) {
                                console.log('ESC key failed:', error);
                            }
                        }
                        
                        // Fallback 3: Click outside modal
                        if (!closed && modal) {
                            console.log('Trying to click outside modal');
                            try {
                                const rect = modal.getBoundingClientRect();
                                const outsideX = rect.left - 10;
                                const outsideY = rect.top - 10;
                                
                                const clickEvent = new MouseEvent('click', {
                                    bubbles: true,
                                    cancelable: true,
                                    clientX: outsideX,
                                    clientY: outsideY
                                });
                                document.elementFromPoint(outsideX, outsideY)?.dispatchEvent(clickEvent);
                                await sleep(1000);
                            } catch (error) {
                                console.log('Click outside failed:', error);
                            }
                        }
                        
                        // Fallback 4: Force close by removing modal from DOM
                        if (!closed && modal) {
                            console.log('Force removing modal from DOM');
                            try {
                                modal.style.display = 'none';
                                modal.remove();
                                await sleep(500);
                            } catch (error) {
                                console.log('Force remove failed:', error);
                            }
                        }
                        
                        // Verify modal is actually closed
                        await sleep(1000);
                        if (modal && isModalVisible(modal)) {
                            console.warn('Modal is still visible after all close attempts');
                            // Try one more aggressive approach
                            try {
                                modal.style.visibility = 'hidden';
                                modal.style.opacity = '0';
                                modal.style.pointerEvents = 'none';
                            } catch (error) {
                                console.log('Final hide attempt failed:', error);
                            }
                        } else {
                            console.log('Modal successfully closed');
                        }
                    }
                    
                    // Clear current modal reference
                    state.currentModal = null;

                    processedElements.add(post);
                    state.currentPost++;
                }
            }
        } catch (error) {
            console.error('Error during post processing:', error);
            if (error.message.includes('stopped') || error.message.includes('aborted')) {
                console.log('Process was intentionally stopped');
            } else {
                // Log unexpected errors
                console.error('Unexpected error:', error);
            }
        } finally {
            console.log('ProcessPosts finally block - stopping process');
            state.isRunning = false;
            state.currentModal = null;
            state.processAbortController = null;
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
                console.log('Stop command received in content script');
                forceKillProcess();
                // Notify background script that invitation process is being stopped
                notifyBackgroundProcessState(false);
                // Send immediate response to confirm stop
                sendResponse({ success: true, message: 'Process force killed' });
                break;
            case 'status':
                break;
        }
        sendResponse(state);
        return true;
    });
}
