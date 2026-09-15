import { type FormEvent, type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, Archive, ArrowUpRight, Bot, Boxes, CalendarClock, Check, ChevronRight,
  CircleAlert, CircleCheck, Clock3, CreditCard, Database, Edit3, ExternalLink,
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
const money = (value?: number | null) => value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const date = (value?: string | null) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
const relative = (value?: string | null) => value ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round((new Date(value).getTime() - Date.now()) / 86400000), 'day') : '—';

function StatusPill({ status }: { status: string }) {
  const label = status === 'expiring' ? 'Expiring soon' : status[0]?.toUpperCase() + status.slice(1);
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
    <CircleAlert size={21} className="text-destructive" /><p className="mt-3 font-semibold">Could not load this view</p>
    <p className="mt-1 text-sm text-muted-foreground">The server did not answer. Your data is safe.</p>
    <button data-testid="button-retry" onClick={retry} className="button button-ghost mt-4"><RefreshCw size={14} /> Try again</button>
  </div>;
}

function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true">
    <div className={`modal ${wide ? 'modal-wide' : ''}`}>
      <div className="flex items-start justify-between border-b hairline px-5 py-4 sm:px-6">
        <div><p className="eyebrow text-primary">{eyebrow || 'Workspace action'}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{title}</h2></div>
        <button data-testid="button-close-modal" aria-label="Close dialog" onClick={onClose} className="icon-button"><X size={17} /></button>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  </div>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}

