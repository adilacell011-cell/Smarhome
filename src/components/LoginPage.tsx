import { useState, FormEvent } from 'react';
import { ShieldCheck, User, Lock, LogIn, Eye, EyeOff } from 'lucide-react';

interface LoginPageProps {
  onSuccess: () => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onSuccess();
      } else {
        setError(data.message || 'Login gagal');
      }
    } catch {
      setError('Tidak dapat terhubung ke server');
    }
    setLoading(false);
  };

  const inputWrap = 'flex items-center gap-2.5 bg-zinc-900 border border-zinc-800/80 px-3 py-2.5 rounded-xl focus-within:ring-1 focus-within:ring-[#F97316]/50 transition-all';
  const inputClass = 'flex-1 bg-transparent text-sm font-medium text-white placeholder-zinc-600 focus:outline-none';

  return (
    <div className="min-h-screen bg-[#0A0A0C] font-sans text-zinc-100 flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3">
            <ShieldCheck size={28} className="text-[#F97316]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">ADILANET</h1>
          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Dashboard Control</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#121214] border border-[#1F1F24] rounded-3xl p-5 space-y-3.5 shadow-xl shadow-black/40">
          <p className="text-[10px] font-extrabold text-zinc-500 uppercase tracking-widest pl-0.5">Masuk ke Akun Anda</p>

          <div>
            <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">Username</label>
            <div className={inputWrap}>
              <User size={15} className="text-zinc-500 shrink-0" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Masukkan username"
                autoComplete="username"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-extrabold text-zinc-500 uppercase tracking-wider pl-0.5 mb-1 block">Password</label>
            <div className={inputWrap}>
              <Lock size={15} className="text-zinc-500 shrink-0" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                autoComplete="current-password"
                className={inputClass}
              />
              <button type="button" onClick={() => setShowPw(v => !v)} className="text-zinc-500 hover:text-zinc-300 shrink-0">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[11px] font-medium text-rose-300 text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#F97316] hover:bg-orange-600 disabled:opacity-50 text-white font-extrabold text-xs py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-orange-500/10 cursor-pointer"
          >
            <LogIn size={15} /> {loading ? 'Memproses...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}
