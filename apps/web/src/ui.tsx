import { useEffect, useRef, type ReactNode } from 'react';
import { t, translateStatus } from './i18n.js';

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return <header className="page-header"><h2>{t(title)}</h2><div className="page-actions">{actions}</div></header>;
}

export function StatusBadge({ value }: { value: string }) {
  const tone = /^(ACTIVE|CONFIRMED|COMPLETED|APPROVED|PAID|CLOCKED_IN)$/.test(value) ? 'success' : /^(PENDING|PARTIALLY_PAID|UNPAID|REFUND_PENDING)$/.test(value) ? 'warning' : /^(CANCELLED|REJECTED|REVOKED|FAILED)$/.test(value) ? 'danger' : 'neutral';
  return <span className={`status-badge status-${tone}`}>{translateStatus(value)}</span>;
}

export function DataTable<T extends { id: string }>({ columns, rows, selectedId, onSelect, mobileSummary, empty = 'No records.', loading = false }: { columns: { label: string; render: (row: T) => ReactNode }[]; rows: T[]; selectedId?: string; onSelect?: (row: T) => void; mobileSummary?: (row: T, index: number) => ReactNode; empty?: string; loading?: boolean }) {
  if (loading) return <div className="table-state loading-state" role="status" aria-label={t('Loading records')}><span>{t('Loading records…')}</span><i/><i/><i/></div>;
  if (!rows.length) return <div className="table-state empty-state"><strong>{t(empty)}</strong><span>{t('Try changing your filters, or add a record if available.')}</span></div>;
  return <><div className="table-wrap"><table className="data-table"><thead><tr>{columns.map((column) => <th key={column.label} scope="col">{t(column.label)}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className={selectedId === row.id ? 'is-selected' : ''} aria-selected={onSelect ? selectedId === row.id : undefined} tabIndex={onSelect ? 0 : undefined} onClick={onSelect ? () => onSelect(row) : undefined} onKeyDown={onSelect ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(row); } } : undefined}>{columns.map((column) => { const content = column.render(row); return <td key={column.label} data-label={t(column.label)}>{/(status|payment)$/i.test(column.label) && typeof content === 'string' ? <StatusBadge value={content}/> : content}</td>; })}</tr>)}</tbody></table></div>{onSelect && <div className="mobile-record-list">{rows.map((row, index) => <button key={row.id} type="button" className={`mobile-record-card${selectedId === row.id ? ' is-selected' : ''}`} onClick={() => onSelect(row)}>{mobileSummary ? mobileSummary(row, index) : columns.slice(0, 3).map((column) => <span key={column.label}><small>{t(column.label)}</small>{column.render(row)}</span>)}</button>)}</div>}</>;
}

export function RecordDrawer({ title, open, onClose, actions, children }: { title: string; open: boolean; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className="record-drawer" aria-label={t(title)} onClose={(event) => { if (event.target === event.currentTarget) onClose(); }} onCancel={(event) => { if (event.target === event.currentTarget) onClose(); }}><header className="record-drawer-header"><h2>{t(title)}</h2><button type="button" className="icon-button secondary" aria-label={t('Close {{title}}', { title: t(title) })} onClick={onClose}>×</button></header>{actions && <div className="record-action-bar">{actions}</div>}<div className="record-drawer-body">{children}</div></dialog>;
}

export function RecordSection({ title, children }: { title: string; children: ReactNode }) { return <section className="record-section"><h3>{t(title)}</h3>{children}</section>; }
export function RecordField({ label, children }: { label: string; children: ReactNode }) { return <div className="record-field"><span>{t(label)}</span><strong>{typeof children === 'string' && /^[A-Z_]+$/.test(children) ? translateStatus(children) : children ?? '—'}</strong></div>; }

export function FormDialog({ title, open, onClose, children, className = '' }: { title: string; open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) dialog.showModal(); if (!open && dialog.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className={`form-dialog ${className}`} aria-label={t(title)} onClose={(event) => { event.stopPropagation(); onClose(); }} onCancel={(event) => { event.stopPropagation(); onClose(); }}><div className="dialog-header"><div><small>{t("Details")}</small><h2>{t(title)}</h2></div><button type="button" className="icon-button" aria-label={t("Close form")} onClick={onClose}>×</button></div>{children}</dialog>;
}