function FormActions({ onCancel, saving, label = 'Save changes' }: { onCancel: () => void; saving?: boolean; label?: string }) {
  return <div className="mt-6 flex justify-end gap-2 border-t hairline pt-4"><button type="button" data-testid="button-cancel" onClick={onCancel} className="button button-ghost">Cancel</button><button data-testid="button-submit" disabled={saving} className="button button-primary">{saving ? 'Saving…' : <><Check size={15} /> {label}</>}</button></div>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const nav = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
    { href: '/customers', label: 'Customers', icon: Users },
    { href: '/source-accounts', label: 'Source accounts', icon: Database },
    { href: '/products', label: 'Products', icon: Package },
  ];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="brand"><div className="brand-mark">S</div><div><div className="brand-name">stackline</div><div className="brand-caption">operator console</div></div></div>
      <div className="sidebar-kicker eyebrow">Workspace</div>
      <nav className="sidebar-nav">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`} className={`nav-item ${location === href ? 'is-active' : ''}`}><Icon size={17} /><span>{label}</span>{location === href && <ChevronRight size={14} className="ml-auto opacity-70" />}</Link>)}</nav>
      <div className="sidebar-kicker eyebrow mt-7">System</div>
      <Link href="/settings" onClick={() => setMobileOpen(false)} data-testid="link-settings" className={`nav-item ${location === '/settings' ? 'is-active' : ''}`}><Settings2 size={17} /><span>Settings</span></Link>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer"><div className="health-mark"><span /><div><strong>All systems nominal</strong><small>Synced just now</small></div></div><div className="sidebar-user"><div className="avatar">OP</div><div><strong>Operator</strong><small>Reseller workspace</small></div><SlidersHorizontal size={15} className="ml-auto opacity-50" /></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button data-testid="button-mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} className="icon-button md:hidden"><Menu size={19} /></button><div className="breadcrumb"><span className="eyebrow">Stackline</span><ChevronRight size={13} /><span>{location === '/' ? 'Overview' : nav.find((item) => item.href === location)?.label || 'Settings'}</span></div><div className="topbar-tools"><span className="sync-chip"><span className="sync-pulse" /> Live workspace</span><button data-testid="button-help" onClick={() => setHelpOpen(true)} className="icon-button"><LifeBuoy size={17} /></button></div></header>
      <div className="page-wrap">{children}</div>
    </main>
    <nav className="mobile-nav">{nav.slice(0, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} data-testid={`mobile-link-${label.toLowerCase()}`} className={`mobile-nav-item ${location === href ? 'active' : ''}`}><Icon size={17} /><span>{label.split(' ')[0]}</span></Link>)}</nav>
    {helpOpen && <Modal title="Operator shortcuts" eyebrow="Small moves, clean desk" onClose={() => setHelpOpen(false)}><div className="space-y-3 text-sm text-muted-foreground"><p><strong className="text-foreground">Review expirations</strong> from Overview each morning, then renew or revoke directly from the detail drawer.</p><p><strong className="text-foreground">Source capacity</strong> is shown in slots, so a quick scan tells you where the next subscription can land.</p><button data-testid="button-close-help" onClick={() => setHelpOpen(false)} className="button button-primary mt-2">Got it</button></div></Modal>}
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
    <PageHeading eyebrow="Monday · command center" title="Good morning, operator." detail="A clean view of what needs attention — and what is already handled." action={<Link href="/subscriptions" data-testid="link-review-subscriptions" className="button button-primary"><ArrowUpRight size={16} /> Review subscriptions</Link>} />
    <section className="metric-grid">
      <Metric label="Active subscriptions" value={data.activeSubscriptions} note={`${data.totalCustomers} customers in orbit`} icon={CreditCard} accent="coral" />
      <Metric label="Expiring in 7 days" value={data.expiringSubscriptions} note="Keep renewals moving" icon={CalendarClock} accent="lime" href="/subscriptions?status=expiring" />
      <Metric label="Revenue this month" value={money(data.revenueThisMonth)} note={`${money(data.totalRevenue)} lifetime revenue`} icon={Zap} accent="teal" />
      <Metric label="Expired / revoked" value={data.expiredSubscriptions + data.revokedSubscriptions} note="Archive or win back" icon={Archive} accent="ink" />
    </section>
    <div className="dashboard-grid">
      <section className="panel upcoming-panel">
        <div className="panel-heading"><div><p className="eyebrow">Next up</p><h2>Upcoming expirations</h2></div><Link href="/subscriptions" data-testid="link-view-all-expirations" className="text-link">View all <ArrowUpRight size={14} /></Link></div>
        {data.upcoming?.length ? <div className="upcoming-list">{data.upcoming.slice(0, 6).map((item) => <Link href={`/subscriptions/${item.id}`} data-testid={`row-upcoming-${item.id}`} className="upcoming-row" key={item.id}><div className="date-tile"><span>{new Date(item.endDate).toLocaleDateString('en-US', { month: 'short' })}</span><strong>{new Date(item.endDate).getDate()}</strong></div><div className="min-w-0 flex-1"><div className="row-title">{item.customerName}</div><div className="row-meta">{item.productName} <span>·</span> {item.sourceAccountEmail || 'No source assigned'}</div></div><div className="row-end"><strong className={item.daysRemaining <= 7 ? 'text-primary' : ''}>{item.daysRemaining}d</strong><span>{money(item.price)}</span></div><ChevronRight size={15} className="text-muted-foreground" /></Link>)}</div> : <Empty icon={CalendarClock} title="No expirations on the radar" detail="Your next 30 days are clear. New assignments will appear here." />}
      </section>
      <section className="panel activity-panel">
        <div className="panel-heading"><div><p className="eyebrow">Signal log</p><h2>Recent activity</h2></div><Activity size={17} className="text-muted-foreground" /></div>
        {activity.isLoading ? <div className="space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : activity.data?.length ? <div className="activity-list">{activity.data.map((item) => <div data-testid={`activity-item-${item.id}`} className="activity-row" key={item.id}><div className={`activity-icon activity-${item.type}`}>{item.type === 'renewed' ? <RefreshCw size={14} /> : item.type === 'revoked' ? <X size={14} /> : item.type === 'expiring' ? <Clock3 size={14} /> : <Plus size={14} />}</div><div className="min-w-0 flex-1"><div className="row-title truncate">{item.title}</div><div className="row-meta truncate">{item.description}</div></div><time className="mono text-[10px] text-muted-foreground">{relative(item.timestamp)}</time></div>)}</div> : <Empty icon={Activity} title="No recent activity" detail="New subscriptions, renewals, and revocations will land here." />}
      </section>
    </div>
    <section className="panel health-panel"><div className="flex items-center gap-3"><div className="health-orb"><ShieldCheck size={18} /></div><div><p className="eyebrow">Workspace health</p><h2>Everything is in its place.</h2></div></div><div className="health-stats"><span><strong>{data.activeSubscriptions}</strong> active</span><span><strong>{data.statusBreakdown?.length || 0}</strong> status lanes</span><span><strong>{data.totalCustomers}</strong> customers</span></div></section>
  </div>;
}

function DashboardSkeleton() {
  return <div className="space-y-6"><Skeleton className="h-28 w-2/3" /><div className="metric-grid">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32" />)}</div><div className="dashboard-grid"><Skeleton className="h-96" /><Skeleton className="h-96" /></div></div>;
}

function Metric({ label, value, note, icon: Icon, accent, href }: { label: string; value: ReactNode; note: string; icon: typeof Zap; accent: string; href?: string }) {
  const body = <><div className={`metric-icon metric-${accent}`}><Icon size={17} /></div><div className="mt-5"><p className="metric-label">{label}</p><p data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`} className="metric-value">{value}</p><p className="metric-note">{note}</p></div></>;
  return href ? <Link href={href} data-testid={`metric-link-${accent}`} className="metric-card lift">{body}<ArrowUpRight size={15} className="metric-arrow" /></Link> : <div className="metric-card">{body}</div>;
}

