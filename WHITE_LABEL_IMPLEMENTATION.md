# White Label Implementation Guide

## Overview

This document outlines the complete white labeling implementation for Agency Uptime, specifically focused on the custom domain `reports.agencyuptime.com`.

## ✅ Features Implemented

### 1. Database Schema

- ✅ `custom_domain` field in agencies table
- ✅ `brand_color` field for custom branding
- ✅ `logo_url` field for agency logos
- ✅ Migration script for existing databases

### 2. Backend API Endpoints

#### Custom Domain Detection

- ✅ `detectCustomDomain` middleware in `/routes/reports.js`
- ✅ Detects `reports.{domain}` subdomains
- ✅ Maps to agency by custom_domain field

#### White-labeled Reports

- ✅ `GET /api/reports/public/:reportId` - Public report access via custom domain
- ✅ `GET /api/reports/dashboard` - White-labeled dashboard data
- ✅ `POST /api/reports/generate-white-label` - Generate branded reports

#### Profile Management

- ✅ `PUT /api/auth/profile` - Update custom domain and branding
- ✅ `GET /api/auth/profile` - Fetch current branding settings

### 3. Frontend Components

#### White Label Settings

- ✅ `WhiteLabelSettings.tsx` component
- ✅ Agency name, brand color, logo URL configuration
- ✅ Custom domain setup (reports.{domain})
- ✅ Preview and test functionality

#### White-labeled Dashboard

- ✅ `app/white-label/page.tsx` - Custom domain dashboard
- ✅ Dynamic theming based on agency brand_color
- ✅ Agency logo and branding integration
- ✅ Reports download with custom branding

### 4. Report Generation

- ✅ `generateWhiteLabeledReport()` function
- ✅ Custom PDF generation with agency branding
- ✅ Brand color integration in reports
- ✅ Custom domain footer in reports

## 🔧 Configuration

### Database Setup

The following tables support white labeling:

```sql
-- Agencies table (already exists, enhanced)
ALTER TABLE agencies ADD COLUMN custom_domain TEXT;
ALTER TABLE agencies ADD COLUMN brand_color TEXT DEFAULT '#3B82F6';
ALTER TABLE agencies ADD COLUMN logo_url TEXT;

-- Reports table (already exists)
-- Used for storing white-labeled reports
```

### Custom Domain Configuration

#### For reports.agencyuptime.com:

1. **Agency Setup**: Set `custom_domain = 'agencyuptime.com'` in agencies table
2. **DNS Configuration**:
   - CNAME: `reports.agencyuptime.com` → `your-server.com`
   - Or A Record: `reports.agencyuptime.com` → `your-server-ip`

#### For Client Custom Domains:

1. **Agency Setup**: Set `custom_domain = 'client-domain.com'`
2. **Client DNS**: CNAME `reports.client-domain.com` → `reports.agencyuptime.com`

## 🚀 Usage

### 1. Setup White Labeling

```javascript
// In dashboard, use WhiteLabelSettings component
// Configure:
// - Agency name
// - Brand color (#hexcode)
// - Logo URL (direct image link)
// - Custom domain (without reports. prefix)
```

### 2. Access White-labeled Portal

```
https://reports.agencyuptime.com
https://reports.{custom_domain}
```

### 3. Generate White-labeled Reports

```javascript
// API call to generate branded report
POST /api/reports/generate-white-label
{
  "report_type": "monthly",
  "period_start": "2025-01-01",
  "period_end": "2025-01-31"
}
```

## 🎨 Customization Features

### Visual Branding

- **Agency Logo**: Displayed in header and reports
- **Brand Colors**: Applied to buttons, badges, and accents
- **Custom Domain**: reports.{agency-domain}
- **Agency Name**: Throughout the interface

### Report Branding

- **Custom Headers**: Agency name and logo
- **Brand Colors**: Applied to titles and accents
- **Footer**: Custom domain mention
- **Professional Layout**: PDF reports with agency branding

## 📁 File Structure

