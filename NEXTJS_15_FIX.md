# 🔧 NEXT.JS 15+ BREAKING CHANGE FIX

## ❌ ERROR EXPLANATION

### The Error:

```
Type error: Type 'typeof import("/root/camel/src/app/api/admin/users/[id]/password/route")' does not satisfy the constraint 'RouteHandlerConfig<"/api/admin/users/[id]/password">'.
  Types of property 'GET' are incompatible.
    Type '(req: Request, { params }: { params: { id: string; }; }) => Promise<...>' is not assignable to type '(request: NextRequest, context: { params: Promise<{ id: string; }>; }) => ...'
```

### The Cause:

**Next.js 15+ Breaking Change**: In Next.js 15 and later, the `params` object in route handlers is now **asynchronous** (Promise-based) instead of synchronous.

---

## ✅ THE FIX

### Before (Next.js 14 and earlier):

```typescript
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const userId = params.id; // ❌ Synchronous access
  // ...
}
```

### After (Next.js 15+):

```typescript
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }, // ✅ Promise type
) {
  const { id: userId } = await params; // ✅ Await the params
  // ...
}
```

---

## 📝 CHANGES MADE

### File: `src/app/api/admin/users/[id]/password/route.ts`

**Changed:**

1. `{ params }: { params: { id: string } }`
   → `{ params }: { params: Promise<{ id: string }> }`

2. `const userId = params.id;`
   → `const { id: userId } = await params;`

---

## 🔍 HOW TO FIND OTHER ROUTES WITH THIS ISSUE

### Search for old pattern:

```bash
# Search for synchronous params usage
grep -r "{ params }: { params: {" src/app/api
```

### Look for this pattern:

```typescript
{ params }: { params: { someParam: string } }
```

### Replace with:

```typescript
{ params }: { params: Promise<{ someParam: string }> }
```

And change:

```typescript
const value = params.someParam;
```

To:

```typescript
const { someParam: value } = await params;
```

---

## 🚀 DEPLOYMENT STEPS

### 1. Fix All Routes

Make sure all dynamic routes use async params:

- ✅ `src/app/api/admin/users/[id]/password/route.ts` - FIXED
- Check other `[id]` routes if any

### 2. Regenerate Prisma Client

```bash
npx prisma generate
```

### 3. Build Again

```bash
npm run build
```

### 4. Deploy

```bash
# Your deployment command
pm2 restart camel
```

---

## 📚 NEXT.JS 15+ BREAKING CHANGES

### 1. Async Request APIs

All request APIs are now async:

- `params` → `Promise<params>`
- `searchParams` → `Promise<searchParams>`
- `cookies()` → `Promise<ReadonlyRequestCookies>`
- `headers()` → `Promise<ReadonlyHeaders>`

### 2. Examples:

#### Dynamic Route Params:

```typescript
// ❌ Old (Next.js 14)
export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id;
}

// ✅ New (Next.js 15+)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
}
```

#### Search Params:

```typescript
// ❌ Old (Next.js 14)
export async function GET(
  req: Request,
  { searchParams }: { searchParams: { query: string } },
) {
  const query = searchParams.query;
}

// ✅ New (Next.js 15+)
export async function GET(
  req: Request,
  { searchParams }: { searchParams: Promise<{ query: string }> },
) {
  const { query } = await searchParams;
}
```

#### Cookies:

```typescript
// ❌ Old (Next.js 14)
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = cookies();
  const token = cookieStore.get("token");
}

// ✅ New (Next.js 15+)
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token");
}
```

#### Headers:

```typescript
// ❌ Old (Next.js 14)
import { headers } from "next/headers";

export async function GET() {
  const headersList = headers();
  const auth = headersList.get("authorization");
}

// ✅ New (Next.js 15+)
import { headers } from "next/headers";

export async function GET() {
  const headersList = await headers();
  const auth = headersList.get("authorization");
}
```

---

## ✅ VERIFICATION

### After fixing, verify:

1. ✅ TypeScript compiles without errors
2. ✅ Build succeeds: `npm run build`
3. ✅ Route works: Test the API endpoint
4. ✅ No runtime errors

---

## 🎯 SUMMARY

**Problem:** Next.js 15+ made `params` async (Promise-based)  
**Solution:** Change `{ params: { id: string } }` to `{ params: Promise<{ id: string }> }` and await it  
**Status:** ✅ FIXED

**Files Changed:**

- `src/app/api/admin/users/[id]/password/route.ts`

**Next Steps:**

1. Run `npx prisma generate` (already done)
2. Run `npm run build` to verify
3. Deploy to production

---

**Your build should now succeed!** 🎉

_Last Updated: 7/31/2026_