function Subscriptions({ initialId }: { initialId?: number }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('end_date');
  const [modal, setModal] = useState<'create' | 'renew' | 'revoke' | null>(null);
  const [selected, setSelected] = useState<number | null>(initialId ?? null);
  const query = useListSubscriptions({ search: search || undefined, status: status as 'all' | 'active' | 'expiring' | 'expired' | 'archived', sort: sort as 'end_date' | 'created_at' | 'customer' });
  const detail = useGetSubscription(selected || 0, { query: { enabled: !!selected, queryKey: getGetSubscriptionQueryKey(selected || 0) } });
  const subscriptions = query.data || [];
  return <div className="fade-up">
    <PageHeading eyebrow="Revenue surface" title="Subscriptions" detail="Every active seat, renewal window, and source assignment." action={<button data-testid="button-create-subscription" onClick={() => setModal('create')} className="button button-primary"><Plus size={16} /> New subscription</button>} />
    <div className="toolbar"><div className="search-wrap"><Search size={16} /><input data-testid="input-subscription-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, product, or email" /></div><div className="filter-tabs">{['all', 'active', 'expiring', 'expired', 'archived'].map((item) => <button key={item} data-testid={`filter-${item}`} onClick={() => setStatus(item)} className={`filter-tab ${status === item ? 'active' : ''}`}>{item === 'all' ? 'All subscriptions' : item[0].toUpperCase() + item.slice(1)}</button>)}</div><select data-testid="select-subscription-sort" className="select compact-select" value={sort} onChange={(e) => setSort(e.target.value)}><option value="end_date">Ending soonest</option><option value="created_at">Recently created</option><option value="customer">Customer A–Z</option></select></div>
    <section className="panel table-panel">{query.isLoading ? <TableSkeleton /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : subscriptions.length ? <div className="mobile-scroll"><table className="data-table"><thead><tr><th>Customer</th><th>Product</th><th>Source account</th><th>End date</th><th>Status</th><th className="text-right">Value</th><th /></tr></thead><tbody>{subscriptions.map((item) => <tr data-testid={`row-subscription-${item.id}`} key={item.id} onClick={() => setSelected(item.id)} className="clickable-row"><td><div className="table-primary">{item.customerName}</div><div className="table-secondary">{item.customerContact || 'No contact on file'}</div></td><td><div className="table-primary">{item.productName}</div><div className="table-secondary mono">#{String(item.id).padStart(4, '0')}</div></td><td><div className="table-primary max-w-44 truncate">{item.sourceAccountEmail || 'Unassigned'}</div><div className="table-secondary">{item.sourceAccountId ? 'Assigned source' : 'Needs a source'}</div></td><td><div className="table-primary">{date(item.endDate)}</div><div className={`table-secondary ${item.daysRemaining <= 7 ? 'text-primary' : ''}`}>{item.daysRemaining < 0 ? 'Expired' : `${item.daysRemaining} days left`}</div></td><td><StatusPill status={item.status} /></td><td className="text-right"><span className="table-primary">{money(item.price)}</span></td><td className="text-right"><ChevronRight size={15} className="text-muted-foreground" /></td></tr>)}</tbody></table></div> : <Empty icon={CreditCard} title="No subscriptions match" detail={search ? `Nothing found for “${search}”. Try a broader search.` : 'Create the first subscription to start tracking revenue.'} action={!search ? <button data-testid="button-empty-create-subscription" onClick={() => setModal('create')} className="button button-primary"><Plus size={15} /> New subscription</button> : undefined} />}</section>
    {selected && <SubscriptionDrawer subscription={detail.data} loading={detail.isLoading} onClose={() => setSelected(null)} onRenew={() => setModal('renew')} onRevoke={() => setModal('revoke')} />}
    {modal === 'create' && <SubscriptionForm onClose={() => setModal(null)} />}
    {modal === 'renew' && selected && <RenewModal id={selected} onClose={() => setModal(null)} />}
    {modal === 'revoke' && selected && <RevokeModal id={selected} onClose={() => setModal(null)} />}
  </div>;
}

function TableSkeleton() { return <div className="space-y-4 p-5">{[1, 2, 3, 4, 5].map((i) => <div className="flex gap-4" key={i}><Skeleton className="h-10 flex-1" /><Skeleton className="h-10 w-28" /><Skeleton className="h-10 w-20" /></div>)}</div>; }

function SubscriptionDrawer({ subscription, loading, onClose, onRenew, onRevoke }: { subscription?: Subscription & { history?: unknown[] }; loading: boolean; onClose: () => void; onRenew: () => void; onRevoke: () => void }) {
  const history = useGetSubscriptionHistory(subscription?.id || 0, { query: { enabled: !!subscription?.id, queryKey: getGetSubscriptionHistoryQueryKey(subscription?.id || 0) } });
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-top"><div><p className="eyebrow text-primary">Subscription detail</p><h2>{loading ? 'Loading…' : subscription?.customerName}</h2><p className="text-sm text-muted-foreground">{subscription?.productName}</p></div><button data-testid="button-close-subscription" onClick={onClose} className="icon-button"><X size={17} /></button></div>{loading ? <div className="space-y-4 p-6"><Skeleton className="h-20" /><Skeleton className="h-40" /></div> : subscription && <div className="drawer-content"><div className="drawer-actions"><StatusPill status={subscription.status} /><button data-testid="button-renew-subscription" onClick={onRenew} className="button button-primary ml-auto"><RefreshCw size={14} /> Renew</button>{subscription.status !== 'archived' && <button data-testid="button-revoke-subscription" onClick={onRevoke} className="button button-danger"><X size={14} /> Revoke</button>}</div><div className="detail-grid"><DetailCell label="Customer" value={subscription.customerName} /><DetailCell label="Contact" value={subscription.customerContact || 'Not recorded'} /><DetailCell label="Start date" value={date(subscription.startDate)} /><DetailCell label="End date" value={date(subscription.endDate)} /><DetailCell label="Source account" value={subscription.sourceAccountEmail || 'Unassigned'} /><DetailCell label="Price" value={money(subscription.price)} /></div><div className="drawer-section"><div className="panel-heading"><div><p className="eyebrow">Audit trail</p><h3>Renewal history</h3></div><span className="mono text-xs text-muted-foreground">{history.data?.length || 0} events</span></div>{history.isLoading ? <Skeleton className="h-16" /> : history.data?.length ? <div className="history-list">{history.data.map((event) => <div className="history-row" key={event.id}><div className="history-dot" /><div className="flex-1"><div className="table-primary">+{event.daysAdded} days <span className="text-muted-foreground font-normal">· {money(event.amountPaid)}</span></div><div className="table-secondary">{date(event.renewedAt)}{event.note ? ` · ${event.note}` : ''}</div></div><span className="mono text-[10px] text-muted-foreground">{event.gapDays > 0 ? `${event.gapDays}d gap` : 'Continuous'}</span></div>)}</div> : <p className="empty-inline">No renewal events yet.</p>}</div></div>}</aside></div>;
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
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate({ data: { customerId: Number(form.customerId), productId: Number(form.productId), sourceAccountId: form.sourceAccountId ? Number(form.sourceAccountId) : null, startDate: form.startDate, endDate: form.endDate, price: form.price ? Number(form.price) : selectedProduct?.defaultPrice ?? null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }); onClose(); } }); };
  return <Modal title="New subscription" eyebrow="Revenue surface" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Customer"><select required data-testid="select-subscription-customer" className="select" value={form.customerId} onChange={(e) => set('customerId', e.target.value)}><option value="">Choose a customer</option>{customers.data?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Product"><select required data-testid="select-subscription-product" className="select" value={form.productId} onChange={(e) => set('productId', e.target.value)}><option value="">Choose a product</option>{products.data?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Source account" hint="Optional — assign later from the subscription detail."><select data-testid="select-subscription-source" className="select" value={form.sourceAccountId} onChange={(e) => set('sourceAccountId', e.target.value)}><option value="">Leave unassigned</option>{sources.data?.filter((item) => !form.productId || item.productId === Number(form.productId)).map((item) => <option value={item.id} key={item.id}>{item.email} · {item.availableSlots} free</option>)}</select></Field><Field label="Price" hint={selectedProduct?.defaultPrice ? `Product default: ${money(selectedProduct.defaultPrice)}` : undefined}><input data-testid="input-subscription-price" className="input" type="number" min="0" step="0.01" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="0.00" /></Field><Field label="Start date"><input required data-testid="input-subscription-start" className="input" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field><Field label="End date"><input required data-testid="input-subscription-end" className="input" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></Field></div><FormActions onCancel={onClose} saving={create.isPending} label="Create subscription" /></form></Modal>;
}

function RenewModal({ id, onClose }: { id: number; onClose: () => void }) {
  const renew = useRenewSubscription();
  const [form, setForm] = useState({ daysAdded: '30', amountPaid: '', note: '' });
  const submit = (event: FormEvent) => { event.preventDefault(); renew.mutate({ id, data: { daysAdded: Number(form.daysAdded), amountPaid: form.amountPaid ? Number(form.amountPaid) : null, note: form.note || null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetSubscriptionHistoryQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }); onClose(); } }); };
  return <Modal title="Record a renewal" eyebrow="Keep it active" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Days added"><input required data-testid="input-renew-days" className="input" type="number" min="1" value={form.daysAdded} onChange={(e) => setForm({ ...form, daysAdded: e.target.value })} /></Field><Field label="Amount paid"><input data-testid="input-renew-amount" className="input" type="number" min="0" step="0.01" value={form.amountPaid} onChange={(e) => setForm({ ...form, amountPaid: e.target.value })} placeholder="0.00" /></Field><Field label="Note"><textarea data-testid="input-renew-note" className="textarea" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional context for the next operator" /></Field></div><FormActions onCancel={onClose} saving={renew.isPending} label="Record renewal" /></form></Modal>;
}

