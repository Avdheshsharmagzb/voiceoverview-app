import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Sparkles, Send, Loader2, Newspaper, Plus, Clock, CheckCircle2,
  FileText, Radio, Trash2, X, LogOut, DownloadCloud, Save, RefreshCw, Pencil, ImageIcon, ExternalLink, Settings2, Layers, Video, Film, Upload, ThumbsUp, ThumbsDown,
} from "lucide-react";
import api, { apiError, imgSrc } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STATUS_META = {
  Pending_Review: { label: "Pending Review", dot: "bg-amber-400", chip: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: Clock },
  Rewritten_Pending_Publish: { label: "Rewritten · Pending Publish", dot: "bg-indigo-400", chip: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30", icon: FileText },
  Published: { label: "Published", dot: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", icon: CheckCircle2 },
};

const FILTERS = [
  { key: "Pending_Review", label: "Pending Review" },
  { key: "Rewritten_Pending_Publish", label: "Rewritten" },
  { key: "Published", label: "Published" },
  { key: "ALL", label: "All" },
];

function StatusBadge({ status, id }) {
  const meta = STATUS_META[status] || STATUS_META.Pending_Review;
  const Icon = meta.icon;
  return (
    <span data-testid={`status-badge-${id}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${meta.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function VideoPanel({ item }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const pollRef = useRef(null);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  const fetchJob = async () => {
    try {
      const { data } = await api.get(`/news/${item.id}/video`);
      setJob(data);
      if (data && (data.status === "queued" || data.status === "processing")) startPoll();
      else stopPoll();
    } catch (e) { /* ignore */ } finally { setLoading(false); }
  };

  const startPoll = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/news/${item.id}/video`);
        setJob(data);
        if (!data || (data.status !== "queued" && data.status !== "processing")) stopPoll();
      } catch (e) { /* ignore */ }
    }, 4000);
  };

  useEffect(() => { fetchJob(); return stopPoll; }, [item.id]);

  const generate = async () => {
    setActing(true);
    try {
      const { data } = await api.post(`/news/${item.id}/generate-video`);
      setJob(data);
      toast.info("वीडियो बन रहा है… (GPU ऑटो-स्टार्ट)");
      startPoll();
    } catch (e) { toast.error(apiError(e)); } finally { setActing(false); }
  };

  const decide = async (action) => {
    setActing(true);
    try {
      const { data } = await api.post(`/video/${job.id}/${action}`);
      setJob(data);
      toast.success(action === "approve" ? "वीडियो अनुमोदित — वेबसाइट पर जाएगा" : "वीडियो अस्वीकृत");
    } catch (e) { toast.error(apiError(e)); } finally { setActing(false); }
  };

  const st = job?.status;
  const busyState = st === "queued" || st === "processing";

  return (
    <div data-testid={`video-panel-${item.id}`} className="mt-3 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/[0.04] p-3">
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-fuchsia-400">
        <Film className="h-3 w-3" /> AI वीडियो {job?.mocked && <span className="rounded bg-fuchsia-500/20 px-1.5 py-0.5 text-[8px] text-fuchsia-300">MOCK</span>}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> …</div>
      ) : busyState ? (
        <div className="flex items-center gap-2 text-xs text-fuchsia-300"><Loader2 className="h-3.5 w-3.5 animate-spin" /> वीडियो रेंडर हो रहा है…</div>
      ) : st === "failed" ? (
        <div className="space-y-2">
          <p className="text-xs text-rose-300">वीडियो बनाने में विफल: {job.error?.slice(0, 80)}</p>
          <button data-testid={`generate-video-btn-${item.id}`} onClick={generate} disabled={acting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-60">
            <RefreshCw className="h-3.5 w-3.5" /> फिर कोशिश करें
          </button>
        </div>
      ) : (st === "ready_for_approval" || st === "approved") ? (
        <div className="space-y-2">
          <video data-testid={`video-preview-${item.id}`} src={imgSrc(job.video_url)} controls
            className="w-full rounded-lg border border-white/10" style={{ maxHeight: 180 }} />
          {st === "approved" ? (
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300"><ThumbsUp className="h-3 w-3" /> अनुमोदित · वेबसाइट पर लाइव</span>
              <button data-testid={`regenerate-video-btn-${item.id}`} onClick={generate} disabled={acting}
                className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200"><RefreshCw className="h-3 w-3" /> नया बनाएं</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button data-testid={`approve-video-btn-${item.id}`} onClick={() => decide("approve")} disabled={acting}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60">
                <ThumbsUp className="h-3.5 w-3.5" /> अनुमोदित करें
              </button>
              <button data-testid={`reject-video-btn-${item.id}`} onClick={() => decide("reject")} disabled={acting}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/5 disabled:opacity-60">
                <ThumbsDown className="h-3.5 w-3.5" /> अस्वीकार
              </button>
            </div>
          )}
        </div>
      ) : (
        <button data-testid={`generate-video-btn-${item.id}`} onClick={generate} disabled={acting}
          className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-fuchsia-500 active:scale-[0.97] disabled:opacity-60">
          {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} Generate Video
        </button>
      )}
    </div>
  );
}

