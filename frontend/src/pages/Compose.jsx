import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Newspaper, ArrowLeft, Loader2, ImagePlus, Sparkles, Send, FileText, X,
} from "lucide-react";
import api, { apiError, imgSrc } from "@/lib/api";

export default function Compose() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ title: "", source: "", category: "", body: "", image_url: "" });
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(null); // 'review' | 'rewrite' | 'publish'

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data.categories)).catch(() => {});
  }, []);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { toast.error("Image must be under 6MB"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/upload-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, image_url: data.url }));
      toast.success("फोटो अपलोड हो गई");
    } catch (err) { toast.error(apiError(err)); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const create = async (publish) => {
    if (!form.title.trim()) { toast.error("शीर्षक आवश्यक है"); return null; }
    if (publish && !form.body.trim()) { toast.error("सीधे प्रकाशित करने के लिए खबर का टेक्स्ट आवश्यक है"); return null; }
    const { data } = await api.post("/news/manual", {
      original_title: form.title,
      original_content: form.body,
      category: form.category || "सामान्य",
      source: form.source || "Manual Entry",
      image_url: form.image_url || null,
      publish,
    });
    return data;
  };

  const saveReview = async () => {
    setBusy("review");
    try { const d = await create(false); if (d) { toast.success("समीक्षा कतार में जोड़ा गया"); navigate("/admin"); } }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(null); }
  };

  const saveAndRewrite = async () => {
    setBusy("rewrite");
    try {
      const d = await create(false);
      if (!d) return;
      await api.post(`/news/${d.id}/approve-rewrite`, {});
      toast.success("AI ने हिंदी में री-राइट कर दिया", { description: "समीक्षा में देखें और प्रकाशित करें" });
      navigate("/admin");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(null); }
  };

  const publishNow = async () => {
    setBusy("publish");
    try { const d = await create(true); if (d) { toast.success("खबर सीधे प्रकाशित हो गई"); navigate("/"); } }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-zinc-100">
      <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" data-testid="back-to-dashboard-link" className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <Newspaper className="h-4 w-4 text-rose-400" />
                <h1 className="font-display text-xl font-bold md:text-2xl">Manual Composer</h1>
              </div>
              <p className="mt-0.5 text-sm text-zinc-500">बाहरी खबर यहाँ पेस्ट करें, फोटो जोड़ें — समीक्षा में भेजें या सीधे प्रकाशित करें।</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Editor */}
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">शीर्षक · Headline</label>
              <input data-testid="compose-title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="font-hindi w-full rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-lg text-zinc-100 outline-none focus:border-rose-500/50" placeholder="खबर का शीर्षक लिखें" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">खबर · Body (paste here)</label>
              <textarea data-testid="compose-body-input" rows={16} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}
                className="font-hindi w-full resize-y rounded-xl border border-white/10 bg-[#111827] px-4 py-3 text-[15px] leading-relaxed text-zinc-100 outline-none focus:border-rose-500/50" placeholder="यहाँ बाहरी स्रोत से खबर कॉपी-पेस्ट करें…" />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-[#111827] p-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">फोटो · Photo</label>
              {form.image_url ? (
                <div className="relative">
                  <img src={imgSrc(form.image_url)} alt="" className="h-40 w-full rounded-xl object-cover" data-testid="compose-image-preview" />
                  <button data-testid="compose-remove-image" onClick={() => setForm({ ...form, image_url: "" })}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-black/20 text-zinc-500 hover:border-rose-500/40 hover:text-zinc-300">
                  {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
                  <span className="text-xs">{uploading ? "अपलोड हो रहा है…" : "फोटो अपलोड करें"}</span>
                  <input ref={fileRef} data-testid="compose-image-input" type="file" accept="image/*" onChange={upload} className="hidden" disabled={uploading} />
                </label>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#111827] p-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">श्रेणी · Category</label>
                <select data-testid="compose-category-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-rose-500/50">
                  <option value="">सामान्य</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">स्रोत · Source</label>
                <input data-testid="compose-source-input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-rose-500/50" placeholder="e.g. संवाददाता" />
              </div>
            </div>

            <div className="space-y-2">
              <button data-testid="compose-rewrite-btn" onClick={saveAndRewrite} disabled={!!busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-rose-500 disabled:opacity-70">
                {busy === "rewrite" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI से री-राइट करें
              </button>
              <button data-testid="compose-review-btn" onClick={saveReview} disabled={!!busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-zinc-100 transition-all hover:bg-white/10 disabled:opacity-70">
                {busy === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} समीक्षा में भेजें
              </button>
              <button data-testid="compose-publish-btn" onClick={publishNow} disabled={!!busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-500 disabled:opacity-70">
                {busy === "publish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} सीधे प्रकाशित करें
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