function RevokeModal({ id, onClose }: { id: number; onClose: () => void }) {
  const revoke = useRevokeSubscription();
  const [note, setNote] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); revoke.mutate({ id, data: { note: note || null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSubscriptionsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetSubscriptionQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardActivityQueryKey() }); onClose(); } }); };
  return <Modal title="Revoke subscription" eyebrow="This cannot be undone" onClose={onClose}><form onSubmit={submit}><div className="callout callout-danger"><CircleAlert size={17} /><p>Revoking releases the assigned source slot and removes this subscription from active revenue.</p></div><Field label="Reason / note"><textarea data-testid="input-revoke-note" className="textarea mt-2" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this subscription being revoked?" /></Field><FormActions onCancel={onClose} saving={revoke.isPending} label="Revoke subscription" /></form></Modal>;
}

function Customers() {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const query = useListCustomers({ search: search || undefined, limit: 100 });
  const detail = useGetCustomer(selected || 0, { query: { enabled: !!selected, queryKey: getGetCustomerQueryKey(selected || 0) } });
  return <div className="fade-up"><PageHeading eyebrow="People layer" title="Customers" detail="The people behind each active seat and renewal." action={<button data-testid="button-create-customer" onClick={() => setModal('create')} className="button button-primary"><Plus size={16} /> New customer</button>} /><div className="toolbar"><div className="search-wrap"><Search size={16} /><input data-testid="input-customer-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or contact" /></div><span className="toolbar-count mono">{query.data?.length || 0} records</span></div><section className="panel table-panel">{query.isLoading ? <TableSkeleton /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : query.data?.length ? <div className="customer-grid">{query.data.map((item) => <button data-testid={`card-customer-${item.id}`} className="customer-card lift" key={item.id} onClick={() => setSelected(item.id)}><div className="customer-card-top"><div className="avatar avatar-large">{item.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</div><Edit3 size={15} className="text-muted-foreground" /></div><div className="customer-name">{item.name}</div><div className="customer-contact">{item.contact || 'No contact recorded'}</div><div className="customer-card-bottom"><span><strong>{item.subscriptionCount}</strong> subscription{item.subscriptionCount === 1 ? '' : 's'}</span><span className="mono">{date(item.createdAt)}</span></div></button>)}</div> : <Empty icon={Users} title="Your customer book is empty" detail="Add a customer before creating their first subscription." action={<button data-testid="button-empty-create-customer" onClick={() => setModal('create')} className="button button-primary"><Plus size={15} /> Add customer</button>} />}</section>{selected && <CustomerDrawer customer={detail.data} loading={detail.isLoading} onClose={() => setSelected(null)} onEdit={() => setModal('edit')} />}{modal && <CustomerForm customer={modal === 'edit' ? detail.data : undefined} onClose={() => setModal(null)} />}</div>;
}

function CustomerDrawer({ customer, loading, onClose, onEdit }: { customer?: Customer & { subscriptions?: Subscription[] }; loading: boolean; onClose: () => void; onEdit: () => void }) {
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" onClick={(e) => e.stopPropagation()}><div className="drawer-top"><div><p className="eyebrow text-primary">Customer profile</p><h2>{loading ? 'Loading…' : customer?.name}</h2><p className="text-sm text-muted-foreground">{customer?.contact || 'No contact recorded'}</p></div><button data-testid="button-close-customer" onClick={onClose} className="icon-button"><X size={17} /></button></div>{loading ? <div className="space-y-4 p-6"><Skeleton className="h-20" /><Skeleton className="h-40" /></div> : customer && <div className="drawer-content"><button data-testid="button-edit-customer" onClick={onEdit} className="button button-outline w-full"><Edit3 size={14} /> Edit customer</button>{customer.note && <div className="note-block"><p className="eyebrow">Operator note</p><p>{customer.note}</p></div>}<div className="drawer-section"><div className="panel-heading"><div><p className="eyebrow">Revenue map</p><h3>Subscriptions</h3></div><span className="mono text-xs text-muted-foreground">{customer.subscriptions?.length || 0} total</span></div>{customer.subscriptions?.length ? <div className="history-list">{customer.subscriptions.map((item) => <Link href={`/subscriptions/${item.id}`} className="history-row" key={item.id}><div className="history-dot" /><div className="flex-1"><div className="table-primary">{item.productName}</div><div className="table-secondary">Ends {date(item.endDate)}</div></div><StatusPill status={item.status} /></Link>)}</div> : <p className="empty-inline">No subscriptions for this customer.</p>}</div></div>}</aside></div>;
}

function CustomerForm({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const isEdit = !!customer;
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const [form, setForm] = useState({ name: customer?.name || '', contact: customer?.contact || '', note: customer?.note || '' });
  const submit = (event: FormEvent) => { event.preventDefault(); const data = { name: form.name, contact: form.contact || null, note: form.note || null }; if (isEdit) update.mutate({ id: customer.id, data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(customer.id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); onClose(); } }); else create.mutate({ data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() }); onClose(); } }); };
  return <Modal title={isEdit ? 'Edit customer' : 'New customer'} eyebrow="People layer" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Full name"><input required data-testid="input-customer-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Mira Solano" /></Field><Field label="Contact"><input data-testid="input-customer-contact" className="input" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Telegram, email, or phone" /></Field><Field label="Operator note"><textarea data-testid="input-customer-note" className="textarea" rows={4} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Useful context for future renewals" /></Field></div><FormActions onCancel={onClose} saving={create.isPending || update.isPending} label={isEdit ? 'Save customer' : 'Create customer'} /></form></Modal>;
}

