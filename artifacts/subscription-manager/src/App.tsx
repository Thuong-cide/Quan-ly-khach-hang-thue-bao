import { type FormEvent, type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, Archive, ArrowUpRight, Bot, Boxes, CalendarClock, Check, ChevronRight,
  CircleAlert, CircleCheck, Clock3, CreditCard, Database, Edit3, ExternalLink, Facebook,
  LayoutDashboard, LifeBuoy, Menu, Package, Plus, RefreshCw, Search,
  Send, Settings2, ShieldCheck, SlidersHorizontal, Users,
  X, Zap,
} from 'lucide-react';
import {
  getGetCustomerQueryKey, getGetDashboardActivityQueryKey, getGetDashboardSummaryQueryKey,
  getGetSubscriptionHistoryQueryKey, getGetSubscriptionQueryKey, getListCustomersQueryKey,
  getListProductsQueryKey, getListSourceAccountsQueryKey, getListSubscriptionsQueryKey,
  useCreateCustomer, useCreateProduct, useCreateSourceAccount, useCreateSubscription,
  useGetCustomer, useGetDashboardActivity, useGetDashboardSummary, useGetIntegrationsStatus,
  useGetSubscription, useGetSubscriptionHistory, useListCustomers, useListProducts,
  useListSourceAccounts, useListSubscriptions, useRenewSubscription, useRevokeSubscription,
  useUpdateCustomer, useUpdateProduct, useUpdateSourceAccount,
  type Customer, type Product, type SourceAccount, type Subscription,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Route, Switch, Link, Router as WouterRouter, useLocation, useParams } from 'wouter';
import './index.css';

const queryClient = new QueryClient();
const money = (value?: number | null) => value == null ? '—' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—';
const relative = (value?: string | null) => value ? new Intl.RelativeTimeFormat('vi', { numeric: 'auto' }).format(Math.round((new Date(value).getTime() - Date.now()) / 86400000), 'day') : '—';
const statusLabels: Record<string, string> = { active: 'Đang hoạt động', expiring: 'Sắp hết hạn', expired: 'Đã hết hạn', archived: 'Đã thu hồi' };
const subscriptionStatuses = ['all', 'active', 'expiring', 'expired', 'archived'] as const;
type SubscriptionFilter = typeof subscriptionStatuses[number];

function initialSubscriptionStatus(): SubscriptionFilter {
  const value = new URLSearchParams(window.location.search).get('status');
  return subscriptionStatuses.includes(value as SubscriptionFilter) ? value as SubscriptionFilter : 'all';
}

function addDaysToDateInput(value: string, days?: number | null): string {
  if (!value || !days) return '';
  const result = new Date(`${value}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function mutationErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Không thể hoàn tất thao tác. Vui lòng thử lại.';
  return error.message.replace(/^HTTP \d+ [^:]+:\s*/, '');
}

function StatusPill({ status }: { status: string }) {
  const label = statusLabels[status] || status;
  return <span data-testid={`status-${status}`} className={`status-pill status-${status}`}><span className="status-dot" />{label}</span>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div data-testid="loading-skeleton" className={`animate-pulse rounded-md bg-muted/70 ${className}`} />;
}

function Empty({ icon: Icon, title, detail, action }: { icon: typeof Boxes; title: string; detail: string; action?: ReactNode }) {
  return <div data-testid="empty-state" className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed hairline bg-card/50 px-6 text-center">
    <div className="mb-3 rounded-full bg-secondary p-3 text-primary"><Icon size={19} /></div>
    <p className="font-semibold">{title}</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">{detail}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

function ErrorState({ retry }: { retry: () => void }) {
  return <div data-testid="error-state" className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
    <CircleAlert size={21} className="text-destructive" /><p className="mt-3 font-semibold">Không thể tải dữ liệu</p>
    <p className="mt-1 text-sm text-muted-foreground">Máy chủ không phản hồi. Dữ liệu của bạn vẫn an toàn.</p>
    <button data-testid="button-retry" onClick={retry} className="button button-ghost mt-4"><RefreshCw size={14} /> Thử lại</button>
  </div>;
}

function MutationError({ error }: { error: unknown }) {
  if (!error) return null;
  return <div role="alert" className="callout callout-danger mt-4"><CircleAlert size={17} /><p>{mutationErrorMessage(error)}</p></div>;
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className={`modal ${wide ? 'modal-wide' : ''}`}>
      <div className="flex items-start justify-between border-b hairline px-5 py-4 sm:px-6">
         <div><p className="eyebrow text-primary">{eyebrow || 'Thao tác'}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2></div>
         <button data-testid="button-close-modal" aria-label="Đóng hộp thoại" onClick={onClose} className="icon-button"><X size={17} /></button>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  </div>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function FormActions({ onCancel, saving, label = 'Lưu thay đổi' }: { onCancel: () => void; saving?: boolean; label?: string }) {
  return <div className="mt-6 flex justify-end gap-2 border-t hairline pt-4"><button type="button" data-testid="button-cancel" onClick={onCancel} className="button button-ghost">Hủy</button><button data-testid="button-submit" disabled={saving} className="button button-primary">{saving ? 'Đang lưu…' : <><Check size={15} /> {label}</>}</button></div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const nav = [
    { href: '/', label: 'Tổng quan', icon: LayoutDashboard },
    { href: '/subscriptions', label: 'Thuê bao', icon: CreditCard },
    { href: '/customers', label: 'Khách hàng', icon: Users },
    { href: '/source-accounts', label: 'Tài khoản nguồn', icon: Database },
    { href: '/products', label: 'Sản phẩm', icon: Package },
  ];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand"><div className="brand-mark">S</div><div><div className="brand-name">stackline</div><div className="brand-caption">operator console</div></div></div>
       <div className="sidebar-kicker eyebrow">Không gian làm việc</div>
      <nav className="sidebar-nav">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`} className={`nav-item ${location === href ? 'is-active' : ''}`}><Icon size={17} /><span>{label}</span>{location === href && <ChevronRight size={14} className="ml-auto opacity-70" />}</Link>)}</nav>
       <div className="sidebar-kicker eyebrow mt-7">Hệ thống</div>
       <Link href="/settings" onClick={() => setMobileOpen(false)} data-testid="link-settings" className={`nav-item ${location === '/settings' ? 'is-active' : ''}`}><Settings2 size={17} /><span>Cài đặt</span></Link>
      <div className="sidebar-spacer" />
       <div className="sidebar-footer"><div className="health-mark"><span /><div><strong>Hệ thống ổn định</strong><small>Đồng bộ vừa xong</small></div></div><div className="sidebar-user"><div className="avatar">NV</div><div><strong>Nhân viên</strong><small>Không gian đại lý</small></div><SlidersHorizontal size={15} className="ml-auto opacity-50" /></div></div>
    </aside>
    <main className="main-area">
     <header className="topbar"><button data-testid="button-mobile-menu" aria-label="Mở menu" onClick={() => setMobileOpen(!mobileOpen)} className="icon-button md:hidden"><Menu size={19} /></button><div className="breadcrumb"><span className="eyebrow">Stackline</span><ChevronRight size={13} /><span>{location === '/' ? 'Tổng quan' : nav.find((item) => item.href === location)?.label || 'Cài đặt'}</span></div><div className="topbar-tools"><span className="sync-chip"><span className="sync-pulse" /> Không gian trực tuyến</span><button data-testid="button-help" aria-label="Trợ giúp" onClick={() => setHelpOpen(true)} className="icon-button"><LifeBuoy size={17} /></button></div></header>
      <div className="page-wrap">{children}</div>
    </main>
    <nav className="mobile-nav">{nav.slice(0, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`mobile-link-${label.toLowerCase()}`} className={`mobile-nav-item ${location === href ? 'active' : ''}`}><Icon size={17} /><span>{label.split(' ')[0]}</span></Link>)}</nav>
    {helpOpen && <Modal title="Phím tắt vận hành" eyebrow="Gọn gàng, rõ ràng" onClose={() => setHelpOpen(false)}><div className="space-y-3 text-sm text-muted-foreground"><p><strong className="text-foreground">Kiểm tra hạn</strong> từ trang Tổng quan mỗi sáng, sau đó gia hạn hoặc thu hồi ngay trong bảng chi tiết.</p><p><strong className="text-foreground">Sức chứa nguồn</strong> hiển thị theo slot để bạn biết tài khoản nào còn chỗ cấp thuê bao mới.</p><button data-testid="button-close-help" onClick={() => setHelpOpen(false)} className="button button-primary mt-2">Đã hiểu</button></div></Modal>}
  </div>;
}

