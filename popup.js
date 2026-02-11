document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const mainPanel = document.getElementById('mainPanel');
    const registrationPanel = document.getElementById('registrationPanel');
    const settingsPanel = document.getElementById('settingsPanel');
    const runningPanel = document.getElementById('runningPanel');
    const actionBtn = document.getElementById('actionBtn');
    const stopBtn = document.getElementById('stopBtn');
    const stopBtnRunning = document.getElementById('stopBtnRunning');
    const settingsBtn = document.getElementById('settingsBtn');
    const saveBtn = document.getElementById('saveBtn');
    const backBtn = document.getElementById('backBtn');
    const registerBtn = document.getElementById('registerBtn');
    const usernameInput = document.getElementById('usernameInput');
    const errorStatus = document.getElementById('errorStatus');
    const successStatus = document.getElementById('successStatus');
    const statusText = document.getElementById('statusText');
    const inviteCountDisplay = document.getElementById('inviteCountDisplay');
    const currentPostEl = document.getElementById('currentPost');
    const totalPostsEl = document.getElementById('totalPosts');
    const progressBar = document.getElementById('progressBar');
    const runningInvitesEl = document.getElementById('runningInvites');
    
    // Debug buttons
    const testHeartbeatBtn = document.getElementById('testHeartbeatBtn');
    const testStopHeartbeatBtn = document.getElementById('testStopHeartbeatBtn');

    // Form inputs
    const postCountInput = document.getElementById('postCount');
    const inviteCountInput = document.getElementById('inviteCount');
    const maxInvitesPerPostInput = document.getElementById('maxInvitesPerPost');
    const delayInput = document.getElementById('delay');

    let isRunning = false;
    let statusInterval;
    let currentTabId = null;
    let isAuthenticated = false;

    // Initialize
    loadSettings();
    checkAuthentication();
    
    // Set initial button states to prevent flicker
    stopBtn.style.display = 'none';
    actionBtn.style.display = 'block';

    // Event Listeners
    actionBtn.addEventListener('click', startProcess);
    stopBtn.addEventListener('click', stopProcess);
    stopBtnRunning.addEventListener('click', stopProcess);
    settingsBtn.addEventListener('click', () => showPanel('settings'));
    saveBtn.addEventListener('click', () => {
        saveSettings(false); // Show confirmation message
        showPanel('main');
    });
    backBtn.addEventListener('click', () => showPanel('main'));
    registerBtn.addEventListener('click', handleRegistration);

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'auth_error') {
            if (message.shouldLogout) {
                showError(message.message);
                handleLogout();
            } else {
                showError(message.message);
            }
        }
    });

    function showPanel(panelName) {
        mainPanel.style.display = 'none';
        registrationPanel.style.display = 'none';
        settingsPanel.style.display = 'none';
        runningPanel.style.display = 'none';

        if (panelName === 'registration') {
            registrationPanel.style.display = 'block';
        } else if (panelName === 'settings') {
            settingsPanel.style.display = 'block';
        } else if (panelName === 'running') {
            runningPanel.style.display = 'block';
        } else {
            mainPanel.style.display = 'block';
        }
    }

    async function checkAuthentication() {
        try {
            isAuthenticated = await apiService.config.isAuthenticated();
            if (isAuthenticated) {
                // Initialize button states
                stopBtn.style.display = 'none';
                actionBtn.style.display = 'block';
                checkTabStatus();
            } else {
                showPanel('registration');
            }
        } catch (error) {
            console.error('Authentication check failed:', error);
            showPanel('registration');
        }
    }

    async function handleRegistration() {
        const username = usernameInput.value.trim();
        
        if (!username) {
            showError('Please enter a username');
            return;
        }

        registerBtn.disabled = true;
        registerBtn.textContent = 'Registering...';

        try {
            await apiService.register(username);
            isAuthenticated = true;
            showSuccess('Registration successful!');
            setTimeout(() => {
                showPanel('main');
                checkTabStatus();
            }, 1500);
        } catch (error) {
            showError('Registration failed: ' + error.message);
        } finally {
            registerBtn.disabled = false;
            registerBtn.textContent = 'Register';
        }
    }

    async function handleLogout() {
        try {
            await apiService.logout();
            isAuthenticated = false;
            usernameInput.value = '';
            showSuccess('Logged out successfully');
            showPanel('registration');
        } catch (error) {
            showError('Logout failed: ' + error.message);
        }
    }

    async function fetchSelectors() {
        try {
            const selectors = await apiService.getSelectors();
            return selectors;
        } catch (error) {
            if (error.message.includes('blocked')) {
                showError('Your account is blocked. Please contact the admin to unlock it.');
                // Optionally logout the user
                await handleLogout();
            } else {
                showError('Failed to fetch selectors: ' + error.message);
            }
            throw error;
        }
    }

    function checkTabStatus() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const activeTab = tabs[0];
            if (!activeTab) return;
            currentTabId = activeTab.id;

            if (!activeTab.url || !activeTab.url.includes('facebook.com')) {
                showError('Please navigate to a Facebook page.');
                actionBtn.disabled = true;
                settingsBtn.disabled = true;
                return;
            }

            // Try to connect to the content script and get immediate status
            chrome.tabs.sendMessage(currentTabId, { action: 'status' }, function(response) {
                if (handleResponseError(response, true)) {
                    // Content script not ready yet, try again
                    setTimeout(checkTabStatus, 500);
                    return;
                }
                
                // Update UI immediately based on actual process state
                if (response && response.isRunning) {
                    console.log('Process is running, showing stop button immediately');
                    isRunning = true;
                    showPanel('running');
                    updateUI(response);
                } else {
                    console.log('Process is not running, showing start button');
                    isRunning = false;
                    showPanel('main');
                    updateUI(response);
                }
                
                actionBtn.disabled = false;
                settingsBtn.disabled = false;
                
                // Clear any existing interval and start status monitoring
                if (statusInterval) clearInterval(statusInterval);
                statusInterval = setInterval(checkStatus, 1000);
            });
        });
    }

    function loadSettings() {
        chrome.storage.sync.get({ postCount: 5, inviteCount: 10, delay: 2, maxInvitesPerPost: 5 }, function(items) {
            postCountInput.value = items.postCount;
            inviteCountInput.value = items.inviteCount;
            delayInput.value = items.delay;
            maxInvitesPerPostInput.value = items.maxInvitesPerPost;
        });
    }

    function saveSettings(silent = true) {
        const settings = {
            postCount: parseInt(postCountInput.value) || 5,
            inviteCount: parseInt(inviteCountInput.value) || 10,
            delay: parseInt(delayInput.value) || 2,
            maxInvitesPerPost: parseInt(maxInvitesPerPostInput.value) || 5
        };

        if (settings.postCount < 1) settings.postCount = 1;
        if (settings.inviteCount < 1) settings.inviteCount = 1;
        if (settings.delay < 1) settings.delay = 1;
        if (settings.maxInvitesPerPost < 1) settings.maxInvitesPerPost = 1;

        chrome.storage.sync.set(settings, () => {
            if (!silent) {
                showSuccess('Settings saved!');
            }
        });

        postCountInput.value = settings.postCount;
        inviteCountInput.value = settings.inviteCount;
        delayInput.value = settings.delay;
        maxInvitesPerPostInput.value = settings.maxInvitesPerPost;
    }

    function startProcess() {
        if (isRunning) return;
        
        if (!isAuthenticated) {
            showError('Please register first');
            showPanel('registration');
            return;
        }
        
        saveSettings(true); // Save silently
        chrome.tabs.sendMessage(currentTabId, { action: 'start' }, function(response) {
            if (handleResponseError(response)) return;
            isRunning = true;
            showPanel('running');
            updateUI(response);
        });
    }

    function stopProcess() {
        if (!isRunning) return;
        
        console.log('Popup: Sending stop command to content script');
        
        // Disable stop button immediately to prevent multiple clicks
        stopBtn.disabled = true;
        stopBtnRunning.disabled = true;
        
        chrome.tabs.sendMessage(currentTabId, { action: 'stop' }, function(response) {
            // Re-enable buttons if there was an error
            if (handleResponseError(response)) {
                stopBtn.disabled = false;
                stopBtnRunning.disabled = false;
                return;
            }
            
            console.log('Popup: Stop command response:', response);
            
            // Force UI update regardless of response
            isRunning = false;
            showPanel('main');
            updateUI(response || { isRunning: false, invitesSent: 0 });
            
            // Double-check heartbeat status
            chrome.runtime.sendMessage({ action: 'heartbeat_status' }, function(statusResponse) {
                console.log('Heartbeat status after stop:', statusResponse);
                if (statusResponse && statusResponse.isRunning) {
                    console.log('Heartbeat still running, sending another stop command');
                    chrome.runtime.sendMessage({ action: 'stop_heartbeat' });
                }
            });
        });
    }

    function checkStatus() {
        if (!currentTabId) return;
        chrome.tabs.sendMessage(currentTabId, { action: 'status' }, function(response) {
            if (handleResponseError(response, true)) return;

            const wasRunning = isRunning;
            isRunning = response.isRunning;

            // Only change the panel if the state has changed from running to not running,
            // or if the process is currently running. This prevents closing the settings panel.
            if (isRunning) {
                showPanel('running');
            } else if (wasRunning && !isRunning) {
                // Process just stopped, go back to main panel
                showPanel('main');
                // Ensure stop buttons are re-enabled
                stopBtn.disabled = false;
                stopBtnRunning.disabled = false;
            }

            updateUI(response);
        });
    }

    function updateUI(data) {
        if (!data) return;
        statusText.textContent = data.status || (isRunning ? 'Running' : 'Ready');
        inviteCountDisplay.textContent = data.invitesSent || 0;

        // Update button visibility based on current running state
        if (isRunning) {
            stopBtn.style.display = 'block';
            actionBtn.style.display = 'none';
        } else {
            stopBtn.style.display = 'none';
            actionBtn.style.display = 'block';
        }

        if (isRunning) {
            const progress = data.totalPosts > 0 ? (data.currentPost / data.totalPosts) * 100 : 0;
            progressBar.style.width = `${progress}%`;
            currentPostEl.textContent = data.currentPost || 0;
            totalPostsEl.textContent = data.totalPosts || 0;
            runningInvitesEl.textContent = data.invitesSent || 0;
        }
    }

    function handleResponseError(response, silent = false) {
        if (chrome.runtime.lastError) {
            if (!silent && !chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
                showError('Error: Could not connect to the page. Please reload the tab.');
            }
            // Don't disable buttons if it's just a connection error
            if (!chrome.runtime.lastError.message.includes('Receiving end does not exist')) {
                actionBtn.disabled = true;
                settingsBtn.disabled = true;
            }
            return true;
        }
        return false;
    }

    function showError(message) {
        errorStatus.textContent = message;
        errorStatus.style.color = 'red';
        errorStatus.style.display = 'block';
        successStatus.style.display = 'none';
    }

    function showSuccess(message) {
        successStatus.textContent = message;
        successStatus.style.display = 'block';
        errorStatus.style.display = 'none';
        setTimeout(() => successStatus.style.display = 'none', 3000);
    }

    window.addEventListener('unload', () => {
        if (statusInterval) clearInterval(statusInterval);
    });
});
