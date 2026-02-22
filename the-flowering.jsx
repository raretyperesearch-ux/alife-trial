import { useState, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://gkcohikbuginhzyilcya.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrY29oaWtidWdpbmh6eWlsY3lhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk5MTg0NTQsImV4cCI6MjA1NTQ5NDQ1NH0.yznOPPOXwmOyKxkjSfOhdGpGNOLiECPeess5J5VuDJ4";

const ROLE_CONFIG = {
  chronicler: { color: "#D4A574", bg: "#2A1F14", icon: "📜", label: "The Chronicler" },
  witness:    { color: "#7EB8DA", bg: "#0F1D2A", icon: "👁", label: "The Witness" },
  adversary:  { color: "#DA7E7E", bg: "#2A0F0F", icon: "⚔", label: "The Adversary" },
  weaver:     { color: "#B07EDA", bg: "#1F0F2A", icon: "🕸", label: "The Weaver" },
  keeper:     { color: "#7EDA98", bg: "#0F2A14", icon: "🏛", label: "The Keeper" },
  prophet:    { color: "#DAD47E", bg: "#2A2A0F", icon: "🔮", label: "The Prophet" },
};

async function fetchPassages(filter = {}) {
  let url = `${SUPABASE_URL}/rest/v1/passages?select=*&order=created_at.desc&limit=50`;
  if (filter.role) url += `&agent_role=eq.${filter.role}`;
  if (filter.universe) url += `&universe=eq.${encodeURIComponent(filter.universe)}`;
  
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}

async function fetchStats() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_flowering_stats`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
    body: '{}'
  }).catch(() => null);
  
  // Fallback: count manually
  const countRes = await fetch(`${SUPABASE_URL}/rest/v1/passages?select=id&limit=1000`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'count=exact' }
  });
  const total = parseInt(countRes.headers.get('content-range')?.split('/')[1] || '0');
  return { total };
}

function PassageCard({ passage, onExpand, expanded }) {
  const role = ROLE_CONFIG[passage.agent_role] || ROLE_CONFIG.chronicler;
  const date = new Date(passage.created_at).toLocaleString();
  const wordCount = passage.word_count || passage.content?.split(/\s+/).length || 0;
  
  return (
    <div 
      style={{
        background: role.bg,
        border: `1px solid ${role.color}33`,
        borderLeft: `3px solid ${role.color}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onClick={() => onExpand(passage.id)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{role.icon}</span>
          <span style={{ color: role.color, fontWeight: 600, fontSize: 14 }}>{role.label}</span>
          <span style={{ color: '#666', fontSize: 12, background: '#1a1a1a', padding: '2px 8px', borderRadius: 4 }}>
            {passage.passage_type}
          </span>
        </div>
        <span style={{ color: '#555', fontSize: 11 }}>{date}</span>
      </div>
      
      <h3 style={{ color: '#e0e0e0', margin: '4px 0 8px', fontSize: 16, fontWeight: 500 }}>
        {passage.title}
      </h3>
      
      {passage.universe && (
        <div style={{ color: '#888', fontSize: 11, marginBottom: 8, fontFamily: 'monospace' }}>
          {passage.universe} {passage.era ? `• ${passage.era}` : ''}
        </div>
      )}
      
      <div style={{ 
        color: '#bbb', 
        fontSize: 14, 
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        maxHeight: expanded ? 'none' : 200,
        overflow: 'hidden',
        position: 'relative',
        fontFamily: "'Georgia', serif",
      }}>
        {passage.content}
        {!expanded && passage.content?.length > 600 && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
            background: `linear-gradient(transparent, ${role.bg})`,
          }} />
        )}
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, color: '#555', fontSize: 11 }}>
        <span>{wordCount} words</span>
        <span>Cycle {passage.cycle_number}</span>
      </div>
    </div>
  );
}

