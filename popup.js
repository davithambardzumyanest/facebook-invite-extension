document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const mainPanel = document.getElementById('mainPanel');
    const settingsPanel = document.getElementById('settingsPanel');
    const runningPanel = document.getElementById('runningPanel');
    const actionBtn = document.getElementById('actionBtn');
    const stopBtn = document.getElementById('stopBtn');
    const stopBtnRunning = document.getElementById('stopBtnRunning');
    const settingsBtn = document.getElementById('settingsBtn');
    const saveBtn = document.getElementById('saveBtn');
    const backBtn = document.getElementById('backBtn');
    const errorStatus = document.getElementById('errorStatus');
    const successStatus = document.getElementById('successStatus');
    const statusText = document.getElementById('statusText');
    const inviteCountDisplay = document.getElementById('inviteCountDisplay');
    const currentPostEl = document.getElementById('currentPost');
    const totalPostsEl = document.getElementById('totalPosts');
    const progressBar = document.getElementById('progressBar');
    const runningInvitesEl = document.getElementById('runningInvites');

    // Form inputs
    const postCountInput = document.getElementById('postCount');
    const inviteCountInput = document.getElementById('inviteCount');
    const maxInvitesPerPostInput = document.getElementById('maxInvitesPerPost');
    const delayInput = document.getElementById('delay');

    let isRunning = false;
    let statusInterval;
    let currentTabId = null;

    // Initialize
    loadSettings();
    checkTabStatus();

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

    function showPanel(panelName) {
        mainPanel.style.display = 'none';
        settingsPanel.style.display = 'none';
        runningPanel.style.display = 'none';

        if (panelName === 'settings') {
            settingsPanel.style.display = 'block';
        } else if (panelName === 'running') {
            runningPanel.style.display = 'block';
        } else {
            mainPanel.style.display = 'block';
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

            // Try to connect to the content script
            chrome.tabs.sendMessage(currentTabId, { action: 'status' }, function(response) {
                if (handleResponseError(response, true)) {
                    // Content script not ready yet, try again
                    setTimeout(checkTabStatus, 500);
                    return;
                }
                actionBtn.disabled = false;
                settingsBtn.disabled = false;
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
        chrome.tabs.sendMessage(currentTabId, { action: 'stop' }, function(response) {
            if (handleResponseError(response)) return;
            isRunning = false;
            showPanel('main');
            updateUI(response);
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
            }

            updateUI(response);
        });
    }

    function updateUI(data) {
        if (!data) return;
        statusText.textContent = data.status || (isRunning ? 'Running' : 'Ready');
        inviteCountDisplay.textContent = data.invitesSent || 0;

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
