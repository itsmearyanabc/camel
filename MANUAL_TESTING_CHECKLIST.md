# Manual Testing Checklist

## Pre-Testing Setup

- [ ] Database is running and accessible
- [ ] Environment variables are configured (`.env` file)
- [ ] Development server is running (`npm run dev`)
- [ ] Test data is seeded in database
- [ ] Browser DevTools is open (F12) to monitor console/network

---

## 1. Authentication & Security

### Registration

- [ ] Navigate to `/auth/register`
- [ ] CAPTCHA displays correctly
- [ ] Try registering with invalid CAPTCHA → Should fail
- [ ] Register with valid data → Should succeed
- [ ] Check database for new user record
- [ ] Verify password is hashed (not plain text)

### Login

- [ ] Navigate to `/auth/login`
- [ ] CAPTCHA displays correctly
- [ ] Try login with wrong password → Should fail with 401
- [ ] Try login with invalid CAPTCHA → Should fail
- [ ] Login with correct credentials → Should succeed
- [ ] Verify session cookie is set (check DevTools → Application → Cookies)
- [ ] Verify redirect to dashboard after login

### Session Management

- [ ] Close browser and reopen → Should still be logged in
- [ ] Wait 24+ hours (or manually expire cookie) → Should be logged out
- [ ] Try accessing `/dashboard` without login → Should redirect to login
- [ ] Logout → Session cookie should be deleted

### Rate Limiting

- [ ] Try logging in 6+ times rapidly → Should get rate limited (429)
- [ ] Wait 15 minutes → Should be able to login again

---

## 2. Product Management

### Product Listing

- [ ] Navigate to homepage
- [ ] Products display correctly with images
- [ ] Product prices are correct
- [ ] Stock status shows correctly (in stock / out of stock)
- [ ] Click on product → Navigates to product detail page

### Product Detail

- [ ] Product image displays
- [ ] Description is formatted correctly
- [ ] Price is correct
- [ ] Stock quantity is accurate
- [ ] "Add to Cart" button works
- [ ] Quantity selector works (if applicable)

### Admin Product Management

- [ ] Login as admin
- [ ] Navigate to `/control-panel-x7k9/products`
- [ ] Create new product with all fields
- [ ] Upload product image → Should save to `/public/uploads/products/`
- [ ] Edit existing product
- [ ] Delete product (soft delete)
- [ ] Verify product no longer appears on frontend

---

## 3. Shopping Cart & Checkout

### Cart Functionality

- [ ] Add product to cart
- [ ] Cart icon shows correct count
- [ ] Navigate to cart page
- [ ] Update quantity → Total updates correctly
- [ ] Remove item from cart
- [ ] Cart persists after page refresh

### Coupon Application

- [ ] Apply valid coupon code → Discount applied correctly
- [ ] Try expired coupon → Should show error
- [ ] Try coupon with min order amount not met → Should show error
- [ ] Try usage-limited coupon → Should show error when limit reached
- [ ] Remove coupon → Total recalculates correctly

### Wallet Checkout

- [ ] Ensure wallet has sufficient balance
- [ ] Proceed to checkout with wallet payment
- [ ] Order created successfully
- [ ] Wallet balance deducted correctly
- [ ] Transaction recorded in wallet history
- [ ] Order appears in order history
- [ ] Stock quantity decremented

### Crypto Checkout (NOWPayments)

- [ ] Add items to cart
- [ ] Select crypto payment method
- [ ] Choose cryptocurrency (BTC, ETH, etc.)
- [ ] NOWPayments invoice created
- [ ] Payment URL redirects correctly
- [ ] Order status is "PENDING"
- [ ] (Test webhook separately - see section 6)

---

## 4. Wallet Management

### Balance Display

- [ ] Navigate to wallet page
- [ ] Current balance displays correctly
- [ ] Balance matches database value

### Transaction History

- [ ] All transactions listed
- [ ] Transaction types correct (CREDIT/DEBIT)
- [ ] Amounts are accurate
- [ ] Timestamps are correct
- [ ] Pagination works (if many transactions)

### Add Funds (Crypto)

- [ ] Click "Add Funds"
- [ ] Select cryptocurrency
- [ ] NOWPayments invoice created
- [ ] Payment URL works
- [ ] (Test webhook separately)

---

## 5. Order Management

### Order History

- [ ] Navigate to orders page
- [ ] All orders listed
- [ ] Order status displays correctly
- [ ] Order details are accurate
- [ ] Click on order → Shows full details

### Order Details

- [ ] Order items listed correctly
- [ ] Prices are accurate
- [ ] Status timeline is correct
- [ ] Delivery information displays (if applicable)

### Order Status Flow

- [ ] Create order → Status: PENDING
- [ ] Payment confirmed → Status: PAID
- [ ] Cooldown starts → Status: COOLDOWN_ACTIVE
- [ ] Cooldown ends → Status: ON_PICKUP
- [ ] Admin completes → Status: COMPLETED
- [ ] Or: User disputes → Status: DISPUTED