function PageHeading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow text-primary">{eyebrow}</p><h1>{title}</h1><p className="page-detail">{detail}</p></div>{action && <div className="page-heading-action">{action}</div>}</div>;
}

function Dashboard() {
  const summary = useGetDashboardSummary();
  const activity = useGetDashboardActivity({ limit: 8 });
  if (summary.isLoading) return <DashboardSkeleton />;
  if (summary.isError || !summary.data) return <ErrorState retry={() => { summary.refetch(); activity.refetch(); }} />;
  const data = summary.data;
  return <div className="fade-up">
    <PageHeading eyebrow="Thứ hai · trung tâm điều hành" title="Chào buổi sáng, nhân viên." detail="Tổng quan nhanh về việc cần xử lý và những việc đã hoàn tất." action={<Link href="/subscriptions" data-testid="link-review-subscriptions" className="button button-primary"><ArrowUpRight size={16} /> Xem thuê bao</Link>} />
    <section className="metric-grid">
      <Metric label="Thuê bao đang hoạt động" value={data.activeSubscriptions} note={`${data.totalCustomers} khách hàng đang sử dụng`} icon={CreditCard} accent="coral" />
      <Metric label="Hết hạn trong 7 ngày" value={data.expiringSubscriptions} note="Đẩy nhanh việc gia hạn" icon={CalendarClock} accent="lime" href="/subscriptions?status=expiring" />
      <Metric label="Doanh thu tháng này" value={money(data.revenueThisMonth)} note={`${money(data.totalRevenue)} tổng doanh thu`} icon={Zap} accent="teal" />
      <Metric label="Đã hết hạn / thu hồi" value={data.expiredSubscriptions + data.revokedSubscriptions} note="Lưu trữ hoặc chăm sóc lại" icon={Archive} accent="ink" />
    </section>
    <div className="dashboard-grid">
      <section className="panel upcoming-panel">
         <div className="panel-heading"><div><p className="eyebrow">Tiếp theo</p><h2>Thuê bao sắp hết hạn</h2></div><Link href="/subscriptions" data-testid="link-view-all-expirations" className="text-link">Xem tất cả <ArrowUpRight size={14} /></Link></div>
         {data.upcoming?.length ? <div className="upcoming-list">{data.upcoming.slice(0, 6).map((item) => <Link href={`/subscriptions/${item.id}`} data-testid={`row-upcoming-${item.id}`} className="upcoming-row" key={item.id}><div className="date-tile"><span>{new Date(item.endDate).toLocaleDateString('vi-VN', { month: 'short' })}</span><strong>{new Date(item.endDate).getDate()}</strong></div><div className="min-w-0 flex-1"><div className="row-title">{item.customerName}</div><div className="row-meta">{item.productName} <span>·</span> {item.sourceAccountEmail || 'Chưa gán nguồn'}</div></div><div className="row-end"><strong className={item.daysRemaining <= 7 ? 'text-primary' : ''}>{item.daysRemaining} ngày</strong><span>{money(item.price)}</span></div><ChevronRight size={15} className="text-muted-foreground" /></Link>)}</div> : <Empty icon={CalendarClock} title="Chưa có thuê bao sắp hết hạn" detail="30 ngày tới đang trống. Các thuê bao mới sẽ xuất hiện ở đây." />}
      </section>
      <section className="panel activity-panel">
         <div className="panel-heading"><div><p className="eyebrow">Nhật ký hoạt động</p><h2>Hoạt động gần đây</h2></div><Activity size={17} className="text-muted-foreground" /></div>
         {activity.isLoading ? <div className="space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : activity.data?.length ? <div className="activity-list">{activity.data.map((item) => <div data-testid={`activity-item-${item.id}`} className="activity-row" key={item.id}><div className={`activity-icon activity-${item.type}`}>{item.type === 'renewed' ? <RefreshCw size={14} /> : item.type === 'revoked' ? <X size={14} /> : item.type === 'expiring' ? <Clock3 size={14} /> : <Plus size={14} />}</div><div className="min-w-0 flex-1"><div className="row-title truncate">{item.title}</div><div className="row-meta truncate">{item.description}</div></div><time className="mono text-[10px] text-muted-foreground">{relative(item.timestamp)}</time></div>)}</div> : <Empty icon={Activity} title="Chưa có hoạt động gần đây" detail="Thuê bao mới, gia hạn và thu hồi sẽ xuất hiện ở đây." />}
      </section>
    </div>
     <section className="panel health-panel"><div className="flex items-center gap-3"><div className="health-orb"><ShieldCheck size={18} /></div><div><p className="eyebrow">Sức khỏe hệ thống</p><h2>Mọi thứ đang trong tầm kiểm soát.</h2></div></div><div className="health-stats"><span><strong>{data.activeSubscriptions}</strong> đang hoạt động</span><span><strong>{data.statusBreakdown?.length || 0}</strong> nhóm trạng thái</span><span><strong>{data.totalCustomers}</strong> khách hàng</span></div></section>
  </div>;
}

function DashboardSkeleton() {
  return <div className="space-y-6"><Skeleton className="h-28 w-2/3" /><div className="metric-grid">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}</div><div className="dashboard-grid"><Skeleton className="h-96" /><Skeleton className="h-96" /></div></div>;
}