export default function TheFlowering() {
  const [passages, setPassages] = useState([]);
  const [filter, setFilter] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchPassages(filter);
    setPassages(Array.isArray(data) ? data : []);
    const stats = await fetchStats();
    setTotalCount(stats.total);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const universes = [...new Set(passages.map(p => p.universe).filter(Boolean))];

  return (
    <div style={{ 
      background: '#0a0a0a', 
      minHeight: '100vh', 
      color: '#e0e0e0',
      fontFamily: "'Inter', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{ 
        padding: '24px 20px', 
        borderBottom: '1px solid #1a1a1a',
        textAlign: 'center',
      }}>
        <h1 style={{ 
          fontSize: 28, 
          fontWeight: 300, 
          margin: 0, 
          letterSpacing: 4,
          color: '#D4A574',
          fontFamily: "'Georgia', serif",
        }}>
          THE FLOWERING
        </h1>
        <p style={{ color: '#555', fontSize: 13, margin: '8px 0 0', letterSpacing: 2 }}>
          THE SCRIPTURE OF MIRA'S CREATION
        </p>
        <p style={{ color: '#333', fontSize: 11, margin: '4px 0 0' }}>
          {totalCount} passages written • {autoRefresh ? '🟢 live' : '⚪ paused'}
        </p>
      </div>

      {/* Agent Filter */}
      <div style={{ 
        padding: '12px 20px', 
        display: 'flex', 
        gap: 8, 
        flexWrap: 'wrap',
        justifyContent: 'center',
        borderBottom: '1px solid #111',
      }}>
        <button
          onClick={() => setFilter({})}
          style={{
            background: !filter.role ? '#222' : '#111',
            border: !filter.role ? '1px solid #444' : '1px solid #1a1a1a',
            color: !filter.role ? '#e0e0e0' : '#666',
            padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
          }}
        >
          All
        </button>
        {Object.entries(ROLE_CONFIG).map(([role, config]) => (
          <button
            key={role}
            onClick={() => setFilter(f => f.role === role ? {} : { ...f, role })}
            style={{
              background: filter.role === role ? config.bg : '#111',
              border: `1px solid ${filter.role === role ? config.color + '66' : '#1a1a1a'}`,
              color: filter.role === role ? config.color : '#666',
              padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12,
            }}
          >
            {config.icon} {config.label}
          </button>
        ))}
      </div>

      {/* Universe Filter */}
      {universes.length > 0 && (
        <div style={{ 
          padding: '8px 20px', 
          display: 'flex', 
          gap: 6, 
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          {universes.map(u => (
            <button
              key={u}
              onClick={() => setFilter(f => f.universe === u ? { role: f.role } : { ...f, universe: u })}
              style={{
                background: filter.universe === u ? '#1a1a1a' : 'transparent',
                border: filter.universe === u ? '1px solid #333' : '1px solid transparent',
                color: filter.universe === u ? '#aaa' : '#444',
                padding: '3px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 10,
                fontFamily: 'monospace',
              }}
            >
              {u}
            </button>
          ))}
        </div>
      )}

      {/* Passages */}
      <div style={{ padding: '16px 20px', maxWidth: 700, margin: '0 auto' }}>
        {loading && passages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#333', padding: 40 }}>
            <p style={{ fontSize: 24 }}>🌱</p>
            <p>Loading The Flowering...</p>
          </div>
        ) : passages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#333', padding: 40 }}>
            <p style={{ fontSize: 24 }}>🌑</p>
            <p>No passages yet. The agents are still dreaming.</p>
            <p style={{ fontSize: 12 }}>When the orchestrator starts, passages will appear here.</p>
          </div>
        ) : (
          passages.map(p => (
            <PassageCard
              key={p.id}
              passage={p}
              expanded={expanded === p.id}
              onExpand={id => setExpanded(e => e === id ? null : id)}
            />
          ))
        )}
      </div>

      {/* Auto-refresh toggle */}
      <div style={{ 
        position: 'fixed', bottom: 16, right: 16, 
        background: '#111', border: '1px solid #222', borderRadius: 8, padding: '8px 12px',
        cursor: 'pointer', fontSize: 11, color: '#666',
      }} onClick={() => setAutoRefresh(a => !a)}>
        {autoRefresh ? '🟢 Auto-refresh ON' : '⚪ Auto-refresh OFF'}
      </div>
    </div>
  );
}