function AdminNewsCard({ item, busy, onRewrite, onReRewrite, onSave, onPublish, onDelete }) {
  const isPending = item.status === "Pending_Review";
  const isRewritten = item.status === "Rewritten_Pending_Publish";
  const isPublished = item.status === "Published";
  const isBusy = busy === item.id;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ rewritten_title: "", rewritten_content: "" });
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggestion, setSuggestion] = useState("");

  const startEdit = () => {
    setDraft({ rewritten_title: item.rewritten_title || "", rewritten_content: item.rewritten_content || "" });
    setEditing(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      data-testid={`news-item-card-${item.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111827] shadow-lg shadow-black/20"
    >
      {item.image_url && (
        <img src={imgSrc(item.image_url)} alt="" className="h-36 w-full object-cover" />
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            <Radio className="h-3.5 w-3.5" /> {item.category}
          </div>
          <StatusBadge status={item.status} id={item.id} />
        </div>

        <h3 className="font-display text-sm font-semibold leading-snug text-zinc-300">{item.original_title}</h3>
        <p data-testid={`original-content-pane-${item.id}`} className="mt-2 text-xs leading-relaxed text-zinc-500 line-clamp-3">
          {item.full_content || item.original_content}
        </p>
        {item.full_content && (
          <span className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-sky-300">
            <FileText className="h-2.5 w-2.5" /> पूरी खबर प्राप्त
          </span>
        )}

        {/* Rewritten / editable area */}
        {(isRewritten || isPublished) && (
          <div data-testid={`hindi-rewritten-pane-${item.id}`} className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-500">
              <Sparkles className="h-3 w-3" /> पत्रकारीय हिंदी
            </p>
            {editing ? (
              <div className="space-y-2">
                <input
                  data-testid={`edit-title-input-${item.id}`}
                  value={draft.rewritten_title}
                  onChange={(e) => setDraft({ ...draft, rewritten_title: e.target.value })}
                  className="font-hindi w-full rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-sm text-emerald-200 outline-none focus:border-emerald-500/50"
                />
                <textarea
                  data-testid={`edit-body-input-${item.id}`}
                  rows={6}
                  value={draft.rewritten_content}
                  onChange={(e) => setDraft({ ...draft, rewritten_content: e.target.value })}
                  className="font-hindi w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-sm text-emerald-200 outline-none focus:border-emerald-500/50"
                />
                <div className="flex gap-2">
                  <button
                    data-testid={`save-edit-btn-${item.id}`}
                    onClick={() => { onSave(item, draft); setEditing(false); }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    <Save className="h-3.5 w-3.5" /> Save
                  </button>
                  <button onClick={() => setEditing(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h4 className="font-hindi-display text-base leading-snug text-emerald-100">{item.rewritten_title}</h4>
                <p className="font-hindi mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-emerald-200/90 line-clamp-6">
                  {item.rewritten_content}
                </p>
              </>
            )}
          </div>
        )}

        {/* Suggestion box */}
        <AnimatePresence>
          {showSuggest && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3">
              <textarea
                data-testid={`suggestion-input-${item.id}`}
                rows={2}
                value={suggestion}
                onChange={(e) => setSuggestion(e.target.value)}
                placeholder="कैसे री-राइट करना है? सुझाव लिखें (जैसे: और सनसनीखेज़ शीर्षक बनाएं)"
                className="font-hindi w-full resize-none rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-sm text-zinc-200 outline-none focus:border-rose-500/50"
              />
              <div className="mt-2 flex gap-2">
                <button
                  data-testid={`apply-suggestion-btn-${item.id}`}
                  onClick={() => { onReRewrite(item, suggestion); setShowSuggest(false); }}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-60"
                >
                  {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Re-rewrite
                </button>
                <button onClick={() => setShowSuggest(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-400">Cancel</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
          {isPending && (
            <button
              data-testid={`approve-for-rewrite-btn-${item.id}`}
              onClick={() => onRewrite(item)}
              disabled={isBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition-all hover:bg-rose-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Rewriting in Hindi…</> : <><Sparkles className="h-4 w-4" /> Approve for Rewrite</>}
            </button>
          )}

          {isRewritten && (
            <>
              <button data-testid={`publish-news-btn-${item.id}`} onClick={() => onPublish(item)} disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.97] disabled:opacity-70">
                {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish
              </button>
              <button data-testid={`edit-news-btn-${item.id}`} onClick={startEdit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-zinc-300 hover:bg-white/5">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button data-testid={`rerewrite-news-btn-${item.id}`} onClick={() => setShowSuggest((s) => !s)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-zinc-300 hover:bg-white/5">
                <RefreshCw className="h-3.5 w-3.5" /> Re-rewrite
              </button>
            </>
          )}

          {isPublished && (
            <button data-testid={`edit-news-btn-${item.id}`} onClick={startEdit}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-zinc-300 hover:bg-white/5">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}

          <button data-testid={`delete-news-btn-${item.id}`} onClick={() => onDelete(item)}
            className="ml-auto inline-flex items-center rounded-xl border border-white/10 px-3 py-2.5 text-xs font-medium text-zinc-400 transition-all hover:border-rose-500/40 hover:text-rose-300">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <VideoPanel item={item} />

        {(item.resolved_url || item.source_url) && (
          <a
            data-testid={`source-link-${item.id}`}
            href={item.resolved_url || item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex w-fit items-center gap-1.5 text-[11px] font-medium text-sky-400 hover:text-sky-300 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> मूल स्रोत देखें
          </a>
        )}
      </div>
    </motion.div>
  );
}

function AddNewsModal({ open, onClose, categories, onCreated }) {
  const [form, setForm] = useState({ original_title: "", source: "", category: "", original_content: "", image_url: "" });
  const [saving, setSaving] = useState(false);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Image must be under 2MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image_url: reader.result }));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!form.original_title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const { data } = await api.post("/news", {
        original_title: form.original_title,
        original_content: form.original_content,
        source: form.source || "Manual Entry",
        category: form.category || "सामान्य",
        image_url: form.image_url || null,
      });
      toast.success("News item added to review queue");
      setForm({ original_title: "", source: "", category: "", original_content: "", image_url: "" });
      onCreated(data);
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-[#111827] p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-zinc-100">Add News Item</h2>
          <button data-testid="close-add-news-btn" onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Title</label>
            <input data-testid="news-title-input" value={form.original_title} onChange={(e) => setForm({ ...form, original_title: e.target.value })}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-rose-500/50" placeholder="Enter headline" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Source</label>
              <input data-testid="news-source-input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-rose-500/50" placeholder="e.g. PTI" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Category</label>
              <select data-testid="news-category-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-rose-500/50">
                <option value="">सामान्य</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Original Content</label>
            <textarea data-testid="news-content-input" rows={4} value={form.original_content} onChange={(e) => setForm({ ...form, original_content: e.target.value })}
              className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-rose-500/50" placeholder="Paste the raw draft (any language)" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Photo (optional)</label>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-zinc-300 hover:bg-white/5">
                <ImageIcon className="h-4 w-4" /> Upload
                <input data-testid="news-image-input" type="file" accept="image/*" onChange={onFile} className="hidden" />
              </label>
              {form.image_url && <img src={form.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />}
            </div>
          </div>
          <button data-testid="submit-news-btn" onClick={submit} disabled={saving}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-rose-500 disabled:opacity-70">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add to Review Queue
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function SchedulerModal({ open, onClose, onReload }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maint, setMaint] = useState(null); // 'backfill' | 'dedupe'
  const [logoUrl, setLogoUrl] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get("/fetch-config").then((r) => setRows(r.data.config)).catch((e) => toast.error(apiError(e))).finally(() => setLoading(false));
    api.get("/watermark").then((r) => setLogoUrl(r.data.logo_url)).catch(() => {});
  }, [open]);

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/watermark/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setLogoUrl(data.logo_url);
      toast.success("वॉटरमार्क लोगो सहेजा गया");
    } catch (err) { toast.error(apiError(err)); } finally { setLogoUploading(false); }
  };

  const update = (i, key, val) => setRows((p) => p.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/fetch-config", { config: rows });
      toast.success("फेच शेड्यूल सहेजा गया");
      onClose();
    } catch (e) { toast.error(apiError(e)); } finally { setSaving(false); }
  };

  const runBackfill = async () => {
    setMaint("backfill");
    try {
      const { data } = await api.post("/news/backfill");
      toast.success(`${data.queued} खबरों के लिए फोटो + पूरा टेक्स्ट लाया जा रहा है`, { description: "पृष्ठभूमि में चल रहा है — कुछ मिनटों में अपने आप अपडेट होगा" });
    } catch (e) { toast.error(apiError(e)); } finally { setMaint(null); }
  };

  const runDedupe = async () => {
    setMaint("dedupe");
    try {
      const { data } = await api.post("/news/dedupe");
      toast.success(`${data.removed} डुप्लिकेट खबरें हटाई गईं`);
      onReload?.();
    } catch (e) { toast.error(apiError(e)); } finally { setMaint(null); }
  };

  const total = rows.filter((r) => r.enabled).reduce((s, r) => s + Number(r.count || 0), 0);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-[#111827] p-6">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-zinc-100">Fetch Scheduler</h2>
          <button data-testid="close-scheduler-btn" onClick={onClose} className="text-zinc-500 hover:text-zinc-200"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-xs text-zinc-500">हर घंटे चलने वाले ऑटो-फेच और “Fetch Now” के लिए श्रेणियाँ, खोज शब्द और कितनी खबरें लानी हैं, यह चुनें। कुल सक्षम: <span className="font-semibold text-rose-300">{total}</span> खबरें/फेच।</p>

        {/* Watermark logo */}
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">वॉटरमार्क लोगो · Watermark Logo</p>
            <p className="mt-0.5 text-xs text-zinc-500">वीडियो और फोटो पर यह लोगो लगेगा (PNG पारदर्शी बेहतर)।</p>
          </div>
          {logoUrl && <img src={imgSrc(logoUrl)} alt="logo" data-testid="watermark-logo-preview" className="h-10 rounded bg-white/5 object-contain px-1" />}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-zinc-100 hover:bg-white/10">
            {logoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {logoUrl ? "बदलें" : "अपलोड"}
            <input data-testid="watermark-logo-input" type="file" accept="image/*" onChange={uploadLogo} className="hidden" disabled={logoUploading} />
          </label>
        </div>

        {/* Maintenance */}
        <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
          <span className="w-full text-[10px] font-bold uppercase tracking-widest text-zinc-500">रखरखाव · Maintenance</span>
          <button data-testid="backfill-btn" onClick={runBackfill} disabled={maint === "backfill"}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-60">
            {maint === "backfill" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />} Backfill Photos & Text
          </button>
          <button data-testid="dedupe-btn" onClick={runDedupe} disabled={maint === "dedupe"}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 disabled:opacity-60">
            {maint === "dedupe" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />} Remove Duplicates
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-zinc-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…</div>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div key={i} data-testid={`scheduler-row-${i}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                <input type="checkbox" data-testid={`scheduler-enabled-${i}`} checked={!!r.enabled} onChange={(e) => update(i, "enabled", e.target.checked)}
                  className="h-4 w-4 accent-rose-600" />
                <div className="min-w-0">
                  <p className="truncate font-hindi text-sm font-semibold text-zinc-200">{r.category}</p>
                  <input value={r.query} onChange={(e) => update(i, "query", e.target.value)}
                    className="font-hindi mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1 text-xs text-zinc-400 outline-none focus:border-rose-500/50" />
                </div>
                <input type="number" min="0" max="50" data-testid={`scheduler-count-${i}`} value={r.count}
                  onChange={(e) => update(i, "count", Number(e.target.value))}
                  className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-center text-sm text-zinc-100 outline-none focus:border-rose-500/50" />
              </div>
            ))}
          </div>
        )}
        <button data-testid="save-scheduler-btn" onClick={save} disabled={saving}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-rose-500 disabled:opacity-70">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Schedule
        </button>
      </motion.div>
    </div>
  );
}

