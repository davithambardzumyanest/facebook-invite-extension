// Background Script - Heartbeat Management
console.log('Background script loaded and initialized');
let heartbeatInterval = null;

// API Configuration
class ApiConfig {
    constructor() {
        this.baseDomain = this.getBaseDomain();
        this.endpoints = {
            register: '/auth-register',
            selectors: '/selectors',
            heartbeat: '/activity-ping'
        };
    }

    getBaseDomain() {
        return 'https://nglukmikutubceqodkxl.supabase.co/functions/v1';
    }

    getUrl(endpoint) {
        return `${this.baseDomain}${this.endpoints[endpoint]}`;
    }

    async getHeaders(includeAuth = false) {
        const headers = {
            'Content-Type': 'application/json',
        };

        if (includeAuth) {
            const token = await this.getToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }

        return headers;
    }

    async getToken() {
        try {
            const result = await chrome.storage.sync.get('authToken');
            return result.authToken || null;
        } catch (error) {
            console.error('Error getting token:', error);
            return null;
        }
    }
}

const apiConfig = new ApiConfig();

// Heartbeat Functions
function startHeartbeat() {
    console.log('startHeartbeat() called, current interval:', heartbeatInterval);
    if (heartbeatInterval) {
        console.log('Clearing existing heartbeat interval');
        clearInterval(heartbeatInterval);
    }

    console.log('Starting new heartbeat interval (5 seconds)');
    heartbeatInterval = setInterval(async () => {
        try {
            console.log('Sending heartbeat ping...');
            await sendHeartbeat();
        } catch (error) {
            console.error('Background heartbeat error:', error);
        }
    }, 5000); // Send ping every 5 seconds
}

function stopHeartbeat() {
    console.log('stopHeartbeat() called, current interval:', heartbeatInterval);
    if (heartbeatInterval) {
        console.log('Clearing heartbeat interval immediately');
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        
        // Send one final heartbeat to indicate process stopped
        chrome.runtime.sendMessage({ 
            type: 'heartbeat_stopped',
            timestamp: new Date().toISOString()
        });
    } else {
        console.log('No heartbeat interval to clear');
    }
}

async function sendHeartbeat() {
    try {
        const token = await apiConfig.getToken();
        console.log('Background sending heartbeat with token:', token ? 'Token exists' : 'No token');
        
        const response = await fetch(apiConfig.getUrl('heartbeat'), {
            method: 'POST',
            headers: await apiConfig.getHeaders(true),
            body: JSON.stringify({ 
                timestamp: new Date().toISOString(),
                activity: 'active'
            })
        });

        console.log('Background heartbeat response status:', response.status);
        
        if (response.status === 200) {
            return await response.json();
        } else if (response.status === 404) {
            // Clear token and notify popup
            await chrome.storage.sync.remove('authToken');
            chrome.runtime.sendMessage({ 
                type: 'auth_error', 
                message: 'Session expired. Please register again.',
                shouldLogout: true
            });
            throw new Error('Session expired. Please register again.');
        } else {
            const errorText = await response.text();
            console.error('Background heartbeat error response:', errorText);
            throw new Error('Your account was blocked or inactivated. Please contact the admin.');
        }
    } catch (error) {
        console.error('Background heartbeat error:', error);
        throw error;
    }
}

// Message Handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background script received message:', message);
    console.log('Message sender:', sender);
    
    switch (message.action) {
        case 'start_heartbeat':
            console.log('Starting heartbeat in background script');
            startHeartbeat();
            sendResponse({ success: true, status: 'started' });
            break;
        case 'stop_heartbeat':
            console.log('Stopping heartbeat in background script');
            stopHeartbeat();
            sendResponse({ success: true, status: 'stopped' });
            break;
        case 'heartbeat_status':
            const isRunning = heartbeatInterval !== null;
            sendResponse({ 
                isRunning: isRunning,
                hasInterval: heartbeatInterval !== null,
                intervalId: heartbeatInterval
            });
            break;
        default:
            console.log('Unknown message action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
});

// Cleanup on extension unload
chrome.runtime.onSuspend.addListener(() => {
    stopHeartbeat();
});