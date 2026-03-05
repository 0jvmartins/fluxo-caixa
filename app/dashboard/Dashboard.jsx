'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// ── helpers ──────────────────────────────────────────────────────────
const fmt = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0)
const fmtCompact = v => {
  const a=Math.abs(v), s=v<0?'-':''
  if(a>=1e6) return s+'R$'+(a/1e6).toFixed(1)+'M'
  if(a>=1e3) return s+'R$'+(a/1e3).toFixed(1)+'k'
  return fmt(v)
}
const hojeStr = () => {
  const d=new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const fmtDataBR = s => {
  if(!s) return ''
  const [y,m,d]=s.split('-')
  const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  return `${dias[new Date(+y,+m-1,+d).getDay()]} ${d}/${m}/${y}`
}
const EMPTY_FORM = { data:hojeStr(), cliente:'', descricao:'', tipo:'entrada', valor:'' }

// ── projeção ──────────────────────────────────────────────────────────
function calcProjecao(transacoes, saldoInicial) {
  const by={}
  transacoes.forEach(t=>{ if(!by[t.data]) by[t.data]=[]; by[t.data].push(t) })
  const datas=Object.keys(by).sort()
  let saldo=parseFloat(saldoInicial)||0
  return datas.map(date=>{
    const items=by[date]
    const ent=items.filter(t=>t.tipo==='entrada').reduce((s,t)=>s+t.valor,0)
    const sai=items.filter(t=>t.tipo==='saida'  ).reduce((s,t)=>s+t.valor,0)
    const resultado=ent-sai; saldo+=resultado
    return {date,items,resultado,ent,sai,saldoAcum:saldo}
  })
}

// ── main component ────────────────────────────────────────────────────
export default function Dashboard({ user }) {
  const router     = useRouter()
  const supabase   = createClient()

  const [transacoes,  setTransacoes]  = useState([])
  const [saldoInicial,setSaldoInicial]= useState(0)
  const [loading,     setLoading]     = useState(true)
  const [aba,         setAba]         = useState('projecao')
  const [filtroMes,   setFiltroMes]   = useState(hojeStr().slice(0,7))
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [tipo,        setTipoForm]    = useState('entrada')
  const [editId,      setEditId]      = useState(null)
  const [erro,        setErro]        = useState('')
  const [saving,      setSaving]      = useState(false)
  const [deleteId,    setDeleteId]    = useState(null)
  const [editSaldo,   setEditSaldo]   = useState(false)
  const [saldoTemp,   setSaldoTemp]   = useState('')
  const [diasAbertos, setDiasAbertos] = useState({})

  // ── fetch ────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [{ data: tx }, { data: cfg }] = await Promise.all([
      supabase.from('transacoes').select('*').eq('user_id', user.id).order('data'),
      supabase.from('configuracoes').select('saldo_inicial').eq('user_id', user.id).maybeSingle(),
    ])
    setTransacoes(tx || [])
    setSaldoInicial(parseFloat(cfg?.saldo_inicial) || 0)
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    fetchAll()
    const ch = supabase.channel('realtime-tx')
      .on('postgres_changes',{event:'*',schema:'public',table:'transacoes',filter:`user_id=eq.${user.id}`},fetchAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'configuracoes',filter:`user_id=eq.${user.id}`},fetchAll)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [fetchAll])

  // ── logout ───────────────────────────────────────────────────────
  const logout = async () => {
    await supabase.auth.signOut()
    router.push('/login'); router.refresh()
  }

  // ── saldo inicial ─────────────────────────────────────────────────
  const salvarSaldo = async () => {
    const v = parseFloat(saldoTemp.replace(',','.')) || 0
    await supabase.from('configuracoes').upsert({ user_id:user.id, saldo_inicial:v }, { onConflict:'user_id' })
    setSaldoInicial(v); setEditSaldo(false)
  }

  // ── CRUD ──────────────────────────────────────────────────────────
  const salvarTransacao = async () => {
    setErro('')
    const valor = parseFloat(String(form.valor).replace(',','.'))
    if (!form.data) return setErro('Informe a data.')
    if (!form.descricao.trim()) return setErro('Informe a descrição.')
    if (!valor || valor <= 0) return setErro('Informe um valor válido maior que zero.')
    setSaving(true)
    try {
      const payload = { data:form.data, cliente:form.cliente||'', descricao:form.descricao.trim(), tipo, valor, user_id:user.id }
      if (editId) {
        const { error } = await supabase.from('transacoes').update(payload).eq('id',editId).eq('user_id',user.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('transacoes').insert(payload)
        if (error) throw error
      }
      setForm(EMPTY_FORM); setTipoForm('entrada'); setEditId(null); setAba('projecao')
    } catch(e) { setErro('Erro ao salvar: '+e.message) }
    finally { setSaving(false) }
  }

  const excluir = async () => {
    if (!deleteId) return
    await supabase.from('transacoes').delete().eq('id',deleteId).eq('user_id',user.id)
    setDeleteId(null)
  }

  const iniciarEdicao = t => {
    setForm({ data:t.data, cliente:t.cliente||'', descricao:t.descricao, tipo:t.tipo, valor:String(t.valor) })
    setTipoForm(t.tipo); setEditId(t.id); setErro(''); setAba('novo')
  }

  const cancelarEdicao = () => { setEditId(null); setForm(EMPTY_FORM); setTipoForm('entrada'); setErro('') }

  // ── cálculos ──────────────────────────────────────────────────────
  const projecao = useMemo(() => calcProjecao(transacoes, saldoInicial), [transacoes, saldoInicial])
  const projecaoMes = useMemo(() => projecao.filter(d=>d.date.startsWith(filtroMes)), [projecao, filtroMes])
  const txMes       = useMemo(() => transacoes.filter(t=>t.data.startsWith(filtroMes)), [transacoes, filtroMes])
  const totalEnt    = useMemo(() => txMes.filter(t=>t.tipo==='entrada').reduce((s,t)=>s+t.valor,0), [txMes])
  const totalSai    = useMemo(() => txMes.filter(t=>t.tipo==='saida'  ).reduce((s,t)=>s+t.valor,0), [txMes])
  const saldoFimMes = projecaoMes.length > 0 ? projecaoMes[projecaoMes.length-1].saldoAcum : saldoInicial
  const resultado   = totalEnt - totalSai

  // ── toggle dia ────────────────────────────────────────────────────
  const toggleDia = date => setDiasAbertos(p=>({...p,[date]:!p[date]}))
  const isDiaAberto = date => diasAbertos[date] !== false // default open

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" style={{width:32,height:32}} />
      <span>Carregando fluxo de caixa...</span>
    </div>
  )

  const mesNome = new Date(filtroMes+'-01').toLocaleString('pt-BR',{month:'long',year:'numeric'})

  return (
    <>
      <style>{`
        .app-wrap { display:flex; flex-direction:column; min-height:100vh; }

        /* HEADER */
        .app-header {
          position:sticky; top:0; z-index:100;
          background:rgba(15,17,23,.95); backdrop-filter:blur(10px);
          border-bottom:1px solid #22263a; padding:0 20px;
          display:flex; align-items:center; justify-content:space-between; height:60px;
        }
        .header-brand { display:flex; align-items:center; gap:10px; }
        .header-brand h1 { font-size:18px; font-weight:700; letter-spacing:-.02em; }
        .header-tabs { display:none; gap:4px; }
        .header-right { display:flex; align-items:center; gap:10px; }
        .user-email { font-size:12px; color:#6b7280; display:none; }

        /* STATS BAR */
        .stats-bar {
          background:#161923; border-bottom:1px solid #22263a;
          padding:10px 20px; display:flex; gap:8px; overflow-x:auto; align-items:center;
        }
        .stat-item { flex:1; min-width:120px; background:#1a1d27; border-radius:10px; padding:10px 14px; }
        .stat-label { font-size:10px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
        .stat-val { font-family:'DM Mono',monospace; font-weight:700; font-size:15px; }
        .stat-val-lg { font-size:17px; }

        /* TABS (mobile bottom) */
        .mobile-nav {
          position:fixed; bottom:0; left:0; right:0; z-index:100;
          background:#161923; border-top:1px solid #22263a;
          display:flex; padding:8px 8px 12px;
          padding-bottom:max(12px, env(safe-area-inset-bottom));
        }
        .mobile-nav-btn {
          flex:1; display:flex; flex-direction:column; align-items:center; gap:3px;
          border:none; background:none; cursor:pointer; padding:6px 4px; border-radius:8px;
          font-family:'DM Sans',sans-serif; font-size:10px; font-weight:600; color:#6b7280;
          transition:all .15s;
        }
        .mobile-nav-btn .nav-icon { font-size:20px; }
        .mobile-nav-btn.nav-active { color:#818cf8; }
        .mobile-nav-btn.nav-active .nav-dot {
          width:4px; height:4px; border-radius:50%; background:#818cf8; margin-top:2px;
        }

        /* MAIN */
        .main-content { flex:1; padding:16px; max-width:900px; margin:0 auto; width:100%; padding-bottom:90px; }

        /* FILTRO */
        .filtro-bar { display:flex; gap:10px; align-items:flex-end; margin-bottom:14px; }
        .filtro-bar .input { max-width:180px; }

        /* DIA CARD */
        .dia-card { border-radius:12px; border:1px solid #22263a; overflow:hidden; margin-bottom:10px; transition:border-color .15s; }
        .dia-card.hoje { border-color:#5b6af0; }
        .dia-header { padding:12px 16px; background:#1a1d27; display:flex; align-items:center; justify-content:space-between; cursor:pointer; user-select:none; gap:8px; }
        .dia-header:hover { background:#1e2132; }
        .dia-body { background:#13161f; padding:6px 12px 8px; }
        .dia-date { font-family:'DM Mono',monospace; font-weight:700; }
        .dia-badge { font-size:10px; background:#1e2156; color:#818cf8; padding:2px 8px; border-radius:10px; font-weight:700; margin-left:6px; }
        .dia-nums { display:flex; gap:16px; align-items:center; }
        .dia-num-group { text-align:right; }
        .dia-num-label { font-size:9px; color:#6b7280; margin-bottom:1px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
        .dia-chevron { color:#6b7280; font-size:18px; font-style:normal; transition:transform .2s; }
        .dia-chevron.open { transform:rotate(90deg); }

        /* TX ITEM */
        .tx-item { display:flex; align-items:flex-start; gap:10px; padding:8px 0; border-bottom:1px solid #1e2132; }
        .tx-item:last-child { border-bottom:none; }
        .tx-info { flex:1; min-width:0; }
        .tx-desc { font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tx-meta { font-size:11px; color:#6b7280; margin-top:2px; }
        .tx-right { text-align:right; flex-shrink:0; }
        .tx-valor { font-family:'DM Mono',monospace; font-weight:700; font-size:13px; }
        .tx-actions { display:flex; gap:2px; justify-content:flex-end; margin-top:2px; }

        /* LIST ITEM */
        .list-item { background:#1a1d27; border-radius:10px; padding:12px 14px; margin-bottom:8px; display:flex; align-items:flex-start; gap:10px; }
        .list-info { flex:1; min-width:0; }
        .list-desc { font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .list-meta { font-size:12px; color:#6b7280; margin-top:3px; display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

        @media(min-width:700px){
          .header-tabs { display:flex !important; }
          .user-email { display:block !important; }
          .mobile-nav { display:none !important; }
          .main-content { padding:24px; padding-bottom:24px; }
          .stat-val { font-size:16px; }
        }

        @media(max-width:480px){
          .stats-bar { gap:6px; padding:8px 12px; }
          .stat-item { min-width:100px; padding:8px 10px; }
          .stat-val { font-size:13px; }
          .dia-header { flex-wrap:wrap; }
        }
      `}</style>

      <div className="app-wrap">
        {/* ── HEADER ── */}
        <header className="app-header">
          <div className="header-brand">
            <span style={{fontSize:'22px'}}>💰</span>
            <h1>Fluxo de Caixa</h1>
          </div>

          {/* tabs desktop */}
          <div className="header-tabs">
            {[['projecao','📊 Projeção'],['lancamentos','📋 Lançamentos'],['novo','➕ Novo']].map(([id,label])=>(
              <button key={id}
                className={`btn btn-sm ${aba===id ? 'btn-primary' : 'btn-ghost'}`}
                onClick={()=>{ setAba(id); if(id!=='novo') cancelarEdicao() }}
              >{label}</button>
            ))}
          </div>

          <div className="header-right">
            <span className="user-email">{user.email}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sair</button>
          </div>
        </header>

        {/* ── STATS BAR ── */}
        <div className="stats-bar">
          {/* Saldo inicial */}
          <div className="stat-item" style={{minWidth:140}}>
            <div className="stat-label">Saldo Inicial</div>
            {editSaldo ? (
              <div style={{display:'flex',gap:6,alignItems:'center',marginTop:4}}>
                <input className="input" type="number" value={saldoTemp}
                  onChange={e=>setSaldoTemp(e.target.value)} autoFocus
                  style={{padding:'4px 8px',fontSize:'13px',height:'30px'}}
                  onKeyDown={e=>e.key==='Enter'&&salvarSaldo()}
                />
                <button className="btn btn-green btn-sm" onClick={salvarSaldo}>✓</button>
                <button className="btn-icon" onClick={()=>setEditSaldo(false)}>✕</button>
              </div>
            ) : (
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                <span className={`stat-val ${saldoInicial>=0?'positive':'negative'}`}>{fmtCompact(saldoInicial)}</span>
                <button className="btn-icon" style={{fontSize:'12px'}} onClick={()=>{setSaldoTemp(String(saldoInicial));setEditSaldo(true)}}>✏️</button>
              </div>
            )}
          </div>

          <div className="stat-item">
            <div className="stat-label">Entradas</div>
            <span className="stat-val positive">{fmtCompact(totalEnt)}</span>
          </div>
          <div className="stat-item">
            <div className="stat-label">Saídas</div>
            <span className="stat-val negative">{fmtCompact(totalSai)}</span>
          </div>
          <div className="stat-item">
            <div className="stat-label">Resultado</div>
            <span className={`stat-val ${resultado>=0?'positive':'negative'}`}>{fmtCompact(resultado)}</span>
          </div>
          <div className="stat-item" style={{minWidth:140,background:'#1e2156'}}>
            <div className="stat-label" style={{color:'#818cf8'}}>Saldo Projetado</div>
            <span className={`stat-val stat-val-lg ${saldoFimMes>=0?'positive':'negative'}`}>{fmtCompact(saldoFimMes)}</span>
          </div>
        </div>

        {/* ── MAIN ── */}
        <main className="main-content">

          {/* Filtro de mês */}
          {(aba==='projecao'||aba==='lancamentos') && (
            <div className="filtro-bar">
              <div style={{flex:1,maxWidth:200}}>
                <label className="field-label">Período visualizado</label>
                <input className="input" type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} />
              </div>
              <span style={{color:'#6b7280',fontSize:'13px',paddingBottom:'2px',textTransform:'capitalize'}}>{mesNome}</span>
            </div>
          )}

          {/* ── ABA PROJEÇÃO ── */}
          {aba==='projecao' && (
            projecaoMes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <p style={{fontWeight:600,marginBottom:6}}>Nenhum lançamento em {mesNome}</p>
                <p style={{fontSize:13}}>Use o botão <strong style={{color:'#818cf8'}}>➕ Novo</strong> para começar.</p>
              </div>
            ) : (
              projecaoMes.map(dia => {
                const isHoje = dia.date === hojeStr()
                const open   = isDiaAberto(dia.date)
                return (
                  <div key={dia.date} className={`dia-card ${isHoje?'hoje':''}`}>
                    <div className="dia-header" onClick={()=>toggleDia(dia.date)}>
                      <div style={{display:'flex',alignItems:'center',gap:6,minWidth:0}}>
                        <span className="dia-date" style={{color:isHoje?'#818cf8':dia.date<hojeStr()?'#6b7280':'#e8eaf0'}}>
                          {fmtDataBR(dia.date)}
                        </span>
                        {isHoje && <span className="dia-badge">HOJE</span>}
                        <div style={{display:'flex',gap:5,marginLeft:4,flexWrap:'wrap'}}>
                          {dia.ent>0 && <span className="tag tag-entrada">+{fmtCompact(dia.ent)}</span>}
                          {dia.sai>0 && <span className="tag tag-saida">-{fmtCompact(dia.sai)}</span>}
                        </div>
                      </div>
                      <div style={{display:'flex',gap:12,alignItems:'center',flexShrink:0}}>
                        <div className="dia-num-group">
                          <div className="dia-num-label">Dia</div>
                          <span className={`mono ${dia.resultado>=0?'positive':'negative'}`} style={{fontWeight:700,fontSize:13}}>
                            {dia.resultado>=0?'+':''}{fmt(dia.resultado)}
                          </span>
                        </div>
                        <div className="dia-num-group">
                          <div className="dia-num-label">Saldo Acum.</div>
                          <span className={`mono ${dia.saldoAcum>=0?'positive':'negative'}`} style={{fontWeight:700,fontSize:15}}>
                            {fmt(dia.saldoAcum)}
                          </span>
                        </div>
                        <em className={`dia-chevron ${open?'open':''}`}>›</em>
                      </div>
                    </div>
                    {open && (
                      <div className="dia-body">
                        {dia.items.map(t=>(
                          <div key={t.id} className="tx-item">
                            <span style={{marginTop:2}}>{t.tipo==='entrada'?'💚':'🔴'}</span>
                            <div className="tx-info">
                              <div className="tx-desc">{t.descricao}</div>
                              {t.cliente && <div className="tx-meta">👤 {t.cliente}</div>}
                            </div>
                            <div className="tx-right">
                              <div className={`tx-valor ${t.tipo==='entrada'?'positive':'negative'}`}>
                                {t.tipo==='entrada'?'+':'-'}{fmt(t.valor)}
                              </div>
                              <div className="tx-actions">
                                <button className="btn-icon" onClick={()=>iniciarEdicao(t)} title="Editar">✏️</button>
                                <button className="btn-icon" onClick={()=>setDeleteId(t.id)} title="Excluir">🗑️</button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )
          )}

          {/* ── ABA LANÇAMENTOS ── */}
          {aba==='lancamentos' && (
            txMes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🗂️</div>
                <p style={{fontWeight:600}}>Nenhum lançamento neste período</p>
              </div>
            ) : (
              [...txMes].sort((a,b)=>a.data.localeCompare(b.data)).map(t=>(
                <div key={t.id} className="list-item">
                  <span style={{marginTop:2}}>{t.tipo==='entrada'?'💚':'🔴'}</span>
                  <div className="list-info">
                    <div className="list-desc">{t.descricao}</div>
                    <div className="list-meta">
                      <span className={`tag tag-${t.tipo}`}>{t.tipo==='entrada'?'Entrada':'Saída'}</span>
                      📅 {fmtDataBR(t.data)}
                      {t.cliente && <span>· 👤 {t.cliente}</span>}
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div className={`tx-valor ${t.tipo==='entrada'?'positive':'negative'}`}>
                      {t.tipo==='entrada'?'+':'-'}{fmt(t.valor)}
                    </div>
                    <div className="tx-actions">
                      <button className="btn-icon" onClick={()=>iniciarEdicao(t)}>✏️</button>
                      <button className="btn-icon" onClick={()=>setDeleteId(t.id)}>🗑️</button>
                    </div>
                  </div>
                </div>
              ))
            )
          )}

          {/* ── ABA NOVO / EDITAR ── */}
          {aba==='novo' && (
            <div className="card" style={{maxWidth:520}}>
              <h2 style={{fontWeight:700,marginBottom:20,fontSize:16,color:editId?'#f59e0b':'#818cf8'}}>
                {editId ? '✏️ Editar Lançamento' : '➕ Novo Lançamento'}
              </h2>

              <div className="field">
                <label className="field-label">Tipo de lançamento</label>
                <div className="tipo-toggle">
                  <button className={`tipo-btn ${tipo==='entrada'?'active-entrada':''}`} onClick={()=>setTipoForm('entrada')}>
                    💚 Entrada (Recebimento)
                  </button>
                  <button className={`tipo-btn ${tipo==='saida'?'active-saida':''}`} onClick={()=>setTipoForm('saida')}>
                    🔴 Saída (Pagamento)
                  </button>
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div className="field">
                  <label className="field-label">Data</label>
                  <input className="input" type="date" value={form.data}
                    onChange={e=>setForm(f=>({...f,data:e.target.value}))} />
                </div>
                <div className="field">
                  <label className="field-label">Valor (R$)</label>
                  <input className="input" type="number" placeholder="0,00" min="0.01" step="0.01"
                    value={form.valor} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} />
                </div>
              </div>

              <div className="field">
                <label className="field-label">Cliente / Fornecedor</label>
                <input className="input" type="text" placeholder="Nome do cliente ou fornecedor (opcional)"
                  value={form.cliente} onChange={e=>setForm(f=>({...f,cliente:e.target.value}))} />
              </div>

              <div className="field">
                <label className="field-label">Descrição *</label>
                <input className="input" type="text" placeholder="Descreva o lançamento..."
                  value={form.descricao} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))}
                  onKeyDown={e=>e.key==='Enter'&&salvarTransacao()} />
              </div>

              {erro && <div className="alert alert-error" style={{marginBottom:14}}>⚠️ {erro}</div>}

              <button className={`btn ${editId?'':'btn-primary'} btn-full`}
                style={editId?{background:'#f59e0b',color:'#000'}:{}}
                onClick={salvarTransacao} disabled={saving}
              >
                {saving ? <><span className="spinner" style={{width:16,height:16}} /> Salvando...</> :
                  editId ? '💾 Atualizar Lançamento' : '✅ Salvar Lançamento'}
              </button>

              {editId && (
                <button className="btn btn-ghost btn-full" style={{marginTop:8}} onClick={cancelarEdicao}>
                  Cancelar edição
                </button>
              )}
            </div>
          )}
        </main>

        {/* ── MOBILE NAV ── */}
        <nav className="mobile-nav">
          {[['projecao','📊','Projeção'],['lancamentos','📋','Lista'],['novo','➕','Novo']].map(([id,icon,label])=>(
            <button key={id} className={`mobile-nav-btn ${aba===id?'nav-active':''}`}
              onClick={()=>{ setAba(id); if(id!=='novo') cancelarEdicao() }}
            >
              <span className="nav-icon">{icon}</span>
              <span>{label}</span>
              {aba===id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
      </div>

      {/* ── MODAL EXCLUIR ── */}
      {deleteId && (
        <div className="overlay" onClick={()=>setDeleteId(null)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:32,textAlign:'center',marginBottom:12}}>🗑️</div>
            <h3 style={{textAlign:'center',fontWeight:700,marginBottom:8}}>Excluir lançamento?</h3>
            <p style={{color:'#94a3b8',fontSize:13,textAlign:'center',marginBottom:20}}>
              Esta ação não pode ser desfeita.
            </p>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-danger btn-full" onClick={excluir}>Excluir</button>
              <button className="btn btn-ghost btn-full" onClick={()=>setDeleteId(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