function Metric({ label, value, note, icon: Icon, accent, href }: { label: string; value: ReactNode; note: string; icon: typeof Zap; accent: string; href?: string }) {
  const body = <><div className={`metric-icon metric-${accent}`}><Icon size={17} /></div><div className="mt-5"><p className="metric-label">{label}</p><p data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`} className="metric-value">{value}</p><p className="metric-note">{note}</p></div></>;
  return href ? <Link href={href} data-testid={`metric-link-${accent}`} className="metric-card lift">{body}<ArrowUpRight size={15} className="metric-arrow" /></Link> : <div className="metric-card">{body}</div>;
}

function Subscriptions({ initialId, onCloseDetail }: { initialId?: number; onCloseDetail?: () => void }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<SubscriptionFilter>(initialSubscriptionStatus);
  const [sort, setSort] = useState('end_date');
  const [modal, setModal] = useState<'create' | 'renew' | 'revoke' | null>(null);
  const [selected, setSelected] = useState<number | null>(initialId ?? null);
  const query = useListSubscriptions({ search: search || undefined, status, sort: sort as 'end_date' | 'created_at' | 'customer' });
  const detail = useGetSubscription(selected || 0, { query: { enabled: !!selected, queryKey: getGetSubscriptionQueryKey(selected || 0) } });
  const subscriptions = query.data || [];
  return <div className="fade-up">
    <PageHeading eyebrow="Theo dõi doanh thu" title="Thuê bao" detail="Theo dõi từng suất dùng, kỳ gia hạn và tài khoản nguồn." action={<button data-testid="button-create-subscription" onClick={() => setModal('create')} className="button button-primary"><Plus size={16} /> Tạo thuê bao</button>} />
     <div className="toolbar"><div className="search-wrap"><Search size={16} /><input data-testid="input-subscription-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm khách hàng, sản phẩm hoặc email" /></div><div className="filter-tabs">{subscriptionStatuses.map((item) => <button key={item} data-testid={`filter-${item}`} onClick={() => setStatus(item)} className={`filter-tab ${status === item ? 'active' : ''}`}>{item === 'all' ? 'Tất cả thuê bao' : statusLabels[item]}</button>)}</div><select data-testid="select-subscription-sort" className="select compact-select" value={sort} onChange={(e) => setSort(e.target.value)}><option value="end_date">Sắp hết hạn trước</option><option value="created_at">Mới tạo gần đây</option><option value="customer">Khách hàng A–Z</option></select></div>
     <section className="panel table-panel">{query.isLoading ? <TableSkeleton /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : subscriptions.length ? <div className="mobile-scroll"><table className="data-table"><thead><tr><th>Khách hàng</th><th>Sản phẩm</th><th>Tài khoản nguồn</th><th>Ngày hết hạn</th><th>Trạng thái</th><th className="text-right">Giá trị</th><th /></tr></thead><tbody>{subscriptions.map((item) => <tr data-testid={`row-subscription-${item.id}`} key={item.id} onClick={() => setSelected(item.id)} className="clickable-row"><td><div className="table-primary">{item.customerName}</div><div className="table-secondary">{item.customerContact || 'Chưa có liên hệ'}</div></td><td><div className="table-primary">{item.productName}</div><div className="table-secondary mono">#{String(item.id).padStart(4, '0')}</div></td><td><div className="table-primary max-w-44 truncate">{item.sourceAccountEmail || 'Chưa gán'}</div><div className="table-secondary">{item.sourceAccountId ? 'Đã gán nguồn' : 'Cần gán nguồn'}</div></td><td><div className="table-primary">{date(item.endDate)}</div><div className={`table-secondary ${item.daysRemaining <= 7 ? 'text-primary' : ''}`}>{item.daysRemaining < 0 ? 'Đã hết hạn' : `Còn ${item.daysRemaining} ngày`}</div></td><td><StatusPill status={item.status} /></td><td className="text-right"><span className="table-primary">{money(item.price)}</span></td><td className="text-right"><ChevronRight size={15} className="text-muted-foreground" /></td></tr>)}</tbody></table></div> : <Empty icon={CreditCard} title="Không tìm thấy thuê bao" detail={search ? `Không có kết quả cho “${search}”. Hãy thử từ khóa rộng hơn.` : 'Tạo thuê bao đầu tiên để bắt đầu theo dõi doanh thu.'} action={!search ? <button data-testid="button-empty-create-subscription" onClick={() => setModal('create')} className="button button-primary"><Plus size={15} /> Tạo thuê bao</button> : undefined} />}</section>
    {selected && <SubscriptionDrawer subscription={detail.data} loading={detail.isLoading} error={detail.isError} retry={() => detail.refetch()} onClose={() => { setSelected(null); onCloseDetail?.(); }} onRenew={() => setModal('renew')} onRevoke={() => setModal('revoke')} />}
    {modal === 'create' && <SubscriptionForm onClose={() => setModal(null)} />}
    {modal === 'renew' && selected && <RenewModal id={selected} onClose={() => setModal(null)} />}
    {modal === 'revoke' && selected && <RevokeModal id={selected} onClose={() => setModal(null)} />}
  </div>;
}

function TableSkeleton() { return <div className="space-y-4 p-5">{[1, 2, 3, 4, 5].map((i) => <div className="flex gap-4" key={i}><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-28" /><Skeleton className="h-10 w-20" /></div>)}</div>; }

function SubscriptionDrawer({ subscription, loading, error, retry, onClose, onRenew, onRevoke }: { subscription?: Subscription & { history?: unknown[] }; loading: boolean; error: boolean; retry: () => void; onClose: () => void; onRenew: () => void; onRevoke: () => void }) {
  const history = useGetSubscriptionHistory(subscription?.id || 0, { query: { enabled: !!subscription?.id, queryKey: getGetSubscriptionHistoryQueryKey(subscription?.id || 0) } });
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-top"><div><p className="eyebrow text-primary">Chi tiết thuê bao</p><h2>{loading ? 'Đang tải…' : subscription?.customerName || 'Không tìm thấy thuê bao'}</h2><p className="text-sm text-muted-foreground">{subscription?.productName}</p></div><button data-testid="button-close-subscription" aria-label="Đóng chi tiết thuê bao" onClick={onClose} className="icon-button"><X size={17} /></button></div>{loading ? <div className="space-y-4 p-6"><Skeleton className="h-20" /><Skeleton className="h-40" /></div> : error ? <div className="p-6"><ErrorState retry={retry} /></div> : subscription && <div className="drawer-content"><div className="drawer-actions"><StatusPill status={subscription.status} /><button data-testid="button-renew-subscription" onClick={onRenew} className="button button-primary ml-auto"><RefreshCw size={14} /> Gia hạn</button>{subscription.status !== 'archived' && <button data-testid="button-revoke-subscription" onClick={onRevoke} className="button button-danger"><X size={14} /> Thu hồi</button>}</div><div className="detail-grid"><DetailCell label="Khách hàng" value={subscription.customerName} /><DetailCell label="Liên hệ" value={subscription.customerContact || 'Chưa ghi nhận'} /><DetailCell label="Ngày bắt đầu" value={date(subscription.startDate)} /><DetailCell label="Ngày hết hạn" value={date(subscription.endDate)} /><DetailCell label="Tài khoản nguồn" value={subscription.sourceAccountEmail || 'Chưa gán'} /><DetailCell label="Giá" value={money(subscription.price)} /></div><div className="drawer-section"><div className="panel-heading"><div><p className="eyebrow">Lịch sử</p><h3>Lịch sử gia hạn</h3></div><span className="mono text-xs text-muted-foreground">{history.data?.length || 0} lần</span></div>{history.isLoading ? <Skeleton className="h-16" /> : history.data?.length ? <div className="history-list">{history.data.map((event) => <div className="history-row" key={event.id}><div className="history-dot" /><div className="flex-1"><div className="table-primary">+{event.daysAdded} ngày <span className="text-muted-foreground font-normal">· {money(event.amountPaid)}</span></div><div className="table-secondary">{date(event.renewedAt)}{event.note ? ` · ${event.note}` : ''}</div></div><span className="mono text-[10px] text-muted-foreground">{event.gapDays > 0 ? `Trễ ${event.gapDays} ngày` : 'Liên tục'}</span></div>)}</div> : <p className="empty-inline">Chưa có lần gia hạn nào.</p>}</div></div>}</aside></div>;
}

function DetailCell({ label, value }: { label: string; value: string }) { return <div className="detail-cell"><span className="eyebrow">{label}</span><strong>{value}</strong></div>; }

function SubscriptionForm({ onClose }: { onClose: () => void }) {
  const customers = useListCustomers({ limit: 100 });
  const products = useListProducts();
  const sources = useListSourceAccounts();
  const create = useCreateSubscription();
  const [form, setForm] = useState({ customerId: '', productId: '', sourceAccountId: '', startDate: new Date().toISOString().slice(0, 10), endDate: '', price: '' });
  const selectedProduct = products.data?.find((p) => p.id === Number(form.productId));
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const selectProduct = (productId: string) => {
    const product = products.data?.find((item) => item.id === Number(productId));
    setForm((old) => ({
      ...old,
      productId,
      sourceAccountId: '',
      endDate: addDaysToDateInput(old.startDate, product?.defaultDurationDays),
    }));
  };
  const selectStartDate = (startDate: string) => setForm((old) => ({
    ...old,
    startDate,
    endDate: addDaysToDateInput(startDate, selectedProduct?.defaultDurationDays) || old.endDate,
  }));
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate({ data: { customerId: Number(form.customerId), productId: Number(form.productId), sourceAccountId: form.sourceAccountId ? Number(form.sourceAccountId) : null, startDate: form.startDate, endDate: form.endDate, price: form.price ? Number(form.price) : selectedProduct?.defaultPrice ?? null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }); onClose(); } }); };
  return <Modal title="Tạo thuê bao" eyebrow="Theo dõi doanh thu" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Khách hàng"><select required data-testid="select-subscription-customer" className="select" value={form.customerId} onChange={(e) => set('customerId', e.target.value)}><option value="">Chọn khách hàng</option>{customers.data?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Sản phẩm"><select required data-testid="select-subscription-product" className="select" value={form.productId} onChange={(e) => selectProduct(e.target.value)}><option value="">Chọn sản phẩm</option>{products.data?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Tài khoản nguồn" hint="Chỉ hiển thị tài khoản đúng sản phẩm và còn slot."><select data-testid="select-subscription-source" className="select" value={form.sourceAccountId} onChange={(e) => set('sourceAccountId', e.target.value)}><option value="">Để trống</option>{sources.data?.filter((item) => (!form.productId || item.productId === Number(form.productId)) && item.availableSlots > 0).map((item) => <option value={item.id} key={item.id}>{item.email} · còn {item.availableSlots} slot</option>)}</select></Field><Field label="Giá" hint={selectedProduct?.defaultPrice ? `Giá mặc định: ${money(selectedProduct.defaultPrice)}` : undefined}><input data-testid="input-subscription-price" className="input" type="number" min="0" step="1" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0" /></Field><Field label="Ngày bắt đầu"><input required data-testid="input-subscription-start" className="input" type="date" value={form.startDate} onChange={(e) => selectStartDate(e.target.value)} /></Field><Field label="Ngày hết hạn" hint={selectedProduct?.defaultDurationDays ? `Tự động tính theo ${selectedProduct.defaultDurationDays} ngày mặc định.` : undefined}><input required data-testid="input-subscription-end" className="input" type="date" min={addDaysToDateInput(form.startDate, 1)} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field></div><MutationError error={create.error} /><FormActions onCancel={onClose} saving={create.isPending} label="Tạo thuê bao" /></form></Modal>;
}

function RenewModal({ id, onClose }: { id: number; onClose: () => void }) {
  const renew = useRenewSubscription();
  const [form, setForm] = useState({ daysAdded: '30', amountPaid: '', note: '' });
  const submit = (event: FormEvent) => { event.preventDefault(); renew.mutate({ id, data: { daysAdded: Number(form.daysAdded), amountPaid: form.amountPaid ? Number(form.amountPaid) : null, note: form.note || null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetSubscriptionHistoryQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }); onClose(); } }); };
  return <Modal title="Ghi nhận gia hạn" eyebrow="Duy trì thuê bao" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Số ngày cộng thêm"><input required data-testid="input-renew-days" className="input" type="number" min="1" value={form.daysAdded} onChange={(e) => setForm({ ...form, daysAdded: e.target.value })} /></Field><Field label="Số tiền đã thu"><input data-testid="input-renew-amount" className="input" type="number" min="0" step="1" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} placeholder="0" /></Field><Field label="Ghi chú"><textarea data-testid="input-renew-note" className="textarea" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Thông tin cần lưu cho lần sau" /></Field></div><MutationError error={renew.error} /><FormActions onCancel={onClose} saving={renew.isPending} label="Ghi nhận gia hạn" /></form></Modal>;
}

function RevokeModal({ id, onClose }: { id: number; onClose: () => void }) {
  const revoke = useRevokeSubscription();
  const [note, setNote] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); revoke.mutate({ id, data: { note: note || null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }); onClose(); } }); };
  return <Modal title="Thu hồi thuê bao" eyebrow="Thao tác này không thể hoàn tác" onClose={onClose}><form onSubmit={submit}><div className="callout callout-danger"><CircleAlert size={17} /><p>Thu hồi sẽ giải phóng slot tài khoản nguồn và loại thuê bao này khỏi doanh thu đang hoạt động.</p></div><Field label="Lý do / ghi chú"><textarea data-testid="input-revoke-note" className="textarea mt-2" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vì sao cần thu hồi thuê bao này?" /></Field><MutationError error={revoke.error} /><FormActions onCancel={onClose} saving={revoke.isPending} label="Thu hồi thuê bao" /></form></Modal>;
}

function Customers() {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const query = useListCustomers({ search: search || undefined, limit: 100 });
  const detail = useGetCustomer(selected || 0, { query: { enabled: !!selected, queryKey: getGetCustomerQueryKey(selected || 0) } });
  return <div className="fade-up"><PageHeading eyebrow="Hồ sơ khách hàng" title="Khách hàng" detail="Thông tin liên hệ và lịch sử thuê bao của từng khách hàng." action={<button data-testid="button-create-customer" onClick={() => setModal('create')} className="button button-primary"><Plus size={16} /> Thêm khách hàng</button>} /><div className="toolbar"><div className="search-wrap"><Search size={16} /><input data-testid="input-customer-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm theo tên hoặc thông tin liên hệ" /></div><span className="toolbar-count mono">{query.data?.length || 0} khách hàng</span></div><section className="panel table-panel">{query.isLoading ? <TableSkeleton /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : query.data?.length ? <div className="customer-grid">{query.data.map((item) => <button data-testid={`card-customer-${item.id}`} className="customer-card lift" key={item.id} onClick={() => setSelected(item.id)}><div className="customer-card-top"><div className="avatar avatar-large">{item.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><Edit3 size={15} className="text-muted-foreground" /></div><div className="customer-name">{item.name}</div><div className="customer-contact">{item.email || item.zalo || item.facebook || item.contact || 'Chưa có thông tin liên hệ'}</div><div className="customer-card-bottom"><span><strong>{item.subscriptionCount}</strong> thuê bao</span><span className="mono">{date(item.createdAt)}</span></div></button>)}</div> : <Empty icon={Users} title="Chưa có khách hàng" detail="Thêm khách hàng trước khi tạo thuê bao đầu tiên." action={<button data-testid="button-empty-create-customer" onClick={() => setModal('create')} className="button button-primary"><Plus size={15} /> Thêm khách hàng</button>} />}</section>{selected && <CustomerDrawer customer={detail.data} loading={detail.isLoading} onClose={() => setSelected(null)} onEdit={() => setModal('edit')} />}{modal && <CustomerForm customer={modal === 'edit' ? detail.data : undefined} onClose={() => setModal(null)} />}</div>;
}

function CustomerDrawer({ customer, loading, onClose, onEdit }: { customer?: Customer & { subscriptions?: Subscription[] }; loading: boolean; onClose: () => void; onEdit: () => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-top"><div><p className="eyebrow text-primary">Hồ sơ khách hàng</p><h2>{loading ? 'Đang tải…' : customer?.name}</h2><p className="text-sm text-muted-foreground">{customer?.email || customer?.zalo || customer?.facebook || customer?.contact || 'Chưa có thông tin liên hệ'}</p></div><button data-testid="button-close-customer" aria-label="Đóng hồ sơ khách hàng" onClick={onClose} className="icon-button"><X size={17} /></button></div>{loading ? <div className="space-y-4 p-6"><Skeleton className="h-20" /><Skeleton className="h-40" /></div> : customer && <div className="drawer-content"><button data-testid="button-edit-customer" onClick={onEdit} className="button button-outline w-full"><Edit3 size={14} /> Chỉnh sửa khách hàng</button><div className="detail-grid customer-contact-grid"><DetailCell label="Email" value={customer.email || 'Chưa cập nhật'} /><DetailCell label="Zalo" value={customer.zalo || 'Chưa cập nhật'} /><DetailCell label="Facebook" value={customer.facebook || 'Chưa cập nhật'} /><DetailCell label="Liên hệ khác" value={customer.contact || 'Chưa cập nhật'} /></div>{customer.note && <div className="note-block"><p className="eyebrow">Ghi chú nội bộ</p><p>{customer.note}</p></div>}<div className="drawer-section"><div className="panel-heading"><div><p className="eyebrow">Tổng quan doanh thu</p><h3>Thuê bao</h3></div><span className="mono text-xs text-muted-foreground">{customer.subscriptions?.length || 0} thuê bao</span></div>{customer.subscriptions?.length ? <div className="history-list">{customer.subscriptions.map((item) => <Link href={`/subscriptions/${item.id}`} className="history-row" key={item.id}><div className="history-dot" /><div className="flex-1"><div className="table-primary">{item.productName}</div><div className="table-secondary">Hết hạn {date(item.endDate)}</div></div><StatusPill status={item.status} /></Link>)}</div> : <p className="empty-inline">Khách hàng này chưa có thuê bao.</p>}</div></div>}</aside></div>;
}

function CustomerForm({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const isEdit = !!customer;
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const [form, setForm] = useState({ name: customer?.name || '', email: customer?.email || '', zalo: customer?.zalo || '', facebook: customer?.facebook || '', contact: customer?.contact || '', note: customer?.note || '' });
  const submit = (event: FormEvent) => { event.preventDefault(); const data = { name: form.name, email: form.email || null, zalo: form.zalo || null, facebook: form.facebook || null, contact: form.contact || null, note: form.note || null }; if (isEdit) update.mutate({ id: customer.id, data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(customer.id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); onClose(); } }); else create.mutate({ data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); onClose(); } }); };
  return <Modal title={isEdit ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng'} eyebrow="Hồ sơ khách hàng" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Họ và tên"><input required data-testid="input-customer-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Nguyễn Minh Anh" /></Field><Field label="Email"><input data-testid="input-customer-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="khachhang@example.com" /></Field><Field label="Zalo"><input data-testid="input-customer-zalo" className="input" value={form.zalo} onChange={(e) => setForm({ ...form, zalo: e.target.value })} placeholder="Số điện thoại hoặc tên Zalo" /></Field><Field label="Facebook"><input data-testid="input-customer-facebook" className="input" value={form.facebook} onChange={(e) => setForm({ ...form, facebook: e.target.value })} placeholder="https://facebook.com/..." /></Field><Field label="Liên hệ khác"><input data-testid="input-customer-contact" className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Số điện thoại hoặc kênh liên hệ khác" /></Field><Field label="Ghi chú nội bộ"><textarea data-testid="input-customer-note" className="textarea" rows={4} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Thông tin hữu ích cho lần gia hạn sau" /></Field></div><MutationError error={isEdit ? update.error : create.error} /><FormActions onCancel={onClose} saving={create.isPending || update.isPending} label={isEdit ? 'Lưu khách hàng' : 'Tạo khách hàng'} /></form></Modal>;
}

function SourceAccounts() {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<SourceAccount | undefined>();
  const query = useListSourceAccounts({ search: search || undefined });
  const products = useListProducts();
  return <div className="fade-up"><PageHeading eyebrow="Quản lý nguồn" title="Tài khoản nguồn" detail="Biết chính xác tài khoản nào còn slot để cấp thuê bao." action={<button data-testid="button-create-source-account" onClick={() => { setSelected(undefined); setModal('create'); }} className="button button-primary"><Plus size={16} /> Thêm tài khoản nguồn</button>} /><div className="toolbar"><div className="search-wrap"><Search size={16} /><input data-testid="input-source-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm email hoặc sản phẩm" /></div><span className="toolbar-count mono">{query.data?.length || 0} tài khoản</span></div>{query.isLoading ? <TableSkeleton /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : query.data?.length ? <div className="source-grid">{query.data.map((item) => <SourceCard account={item} key={item.id} onEdit={() => { setSelected(item); setModal('edit'); }} />)}</div> : <Empty icon={Database} title="Chưa có tài khoản nguồn" detail="Thêm các tài khoản dùng để cấp thuê bao và theo dõi số slot tại đây." action={<button data-testid="button-empty-create-source-account" onClick={() => setModal('create')} className="button button-primary"><Plus size={15} /> Thêm tài khoản nguồn</button>} />}{modal && <SourceForm products={products.data || []} account={selected} onClose={() => setModal(null)} />}</div>;
}

function SourceCard({ account, onEdit }: { account: SourceAccount; onEdit: () => void }) {
  const usage = account.maxSlots ? Math.min(100, (account.usedSlots / account.maxSlots) * 100) : 0;
  return <section data-testid={`card-source-account-${account.id}`} className="source-card panel lift"><div className="source-card-head"><div className="source-icon"><Database size={17} /></div><button data-testid={`button-edit-source-${account.id}`} aria-label="Chỉnh sửa tài khoản nguồn" onClick={onEdit} className="icon-button"><Edit3 size={15} /></button></div><p className="eyebrow mt-4 text-primary">{account.productName}</p><h3 className="source-email">{account.email}</h3><div className="slot-line"><span><strong>{account.availableSlots}</strong> slot trống</span><span className="mono">{account.usedSlots}/{account.maxSlots}</span></div><div className="slot-track"><div style={{ width: `${usage}%` }} /></div><div className="source-foot"><span>{account.expiresAt ? `Hết hạn ${date(account.expiresAt)}` : 'Chưa đặt hạn'}</span><span className={account.availableSlots === 0 ? 'text-primary' : ''}>{account.availableSlots === 0 ? 'Đã đầy' : 'Sẵn sàng'}</span></div></section>;
}

function SourceForm({ products, account, onClose }: { products: Product[]; account?: SourceAccount; onClose: () => void }) {
  const isEdit = !!account;
  const create = useCreateSourceAccount();
  const update = useUpdateSourceAccount();
  const [form, setForm] = useState({ productId: account?.productId?.toString() || '', email: account?.email || '', maxSlots: account?.maxSlots?.toString() || '5', expiresAt: account?.expiresAt?.slice(0, 10) || '', note: account?.note || '' });
  const submit = (event: FormEvent) => { event.preventDefault(); if (isEdit) update.mutate({ id: account.id, data: { email: form.email, maxSlots: Number(form.maxSlots), expiresAt: form.expiresAt || null, note: form.note || null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSourceAccountsQueryKey() }); onClose(); } }); else create.mutate({ data: { productId: Number(form.productId), email: form.email, maxSlots: Number(form.maxSlots), expiresAt: form.expiresAt || null, note: form.note || null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSourceAccountsQueryKey() }); queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); } }); };
  return <Modal title={isEdit ? 'Chỉnh sửa tài khoản nguồn' : 'Thêm tài khoản nguồn'} eyebrow="Quản lý nguồn" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Sản phẩm"><select required disabled={isEdit} data-testid="select-source-product" className="select" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Chọn sản phẩm</option>{products.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Email tài khoản"><input required data-testid="input-source-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="nguon@example.com" /></Field><Field label="Số slot tối đa"><input required data-testid="input-source-slots" className="input" type="number" min={account?.usedSlots || 1} value={form.maxSlots} onChange={(e) => setForm({ ...form, maxSlots: e.target.value })} /></Field><Field label="Ngày hết hạn"><input data-testid="input-source-expiry" className="input" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field><Field label="Ghi chú nội bộ"><textarea data-testid="input-source-note" className="textarea" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Thông tin truy cập hoặc thanh toán" /></Field></div><MutationError error={isEdit ? update.error : create.error} /><FormActions onCancel={onClose} saving={create.isPending || update.isPending} label={isEdit ? 'Lưu tài khoản' : 'Thêm tài khoản'} /></form></Modal>;
}

function Products() {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Product | undefined>();
  const query = useListProducts();
  return <div className="fade-up"><PageHeading eyebrow="Quản lý danh mục" title="Sản phẩm" detail="Thiết lập giá và thời hạn mặc định để tạo thuê bao nhanh hơn." action={<button data-testid="button-create-product" onClick={() => { setSelected(undefined); setModal('create'); }} className="button button-primary"><Plus size={16} /> Thêm sản phẩm</button>} />{query.isLoading ? <div className="product-grid">{[1, 2, 3].map((i) => <Skeleton className="h-52" key={i} />)}</div> : query.isError ? <ErrorState retry={() => query.refetch()} /> : query.data?.length ? <div className="product-grid">{query.data.map((item) => <section data-testid={`card-product-${item.id}`} className="product-card panel lift" key={item.id}><div className="product-card-top"><div className="product-mark">{item.name.slice(0, 1).toUpperCase()}</div><button data-testid={`button-edit-product-${item.id}`} aria-label="Chỉnh sửa sản phẩm" onClick={() => { setSelected(item); setModal('edit'); }} className="icon-button"><Edit3 size={15} /></button></div><h2>{item.name}</h2><div className="product-price">{money(item.defaultPrice)} <span>/ {item.defaultDurationDays || '—'} ngày</span></div><div className="product-stats"><span><strong>{item.activeSubscriptions}</strong> đang hoạt động</span><span><strong>{item.sourceAccountCount}</strong> tài khoản nguồn</span></div></section>)}</div> : <Empty icon={Package} title="Danh mục đang trống" detail="Thêm sản phẩm để thiết lập giá và thời hạn mặc định." action={<button data-testid="button-empty-create-product" onClick={() => setModal('create')} className="button button-primary"><Plus size={15} /> Thêm sản phẩm</button>} />}{modal && <ProductForm product={selected} onClose={() => setModal(null)} />}</div>;
}

function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const isEdit = !!product;
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const [form, setForm] = useState({ name: product?.name || '', duration: product?.defaultDurationDays?.toString() || '30', price: product?.defaultPrice?.toString() || '' });
  const submit = (event: FormEvent) => { event.preventDefault(); const data = { name: form.name, defaultDurationDays: form.duration ? Number(form.duration) : null, defaultPrice: form.price ? Number(form.price) : null }; if (isEdit) update.mutate({ id: product.id, data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); } }); else create.mutate({ data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); } }); };
  return <Modal title={isEdit ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm'} eyebrow="Quản lý danh mục" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Tên sản phẩm"><input required data-testid="input-product-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Adobe Premium" /></Field><Field label="Thời hạn mặc định"><input data-testid="input-product-duration" className="input" type="number" min="1" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /><span className="field-suffix">ngày</span></Field><Field label="Giá mặc định"><input data-testid="input-product-price" className="input" type="number" min="0" step="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" /></Field></div><MutationError error={isEdit ? update.error : create.error} /><FormActions onCancel={onClose} saving={create.isPending || update.isPending} label={isEdit ? 'Lưu sản phẩm' : 'Thêm sản phẩm'} /></form></Modal>;
}

function Settings() {
  const integrations = useGetIntegrationsStatus();
  const [message, setMessage] = useState('');
  return <div className="fade-up"><PageHeading eyebrow="Thiết lập không gian" title="Cài đặt" detail="Theo dõi tích hợp và các nguyên tắc vận hành của bạn." /><section className="settings-stack"><div className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">Hệ thống đã kết nối</p><h2>Tích hợp</h2></div><button data-testid="button-refresh-integrations" aria-label="Làm mới trạng thái tích hợp" onClick={() => integrations.refetch()} className="icon-button"><RefreshCw size={16} /></button></div>{message && <div className="callout callout-info mb-4"><CircleCheck size={17} /><p>{message}</p></div>}{integrations.isLoading ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : integrations.isError ? <ErrorState retry={() => integrations.refetch()} /> : <div className="integration-list"><IntegrationRow icon={Send} name="Telegram" detail={integrations.data?.telegram.mode || 'Kênh vận hành'} configured={!!integrations.data?.telegram.configured} onConfigure={() => setMessage('Cấu hình Telegram được quản lý bởi quản trị viên không gian làm việc.')} /><IntegrationRow icon={Bot} name="AI router" detail={integrations.data?.aiRouter.provider || 'Nhà cung cấp định tuyến'} configured={!!integrations.data?.aiRouter.configured} onConfigure={() => setMessage('Cấu hình AI router được quản lý bởi quản trị viên không gian làm việc.')} /></div>}</div><div className="panel notes-panel"><div className="panel-heading"><div><p className="eyebrow">Nguyên tắc vận hành</p><h2>Giữ quy trình rõ ràng</h2></div><Archive size={17} className="text-primary" /></div><div className="notes-copy"><p>Chủ động gia hạn trước tuần cuối. Một tài khoản nguồn còn một slot trống là cơ hội, không phải phần dư.</p><p>Dùng ghi chú nội bộ để lưu thông tin cần bàn giao: cách thanh toán, kênh liên hệ ưu tiên và điều cần biết cho lần gia hạn tiếp theo.</p></div><div className="note-tags"><span>Rà soát hằng ngày</span><span>Rõ người phụ trách</span><span>Không bỏ sót slot</span></div></div></section></div>;
}

function IntegrationRow({ icon: Icon, name, detail, configured, onConfigure }: { icon: typeof Send; name: string; detail: string; configured: boolean; onConfigure: () => void }) {
  return <div data-testid={`integration-${name.toLowerCase().replace(' ', '-')}`} className="integration-row"><div className="integration-icon"><Icon size={18} /></div><div className="flex-1"><div className="row-title">{name}</div><div className="row-meta">{detail}</div></div><span className={`integration-status ${configured ? 'is-configured' : ''}`}><span />{configured ? 'Đã kết nối' : 'Chưa cấu hình'}</span><button onClick={onConfigure} data-testid={`button-configure-${name.toLowerCase().replace(' ', '-')}`} className="button button-ghost">{configured ? 'Quản lý' : 'Cấu hình'} <ExternalLink size={13} /></button></div>;
}

function SubscriptionRoute() {
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const id = params.id ? Number(params.id) : undefined;
  if (params.id && (!Number.isInteger(id) || !id || id < 1)) return <NotFound />;
  return <Subscriptions initialId={id} onCloseDetail={() => navigate('/subscriptions', { replace: true })} />;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={Dashboard} /><Route path="/subscriptions" component={SubscriptionRoute} /><Route path="/subscriptions/:id" component={SubscriptionRoute} /><Route path="/customers" component={Customers} /><Route path="/source-accounts" component={SourceAccounts} /><Route path="/products" component={Products} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

export default function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}
