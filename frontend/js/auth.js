/**
 * Authentication Module
 *
 * Handles authentication state and redirects
 */

// Check authentication status on page load
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/status', {
            credentials: 'include'
        });

        const data = await response.json();

        if (!data.authenticated) {
            // Not authenticated, redirect to login
            window.location.href = '/login.html';
            return false;
        }

        // Update UI with user info
        if (data.user) {
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = `👤 ${data.user.username}`;
            }
        }

        return true;
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
        return false;
    }
}

// Logout function
async function logout() {
    try {
        const response = await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });

        const data = await response.json();

        if (data.success) {
            Toast.success('Logged out', 'Successfully logged out');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 500);
        } else {
            Toast.error('Logout failed', data.error || 'Failed to logout');
        }
    } catch (error) {
        console.error('Logout error:', error);
        Toast.error('Network error', 'Failed to logout');
    }
}

// Initialize authentication
function initAuth() {
    // Setup logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Check authentication status
    return checkAuth();
}

// Add credentials to API calls
const originalFetch = window.fetch;
window.fetch = function(...args) {
    const [url, options = {}] = args;

    // Add credentials to API calls
    if (typeof url === 'string' && url.startsWith('/api/')) {
        options.credentials = 'include';
    }

    return originalFetch(url, options).then(async response => {
        // Check if unauthorized
        if (response.status === 401) {
            const data = await response.json();
            if (data.error === 'UNAUTHORIZED') {
                Toast.error('Session expired', 'Please login again');
                setTimeout(() => {
                    window.location.href = '/login.html';
                }, 1000);
            }
        }
        return response;
    });
};
