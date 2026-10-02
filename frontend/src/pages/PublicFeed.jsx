import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Newspaper, Loader2, Lock, Clock } from "lucide-react";
import api, { apiError, imgSrc } from "@/lib/api";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1742805382149-3c2f0cd0f300?crop=entropy&cs=srgb&fm=jpg&q=85&w=800";

function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))} मिनट पहले`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} घंटे पहले`;
  return `${Math.floor(diff / 86400)} दिन पहले`;
}

export default function PublicFeed() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [active, setActive] = useState("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/categories").then((r) => setCats(r.data.categories)).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get("/public/news", { params: active === "ALL" ? {} : { category: active } })
      .then((r) => setItems(r.data))
      .catch((e) => console.error(apiError(e)))
      .finally(() => setLoading(false));
  }, [active]);

  const lead = items[0];
  const rest = items.slice(1);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-zinc-100">
      {/* Masthead */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0F17]/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5" data-testid="public-logo">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-600">
              <Newspaper className="h-5 w-5 text-white" />
            </span>
            <div className="leading-none">
              <span className="font-hindi-display text-2xl text-rose-400">संवाद</span>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500">Hindi News</p>
            </div>
          </Link>
          <Link
            to="/admin"
            data-testid="admin-login-link"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-zinc-300 transition-all hover:bg-white/10"
          >
            <Lock className="h-3.5 w-3.5" /> Admin
          </Link>
        </div>
        {/* Category ticker */}
        <div className="border-t border-white/5">
          <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 [scrollbar-width:none]">
            {["ALL", ...cats].map((c) => (
              <button
                key={c}
                data-testid={`public-cat-${c}`}
                onClick={() => setActive(c)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                  active === c ? "bg-rose-600 text-white" : "bg-white/5 text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {c === "ALL" ? "सभी खबरें" : c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="flex items-center justify-center py-32 text-zinc-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> खबरें लोड हो रही हैं…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-32 text-center">
            <p className="font-hindi text-lg text-zinc-400">अभी इस श्रेणी में कोई प्रकाशित खबर नहीं है।</p>
          </div>
        ) : (
          <>
            {/* Lead story */}
            <article
              data-testid={`public-lead-${lead.id}`}
              className="mb-10 grid gap-6 overflow-hidden rounded-3xl border border-white/10 bg-[#111827] md:grid-cols-2"
            >
              <div className="relative min-h-[260px]">
                <img
                  src={imgSrc(lead.image_url) || FALLBACK_IMG}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(e) => (e.currentTarget.src = FALLBACK_IMG)}
                />
                <span className="absolute left-4 top-4 rounded-full bg-rose-600 px-3 py-1 text-xs font-bold text-white">
                  {lead.category}
                </span>
              </div>
              <div className="flex flex-col justify-center p-6 md:p-8">
                <h1 className="font-hindi-display text-2xl leading-tight text-zinc-50 md:text-3xl">
                  {lead.rewritten_title}
                </h1>
                <p className="font-hindi mt-4 line-clamp-4 text-[15px] leading-relaxed text-zinc-400">
                  {lead.rewritten_content}
                </p>
                <div className="mt-5 flex items-center gap-2 text-xs text-zinc-500">
                  <Clock className="h-3.5 w-3.5" /> {timeAgo(lead.published_at)} · {lead.source}
                </div>
              </div>
            </article>

            {/* Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((item) => (
                <article
                  key={item.id}
                  data-testid={`public-article-${item.id}`}
                  className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#111827] transition-all hover:-translate-y-1 hover:border-rose-500/30"
                >
                  <div className="relative h-44">
                    <img
                      src={imgSrc(item.image_url) || FALLBACK_IMG}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => (e.currentTarget.src = FALLBACK_IMG)}
                    />
                    <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-rose-300 backdrop-blur">
                      {item.category}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="font-hindi-display text-lg leading-snug text-zinc-100">
                      {item.rewritten_title}
                    </h2>
                    <p className="font-hindi mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-zinc-400">
                      {item.rewritten_content}
                    </p>
                    <div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500">
                      <Clock className="h-3 w-3" /> {timeAgo(item.published_at)} · {item.source}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-zinc-600">
        © 2026 संवाद · Hindi News Desk
      </footer>
    </div>
  );
}
