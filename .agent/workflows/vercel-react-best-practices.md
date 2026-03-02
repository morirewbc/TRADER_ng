---
description: React and Next.js performance optimization guidelines from Vercel Engineering
---
1. Eliminating Waterfalls (CRITICAL): Defer awaits, use Promise.all() for independent operations, use Suspense for streaming.
2. Bundle Size Optimization (CRITICAL): Avoid barrel files, use dynamic imports for heavy components, defer third-party scripts.
3. Server-Side Performance (HIGH): Cache heavily using React.cache() and LRU, parallelize fetches, minimize serialization.
4. Client-Side Data Fetching (MEDIUM-HIGH): Deduplicate requests using SWR and use passive event listeners.
5. Apply Re-render Optimizations, Rendering best practices, and JS Performance improvements according to the Vercel React guidelines.
