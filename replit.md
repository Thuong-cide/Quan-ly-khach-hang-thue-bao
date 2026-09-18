# Quản lý khách hàng & thuê bao

Ứng dụng giúp người vận hành theo dõi khách hàng, sản phẩm, tài khoản nguồn và thuê bao; hỗ trợ gia hạn, thu hồi, lịch sử thanh toán, nhắc hạn Telegram và xác nhận lệnh qua AI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run test` — run unit tests across packages that define a test script
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Frontend builds default to `BASE_PATH=/` and local ports 5173/5174 when those environment variables are omitted.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/subscription-manager/src/App.tsx` — giao diện dashboard, danh sách và các form thao tác.
- `artifacts/api-server/src/routes/` — API Express cho dashboard, khách hàng, sản phẩm, source account, thuê bao và tích hợp.
- `artifacts/api-server/src/lib/telegram.ts` — webhook Telegram, luồng xác nhận AI và nhắc hạn.
- `lib/api-spec/openapi.yaml` — hợp đồng API duy nhất; chạy codegen sau mỗi thay đổi.
- `lib/db/src/schema/index.ts` — schema PostgreSQL/Drizzle.

## Architecture decisions

- Ứng dụng hiện là workspace một người dùng; không triển khai vai trò nhân viên/quản lý hoặc RBAC nếu chưa có nhu cầu mới.
- `status` được tính theo `end_date` (`active`/`expiring`/`expired`); không dùng status để cắt tài khoản thật.
- `revoked_at` là hành động thủ công; chỉ khi có giá trị này source-account slot mới được giải phóng.
- Gia hạn thuê bao dùng `end_date` cũ khi chưa thu hồi, hoặc ngày hiện tại khi đã thu hồi; sau gia hạn luôn reset `revoked_at`.
- Giao diện dùng generated React Query hooks từ OpenAPI và invalidate cache sau mutation.
- Telegram/AI là tùy chọn qua biến môi trường; app vẫn chạy đầy đủ dashboard khi chưa cấu hình.

## Product

- Dashboard theo dõi số thuê bao, hạn sắp tới, doanh thu và hoạt động gần đây.
- CRUD khách hàng, sản phẩm và tài khoản nguồn kèm theo dõi slot.
- Tạo thuê bao, gia hạn, thu hồi, tìm kiếm/lọc và xem lịch sử gia hạn.
- Webhook Telegram nhận lệnh tự nhiên qua AI Router, hỏi lại trường thiếu và luôn xác nhận trước khi ghi DB.
- Job nhắc hạn Telegram dedupe theo subscription và `end_date` cụ thể.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Dùng `pnpm --filter @workspace/api-spec run codegen` sau khi sửa OpenAPI.
- `DATABASE_URL` cần có khi chạy API hoặc push schema.
- Telegram cần `TELEGRAM_BOT_TOKEN` và `TELEGRAM_CHAT_ID`; AI tùy chọn thêm `AI_ROUTER_BASE_URL`, `AI_ROUTER_API_KEY`, `AI_ROUTER_MODEL`.
- Không đổi `info.title` trong OpenAPI vì nó quyết định đường dẫn file generated.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
