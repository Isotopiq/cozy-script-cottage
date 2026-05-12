## Problem

Clicking the Activity (stats) icon next to a worker navigates to `/admin/workers/<id>`, but the page appears to just reload the workers list. Root cause:

- `src/routes/_authenticated.admin.workers.tsx` declares the path `/admin/workers` and renders the full `AdminWorkers` listing as its `component`.
- `src/routes/_authenticated.admin.workers.$id.tsx` is a child of that route in TanStack's file convention (`workers.$id` nests under `workers`).
- The parent never renders an `<Outlet />`, so when the URL matches the child, the child component is mounted in the tree but has nowhere to render — the user only sees the parent listing.

## Fix

Split the workers route into a tiny pass-through layout plus an index page, which is the standard TanStack pattern for a list + detail pair:

1. Rename `src/routes/_authenticated.admin.workers.tsx` → `src/routes/_authenticated.admin.workers.index.tsx`. Update its `createFileRoute` path from `/_authenticated/admin/workers` to `/_authenticated/admin/workers/`. No other code changes — it stays the listing page at `/admin/workers`.
2. Create a new `src/routes/_authenticated.admin.workers.tsx` that is purely a layout:
   ```tsx
   import { createFileRoute, Outlet } from "@tanstack/react-router";
   export const Route = createFileRoute("/_authenticated/admin/workers")({
     component: () => <Outlet />,
   });
   ```
3. Leave `src/routes/_authenticated.admin.workers.$id.tsx` untouched — it now renders correctly inside the layout's `<Outlet />` at `/admin/workers/<id>`.

`src/routeTree.gen.ts` regenerates automatically; no manual edits needed.

## Why this is safe

- No business logic, queries, RLS, or worker code change.
- The listing component, links, and admin/role checks (`_authenticated/admin` parent layout) remain in place.
- The Activity link `<Link to="/admin/workers/$id" params={{ id: w.id }}>` already uses the correct typed path, so it starts working as soon as the layout has an `<Outlet />`.
- The detail page `_authenticated.admin.workers.$id.tsx` already implements full metrics charts (CPU/mem/disk/net) — just needed somewhere to render.

## Verification

After the change, click the Activity icon on a worker row — the URL becomes `/admin/workers/<uuid>` and the monitor page (with charts and Back button) renders. Clicking Back returns to the list.
