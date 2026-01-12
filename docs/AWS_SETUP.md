# AWS Setup Guide - Zero Billing Risk

This guide walks you through setting up AWS services with **zero billing risk**. We only use AWS SES (Simple Email Service) with strict safeguards.

## Prerequisites

- An AWS account
- A verified email address or domain for sending

---

## Step 1: Create IAM User (SES-Only Permissions)

**Why**: This creates credentials that can ONLY access SES - nothing else.

### 1.1 Go to IAM Console
1. Sign in to AWS Console: https://console.aws.amazon.com/
2. Search for "IAM" and click on it
3. Click "Users" in the left sidebar
4. Click "Create user"

### 1.2 Create User
1. User name: `bulk-email-sender-ses`
2. Click "Next"

### 1.3 Set Permissions
1. Select "Attach policies directly"
2. Search for "AmazonSESFullAccess"
3. Check the box next to "AmazonSESFullAccess"
4. Click "Next"
5. Click "Create user"

### 1.4 Create Access Key
1. Click on your new user name
2. Go to "Security credentials" tab
3. Scroll to "Access keys"
4. Click "Create access key"
5. Select "Application running outside AWS"
6. Click "Next"
7. Description: `Bulk Email Sender`
8. Click "Create access key"
9. **IMPORTANT**: Download or copy both:
   - Access key ID (starts with `AKIA...`)
   - Secret access key (shown only once!)
10. Click "Done"

---

## Step 2: Verify Email Address in SES

**Why**: SES requires verified sender addresses.

### 2.1 Go to SES Console
1. Search for "SES" in AWS Console
2. Click "Amazon Simple Email Service"

### 2.2 Check Your Region
⚠️ **IMPORTANT**: Note which region you're in (top-right of console).
Common regions:
- `us-east-1` (N. Virginia)
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland)
- `ap-southeast-1` (Singapore)

### 2.3 Verify Email Address
1. Click "Verified identities" in left sidebar
2. Click "Create identity"
3. Select "Email address"
4. Enter your email address (this will be your FROM address)
5. Click "Create identity"
6. Check your email inbox for verification email
7. Click the verification link

### 2.4 (Optional) Verify a Domain
For better deliverability and professional appearance:
1. Click "Create identity"
2. Select "Domain"
3. Enter your domain (e.g., `yourdomain.com`)
4. Follow DNS verification instructions
5. Add the provided DKIM records to your DNS

---

## Step 3: Understand SES Sandbox Mode

**Default state**: Your SES account starts in "Sandbox" mode.

### Sandbox Limitations:
- Can only send TO verified email addresses
- Maximum 200 emails per 24 hours
- Maximum 1 email per second

### For Testing (Recommended to start):
1. Verify additional email addresses for testing recipients
2. Test your setup thoroughly before requesting production access

### To Request Production Access:
1. Go to SES Console
2. Click "Account dashboard"
3. Click "Request production access"
4. Fill out the form:
   - Mail type: Marketing or Transactional
   - Website URL: Your website
   - Use case description: Explain your email sending needs
5. Wait for approval (usually 24-48 hours)

---

## Step 4: Set Up Billing Alerts (Safety Net)

**Why**: Extra protection against unexpected charges.

### 4.1 Enable Billing Alerts
1. Go to AWS Billing Console: https://console.aws.amazon.com/billing/
2. Click "Billing preferences" in left sidebar
3. Enable "Receive Billing Alerts"
4. Click "Save preferences"

### 4.2 Create Zero-Cost Alert
1. Go to CloudWatch: https://console.aws.amazon.com/cloudwatch/
2. Click "Alarms" → "All alarms"
3. Click "Create alarm"
4. Click "Select metric"
5. Choose: Billing → Total Estimated Charge
6. Select "USD" metric
7. Click "Select metric"
8. Configure threshold:
   - Threshold type: Static
   - Whenever EstimatedCharges is: Greater than
   - Amount: `0` (zero)
9. Click "Next"
10. Configure notification:
    - Create new SNS topic
    - Topic name: `billing-alert-zero`
    - Email: Your email address
11. Click "Create topic"
12. Confirm subscription email
13. Click "Next"
14. Alarm name: `Zero-cost-alert`
15. Click "Create alarm"

**Result**: You'll get an email if ANY AWS charge appears.

---

## Step 5: Configure Your .env File

Using the credentials from Step 1, update your `.env` file:

```env
# AWS Credentials
AWS_ACCESS_KEY_ID=AKIA...your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Region (MUST match where you verified your email)
AWS_REGION=us-east-1

# Verified email address from Step 2
SES_FROM_EMAIL=your-verified-email@example.com

# Your application URL (for tracking pixels)
APP_BASE_URL=https://your-domain.com

# Daily limit (stay within free tier)
DAILY_EMAIL_LIMIT=250
```

---

## Step 6: Test Your Configuration

1. Start your server:
   ```bash
   cd backend
   npm install
   npm start
   ```

2. Check configuration:
   - Visit: `http://localhost:3000/api/config/check`
   - Should show "OK" status

3. Check SES quota:
   - Visit: `http://localhost:3000/api/emails/quota`
   - Should show your daily limits

4. Test sending:
   - Upload a test contact (use a verified email in sandbox)
   - Send a test email
   - Check if email is received

---

## AWS Services Cost Summary

| Service | Used For | Cost |
|---------|----------|------|
| SES | Email sending | First 3,000/month FREE (outside EC2) |
| IAM | Authentication | Always FREE |
| CloudWatch | Billing alerts | Always FREE (basic) |

### What We DON'T Use (Zero Cost):
- ❌ EC2 (no servers)
- ❌ RDS (no databases)
- ❌ S3 (optional, not required)
- ❌ Lambda (no functions)
- ❌ Load Balancers
- ❌ NAT Gateway
- ❌ CloudFront

---

## Troubleshooting

### "Email address not verified"
- Make sure the TO address is verified (in sandbox mode)
- Check you're using the correct region

### "Access Denied"
- Verify IAM user has `AmazonSESFullAccess` policy
- Check credentials in `.env` are correct
- Confirm region matches where email was verified

### "Quota exceeded"
- Wait until quota resets (24 hours rolling window)
- Check AWS SES dashboard for current usage

### "MessageRejected"
- Sandbox mode: Both sender AND recipient must be verified
- Check email address format is valid

---

## Security Best Practices

1. **Never commit `.env` to git**
   - Add `.env` to `.gitignore`

2. **Use minimal IAM permissions**
   - Only `AmazonSESFullAccess`, nothing more

3. **Rotate credentials periodically**
   - Create new access keys every 90 days

4. **Monitor billing alerts**
   - Respond immediately to any alerts

5. **Keep SES in sandbox for testing**
   - Only request production when ready
