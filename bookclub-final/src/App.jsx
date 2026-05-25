import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qjxeotvgnatsnaecesjl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wGS2qw38rGLjPI1daKMwDg_c2JflEu3";
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;
import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qjxeotvgnatsnaecesjl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wGS2qw38rGLjPI1daKMwDg_c2JflEu3";
const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GENRES = ["Literary Fiction","Fiction","Memoir","Non-Fiction","Mystery","Sci-Fi","Fantasy","Historical Fiction","Romance","Thriller","Biography","Self-Help","Crime","Short Stories","Poetry"];
const MEMBERS = ["Ali","Bec","Cassie","Chloe","Chloe VN","Ellie","Emma","Erin","Evie","Gabby","Georgie","Hannah","Harriet","Izzy","Jorgia","Lara","Lillay","Maddie","Molly","Pip","Rachel","Ruby","Sanyogita","Soph","Tash"];
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

async function summariseDescription(rawText, title, author) {
  if (!rawText || rawText.length < 40) return rawText;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        messages: [{ role: "user", content: `Summarise this book description for "${title}" by ${author} in 2 clear sentences. Focus only on what the book is actually about — its story, characters, or subject matter. Remove any endorsements, critical praise, or quotes from reviewers. Be direct and spoiler-free. Return only the summary, no preamble.\n\n${rawText}` }]
      })
    });
    const data = await res.json();
    return data.content?.find(b => b.type === "text")?.text?.trim() || rawText;
  } catch { return rawText; }
}


  // value is now in 0.5 increments, 0–10
  // We display 10 stars, each star can be empty, half, or full
  const [hovered, setHovered] = useState(null);
  const display = hovered !== null ? hovered : value;

  function getStarType(starIndex) {
    // starIndex is 1-based (1..10)
    if (display >= starIndex) return "full";
    if (display >= starIndex - 0.5) return "half";
    return "empty";
  }

  function handleMouseMove(e, starIndex) {
    if (readonly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const half = x < rect.width / 2;
    setHovered(half ? starIndex - 0.5 : starIndex);
  }

  function handleClick(e, starIndex) {
    if (readonly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const half = x < rect.width / 2;
    onChange?.(half ? starIndex - 0.5 : starIndex);
  }

  return (
    <div className="star-row" onMouseLeave={() => !readonly && setHovered(null)}>
      {[...Array(10)].map((_, i) => {
        const idx = i + 1;
        const type = getStarType(idx);
        return (
          <button
            key={i}
            className={`star star-${type} ${readonly ? "readonly" : ""}`}
            style={{ fontSize: size, position: "relative" }}
            onMouseMove={e => handleMouseMove(e, idx)}
            onClick={e => handleClick(e, idx)}
            tabIndex={readonly ? -1 : 0}
          >
            {type === "half" ? (
              <span className="star-half-wrap">
                <span className="star-half-filled">★</span>
                <span className="star-half-empty">★</span>
              </span>
            ) : "★"}
          </button>
        );
      })}
      {value > 0 && <span className="star-label">{value}/10</span>}
    </div>
  );
}

function BookSearchInput({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [summarising, setSummarising] = useState(false);
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

  async function pick(book) {
    setQuery(book.title);
    setResults([]);
    setSummarising(true);
    const summary = await summariseDescription(book.description, book.title, book.author);
    setSummarising(false);
    onSelect({ ...book, description: summary });
  }

  return (
    <div style={{ position: "relative" }}>
      <input className="search-input" value={query} onChange={handleChange} placeholder="Search by title or author…" autoComplete="off"/>
      {(searching || summarising) && <div className="search-loading">{summarising ? "Summarising blurb…" : "Searching…"}</div>}
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
        {currentCover ? "📷 Change cover image" : "📷 Upload cover image"}
      </button>
      <span className="cover-upload-hint">Use this if the search didn't find the right cover</span>
    </div>
  );
}

function BlurbText({ text }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > 180;
  return (
    <div className="bdesc-wrap">
      <span className={`bdesc${expanded ? " bdesc-open" : ""}`}>{text}</span>
      {isLong && (
        <button className="bdesc-toggle" onClick={() => setExpanded(e => !e)}>
          {expanded ? "show less ▲" : "read more ▼"}
        </button>
      )}
    </div>
  );
}

export default function BookClub() {
  const [currentUser, setCurrentUser] = useState("");
  const [personalUser, setPersonalUser] = useState("");
  const [books, setBooks] = useState([]);
  const [personalBooks, setPersonalBooks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [tab, setTab] = useState("library");
  const [loading, setLoading] = useState(true);

  // Sync personalUser to currentUser when currentUser is first set, but not the reverse
  const prevCurrentUser = useRef("");
  useEffect(() => {
    if (currentUser && !personalUser) {
      setPersonalUser(currentUser);
    }
    prevCurrentUser.current = currentUser;
  }, [currentUser]);

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

  const [aiRecs, setAiRecs] = useState(() => {
    try { const s = localStorage.getItem("bc_ai_recs"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVotes, setAiVotes] = useState(() => {
    try { const s = localStorage.getItem("bc_ai_votes"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

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
    if (!personalUser) { alert("Please select your name first!"); return; }
    const { error } = await supabase.from("personal_books").insert({
      title: newPersonal.title.trim(), author: newPersonal.author.trim(),
      genre: newPersonal.genre, rating: newPersonal.myRating,
      cover: newPersonal.cover || null, description: newPersonal.description || null,
      member: personalUser,
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
    setAiVotes({});

    // Build personal books summary — only books rated 7+ out of 10
    const highlyRatedPersonal = personalBooks.filter(b => (b.rating || 0) >= 7);
    const memberTastes = MEMBERS.map(member => {
      const theirBooks = highlyRatedPersonal.filter(b => b.member === member);
      if (!theirBooks.length) return null;
      return `${member} (rated 7+/10): ${theirBooks.map(b => `"${b.title}" by ${b.author} (${b.genre}, ${b.rating}/10)`).join(", ")}`;
    }).filter(Boolean).join("\n");

    // Books already read as a group (for context — don't re-recommend these)
    const alreadyRead = books.map(b => `"${b.title}" by ${b.author}`).join(", ");

    // Books appearing on multiple personal lists (avoid recommending these)
    const allPersonalTitles = personalBooks.map(b => b.title.toLowerCase().trim());
    const titleCounts = {};
    allPersonalTitles.forEach(t => { titleCounts[t] = (titleCounts[t] || 0) + 1; });
    const multiPersonalBooks = personalBooks
      .filter(b => titleCounts[b.title.toLowerCase().trim()] > 1)
      .map(b => `"${b.title}" by ${b.author}`)
      .filter((v, i, a) => a.indexOf(v) === i);

    // Member suggestions as secondary signal
    const suggSummary = suggestions.length
      ? suggestions.map(s => `"${s.title}" by ${s.author} (${s.genre}) — suggested by ${s.suggested_by}${s.reason ? `, reason: ${s.reason}` : ""}, ${s.votes?.length||0} vote(s)`).join("\n")
      : "None";

    const prompt = `You are an expert book recommendation engine for a women's book club with ${MEMBERS.length} members.

YOUR PRIMARY DATA SOURCE — Members' personal reading lists (books they've personally read and rated 7 or higher out of 10, meaning they genuinely loved them):
${memberTastes || "No personal books rated 7+ yet — use suggestions and general taste inference instead."}

SECONDARY SIGNAL — Books members have suggested for the club:
${suggSummary}

ALREADY READ AS A GROUP (do NOT recommend these):
${alreadyRead || "None yet"}

BOOKS ALREADY READ BY MULTIPLE MEMBERS (do NOT recommend these — they've already read them individually):
${multiPersonalBooks.length ? multiPersonalBooks.join(", ") : "None"}

YOUR TASK:
Analyse the crossover in taste between members. Look for:
- Genres, themes, writing styles, and authors that multiple members love
- Hidden connections between what different members enjoy
- Books that would genuinely satisfy the most members based on their proven reading tastes

Return a ranked list of exactly 10 books the whole group should read next. For each, explain specifically WHICH members' taste it matches and why, based on their personal reading history.

Respond ONLY with a valid JSON array, no markdown, no extra text:
[{
  "rank": 1,
  "title": "string",
  "author": "string",
  "genre": "string",
  "fromSuggestions": false,
  "blurb": "2-3 sentence enticing description of what the book is about and why it's a compelling read",
  "whyThisBook": "2 sentences on why this fits the group's collective taste",
  "memberMatch": [{"name": "MemberName", "reason": "one short sentence why this member will love it"}],
  "tasteOverlap": "one sentence describing the shared taste pattern this pick targets",
  "matchScore": 85
}]`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type":"application/json", "x-api-key":ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:3000, messages:[{ role:"user", content:prompt }] })
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
      console.error(e);
      setAiRecs([{ error: true }]);
    }
    setAiLoading(false);
  }

  useEffect(() => {
    try { localStorage.setItem("bc_ai_recs", JSON.stringify(aiRecs)); } catch {}
  }, [aiRecs]);

  useEffect(() => {
    try { localStorage.setItem("bc_ai_votes", JSON.stringify(aiVotes)); } catch {}
  }, [aiVotes]);

  function toggleAiVote(rank) {
    if (!currentUser) { alert("Select your name first!"); return; }
    setAiVotes(prev => {
      const current = prev[currentUser];
      if (current === rank) {
        // unvote
        const updated = { ...prev };
        delete updated[currentUser];
        return updated;
      }
      return { ...prev, [currentUser]: rank };
    });
  }

  const sortedBooks = [...books].sort((a,b) => (parseFloat(avgRating(b.ratings))||0)-(parseFloat(avgRating(a.ratings))||0));
  const sortedSuggs = [...suggestions].sort((a,b) => (b.votes?.length||0)-(a.votes?.length||0));
  const myPersonalBooks = personalBooks.filter(b => b.member === personalUser);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'Inter',sans-serif",fontSize:52,fontWeight:900,color:"#C8391B",textTransform:"uppercase",letterSpacing:-2,background:"#F5F2EC"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@900&display=swap');*{margin:0;padding:0;box-sizing:border-box}`}</style>
      BOOKED.IN
    </div>
  );

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#F5F2EC;
      --card:#FDFCF9;
      --red:#C8391B;
      --yellow:#F0C93A;
      --black:#1A1208;
      --border:#DDD8CE;
      --mid:#8A8278;
      --D:'Inter',sans-serif;
      --S:'Inter',sans-serif;
      --B:'Inter',sans-serif;
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
    .section-title{font-family:var(--S);font-size:26px;font-weight:400;letter-spacing:-.3px}
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
    .bdesc-wrap{margin-top:6px}
    .bdesc{font-size:12px;color:var(--mid);line-height:1.55;font-style:italic;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .bdesc.bdesc-open{display:block;overflow:visible;-webkit-line-clamp:unset}
    .bdesc-toggle{background:none;border:none;padding:2px 0 0;font-size:11px;color:var(--red);cursor:pointer;font-family:var(--B);font-weight:600;display:block;margin-top:2px}
    .bdesc-toggle:hover{text-decoration:underline}
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
    .star{background:none;border:none;cursor:pointer;color:var(--border);padding:0;transition:color .1s;line-height:1;position:relative;display:inline-block}
    .star.star-full{color:var(--yellow)}
    .star.star-empty{color:var(--border)}
    .star.star-half{color:var(--border)}
    .star.readonly{cursor:default;pointer-events:none}
    .star-label{font-size:13px;font-weight:600;margin-left:6px;color:var(--red);font-family:var(--D)}
    .star-half-wrap{position:relative;display:inline-block;line-height:1}
    .star-half-filled{position:absolute;left:0;top:0;width:50%;overflow:hidden;color:var(--yellow);display:inline-block;white-space:nowrap}
    .star-half-empty{color:var(--border);display:inline-block}

    /* ── TAB DESCRIPTIONS ── */
    .tab-desc{font-size:13px;color:var(--mid);margin-bottom:22px;line-height:1.6;max-width:580px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:6px;border-left:3px solid var(--yellow)}

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
    .ai-data-warning{background:var(--yellow);border-radius:6px;padding:10px 14px;font-size:13px;font-weight:500;margin-bottom:16px;max-width:560px;color:var(--black)}
    .rec-overlap{font-size:11px;color:var(--red);font-weight:600;margin-top:6px;text-transform:uppercase;letter-spacing:.04em}
    .rec-blurb{font-size:12px;line-height:1.6;margin-top:6px;color:var(--black);font-style:italic;padding:8px 10px;background:var(--bg);border-radius:4px;border-left:2px solid var(--yellow)}
    .rec-members{display:flex;flex-direction:column;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
    .rec-member-row{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
    .rec-member-name{font-size:11px;font-weight:700;color:var(--black);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
    .rec-member-reason{font-size:11px;color:var(--mid);font-style:italic}
    .rec-vote-col{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 12px;border-left:1px solid var(--border);flex-shrink:0;gap:3px;min-width:54px}
    .rec-vote-btn{background:none;border:1.5px solid var(--border);border-radius:6px;padding:5px 9px;cursor:pointer;font-family:var(--D);font-size:16px;font-weight:900;color:var(--mid);transition:all .12s;width:100%}
    .rec-vote-btn.voted{background:var(--red);border-color:var(--red);color:#fff}
    .rec-vote-btn:hover:not(.voted){border-color:var(--black);color:var(--black)}
    .rec-vote-count{font-family:var(--D);font-size:18px;font-weight:900;color:var(--black);line-height:1}
    .rec-vote-label{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--mid)}
    .rec-refresh-row{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
    .rec-refresh-note{font-size:12px;color:var(--mid);font-style:italic}

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
    .cover-upload-wrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .cover-upload-btn{background:none;border:1px solid var(--border);border-radius:5px;padding:7px 12px;font-size:12px;font-family:var(--B);cursor:pointer;color:var(--mid);transition:all .12s;white-space:nowrap}
    .cover-upload-btn:hover{border-color:var(--black);color:var(--black)}
    .cover-upload-hint{font-size:11px;color:var(--mid);font-style:italic}

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
    .modal h3{font-family:var(--S);font-size:18px;font-weight:700;letter-spacing:-.3px;margin-bottom:3px}
    .modal p{font-size:12px;color:var(--mid);margin-bottom:14px}
    .modal-textarea{padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-family:var(--B);font-size:13px;outline:none;resize:vertical;width:100%;min-height:80px;transition:border-color .12s}
    .modal-textarea:focus{border-color:var(--red)}

    .empty{text-align:center;padding:40px 28px;color:var(--mid)}
    .empty-title{font-family:var(--S);font-size:22px;font-style:italic;color:var(--border)}
    .empty-sub{font-size:13px;margin-top:4px}
    .need-name{background:var(--yellow);border-radius:5px;padding:9px 14px;font-size:13px;font-weight:500;margin-bottom:12px;color:var(--black)}
    .no-name-banner{background:var(--yellow);border-radius:6px;padding:11px 16px;font-size:13px;font-weight:500;margin-bottom:20px;color:var(--black);display:flex;align-items:center;gap:8px}
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
          {tab==="library"&&<><em>Booked In</em> Library</>}
          {tab==="suggestions"&&<>What&apos;s <em>Next?</em></>}
          {tab==="recommend"&&<>AI <em>Recommendations</em></>}
          {tab==="personal"&&<><em>Personal</em> Library</>}
        </div>
        <div className="hero-stats">
          <div className="hstat"><div className="hstat-n">{books.length}</div><div className="hstat-l">Read</div></div>
          <div className="hstat"><div className="hstat-n">{books.length?(books.reduce((s,b)=>s+(parseFloat(avgRating(b.ratings))||0),0)/books.length).toFixed(1):"—"}</div><div className="hstat-l">Avg</div></div>
          <div className="hstat"><div className="hstat-n">{suggestions.length}</div><div className="hstat-l">Ideas</div></div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="tabs">
        {[["library","📚 Booked In Library"],["suggestions","💡 Suggestions"],["recommend","✨ AI Recommendations"],["personal","👤 Personal Library"]].map(([id,lbl])=>(
          <button key={id} className={`tbtn ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{lbl}</button>
        ))}
      </div>

      <div className="content">
        {!currentUser&&(
          <div className="no-name-banner">
            👋 <strong>Select your name</strong> in the top right to rate books, add suggestions, and more.
          </div>
        )}

        {/* ── LIBRARY ── */}
        {tab==="library"&&(
          <div>
            <p className="tab-desc">Every book the club has read together, ranked by average member rating. Rate books, leave notes, and keep the record straight.</p>
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
                    {book.description&&<BlurbText text={book.description}/>}
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
                      <button className="ratebtn" onClick={()=>{
                        if (!currentUser) return;
                        setRateModal(book);
                        setMyRating((book.ratings||{})[currentUser]||7);
                        setMyComment((book.comments||{})[currentUser]||"");
                      }}>
                        {currentUser&&(book.ratings||{})[currentUser]?"Rated ✓":"Rate"}
                      </button>
                      <button className="iconbtn" onClick={()=>{setEditModal(book);setEditForm({title:book.title,author:book.author,genre:book.genre,cover:book.cover,description:book.description||""})}}>Edit</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!currentUser&&<div className="need-name" style={{display:"none"}}/>}
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

        {/* ── SUGGESTIONS ── */}
        {tab==="suggestions"&&(
          <div>
            <p className="tab-desc">Suggest books you'd love the club to read next. Vote for your favourites — the most-voted ideas rise to the top.</p>
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
                    {s.description&&<BlurbText text={s.description}/>}
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

        {tab==="recommend"&&(
          <div>
            <div className="section-hdr"><div className="section-title">AI Recommendations</div></div>
            <p className="tab-desc">Claude analyses everyone's personal reading lists (books rated 7+/10) to find crossover in taste — then picks the books most likely to be loved by the whole group. Once generated, the list stays until Ellie refreshes it. Everyone gets one vote for the book they want to read next.</p>
            {personalBooks.filter(b=>(b.rating||0)>=7).length < 3 && (
              <div className="ai-data-warning">💡 The more books everyone adds to their personal reading list with ratings, the better the recommendations will be!</div>
            )}
            {currentUser===ADMIN?(
              <div className="rec-refresh-row">
                <button className="aibtn" onClick={getAIRecs} disabled={aiLoading}>
                  {aiLoading?"Analysing everyone's taste…":aiRecs.length?"🔄 Refresh Top 10":"✦ Generate Top 10"}
                </button>
                {aiRecs.length>0&&!aiLoading&&<span className="rec-refresh-note">Results are saved until you refresh</span>}
              </div>
            ):(
              <div className="ai-view-only"><strong>Only Ellie can generate this list.</strong> Ask her to run it at your next meeting!</div>
            )}
            {aiRecs.length===0&&!aiLoading&&(
              <div className="no-recs">{currentUser===ADMIN?"Hit the button above — the more personal books everyone has added, the better!":"Ask Ellie to generate the list!"}</div>
            )}
            {aiRecs.length>0&&!aiRecs[0]?.error&&(
              <div className="recs-list">
                {aiRecs.map(rec=>{
                  const voteCount = Object.values(aiVotes).filter(v=>v===rec.rank).length;
                  const myVote = aiVotes[currentUser];
                  const iVoted = myVote===rec.rank;
                  return (
                    <div key={rec.rank} className="rec-card">
                      <div className="rec-rank-col">
                        <div className={`rec-rank-num ${rec.rank<=3?"gold":""}`}>{rec.rank}</div>
                      </div>
                      {rec.cover?<img src={rec.cover} alt="" className="rec-cover"/>:<div className="rec-cover-ph">📖</div>}
                      <div className="rec-body">
                        <div className="rec-title">{rec.title}</div>
                        <div className="rec-author">by {rec.author} · {rec.genre}
                          {rec.fromSuggestions&&<span className="rec-from" style={{marginLeft:6}}>from suggestions</span>}
                        </div>
                        {rec.blurb&&<div className="rec-blurb">{rec.blurb}</div>}
                        <div className="rec-why">{rec.whyThisBook}</div>
                        {rec.tasteOverlap&&<div className="rec-overlap">✦ {rec.tasteOverlap}</div>}
                        {rec.memberMatch&&rec.memberMatch.length>0&&(
                          <div className="rec-members">
                            {rec.memberMatch.map((m,i)=>(
                              <div key={i} className="rec-member-row">
                                <span className="rec-member-name">{m.name}</span>
                                <span className="rec-member-reason">{m.reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="rec-footer">
                          <div className="rec-match">{rec.matchScore}% group match</div>
                        </div>
                      </div>
                      <div className="rec-vote-col">
                        <div className="rec-vote-count">{voteCount}</div>
                        <div className="rec-vote-label">vote{voteCount!==1?"s":""}</div>
                        {currentUser&&(
                          <button
                            className={`rec-vote-btn ${iVoted?"voted":""}`}
                            onClick={()=>toggleAiVote(rec.rank)}
                            title={iVoted?"Remove vote":"Vote for this book"}
                          >{iVoted?"✓":"▲"}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {Object.keys(aiVotes).length>0&&(
                  <div style={{marginTop:14,padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,fontSize:12}}>
                    <strong style={{fontSize:11,textTransform:"uppercase",letterSpacing:".04em"}}>Votes so far:</strong>
                    <span style={{color:"var(--mid)",marginLeft:8}}>
                      {Object.entries(aiVotes).map(([member,rank])=>`${member} → #${rank}`).join(" · ")}
                    </span>
                  </div>
                )}
              </div>
            )}
            {aiRecs[0]?.error&&<div className="aierr">Couldn't get recommendations — try again in a moment.</div>}
          </div>
        )}

        {/* ── PERSONAL LIBRARY ── */}
        {tab==="personal"&&(
          <div>
            <div className="section-hdr">
              <div className="section-title">Personal Library</div>
            </div>
            <p className="tab-desc">Everyone's personal reading list — books you've read outside of book club. Add your own reads with ratings; the AI uses highly-rated books (7+/10) to power its recommendations.</p>
            {/* Member selector — independent from the global user selector */}
            <div style={{marginBottom:20}}>
              <select
                className="user-dropdown"
                value={personalUser}
                onChange={e=>setPersonalUser(e.target.value)}
                style={{minWidth:160}}
              >
                <option value="">Select a member…</option>
                {MEMBERS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {!personalUser&&<div className="need-name">Select a member above to see their personal reading list.</div>}

            {personalUser&&(
              <>
                <div style={{marginBottom:16}}>
                  <strong style={{fontFamily:"var(--D)",fontSize:18,textTransform:"uppercase",letterSpacing:"-.1px"}}>{personalUser}'s personal reads</strong>
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
                        {book.description&&<BlurbText text={book.description}/>}
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
                  <button className="addbtn" onClick={()=>setShowAddPersonal(true)}>＋ Add to {personalUser}'s reading list</button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rate & Note modal */}
      {rateModal&&(
        <div className="overlay" onClick={()=>setRateModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>{rateModal.title}</h3>
            <p>by {rateModal.author} · as {currentUser}</p>
            <div className="rlbl" style={{marginBottom:8}}>Your Score Out of 10</div>
            <StarRating value={myRating} onChange={setMyRating}/>
            <div className="rlbl" style={{marginTop:16,marginBottom:6}}>Your Note <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional)</span></div>
            <textarea className="modal-textarea" value={myComment} onChange={e=>setMyComment(e.target.value)} placeholder="What did you think? Any favourite moments?"/>
            <div className="factions" style={{marginTop:14}}>
              <button className="bprimary" onClick={async()=>{
                const book = books.find(b=>b.id===rateModal.id);
                const updRatings = {...(book.ratings||{}), [currentUser]: myRating};
                const updComments = {...(book.comments||{}), [currentUser]: myComment};
                await supabase.from("books").update({ratings:updRatings, comments:updComments}).eq("id",rateModal.id);
                await fetchAll();
                setRateModal(null);
                setMyComment("");
              }}>Save</button>
              <button className="bcancel" onClick={()=>{setRateModal(null);setMyComment("");}}>Cancel</button>
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
              <div className="fgrp">
                <label>Blurb / Description</label>
                <textarea value={editForm.description||""} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} placeholder="A short description of the book…" style={{minHeight:80,resize:"vertical",padding:"8px 10px",border:"1px solid var(--border)",borderRadius:5,fontFamily:"var(--B)",fontSize:13,outline:"none",width:"100%"}}/>
                <button
                  type="button"
                  className="cover-upload-btn"
                  style={{marginTop:5,alignSelf:"flex-start"}}
                  onClick={async(e)=>{
                    const btn = e.currentTarget;
                    btn.textContent = "Fetching…";
                    btn.disabled = true;
                    const results = await searchGoogleBooks(`${editForm.title} ${editForm.author}`);
                    if (results[0]?.description) {
                      btn.textContent = "Summarising…";
                      const summary = await summariseDescription(results[0].description, editForm.title, editForm.author);
                      setEditForm(f=>({...f, description: summary}));
                    } else {
                      alert("No description found — try editing the title/author first.");
                    }
                    btn.textContent = "🔍 Fetch & summarise from Google Books";
                    btn.disabled = false;
                  }}
                >🔍 Fetch & summarise from Google Books</button>
              </div>
            </div>
            <div className="factions">
              <button className="bprimary" onClick={saveEdit}>Save</button>
              <button className="bcancel" onClick={()=>setEditModal(null)}>Cancel</button>
              <button className="delbtn" style={{marginLeft:"auto"}} onClick={()=>{setEditModal(null);deleteBook(editModal.id);}}>Delete book</button>
            </div>
          </div>
        </div>
      )}

      {/* Personal book edit modal */}
      {editPersonalModal&&(
        <div className="overlay" onClick={()=>setEditPersonalModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>Edit Book</h3>
            <p>Editing your personal entry for this book</p>
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

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GENRES = ["Literary Fiction","Fiction","Memoir","Non-Fiction","Mystery","Sci-Fi","Fantasy","Historical Fiction","Romance","Thriller","Biography","Self-Help","Crime","Short Stories","Poetry"];
const MEMBERS = ["Ali","Bec","Cassie","Chloe","Chloe VN","Ellie","Emma","Erin","Evie","Gabby","Georgie","Hannah","Harriet","Izzy","Jorgia","Lara","Lillay","Maddie","Molly","Pip","Rachel","Ruby","Sanyogita","Soph","Tash"];
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
  // value is now in 0.5 increments, 0–10
  // We display 10 stars, each star can be empty, half, or full
  const [hovered, setHovered] = useState(null);
  const display = hovered !== null ? hovered : value;

  function getStarType(starIndex) {
    // starIndex is 1-based (1..10)
    if (display >= starIndex) return "full";
    if (display >= starIndex - 0.5) return "half";
    return "empty";
  }

  function handleMouseMove(e, starIndex) {
    if (readonly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const half = x < rect.width / 2;
    setHovered(half ? starIndex - 0.5 : starIndex);
  }

  function handleClick(e, starIndex) {
    if (readonly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const half = x < rect.width / 2;
    onChange?.(half ? starIndex - 0.5 : starIndex);
  }

  return (
    <div className="star-row" onMouseLeave={() => !readonly && setHovered(null)}>
      {[...Array(10)].map((_, i) => {
        const idx = i + 1;
        const type = getStarType(idx);
        return (
          <button
            key={i}
            className={`star star-${type} ${readonly ? "readonly" : ""}`}
            style={{ fontSize: size, position: "relative" }}
            onMouseMove={e => handleMouseMove(e, idx)}
            onClick={e => handleClick(e, idx)}
            tabIndex={readonly ? -1 : 0}
          >
            {type === "half" ? (
              <span className="star-half-wrap">
                <span className="star-half-filled">★</span>
                <span className="star-half-empty">★</span>
              </span>
            ) : "★"}
          </button>
        );
      })}
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
        {currentCover ? "📷 Change cover image" : "📷 Upload cover image"}
      </button>
      <span className="cover-upload-hint">Use this if the search didn't find the right cover</span>
    </div>
  );
}

function BlurbText({ text }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const isLong = text.length > 180;
  return (
    <div className="bdesc-wrap">
      <span className={`bdesc${expanded ? " bdesc-open" : ""}`}>{text}</span>
      {isLong && (
        <button className="bdesc-toggle" onClick={() => setExpanded(e => !e)}>
          {expanded ? "show less ▲" : "read more ▼"}
        </button>
      )}
    </div>
  );
}

export default function BookClub() {
  const [currentUser, setCurrentUser] = useState("");
  const [personalUser, setPersonalUser] = useState("");
  const [books, setBooks] = useState([]);
  const [personalBooks, setPersonalBooks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [tab, setTab] = useState("library");
  const [loading, setLoading] = useState(true);

  // Sync personalUser to currentUser when currentUser is first set, but not the reverse
  const prevCurrentUser = useRef("");
  useEffect(() => {
    if (currentUser && !personalUser) {
      setPersonalUser(currentUser);
    }
    prevCurrentUser.current = currentUser;
  }, [currentUser]);

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

  const [aiRecs, setAiRecs] = useState(() => {
    try { const s = localStorage.getItem("bc_ai_recs"); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [aiLoading, setAiLoading] = useState(false);
  const [aiVotes, setAiVotes] = useState(() => {
    try { const s = localStorage.getItem("bc_ai_votes"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

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
    if (!personalUser) { alert("Please select your name first!"); return; }
    const { error } = await supabase.from("personal_books").insert({
      title: newPersonal.title.trim(), author: newPersonal.author.trim(),
      genre: newPersonal.genre, rating: newPersonal.myRating,
      cover: newPersonal.cover || null, description: newPersonal.description || null,
      member: personalUser,
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
    setAiVotes({});

    // Build personal books summary — only books rated 7+ out of 10
    const highlyRatedPersonal = personalBooks.filter(b => (b.rating || 0) >= 7);
    const memberTastes = MEMBERS.map(member => {
      const theirBooks = highlyRatedPersonal.filter(b => b.member === member);
      if (!theirBooks.length) return null;
      return `${member} (rated 7+/10): ${theirBooks.map(b => `"${b.title}" by ${b.author} (${b.genre}, ${b.rating}/10)`).join(", ")}`;
    }).filter(Boolean).join("\n");

    // Books already read as a group (for context — don't re-recommend these)
    const alreadyRead = books.map(b => `"${b.title}" by ${b.author}`).join(", ");

    // Books appearing on multiple personal lists (avoid recommending these)
    const allPersonalTitles = personalBooks.map(b => b.title.toLowerCase().trim());
    const titleCounts = {};
    allPersonalTitles.forEach(t => { titleCounts[t] = (titleCounts[t] || 0) + 1; });
    const multiPersonalBooks = personalBooks
      .filter(b => titleCounts[b.title.toLowerCase().trim()] > 1)
      .map(b => `"${b.title}" by ${b.author}`)
      .filter((v, i, a) => a.indexOf(v) === i);

    // Member suggestions as secondary signal
    const suggSummary = suggestions.length
      ? suggestions.map(s => `"${s.title}" by ${s.author} (${s.genre}) — suggested by ${s.suggested_by}${s.reason ? `, reason: ${s.reason}` : ""}, ${s.votes?.length||0} vote(s)`).join("\n")
      : "None";

    const prompt = `You are an expert book recommendation engine for a women's book club with ${MEMBERS.length} members.

YOUR PRIMARY DATA SOURCE — Members' personal reading lists (books they've personally read and rated 7 or higher out of 10, meaning they genuinely loved them):
${memberTastes || "No personal books rated 7+ yet — use suggestions and general taste inference instead."}

SECONDARY SIGNAL — Books members have suggested for the club:
${suggSummary}

ALREADY READ AS A GROUP (do NOT recommend these):
${alreadyRead || "None yet"}

BOOKS ALREADY READ BY MULTIPLE MEMBERS (do NOT recommend these — they've already read them individually):
${multiPersonalBooks.length ? multiPersonalBooks.join(", ") : "None"}

YOUR TASK:
Analyse the crossover in taste between members. Look for:
- Genres, themes, writing styles, and authors that multiple members love
- Hidden connections between what different members enjoy
- Books that would genuinely satisfy the most members based on their proven reading tastes

Return a ranked list of exactly 10 books the whole group should read next. For each, explain specifically WHICH members' taste it matches and why, based on their personal reading history.

Respond ONLY with a valid JSON array, no markdown, no extra text:
[{
  "rank": 1,
  "title": "string",
  "author": "string",
  "genre": "string",
  "fromSuggestions": false,
  "blurb": "2-3 sentence enticing description of what the book is about and why it's a compelling read",
  "whyThisBook": "2 sentences on why this fits the group's collective taste",
  "memberMatch": [{"name": "MemberName", "reason": "one short sentence why this member will love it"}],
  "tasteOverlap": "one sentence describing the shared taste pattern this pick targets",
  "matchScore": 85
}]`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type":"application/json", "x-api-key":ANTHROPIC_API_KEY, "anthropic-version":"2023-06-01" },
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:3000, messages:[{ role:"user", content:prompt }] })
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
      console.error(e);
      setAiRecs([{ error: true }]);
    }
    setAiLoading(false);
  }

  useEffect(() => {
    try { localStorage.setItem("bc_ai_recs", JSON.stringify(aiRecs)); } catch {}
  }, [aiRecs]);

  useEffect(() => {
    try { localStorage.setItem("bc_ai_votes", JSON.stringify(aiVotes)); } catch {}
  }, [aiVotes]);

  function toggleAiVote(rank) {
    if (!currentUser) { alert("Select your name first!"); return; }
    setAiVotes(prev => {
      const current = prev[currentUser];
      if (current === rank) {
        // unvote
        const updated = { ...prev };
        delete updated[currentUser];
        return updated;
      }
      return { ...prev, [currentUser]: rank };
    });
  }

  const sortedBooks = [...books].sort((a,b) => (parseFloat(avgRating(b.ratings))||0)-(parseFloat(avgRating(a.ratings))||0));
  const sortedSuggs = [...suggestions].sort((a,b) => (b.votes?.length||0)-(a.votes?.length||0));
  const myPersonalBooks = personalBooks.filter(b => b.member === personalUser);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'Inter',sans-serif",fontSize:52,fontWeight:900,color:"#C8391B",textTransform:"uppercase",letterSpacing:-2,background:"#F5F2EC"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@900&display=swap');*{margin:0;padding:0;box-sizing:border-box}`}</style>
      BOOKED.IN
    </div>
  );

  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --bg:#F5F2EC;
      --card:#FDFCF9;
      --red:#C8391B;
      --yellow:#F0C93A;
      --black:#1A1208;
      --border:#DDD8CE;
      --mid:#8A8278;
      --D:'Inter',sans-serif;
      --S:'Inter',sans-serif;
      --B:'Inter',sans-serif;
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
    .section-title{font-family:var(--S);font-size:26px;font-weight:400;letter-spacing:-.3px}
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
    .bdesc-wrap{margin-top:6px}
    .bdesc{font-size:12px;color:var(--mid);line-height:1.55;font-style:italic;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    .bdesc.bdesc-open{display:block;overflow:visible;-webkit-line-clamp:unset}
    .bdesc-toggle{background:none;border:none;padding:2px 0 0;font-size:11px;color:var(--red);cursor:pointer;font-family:var(--B);font-weight:600;display:block;margin-top:2px}
    .bdesc-toggle:hover{text-decoration:underline}
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
    .star{background:none;border:none;cursor:pointer;color:var(--border);padding:0;transition:color .1s;line-height:1;position:relative;display:inline-block}
    .star.star-full{color:var(--yellow)}
    .star.star-empty{color:var(--border)}
    .star.star-half{color:var(--border)}
    .star.readonly{cursor:default;pointer-events:none}
    .star-label{font-size:13px;font-weight:600;margin-left:6px;color:var(--red);font-family:var(--D)}
    .star-half-wrap{position:relative;display:inline-block;line-height:1}
    .star-half-filled{position:absolute;left:0;top:0;width:50%;overflow:hidden;color:var(--yellow);display:inline-block;white-space:nowrap}
    .star-half-empty{color:var(--border);display:inline-block}

    /* ── TAB DESCRIPTIONS ── */
    .tab-desc{font-size:13px;color:var(--mid);margin-bottom:22px;line-height:1.6;max-width:580px;padding:10px 14px;background:var(--card);border:1px solid var(--border);border-radius:6px;border-left:3px solid var(--yellow)}

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
    .ai-data-warning{background:var(--yellow);border-radius:6px;padding:10px 14px;font-size:13px;font-weight:500;margin-bottom:16px;max-width:560px;color:var(--black)}
    .rec-overlap{font-size:11px;color:var(--red);font-weight:600;margin-top:6px;text-transform:uppercase;letter-spacing:.04em}
    .rec-blurb{font-size:12px;line-height:1.6;margin-top:6px;color:var(--black);font-style:italic;padding:8px 10px;background:var(--bg);border-radius:4px;border-left:2px solid var(--yellow)}
    .rec-members{display:flex;flex-direction:column;gap:4px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
    .rec-member-row{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}
    .rec-member-name{font-size:11px;font-weight:700;color:var(--black);text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
    .rec-member-reason{font-size:11px;color:var(--mid);font-style:italic}
    .rec-vote-col{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 12px;border-left:1px solid var(--border);flex-shrink:0;gap:3px;min-width:54px}
    .rec-vote-btn{background:none;border:1.5px solid var(--border);border-radius:6px;padding:5px 9px;cursor:pointer;font-family:var(--D);font-size:16px;font-weight:900;color:var(--mid);transition:all .12s;width:100%}
    .rec-vote-btn.voted{background:var(--red);border-color:var(--red);color:#fff}
    .rec-vote-btn:hover:not(.voted){border-color:var(--black);color:var(--black)}
    .rec-vote-count{font-family:var(--D);font-size:18px;font-weight:900;color:var(--black);line-height:1}
    .rec-vote-label{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--mid)}
    .rec-refresh-row{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap}
    .rec-refresh-note{font-size:12px;color:var(--mid);font-style:italic}

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
    .cover-upload-wrap{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .cover-upload-btn{background:none;border:1px solid var(--border);border-radius:5px;padding:7px 12px;font-size:12px;font-family:var(--B);cursor:pointer;color:var(--mid);transition:all .12s;white-space:nowrap}
    .cover-upload-btn:hover{border-color:var(--black);color:var(--black)}
    .cover-upload-hint{font-size:11px;color:var(--mid);font-style:italic}

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
    .modal h3{font-family:var(--S);font-size:18px;font-weight:700;letter-spacing:-.3px;margin-bottom:3px}
    .modal p{font-size:12px;color:var(--mid);margin-bottom:14px}
    .modal-textarea{padding:8px 10px;border:1px solid var(--border);border-radius:5px;font-family:var(--B);font-size:13px;outline:none;resize:vertical;width:100%;min-height:80px;transition:border-color .12s}
    .modal-textarea:focus{border-color:var(--red)}

    .empty{text-align:center;padding:40px 28px;color:var(--mid)}
    .empty-title{font-family:var(--S);font-size:22px;font-style:italic;color:var(--border)}
    .empty-sub{font-size:13px;margin-top:4px}
    .need-name{background:var(--yellow);border-radius:5px;padding:9px 14px;font-size:13px;font-weight:500;margin-bottom:12px;color:var(--black)}
    .no-name-banner{background:var(--yellow);border-radius:6px;padding:11px 16px;font-size:13px;font-weight:500;margin-bottom:20px;color:var(--black);display:flex;align-items:center;gap:8px}
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
          {tab==="library"&&<><em>Booked In</em> Library</>}
          {tab==="suggestions"&&<>What&apos;s <em>Next?</em></>}
          {tab==="recommend"&&<>AI <em>Recommendations</em></>}
          {tab==="personal"&&<><em>Personal</em> Library</>}
        </div>
        <div className="hero-stats">
          <div className="hstat"><div className="hstat-n">{books.length}</div><div className="hstat-l">Read</div></div>
          <div className="hstat"><div className="hstat-n">{books.length?(books.reduce((s,b)=>s+(parseFloat(avgRating(b.ratings))||0),0)/books.length).toFixed(1):"—"}</div><div className="hstat-l">Avg</div></div>
          <div className="hstat"><div className="hstat-n">{suggestions.length}</div><div className="hstat-l">Ideas</div></div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div className="tabs">
        {[["library","📚 Booked In Library"],["suggestions","💡 Suggestions"],["recommend","✨ AI Recommendations"],["personal","👤 Personal Library"]].map(([id,lbl])=>(
          <button key={id} className={`tbtn ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{lbl}</button>
        ))}
      </div>

      <div className="content">
        {!currentUser&&(
          <div className="no-name-banner">
            👋 <strong>Select your name</strong> in the top right to rate books, add suggestions, and more.
          </div>
        )}

        {/* ── LIBRARY ── */}
        {tab==="library"&&(
          <div>
            <p className="tab-desc">Every book the club has read together, ranked by average member rating. Rate books, leave notes, and keep the record straight.</p>
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
                    {book.description&&<BlurbText text={book.description}/>}
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
                      <button className="ratebtn" onClick={()=>{
                        if (!currentUser) return;
                        setRateModal(book);
                        setMyRating((book.ratings||{})[currentUser]||7);
                        setMyComment((book.comments||{})[currentUser]||"");
                      }}>
                        {currentUser&&(book.ratings||{})[currentUser]?"Rated ✓":"Rate"}
                      </button>
                      <button className="iconbtn" onClick={()=>{setEditModal(book);setEditForm({title:book.title,author:book.author,genre:book.genre,cover:book.cover,description:book.description||""})}}>Edit</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!currentUser&&<div className="need-name" style={{display:"none"}}/>}
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

        {/* ── SUGGESTIONS ── */}
        {tab==="suggestions"&&(
          <div>
            <p className="tab-desc">Suggest books you'd love the club to read next. Vote for your favourites — the most-voted ideas rise to the top.</p>
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
                    {s.description&&<BlurbText text={s.description}/>}
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

        {tab==="recommend"&&(
          <div>
            <div className="section-hdr"><div className="section-title">AI Recommendations</div></div>
            <p className="tab-desc">Claude analyses everyone's personal reading lists (books rated 7+/10) to find crossover in taste — then picks the books most likely to be loved by the whole group. Once generated, the list stays until Ellie refreshes it. Everyone gets one vote for the book they want to read next.</p>
            {personalBooks.filter(b=>(b.rating||0)>=7).length < 3 && (
              <div className="ai-data-warning">💡 The more books everyone adds to their personal reading list with ratings, the better the recommendations will be!</div>
            )}
            {currentUser===ADMIN?(
              <div className="rec-refresh-row">
                <button className="aibtn" onClick={getAIRecs} disabled={aiLoading}>
                  {aiLoading?"Analysing everyone's taste…":aiRecs.length?"🔄 Refresh Top 10":"✦ Generate Top 10"}
                </button>
                {aiRecs.length>0&&!aiLoading&&<span className="rec-refresh-note">Results are saved until you refresh</span>}
              </div>
            ):(
              <div className="ai-view-only"><strong>Only Ellie can generate this list.</strong> Ask her to run it at your next meeting!</div>
            )}
            {aiRecs.length===0&&!aiLoading&&(
              <div className="no-recs">{currentUser===ADMIN?"Hit the button above — the more personal books everyone has added, the better!":"Ask Ellie to generate the list!"}</div>
            )}
            {aiRecs.length>0&&!aiRecs[0]?.error&&(
              <div className="recs-list">
                {aiRecs.map(rec=>{
                  const voteCount = Object.values(aiVotes).filter(v=>v===rec.rank).length;
                  const myVote = aiVotes[currentUser];
                  const iVoted = myVote===rec.rank;
                  return (
                    <div key={rec.rank} className="rec-card">
                      <div className="rec-rank-col">
                        <div className={`rec-rank-num ${rec.rank<=3?"gold":""}`}>{rec.rank}</div>
                      </div>
                      {rec.cover?<img src={rec.cover} alt="" className="rec-cover"/>:<div className="rec-cover-ph">📖</div>}
                      <div className="rec-body">
                        <div className="rec-title">{rec.title}</div>
                        <div className="rec-author">by {rec.author} · {rec.genre}
                          {rec.fromSuggestions&&<span className="rec-from" style={{marginLeft:6}}>from suggestions</span>}
                        </div>
                        {rec.blurb&&<div className="rec-blurb">{rec.blurb}</div>}
                        <div className="rec-why">{rec.whyThisBook}</div>
                        {rec.tasteOverlap&&<div className="rec-overlap">✦ {rec.tasteOverlap}</div>}
                        {rec.memberMatch&&rec.memberMatch.length>0&&(
                          <div className="rec-members">
                            {rec.memberMatch.map((m,i)=>(
                              <div key={i} className="rec-member-row">
                                <span className="rec-member-name">{m.name}</span>
                                <span className="rec-member-reason">{m.reason}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="rec-footer">
                          <div className="rec-match">{rec.matchScore}% group match</div>
                        </div>
                      </div>
                      <div className="rec-vote-col">
                        <div className="rec-vote-count">{voteCount}</div>
                        <div className="rec-vote-label">vote{voteCount!==1?"s":""}</div>
                        {currentUser&&(
                          <button
                            className={`rec-vote-btn ${iVoted?"voted":""}`}
                            onClick={()=>toggleAiVote(rec.rank)}
                            title={iVoted?"Remove vote":"Vote for this book"}
                          >{iVoted?"✓":"▲"}</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {Object.keys(aiVotes).length>0&&(
                  <div style={{marginTop:14,padding:"10px 14px",background:"var(--card)",border:"1px solid var(--border)",borderRadius:6,fontSize:12}}>
                    <strong style={{fontSize:11,textTransform:"uppercase",letterSpacing:".04em"}}>Votes so far:</strong>
                    <span style={{color:"var(--mid)",marginLeft:8}}>
                      {Object.entries(aiVotes).map(([member,rank])=>`${member} → #${rank}`).join(" · ")}
                    </span>
                  </div>
                )}
              </div>
            )}
            {aiRecs[0]?.error&&<div className="aierr">Couldn't get recommendations — try again in a moment.</div>}
          </div>
        )}

        {/* ── PERSONAL LIBRARY ── */}
        {tab==="personal"&&(
          <div>
            <div className="section-hdr">
              <div className="section-title">Personal Library</div>
            </div>
            <p className="tab-desc">Everyone's personal reading list — books you've read outside of book club. Add your own reads with ratings; the AI uses highly-rated books (7+/10) to power its recommendations.</p>
            {/* Member selector — independent from the global user selector */}
            <div style={{marginBottom:20}}>
              <select
                className="user-dropdown"
                value={personalUser}
                onChange={e=>setPersonalUser(e.target.value)}
                style={{minWidth:160}}
              >
                <option value="">Select a member…</option>
                {MEMBERS.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {!personalUser&&<div className="need-name">Select a member above to see their personal reading list.</div>}

            {personalUser&&(
              <>
                <div style={{marginBottom:16}}>
                  <strong style={{fontFamily:"var(--D)",fontSize:18,textTransform:"uppercase",letterSpacing:"-.1px"}}>{personalUser}'s personal reads</strong>
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
                        {book.description&&<BlurbText text={book.description}/>}
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
                  <button className="addbtn" onClick={()=>setShowAddPersonal(true)}>＋ Add to {personalUser}'s reading list</button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Rate & Note modal */}
      {rateModal&&(
        <div className="overlay" onClick={()=>setRateModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>{rateModal.title}</h3>
            <p>by {rateModal.author} · as {currentUser}</p>
            <div className="rlbl" style={{marginBottom:8}}>Your Score Out of 10</div>
            <StarRating value={myRating} onChange={setMyRating}/>
            <div className="rlbl" style={{marginTop:16,marginBottom:6}}>Your Note <span style={{fontWeight:400,textTransform:"none",letterSpacing:0}}>(optional)</span></div>
            <textarea className="modal-textarea" value={myComment} onChange={e=>setMyComment(e.target.value)} placeholder="What did you think? Any favourite moments?"/>
            <div className="factions" style={{marginTop:14}}>
              <button className="bprimary" onClick={async()=>{
                const book = books.find(b=>b.id===rateModal.id);
                const updRatings = {...(book.ratings||{}), [currentUser]: myRating};
                const updComments = {...(book.comments||{}), [currentUser]: myComment};
                await supabase.from("books").update({ratings:updRatings, comments:updComments}).eq("id",rateModal.id);
                await fetchAll();
                setRateModal(null);
                setMyComment("");
              }}>Save</button>
              <button className="bcancel" onClick={()=>{setRateModal(null);setMyComment("");}}>Cancel</button>
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
              <div className="fgrp">
                <label>Blurb / Description</label>
                <textarea value={editForm.description||""} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))} placeholder="A short description of the book…" style={{minHeight:80,resize:"vertical",padding:"8px 10px",border:"1px solid var(--border)",borderRadius:5,fontFamily:"var(--B)",fontSize:13,outline:"none",width:"100%"}}/>
                <button
                  type="button"
                  className="cover-upload-btn"
                  style={{marginTop:5,alignSelf:"flex-start"}}
                  onClick={async()=>{
                    const results = await searchGoogleBooks(`${editForm.title} ${editForm.author}`);
                    if (results[0]?.description) setEditForm(f=>({...f,description:results[0].description}));
                    else alert("No description found — try editing the title/author first.");
                  }}
                >🔍 Fetch from Google Books</button>
              </div>
            </div>
            <div className="factions">
              <button className="bprimary" onClick={saveEdit}>Save</button>
              <button className="bcancel" onClick={()=>setEditModal(null)}>Cancel</button>
              <button className="delbtn" style={{marginLeft:"auto"}} onClick={()=>{setEditModal(null);deleteBook(editModal.id);}}>Delete book</button>
            </div>
          </div>
        </div>
      )}

      {/* Personal book edit modal */}
      {editPersonalModal&&(
        <div className="overlay" onClick={()=>setEditPersonalModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>Edit Book</h3>
            <p>Editing your personal entry for this book</p>
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
