// Background Script - Simplified Ping Management
console.log('Background script loaded and initialized');

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

// Simple ping function that content script can call
async function sendPing() {
    try {
        console.log('Background: Sending ping request...');
        
        const token = await apiConfig.getToken();
        if (!token) {
            console.log('Background: No token available, skipping ping');
            return { success: false, error: 'No token' };
        }
        
        const response = await fetch(apiConfig.getUrl('heartbeat'), {
            method: 'POST',
            headers: await apiConfig.getHeaders(true),
            body: JSON.stringify({ 
                timestamp: new Date().toISOString(),
                activity: 'active'
            })
        });

        console.log('Background: Ping response status:', response.status);
        
        if (response.status === 200) {
            const data = await response.json();
            console.log('Background: Ping successful');
            return { success: true, data: data };
        } else if (response.status === 404) {
            // Clear token and notify popup
            await chrome.storage.sync.remove('authToken');
            chrome.runtime.sendMessage({ 
                type: 'auth_error', 
                message: 'Session expired. Please register again.',
                shouldLogout: true
            });
            return { success: false, error: 'Session expired' };
        } else {
            const errorText = await response.text();
            console.error('Background: Ping error response:', errorText);
            return { success: false, error: 'Your account was blocked or inactivated. Please contact the admin.' };
        }
    } catch (error) {
        console.error('Background: Ping error:', error);
        return { success: false, error: error.message };
    }
}

// Message Handling - simplified for ping requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background script received message:', message);
    
    switch (message.action) {
        case 'send_ping':
            console.log('Background: Received send_ping request');
            sendPing().then(result => {
                console.log('Background: Ping result:', result);
                sendResponse(result);
            }).catch(error => {
                console.error('Background: Ping failed:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep message channel open for async response
        default:
            console.log('Background: Unknown message action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
    }
    return true;
});