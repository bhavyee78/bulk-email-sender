# Hostinger Deployment Guide

This guide covers deploying the Bulk Email Sender to Hostinger hosting.

---

## Deployment Options

### Option 1: Hostinger VPS (Recommended)
Best for: Full control, Node.js support, background processes

### Option 2: Hostinger Shared Hosting with Node.js
Best for: Lower cost, managed environment

---

## Option 1: VPS Deployment

### Step 1: Get a VPS

1. Go to Hostinger: https://www.hostinger.com/vps-hosting
2. Choose a VPS plan (KVM 1 is sufficient for small usage)
3. Select Ubuntu 22.04 or 24.04 as the OS
4. Complete purchase and wait for setup

### Step 2: Connect to Your VPS

1. Get your VPS IP and password from Hostinger panel
2. Connect via SSH:
   ```bash
   ssh root@your-vps-ip
   ```

### Step 3: Install Node.js

```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x

# Install build tools (for native modules)
apt install -y build-essential python3
```

### Step 4: Install PM2 (Process Manager)

```bash
npm install -g pm2
```

### Step 5: Upload Your Application

**Option A: Using Git (recommended)**
```bash
# Install git
apt install -y git

# Clone your repository
git clone https://github.com/your-repo/bulk-email-sender.git
cd bulk-email-sender
```

**Option B: Using SFTP**
1. Use FileZilla or similar SFTP client
2. Connect to your VPS
3. Upload files to `/root/bulk-email-sender`

### Step 6: Configure Environment

```bash
cd /root/bulk-email-sender/backend

# Copy example env file
cp .env.example .env

# Edit with your credentials
nano .env
```

Update these values:
```env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
SES_FROM_EMAIL=your-verified-email@example.com
APP_BASE_URL=https://your-domain.com
DAILY_EMAIL_LIMIT=250
PORT=3000
DATABASE_PATH=./database/emails.db
```

Save and exit (Ctrl+X, Y, Enter).

### Step 7: Install Dependencies

```bash
cd /root/bulk-email-sender/backend
npm install
```

### Step 8: Initialize Database

```bash
npm run init-db
```

### Step 9: Start with PM2

```bash
# Start the application
pm2 start server.js --name "bulk-email-sender"

# Save PM2 configuration
pm2 save

# Enable auto-start on reboot
pm2 startup
```

### Step 10: Set Up Nginx (Reverse Proxy)

```bash
# Install Nginx
apt install -y nginx

# Create site configuration
nano /etc/nginx/sites-available/bulk-email-sender
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/bulk-email-sender /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### Step 11: Set Up SSL (HTTPS)

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d your-domain.com -d www.your-domain.com

# Auto-renewal is set up automatically
```

### Step 12: Configure Firewall

```bash
# Install UFW
apt install -y ufw

# Allow SSH, HTTP, HTTPS
ufw allow ssh
ufw allow http
ufw allow https

# Enable firewall
ufw enable
```

---

## Option 2: Shared Hosting with Node.js

### Step 1: Enable Node.js in Hostinger

1. Log into Hostinger hPanel
2. Go to "Website" → "Advanced" → "Node.js"
3. Click "Create Application"

### Step 2: Configure Node.js Application

1. **Node.js version**: 18 or 20
2. **Application root**: `/bulk-email-sender/backend`
3. **Application URL**: Your domain
4. **Application startup file**: `server.js`

### Step 3: Upload Files

1. Go to "Files" → "File Manager"
2. Navigate to your domain's root folder
3. Create folder `bulk-email-sender`
4. Upload all project files

Or use FTP:
1. Go to "Files" → "FTP Accounts"
2. Connect with FTP client
3. Upload files

### Step 4: Set Environment Variables

In Node.js settings, add environment variables:
```
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
SES_FROM_EMAIL=your-email
APP_BASE_URL=https://your-domain.com
DAILY_EMAIL_LIMIT=250
```

### Step 5: Run NPM Install

1. Go to Node.js settings
2. Click "Run NPM Install" button
3. Wait for completion

### Step 6: Start Application

1. Click "Start" or "Restart" in Node.js settings
2. Check application status

---

## Point Domain to Hostinger

### For VPS:

1. Go to your domain registrar
2. Update A record:
   - Type: A
   - Name: @ (or your subdomain)
   - Value: Your VPS IP address
   - TTL: 300

### For Shared Hosting:

1. Go to Hostinger hPanel
2. Follow domain setup instructions
3. Use Hostinger nameservers if needed

---

## Verify Deployment

### 1. Check Health Endpoint
```bash
curl https://your-domain.com/api/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "version": "1.0.0"
}
```

### 2. Check Configuration
```bash
curl https://your-domain.com/api/config/check
```

### 3. Test the Application
1. Open `https://your-domain.com` in browser
2. Upload a test contact file
3. Send a test email
4. Check tracking dashboard

---

## Monitoring & Maintenance

### VPS: Using PM2

```bash
# View status
pm2 status

# View logs
pm2 logs bulk-email-sender

# Restart application
pm2 restart bulk-email-sender

# Stop application
pm2 stop bulk-email-sender
```

### View Nginx Logs

```bash
# Access logs
tail -f /var/log/nginx/access.log

# Error logs
tail -f /var/log/nginx/error.log
```

### Database Backup

```bash
# Manual backup
cp /root/bulk-email-sender/backend/database/emails.db /root/backups/emails-$(date +%Y%m%d).db

# Set up automatic backup (cron)
crontab -e

# Add this line for daily backup at 2 AM:
0 2 * * * cp /root/bulk-email-sender/backend/database/emails.db /root/backups/emails-$(date +\%Y\%m\%d).db
```

---

## Troubleshooting

### Application won't start
```bash
# Check logs
pm2 logs bulk-email-sender --lines 50

# Check if port is in use
lsof -i :3000

# Kill process on port
kill -9 $(lsof -t -i:3000)
```

### Database errors
```bash
# Check database file exists
ls -la /root/bulk-email-sender/backend/database/

# Re-initialize database
cd /root/bulk-email-sender/backend
npm run init-db
```

### SSL certificate issues
```bash
# Renew certificate
certbot renew

# Check certificate status
certbot certificates
```

### Nginx errors
```bash
# Test configuration
nginx -t

# Restart Nginx
systemctl restart nginx

# Check Nginx status
systemctl status nginx
```

---

## Security Checklist

- [ ] `.env` file is not accessible from web
- [ ] Firewall is enabled (VPS)
- [ ] SSL certificate is installed
- [ ] Regular backups are configured
- [ ] PM2 is set to auto-restart
- [ ] Database file has proper permissions
- [ ] No sensitive data in git repository

---

## Cost Estimate

| Item | Monthly Cost |
|------|--------------|
| Hostinger VPS (KVM 1) | ~$5-10 |
| Domain (annual/12) | ~$1 |
| SSL (Let's Encrypt) | FREE |
| AWS SES (free tier) | $0 |
| **Total** | **~$6-11/month** |
