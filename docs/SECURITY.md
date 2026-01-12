# 🔒 Security Documentation

## Authentication System

Your Bulk Email Sender application is now protected with a **multi-layer security system**.

---

## 🛡️ Security Features Implemented

### 1. **Bcrypt Password Hashing**
- Passwords are hashed using bcrypt with 10 salt rounds
- Original passwords are never stored in plain text
- Hash computation is intentionally slow to prevent brute force attacks

### 2. **Session-Based Authentication**
- Secure session management using `express-session`
- Session stored server-side (not in cookies)
- Session ID cookie is:
  - **HttpOnly**: Prevents XSS attacks
  - **Secure**: HTTPS only in production
  - **SameSite**: Strict CSRF protection
  - **24-hour expiration**

### 3. **Rate Limiting**
- **Login attempts**: Maximum 5 attempts per 15 minutes per IP
- Prevents brute force attacks
- Failed attempts don't count against successful logins

### 4. **Protected API Endpoints**
All sensitive API endpoints require authentication:
- `/api/contacts/*` - Contact management
- `/api/emails/*` - Email sending and history

Public endpoints (no auth required):
- `/api/auth/*` - Login/logout
- `/api/track/*` - Email tracking pixels (must be public)

### 5. **Security Headers**
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-XSS-Protection: 1; mode=block` - XSS protection
- `Strict-Transport-Security` - Forces HTTPS

### 6. **Automatic Session Expiration**
- Sessions expire after 401 errors
- Automatic redirect to login page
- User notified via toast message

---

## 🔑 Default Credentials

**⚠️ CRITICAL: Change these immediately in production!**

```
Username: rohanfiladil
Password: rohanfiladil@2828
```

---

## 🔄 How to Change Password

### Method 1: Update the Hash (Recommended)

1. **Generate new password hash**:
   ```bash
   cd /Users/bhavysuri/Downloads/bulk-email-sender/backend
   node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YOUR_NEW_PASSWORD', 10).then(hash => console.log(hash));"
   ```

2. **Copy the hash output** (looks like: `$2b$10$...`)

3. **Update middleware/auth.js**:
   ```javascript
   const USERS = {
       'rohanfiladil': {
           username: 'rohanfiladil',
           passwordHash: 'PASTE_YOUR_NEW_HASH_HERE'
       }
   };
   ```

4. **Restart server**:
   ```bash
   pm2 restart bulk-email-sender  # For production
   # OR
   npm start  # For development
   ```

### Method 2: Add New User

Edit `backend/middleware/auth.js`:

```javascript
const USERS = {
    'rohanfiladil': {
        username: 'rohanfiladil',
        passwordHash: '$2b$10$...'
    },
    'newusername': {
        username: 'newusername',
        passwordHash: '$2b$10$...'  // Generate as shown above
    }
};
```

---

## 🚨 Security Best Practices

### 1. **Use Strong Passwords**
- Minimum 12 characters
- Mix of uppercase, lowercase, numbers, symbols
- Don't use common words or patterns
- Example: `K9#mP2$vL8@qR5!nT3`

### 2. **Secure the SESSION_SECRET**
Generate a strong random secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Update `.env`:
```env
SESSION_SECRET=your_generated_secret_here
```

**Never** commit this to Git!

### 3. **Enable HTTPS in Production**
Update `.env` for production:
```env
NODE_ENV=production
APP_BASE_URL=https://yourdomain.com
CORS_ORIGIN=https://yourdomain.com
```

With `NODE_ENV=production`, cookies will only work over HTTPS.

### 4. **Regular Security Updates**
```bash
# Check for vulnerabilities
npm audit

# Fix automatically
npm audit fix

# Check outdated packages
npm outdated

# Update packages
npm update
```

### 5. **Monitor Login Attempts**
Check server logs for suspicious activity:
```bash
pm2 logs bulk-email-sender | grep -i "login\|unauthorized"
```

### 6. **Backup Database Regularly**
```bash
# Manual backup
cp backend/database/emails.db backup-$(date +%Y%m%d).db

# Automated (add to crontab)
0 2 * * * cp /path/to/backend/database/emails.db /backups/emails-$(date +\%Y\%m\%d).db
```

---

## 🔍 How Authentication Works

### Login Flow:

```
1. User visits site
   ↓
2. Auth check fails → Redirect to /login.html
   ↓
3. User enters credentials
   ↓
4. POST /api/auth/login
   ↓
5. Rate limiter checks attempts (max 5 per 15 min)
   ↓
6. Password hash comparison with bcrypt
   ↓
7. Create secure session with user data
   ↓
8. Send session cookie to browser
   ↓
9. Redirect to main app
   ↓
10. All API requests include session cookie
    ↓
11. requireAuth middleware validates session
    ↓
12. Access granted to protected resources
```

### Logout Flow:

```
1. User clicks logout
   ↓
2. POST /api/auth/logout
   ↓
3. Session destroyed on server
   ↓
4. Session cookie cleared
   ↓
5. Redirect to login page
```

---

## 🛠️ Testing Authentication

### Test Login:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"rohanfiladil","password":"rohanfiladil@2828"}' \
  -c cookies.txt
```

### Test Protected Endpoint:
```bash
curl http://localhost:3000/api/contacts/list -b cookies.txt
```

### Test Without Auth:
```bash
curl http://localhost:3000/api/contacts/list
# Should return 401 Unauthorized
```

---

## 🚫 Common Security Mistakes to Avoid

### ❌ Don't Do This:
1. Store passwords in plain text
2. Use weak passwords like "password123"
3. Share SESSION_SECRET publicly
4. Commit `.env` file to Git
5. Use HTTP in production
6. Disable CORS without understanding implications
7. Remove rate limiting
8. Use same password across services

### ✅ Do This:
1. Always use bcrypt for password hashing
2. Generate strong random secrets
3. Add `.env` to `.gitignore`
4. Use HTTPS in production
5. Keep security packages updated
6. Monitor logs for suspicious activity
7. Enable rate limiting on all login endpoints
8. Use unique passwords for each service

---

## 📊 Security Checklist

Before deploying to production:

- [ ] Changed default password
- [ ] Generated strong SESSION_SECRET
- [ ] Set NODE_ENV=production
- [ ] Enabled HTTPS
- [ ] Updated CORS_ORIGIN to your domain
- [ ] Tested login/logout flow
- [ ] Verified rate limiting works
- [ ] Checked all API endpoints require auth
- [ ] Configured firewall rules
- [ ] Set up automated backups
- [ ] Tested 401 redirect to login
- [ ] Verified session expiration
- [ ] Checked security headers
- [ ] Removed any test/debug code
- [ ] Documented credentials securely

---

## 🆘 Troubleshooting

### "Too many login attempts"
- Wait 15 minutes
- Or restart server: `pm2 restart bulk-email-sender`
- Or clear rate limit cache (development only)

### "Session expired" message
- Normal after 24 hours
- Just login again
- Check SESSION_SECRET is set correctly

### Can't login after password change
- Verify hash is correct format (`$2b$10$...`)
- No extra quotes or whitespace
- Restart server after changes
- Check server logs for errors

### 401 Errors on API calls
- Check if logged in: `/api/auth/status`
- Clear browser cookies
- Try login again
- Check server logs

---

## 📞 Support

If you experience security issues:

1. Check server logs: `pm2 logs bulk-email-sender`
2. Verify environment variables
3. Test authentication flow manually
4. Review recent code changes
5. Check firewall/network settings

---

**🔐 Your application is now highly secure!**

Remember: Security is an ongoing process. Keep your system updated and monitor logs regularly.
