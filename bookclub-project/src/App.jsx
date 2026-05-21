import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── REPLACE THESE with your Supabase project values ───────────────────────
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
// ────────────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GENRES = ["Literary Fiction","Fiction","Memoir","Non-Fiction","Mystery","Sci-Fi","Fantasy","Historical Fiction","Romance","Thriller"];
const MEMBERS = ["Ellie", "Sara", "Tom", "Jess"]; // ← add your friends' names here

function avgRating(ratings) {
  const vals = Object.values(ratings || {}).filter(Boolean);
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
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

export default function BookClub() {
  const [currentUser, setCurrentUser] = useState(MEMBERS[0]);
  const [books, setBooks] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [tab, setTab] = useState("library");
  const [loading, setLoading] = useState(true);
  const [showAddBook, setShowAddBook] = useState(false);
  const [showAddSugg, setShowAddSugg] = useState(false);
  const [rateModal, setRateModal] = useState(null);
  const [myRating, setMyRating] = useState(7);
  const [aiRec, setAiRec] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", author: "", genre: "Literary Fiction", myRating: 7 });
  const [newSugg, setNewSugg] = useState({ title: "", author: "", genre: "Literary Fiction", reason: "" });

  const fetchAll = useCallback(async () => {
    const [{ data: b }, { data: s }] = await Promise.all([
      supabase.from("books").select("*").order("created_at", { ascending: false }),
      supabase.from("suggestions").select("*").order("created_at", { ascending: false }),
    ]);
    setBooks(b || []);
    setSuggestions(s || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const bSub = supabase.channel("books-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "books" }, fetchAll)
      .subscribe();
    const sSub = supabase.channel("sugg-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "suggestions" }, fetchAll)
      .subscribe();
    return () => { bSub.unsubscribe(); sSub.unsubscribe(); };
  }, [fetchAll]);

  async function addBook() {
    if (!newBook.title.trim() || !newBook.author.trim()) return;
    await supabase.from("books").insert({
      title: newBook.title.trim(), author: newBook.author.trim(),
      genre: newBook.genre, ratings: { [currentUser]: newBook.myRating }, added_by: currentUser,
    });
    setNewBook({ title: "", author: "", genre: "Literary Fiction", myRating: 7 });
    setShowAddBook(false);
  }

  async function rateBook(bookId) {
    const book = books.find(b => b.id === bookId);
    const updated = { ...(book.ratings || {}), [currentUser]: myRating };
    await supabase.from("books").update({ ratings: updated }).eq("id", bookId);
    setRateModal(null);
  }

  async function addSuggestion() {
    if (!newSugg.title.trim() || !newSugg.author.trim()) return;
    await supabase.from("suggestions").insert({
      title: newSugg.title.trim(), author: newSugg.author.trim(),
      genre: newSugg.genre, reason: newSugg.reason.trim(),
      suggested_by: currentUser, votes: [currentUser],
    });
    setNewSugg({ title: "", author: "", genre: "Literary Fiction", reason: "" });
    setShowAddSugg(false);
  }

  async function toggleVote(sugg) {
    const has = (sugg.votes || []).includes(currentUser);
    const updated = has ? sugg.votes.filter(v => v !== currentUser) : [...(sugg.votes || []), currentUser];
    await supabase.from("suggestions").update({ votes: updated }).eq("id", sugg.id);
  }

  async function getAIRec() {
    setAiLoading(true);
    setAiRec(null);
    const bookSummary = books.map(b =>
      `"${b.title}" by ${b.author} (${b.genre}) - avg ${avgRating(b.ratings) || "unrated"}/10. Ratings: ${Object.entries(b.ratings || {}).map(([m,r]) => `${m}:${r}`).join(", ")}`
    ).join("\n");
    const suggSummary = suggestions.map(s =>
      `"${s.title}" by ${s.author} (${s.genre}) - suggested by ${s.suggested_by}, ${s.votes?.length || 0} vote(s)${s.reason ? `. Why: ${s.reason}` : ""}`
    ).join("\n");

    const prompt = `You are a book recommendation expert for a small book club with members: ${MEMBERS.join(", ")}.

BOOKS ALREADY READ (with member ratings out of 10):
${bookSummary || "None yet"}

MEMBER SUGGESTIONS FOR NEXT BOOK:
${suggSummary || "None yet"}

Your task: Analyse the group's taste based on ratings and what they've suggested, then pick THE single best next book.
- First check if any suggestion fits the group's proven taste well - if so, recommend it.
- If none fit well, suggest something new that matches their taste profile.
- Consider what genres/themes each member rates highest individually.

Respond ONLY with valid JSON (no markdown, no extra text):
{
  "title": "string",
  "author": "string",
  "genre": "string",
  "fromSuggestions": boolean,
  "suggestedBy": "member name or null",
  "whyThisBook": "2-3 sentences about why this fits the GROUP's collective taste",
  "memberFit": { "MemberName": "one short sentence why they'll like it" },
  "groupTasteInsight": "one sentence capturing what this group loves in books",
  "matchScore": number between 70-99
}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      setAiRec(JSON.parse(text.replace(/```json|```/g, "").trim()));
    } catch {
      setAiRec({ error: true });
    }
    setAiLoading(false);
  }

  const sortedBooks = [...books].sort((a, b) => (parseFloat(avgRating(b.ratings)) || 0) - (parseFloat(avgRating(a.ratings)) || 0));
  const sortedSuggs = [...suggestions].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));

  if (loading) return <div className="splash">Opening the book…</div>;

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{--cream:#f5f0e8;--warm:#faf8f3;--ink:#1a1208;--brown:#6b4c2a;--gold:#c9922a;--goldl:#e8c97a;--sage:#7a9e7e;--rust:#c4622d;--paper:#ede8dc;--border:#d4c9b0;--sh:rgba(26,18,8,.08)}
        body{background:var(--cream);font-family:'DM Sans',sans-serif;color:var(--ink)}
        .splash{display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Playfair Display',serif;font-size:22px;color:var(--brown);font-style:italic}
        .app{min-height:100vh;max-width:880px;margin:0 auto;padding:0 16px 80px}
        .hdr{padding:32px 0 22px;border-bottom:2px solid var(--ink);margin-bottom:26px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .hdr h1{font-family:'Playfair Display',serif;font-size:clamp(26px,6vw,42px);font-weight:700;letter-spacing:-.5px;line-height:1}
        .hdr h1 em{font-style:italic;color:var(--gold)}
        .hdr-sub{font-size:12px;color:var(--brown);margin-top:3px;text-transform:uppercase;letter-spacing:.08em}
        .live-dot{display:inline-block;width:7px;height:7px;background:var(--sage);border-radius:50%;margin-right:5px;animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .who{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
        .who span{font-size:12px;color:var(--brown);text-transform:uppercase;letter-spacing:.06em}
        .who-btn{background:none;border:1.5px solid var(--border);border-radius:20px;padding:4px 14px;font-size:13px;font-family:'DM Sans',sans-serif;cursor:pointer;transition:all .15s;color:var(--ink)}
        .who-btn.on{background:var(--ink);color:var(--cream);border-color:var(--ink)}
        .who-btn:hover:not(.on){border-color:var(--ink)}
        .stats{display:flex;gap:14px;margin-bottom:26px;flex-wrap:wrap}
        .scard{background:var(--paper);border:1px solid var(--border);border-radius:10px;padding:12px 18px;flex:1;min-width:100px}
        .scard .n{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;line-height:1}
        .scard .l{font-size:11px;color:var(--brown);text-transform:uppercase;letter-spacing:.07em;margin-top:2px}
        .tabs{display:flex;border-bottom:1.5px solid var(--border);margin-bottom:26px}
        .tbtn{background:none;border:none;padding:9px 18px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;color:var(--brown);border-bottom:2.5px solid transparent;margin-bottom:-1.5px;transition:all .15s}
        .tbtn.on{color:var(--ink);border-bottom-color:var(--gold)}
        .tbtn:hover:not(.on){color:var(--ink)}
        .blist{display:flex;flex-direction:column;gap:12px}
        .bcard{background:var(--warm);border:1px solid var(--border);border-radius:12px;padding:16px 18px;display:flex;gap:14px;align-items:flex-start;transition:box-shadow .15s}
        .bcard:hover{box-shadow:0 4px 18px var(--sh)}
        .brank{font-family:'Playfair Display',serif;font-size:20px;color:var(--border);font-weight:700;min-width:28px;padding-top:2px}
        .binfo{flex:1;min-width:0}
        .btitle{font-family:'Playfair Display',serif;font-size:16px;font-weight:700}
        .bauthor{font-size:13px;color:var(--brown);margin-top:1px}
        .bgenre{display:inline-block;font-size:11px;background:var(--paper);border:1px solid var(--border);border-radius:20px;padding:2px 9px;margin-top:5px;color:var(--brown)}
        .bratings{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
        .mrat{font-size:12px;background:var(--cream);border-radius:20px;padding:2px 9px;display:flex;align-items:center;gap:3px}
        .mrat .who2{color:var(--brown)}
        .mrat .sc{font-weight:700;color:var(--gold)}
        .bright{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
        .avgscore{font-family:'Playfair Display',serif;font-size:30px;font-weight:700;line-height:1}
        .avglbl{font-size:10px;color:var(--brown);text-transform:uppercase;letter-spacing:.07em}
        .ratebtn{background:none;border:1.5px solid var(--gold);color:var(--gold);border-radius:20px;padding:3px 12px;font-size:12px;font-family:'DM Sans',sans-serif;cursor:pointer;transition:all .15s;white-space:nowrap}
        .ratebtn:hover{background:var(--gold);color:#fff}
        .addedbylbl{font-size:10px;color:var(--border);margin-top:3px}
        .star-row{display:flex;align-items:center;gap:1px}
        .star{background:none;border:none;cursor:pointer;color:var(--border);padding:0;transition:color .1s;line-height:1}
        .star.filled{color:var(--gold)}
        .star.readonly{cursor:default}
        .star-label{font-size:14px;font-weight:700;margin-left:6px;color:var(--gold)}
        .slist{display:flex;flex-direction:column;gap:11px}
        .scard2{background:var(--warm);border:1px solid var(--border);border-radius:12px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px}
        .sinfo{flex:1;min-width:0}
        .stitle{font-family:'Playfair Display',serif;font-size:15px;font-weight:700}
        .sauthor{font-size:13px;color:var(--brown);margin-top:1px}
        .smeta{font-size:11px;color:var(--brown);margin-top:3px}
        .sreason{font-size:12px;color:var(--ink);margin-top:6px;font-style:italic;opacity:.75}
        .vbtn{display:flex;flex-direction:column;align-items:center;gap:1px;background:none;border:1.5px solid var(--border);border-radius:10px;padding:7px 12px;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;min-width:50px;flex-shrink:0}
        .vbtn.on{background:var(--sage);border-color:var(--sage);color:#fff}
        .vbtn:hover:not(.on){border-color:var(--sage)}
        .vcnt{font-size:17px;font-weight:700;font-family:'Playfair Display',serif}
        .vlbl{font-size:10px;text-transform:uppercase;letter-spacing:.06em}
        .aibtn{width:100%;padding:13px;background:var(--ink);color:var(--cream);border:none;border-radius:12px;font-family:'Playfair Display',serif;font-size:16px;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:7px}
        .aibtn:hover{background:var(--brown)}
        .aibtn:disabled{opacity:.6;cursor:not-allowed}
        .airec{margin-top:16px;background:var(--ink);color:var(--cream);border-radius:16px;padding:22px 20px;position:relative;overflow:hidden}
        .airec::before{content:'';position:absolute;top:-20px;right:-20px;width:100px;height:100px;border-radius:50%;background:rgba(201,146,42,.12);pointer-events:none}
        .aibadge{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--goldl);margin-bottom:10px}
        .aititle{font-family:'Playfair Display',serif;font-size:21px;font-weight:700}
        .aiauthor{font-size:13px;color:var(--goldl);margin-top:3px}
        .aiwhy{font-size:14px;line-height:1.65;margin-top:12px;color:rgba(245,240,232,.85)}
        .aimembers{display:flex;flex-direction:column;gap:5px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(245,240,232,.12)}
        .aimem{font-size:12px;color:rgba(245,240,232,.65)}
        .aimem strong{color:rgba(245,240,232,.9);margin-right:4px}
        .aiinsight{font-size:12px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(245,240,232,.12);color:rgba(245,240,232,.5);font-style:italic}
        .aimatch{display:inline-block;background:var(--gold);color:var(--ink);font-size:12px;font-weight:700;border-radius:20px;padding:2px 11px;margin-top:10px}
        .aifromsugg{display:inline-block;background:var(--sage);color:#fff;font-size:11px;border-radius:20px;padding:2px 9px;margin-left:7px}
        .addbtn{display:flex;align-items:center;gap:6px;background:none;border:1.5px dashed var(--border);border-radius:12px;padding:11px 16px;width:100%;cursor:pointer;color:var(--brown);font-family:'DM Sans',sans-serif;font-size:14px;transition:all .15s;margin-top:8px}
        .addbtn:hover{border-color:var(--ink);color:var(--ink)}
        .aform{background:var(--warm);border:1px solid var(--border);border-radius:12px;padding:18px;margin-top:8px;display:flex;flex-direction:column;gap:11px}
        .frow{display:flex;gap:9px;flex-wrap:wrap}
        .fgrp{display:flex;flex-direction:column;gap:3px;flex:1;min-width:150px}
        .fgrp label{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--brown)}
        .fgrp input,.fgrp select,.fgrp textarea{padding:8px 11px;border:1px solid var(--border);border-radius:8px;background:var(--cream);font-family:'DM Sans',sans-serif;font-size:14px;color:var(--ink);outline:none;transition:border-color .15s}
        .fgrp textarea{resize:vertical;min-height:64px}
        .fgrp input:focus,.fgrp select:focus,.fgrp textarea:focus{border-color:var(--gold)}
        .factions{display:flex;gap:7px}
        .bprimary{background:var(--ink);color:var(--cream);border:none;border-radius:8px;padding:9px 18px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;cursor:pointer;transition:background .15s}
        .bprimary:hover{background:var(--brown)}
        .bcancel{background:none;border:1px solid var(--border);border-radius:8px;color:var(--brown);padding:9px 14px;font-family:'DM Sans',sans-serif;font-size:14px;cursor:pointer}
        .rlbl{font-size:13px;color:var(--brown);margin-bottom:7px}
        .overlay{position:fixed;inset:0;background:rgba(26,18,8,.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px}
        .modal{background:var(--warm);border-radius:16px;padding:26px;max-width:370px;width:100%;box-shadow:0 20px 60px rgba(26,18,8,.2)}
        .modal h3{font-family:'Playfair Display',serif;font-size:19px;margin-bottom:3px}
        .modal p{font-size:13px;color:var(--brown);margin-bottom:14px}
        .sectitle{font-family:'Playfair Display',serif;font-size:19px;font-weight:700;margin-bottom:14px}
        .empty{text-align:center;padding:36px;color:var(--brown);font-size:14px;font-style:italic}
        .ai-intro{font-size:14px;color:var(--brown);margin-bottom:18px;line-height:1.6}
        .aierr{margin-top:14px;padding:14px;background:var(--paper);border-radius:10px;color:var(--rust);font-size:14px}
        @media(max-width:500px){.bcard{flex-wrap:wrap}.bright{flex-direction:row;align-items:center;width:100%}.tbtn{padding:9px 10px;font-size:13px}}
      `}</style>

      <div className="hdr">
        <div>
          <h1>The <em>Chapter</em> Club</h1>
          <div className="hdr-sub"><span className="live-dot"/>Live · {MEMBERS.length} members</div>
        </div>
        <div className="who">
          <span>Reading as:</span>
          {MEMBERS.map(m => (
            <button key={m} className={`who-btn ${currentUser===m?"on":""}`} onClick={()=>setCurrentUser(m)}>{m}</button>
          ))}
        </div>
      </div>

      <div className="stats">
        <div className="scard"><div className="n">{books.length}</div><div className="l">Books Read</div></div>
        <div className="scard"><div className="n">{MEMBERS.length}</div><div className="l">Members</div></div>
        <div className="scard"><div className="n">{suggestions.length}</div><div className="l">Suggestions</div></div>
        <div className="scard">
          <div className="n">{books.length ? (books.reduce((s,b)=>s+(parseFloat(avgRating(b.ratings))||0),0)/books.length).toFixed(1) : "—"}</div>
          <div className="l">Avg Rating</div>
        </div>
      </div>

      <div className="tabs">
        {[["library","📚 Library"],["suggestions","💡 Suggestions"],["recommend","✨ AI Pick"]].map(([id,lbl])=>(
          <button key={id} className={`tbtn ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{lbl}</button>
        ))}
      </div>

      {tab==="library" && (
        <div>
          <div className="sectitle">Books we've read</div>
          {sortedBooks.length===0 && <div className="empty">No books yet — add your first one!</div>}
          <div className="blist">
            {sortedBooks.map((book,i) => (
              <div key={book.id} className="bcard">
                <div className="brank">#{i+1}</div>
                <div className="binfo">
                  <div className="btitle">{book.title}</div>
                  <div className="bauthor">{book.author}</div>
                  <span className="bgenre">{book.genre}</span>
                  <div className="bratings">
                    {Object.entries(book.ratings||{}).map(([m,r])=>(
                      <div key={m} className="mrat"><span className="who2">{m}</span><span className="sc">{r}/10</span></div>
                    ))}
                    {MEMBERS.filter(m=>!(book.ratings||{})[m]).map(m=>(
                      <div key={m} className="mrat" style={{opacity:.4}}><span className="who2">{m}</span><span className="sc">–</span></div>
                    ))}
                  </div>
                  <div className="addedbylbl">Added by {book.added_by}</div>
                </div>
                <div className="bright">
                  <div>
                    <div className="avgscore">{avgRating(book.ratings)||"—"}</div>
                    <div className="avglbl">avg / 10</div>
                  </div>
                  {!(book.ratings||{})[currentUser] && (
                    <button className="ratebtn" onClick={()=>{setRateModal(book);setMyRating(7)}}>Rate it</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {showAddBook ? (
            <div className="aform">
              <div className="frow">
                <div className="fgrp"><label>Title</label><input value={newBook.title} onChange={e=>setNewBook(b=>({...b,title:e.target.value}))} placeholder="Book title"/></div>
                <div className="fgrp"><label>Author</label><input value={newBook.author} onChange={e=>setNewBook(b=>({...b,author:e.target.value}))} placeholder="Author name"/></div>
              </div>
              <div className="frow">
                <div className="fgrp"><label>Genre</label>
                  <select value={newBook.genre} onChange={e=>setNewBook(b=>({...b,genre:e.target.value}))}>
                    {GENRES.map(g=><option key={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div><div className="rlbl">Your rating</div><StarRating value={newBook.myRating} onChange={v=>setNewBook(b=>({...b,myRating:v}))}/></div>
              <div className="factions">
                <button className="bprimary" onClick={addBook}>Add book</button>
                <button className="bcancel" onClick={()=>setShowAddBook(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="addbtn" onClick={()=>setShowAddBook(true)}>＋ Add a book we've read</button>
          )}
        </div>
      )}

      {tab==="suggestions" && (
        <div>
          <div className="sectitle">What should we read next?</div>
          {sortedSuggs.length===0 && <div className="empty">No suggestions yet — be the first!</div>}
          <div className="slist">
            {sortedSuggs.map(s=>(
              <div key={s.id} className="scard2">
                <div className="sinfo">
                  <div className="stitle">{s.title}</div>
                  <div className="sauthor">{s.author}</div>
                  <div className="smeta">{s.genre} · suggested by {s.suggested_by}</div>
                  {s.reason && <div className="sreason">"{s.reason}"</div>}
                  <div className="smeta" style={{marginTop:5}}>
                    {s.votes?.length>0 && `👍 ${s.votes.join(", ")}`}
                  </div>
                </div>
                <button className={`vbtn ${s.votes?.includes(currentUser)?"on":""}`} onClick={()=>toggleVote(s)}>
                  <span className="vcnt">{s.votes?.length||0}</span>
                  <span className="vlbl">{s.votes?.includes(currentUser)?"✓ voted":"vote"}</span>
                </button>
              </div>
            ))}
          </div>
          {showAddSugg ? (
            <div className="aform">
              <div className="frow">
                <div className="fgrp"><label>Title</label><input value={newSugg.title} onChange={e=>setNewSugg(s=>({...s,title:e.target.value}))} placeholder="Book title"/></div>
                <div className="fgrp"><label>Author</label><input value={newSugg.author} onChange={e=>setNewSugg(s=>({...s,author:e.target.value}))} placeholder="Author name"/></div>
              </div>
              <div className="frow">
                <div className="fgrp"><label>Genre</label>
                  <select value={newSugg.genre} onChange={e=>setNewSugg(s=>({...s,genre:e.target.value}))}>
                    {GENRES.map(g=><option key={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <div className="fgrp"><label>Why this book? (optional)</label>
                <textarea value={newSugg.reason} onChange={e=>setNewSugg(s=>({...s,reason:e.target.value}))} placeholder="Tell the group why you think they'd love it…"/>
              </div>
              <div className="factions">
                <button className="bprimary" onClick={addSuggestion}>Submit suggestion</button>
                <button className="bcancel" onClick={()=>setShowAddSugg(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="addbtn" onClick={()=>setShowAddSugg(true)}>＋ Suggest a book</button>
          )}
        </div>
      )}

      {tab==="recommend" && (
        <div>
          <div className="sectitle">AI Book Recommendation</div>
          <p className="ai-intro">Claude analyses your group's ratings, everyone's suggestions, and your collective taste — then picks the perfect next read for the whole group.</p>
          <button className="aibtn" onClick={getAIRec} disabled={aiLoading}>
            {aiLoading ? "✦ Analysing your taste…" : "✦ Recommend our next book"}
          </button>
          {aiRec && !aiRec.error && (
            <div className="airec">
              <div className="aibadge">✦ Your next read</div>
              <div className="aititle">{aiRec.title}</div>
              <div className="aiauthor">by {aiRec.author} · {aiRec.genre}
                {aiRec.fromSuggestions && <span className="aifromsugg">from your suggestions</span>}
              </div>
              <div className="aiwhy">{aiRec.whyThisBook}</div>
              {aiRec.memberFit && (
                <div className="aimembers">
                  {Object.entries(aiRec.memberFit).map(([m,why])=>(
                    <div key={m} className="aimem"><strong>{m}:</strong>{why}</div>
                  ))}
                </div>
              )}
              {aiRec.matchScore && <div className="aimatch">{aiRec.matchScore}% group match</div>}
              {aiRec.groupTasteInsight && <div className="aiinsight">"{aiRec.groupTasteInsight}"</div>}
            </div>
          )}
          {aiRec?.error && <div className="aierr">Couldn't get a recommendation right now — try again in a moment.</div>}
        </div>
      )}

      {rateModal && (
        <div className="overlay" onClick={()=>setRateModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>{rateModal.title}</h3>
            <p>by {rateModal.author} · rating as {currentUser}</p>
            <div className="rlbl">Your score out of 10:</div>
            <StarRating value={myRating} onChange={setMyRating}/>
            <div className="factions" style={{marginTop:18}}>
              <button className="bprimary" onClick={()=>rateBook(rateModal.id)}>Save rating</button>
              <button className="bcancel" onClick={()=>setRateModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
