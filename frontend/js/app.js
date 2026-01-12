/**
 * Bulk Email Sender - Main Application
 * 
 * Core functionality:
 * - Tab navigation
 * - Quota display
 * - Toast notifications
 * - API utilities
 */

// ===========================================
// GLOBAL STATE
// ===========================================

const AppState = {
    contacts: [],
    selectedContacts: new Set(),
    selectedRecipients: new Set(),
    currentPage: 1,
    totalPages: 1,
    quota: {
        used: 0,
        limit: 250,
        remaining: 250
    }
};

// ===========================================
// API UTILITIES
// ===========================================

const API = {
    baseUrl: '/api',
    
    async get(endpoint) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Request failed');
            }
            
            return data;
        } catch (error) {
            console.error(`GET ${endpoint} failed:`, error);
            throw error;
        }
    },
    
    async post(endpoint, body) {
        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Request failed');
            }
            
            return data;
        } catch (error) {
            console.error(`POST ${endpoint} failed:`, error);
            throw error;
        }
    },
    
    async delete(endpoint, body = null) {
        try {
            const options = {
                method: 'DELETE'
            };
            
            if (body) {
                options.headers = { 'Content-Type': 'application/json' };
                options.body = JSON.stringify(body);
            }
            
            const response = await fetch(`${this.baseUrl}${endpoint}`, options);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Request failed');
            }
            
            return data;
        } catch (error) {
            console.error(`DELETE ${endpoint} failed:`, error);
            throw error;
        }
    },
    
    async upload(endpoint, file) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`${this.baseUrl}${endpoint}`, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Upload failed');
            }
            
            return data;
        } catch (error) {
            console.error(`UPLOAD ${endpoint} failed:`, error);
            throw error;
        }
    }
};

// ===========================================
// TOAST NOTIFICATIONS
// ===========================================

const Toast = {
    container: null,
    
    init() {
        this.container = document.getElementById('toastContainer');
    },
    
    show(type, title, message, duration = 5000) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                ${message ? `<div class="toast-message">${message}</div>` : ''}
            </div>
        `;
        
        this.container.appendChild(toast);
        
        // Auto remove
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },
    
    success(title, message) {
        this.show('success', title, message);
    },
    
    error(title, message) {
        this.show('error', title, message, 8000);
    },
    
    warning(title, message) {
        this.show('warning', title, message, 6000);
    },
    
    info(title, message) {
        this.show('info', title, message);
    }
};

// ===========================================
// TAB NAVIGATION
// ===========================================

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabPanels = document.querySelectorAll('.tab-panel');
    
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            
            // Update buttons
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update panels
            tabPanels.forEach(panel => panel.classList.remove('active'));
            document.getElementById(`${tabId}-tab`).classList.add('active');
            
            // Trigger tab-specific actions
            if (tabId === 'tracking') {
                loadTrackingData();
            } else if (tabId === 'compose') {
                updatePreviewContactSelect();
            }
        });
    });
}

// ===========================================
// QUOTA MANAGEMENT
// ===========================================

async function loadQuota() {
    try {
        const data = await API.get('/emails/quota');
        
        if (data.success && data.quota) {
            const { local } = data.quota;
            
            AppState.quota = {
                used: local.used,
                limit: local.limit,
                remaining: local.remaining
            };
            
            updateQuotaDisplay();
        }
    } catch (error) {
        console.error('Failed to load quota:', error);
        document.getElementById('quotaValue').textContent = 'Error';
    }
}

function updateQuotaDisplay() {
    const { used, limit, remaining } = AppState.quota;
    const percentage = (used / limit) * 100;
    
    // Update text
    const quotaValue = document.getElementById('quotaValue');
    quotaValue.textContent = `${used} / ${limit}`;
    
    // Update bar
    const quotaBar = document.getElementById('quotaBar');
    quotaBar.style.width = `${percentage}%`;
    
    // Update bar color based on usage
    quotaBar.classList.remove('warning', 'danger');
    if (percentage >= 90) {
        quotaBar.classList.add('danger');
    } else if (percentage >= 70) {
        quotaBar.classList.add('warning');
    }
}

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

function formatDate(dateString) {
    if (!dateString) return '-';

    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===========================================
// INITIALIZATION
// ===========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize components
    Toast.init();

    // Check authentication first
    const isAuthenticated = await initAuth();

    if (!isAuthenticated) {
        return; // Will redirect to login
    }

    // Initialize app after authentication
    initTabs();

    // Load initial data
    loadQuota();
    loadContacts();

    // Initialize modules (defined in other files)
    if (typeof initUpload === 'function') initUpload();
    if (typeof initContacts === 'function') initContacts();
    if (typeof initComposer === 'function') initComposer();
    if (typeof initTracking === 'function') initTracking();

    console.log('📧 Bulk Email Sender initialized');
});