function SourceAccounts() {
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<SourceAccount | undefined>();
  const query = useListSourceAccounts({ search: search || undefined });
  const products = useListProducts();
  return <div className="fade-up"><PageHeading eyebrow="Inventory control" title="Source accounts" detail="Know exactly where the next seat can come from." action={<button data-testid="button-create-source-account" onClick={() => { setSelected(undefined); setModal('create'); }} className="button button-primary"><Plus size={16} /> Add source account</button>} /><div className="toolbar"><div className="search-wrap"><Search size={16} /><input data-testid="input-source-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email or product" /></div><span className="toolbar-count mono">{query.data?.length || 0} accounts</span></div>{query.isLoading ? <TableSkeleton /> : query.isError ? <ErrorState retry={() => query.refetch()} /> : query.data?.length ? <div className="source-grid">{query.data.map((item) => <SourceCard account={item} key={item.id} onEdit={() => { setSelected(item); setModal('edit'); }} />)}</div> : <Empty icon={Database} title="No source accounts yet" detail="Add the accounts you use to fulfill subscriptions and see slot capacity here." action={<button data-testid="button-empty-create-source-account" onClick={() => setModal('create')} className="button button-primary"><Plus size={15} /> Add source account</button>} />}{modal && <SourceForm products={products.data || []} account={selected} onClose={() => setModal(null)} />}</div>;
}