export default function AdminDashboard() {  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("Pending_Review");
  const [catFilter, setCatFilter] = useState("ALL");
  const [busy, setBusy] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [limit, setLimit] = useState(48);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/news");
      setItems(data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/categories").then((r) => setCategories(r.data.categories)).catch(() => {}); }, []);

  const handleRewrite = async (item) => {
    setBusy(item.id);
    try {
      const { data } = await api.post(`/news/${item.id}/approve-rewrite`, {});
      setItems((p) => p.map((i) => (i.id === item.id ? data : i)));
      toast.success("हिंदी में री-राइट हो गया", { description: "Status → Rewritten · Pending Publish" });
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(null); }
  };

  const handleReRewrite = async (item, instructions) => {
    setBusy(item.id);
    try {
      const { data } = await api.post(`/news/${item.id}/approve-rewrite`, { instructions });
      setItems((p) => p.map((i) => (i.id === item.id ? data : i)));
      toast.success("सुझाव के अनुसार दोबारा री-राइट हुआ");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(null); }
  };

  const handleSave = async (item, draft) => {
    try {
      const { data } = await api.patch(`/news/${item.id}`, draft);
      setItems((p) => p.map((i) => (i.id === item.id ? data : i)));
      toast.success("बदलाव सहेजे गए");
    } catch (e) { toast.error(apiError(e)); }
  };

  const handlePublish = async (item) => {
    setBusy(item.id);
    try {
      const { data } = await api.post(`/news/${item.id}/publish`);
      setItems((p) => p.map((i) => (i.id === item.id ? data : i)));
      toast.success("खबर प्रकाशित हो गई");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(null); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/news/${item.id}`);
      setItems((p) => p.filter((i) => i.id !== item.id));
      toast.success("आइटम हटाया गया");
    } catch (e) { toast.error(apiError(e)); }
  };

  const handleFetch = async () => {
    setFetching(true);
    toast.info("समाचार स्रोतों से खबरें लाई जा रही हैं…");
    try {
      const { data } = await api.post("/news/fetch");
      toast.success(`${data.inserted} नई खबरें जुड़ीं`);
      await load();
    } catch (e) { toast.error(apiError(e)); } finally { setFetching(false); }
  };
  const doLogout = () => { logout(); navigate("/login"); };

  const counts = useMemo(() => items.reduce((a, i) => { a[i.status] = (a[i.status] || 0) + 1; return a; }, {}), [items]);

  const visible = useMemo(() => {
    let v = filter === "ALL" ? items : items.filter((i) => i.status === filter);
    if (catFilter !== "ALL") v = v.filter((i) => i.category === catFilter);
    return v;
  }, [items, filter, catFilter]);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-zinc-100">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600"><Newspaper className="h-5 w-5 text-white" /></span>
              <span className="font-hindi-display text-2xl text-rose-400">संवाद</span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Editorial Moderation Desk</h1>
            <p className="mt-1 text-sm text-zinc-500">नमस्ते {user?.name || "Admin"} · खबरों को आकर्षक पत्रकारीय हिंदी में री-राइट करें और प्रकाशित करें।</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button data-testid="fetch-news-btn" onClick={handleFetch} disabled={fetching}
              className="inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-300 transition-all hover:bg-rose-500/20 disabled:opacity-70">
              {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />} Fetch Now
            </button>
            <button data-testid="scheduler-btn" onClick={() => setSchedulerOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-semibold text-zinc-100 transition-all hover:bg-white/10">
              <Settings2 className="h-4 w-4" />
            </button>
            <button data-testid="compose-nav-btn" onClick={() => navigate("/admin/compose")}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-rose-500">
              <Pencil className="h-4 w-4" /> Compose
            </button>
            <button data-testid="add-news-btn" onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-all hover:bg-white/10">
              <Plus className="h-4 w-4" /> Quick Add
            </button>
            <button data-testid="logout-btn" onClick={doLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-100">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { key: "Pending_Review", label: "Pending Review" },
            { key: "Rewritten_Pending_Publish", label: "Rewritten" },
            { key: "Published", label: "Published" },
            { key: "TOTAL", label: "Total Items" },
          ].map((s) => (
            <div key={s.key} className="rounded-2xl border border-white/10 bg-[#111827] p-4">
              <p className="text-3xl font-bold text-zinc-100">{s.key === "TOTAL" ? items.length : counts[s.key] || 0}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.key} data-testid={`filter-tab-${f.key}`} onClick={() => { setFilter(f.key); setLimit(48); }}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${filter === f.key ? "bg-rose-600 text-white" : "border border-white/10 bg-white/5 text-zinc-400 hover:text-zinc-100"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="mb-6">
          <select data-testid="category-filter-select" value={catFilter} onChange={(e) => { setCatFilter(e.target.value); setLimit(48); }}
            className="rounded-xl border border-white/10 bg-[#111827] px-3.5 py-2 text-sm text-zinc-200 outline-none focus:border-rose-500/50">
            <option value="ALL">सभी श्रेणियाँ</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading queue…</div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-24 text-center text-zinc-500">No items in this view. Click “Fetch Now” to pull latest news.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.slice(0, limit).map((item) => (
                <AdminNewsCard key={item.id} item={item} busy={busy}
                  onRewrite={handleRewrite} onReRewrite={handleReRewrite} onSave={handleSave}
                  onPublish={handlePublish} onDelete={handleDelete} />
              ))}
            </div>
            {visible.length > limit && (
              <div className="mt-8 text-center">
                <button data-testid="load-more-btn" onClick={() => setLimit((l) => l + 48)}
                  className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium text-zinc-300 hover:bg-white/10">
                  Load more ({visible.length - limit} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <AddNewsModal open={modalOpen} onClose={() => setModalOpen(false)} categories={categories}
        onCreated={(item) => setItems((p) => [item, ...p])} />
      <SchedulerModal open={schedulerOpen} onClose={() => setSchedulerOpen(false)} onReload={load} />
    </div>
  );
}
