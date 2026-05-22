import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qjxeotvgnatsnaecesjl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wGS2qw38rGLjPI1daKMwDg_c2JflEu3";
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GENRES = ["Literary Fiction","Fiction","Memoir","Non-Fiction","Mystery","Sci-Fi","Fantasy","Historical Fiction","Romance","Thriller","Biography","Self-Help","Crime","Short Stories","Poetry"];
const MEMBERS = ["Ali","Bec","Cassie","Chloe","Chloe VN","Deem","Ellie","Emma","Erin","Evie","Gabby","Georgie","Hannah","Hannah G","Harriet","Izzy","Jorgia","Lara","Lillay","Maddie","Molly","Pip","Rachel","Ruby","Sanyogita","Soph","Tash"];];
const ADMIN = "Ellie";

function avgRating(ratings) {
  const vals = Object.values(ratings || {}).filter(v => v != null);
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

async function searchGoogleBooks(query) {
  if (!query || query.length < 3) return [];
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&langRestrict=en`);
    const data = await res.json();
    return (data.items || []).map(item => ({
      googleId: item.id,
      title: item.volumeInfo.title || "",
      author: (item.volumeInfo.authors || []).join(", "),
      genre: (item.volumeInfo.categories || ["Fiction"])[0].split("/")[0].trim(),
      description: item.volumeInfo.description || "",
      cover: item.volumeInfo.imageLinks?.thumbnail?.replace("http://","https://").replace("zoom=1","zoom=2") || null,
    }));
  } catch { return []; }
}

function StarRating({ value, onChange, readonly, size = 18 }) {
  return (
    <div className="star-row">
      {[...Array(10)].map((_, i) => (
        <button key={i} className={`star ${i < value ? "filled" : ""} ${readonly ? "readonly" : ""}`}
          style={{ fontSize: size }} onClick={() => !readonly && onChange?.(i + 1)} tabIndex={readonly ? -1 : 0}>★</button>
      ))}
      {value > 0 && <span className="star-label">{value}/10</span>}
    </div>
  );
}

function BookSearchInput({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef(null);

  function handleChange(e) {
    const v = e.target.value;
    setQuery(v);
    clearTimeout(timer.current);
    if (v.length < 3) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const r = await searchGoogleBooks(v);
      setResults(r);
      setSearching(false);
    }, 400);
  }

  function pick(book) {
    setQuery(book.title);
    setResults([]);
    onSelect(book);
  }

  return (
    <div style={{ position: "relative" }}>
      <input className="search-input" value={query} onChange={handleChange} placeholder="Search by title or author…" autoComplete="off"/>
      {searching && <div className="search-loading">Searching…</div>}
      {results.length > 0 && (
        <div className="search-dropdown">
          {results.map(b => (
            <div key={b.googleId} className="search-result" onClick={() => pick(b)}>
              {b.cover ? <img src={b.cover} alt="" className="search-cover"/> : <div className="search-cover-ph">📖</div>}
              <div>
                <div className="search-result-title">{b.title}</div>
                <div className="search-result-author">{b.author} · {b.genre}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BookClub() {
  const [currentUser, setCurrentUser] = useState("");
  const [books, setBooks] = useState([]);
  const [personalBooks, setPersonalBooks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [tab, setTab] = useState("library");
  const [loading, setLoading] = useState(true);

  const [showAddBook, setShowAddBook] = useState(false);
  const [showAddSugg, setShowAddSugg] = useState(false);
  const [showAddPersonal, setShowAddPersonal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [rateModal, setRateModal] = useState(null);
  const [commentModal, setCommentModal] = useState(null);
  const [myRating, setMyRating] = useState(7);
  const [myComment, setMyComment] = useState("");
  const [editForm, setEditForm] = useState({});

  const [aiRecs, setAiRecs] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);

  const emptyBook = { title:"", author:"", genre:"Literary Fiction", myRating:7, cover:null, description:"", googleId:null };
  const emptySugg = { title:"", author:"", genre:"Literary Fiction", reason:"", cover:null, description:"" };
  const emptyPersonal = { title:"", author:"", genre:"Literary Fiction", myRating:7, cover:null, description:"" };

  const [newBook, setNewBook] = useState(emptyBook);
  const [newSugg, setNewSugg] = useState(emptySugg);
  const [newPersonal, setNewPersonal] = useState(emptyPersonal);

  const fetchAll = useCallback(async () => {
    const [{ data: b }, { data: s }, { data: p }] = await Promise.all([
      supabase.from("books").select("*").order("created_at", { ascending: false }),
      supabase.from("suggestions").select("*").order("created_at", { ascending: false }),
      supabase.from("personal_books").select("*").order("created_at", { ascending: false }),
    ]);
    setBooks(b || []);
    setSuggestions(s || []);
    setPersonalBooks(p || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const subs = [
      supabase.channel("bc").on("postgres_changes", { event:"*", schema:"public", table:"books" }, fetchAll).subscribe(),
      supabase.channel("sg").on("postgres_changes", { event:"*", schema:"public", table:"suggestions" }, fetchAll).subscribe(),
      supabase.channel("pb").on("postgres_changes", { event:"*", schema:"public", table:"personal_books" }, fetchAll).subscribe(),
    ];
    return () => subs.forEach(s => s.unsubscribe());
  }, [fetchAll]);

  async function addBook() {
    if (!newBook.title.trim() || !newBook.author.trim()) return;
    if (!currentUser) { alert("Please select your name first!"); return; }
    const { error } = await supabase.from("books").insert({
      title: newBook.title.trim(), author: newBook.author.trim(),
      genre: newBook.genre, ratings: { [currentUser]: newBook.myRating },
      comments: {}, cover: newBook.cover || null,
      description: newBook.description || null,
      google_id: newBook.googleId || null, added_by: currentUser,
    });
    if (error) { alert("Error: " + error.message); return; }
    setNewBook(emptyBook);
    setShowAddBook(false);
  }

  async function deleteBook(id) {
    if (!confirm("Delete this book?")) return;
    await supabase.from("books").delete().eq("id", id);
  }

  async function saveEdit() {
    await supabase.from("books").update({
      title: editForm.title, author: editForm.author,
      genre: editForm.genre, cover: editForm.cover, description: editForm.description,
    }).eq("id", editModal.id);
    setEditModal(null);
  }

  async function rateBook(bookId) {
    const book = books.find(b => b.id === bookId);
    const updated = { ...(book.ratings || {}), [currentUser]: myRating };
    await supabase.from("books").update({ ratings: updated }).eq("id", bookId);
    setRateModal(null);
  }

  async function saveComment(bookId) {
    const book = books.find(b => b.id === bookId);
    const updated = { ...(book.comments || {}), [currentUser]: myComment };
    await supabase.from("books").update({ comments: updated }).eq("id", bookId);
    setCommentModal(null);
    setMyComment("");
  }

  async function addSuggestion() {
    if (!newSugg.title.trim() || !newSugg.author.trim()) return;
    if (!currentUser) { alert("Please select your name first!"); return; }
    const { error } = await supabase.from("suggestions").insert({
      title: newSugg.title.trim(), author: newSugg.author.trim(),
      genre: newSugg.genre, reason: newSugg.reason.trim(),
      suggested_by: currentUser, votes: [currentUser],
      cover: newSugg.cover || null, description: newSugg.description || null,
    });
    if (error) { alert("Error: " + error.message); return; }
    setNewSugg(emptySugg);
    setShowAddSugg(false);
  }

  async function deleteSuggestion(id) {
    if (!confirm("Delete this suggestion?")) return;
    await supabase.from("suggestions").delete().eq("id", id);
  }

  async function toggleVote(sugg) {
    const has = (sugg.votes || []).includes(currentUser);
    const updated = has ? sugg.votes.filter(v => v !== currentUser) : [...(sugg.votes||[]), currentUser];
    await supabase.from("suggestions").update({ votes: updated }).eq("id", sugg.id);
  }

  async function addPersonalBook() {
    if (!newPersonal.title.trim() || !newPersonal.author.trim()) return;
    if (!currentUser) { alert("Please select your name first!"); return; }
    const { error } = await supabase.from("personal_books").insert({
      title: newPersonal.title.trim(), author: newPersonal.author.trim(),
      genre: newPersonal.genre, rating: newPersonal.myRating,
      cover: newPersonal.cover || null, description: newPersonal.description || null,
      member: currentUser,
    });
    if (error) { alert("Error: " + error.message); return; }
    setNewPersonal(emptyPersonal);
    setShowAddPersonal(false);
  }

  async function deletePersonalBook(id) {
    if (!confirm("Delete this book?")) return;
    await supabase.from("personal_books").delete().eq("id", id);
  }

  async function getAIRecs() {
    setAiLoading(true);
    const bookSummary = books.map(b =>
      `"${b.title}" by ${b.author} (${b.genre}) - avg ${avgRating(b.ratings)||"unrated"}/10${b.description ? `. About: ${b.description.slice(0,120)}` : ""}. Ratings: ${Object.entries(b.ratings||{}).map(([m,r])=>`${m}:${r}`).join(", ")}`
    ).join("\n");
    const suggSummary = suggestions.map(s =>
      `"${s.title}" by ${s.author} (${s.genre})${s.reason ? `. Why: ${s.reason}` : ""} — ${s.votes?.length||0} vote(s)`
    ).join("\n");
    const prompt = `You are a book recommendation expert for a book club of ${MEMBERS.length} women: ${MEMBERS.join(", ")}.
BOOKS ALREADY READ:\n${bookSummary || "None yet"}
MEMBER SUGGESTIONS:\n${suggSummary || "None yet"}
Return a ranked list of exactly 10 book recommendations. Prioritise suggestions if they fit well.
Respond ONLY with a valid JSON array, no markdown:
[{"rank":1,"title":"","author":"","genre":"","fromSuggestions":false,"whyThisBook":"2 sentences","matchScore":85}]`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type":"application/json", "x-api-key":ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:2000, messages:[{ role:"user", content:prompt }] })
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type==="text")?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const enriched = await Promise.all(parsed.map(async rec => {
        const results = await searchGoogleBooks(`${rec.title} ${rec.author}`);
        return { ...rec, cover: results[0]?.cover || null };
      }));
      setAiRecs(enriched);
    } catch(e) {
      setAiRecs([{ error: true }]);
    }
    setAiLoading(false);
  }

  const sortedBooks = [...books].sort((a,b) => (parseFloat(avgRating(b.ratings))||0)-(parseFloat(avgRating(a.ratings))||0));
  const sortedSuggs = [...suggestions].sort((a,b) => (b.votes?.length||0)-(a.votes?.length||0));
  const myPersonalBooks = personalBooks.filter(b => b.member === currentUser);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'Barlow Condensed',sans-serif",fontSize:52,fontWeight:900,color:"#C8391B",textTransform:"uppercase",letterSpacing:-2,background:"#F5F2EC"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@900&display=swap');*{margin:0;padding:0;box-sizing:border-box}`}</style>
      BOOKED.IN
    </div>
  );

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;0,700;0,800;0,900;1,700;1,900&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Serif+Display:ital@0;1&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#F5F2EC;
      --card:#FDFCF9;
      --red:#C8391B;
      --yellow:#F0C93A;
      --black:#1A1208;
      --border:#DDD8CE;
      --mid:#8A8278;
      --D:'Barlow Condensed',sans-serif;
      --S:'DM Serif Display',serif;
      --B:'DM Sans',sans-serif;
    }
    body{background:var(--bg);font-family:var(--B);color:var(--black);-webkit-font-smoothing:antialiased}
    .app{min-height:100vh}

    /* ── HEADER ── */
    .hdr{
      background:var(--bg);
      border-bottom:1.5px solid var(--border);
      padding:0 32px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      position:sticky;
      top:0;
      z-index:200;
      gap:16px;
      height:56px;
    }
    .logo{font-family:var(--D);font-size:28px;font-weight:900;text-transform:uppercase;letter-spacing:-0.5px;color:var(--black);line-height:1}
    .logo span{color:var(--red)}
    .hdr-right{display:flex;align-items:center;gap:10px}
    .user-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mid)}
    .user-dropdown{
      appearance:none;-webkit-appearance:none;
      background:var(--card);
      border:1.5px solid var(--border);
      border-radius:6px;
      padding:6px 28px 6px 10px;
      font-family:var(--D);
      font-size:15px;
      font-weight:700;
      text-transform:uppercase;
      letter-spacing:.02em;
      color:var(--black);
      cursor:pointer;
      outline:none;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%231A1208' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat:no-repeat;
      background-position:right 9px center;
      transition:border-color .12s;
      min-width:120px;
    }
    .user-dropdown:focus{border-color:var(--red)}
    .user-dropdown.unset{color:var(--mid);border-color:var(--red);border-style:dashed}

    /* ── SLIM HERO ── */
    .hero{
      background:var(--red);
      padding:14px 32px;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:16px;
      border-bottom:1.5px solid var(--black);
      flex-wrap:wrap;
    }
    .hero-title{
      font-family:var(--D);
      font-size:clamp(28px,4vw,44px);
      font-weight:900;
      text-transform:uppercase;
      letter-spacing:-1px;
      line-height:1;
      color:#fff;
    }
    .hero-title em{color:var(--yellow);font-style:italic}
    .hero-stats{display:flex;gap:2px}
    .hstat{background:#fff;padding:8px 14px;text-align:center;min-width:64px}
    .hstat:first-child{border-radius:4px 0 0 4px}
    .hstat:last-child{border-radius:0 4px 4px 0}
    .hstat-n{font-family:var(--D);font-size:24px;font-weight:900;line-height:1;color:var(--red)}
    .hstat-l{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--mid);margin-top:1px}

    /* ── TABS ── */
    .tabs{
      display:flex;
      background:var(--bg);
      border-bottom:1.5px solid var(--border);
      padding:0 32px;
      overflow-x:auto;
      gap:0;
    }
    .tbtn{
      background:none;border:none;
      border-bottom:2px solid transparent;
      margin-bottom:-1.5px;
      padding:12px 16px 12px 0;
      font-family:var(--B);
      font-size:13px;
      font-weight:600;
      cursor:pointer;
      color:var(--mid);
      transition:all .12s;
      white-space:nowrap;
      margin-right:12px;
      letter-spacing:.01em;
    }
    .tbtn.on{color:var(--black);border-bottom-color:var(--red)}
    .tbtn:hover:not(.on){color:var(--black)}

    /* ── CONTENT ── */
    .content{padding:28px 32px;max-width:900px}

    .section-hdr{display:flex;align-items:baseline;gap:10px;margin-bottom:20px}
    .section-title{font-family:var(--S);font-size:26px;font-weight:400;font-style:italic;letter-spacing:-.3px}
    .section-count{font-size:13px;color:var(--mid);font-family:var(--B)}

    /* ── BOOK CARDS ── */
    .blist{display:flex;flex-direction:column;gap:2px}
    .bcard{
      background:var(--card);
      border:1px solid var(--border);
      border-radius:8px;
      padding:14px 16px;
      display:flex;
      gap:14px;
      align-items:flex-start;
      transition:border-color .15s, box-shadow .15s;
    }
    .bcard:hover{border-color:var(--black);box-shadow:0 2px 12px rgba(26,18,8,.08)}
    .bcover{width:48px;height:68px;object-fit:cover;border-radius:4px;border:1px solid var(--border);flex-shrink:0;background:var(--bg)}
    .bcover-ph{width:48px;height:68px;background:var(--border);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--mid)}
    .brank{font-family:var(--D);font-size:18px;font-weight:700;color:var(--border);min-width:26px;line-height:1;padding-top:4px;flex-shrink:0}
    .brank.top{color:var(--yellow);-webkit-text-stroke:1px #b8860b}
    .binfo{flex:1;min-width:0}
    .btitle{font-family:var(--D);font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:-.1px;line-height:1.1}
    .bauthor{font-size:12px;color:var(--mid);margin-top:2px;font-style:italic}
    .bgenre{display:inline-block;background:var(--yellow);border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:2px 6px;margin-top:5px;color:var(--black)}
    .bratings{display:flex;gap:3px;margin-top:8px;flex-wrap:wrap}
    .mrat{font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:2px 6px;display:flex;align-items:center;gap:3px}
    .mrat.unrated{opacity:.3}
    .mrat .who2{color:var(--mid);font-size:10px}
    .mrat .sc{font-weight:600;color:var(--red)}
    .bcomments{margin-top:8px;display:flex;flex-direction:column;gap:3px}
    .bcomment{font-size:12px;background:var(--bg);border-left:2px solid var(--yellow);padding:4px 8px;border-radius:0 3px 3px 0;color:var(--mid)}
    .bcomment strong{color:var(--black);margin-right:4px;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    .addedbylbl{font-size:10px;color:var(--border);margin-top:3px}
    .bright{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0}
    .avgscore{font-family:var(--D);font-size:34px;font-weight:900;line-height:1;color:var(--black)}
    .avglbl{font-size:9px;color:var(--mid);text-transform:uppercase;letter-spacing:.08em;text-align:right}
    .btn-row{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;margin-top:4px}
    .ratebtn{background:var(--red);color:#fff;border:none;border-radius:4px;padding:4px 10px;font-size:11px;font-weight:600;font-family:var(--B);cursor:pointer;transition:all .12s}
    .ratebtn:hover{background:var(--black)}
    .commentbtn{background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:4px 10px;font-size:11px;font-family:var(--B);cursor:pointer;transition:all .12s;color:var(--mid)}
    .commentbtn:hover{border-color:var(--black);color:var(--black)}
    .iconbtn{background:none;border:1px solid var(--border);border-radius:4px;padding:4px 7px;font-size:11px;cursor:pointer;transition:all .12s;color:var(--mid)}
    .iconbtn:hover{border-color:var(--black);color:var(--black)}
    .delbtn{background:none;border:1px solid var(--border);border-radius:4px;padding:4px 7px;font-size:11px;cursor:pointer;color:var(--mid);transition:all .12s}
    .delbtn:hover{border-color:var(--red);color:var(--red)}

    /* ── STARS ── */
    .star-row{display:flex;align-items:center;gap:1px;flex-wrap:wrap}
    .star{background:none;border:none;cursor:pointer;color:var(--border);padding:0;transition:color .1s;line-height:1}
    .star.filled{color:var(--yellow)}
    .star.readonly{cursor:default}
    .star-label{font-size:13px;font-weight:600;margin-left:6px;color:var(--red);font-family:var(--D)}

    /* ── SUGGESTIONS ── */
    .slist{display:flex;flex-direction:column;gap:2px}
    .scard{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px;transition:border-color .15s,box-shadow .15s}
    .scard:hover{border-color:var(--black);box-shadow:0 2px 12px rgba(26,18,8,.08)}
    .sinfo{flex:1;min-width:0}
    .stitle{font-family:var(--D);font-size:17px;font-weight:800;text-transform:uppercase;letter-spacing:-.1px}
    .sauthor{font-size:12px;color:var(--mid);font-style:italic;margin-top:1px}
    .smeta{font-size:10px;color:var(--mid);margin-top:3px;text-transform:uppercase;letter-spacing:.05em}
    .sreason{font-size:12px;color:var(--black);margin-top:6px;padding-left:8px;border-left:2px solid var(--yellow);font-style:italic;color:var(--mid)}
    .voters{font-size:11px;color:var(--mid);margin-top:4px}
    .vbtn{display:flex;flex-direction:column;align-items:center;gap:1px;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:7px 11px;cursor:pointer;font-family:var(--B);transition:all .12s;min-width:46px;flex-shrink:0}
    .vbtn.on{background:var(--red);border-color:var(--red);color:#fff}
    .vbtn:hover:not(.on){border-color:var(--black)}
    .vcnt{font-family:var(--D);font-size:18px;font-weight:900;line-height:1}
    .vlbl{font-size:9px;text-transform:uppercase;letter-spacing:.07em}

    /* ── PERSONAL ── */
    .personal-grid{display:flex;flex-direction:column;gap:2px}
    .personal-who{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:20px}
    .pwho-btn{background:none;border:1px solid var(--border);border-radius:20px;padding:5px 14px;font-size:12px;font-family:var(--B);font-weight:500;cursor:pointer;color:var(--mid);transition:all .12s}
    .pwho-btn.on{background:var(--black);color:#fff;border-color:var(--black)}
    .pwho-btn:hover:not(.on){border-color:var(--black);color:var(--black)}
    .personal-empty{text-align:center;padding:32px;color:var(--mid);font-size:13px;font-style:italic}

    /* ── AI ── */
    .ai-intro{font-size:13px;color:var(--mid);margin-bottom:18px;line-height:1.6;max-width:500px}
    .aibtn{padding:12px 24px;background:var(--red);color:#fff;border:none;border-radius:6px;font-family:var(--D);font-size:18px;font-weight:900;text-transform:uppercase;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:8px;letter-spacing:.02em}
    .aibtn:hover{background:var(--black)}
    .aibtn:disabled{opacity:.5;cursor:not-allowed}
    .ai-view-only{background:var(--card);border:1px solid var(--border);border-radius:6px;padding:12px 16px;font-size:13px;color:var(--mid);margin-bottom:18px;max-width:480px}
    .ai-view-only strong{color:var(--black)}
    .recs-list{display:flex;flex-direction:column;gap:2px;margin-top:20px;max-width:680px}
    .rec-card{background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;display:flex;transition:border-color .15s,box-shadow .15s}
    .rec-card:hover{border-color:var(--black);box-shadow:0 2px 12px rgba(26,18,8,.08)}
    .rec-rank-col{background:var(--red);padding:12px 14px;display:flex;align-items:center;justify-content:center;min-width:48px;flex-shrink:0}
    .rec-rank-num{font-family:var(--D);font-size:26px;font-weight:900;color:#fff;line-height:1}
    .rec-rank-num.gold{color:var(--yellow)}
    .rec-cover{width:54px;height:78px;object-fit:cover;flex-shrink:0}
    .rec-cover-ph{width:54px;height:78px;background:var(--bg);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--mid)}
    .rec-body{padding:12px 14px;flex:1;min-width:0}
    .rec-title{font-family:var(--D);font-size:17px;font-weight:800;text-transform:uppercase;letter-spacing:-.1px;color:var(--black);line-height:1.1}
    .rec-author{font-size:11px;color:var(--mid);font-style:italic;margin-top:3px}
    .rec-why{font-size:12px;line-height:1.6;margin-top:6px;color:var(--mid)}
    .rec-footer{display:flex;align-items:center;gap:8px;margin-top:7px}
    .rec-match{display:inline-block;background:var(--yellow);color:var(--black);font-family:var(--D);font-size:12px;font-weight:700;border-radius:3px;padding:2px 8px}
    .rec-from{display:inline-block;background:var(--bg);border:1px solid var(--border);font-size:10px;border-radius:3px;padding:2px 7px;text-transform:uppercase;letter-spacing:.05em;color:var(--mid)}
    .no-recs{padding:32px 0;color:var(--mid);font-size:13px;font-style:italic}

    /* ── FORMS ── */
    .addbtn{display:flex;align-items:center;gap:7px;background:none;border:1px dashed var(--border);border-radius:6px;padding:11px 16px;width:100%;cursor:pointer;color:var(--mid);font-family:var(--B);font-size:13px;transition:all .12s;margin-top:10px}
    .addbtn:hover{border-color:var(--black);color:var(--black);background:var(--card)}
    .aform{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:18px;margin-top:10px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 12px rgba(26,18,8,.06)}
    .frow{display:flex;gap:10px;flex-wrap:wrap}
    .fgrp{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px}
    .fgrp label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:600;color:var(--mid)}
    .fgrp input,.fgrp select,.fgrp textarea{padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;font-family:var(--B);font-size:13px;color:var(--black);outline:none;transition:border-color .12s;width:100%}
    .fgrp textarea{resize:vertical;min-height:65px}
    .fgrp input:focus,.fgrp select:focus,.fgrp textarea:focus{border-color:var(--red)}
    .factions{display:flex;gap:7px;margin-top:2px}
    .bprimary{background:var(--black);color:#fff;border:none;border-radius:5px;padding:9px 18px;font-family:var(--B);font-size:12px;font-weight:600;cursor:pointer;transition:all .12s}
    .bprimary:hover{background:var(--red)}
    .bcancel{background:none;border:1px solid var(--border);border-radius:5px;color:var(--mid);padding:9px 14px;font-family:var(--B);font-size:12px;cursor:pointer;transition:all .12s}
    .bcancel:hover{border-color:var(--black);color:var(--black)}
    .rlbl{font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:var(--mid);margin-bottom:7px;font-weight:600}
    .selected-cover{display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:5px}
    .selected-cover img{width:32px;height:46px;object-fit:cover;border-radius:3px}
    .selected-cover span{font-size:12px;color:var(--mid);font-style:italic}

    /* ── SEARCH ── */
    .search-input{padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;font-family:var(--B);font-size:13px;color:var(--black);outline:none;width:100%;transition:border-color .12s}
    .search-input:focus{border-color:var(--red)}
    .search-loading{font-size:12px;color:var(--mid);padding:5px 0;font-style:italic}
    .search-dropdown{position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid var(--black);border-top:none;border-radius:0 0 6px 6px;z-index:300;box-shadow:0 8px 24px rgba(26,18,8,.12);max-height:260px;overflow-y:auto}
    .search-result{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--border)}
    .search-result:last-child{border-bottom:none}
    .search-result:hover{background:var(--bg)}
    .search-cover{width:28px;height:40px;object-fit:cover;border-radius:2px;flex-shrink:0}
    .search-cover-ph{width:28px;height:40px;background:var(--border);border-radius:2px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px}
    .search-result-title{font-family:var(--D);font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:-.1px}
    .search-result-author{font-size:11px;color:var(--mid);font-style:italic;margin-top:1px}

    /* ── MODAL ── */
    .overlay{position:fixed;inset:0;background:rgba(26,18,8,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px}
    .modal{background:#fff;border-radius:10px;border:1px solid var(--border);padding:24px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(26,18,8,.2);max-height:90vh;overflow-y:auto}
    .modal h3{font-family:var(--S);font-size:20px;font-weight:400;font-style:italic;margin-bottom:3px}
    .modal p{font-size:12px;color:var(--mid);margin-bottom:14px}
    .modal-textarea{padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-family:var(--B);font-size:13px;outline:none;resize:vertical;width:100%;min-height:80px;transition:border-color .12s}
    .modal-textarea:focus{border-color:var(--red)}

    .empty{text-align:center;padding:40px 28px;color:var(--mid)}
    .empty-title{font-family:var(--S);font-size:22px;font-style:italic;color:var(--border)}
    .empty-sub{font-size:13px;margin-top:4px}
    .need-name{background:var(--yellow);border-radius:5px;padding:9px 14px;font-size:13px;font-weight:500;margin-bottom:12px;color:var(--black)}
    .aierr{margin-top:14px;padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--red);font-size:13px}

    @media(max-width:640px){
      .hdr{padding:0 16px}
      .hero{padding:12px 16px}
      .tabs{padding:0 16px}
      .content{padding:20px 16px}
      .bcard{flex-wrap:wrap}
      .bright{flex-direction:row;align-items:center;width:100%}
    }
  `;

  return (
    <div className="app">
      <style>{CSS}</style>

      {/* ── HEADER ── */}
      <div className="hdr">
        <div className="logo">BOOKED<span>.</span>IN</div>
        <div className="hdr-right">
          <span className="user-label">Who are you?</span>
          <select className={`user-dropdown ${!currentUser?"unset":""}`} value={currentUser} onChange={e=>setCurrentUser(e.target.value)}>
            <option value="">Select name…</option>
            {MEMBERS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* ── SLIM HERO ── */}
      <div className="hero">
        <div className="hero-title">
          {tab==="library"&&<><em>Our</em> Reading List</>}
          {tab==="suggestions"&&<>What&apos;s <em>Next?</em></>}
          {tab==="recommend"&&<>AI <em>Top 10</em></>}
          {tab==="personal"&&<><em>My</em> Books</>}
        </div>
        <div className="hero-stats">
          <div className="hstat"><div className="hstat-n">{books.length}</div><div className="hstat-l">Read</div></div>
          <div className="hstat"><div className="hstat-n">{books.length?(books.reduce((s,b)=>s+(parseFloat(avgRating(b.ratings))||0),0)/books.length).toFixed(1):"—"}</div><div className="hstat-l">Avg</div></div>
          <div className="hstat"><div className="hstat-n">{suggestions.length}</div><div className="hstat-l">Ideas</div></div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="tabs">
        {[["library","📚 Library"],["suggestions","💡 Suggestions"],["recommend","✨ AI Top 10"],["personal","👤 My Books"]].map(([id,lbl])=>(
          <button key={id} className={`tbtn ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{lbl}</button>
        ))}
      </div>

      <div className="content">

        {/* ── LIBRARY ── */}
        {tab==="library"&&(
          <div>
            <div className="section-hdr">
              <div className="section-title">Books we've read</div>
              <div className="section-count">{books.length} books</div>
            </div>
            {sortedBooks.length===0&&<div className="empty"><div className="empty-title">Nothing here yet</div><div className="empty-sub">Add your first book below</div></div>}
            <div className="blist">
              {sortedBooks.map((book,i)=>(
                <div key={book.id} className="bcard">
                  {book.cover?<img src={book.cover} alt="" className="bcover"/>:<div className="bcover-ph">📖</div>}
                  <div className={`brank ${i===0?"top":""}`}>#{i+1}</div>
                  <div className="binfo">
                    <div className="btitle">{book.title}</div>
                    <div className="bauthor">{book.author}</div>
                    <span className="bgenre">{book.genre}</span>
                    <div className="bratings">
                      {Object.entries(book.ratings||{}).map(([m,r])=>(
                        <div key={m} className="mrat"><span className="who2">{m}</span><span className="sc">{r}/10</span></div>
                      ))}
                      {MEMBERS.filter(m=>!(book.ratings||{})[m]).map(m=>(
                        <div key={m} className="mrat unrated"><span className="who2">{m}</span><span className="sc">–</span></div>
                      ))}
                    </div>
                    {Object.entries(book.comments||{}).length>0&&(
                      <div className="bcomments">
                        {Object.entries(book.comments||{}).map(([m,c])=>(
                          <div key={m} className="bcomment"><strong>{m}</strong>{c}</div>
                        ))}
                      </div>
                    )}
                    <div className="addedbylbl">Added by {book.added_by}</div>
                  </div>
                  <div className="bright">
                    <div><div className="avgscore">{avgRating(book.ratings)||"—"}</div><div className="avglbl">avg/10</div></div>
                    <div className="btn-row">
                      {currentUser&&!(book.ratings||{})[currentUser]&&(
                        <button className="ratebtn" onClick={()=>{setRateModal(book);setMyRating(7)}}>Rate</button>
                      )}
                      {currentUser&&(
                        <button className="commentbtn" onClick={()=>{setCommentModal(book);setMyComment((book.comments||{})[currentUser]||"")}}>
                          {(book.comments||{})[currentUser]?"Edit note":"Note"}
                        </button>
                      )}
                      <button className="iconbtn" onClick={()=>{setEditModal(book);setEditForm({title:book.title,author:book.author,genre:book.genre,cover:book.cover,description:book.description})}}>✏️</button>
                      <button className="delbtn" onClick={()=>deleteBook(book.id)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!currentUser&&<div className="need-name">Select your name at the top to add or rate books.</div>}
            {currentUser&&(showAddBook?(
              <div className="aform">
                <div className="fgrp" style={{position:"relative"}}>
                  <label>Search for a book</label>
                  <BookSearchInput onSelect={b=>setNewBook(n=>({...n,title:b.title,author:b.author,genre:b.genre,cover:b.cover,description:b.description,googleId:b.googleId}))}/>
                </div>
                {newBook.cover&&<div className="selected-cover"><img src={newBook.cover} alt=""/><span>{newBook.title} — cover found ✓</span></div>}
                <div className="frow">
                  <div className="fgrp"><label>Title</label><input value={newBook.title} onChange={e=>setNewBook(b=>({...b,title:e.target.value}))} placeholder="Book title"/></div>
                  <div className="fgrp"><label>Author</label><input value={newBook.author} onChange={e=>setNewBook(b=>({...b,author:e.target.value}))} placeholder="Author name"/></div>
                </div>
                <div className="frow">
                  <div className="fgrp"><label>Genre</label><select value={newBook.genre} onChange={e=>setNewBook(b=>({...b,genre:e.target.value}))}>{GENRES.map(g=><option key={g}>{g}</option>)}</select></div>
                </div>
                <div><div className="rlbl">Your Rating</div><StarRating value={newBook.myRating} onChange={v=>setNewBook(b=>({...b,myRating:v}))}/></div>
                <div className="factions">
                  <button className="bprimary" onClick={addBook}>Add Book</button>
                  <button className="bcancel" onClick={()=>setShowAddBook(false)}>Cancel</button>
                </div>
              </div>
            ):(
              <button className="addbtn" onClick={()=>setShowAddBook(true)}>＋ Add a book we've read</button>
            ))}
          </div>
        )}

        {/* ── SUGGESTIONS ── */}
        {tab==="suggestions"&&(
          <div>
            <div className="section-hdr">
              <div className="section-title">Suggestions</div>
              <div className="section-count">{suggestions.length} ideas</div>
            </div>
            {sortedSuggs.length===0&&<div className="empty"><div className="empty-title">No suggestions yet</div><div className="empty-sub">Be the first!</div></div>}
            <div className="slist">
              {sortedSuggs.map(s=>(
                <div key={s.id} className="scard">
                  {s.cover?<img src={s.cover} alt="" className="bcover"/>:<div className="bcover-ph">📚</div>}
                  <div className="sinfo">
                    <div className="stitle">{s.title}</div>
                    <div className="sauthor">{s.author}</div>
                    <div className="smeta">{s.genre} · Suggested by {s.suggested_by}</div>
                    {s.reason&&<div className="sreason">{s.reason}</div>}
                    {s.votes?.length>0&&<div className="voters">👍 {s.votes.join(", ")}</div>}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end",flexShrink:0}}>
                    {currentUser&&(
                      <button className={`vbtn ${s.votes?.includes(currentUser)?"on":""}`} onClick={()=>toggleVote(s)}>
                        <span className="vcnt">{s.votes?.length||0}</span>
                        <span className="vlbl">{s.votes?.includes(currentUser)?"✓":"Vote"}</span>
                      </button>
                    )}
                    <button className="delbtn" onClick={()=>deleteSuggestion(s.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            {!currentUser&&<div className="need-name">Select your name at the top to add suggestions.</div>}
            {currentUser&&(showAddSugg?(
              <div className="aform">
                <div className="fgrp" style={{position:"relative"}}>
                  <label>Search for a book</label>
                  <BookSearchInput onSelect={b=>setNewSugg(s=>({...s,title:b.title,author:b.author,genre:b.genre,cover:b.cover,description:b.description}))}/>
                </div>
                {newSugg.cover&&<div className="selected-cover"><img src={newSugg.cover} alt=""/><span>{newSugg.title} — cover found ✓</span></div>}
                <div className="frow">
                  <div className="fgrp"><label>Title</label><input value={newSugg.title} onChange={e=>setNewSugg(s=>({...s,title:e.target.value}))} placeholder="Book title"/></div>
                  <div className="fgrp"><label>Author</label><input value={newSugg.author} onChange={e=>setNewSugg(s=>({...s,author:e.target.value}))} placeholder="Author"/></div>
                </div>
                <div className="frow">
                  <div className="fgrp"><label>Genre</label><select value={newSugg.genre} onChange={e=>setNewSugg(s=>({...s,genre:e.target.value}))}>{GENRES.map(g=><option key={g}>{g}</option>)}</select></div>
                </div>
                <div className="fgrp"><label>Why this book? (optional)</label><textarea value={newSugg.reason} onChange={e=>setNewSugg(s=>({...s,reason:e.target.value}))} placeholder="Tell the group why you'd love it…"/></div>
                <div className="factions">
                  <button className="bprimary" onClick={addSuggestion}>Submit</button>
                  <button className="bcancel" onClick={()=>setShowAddSugg(false)}>Cancel</button>
                </div>
              </div>
            ):(
              <button className="addbtn" onClick={()=>setShowAddSugg(true)}>＋ Suggest our next book</button>
            ))}
          </div>
        )}

        {/* ── AI TOP 10 ── */}
        {tab==="recommend"&&(
          <div>
            <div className="section-hdr"><div className="section-title">AI Top 10</div></div>
            <p className="ai-intro">Claude analyses everyone's ratings, book descriptions, and suggestions — then ranks the 10 best next reads for the group.</p>
            {currentUser===ADMIN?(
              <button className="aibtn" onClick={getAIRecs} disabled={aiLoading}>
                {aiLoading?"Thinking…":"✦ Refresh Top 10"}
              </button>
            ):(
              <div className="ai-view-only"><strong>Only Ellie can refresh this list.</strong> Ask her to generate a new one at your next meeting!</div>
            )}
            {aiRecs.length===0&&!aiLoading&&(
              <div className="no-recs">{currentUser===ADMIN?"Hit the button above to generate recommendations!":"Ask Ellie to generate the list!"}</div>
            )}
            {aiRecs.length>0&&!aiRecs[0]?.error&&(
              <div className="recs-list">
                {aiRecs.map(rec=>(
                  <div key={rec.rank} className="rec-card">
                    <div className="rec-rank-col">
                      <div className={`rec-rank-num ${rec.rank<=3?"gold":""}`}>{rec.rank}</div>
                    </div>
                    {rec.cover?<img src={rec.cover} alt="" className="rec-cover"/>:<div className="rec-cover-ph">📖</div>}
                    <div className="rec-body">
                      <div className="rec-title">{rec.title}</div>
                      <div className="rec-author">by {rec.author} · {rec.genre}</div>
                      <div className="rec-why">{rec.whyThisBook}</div>
                      <div className="rec-footer">
                        <div className="rec-match">{rec.matchScore}% match</div>
                        {rec.fromSuggestions&&<div className="rec-from">from your suggestions</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {aiRecs[0]?.error&&<div className="aierr">Couldn't get recommendations — try again in a moment.</div>}
          </div>
        )}

        {/* ── MY BOOKS (PERSONAL) ── */}
        {tab==="personal"&&(
          <div>
            <div className="section-hdr">
              <div className="section-title">Personal reading lists</div>
            </div>
            {/* Member selector */}
            <div className="personal-who">
              {MEMBERS.map(m=>(
                <button key={m} className={`pwho-btn ${currentUser===m?"on":""}`} onClick={()=>setCurrentUser(m)}>{m}</button>
              ))}
            </div>

            {!currentUser&&<div className="need-name">Select a member above to see their personal reading list.</div>}

            {currentUser&&(
              <>
                <div style={{marginBottom:16}}>
                  <strong style={{fontFamily:"var(--D)",fontSize:18,textTransform:"uppercase",letterSpacing:"-.1px"}}>{currentUser}'s personal reads</strong>
                  <span style={{fontSize:12,color:"var(--mid)",marginLeft:8}}>{myPersonalBooks.length} books</span>
                </div>
                {myPersonalBooks.length===0&&<div className="personal-empty">Nothing added yet — add your first personal read below!</div>}
                <div className="personal-grid">
                  {myPersonalBooks.map(book=>(
                    <div key={book.id} className="bcard">
                      {book.cover?<img src={book.cover} alt="" className="bcover"/>:<div className="bcover-ph">📚</div>}
                      <div className="binfo">
                        <div className="btitle">{book.title}</div>
                        <div className="bauthor">{book.author}</div>
                        <span className="bgenre">{book.genre}</span>
                      </div>
                      <div className="bright">
                        <div><div className="avgscore">{book.rating||"—"}</div><div className="avglbl">/ 10</div></div>
                        <button className="delbtn" onClick={()=>deletePersonalBook(book.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
                {showAddPersonal?(
                  <div className="aform">
                    <div className="fgrp" style={{position:"relative"}}>
                      <label>Search for a book</label>
                      <BookSearchInput onSelect={b=>setNewPersonal(p=>({...p,title:b.title,author:b.author,genre:b.genre,cover:b.cover,description:b.description}))}/>
                    </div>
                    {newPersonal.cover&&<div className="selected-cover"><img src={newPersonal.cover} alt=""/><span>{newPersonal.title} — cover found ✓</span></div>}
                    <div className="frow">
                      <div className="fgrp"><label>Title</label><input value={newPersonal.title} onChange={e=>setNewPersonal(p=>({...p,title:e.target.value}))} placeholder="Book title"/></div>
                      <div className="fgrp"><label>Author</label><input value={newPersonal.author} onChange={e=>setNewPersonal(p=>({...p,author:e.target.value}))} placeholder="Author"/></div>
                    </div>
                    <div className="frow">
                      <div className="fgrp"><label>Genre</label><select value={newPersonal.genre} onChange={e=>setNewPersonal(p=>({...p,genre:e.target.value}))}>{GENRES.map(g=><option key={g}>{g}</option>)}</select></div>
                    </div>
                    <div><div className="rlbl">Your Rating</div><StarRating value={newPersonal.myRating} onChange={v=>setNewPersonal(p=>({...p,myRating:v}))}/></div>
                    <div className="factions">
                      <button className="bprimary" onClick={addPersonalBook}>Add</button>
                      <button className="bcancel" onClick={()=>setShowAddPersonal(false)}>Cancel</button>
                    </div>
                  </div>
                ):(
                  <button className="addbtn" onClick={()=>setShowAddPersonal(true)}>＋ Add to {currentUser}'s reading list</button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rate modal */}
      {rateModal&&(
        <div className="overlay" onClick={()=>setRateModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>{rateModal.title}</h3>
            <p>by {rateModal.author} · rating as {currentUser}</p>
            <div className="rlbl">Your Score Out of 10</div>
            <StarRating value={myRating} onChange={setMyRating}/>
            <div className="factions" style={{marginTop:18}}>
              <button className="bprimary" onClick={()=>rateBook(rateModal.id)}>Save</button>
              <button className="bcancel" onClick={()=>setRateModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Comment modal */}
      {commentModal&&(
        <div className="overlay" onClick={()=>setCommentModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>{commentModal.title}</h3>
            <p>Your thoughts · as {currentUser}</p>
            <div className="rlbl">Your Note</div>
            <textarea className="modal-textarea" value={myComment} onChange={e=>setMyComment(e.target.value)} placeholder="What did you think? Any favourite moments?"/>
            <div className="factions" style={{marginTop:14}}>
              <button className="bprimary" onClick={()=>saveComment(commentModal.id)}>Save Note</button>
              <button className="bcancel" onClick={()=>setCommentModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editModal&&(
        <div className="overlay" onClick={()=>setEditModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>Edit Book</h3>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
              <div className="fgrp"><label>Title</label><input value={editForm.title||""} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))}/></div>
              <div className="fgrp"><label>Author</label><input value={editForm.author||""} onChange={e=>setEditForm(f=>({...f,author:e.target.value}))}/></div>
              <div className="fgrp"><label>Genre</label><select value={editForm.genre||"Fiction"} onChange={e=>setEditForm(f=>({...f,genre:e.target.value}))}>{GENRES.map(g=><option key={g}>{g}</option>)}</select></div>
            </div>
            <div className="factions">
              <button className="bprimary" onClick={saveEdit}>Save</button>
              <button className="bcancel" onClick={()=>setEditModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