function SourceCard({ account, onEdit }: { account: SourceAccount; onEdit: () => void }) {
  const usage = account.maxSlots ? Math.min(100, (account.usedSlots / account.maxSlots) * 100) : 0;
  return <section data-testid={`card-source-account-${account.id}`} className="source-card panel lift"><div className="source-card-head"><div className="source-icon"><Database size={17} /></div><button data-testid={`button-edit-source-${account.id}`} onClick={onEdit} className="icon-button"><Edit3 size={15} /></button></div><p className="eyebrow mt-4 text-primary">{account.productName}</p><h3 className="source-email">{account.email}</h3><div className="slot-line"><span><strong>{account.availableSlots}</strong> slots available</span><span className="mono">{account.usedSlots}/{account.maxSlots}</span></div><div className="slot-track"><div style={{ width: `${usage}%` }} /></div><div className="source-foot"><span>{account.expiresAt ? `Expires ${date(account.expiresAt)}` : 'No expiry set'}</span><span className={account.availableSlots === 0 ? 'text-primary' : ''}>{account.availableSlots === 0 ? 'Full' : 'Ready'}</span></div></section>;
}

function SourceForm({ products, account, onClose }: { products: Product[]; account?: SourceAccount; onClose: () => void }) {
  const isEdit = !!account;
  const create = useCreateSourceAccount();
  const update = useUpdateSourceAccount();
  const [form, setForm] = useState({ productId: account?.productId?.toString() || '', email: account?.email || '', maxSlots: account?.maxSlots?.toString() || '5', expiresAt: account?.expiresAt?.slice(0, 10) || '', note: account?.note || '' });
  const submit = (event: FormEvent) => { event.preventDefault(); if (isEdit) update.mutate({ id: account.id, data: { email: form.email, maxSlots: Number(form.maxSlots), expiresAt: form.expiresAt || null, note: form.note || null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSourceAccountsQueryKey() }); onClose(); } }); else create.mutate({ data: { productId: Number(form.productId), email: form.email, maxSlots: Number(form.maxSlots), expiresAt: form.expiresAt || null, note: form.note || null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSourceAccountsQueryKey() }); queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); } }); };
  return <Modal title={isEdit ? 'Edit source account' : 'Add source account'} eyebrow="Inventory control" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Product"><select required disabled={isEdit} data-testid="select-source-product" className="select" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Choose a product</option>{products.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field><Field label="Account email"><input required data-testid="input-source-email" className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="source@example.com" /></Field><Field label="Maximum slots"><input required data-testid="input-source-slots" className="input" type="number" min="1" value={form.maxSlots} onChange={(e) => setForm({ ...form, maxSlots: e.target.value })} /></Field><Field label="Expires at"><input data-testid="input-source-expiry" className="input" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></Field><Field label="Operator note"><textarea data-testid="input-source-note" className="textarea" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional access or billing context" /></Field></div><FormActions onCancel={onClose} saving={create.isPending || update.isPending} label={isEdit ? 'Save account' : 'Add account'} /></form></Modal>;
}

