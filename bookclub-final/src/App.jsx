import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qjxeotvgnatsnaecesjl.supabase.co";
const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_KEY_HERE";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GENRES = ["Literary Fiction","Fiction","Memoir","Non-Fiction","Mystery","Sci-Fi","Fantasy","Historical Fiction","Romance","Thriller"];
const MEMBERS = ["Tash","Chloe","Ali","Ellie","Bec","Rachel","Soph","Emma","Georgie","Izzy","Maddie","Cassie"];

function avgRating(ratings) {
  const vals = Object.values(ratings || {}).filter(Boolean);
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

function StarRating({ value, onChange, readonly, size = 20 }) {
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
    const prompt = `You are a book recommendation expert for a book club with members: ${MEMBERS.join(", ")}.

BOOKS ALREADY READ (with member ratings out of 10):
${bookSummary || "None yet"}

MEMBER SUGGESTIONS FOR NEXT BOOK:
${suggSummary || "None yet"}

Pick THE single best next book. Check suggestions first — if one fits the group's taste, recommend it. Otherwise suggest something new.

Respond ONLY with valid JSON (no markdown):
{
  "title": "string",
  "author": "string",
  "genre": "string",
  "fromSuggestions": boolean,
  "suggestedBy": "member name or null",
  "whyThisBook": "2-3 sentences about why this fits the GROUP",
  "memberFit": { "MemberName": "one short sentence" },
  "groupTasteInsight": "one sentence capturing what this group loves",
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

  if (loading) return (
    <div className="splash">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,700;0,800;0,900;1,700;1,800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');
        body{margin:0;background:#fff;font-family:'DM Sans',sans-serif}
        .splash{display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Barlow Condensed',sans-serif;font-size:48px;font-weight:900;color:#E8000D;letter-spacing:-1px;text-transform:uppercase}
      `}</style>
      BOOKED IN
    </div>
  );

  return (
    <div className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,700;0,800;0,900;1,700;1,800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{
          --red:#E8000D;--yellow:#FFD600;--black:#0A0A0A;--white:#FFFFFF;
          --offwhite:#F7F6F2;--grey:#E8E6E0;--midgrey:#999590;
          --display:'Barlow Condensed',sans-serif;--body:'DM Sans',sans-serif;
        }
        body{background:var(--white);font-family:var(--body);color:var(--black)}
        .app{min-height:100vh}
        .hdr{background:var(--white);border-bottom:2px solid var(--black);padding:0 32px;display:flex;align-items:stretch;justify-content:space-between;gap:0;position:sticky;top:0;z-index:50}
        .hdr-left{display:flex;align-items:center;gap:0;border-right:2px solid var(--black);padding-right:28px;margin-right:28px}
        .logo{font-family:var(--display);font-size:42px;font-weight:900;text-transform:uppercase;letter-spacing:-1px;line-height:1;color:var(--black);padding:14px 0}
        .logo span{color:var(--red)}
        .live-pill{display:flex;align-items:center;gap:5px;background:var(--yellow);border:1.5px solid var(--black);border-radius:20px;padding:3px 10px;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.06em;margin-left:14px;white-space:nowrap}
        .live-dot{width:6px;height:6px;background:var(--red);border-radius:50%;animation:pulse 2s infinite}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        .who-wrap{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 0}
        .who-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--midgrey);white-space:nowrap}
        .who-btn{background:none;border:1.5px solid var(--grey);border-radius:4px;padding:4px 11px;font-size:12px;font-family:var(--body);font-weight:500;cursor:pointer;transition:all .12s;color:var(--black);white-space:nowrap}
        .who-btn.on{background:var(--black);color:var(--white);border-color:var(--black)}
        .who-btn:hover:not(.on){border-color:var(--black)}
        .hero{background:var(--red);padding:28px 32px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;border-bottom:2px solid var(--black)}
        .hero-title{font-family:var(--display);font-size:clamp(52px,10vw,100px);font-weight:900;text-transform:uppercase;letter-spacing:-2px;line-height:.9;color:var(--white)}
        .hero-title em{color:var(--yellow);font-style:italic}
        .stats-row{display:flex;gap:2px}
        .stat-box{background:var(--white);border:2px solid var(--black);padding:12px 20px;text-align:center;min-width:80px}
        .stat-box:first-child{border-radius:4px 0 0 4px}
        .stat-box:last-child{border-radius:0 4px 4px 0}
        .stat-n{font-family:var(--display);font-size:34px;font-weight:900;line-height:1;color:var(--red)}
        .stat-l{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--midgrey);margin-top:2px}
        .tabs{display:flex;border-bottom:2px solid var(--black);background:var(--white);padding:0 32px}
        .tbtn{background:none;border:none;border-bottom:3px solid transparent;margin-bottom:-2px;padding:14px 22px 14px 0;font-family:var(--display);font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:.02em;cursor:pointer;color:var(--midgrey);transition:all .12s;margin-right:8px}
        .tbtn.on{color:var(--black);border-bottom-color:var(--red)}
        .tbtn:hover:not(.on){color:var(--black)}
        .content{padding:32px;max-width:1000px}
        .section-header{display:flex;align-items:baseline;gap:12px;margin-bottom:22px;padding-bottom:14px;border-bottom:1.5px solid var(--grey)}
        .section-title{font-family:var(--display);font-size:32px;font-weight:900;text-transform:uppercase;letter-spacing:-.5px}
        .section-count{font-family:var(--display);font-size:18px;font-weight:700;color:var(--midgrey)}
        .blist{display:flex;flex-direction:column;gap:2px}
        .bcard{background:var(--white);border:1.5px solid var(--grey);border-radius:6px;padding:18px 20px;display:flex;gap:16px;align-items:flex-start;transition:border-color .12s,box-shadow .12s}
        .bcard:hover{border-color:var(--black);box-shadow:4px 4px 0 var(--black)}
        .brank{font-family:var(--display);font-size:28px;font-weight:900;color:var(--grey);min-width:36px;line-height:1;padding-top:4px}
        .brank.top{color:var(--yellow);-webkit-text-stroke:1.5px var(--black)}
        .binfo{flex:1;min-width:0}
        .btitle{font-family:var(--display);font-size:22px;font-weight:800;text-transform:uppercase;letter-spacing:-.3px;line-height:1.1}
        .bauthor{font-size:13px;color:var(--midgrey);margin-top:2px;font-style:italic}
        .bgenre{display:inline-block;background:var(--yellow);border:1.5px solid var(--black);border-radius:3px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:2px 8px;margin-top:7px}
        .bratings{display:flex;gap:5px;margin-top:10px;flex-wrap:wrap}
        .mrat{font-size:12px;background:var(--offwhite);border:1px solid var(--grey);border-radius:3px;padding:2px 8px;display:flex;align-items:center;gap:4px}
        .mrat.unrated{opacity:.35}
        .mrat .who2{color:var(--midgrey);font-size:11px}
        .mrat .sc{font-weight:700;color:var(--red)}
        .bright{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex-shrink:0}
        .avgscore{font-family:var(--display);font-size:44px;font-weight:900;line-height:1;color:var(--black)}
        .avglbl{font-size:10px;color:var(--midgrey);text-transform:uppercase;letter-spacing:.08em;text-align:right}
        .addedbylbl{font-size:10px;color:var(--midgrey);margin-top:2px}
        .ratebtn{background:var(--yellow);border:1.5px solid var(--black);border-radius:4px;padding:5px 14px;font-size:12px;font-weight:700;font-family:var(--body);text-transform:uppercase;letter-spacing:.05em;cursor:pointer;transition:all .12s;white-space:nowrap}
        .ratebtn:hover{background:var(--black);color:var(--yellow)}
        .star-row{display:flex;align-items:center;gap:2px;flex-wrap:wrap}
        .star{background:none;border:none;cursor:pointer;color:var(--grey);padding:0;transition:color .1s;line-height:1}
        .star.filled{color:var(--yellow);-webkit-text-stroke:.5px #b89a00}
        .star.readonly{cursor:default}
        .star-label{font-size:15px;font-weight:700;margin-left:7px;color:var(--red);font-family:var(--display)}
        .slist{display:flex;flex-direction:column;gap:2px}
        .scard{background:var(--white);border:1.5px solid var(--grey);border-radius:6px;padding:16px 18px;display:flex;align-items:flex-start;gap:14px;transition:border-color .12s,box-shadow .12s}
        .scard:hover{border-color:var(--black);box-shadow:4px 4px 0 var(--black)}
        .sinfo{flex:1;min-width:0}
        .stitle{font-family:var(--display);font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:-.2px}
        .sauthor{font-size:13px;color:var(--midgrey);font-style:italic;margin-top:1px}
        .smeta{font-size:11px;color:var(--midgrey);margin-top:4px;text-transform:uppercase;letter-spacing:.05em}
        .sreason{font-size:13px;color:var(--black);margin-top:7px;font-style:italic;padding-left:10px;border-left:3px solid var(--yellow)}
        .voters{font-size:11px;color:var(--midgrey);margin-top:5px}
        .vbtn{display:flex;flex-direction:column;align-items:center;gap:1px;background:var(--white);border:1.5px solid var(--grey);border-radius:6px;padding:10px 14px;cursor:pointer;font-family:var(--body);transition:all .12s;min-width:54px;flex-shrink:0}
        .vbtn.on{background:var(--red);border-color:var(--red);color:var(--white)}
        .vbtn:hover:not(.on){border-color:var(--black);box-shadow:3px 3px 0 var(--black)}
        .vcnt{font-family:var(--display);font-size:22px;font-weight:900;line-height:1}
        .vlbl{font-size:9px;text-transform:uppercase;letter-spacing:.07em}
        .ai-intro{font-size:14px;color:var(--midgrey);margin-bottom:20px;line-height:1.6;max-width:560px}
        .aibtn{width:100%;max-width:500px;padding:16px 24px;background:var(--red);color:var(--white);border:2px solid var(--black);border-radius:6px;font-family:var(--display);font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:.02em;cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:4px 4px 0 var(--black)}
        .aibtn:hover{background:var(--black);box-shadow:6px 6px 0 var(--red)}
        .aibtn:disabled{opacity:.6;cursor:not-allowed;box-shadow:none}
        .airec{margin-top:24px;background:var(--black);color:var(--white);border-radius:8px;border:2px solid var(--black);overflow:hidden;max-width:700px}
        .airec-top{background:var(--red);padding:14px 22px;display:flex;align-items:center;justify-content:space-between}
        .aibadge{font-family:var(--display);font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:var(--white)}
        .airec-body{padding:24px 22px}
        .aititle{font-family:var(--display);font-size:clamp(28px,5vw,42px);font-weight:900;text-transform:uppercase;letter-spacing:-1px;line-height:1;color:var(--yellow)}
        .aiauthor{font-size:14px;color:rgba(255,255,255,.6);margin-top:5px;font-style:italic}
        .aifromsugg{display:inline-block;background:var(--yellow);color:var(--black);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;border-radius:3px;padding:2px 8px;margin-left:8px}
        .aiwhy{font-size:14px;line-height:1.7;margin-top:16px;color:rgba(255,255,255,.8)}
        .aimembers{display:flex;flex-direction:column;gap:6px;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.1)}
        .aimem{font-size:12px;color:rgba(255,255,255,.55)}
        .aimem strong{color:var(--yellow);margin-right:5px;font-family:var(--display);font-size:13px;text-transform:uppercase}
        .aiinsight{font-size:12px;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.4);font-style:italic}
        .aimatch{display:inline-block;background:var(--yellow);color:var(--black);font-family:var(--display);font-size:14px;font-weight:900;border-radius:3px;padding:3px 12px}
        .aierr{margin-top:16px;padding:16px;background:var(--offwhite);border:1.5px solid var(--grey);border-radius:6px;color:var(--red);font-size:14px}
        .addbtn{display:flex;align-items:center;gap:8px;background:none;border:1.5px dashed var(--grey);border-radius:6px;padding:13px 18px;width:100%;cursor:pointer;color:var(--midgrey);font-family:var(--body);font-size:14px;font-weight:500;transition:all .12s;margin-top:10px;text-transform:uppercase;letter-spacing:.05em}
        .addbtn:hover{border-color:var(--black);color:var(--black);background:var(--offwhite)}
        .aform{background:var(--offwhite);border:1.5px solid var(--black);border-radius:6px;padding:20px;margin-top:10px;display:flex;flex-direction:column;gap:14px;box-shadow:4px 4px 0 var(--black)}
        .frow{display:flex;gap:12px;flex-wrap:wrap}
        .fgrp{display:flex;flex-direction:column;gap:4px;flex:1;min-width:150px}
        .fgrp label{font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--midgrey)}
        .fgrp input,.fgrp select,.fgrp textarea{padding:9px 12px;border:1.5px solid var(--black);border-radius:4px;background:var(--white);font-family:var(--body);font-size:14px;color:var(--black);outline:none;transition:box-shadow .12s}
        .fgrp textarea{resize:vertical;min-height:70px}
        .fgrp input:focus,.fgrp select:focus,.fgrp textarea:focus{box-shadow:3px 3px 0 var(--black)}
        .factions{display:flex;gap:8px}
        .bprimary{background:var(--black);color:var(--white);border:1.5px solid var(--black);border-radius:4px;padding:10px 20px;font-family:var(--body);font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;transition:all .12s}
        .bprimary:hover{background:var(--red);border-color:var(--red)}
        .bcancel{background:none;border:1.5px solid var(--grey);border-radius:4px;color:var(--midgrey);padding:10px 16px;font-family:var(--body);font-size:13px;cursor:pointer;transition:all .12s}
        .bcancel:hover{border-color:var(--black);color:var(--black)}
        .rlbl{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--midgrey);margin-bottom:8px;font-weight:700}
        .overlay{position:fixed;inset:0;background:rgba(10,10,10,.6);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px}
        .modal{background:var(--white);border-radius:8px;border:2px solid var(--black);padding:28px;max-width:380px;width:100%;box-shadow:8px 8px 0 var(--black)}
        .modal h3{font-family:var(--display);font-size:24px;font-weight:900;text-transform:uppercase;margin-bottom:4px}
        .modal p{font-size:13px;color:var(--midgrey);margin-bottom:16px;font-style:italic}
        .empty{text-align:center;padding:48px 32px;color:var(--midgrey)}
        .empty-title{font-family:var(--display);font-size:28px;font-weight:900;text-transform:uppercase;color:var(--grey)}
        .empty-sub{font-size:14px;margin-top:6px}
        @media(max-width:640px){
          .hdr{flex-direction:column;padding:16px;gap:12px}
          .hdr-left{border-right:none;padding-right:0;border-bottom:1.5px solid var(--black);padding-bottom:12px;margin-right:0}
          .hero{padding:20px 16px}
          .tabs{padding:0 16px}
          .content{padding:20px 16px}
          .bcard{flex-wrap:wrap}
          .bright{flex-direction:row;align-items:center;width:100%}
        }
      `}</style>

      <div className="hdr">
        <div className="hdr-left">
          <div className="logo">BOOKED<span>.</span>IN</div>
          <div className="live-pill"><span className="live-dot"/>{MEMBERS.length} members</div>
        </div>
        <div className="who-wrap">
          <span className="who-label">You are:</span>
          {MEMBERS.map(m => (
            <button key={m} className={`who-btn ${currentUser===m?"on":""}`} onClick={()=>setCurrentUser(m)}>{m}</button>
          ))}
        </div>
      </div>

      <div className="hero">
        <div className="hero-title">
          {tab==="library" && <><em>Our</em> Reading<br/>List</>}
          {tab==="suggestions" && <>What&apos;s<br/><em>Next?</em></>}
          {tab==="recommend" && <>AI<br/><em>Picks</em></>}
        </div>
        <div className="stats-row">
          <div className="stat-box"><div className="stat-n">{books.length}</div><div className="stat-l">Read</div></div>
          <div className="stat-box">
            <div className="stat-n">{books.length?(books.reduce((s,b)=>s+(parseFloat(avgRating(b.ratings))||0),0)/books.length).toFixed(1):"—"}</div>
            <div className="stat-l">Avg Score</div>
          </div>
          <div className="stat-box"><div className="stat-n">{suggestions.length}</div><div className="stat-l">Ideas</div></div>
        </div>
      </div>

      <div className="tabs">
        {[["library","📚 Library"],["suggestions","💡 Suggestions"],["recommend","✨ AI Pick"]].map(([id,lbl])=>(
          <button key={id} className={`tbtn ${tab===id?"on":""}`} onClick={()=>setTab(id)}>{lbl}</button>
        ))}
      </div>

      <div className="content">
        {tab==="library" && (
          <div>
            <div className="section-header">
              <div className="section-title">Books Read</div>
              <div className="section-count">{books.length}</div>
            </div>
            {sortedBooks.length===0 && <div className="empty"><div className="empty-title">No Books Yet</div><div className="empty-sub">Add your first book below</div></div>}
            <div className="blist">
              {sortedBooks.map((book,i)=>(
                <div key={book.id} className="bcard">
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
                    <div className="addedbylbl">Added by {book.added_by}</div>
                  </div>
                  <div className="bright">
                    <div><div className="avgscore">{avgRating(book.ratings)||"—"}</div><div className="avglbl">avg / 10</div></div>
                    {!(book.ratings||{})[currentUser] && (
                      <button className="ratebtn" onClick={()=>{setRateModal(book);setMyRating(7)}}>Rate</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {showAddBook?(
              <div className="aform">
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
            )}
          </div>
        )}

        {tab==="suggestions" && (
          <div>
            <div className="section-header">
              <div className="section-title">Suggestions</div>
              <div className="section-count">{suggestions.length}</div>
            </div>
            {sortedSuggs.length===0 && <div className="empty"><div className="empty-title">No Suggestions Yet</div><div className="empty-sub">Be the first to suggest one</div></div>}
            <div className="slist">
              {sortedSuggs.map(s=>(
                <div key={s.id} className="scard">
                  <div className="sinfo">
                    <div className="stitle">{s.title}</div>
                    <div className="sauthor">{s.author}</div>
                    <div className="smeta">{s.genre} · Suggested by {s.suggested_by}</div>
                    {s.reason && <div className="sreason">{s.reason}</div>}
                    {s.votes?.length>0 && <div className="voters">👍 {s.votes.join(", ")}</div>}
                  </div>
                  <button className={`vbtn ${s.votes?.includes(currentUser)?"on":""}`} onClick={()=>toggleVote(s)}>
                    <span className="vcnt">{s.votes?.length||0}</span>
                    <span className="vlbl">{s.votes?.includes(currentUser)?"✓":"Vote"}</span>
                  </button>
                </div>
              ))}
            </div>
            {showAddSugg?(
              <div className="aform">
                <div className="frow">
                  <div className="fgrp"><label>Title</label><input value={newSugg.title} onChange={e=>setNewSugg(s=>({...s,title:e.target.value}))} placeholder="Book title"/></div>
                  <div className="fgrp"><label>Author</label><input value={newSugg.author} onChange={e=>setNewSugg(s=>({...s,author:e.target.value}))} placeholder="Author name"/></div>
                </div>
                <div className="frow">
                  <div className="fgrp"><label>Genre</label><select value={newSugg.genre} onChange={e=>setNewSugg(s=>({...s,genre:e.target.value}))}>{GENRES.map(g=><option key={g}>{g}</option>)}</select></div>
                </div>
                <div className="fgrp"><label>Why this book? (optional)</label>
                  <textarea value={newSugg.reason} onChange={e=>setNewSugg(s=>({...s,reason:e.target.value}))} placeholder="Tell the group why you think they'd love it…"/>
                </div>
                <div className="factions">
                  <button className="bprimary" onClick={addSuggestion}>Submit</button>
                  <button className="bcancel" onClick={()=>setShowAddSugg(false)}>Cancel</button>
                </div>
              </div>
            ):(
              <button className="addbtn" onClick={()=>setShowAddSugg(true)}>＋ Suggest our next book</button>
            )}
          </div>
        )}

        {tab==="recommend" && (
          <div>
            <div className="section-header"><div className="section-title">AI Pick</div></div>
            <p className="ai-intro">Claude analyses everyone's ratings, suggestions, and collective taste — then picks the perfect next read for all {MEMBERS.length} of you.</p>
            <button className="aibtn" onClick={getAIRec} disabled={aiLoading}>
              {aiLoading?"✦ Analysing your taste…":"✦ Recommend our next book"}
            </button>
            {aiRec && !aiRec.error && (
              <div className="airec">
                <div className="airec-top">
                  <div className="aibadge">✦ Your next read</div>
                  {aiRec.matchScore && <div className="aimatch">{aiRec.matchScore}% match</div>}
                </div>
                <div className="airec-body">
                  <div className="aititle">{aiRec.title}</div>
                  <div className="aiauthor">by {aiRec.author} · {aiRec.genre}
                    {aiRec.fromSuggestions && <span className="aifromsugg">from your list</span>}
                  </div>
                  <div className="aiwhy">{aiRec.whyThisBook}</div>
                  {aiRec.memberFit && (
                    <div className="aimembers">
                      {Object.entries(aiRec.memberFit).map(([m,why])=>(
                        <div key={m} className="aimem"><strong>{m}</strong>{why}</div>
                      ))}
                    </div>
                  )}
                  {aiRec.groupTasteInsight && <div className="aiinsight">"{aiRec.groupTasteInsight}"</div>}
                </div>
              </div>
            )}
            {aiRec?.error && <div className="aierr">Couldn't get a recommendation right now — try again in a moment.</div>}
          </div>
        )}
      </div>

      {rateModal && (
        <div className="overlay" onClick={()=>setRateModal(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h3>{rateModal.title}</h3>
            <p>by {rateModal.author} · rating as {currentUser}</p>
            <div className="rlbl">Your Score Out of 10</div>
            <StarRating value={myRating} onChange={setMyRating}/>
            <div className="factions" style={{marginTop:20}}>
              <button className="bprimary" onClick={()=>rateBook(rateModal.id)}>Save Rating</button>
              <button className="bcancel" onClick={()=>setRateModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