```
backend/
├── routes/
│   ├── reports.js          # White-label report routes
│   ├── auth.js             # Profile/branding management
│   └── status.js           # Public status pages
├── services/
│   └── alerts.js           # Branded email templates
└── config/
    └── database.js         # Schema with custom domain support

frontend/
├── app/
│   ├── white-label/
│   │   └── page.tsx        # White-labeled dashboard
│   └── dashboard/
│       └── page.tsx        # Main dashboard with settings
├── components/
│   └── WhiteLabelSettings.tsx  # Configuration component
└── contexts/
    └── AuthContext.tsx     # User/agency context
```

## 🔗 API Endpoints Summary

| Endpoint                            | Method  | Description                  | Authentication     |
| ----------------------------------- | ------- | ---------------------------- | ------------------ |
| `/api/reports/public/:id`           | GET     | Public report download       | Custom domain only |
| `/api/reports/dashboard`            | GET     | White-labeled dashboard data | Custom domain only |
| `/api/reports/generate-white-label` | POST    | Generate branded report      | Required           |
| `/api/auth/profile`                 | GET/PUT | Manage branding settings     | Required           |
| `/api/status/page/:domain`          | GET     | Public status page           | None               |

## 🚦 Testing

### Test Custom Domain Locally

1. Edit your hosts file:

   ```
   127.0.0.1 reports.agencyuptime.com
   ```

2. Access: `http://reports.agencyuptime.com:3000`

### Test Report Generation

1. Configure white label settings in dashboard
2. Click "Generate Test Report"
3. Check for branded PDF with custom domain

### Test Public Access

1. Generate a report
2. Access via: `https://reports.{domain}/api/reports/public/{reportId}`

## 🔒 Security Considerations

### Domain Validation

- ✅ Custom domain middleware validates requests
- ✅ Agency ownership verified via database lookup
- ✅ Public endpoints restricted to custom domain access only

### Access Control

- ✅ Public reports only accessible via correct custom domain
- ✅ Admin functions require authentication
- ✅ Cross-agency data isolation maintained

## 🌐 Production Deployment

### DNS Configuration

```bash
# For reports.agencyuptime.com
CNAME reports.agencyuptime.com → your-production-server.com

# SSL Certificate (Let's Encrypt example)
certbot --nginx -d reports.agencyuptime.com
```

### Nginx Configuration

```nginx
server {
    server_name reports.agencyuptime.com reports.*.agencyuptime.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📈 Benefits

### For Agencies

- **Professional Branding**: White-labeled reports with agency identity
- **Client Trust**: Custom domain builds credibility
- **Scalability**: Easy to set up for multiple clients
- **Automation**: Branded reports generated automatically

### For Clients

- **Seamless Experience**: Reports appear to come from their agency
- **Professional Quality**: Branded PDFs and dashboards
- **Easy Access**: Memorable custom domain
- **Transparency**: Real-time status and historical data

## 🔧 Troubleshooting

### Common Issues

1. **Custom Domain Not Working**

   - Check DNS configuration
   - Verify `custom_domain` field in database
   - Ensure middleware is detecting domain correctly

2. **Branding Not Applied**

   - Check `brand_color` and `logo_url` fields
   - Verify CSS custom properties are being set
   - Clear browser cache

3. **Reports Not Generating**
   - Check file permissions on reports directory
   - Verify PDFDocument dependencies
   - Check server logs for errors

### Debug Mode

Enable debug logging in `services/alerts.js` and `routes/reports.js` for detailed request/response information.

## 🚀 Next Steps

### Potential Enhancements

- [ ] Multi-language support for reports
- [ ] Custom CSS themes for advanced branding
- [ ] White-labeled email templates
- [ ] Client portal user management
- [ ] Advanced report customization options

---

## Support

For implementation support or questions:

- Check server logs for detailed error messages
- Verify database schema matches requirements
- Test API endpoints individually
- Ensure all dependencies are installed (PDFKit, etc.)
