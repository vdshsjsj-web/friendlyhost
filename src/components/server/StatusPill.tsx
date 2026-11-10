const STYLES: Record<string, { label: string; className: string; dot: string }> = {
  running: { label: 'Running', className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300', dot: 'bg-emerald-400' },
  starting: { label: 'Starting', className: 'border-amber-400/30 bg-amber-400/10 text-amber-200', dot: 'bg-amber-400' },
  stopping: { label: 'Stopping', className: 'border-amber-400/30 bg-amber-400/10 text-amber-200', dot: 'bg-amber-400' },
  offline: { label: 'Offline', className: 'border-white/10 bg-white/[0.04] text-slate-400', dot: 'bg-slate-500' },
  provisioning: {
    label: 'Provisioning',
    className: 'border-jasfer-400/30 bg-jasfer-500/10 text-jasfer-200',
    dot: 'bg-jasfer-400',
  },
  suspended: { label: 'Suspended', className: 'border-rose-500/30 bg-rose-500/10 text-rose-200', dot: 'bg-rose-400' },
  error: { label: 'Error', className: 'border-rose-500/30 bg-rose-500/10 text-rose-200', dot: 'bg-rose-400' },
};

export default function StatusPill({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const style = STYLES[status] ?? STYLES.offline;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${style.className} ${
        size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${status === 'running' ? 'live-dot' : ''}`} />
      {style.label}
    </span>
  );
}
