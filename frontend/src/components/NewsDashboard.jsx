import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Sparkles,
  Send,
  Loader2,
  Newspaper,
  Plus,
  Clock,
  CheckCircle2,
  FileText,
  Radio,
  Trash2,
  X,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_META = {
  Pending_Review: {
    label: "Pending Review",
    dot: "bg-amber-400",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    icon: Clock,
  },
  Rewritten_Pending_Publish: {
    label: "Rewritten · Pending Publish",
    dot: "bg-indigo-400",
    chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    icon: FileText,
  },
  Published: {
    label: "Published",
    dot: "bg-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    icon: CheckCircle2,
  },
};

const FILTERS = [
  { key: "ALL", label: "All Items" },
  { key: "Pending_Review", label: "Pending Review" },
  { key: "Rewritten_Pending_Publish", label: "Rewritten" },
  { key: "Published", label: "Published" },
];

function StatusBadge({ status, id }) {
  const meta = STATUS_META[status] || STATUS_META.Pending_Review;
  const Icon = meta.icon;
  return (
    <span
      data-testid={`status-badge-${id}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${meta.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function NewsCard({ item, onRewrite, onPublish, onDelete, busy }) {
  const isPending = item.status === "Pending_Review";
  const isRewritten = item.status === "Rewritten_Pending_Publish";
  const isBusy = busy === item.id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
      data-testid={`news-item-card-${item.id}`}
      className="flex flex-col rounded-2xl border border-white/10 bg-[#111827] p-5 shadow-lg shadow-black/20"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          <Radio className="h-3.5 w-3.5" />
          {item.source}
        </div>
        <StatusBadge status={item.status} id={item.id} />
      </div>

      <h3 className="font-display text-base font-semibold leading-snug text-zinc-100">
        {item.title}
      </h3>

      <div className="mt-3 grid gap-3">
        <div data-testid={`original-content-pane-${item.id}`}>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            Original Draft
          </p>
          <p className="text-sm leading-relaxed text-zinc-400 line-clamp-4">
            {item.original_content}
          </p>
        </div>

        <AnimatePresence>
          {item.rewritten_content && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              data-testid={`hindi-rewritten-pane-${item.id}`}
              className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3"
            >
              <p className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
                <Sparkles className="h-3 w-3" /> पत्रकारीय हिंदी
              </p>
              <p className="font-hindi whitespace-pre-line text-[15px] leading-relaxed text-emerald-200">
                {item.rewritten_content}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
        {isPending && (
          <button
            data-testid={`approve-for-rewrite-btn-${item.id}`}
            onClick={() => onRewrite(item)}
            disabled={isBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition-all hover:bg-rose-500 hover:shadow-rose-500/40 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Rewriting in Journalistic Hindi…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Approve for Rewrite
              </>
            )}
          </button>
        )}

        {isRewritten && (
          <button
            data-testid={`publish-news-btn-${item.id}`}
            onClick={() => onPublish(item)}
            disabled={isBusy}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.97] disabled:opacity-70"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Publish
          </button>
        )}

        <button
          data-testid={`delete-news-btn-${item.id}`}
          onClick={() => onDelete(item)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-zinc-400 transition-all hover:border-rose-500/40 hover:text-rose-300"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function AddNewsModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ title: "", source: "", original_content: "" });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.title.trim() || !form.original_content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/news`, {
        title: form.title,
        source: form.source || "Manual Entry",
        original_content: form.original_content,
      });
      toast.success("News item added to review queue");
      setForm({ title: "", source: "", original_content: "" });
      onCreated(data);
      onClose();
    } catch (e) {
      toast.error("Could not add news item");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111827] p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-zinc-100">Add News Item</h2>
          <button data-testid="close-add-news-btn" onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Title</label>
            <input
              data-testid="news-title-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-rose-500/50"
              placeholder="Enter headline"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Source</label>
            <input
              data-testid="news-source-input"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-rose-500/50"
              placeholder="e.g. Reuters, PTI"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Original Content</label>
            <textarea
              data-testid="news-content-input"
              value={form.original_content}
              onChange={(e) => setForm({ ...form, original_content: e.target.value })}
              rows={5}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-rose-500/50"
              placeholder="Paste the raw news draft (any language)"
            />
          </div>
          <button
            data-testid="submit-news-btn"
            onClick={submit}
            disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-rose-500 disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add to Review Queue
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function NewsDashboard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API}/news`);
      setItems(data);
    } catch (e) {
      toast.error("Failed to load news items");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRewrite = async (item) => {
    setBusy(item.id);
    try {
      const { data } = await axios.post(`${API}/news/${item.id}/approve-rewrite`);
      setItems((prev) => prev.map((i) => (i.id === item.id ? data : i)));
      toast.success("Content rewritten in journalistic Hindi", {
        description: "Status updated to Rewritten · Pending Publish",
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "AI rewrite failed");
    } finally {
      setBusy(null);
    }
  };

  const handlePublish = async (item) => {
    setBusy(item.id);
    try {
      const { data } = await axios.post(`${API}/news/${item.id}/publish`);
      setItems((prev) => prev.map((i) => (i.id === item.id ? data : i)));
      toast.success("News published");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Publish failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (item) => {
    try {
      await axios.delete(`${API}/news/${item.id}`);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Item removed");
    } catch (e) {
      toast.error("Delete failed");
    }
  };

  const counts = items.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  const visible = filter === "ALL" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-zinc-100">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600">
                <Newspaper className="h-5 w-5 text-white" />
              </span>
              <span className="font-hindi-display text-2xl text-rose-400">संवाद</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Editorial Moderation Desk
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Review incoming drafts and rewrite them into flawless journalistic Hindi.
            </p>
          </div>
          <button
            data-testid="add-news-btn"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-all hover:bg-white/10"
          >
            <Plus className="h-4 w-4" />
            Add News Item
          </button>
        </header>

        {/* Stat chips */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: "Pending_Review", label: "Pending Review" },
            { key: "Rewritten_Pending_Publish", label: "Rewritten" },
            { key: "Published", label: "Published" },
            { key: "TOTAL", label: "Total Items" },
          ].map((s) => (
            <div key={s.key} className="rounded-2xl border border-white/10 bg-[#111827] p-4">
              <p className="text-3xl font-bold text-zinc-100">
                {s.key === "TOTAL" ? items.length : counts[s.key] || 0}
              </p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              data-testid={`filter-tab-${f.key}`}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                filter === f.key
                  ? "bg-rose-600 text-white"
                  : "border border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-100"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading queue…
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-24 text-center text-zinc-500">
            No news items in this view.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {visible.map((item) => (
                <NewsCard
                  key={item.id}
                  item={item}
                  busy={busy}
                  onRewrite={handleRewrite}
                  onPublish={handlePublish}
                  onDelete={handleDelete}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AddNewsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(item) => setItems((prev) => [item, ...prev])}
      />
    </div>
  );
}
