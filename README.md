# Bulk Email Sender - Zero AWS Billing Risk Architecture

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         HOSTINGER VPS / SHARED HOSTING                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Node.js Backend (Express)                 │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │   │
│  │  │   Upload    │  │   Email     │  │     Open Tracking       │ │   │
│  │  │   Handler   │  │   Sender    │  │       Endpoint          │ │   │
│  │  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘ │   │
│  │         │                │                      │               │   │
│  │         ▼                ▼                      ▼               │   │
│  │  ┌─────────────────────────────────────────────────────────────┐│   │
│  │  │                    SQLite Database                          ││   │
│  │  │  • Contacts table                                           ││   │
│  │  │  • Email campaigns table                                    ││   │
│  │  │  • Open tracking table                                      ││   │
│  │  │  • Daily quota tracking                                     ││   │
│  │  └─────────────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Static Frontend (HTML/CSS/JS)                │   │
│  │  • Excel/CSV upload                                              │   │
│  │  • Contact table with selection                                  │   │
│  │  • Email composer with personalization                           │   │
│  │  • Tracking dashboard                                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS (AWS SDK)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS FREE TIER ONLY                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                         AWS SES                                  │   │
│  │  • 200 emails/day FREE (sending from EC2) or                    │   │
│  │  • 62,000 emails/month if from EC2                              │   │
│  │  • SANDBOX: Only verified emails (perfect for testing)          │   │
│  │  • Hard limit enforced in app: 250 emails/day                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## 💰 Cost-Safety Explanation

### Why This Architecture Has ZERO AWS Billing Risk

| Component | Service Used | Cost Risk | Mitigation |
|-----------|--------------|-----------|------------|
| **Backend** | Hostinger | ₹0 AWS | Hosted entirely on Hostinger, NOT AWS |
| **Database** | SQLite (local file) | ₹0 AWS | No AWS RDS, no DynamoDB |
| **File Storage** | Local filesystem | ₹0 AWS | Files stored on Hostinger disk |
| **Email Sending** | AWS SES | ₹0 (Free Tier) | Hard limit of 250 emails/day in code |
| **Open Tracking** | Self-hosted endpoint | ₹0 AWS | Tracking pixel served by Hostinger |

### AWS Services Explicitly AVOIDED
- ❌ EC2 (can auto-scale)
- ❌ RDS (charged per hour)
- ❌ DynamoDB (charged per request)
- ❌ NAT Gateway (very expensive)
- ❌ Load Balancers (hourly charges)
- ❌ CloudFront (can incur transfer costs)
- ❌ Lambda (pay per invocation beyond free tier)

### Hard Safeguards Implemented

1. **Daily Email Limit**: App refuses to send more than 250 emails/day
2. **Quota Checking**: Before sending, app checks SES quota via API
3. **Database Tracking**: Every email logged to prevent exceeding limits
4. **Clear Error Messages**: Users see exactly why sends are blocked

### AWS SES Free Tier Details

| Scenario | Free Limit |
|----------|------------|
| Sending from EC2 | 62,000 emails/month |
| Sending from outside AWS | First 3,000 emails/month via free tier |
| Sandbox Mode | 200 emails/24 hours, only to verified addresses |

**Our app uses 250/day limit** to stay well within all tiers.

## 📁 Project Structure

```
bulk-email-sender/
├── backend/
│   ├── server.js              # Main Express server
│   ├── config/
│   │   └── database.js        # SQLite configuration
│   ├── routes/
│   │   ├── contacts.js        # Contact CRUD operations
│   │   ├── emails.js          # Email sending logic
│   │   └── tracking.js        # Open tracking endpoint
│   ├── services/
│   │   ├── ses.js             # AWS SES service wrapper
│   │   ├── quota.js           # Daily quota management
│   │   └── parser.js          # Excel/CSV parsing
│   ├── middleware/
│   │   └── quotaGuard.js      # Quota enforcement middleware
│   ├── database/
│   │   └── emails.db          # SQLite database file (auto-created)
│   ├── uploads/               # Temporary file uploads
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── index.html             # Main application page
│   ├── css/
│   │   └── styles.css         # Application styles
│   └── js/
│       ├── app.js             # Main application logic
│       ├── upload.js          # File upload handling
│       ├── contacts.js        # Contact management
│       ├── composer.js        # Email composer
│       └── tracking.js        # Tracking dashboard
├── docs/
│   ├── AWS_SETUP.md           # AWS configuration guide
│   ├── HOSTINGER_DEPLOY.md    # Deployment instructions
│   └── CREDENTIALS.md         # Credential reference
└── README.md                  # This file
```

## 🔐 Credentials Reference

### Required Environment Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key | AWS IAM Console |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key | AWS IAM Console (shown once) |
| `AWS_REGION` | AWS region for SES | Use `us-east-1`, `eu-west-1`, etc. |
| `SES_FROM_EMAIL` | Verified sender email | Must be verified in SES |
| `APP_BASE_URL` | Your app's public URL | Your Hostinger domain |
| `DAILY_EMAIL_LIMIT` | Max emails per day | Set to 250 (default) |

### .env.example

```env
# AWS Credentials (SES Only - No billing risk)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1

# SES Configuration
SES_FROM_EMAIL=your-verified-email@example.com

# App Configuration
APP_BASE_URL=https://your-domain.com
DAILY_EMAIL_LIMIT=250
PORT=3000

# Database (SQLite - no cloud costs)
DATABASE_PATH=./database/emails.db
```

## 🚀 Quick Start

### 1. Clone/Upload to Hostinger

```bash
# Upload all files to your Hostinger account
# Via FTP, SSH, or Hostinger File Manager
```

### 2. Install Dependencies

```bash
cd backend
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
nano .env
```

### 4. Initialize Database

```bash
npm run init-db
```

### 5. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

### 6. Access Application

Open `http://your-domain.com` in browser.

## 📊 Features

### Contact Management
- Upload Excel (.xlsx) or CSV files
- Preview contacts in a sortable table
- Select individual or all contacts
- Delete contacts individually or in bulk

### Email Composition
- Dynamic subject line with variables
- Rich email body with variable support
- Live preview of personalization
- Variable helper toolbar

### Personalization Variables
| Variable | Description |
|----------|-------------|
| `{first_name}` | Recipient's first name |
| `{last_name}` | Recipient's last name |
| `{company_name}` | Recipient's company |

### Tracking Dashboard
- Sent status per email
- Open count tracking
- Last opened timestamp
- Open rate calculation
- Export to Excel/CSV

## ⚠️ Important Notes

1. **SES Sandbox Mode**: Until you request production access, you can only send to verified email addresses.

2. **Domain Verification**: For production, verify your domain in SES for better deliverability.

3. **Daily Limits**: The app enforces a 250 email/day limit. This resets at midnight UTC.

4. **Tracking Accuracy**: Open tracking via pixels isn't 100% accurate due to email client image blocking.

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Quota exceeded" error | Wait until midnight UTC for reset |
| Emails not sending | Check SES sandbox status, verify recipient |
| Tracking not working | Ensure APP_BASE_URL is correctly set |
| Upload failing | Check file format (.xlsx or .csv only) |

## 📄 License

MIT License - Use freely for personal and commercial projects.
