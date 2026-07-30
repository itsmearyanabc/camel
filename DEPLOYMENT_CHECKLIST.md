# Deployment Checklist

## Pre-Deployment

### 1. Environment Configuration

- [ ] **Database**
  - [ ] `DATABASE_URL` is set to production PostgreSQL
  - [ ] Database is backed up
  - [ ] Database migrations are ready (`prisma migrate deploy`)
  - [ ] Connection pooling configured (if needed)

- [ ] **Security Secrets** (Generate with `openssl rand -base64 32`)
  - [ ] `SESSION_SECRET` - For session encryption
  - [ ] `CAPTCHA_SECRET` - For CAPTCHA encryption
  - [ ] `CRON_SECRET` - For cron job authentication
  - [ ] All secrets are unique and strong
  - [ ] Secrets are stored securely (not in code)

- [ ] **NOWPayments**
  - [ ] `NOWPAYMENTS_API_KEY` is set
  - [ ] `NOWPAYMENTS_IPN_SECRET` is set
  - [ ] IPN callback URL configured in NOWPayments dashboard
  - [ ] Callback URL points to production domain
  - [ ] Test payment completed successfully in sandbox

- [ ] **Telegram Bots** (if applicable)
  - [ ] `TELEGRAM_BOT_1_TOKEN` is set
  - [ ] `TELEGRAM_BOT_2_TOKEN` is set (if using second bot)
  - [ ] Bot webhooks configured
  - [ ] Bot commands tested

- [ ] **Application**
  - [ ] `NODE_ENV=production`
  - [ ] `NEXT_PUBLIC_APP_URL` set to production domain
  - [ ] All environment variables documented

### 2. Code Quality

- [ ] **Build**
  - [ ] `npm run build` succeeds without errors
  - [ ] No TypeScript errors
  - [ ] No ESLint errors
  - [ ] Build size is acceptable

- [ ] **Testing**
  - [ ] All automated tests pass (`node scripts/test-api.js`)
  - [ ] Manual testing checklist completed
  - [ ] Critical bugs fixed
  - [ ] High-priority bugs fixed

- [ ] **Code Review**
  - [ ] Code reviewed by team
  - [ ] No console.log statements in production code
  - [ ] No commented-out code
  - [ ] No TODO/FIXME comments (or documented)

### 3. Security Audit

- [ ] **Dependencies**
  - [ ] `npm audit` shows no critical vulnerabilities
  - [ ] All dependencies up to date
  - [ ] No unused dependencies

- [ ] **Environment Variables**
  - [ ] No secrets in code
  - [ ] No secrets in Git history
  - [ ] `.env` in `.gitignore`
  - [ ] `.env.example` updated (without real values)

- [ ] **API Security**
  - [ ] Rate limiting enabled
  - [ ] CORS configured correctly
  - [ ] Input validation on all endpoints
  - [ ] SQL injection protection (Prisma)
  - [ ] XSS protection enabled

- [ ] **Session Security**
  - [ ] Session cookies are httpOnly
  - [ ] Session cookies are secure (HTTPS only)
  - [ ] Session cookies have appropriate expiry
  - [ ] Session encryption is strong

### 4. Database

- [ ] **Migrations**
  - [ ] All migrations tested on staging
  - [ ] Migration rollback plan documented
  - [ ] Database backup before migration

- [ ] **Indexes**
  - [ ] Indexes on frequently queried fields
  - [ ] Indexes on foreign keys
  - [ ] Query performance tested

- [ ] **Data Integrity**
  - [ ] Foreign key constraints enabled
  - [ ] Unique constraints in place
  - [ ] Check constraints validated

### 5. Performance

- [ ] **Optimization**
  - [ ] Images optimized
  - [ ] Static assets cached
  - [ ] Database queries optimized
  - [ ] N+1 queries eliminated

- [ ] **Monitoring**
  - [ ] Error tracking configured (e.g., Sentry)
  - [ ] Performance monitoring configured
  - [ ] Uptime monitoring configured
  - [ ] Log aggregation configured

### 6. Infrastructure

- [ ] **Hosting**
  - [ ] Server provisioned
  - [ ] Domain configured
  - [ ] SSL certificate installed
  - [ ] CDN configured (if applicable)

- [ ] **Scaling**
  - [ ] Auto-scaling configured (if applicable)
  - [ ] Load balancer configured (if applicable)
  - [ ] Database connection pooling configured

