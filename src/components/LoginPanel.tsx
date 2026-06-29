import React, { useState } from 'react';
import { LogIn, Shield, ChevronRight } from 'lucide-react';

const copilotBg = '/src/assets/images/copilot_1782765887301.jpg';
const jstuLogo = '/src/assets/images/jstu_logo_1782765902291.jpg';

interface LoginPanelProps {
  onLoginSuccess: () => void;
}

interface BypassUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export default function LoginPanel({ onLoginSuccess }: LoginPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Direct login credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');


  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in both Email and Password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/session-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        data = { error: text || 'Server returned invalid JSON' };
      }

      if (!res.ok) {
        throw new Error(data.error || 'Invalid credentials. Please try again.');
      }

      onLoginSuccess();
    } catch (err: any) {
      console.error('Login Error:', err);
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-[#E4E3E0] flex items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Low transparency Copilot Background Image */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-15 pointer-events-none"
        style={{ backgroundImage: `url(${copilotBg})` }}
      />
      {/* High-density grid background representation */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#141414 1px, transparent 1px), linear-gradient(90deg, #141414 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
      
      <div className="relative w-full max-w-lg bg-white/95 backdrop-blur-sm border border-[#D1D1CE] p-8 shadow-2xl overflow-hidden rounded-none">
        <div className="flex flex-col items-center">
          {/* Custom Branded JSTU Logo Badge */}
          <div className="h-16 w-16 bg-white border border-[#D1D1CE] p-1.5 flex items-center justify-center mb-6 shadow-sm">
            <img src={jstuLogo} className="h-full w-full object-contain" alt="JSTU Logo" referrerPolicy="no-referrer" />
          </div>
          
          <h1 className="text-xl font-black tracking-tighter text-[#141414] mb-1 uppercase">
            JSTU <span className="font-light opacity-60">BUS TRACKER</span>
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-[#8E9299] font-black font-mono mb-6">
            UNIVERSITY TRANSIT GATEWAY
          </p>
          
          <p className="text-xs text-[#8E9299] max-w-xs text-center mb-6 leading-relaxed">
            Authorized Jamalpur Science and Technology University portal. Enter credentials below to access active transit routes, real-time logistics, and driver scheduling.
          </p>

          {error && (
            <div className="w-full bg-red-50 border-l-4 border-red-600 p-4 mb-6 text-left rounded-none">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-800 font-mono">Authentication Alert</p>
              <p className="text-xs text-red-700 mt-1">{error}</p>
            </div>
          )}

          {/* Direct Credentials Login Form */}
          <form onSubmit={handleDirectLogin} className="w-full space-y-4 mb-6">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                placeholder="operator@bustracker.dev"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#F9F9F8] text-[#141414] placeholder-[#8E9299] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2.5 px-3 text-xs"
                required
                disabled={loading}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[10px] uppercase tracking-wider text-[#8E9299] font-bold">
                  Password
                </label>
              </div>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#F9F9F8] text-[#141414] placeholder-[#8E9299] border border-[#D1D1CE] focus:border-[#141414] focus:bg-white focus:outline-none rounded-none py-2.5 px-3 text-xs"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-[#141414] text-white hover:bg-[#2e2e2e] transition-colors py-3 px-4 font-bold uppercase tracking-widest text-xs disabled:opacity-50 cursor-pointer rounded-none"
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-none animate-spin" />
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  <span>Secure Login</span>
                </>
              )}
            </button>
          </form>

          <div className="w-full flex items-center justify-between my-6">
            <span className="w-full h-[1px] bg-[#D1D1CE]" />
            <span className="text-[10px] text-[#8E9299] px-3 uppercase tracking-widest font-black font-mono">SECURED</span>
            <span className="w-full h-[1px] bg-[#D1D1CE]" />
          </div>

          <p className="text-[10px] text-[#8E9299] font-mono leading-relaxed uppercase tracking-normal text-center">
            Admin accounts can create user/driver profiles with direct password credentials.
          </p>
        </div>
      </div>
    </div>
  );
}
