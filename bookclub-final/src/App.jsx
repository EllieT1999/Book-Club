import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qjxeotvgnatsnaecesjl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wGS2qw38rGLjPI1daKMwDg_c2JflEu3";
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GENRES = ["Literary Fiction","Fiction","Memoir","Non-Fiction","Mystery","Sci-Fi","Fantasy","Historical Fiction","Romance","Thriller","Biography","Self-Help","Crime","Short Stories","Poetry"];
const MEMBERS = ["Ali","Bec","Cassie","Chloe","Ellie","Emma","Evie","Georgie","Hannah","Harriet","Izzy","Lara","Lillay","Maddie","Pip","Rachel","Sanyogita","Soph","Tash"];
const ADMIN = "Ellie";

function avgRating(ratings) {
  const vals = Object.values(ratings || {}).filter(v => v != null);
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

async function searchGoogleBooks(query) {
  if (!query || query.length < 3) return [];
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6&langRestrict=en&key=${import.meta.env.VITE_GOOGLE_BOOKS_KEY}`);
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

function CoverUpload({ onUpload, currentCover }) {
  const fileRef = useRef(null);
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onUpload(ev.target.result);
    reader.readAsDataURL(file);
  }
  return (
    <div className="cover-upload-wrap">
      <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFile}/>
      <button type="button" className="cover-upload-btn" onClick={()=>fileRef.current.click()}>
        {currentCover ? "📷 Change cover" : "📷 Upload cover"}
      </button>
      <span className="cover-upload-hint">Use if search didn't find the right cover</span>
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
  const [editPersonalModal, setEditPersonalModal] = useState(null);
  const [commentPersonalModal, setCommentPersonalModal] = useState(null);
  const [personalComment, setPersonalComment] = useState("");
  const [rateModal, setRateModal] = useState(null);
  const [commentModal, setCommentModal] = useState(null);
  const [myRating, setMyRating] = useState(7);
  const [myComment, setMyComment] = useState("");
  const [editForm, setEditForm] = useState({});

  const [aiRecs, setAiRecs] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState("");

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
    const interval = setInterval(fetchAll, 3000);
    const subs = [
      supabase.channel("bc").on("postgres_changes", { event:"*", schema:"public", table:"books" }, fetchAll).subscribe(),
      supabase.channel("sg").on("postgres_changes", { event:"*", schema:"public", table:"suggestions" }, fetchAll).subscribe(),
      supabase.channel("pb").on("postgres_changes", { event:"*", schema:"public", table:"personal_books" }, fetchAll).subscribe(),
    ];
    return () => { clearInterval(interval); subs.forEach(s => s.unsubscribe()); };
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
    await fetchAll();
    setShowAddBook(false);
  }

  async function deleteBook(id) {
    if (!confirm("Delete this book?")) return;
    await supabase.from("books").delete().eq("id", id);
    await fetchAll();
  }

  async function saveEdit() {
    await supabase.from("books").update({
      title: editForm.title, author: editForm.author,
      genre: editForm.genre, cover: editForm.cover, description: editForm.description,
    }).eq("id", editModal.id);
    await fetchAll();
    setEditModal(null);
  }

  async function rateBook(bookId) {
    const book = books.find(b => b.id === bookId);
    const updated = { ...(book.ratings || {}), [currentUser]: myRating };
    await supabase.from("books").update({ ratings: updated }).eq("id", bookId);
    await fetchAll();
    setRateModal(null);
  }

  async function saveComment(bookId) {
    const book = books.find(b => b.id === bookId);
    const updated = { ...(book.comments || {}), [currentUser]: myComment };
    await supabase.from("books").update({ comments: updated }).eq("id", bookId);
    await fetchAll();
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
    await fetchAll();
    setShowAddSugg(false);
  }

  async function deleteSuggestion(id) {
    if (!confirm("Delete this suggestion?")) return;
    await supabase.from("suggestions").delete().eq("id", id);
    await fetchAll();
  }

  async function toggleVote(sugg) {
    const has = (sugg.votes || []).includes(currentUser);
    const updated = has ? sugg.votes.filter(v => v !== currentUser) : [...(sugg.votes||[]), currentUser];
    await supabase.from("suggestions").update({ votes: updated }).eq("id", sugg.id);
    await fetchAll();
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
    await fetchAll();
    setShowAddPersonal(false);
  }

  async function deletePersonalBook(id) {
    if (!confirm("Delete this book?")) return;
    await supabase.from("personal_books").delete().eq("id", id);
    await fetchAll();
  }

  async function savePersonalEdit(id, updates) {
    await supabase.from("personal_books").update(updates).eq("id", id);
    await fetchAll();
    setEditPersonalModal(null);
  }

  async function savePersonalComment(id) {
    await supabase.from("personal_books").update({ comment: personalComment }).eq("id", id);
    await fetchAll();
    setCommentPersonalModal(null);
    setPersonalComment("");
  }

  async function getAIRecs() {
    setAiLoading(true);
    setAiRecs([]);
    setAiStatus("Analysing everyone's reading tastes…");

    const highlyRatedPersonal = personalBooks.filter(b => (b.rating || 0) >= 7);
    const memberTastes = MEMBERS.map(member => {
      const theirBooks = highlyRatedPersonal.filter(b => b.member === member);
      if (!theirBooks.length) return null;
      return `${member} (rated 7+/10): ${theirBooks.map(b => `"${b.title}" by ${b.author} (${b.genre}, ${b.rating}/10)`).join(", ")}`;
    }).filter(Boolean).join("\n");

    const alreadyRead = books.map(b => `"${b.title}" by ${b.author}`).join(", ");

    const suggSummary = suggestions.length
      ? suggestions.map(s => `"${s.title}" by ${s.author} (${s.genre}) — suggested by ${s.suggested_by}${s.reason ? `, reason: ${s.reason}` : ""}, ${s.votes?.length||0} vote(s)`).join("\n")
      : "None";

    const prompt = `You are an expert literary analyst and book recommender for a women's book club with ${MEMBERS.length} members.

STEP 1 — DEEP TASTE ANALYSIS
Carefully analyse each member's personal reading list below. For each member identify:
- Favourite genres, themes, and emotional tones
- Writing style preferences (literary vs plot-driven, slow-burn vs fast-paced, dark vs uplifting)
- Recurring subject matter (family dynamics, identity, female friendship, social issues, grief, love, etc.)

MEMBERS' PERSONAL READING LISTS (books rated 7+/10 — genuinely loved):
${memberTastes || "No personal books rated 7+ yet — infer taste from suggestions and recommend broadly acclaimed women's fiction."}

STEP 2 — FIND TASTE CROSSOVER
Identify across all members:
- Themes and genres that multiple members gravitate toward
- Emotional tones appearing repeatedly across different members' lists
- Shared sensibilities even where members haven't read the same books
- Authors or styles that suggest compatible tastes

STEP 3 — RESEARCH BROADLY USING WEB SEARCH
Use web search to research current acclaimed books matching this group's taste crossover. Actively search for:
- Recent prize-winners and shortlisted books (Women's Prize for Fiction, Booker Prize, Pulitzer, etc.) from the last 5 years
- Critically acclaimed debuts and second novels matching the group's themes
- Books that appear on "if you loved X, read Y" recommendation lists for authors the members enjoy
- Book club favourites with strong reader communities
- Hidden gems — not just obvious bestsellers

Go beyond your training data. Search actively. The goal is fresh, well-researched recommendations the group won't have obviously encountered.

MEMBER SUGGESTIONS (strong secondary signal — take these seriously, especially highly voted ones):
${suggSummary}

ALREADY READ AS A GROUP — do NOT recommend these:
${alreadyRead || "None yet"}

STEP 4 — RANK AND RETURN
Return exactly 10 books ranked by how well they fit the collective group taste. Mix suggestions with your own researched picks — the best 10 regardless of source. Prioritise books with genuine crossover appeal.

Respond ONLY with a valid JSON array, no markdown, no extra text:
[{
  "rank": 1,
  "title": "string",
  "author": "string",
  "genre": "string",
  "fromSuggestions": false,
  "blurb": "2 sentences on what the book is about and why it's compelling",
  "whyThisBook": "1 sentence on why it fits this specific group's taste",
  "memberMatch": [{"name": "MemberName", "reason": "5 words max"}],
  "tasteOverlap": "the shared taste pattern this targets",
  "matchScore": 85
}]
IMPORTANT: memberMatch must ONLY include members who appear in the personal reading data above. Skip anyone not listed. Keep reasons to 5 words max.`;

    try {
      setAiStatus("Researching books across the web…");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8000,
          tools: [{ "type": "web_search_20250305", "name": "web_search" }],
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await res.json();

      // Extract text from all text blocks (web search may add tool_use/tool_result blocks)
      const text = (data.content || [])
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      setAiStatus("Fetching book covers…");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

      const enriched = await Promise.all(parsed.map(async rec => {
        const results = await searchGoogleBooks(`${rec.title} ${rec.author}`);
        return { ...rec, cover: results[0]?.cover || null };
      }));

      setAiRecs(enriched);
      setAiStatus("");
    } catch(e) {
      console.error(e);
      setAiRecs([{ error: true }]);
      setAiStatus("");
    }
    setAiLoading(false);
  }

  const sortedBooks = [...books].sort((a,b) => (parseFloat(avgRating(b.ratings))||0)-(parseFloat(avgRating(a.ratings))||0));
  const sortedSuggs = [...suggestions].sort((a,b) => (b.votes?.length||0)-(a.votes?.length||0));
  const myPersonalBooks = personalBooks.filter(b => b.member === currentUser);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'Playfair Display',serif",fontSize:48,fontWeight:900,color:"#1a1208",background:"#f5f0e8",letterSpacing:2}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&display=swap');*{margin:0;padding:0;box-sizing:border-box}`}</style>
      BOOKED.IN
    </div>
  );

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,400;1,700&family=DM+Sans:wght@300;400;500;600&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#F7F3EC;
      --card:#FDFAF5;
      --ink:#1A1208;
      --red:#B5341A;
      --gold:#C8922A;
      --gold-light:#F5E6C4;
      --border:#DDD5C4;
      --mid:#8A7F6E;
      --serif:'Playfair Display',serif;
      --sans:'DM Sans',sans-serif;
    }
    body{background:var(--bg);font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased}
    .app{min-height:100vh}

    /* HEADER */
    .hdr{
      background:var(--ink);
      padding:0 32px;
      display:flex;align-items:center;justify-content:space-between;
      position:sticky;top:0;z-index:200;
      gap:16px;height:58px;
    }
    .logo{font-family:var(--serif);font-size:26px;font-weight:900;letter-spacing:2px;color:#fff;line-height:1;text-transform:uppercase}
    .logo span{color:var(--gold)}
    .hdr-right{display:flex;align-items:center;gap:10px}
    .user-label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.45);font-family:var(--sans)}
    .user-dropdown{
      appearance:none;-webkit-appearance:none;
      background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.18);
      border-radius:5px;
      padding:6px 28px 6px 10px;
      font-family:var(--sans);
      font-size:14px;font-weight:600;
      color:#fff;cursor:pointer;outline:none;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
      background-repeat:no-repeat;background-position:right 9px center;
      transition:border-color .12s;min-width:120px;
    }
    .user-dropdown option{color:var(--ink);background:#fff}
    .user-dropdown:focus{border-color:var(--gold)}
    .user-dropdown.unset{border-color:var(--gold);border-style:dashed;color:rgba(255,255,255,.6)}

    /* HERO */
    .hero{
      background:var(--card);
      border-bottom:1px solid var(--border);
      padding:18px 32px;
      display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
    }
    .hero-title{font-family:var(--serif);font-size:clamp(26px,3.5vw,40px);font-weight:700;letter-spacing:-.5px;line-height:1;color:var(--ink)}
    .hero-title em{color:var(--red);font-style:italic}
    .hero-stats{display:flex;gap:1px}
    .hstat{background:var(--bg);border:1px solid var(--border);padding:9px 16px;text-align:center;min-width:68px}
    .hstat:first-child{border-radius:5px 0 0 5px}
    .hstat:last-child{border-radius:0 5px 5px 0}
    .hstat:not(:last-child){border-right:none}
    .hstat-n{font-family:var(--serif);font-size:22px;font-weight:700;line-height:1;color:var(--red)}
    .hstat-l{font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:var(--mid);margin-top:2px;font-family:var(--sans)}

    /* TABS */
    .tabs{
      display:flex;background:var(--bg);
      border-bottom:1px solid var(--border);
      padding:0 32px;overflow-x:auto;gap:0;
    }
    .tbtn{
      background:none;border:none;border-bottom:2px solid transparent;
      margin-bottom:-1px;padding:13px 18px 13px 0;
      font-family:var(--sans);font-size:13px;font-weight:500;
      cursor:pointer;color:var(--mid);transition:all .12s;
      white-space:nowrap;margin-right:8px;letter-spacing:.01em;
    }
    .tbtn.on{color:var(--ink);border-bottom-color:var(--red);font-weight:600}
    .tbtn:hover:not(.on){color:var(--ink)}

    /* CONTENT */
    .content{padding:28px 32px;max-width:860px}
    .section-hdr{display:flex;align-items:baseline;gap:10px;margin-bottom:22px}
    .section-title{font-family:var(--serif);font-size:24px;font-weight:700;letter-spacing:-.3px;font-style:italic}
    .section-count{font-size:12px;color:var(--mid);font-family:var(--sans)}

    /* BOOK CARDS */
    .blist{display:flex;flex-direction:column;gap:2px}
    .bcard{
      background:var(--card);border:1px solid var(--border);border-radius:8px;
      padding:14px 16px;display:flex;gap:14px;align-items:flex-start;
      transition:border-color .15s,box-shadow .15s;
    }
    .bcard:hover{border-color:var(--gold);box-shadow:0 2px 14px rgba(26,18,8,.07)}
    .bcover{width:48px;height:68px;object-fit:cover;border-radius:4px;border:1px solid var(--border);flex-shrink:0;background:var(--bg)}
    .bcover-ph{width:48px;height:68px;background:var(--gold-light);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--gold)}
    .brank{font-family:var(--serif);font-size:16px;font-weight:700;color:var(--border);min-width:24px;line-height:1;padding-top:5px;flex-shrink:0}
    .brank.top{color:var(--gold)}
    .binfo{flex:1;min-width:0}
    .btitle{font-family:var(--serif);font-size:17px;font-weight:700;line-height:1.2;color:var(--ink)}
    .bauthor{font-size:12px;color:var(--mid);margin-top:2px;font-style:italic;font-family:var(--sans)}
    .bgenre{display:inline-block;background:var(--gold-light);border-radius:3px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;padding:2px 7px;margin-top:5px;color:var(--gold);border:1px solid #e8d4a0}
    .bratings{display:flex;gap:3px;margin-top:8px;flex-wrap:wrap}
    .mrat{font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:3px;padding:2px 6px;display:flex;align-items:center;gap:3px;font-family:var(--sans)}
    .mrat.unrated{opacity:.25}
    .mrat .who2{color:var(--mid);font-size:10px}
    .mrat .sc{font-weight:600;color:var(--red)}
    .bcomments{margin-top:8px;display:flex;flex-direction:column;gap:3px}
    .bcomment{font-size:12px;background:var(--bg);border-left:2px solid var(--gold);padding:4px 8px;border-radius:0 3px 3px 0;color:var(--mid);font-family:var(--sans)}
    .bcomment strong{color:var(--ink);margin-right:5px;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
    .addedbylbl{font-size:10px;color:var(--border);margin-top:4px;font-family:var(--sans)}
    .bright{display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0}
    .avgscore{font-family:var(--serif);font-size:32px;font-weight:700;line-height:1;color:var(--ink)}
    .avglbl{font-size:9px;color:var(--mid);text-transform:uppercase;letter-spacing:.1em;text-align:right;font-family:var(--sans)}
    .btn-row{display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end;margin-top:4px}
    .ratebtn{background:var(--red);color:#fff;border:none;border-radius:4px;padding:5px 11px;font-size:11px;font-weight:600;font-family:var(--sans);cursor:pointer;transition:all .12s;letter-spacing:.02em}
    .ratebtn:hover{background:var(--ink)}
    .commentbtn{background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:5px 11px;font-size:11px;font-family:var(--sans);cursor:pointer;transition:all .12s;color:var(--mid)}
    .commentbtn:hover{border-color:var(--ink);color:var(--ink)}
    .iconbtn{background:none;border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;transition:all .12s;color:var(--mid)}
    .iconbtn:hover{border-color:var(--ink);color:var(--ink)}
    .delbtn{background:none;border:1px solid var(--border);border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;color:var(--mid);transition:all .12s}
    .delbtn:hover{border-color:var(--red);color:var(--red)}

    /* STARS */
    .star-row{display:flex;align-items:center;gap:1px;flex-wrap:wrap}
    .star{background:none;border:none;cursor:pointer;color:var(--border);padding:0;transition:color .1s;line-height:1}
    .star.filled{color:var(--gold)}
    .star.readonly{cursor:default}
    .star-label{font-size:13px;font-weight:600;margin-left:6px;color:var(--red);font-family:var(--serif)}

    /* SUGGESTIONS */
    .slist{display:flex;flex-direction:column;gap:2px}
    .scard{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px;transition:border-color .15s,box-shadow .15s}
    .scard:hover{border-color:var(--gold);box-shadow:0 2px 14px rgba(26,18,8,.07)}
    .sinfo{flex:1;min-width:0}
    .stitle{font-family:var(--serif);font-size:16px;font-weight:700;color:var(--ink)}
    .sauthor{font-size:12px;color:var(--mid);font-style:italic;margin-top:2px;font-family:var(--sans)}
    .smeta{font-size:10px;color:var(--mid);margin-top:3px;text-transform:uppercase;letter-spacing:.07em;font-family:var(--sans)}
    .sreason{font-size:12px;margin-top:6px;padding-left:8px;border-left:2px solid var(--gold);font-style:italic;color:var(--mid);font-family:var(--sans)}
    .voters{font-size:11px;color:var(--mid);margin-top:5px;font-family:var(--sans)}
    .vbtn{display:flex;flex-direction:column;align-items:center;gap:1px;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:7px 12px;cursor:pointer;font-family:var(--sans);transition:all .12s;min-width:46px;flex-shrink:0}
    .vbtn.on{background:var(--red);border-color:var(--red);color:#fff}
    .vbtn:hover:not(.on){border-color:var(--ink)}
    .vcnt{font-family:var(--serif);font-size:18px;font-weight:700;line-height:1}
    .vlbl{font-size:9px;text-transform:uppercase;letter-spacing:.08em;font-family:var(--sans)}

    /* PERSONAL */
    .personal-grid{display:flex;flex-direction:column;gap:2px}
    .personal-empty{text-align:center;padding:32px;color:var(--mid);font-size:13px;font-style:italic;font-family:var(--sans)}

    /* AI */
    .ai-intro{font-size:13px;color:var(--mid);margin-bottom:20px;line-height:1.7;max-width:520px;font-family:var(--sans)}
    .aibtn{padding:12px 26px;background:var(--red);color:#fff;border:none;border-radius:6px;font-family:var(--serif);font-size:17px;font-weight:700;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;gap:8px;letter-spacing:.01em}
    .aibtn:hover{background:var(--ink)}
    .aibtn:disabled{opacity:.5;cursor:not-allowed}
    .ai-status{font-size:13px;color:var(--mid);margin-top:14px;font-style:italic;font-family:var(--sans);display:flex;align-items:center;gap:8px}
    .ai-status::before{content:'';width:8px;height:8px;border-radius:50%;background:var(--gold);display:inline-block;animation:pulse 1.2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.8)}}
    .ai-view-only{background:var(--card);border:1px solid var(--border);border-radius:6px;padding:12px 16px;font-size:13px;color:var(--mid);margin-bottom:18px;max-width:460px;font-family:var(--sans)}
    .ai-view-only strong{color:var(--ink)}
    .recs-list{display:flex;flex-direction:column;gap:3px;margin-top:22px;max-width:700px}
    .rec-card{background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;display:flex;transition:border-color .15s,box-shadow .15s}
    .rec-card:hover{border-color:var(--gold);box-shadow:0 2px 14px rgba(26,18,8,.07)}
    .rec-rank-col{background:var(--ink);padding:12px 14px;display:flex;align-items:center;justify-content:center;min-width:50px;flex-shrink:0}
    .rec-rank-num{font-family:var(--serif);font-size:24px;font-weight:700;color:#fff;line-height:1}
    .rec-rank-num.gold{color:var(--gold)}
    .rec-cover{width:56px;height:80px;object-fit:cover;flex-shrink:0}
    .rec-cover-ph{width:56px;height:80px;background:var(--gold-light);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px;color:var(--gold)}
    .rec-body{padding:12px 14px;flex:1;min-width:0}
    .rec-title{font-family:var(--serif);font-size:16px;font-weight:700;color:var(--ink);line-height:1.2}
    .rec-author{font-size:11px;color:var(--mid);font-style:italic;margin-top:3px;font-family:var(--sans)}
    .rec-from-sugg{display:inline-block;background:var(--gold-light);border:1px solid #e8d4a0;font-size:9px;border-radius:3px;padding:1px 6px;text-transform:uppercase;letter-spacing:.07em;color:var(--gold);margin-left:6px;vertical-align:middle;font-family:var(--sans);font-weight:600}
    .rec-blurb{font-size:12px;line-height:1.65;margin-top:7px;color:var(--ink);font-style:italic;padding:7px 10px;background:var(--bg);border-radius:4px;border-left:2px solid var(--gold);font-family:var(--sans)}
    .rec-why{font-size:12px;line-height:1.6;margin-top:6px;color:var(--mid);font-family:var(--sans)}
    .rec-overlap{font-size:10px;color:var(--red);font-weight:600;margin-top:5px;text-transform:uppercase;letter-spacing:.06em;font-family:var(--sans)}
    .rec-members{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
    .rec-member-chip{background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:2px 9px;font-size:10px;font-family:var(--sans);color:var(--mid)}
    .rec-member-chip strong{color:var(--ink);font-weight:600}
    .rec-footer{display:flex;align-items:center;gap:8px;margin-top:8px}
    .rec-match{display:inline-block;background:var(--ink);color:#fff;font-family:var(--sans);font-size:11px;font-weight:600;border-radius:3px;padding:2px 9px;letter-spacing:.02em}
    .no-recs{padding:32px 0;color:var(--mid);font-size:13px;font-style:italic;font-family:var(--sans)}
    .ai-data-warning{background:var(--gold-light);border:1px solid #e8d4a0;border-radius:6px;padding:10px 14px;font-size:13px;font-weight:500;margin-bottom:18px;max-width:560px;color:var(--ink);font-family:var(--sans)}

    /* FORMS */
    .addbtn{display:flex;align-items:center;gap:7px;background:none;border:1px dashed var(--border);border-radius:6px;padding:11px 16px;width:100%;cursor:pointer;color:var(--mid);font-family:var(--sans);font-size:13px;transition:all .12s;margin-top:10px}
    .addbtn:hover{border-color:var(--ink);color:var(--ink);background:var(--card)}
    .aform{background:var(--card);border:1px solid var(--border);border-radius:8px;padding:18px;margin-top:10px;display:flex;flex-direction:column;gap:12px;box-shadow:0 2px 14px rgba(26,18,8,.06)}
    .frow{display:flex;gap:10px;flex-wrap:wrap}
    .fgrp{display:flex;flex-direction:column;gap:4px;flex:1;min-width:140px}
    .fgrp label{font-size:10px;text-transform:uppercase;letter-spacing:.12em;font-weight:600;color:var(--mid);font-family:var(--sans)}
    .fgrp input,.fgrp select,.fgrp textarea{padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;font-family:var(--sans);font-size:13px;color:var(--ink);outline:none;transition:border-color .12s;width:100%}
    .fgrp textarea{resize:vertical;min-height:65px}
    .fgrp input:focus,.fgrp select:focus,.fgrp textarea:focus{border-color:var(--red)}
    .factions{display:flex;gap:7px;margin-top:2px}
    .bprimary{background:var(--ink);color:#fff;border:none;border-radius:5px;padding:9px 18px;font-family:var(--sans);font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;letter-spacing:.02em}
    .bprimary:hover{background:var(--red)}
    .bcancel{background:none;border:1px solid var(--border);border-radius:5px;color:var(--mid);padding:9px 14px;font-family:var(--sans);font-size:12px;cursor:pointer;transition:all .12s}
    .bcancel:hover{border-color:var(--ink);color:var(--ink)}
    .rlbl{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--mid);margin-bottom:7px;font-weight:600;font-family:var(--sans)}
    .selected-cover{display:flex;align-items:center;gap:10px;padding:8px;background:var(--bg);border:1px solid var(--border);border-radius:5px}
    .selected-cover img{width:32px;height:46px;object-fit:cover;border-radius:3px}
    .selected-cover span{font-size:12px;color:var(--mid);font-style:italic;font-family:var(--sans)}
    .cover-upload-wrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .cover-upload-btn{background:none;border:1px solid var(--border);border-radius:5px;padding:7px 12px;font-size:12px;font-family:var(--sans);cursor:pointer;color:var(--mid);transition:all .12s;white-space:nowrap}
    .cover-upload-btn:hover{border-color:var(--ink);color:var(--ink)}
    .cover-upload-hint{font-size:11px;color:var(--mid);font-style:italic;font-family:var(--sans)}

    /* SEARCH */
    .search-input{padding:8px 10px;border:1px solid var(--border);border-radius:5px;background:#fff;font-family:var(--sans);font-size:13px;color:var(--ink);outline:none;width:100%;transition:border-color .12s}
    .search-input:focus{border-color:var(--red)}
    .search-loading{font-size:12px;color:var(--mid);padding:5px 0;font-style:italic;font-family:var(--sans)}
    .search-dropdown{position:absolute;top:100%;left:0;right:0;background:#fff;border:1px solid var(--ink);border-top:none;border-radius:0 0 6px 6px;z-index:300;box-shadow:0 8px 24px rgba(26,18,8,.12);max-height:260px;overflow-y:auto}
    .search-result{display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;transition:background .1s;border-bottom:1px solid var(--border)}
    .search-result:last-child{border-bottom:none}
    .search-result:hover{background:var(--bg)}
    .search-cover{width:28px;height:40px;object-fit:cover;border-radius:2px;flex-shrink:0}
    .search-cover-ph{width:28px;height:40px;background:var(--gold-light);border-radius:2px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px}
    .search-result-title{font-family:var(--serif);font-size:14px;font-weight:700;color:var(--ink)}
    .search-result-author{font-size:11px;color:var(--mid);font-style:italic;margin-top:1px;font-family:var(--sans)}

    /* MODAL */
    .overlay{position:fixed;inset:0;background:rgba(26,18,8,.55);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px}
    .modal{background:#fff;border-radius:10px;border:1px solid var(--border);padding:24px;max-width:440px;width:100%;box-shadow:0 20px 60px rgba(26,18,8,.2);max-height:90vh;overflow-y:auto}
    .modal h3{font-family:var(--serif);font-size:20px;font-weight:700;letter-spacing:-.2px;margin-bottom:3px;font-style:italic}
    .modal p{font-size:12px;color:var(--mid);margin-bottom:14px;font-family:var(--sans)}
    .modal-textarea{padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-family:var(--sans);font-size:13px;outline:none;resize:vertical;width:100%;min-height:80px;transition:border-color .12s}
    .modal-textarea:focus{border-color:var(--red)}

    .empty{text-align:center;padding:40px 28px;color:var(--mid)}
    .empty-title{font-family:var(--serif);font-size:22px;font-style:italic;color:var(--border)}
    .empty-sub{font-size:13px;margin-top:4px;font-family:var(--sans)}
    .need-name{background:var(--gold-light);border:1px solid #e8d4a0;border-radius:5px;padding:9px 14px;font-size:13px;font-weight:500;margin-bottom:12px;color:var(--ink);font-family:var(--sans)}
    .aierr{margin-top:14px;padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--red);font-size:13px;font-family:var(--sans)}

    @media(max-width:640px){
      .hdr{padding:0 16px}
      .hero{padding:14px 16px}
      .tabs{padding:0 16px}
      .content{padding:20px 16px}
      .bcard{flex-wrap:wrap}
      .bright{flex-direction:row;align-items:center;width:100%}
    }
  `;

  return (
    <div className="app">
      <style>{CSS}</style>

      {/* HEADER */}
      <div className="hdr">
        <div className="logo">Booked<span>.</span>In</div>
        <div className="hdr-right">
          <span className="user-label">I am</span>
          <select className={`user-dropdown ${!currentUser?"unset":""}`} value={currentUser} onChange={e=>setCurrentUser(e.target.value)}>
            <option value="">Select name…</option>
            {MEMBERS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* HERO */}
      <div className="hero">
        <div className="hero-title">
          {tab==="library"&&<><em>Our</em> Reading List</>}
          {tab==="suggestions"&&<>What's <em>Next?</em></>}
          {tab==="recommend"&&<><em>AI</em> Top 10</>}
          {tab==="personal"&&<><em>My</em> Books</>}
        </div>
        <div className="hero-stats">
          <div className="hstat"><div className="hstat-n">{books.length}</div><div className="hstat-l">Read</div></div>
          <div className="hstat"><div className="hstat-n">{books.length?(books.reduce((s,b)=>s+(parseFloat(avgRating(b.ratings))||0),0)/books.length).toFixed(1):"—"}</div><div className="hstat-l">Avg</div></div>
          <div className="hstat"><div className="hstat-n">{suggestions.length}</div><div className="hstat-l">Ideas</div></div>
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        {[["library","📚 Library"],["suggestions","💡 Suggestions"],["recommend","✨ AI Top 10"],["personal","👤 My Books"]].map(([id,lbl])=>(
          <button key={id} className={`tbtn ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{lbl}</button>
        ))}
      </div>

      <div className="content">

        {/* LIBRARY */}
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
                <CoverUpload currentCover={newBook.cover} onUpload={url=>setNewBook(b=>({...b,cover:url}))}/>
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

        {/* SUGGESTIONS */}
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
                <CoverUpload currentCover={newSugg.cover} onUpload={url=>setNewSugg(s=>({...s,cover:url}))}/>
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

        {/* AI TOP 10 */}
        {tab==="recommend"&&(
          <div>
            <div className="section-hdr"><div className="section-title">AI Top 10</div></div>
            <p className="ai-intro">Claude analyses everyone's personal reading lists (rated 7+/10), researches current prize-winners and acclaimed books across the web, then picks the 10 most likely to be loved by the whole group. Member suggestions feed in as a strong secondary signal.</p>
            {personalBooks.filter(b=>(b.rating||0)>=7).length < 3 && (
              <div className="ai-data-warning">💡 The more books everyone adds to their personal reading list with ratings, the better the recommendations will be!</div>
            )}
            {currentUser===ADMIN?(
              <button className="aibtn" onClick={getAIRecs} disabled={aiLoading}>
                {aiLoading ? "✦ Working…" : "✦ Generate Top 10"}
              </button>
            ):(
              <div className="ai-view-only"><strong>Only Ellie can generate this list.</strong> Ask her to run it at your next meeting!</div>
            )}
            {aiLoading && aiStatus && (
              <div className="ai-status">{aiStatus}</div>
            )}
            {aiRecs.length===0&&!aiLoading&&(
              <div className="no-recs">{currentUser===ADMIN?"Hit the button above — the more personal books everyone has added, the better!":"Ask Ellie to generate the list!"}</div>
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
                      <div className="rec-title">
                        {rec.title}
                        {rec.fromSuggestions&&<span className="rec-from-sugg">suggested</span>}
                      </div>
                      <div className="rec-author">by {rec.author} · {rec.genre}</div>
                      {rec.blurb&&<div className="rec-blurb">{rec.blurb}</div>}
                      <div className="rec-why">{rec.whyThisBook}</div>
                      {rec.tasteOverlap&&<div className="rec-overlap">✦ {rec.tasteOverlap}</div>}
                      {rec.memberMatch&&rec.memberMatch.length>0&&(
                        <div className="rec-members">
                          {rec.memberMatch.map((m,i)=>(
                            <div key={i} className="rec-member-chip">
                              <strong>{m.name}</strong> — {m.reason}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="rec-footer">
                        <div className="rec-match">{rec.matchScore}% group match</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {aiRecs[0]?.error&&<div className="aierr">Couldn't get recommendations — try again in a moment.</div>}
          </div>
        )}

        {/* MY BOOKS (PERSONAL) */}
        {tab==="personal"&&(
          <div>
            <div className="section-hdr">
              <div className="section-title">Personal reading lists</div>
            </div>
            <div style={{marginBottom:20}}>
              <select className="user-dropdown" value={currentUser} onChange={e=>setCurrentUser(e.target.value)} style={{minWidth:160,background:"var(--card)",border:"1px solid var(--border)",color:"var(--ink)",backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%231A1208' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")"}}>
                <option value="">Select a member…</option>
                {MEMBERS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {!currentUser&&<div className="need-name">Select a member above to see their personal reading list.</div>}
            {currentUser&&(
              <>
                <div style={{marginBottom:16}}>
                  <span style={{fontFamily:"var(--serif)",fontSize:18,fontWeight:700,fontStyle:"italic"}}>{currentUser}'s reads</span>
                  <span style={{fontSize:12,color:"var(--mid)",marginLeft:8,fontFamily:"var(--sans)"}}>{myPersonalBooks.length} books</span>
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
                        {book.comment&&<div className="bcomments"><div className="bcomment"><span>{book.comment}</span></div></div>}
                      </div>
                      <div className="bright">
                        <div><div className="avgscore">{book.rating||"—"}</div><div className="avglbl">/ 10</div></div>
                        <div className="btn-row">
                          <button className="commentbtn" onClick={()=>{setCommentPersonalModal(book);setPersonalComment(book.comment||"")}}>
                            {book.comment?"Edit note":"Note"}
                          </button>
                          <button className="iconbtn" onClick={()=>setEditPersonalModal(book)}>✏️</button>
                          <button className="delbtn" onClick={()=>deletePersonalBook(book.id)}>✕</button>
                        </div>
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
                    <CoverUpload currentCover={newPersonal.cover} onUpload={url=>setNewPersonal(p=>({...p,cover:url}))}/>
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

      {/* Personal book edit modal */}
      {editPersonalModal&&(
        <div className="overlay" onClick={()=>setEditPersonalModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>Edit Book</h3>
            <p>Editing your personal entry</p>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
              <div className="fgrp"><label>Title</label><input defaultValue={editPersonalModal.title||""} id="pedit-title"/></div>
              <div className="fgrp"><label>Author</label><input defaultValue={editPersonalModal.author||""} id="pedit-author"/></div>
              <div className="fgrp"><label>Genre</label>
                <select defaultValue={editPersonalModal.genre||"Fiction"} id="pedit-genre">
                  {GENRES.map(g=><option key={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <div className="rlbl">Your Rating</div>
                <StarRating value={editPersonalModal.rating||7} onChange={v=>setEditPersonalModal(m=>({...m,rating:v}))}/>
              </div>
            </div>
            <div className="factions">
              <button className="bprimary" onClick={()=>savePersonalEdit(editPersonalModal.id,{
                title: document.getElementById("pedit-title").value,
                author: document.getElementById("pedit-author").value,
                genre: document.getElementById("pedit-genre").value,
                rating: editPersonalModal.rating,
              })}>Save</button>
              <button className="bcancel" onClick={()=>setEditPersonalModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Personal book comment modal */}
      {commentPersonalModal&&(
        <div className="overlay" onClick={()=>setCommentPersonalModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>{commentPersonalModal.title}</h3>
            <p>Why do you love this book?</p>
            <div className="rlbl">Your Note</div>
            <textarea className="modal-textarea" value={personalComment} onChange={e=>setPersonalComment(e.target.value)} placeholder="What did you love about it? A favourite quote, theme, or feeling it gave you…"/>
            <div className="factions" style={{marginTop:14}}>
              <button className="bprimary" onClick={()=>savePersonalComment(commentPersonalModal.id)}>Save</button>
              <button className="bcancel" onClick={()=>setCommentPersonalModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
