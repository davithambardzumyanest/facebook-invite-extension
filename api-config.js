// API Configuration Module
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
        // For development, you can set this in localStorage
        // In production, this should be configured via environment variables
        return localStorage.getItem('API_BASE_DOMAIN') || 'https://nglukmikutubceqodkxl.supabase.co/functions/v1';
    }

    setBaseDomain(domain) {
        localStorage.setItem('API_BASE_DOMAIN', domain);
        this.baseDomain = domain;
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

    async setToken(token) {
        try {
            await chrome.storage.sync.set({ authToken: token });
        } catch (error) {
            console.error('Error setting token:', error);
        }
    }

    async clearToken() {
        try {
            await chrome.storage.sync.remove('authToken');
        } catch (error) {
            console.error('Error clearing token:', error);
        }
    }

    async isAuthenticated() {
        const token = await this.getToken();
        return token !== null;
    }
}

// API Service Class
class ApiService {
    constructor() {
        this.config = new ApiConfig();
    }

    async register(username) {
        try {
            const response = await fetch(this.config.getUrl('register'), {
                method: 'POST',
                headers: await this.config.getHeaders(),
                body: JSON.stringify({ username })
            });

            if (response.ok) {
                const data = await response.json();
                
                if (data.token) {
                    await this.config.setToken(data.token);
                }

                return data;
            } else if (response.status === 403) {
                throw new Error('Registration is currently disabled or access is forbidden. Please try again later.');
            } else if (response.status === 400) {
                throw new Error('Invalid username provided. Please choose a different username.');
            } else if (response.status === 409) {
                throw new Error('Username already exists. Please choose a different username.');
            } else {
                throw new Error(`Registration failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Registration error:', error);
            throw error;
        }
    }

    async getSelectors() {
        try {
            const response = await fetch(this.config.getUrl('selectors'), {
                method: 'GET',
                headers: await this.config.getHeaders(true)
            });

            if (response.status === 200) {
                return await response.json();
            } else if (response.status === 404) {
                // Only logout on 404
                await this.logout();
                throw new Error('Session expired. Please register again.');
            } else {
                // For any other non-200 status, show blocked message but don't logout
                throw new Error('Your account was blocked or inactivated. Please contact the admin.');
            }
        } catch (error) {
            console.error('Selectors API error:', error);
            throw error;
        }
    }

    async logout() {
        await this.config.clearToken();
    }
}

// Global instance
const apiService = new ApiService();
