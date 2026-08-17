"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpLeft, Bot, CheckCircle2, Clock3, Copy, Inbox, MessageCircle, MoreHorizontal, Send, Sparkles, Ticket, TrendingUp, Users, WifiOff, Zap } from "lucide-react";

interface Overview { contacts:number; conversations:{total:number;open:number}; messages:{inbound:number;outbound:number;aiSent:number}; ai:{handoffs:number;openHandoffs:number;deflectionRate:number|null}; tickets:{open:number;total:number}; campaignsSent:number }
interface ConversationRow { conversation: { _id:string; status:string; priority?:string; lastMessageAt?:string; lastInboundAt?:string; unreadCount?:number }; contact: { displayName?:string; firstName?:string; phone?:string } | null }
interface WaStatus { connected:boolean; displayPhoneNumber:string|null; verifiedName:string|null; webhookConfigured:boolean; qualityRating:string|null; health:{lastInboundAt:string|null;recentWebhookIssues:unknown[]} }

const n = (value:number|undefined) => value == null ? "—" : value.toLocaleString("he-IL");
const time = (value?:string) => value ? new Date(value).toLocaleTimeString("he-IL",{hour:"2-digit",minute:"2-digit"}) : "—";

export default function DashboardPage() {
  const [data,setData]=useState<Overview|null>(null);
  const [conversations,setConversations]=useState<ConversationRow[]>([]);
  const [wa,setWa]=useState<WaStatus|null>(null);
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const [webhook,setWebhook]=useState("/api/whatsapp/webhook");

  useEffect(()=>{ setWebhook(window.location.origin+"/api/whatsapp/webhook"); },[]);
  useEffect(()=>{ Promise.allSettled([
    fetch("/api/analytics",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(r)),
    fetch("/api/inbox/conversations?limit=5",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(r)),
    fetch("/api/whatsapp/account",{cache:"no-store"}).then(r=>r.ok?r.json():Promise.reject(r)),
  ]).then(([a,c,w])=>{ if(a.status==="fulfilled")setData(a.value);else setError("לא הצלחנו לטעון את כל מדדי המערכת"); if(c.status==="fulfilled")setConversations(c.value.items??[]); if(w.status==="fulfilled")setWa(w.value); }); },[]);

  const deflection=data?.ai.deflectionRate==null?"—":`${Math.round(data.ai.deflectionRate*100)}%`;
  const totalMessages=(data?.messages.inbound??0)+(data?.messages.outbound??0);
  const aiShare=totalMessages?Math.round(((data?.messages.aiSent??0)/totalMessages)*100):0;
  const date=useMemo(()=>new Intl.DateTimeFormat("he-IL",{weekday:"long",day:"numeric",month:"long"}).format(new Date()),[]);
  const copy=async()=>{await navigator.clipboard.writeText(webhook);setCopied(true);setTimeout(()=>setCopied(false),1800)};

  return <div className="ops-dashboard">
    <header className="ops-heading"><div><small>{date}</small><h1>מרכז השליטה</h1><p>מה קורה בעסק, עכשיו.</p></div><div className={`ops-live ${wa?.connected!==false?"online":"offline"}`}><i />{wa?.connected!==false?"המערכת פעילה":"נדרש חיבור"}</div></header>
    {error&&<div className="ops-error">{error}</div>}

    <section className="ops-pulse">
      <div className="ops-pulse-copy"><span className="ops-kicker"><Sparkles/> AI PERFORMANCE</span><h2>{deflection}</h2><p>מהשיחות נסגרו אוטומטית<br/>ללא התערבות אנושית.</p><Link href="/dashboard/ai-optimization">לניתוח ביצועי הסוכן <ArrowLeft/></Link></div>
      <div className="ops-rings" style={{"--score":`${data?.ai.deflectionRate==null?64:Math.round(data.ai.deflectionRate*100)*3.6}deg`} as React.CSSProperties}><div><Bot/><b>{n(data?.messages.aiSent)}</b><small>תגובות AI</small></div></div>
      <div className="ops-pulse-stats"><span><small>הסלמות פתוחות</small><b>{n(data?.ai.openHandoffs)}</b><i className={(data?.ai.openHandoffs??0)>0?"warn":""}/></span><span><small>חלק ה-AI בתעבורה</small><b>{aiShare}%</b><i/></span><span><small>שיחות פתוחות</small><b>{n(data?.conversations.open)}</b><i/></span></div>
    </section>

    <section className="ops-metrics">
      <Metric icon={<MessageCircle/>} label="הודעות היום" value={n(totalMessages)} detail={`${n(data?.messages.inbound)} נכנסות`} trend="LIVE" />
      <Metric icon={<Users/>} label="אנשי קשר" value={n(data?.contacts)} detail="במאגר הפעיל" />
      <Metric icon={<Ticket/>} label="טיקטים פתוחים" value={n(data?.tickets.open)} detail={`מתוך ${n(data?.tickets.total)}`} />
      <Metric icon={<Send/>} label="נשלחו בקמפיינים" value={n(data?.campaignsSent)} detail="בכל התקופה" />
    </section>

    <section className="ops-grid">
      <div className="ops-panel ops-conversations"><PanelHead eyebrow="INBOX" title="שיחות אחרונות" href="/dashboard/inbox" />
        <div className="ops-conversation-list">{conversations.length?conversations.map((row,index)=>{const name=row.contact?.displayName||row.contact?.firstName||row.contact?.phone||"לקוח ללא שם";return <Link href={`/dashboard/inbox?conversation=${row.conversation._id}`} key={row.conversation._id}><span className="ops-avatar">{name.charAt(0)}<i className={index<2?"online":""}/></span><span className="ops-person"><b>{name}</b><small>{row.conversation.priority==="urgent"?"שיחה דחופה":"ממתין לטיפול"}</small></span>{(row.conversation.unreadCount??0)>0&&<em>{row.conversation.unreadCount}</em>}<time>{time(row.conversation.lastMessageAt||row.conversation.lastInboundAt)}</time></Link>}) : <EmptyInbox/>}</div>
      </div>
      <div className="ops-panel ops-health"><PanelHead eyebrow="CHANNEL HEALTH" title="WhatsApp הרשמי" href="/dashboard/whatsapp" />
        <div className="ops-health-main"><div className={wa?.connected!==false?"connected":"disconnected"}>{wa?.connected!==false?<CheckCircle2/>:<WifiOff/>}</div><span><b>{wa?.verifiedName||"bootWhat Business"}</b><small>{wa?.displayPhoneNumber||"המספר המוגדר במערכת"}</small></span></div>
        <div className="ops-health-rows"><span><small>חיבור API</small><b className={wa?.connected!==false?"good":"bad"}>{wa?.connected!==false?"מחובר":"מנותק"}</b></span><span><small>Webhook</small><b className={wa?.webhookConfigured!==false?"good":"bad"}>{wa?.webhookConfigured!==false?"תקין":"לא מוגדר"}</b></span><span><small>איכות מספר</small><b>{wa?.qualityRating||"—"}</b></span></div>
        <div className="ops-webhook"><span><small>WEBHOOK ENDPOINT</small><code>{webhook}</code></span><button onClick={copy}>{copied?<CheckCircle2/>:<Copy/>}</button></div>
      </div>
    </section>

    <section className="ops-quick"><div><small>QUICK START</small><h2>מה תרצו לעשות עכשיו?</h2></div><div><Quick href="/dashboard/inbox" icon={<Inbox/>} title="לטפל בשיחות"/><Quick href="/dashboard/flows" icon={<Zap/>} title="לבנות תהליך"/><Quick href="/dashboard/broadcasts" icon={<Send/>} title="ליצור קמפיין"/><Quick href="/dashboard/knowledge" icon={<Bot/>} title="ללמד את הסוכן"/></div></section>
  </div>;
}

function Metric({icon,label,value,detail,trend}:{icon:React.ReactNode;label:string;value:string;detail:string;trend?:string}){return <article className="ops-metric"><span>{icon}</span><div><small>{label}</small><b>{value}</b><p>{detail}</p></div>{trend&&<em><TrendingUp/>{trend}</em>}</article>}
function PanelHead({eyebrow,title,href}:{eyebrow:string;title:string;href:string}){return <header className="ops-panel-head"><div><small>{eyebrow}</small><h2>{title}</h2></div><Link href={href}>הצג הכל <ArrowLeft/></Link></header>}
function Quick({href,icon,title}:{href:string;icon:React.ReactNode;title:string}){return <Link href={href}>{icon}<span>{title}</span><ArrowUpLeft/></Link>}
function EmptyInbox(){return <div className="ops-empty-inbox"><Clock3/><b>אין שיחות שממתינות כרגע</b><small>שיחות חדשות יופיעו כאן בזמן אמת</small></div>}
