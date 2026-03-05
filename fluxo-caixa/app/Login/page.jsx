'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [senha, setSenha]       = useState('')
  const [modo, setModo]         = useState('login') // login | cadastro | reset
  const [erro, setErro]         = useState('')
  const [msg, setMsg]           = useState('')
  const [loading, setLoading]   = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async () => {
    setErro(''); setMsg(''); setLoading(true)
    try {
      if (modo === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
        router.push('/dashboard')
        router.refresh()
      } else if (modo === 'cadastro') {
        const { error } = await supabase.auth.signUp({ email, password: senha })
        if (error) throw error
        setMsg('✅ Conta criada! Verifique seu e-mail para confirmar.')
        setModo('login')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/dashboard`,
        })
        if (error) throw error
        setMsg('✅ Link de redefinição enviado para seu e-mail.')
        setModo('login')
      }
    } catch (e) {
      const msgs = {
        'Invalid login credentials': 'E-mail ou senha incorretos.',
        'Email not confirmed': 'Confirme seu e-mail antes de entrar.',
        'User already registered': 'Este e-mail já está cadastrado.',
        'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
      }
      setErro(msgs[e.message] || e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleSubmit() }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'#0f1117', padding:'16px',
    }}>
      <div style={{ width:'100%', maxWidth:'400px' }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <div style={{ fontSize:'40px', marginBottom:'8px' }}>💰</div>
          <h1 style={{ fontSize:'24px', fontWeight:'700', letterSpacing:'-.02em', color:'#e8eaf0' }}>
            Fluxo de Caixa
          </h1>
          <p style={{ color:'#6b7280', marginTop:'4px', fontSize:'14px' }}>
            Projeção diária inteligente
          </p>
        </div>

        <div style={{
          background:'#161923', border:'1px solid #22263a', borderRadius:'16px', padding:'28px',
        }}>
          <h2 style={{ fontWeight:'700', marginBottom:'20px', fontSize:'16px', color:'#e8eaf0' }}>
            {modo === 'login' ? 'Entrar na conta' : modo === 'cadastro' ? 'Criar conta' : 'Redefinir senha'}
          </h2>

          {erro && (
            <div className="alert alert-error" style={{ marginBottom:'14px' }}>
              ⚠️ {erro}
            </div>
          )}
          {msg && (
            <div className="alert alert-success" style={{ marginBottom:'14px' }}>
              {msg}
            </div>
          )}

          <div className="field">
            <label className="field-label">E-mail</label>
            <input
              className="input" type="email" placeholder="seu@email.com"
              value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKey}
              autoComplete="email"
            />
          </div>

          {modo !== 'reset' && (
            <div className="field">
              <label className="field-label">Senha</label>
              <input
                className="input" type="password" placeholder="••••••••"
                value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={handleKey}
                autoComplete={modo === 'cadastro' ? 'new-password' : 'current-password'}
              />
            </div>
          )}

          <button
            className="btn btn-primary btn-full"
            style={{ marginTop:'4px' }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? <><span className="spinner" style={{width:'16px',height:'16px'}} /> Aguarde...</> :
              modo === 'login' ? '🔐 Entrar' :
              modo === 'cadastro' ? '✨ Criar conta' : '📧 Enviar link'}
          </button>

          <hr className="divider" style={{ margin:'20px 0' }} />

          <div style={{ display:'flex', flexDirection:'column', gap:'8px', alignItems:'center' }}>
            {modo === 'login' && <>
              <button onClick={() => { setModo('cadastro'); setErro(''); setMsg('') }}
                style={{ background:'none', border:'none', color:'#818cf8', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>
                Não tem conta? Criar agora
              </button>
              <button onClick={() => { setModo('reset'); setErro(''); setMsg('') }}
                style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:'12px' }}>
                Esqueci minha senha
              </button>
            </>}
            {(modo === 'cadastro' || modo === 'reset') && (
              <button onClick={() => { setModo('login'); setErro(''); setMsg('') }}
                style={{ background:'none', border:'none', color:'#818cf8', cursor:'pointer', fontSize:'13px', fontWeight:'600' }}>
                ← Voltar ao login
              </button>
            )}
          </div>
        </div>

        <p style={{ textAlign:'center', color:'#6b7280', fontSize:'12px', marginTop:'20px' }}>
          Seus dados são privados e protegidos 🔒
        </p>
      </div>
    </div>
  )
}