function Products() {
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<Product | undefined>();
  const query = useListProducts();
  return <div className="fade-up"><PageHeading eyebrow="Catalog controls" title="Products" detail="Set the defaults that make new subscriptions quick to create." action={<button data-testid="button-create-product" onClick={() => { setSelected(undefined); setModal('create'); }} className="button button-primary"><Plus size={16} /> Add product</button>} />{query.isLoading ? <div className="product-grid">{[1, 2, 3].map((i) => <Skeleton className="h-52" key={i} />)}</div> : query.isError ? <ErrorState retry={() => query.refetch()} /> : query.data?.length ? <div className="product-grid">{query.data.map((item) => <section data-testid={`card-product-${item.id}`} className="product-card panel lift" key={item.id}><div className="product-card-top"><div className="product-mark">{item.name.slice(0, 1).toUpperCase()}</div><button data-testid={`button-edit-product-${item.id}`} onClick={() => { setSelected(item); setModal('edit'); }} className="icon-button"><Edit3 size={15} /></button></div><h2>{item.name}</h2><div className="product-price">{money(item.defaultPrice)} <span>/ {item.defaultDurationDays || '—'} days</span></div><div className="product-stats"><span><strong>{item.activeSubscriptions}</strong> active</span><span><strong>{item.sourceAccountCount}</strong> source{item.sourceAccountCount === 1 ? '' : 's'}</span></div></section>)}</div> : <Empty icon={Package} title="Your catalog is waiting" detail="Add a product to establish pricing and duration defaults." action={<button data-testid="button-empty-create-product" onClick={() => setModal('create')} className="button button-primary"><Plus size={15} /> Add product</button>} />}{modal && <ProductForm product={selected} onClose={() => setModal(null)} />}</div>;
}