---

## 6. NOWPayments Integration

### Configuration

- [ ] `NOWPAYMENTS_API_KEY` is set
- [ ] `NOWPAYMENTS_IPN_SECRET` is set
- [ ] IPN callback URL is configured in NOWPayments dashboard

### Payment Flow

- [ ] Create crypto checkout
- [ ] NOWPayments invoice created successfully
- [ ] Payment URL is valid
- [ ] Make test payment (use NOWPayments sandbox)
- [ ] Webhook receives payment notification
- [ ] Order status updates to PAID
- [ ] Wallet credited (if wallet topup)
- [ ] Transaction recorded

### Webhook Security

- [ ] Send webhook with invalid signature → Should reject (401)
- [ ] Send webhook with valid signature → Should process
- [ ] Check webhook logs for errors

---

## 7. Coupon System (Admin)

### Create Coupon

- [ ] Login as admin
- [ ] Navigate to `/control-panel-x7k9/coupons`
- [ ] Create percentage coupon (e.g., 10% off)
- [ ] Create fixed amount coupon (e.g., $5 off)
- [ ] Set expiration date
- [ ] Set usage limit
- [ ] Set minimum order amount

### Coupon Validation

- [ ] Test valid coupon → Applies correctly
- [ ] Test expired coupon → Rejected
- [ ] Test usage-limited coupon → Rejected when limit reached
- [ ] Test min order amount → Rejected when not met

---

## 8. Staff Panel

### Staff Management

- [ ] Login as admin
- [ ] Navigate to `/control-panel-x7k9/staff`
- [ ] Create new staff member
- [ ] Assign role (STAFF/ADMIN)
- [ ] Edit staff member
- [ ] Deactivate staff member
- [ ] Verify staff can login
- [ ] Verify staff has correct permissions

### Order Management (Staff)

- [ ] Login as staff
- [ ] View all orders
- [ ] Update order status
- [ ] Add delivery information
- [ ] Send message to customer

---

## 9. Multi-Stock Entry System

### Stock Management

- [ ] Login as admin
- [ ] Navigate to product edit page
- [ ] Add multiple stock entries
- [ ] Each entry has unique content
- [ ] Stock count updates correctly
- [ ] Purchase decrements stock
- [ ] Stock entries assigned to orders correctly

---

## 10. Product Enhancements

### Product Areas

- [ ] Create product with multiple areas
- [ ] Each area has location URL
- [ ] Each area has video URL
- [ ] Each area has custom message
- [ ] Customer selects area during checkout
- [ ] Correct area info sent after cooldown

### Product Images

- [ ] Upload product image
- [ ] Image displays on product page
- [ ] Image displays in cart
- [ ] Image displays in order history

---

## 11. Error Handling

### Network Errors

- [ ] Disconnect internet → App shows appropriate error
- [ ] Reconnect → App recovers gracefully

### Invalid Data

- [ ] Submit form with missing fields → Validation errors shown
- [ ] Submit form with invalid data → Error messages clear
- [ ] Try SQL injection in search → Properly sanitized
- [ ] Try XSS in product description → Properly escaped

### 404 Pages

- [ ] Navigate to `/nonexistent-page` → 404 page shown
- [ ] 404 page has link back to home

---

## 12. Performance

### Page Load Times

- [ ] Homepage loads in < 2 seconds
- [ ] Product page loads in < 2 seconds
- [ ] Dashboard loads in < 3 seconds
- [ ] Admin panel loads in < 3 seconds

### Database Queries

- [ ] Check for N+1 query problems (use Prisma logging)
- [ ] Verify indexes exist on frequently queried fields
- [ ] Check slow query log

---

## 13. Mobile Responsiveness

### Mobile View (375px width)

- [ ] Homepage displays correctly
- [ ] Navigation menu works
- [ ] Product cards stack properly
- [ ] Cart is accessible
- [ ] Checkout flow works
- [ ] Forms are usable

### Tablet View (768px width)

- [ ] Layout adapts correctly
- [ ] All features accessible

---

## 14. Browser Compatibility

- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

---

## 15. Security Audit

### Headers

- [ ] Check security headers (use securityheaders.com)
- [ ] CSP header present
- [ ] X-Frame-Options present
- [ ] X-Content-Type-Options present

### Sensitive Data

- [ ] No API keys in client-side code
- [ ] No passwords in logs
- [ ] No sensitive data in error messages
- [ ] Session cookies are httpOnly and secure

---

## Post-Testing

- [ ] All critical bugs documented
- [ ] All test results recorded
- [ ] Screenshots taken of any issues
- [ ] Performance metrics recorded
- [ ] Security vulnerabilities documented

---

## Sign-Off

- [ ] All critical tests passed
- [ ] All high-priority bugs fixed
- [ ] Application ready for deployment

**Tested by:** ******\_\_\_******  
**Date:** ******\_\_\_******  
**Signature:** ******\_\_\_******