- [ ] **Backup**
  - [ ] Database backup schedule configured
  - [ ] Backup retention policy defined
  - [ ] Backup restoration tested

---

## Deployment

### 7. Deployment Process

- [ ] **Pre-Deployment**
  - [ ] Announce maintenance window (if needed)
  - [ ] Create database backup
  - [ ] Tag release in Git (`git tag -a v1.0.0 -m "Release 1.0.0"`)
  - [ ] Push tag to remote (`git push --tags`)

- [ ] **Deployment**
  - [ ] Deploy to staging first
  - [ ] Run smoke tests on staging
  - [ ] Deploy to production
  - [ ] Run database migrations (`prisma migrate deploy`)
  - [ ] Restart application server
  - [ ] Clear CDN cache (if applicable)

- [ ] **Post-Deployment**
  - [ ] Verify application is accessible
  - [ ] Verify SSL certificate is valid
  - [ ] Check error logs for issues
  - [ ] Monitor performance metrics

### 8. Smoke Tests (Production)

- [ ] **Critical Paths**
  - [ ] Homepage loads
  - [ ] User can register
  - [ ] User can login
  - [ ] User can view products
  - [ ] User can add to cart
  - [ ] User can checkout (wallet)
  - [ ] User can checkout (crypto)
  - [ ] Admin can login
  - [ ] Admin can access control panel

- [ ] **API Endpoints**
  - [ ] `GET /api/products` returns products
  - [ ] `POST /api/auth/login` works
  - [ ] `GET /api/wallet/balance` works (with auth)
  - [ ] `POST /api/orders/checkout` works (with auth)

- [ ] **Webhooks**
  - [ ] NOWPayments webhook receives test notification
  - [ ] Webhook signature verification works
  - [ ] Order status updates correctly

---

## Post-Deployment

### 9. Monitoring (First 24 Hours)

- [ ] **Error Monitoring**
  - [ ] Check error logs every hour
  - [ ] No critical errors
  - [ ] No unexpected errors

- [ ] **Performance Monitoring**
  - [ ] Response times acceptable
  - [ ] Database query times acceptable
  - [ ] No memory leaks
  - [ ] CPU usage normal

- [ ] **User Monitoring**
  - [ ] Users can register
  - [ ] Users can login
  - [ ] Users can complete purchases
  - [ ] No user complaints

### 10. Rollback Plan

- [ ] **Rollback Triggers**
  - [ ] Critical bug affecting users
  - [ ] Data corruption
  - [ ] Security vulnerability
  - [ ] Performance degradation

- [ ] **Rollback Process**
  - [ ] Revert to previous Git tag
  - [ ] Restore database backup (if needed)
  - [ ] Restart application
  - [ ] Verify rollback successful
  - [ ] Notify users (if needed)

### 11. Documentation

- [ ] **Deployment Notes**
  - [ ] Deployment date/time recorded
  - [ ] Deployed version recorded
  - [ ] Any issues encountered documented
  - [ ] Resolution steps documented

- [ ] **Release Notes**
  - [ ] New features documented
  - [ ] Bug fixes documented
  - [ ] Breaking changes documented
  - [ ] Upgrade instructions provided

---

## Post-Launch

### 12. Week 1 Tasks

- [ ] Monitor error rates daily
- [ ] Monitor performance metrics daily
- [ ] Gather user feedback
- [ ] Address critical bugs immediately
- [ ] Plan first patch release (if needed)

### 13. Ongoing Maintenance

- [ ] **Weekly**
  - [ ] Review error logs
  - [ ] Review performance metrics
  - [ ] Check for security updates
  - [ ] Backup verification

- [ ] **Monthly**
  - [ ] Dependency updates
  - [ ] Security audit
  - [ ] Performance optimization
  - [ ] Database maintenance

---

## Emergency Contacts

- **Developer:** ******\_\_\_******
- **DevOps:** ******\_\_\_******
- **Database Admin:** ******\_\_\_******
- **On-Call:** ******\_\_\_******

---

## Sign-Off

- [ ] All pre-deployment checks completed
- [ ] Deployment successful
- [ ] Smoke tests passed
- [ ] Monitoring configured
- [ ] Team notified

**Deployed by:** ******\_\_\_******  
**Date:** ******\_\_\_******  
**Version:** ******\_\_\_******  
**Signature:** ******\_\_\_******