function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const isEdit = !!product;
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const [form, setForm] = useState({ name: product?.name || '', duration: product?.defaultDurationDays?.toString() || '30', price: product?.defaultPrice?.toString() || '' });
  const submit = (event: FormEvent) => { event.preventDefault(); const data = { name: form.name, defaultDurationDays: form.duration ? Number(form.duration) : null, defaultPrice: form.price ? Number(form.price) : null }; if (isEdit) update.mutate({ id: product.id, data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); } }); else create.mutate({ data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }); onClose(); } }); };
  return <Modal title={isEdit ? 'Edit product' : 'Add product'} eyebrow="Catalog controls" onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Product name"><input required data-testid="input-product-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Streamline Premium" /></Field><Field label="Default duration"><input data-testid="input-product-duration" className="input" type="number" min="1" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /><span className="field-suffix">days</span></Field><Field label="Default price"><input data-testid="input-product-price" className="input" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0.00" /></Field></div><FormActions onCancel={onClose} saving={create.isPending || update.isPending} label={isEdit ? 'Save product' : 'Add product'} /></form></Modal>;
}

function Settings() {
  const integrations = useGetIntegrationsStatus();
  const [message, setMessage] = useState('');
  return <div className="fade-up"><PageHeading eyebrow="Workspace controls" title="Settings" detail="Integration health and the operating notes behind your workflow." /><section className="settings-stack"><div className="panel settings-panel"><div className="panel-heading"><div><p className="eyebrow">Connected systems</p><h2>Integrations</h2></div><button data-testid="button-refresh-integrations" onClick={() => integrations.refetch()} className="icon-button"><RefreshCw size={16} /></button></div>{message && <div className="callout callout-info mb-4"><CircleCheck size={17} /><p>{message}</p></div>}{integrations.isLoading ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : integrations.isError ? <ErrorState retry={() => integrations.refetch()} /> : <div className="integration-list"><IntegrationRow icon={Send} name="Telegram" detail={integrations.data?.telegram.mode || 'Operator channel'} configured={!!integrations.data?.telegram.configured} onConfigure={() => setMessage('Telegram configuration is managed by your workspace administrator.')} /><IntegrationRow icon={Bot} name="AI router" detail={integrations.data?.aiRouter.provider || 'Routing provider'} configured={!!integrations.data?.aiRouter.configured} onConfigure={() => setMessage('AI router configuration is managed by your workspace administrator.')} /></div>}</div><div className="panel notes-panel"><div className="panel-heading"><div><p className="eyebrow">Operating principles</p><h2>Keep the desk clean</h2></div><Archive size={17} className="text-primary" /></div><div className="notes-copy"><p>Renew before the last week. A source account with one free slot is an opportunity, not a spare.</p><p>Use operator notes for context that should survive a handoff: billing quirks, preferred contact channel, and anything the next renewal needs to know.</p></div><div className="note-tags"><span>Daily review</span><span>Clear ownership</span><span>No orphan slots</span></div></div></section></div>;
}

function IntegrationRow({ icon: Icon, name, detail, configured, onConfigure }: { icon: typeof Send; name: string; detail: string; configured: boolean; onConfigure: () => void }) {
  return <div data-testid={`integration-${name.toLowerCase().replace(' ', '-')}`} className="integration-row"><div className="integration-icon"><Icon size={18} /></div><div className="flex-1"><div className="row-title">{name}</div><div className="row-meta">{detail}</div></div><span className={`integration-status ${configured ? 'is-configured' : ''}`}><span />{configured ? 'Connected' : 'Not configured'}</span><button onClick={onConfigure} data-testid={`button-configure-${name.toLowerCase().replace(' ', '-')}`} className="button button-ghost">{configured ? 'Manage' : 'Configure'} <ExternalLink size={13} /></button></div>;
}

function SubscriptionRoute() {
  const params = useParams<{ id?: string }>();
  return <Subscriptions initialId={params.id ? Number(params.id) : undefined} />;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={Dashboard} /><Route path="/subscriptions" component={SubscriptionRoute} /><Route path="/subscriptions/:id" component={SubscriptionRoute} /><Route path="/customers" component={Customers} /><Route path="/source-accounts" component={SourceAccounts} /><Route path="/products" component={Products} /><Route path="/settings" component={Settings} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

export default function App() {
  return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter></QueryClientProvider>;
}