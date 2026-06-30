import { useState, useEffect } from 'react';
import { User } from './types.ts';
import LoginPanel from './components/LoginPanel.tsx';
import AdminPanel from './components/AdminPanel.tsx';
import DriverPanel from './components/DriverPanel.tsx';
import UserPanel from './components/UserPanel.tsx';
import { LogOut, MapPin, Shield, Compass, User as UserIcon } from 'lucide-react';

const jstuLogo = '/src/assets/images/jstu_logo_1782765902291.jpg';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  // Check server session cookie
  const checkSession = async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        console.error('Invalid JSON from /api/me:', text);
        setUser(null);
        return;
      }

      if (res.ok) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Session check failed:', err);
      setUser(null);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleSignOut = async () => {
    setChecking(true);
    try {
      await fetch('/api/session-logout', { method: 'POST' });
      setUser(null);
    } catch (err) {
      console.error('Failed to sign out:', err);
    } finally {
      setChecking(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] text-[#141414] flex flex-col items-center justify-center p-6 font-sans">
        <div className="h-6 w-6 border-2 border-[#141414] border-t-transparent rounded-none animate-spin mb-3" />
        <span className="text-[10px] font-mono text-[#8E9299] uppercase tracking-widest font-bold">Initializing System...</span>
      </div>
    );
  }

  if (!user) {
    return <LoginPanel onLoginSuccess={checkSession} />;
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] flex flex-col font-sans selection:bg-[#141414] selection:text-white">
      {/* Platform Header */}
      <header className="h-16 border-b border-[#D1D1CE] bg-white sticky top-0 z-50 px-4 md:px-8 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <img src={jstuLogo} className="h-9 w-9 object-contain" alt="JSTU Logo" referrerPolicy="no-referrer" />
          <div>
            <h1 className="text-sm font-black tracking-tighter text-[#141414] uppercase">
              JSTU <span className="font-light opacity-60">Bus Tracker</span>
            </h1>
            <span className="text-[8px] uppercase tracking-wider text-[#8E9299] font-black font-mono block -mt-0.5">University Transit Network</span>
          </div>
        </div>

        {/* User context & Action */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <div className="flex items-center gap-2 justify-end">
              <p className="text-xs font-bold text-[#141414]">{user.name}</p>
              
              {/* Badge representing role */}
              <span className={`inline-flex items-center px-1.5 py-0.5 text-[8px] font-bold uppercase font-mono tracking-wider border rounded-none ${
                user.role === 'admin'
                  ? 'bg-[#141414] text-white border-[#141414]'
                  : user.role === 'driver'
                  ? 'bg-[#8E9299] text-white border-[#8E9299]'
                  : 'bg-transparent text-[#8E9299] border-[#D1D1CE]'
              }`}>
                {user.role}
              </span>
            </div>
            <p className="text-[9px] text-[#8E9299] font-mono mt-0.5">{user.email}</p>
          </div>

          <button
            onClick={handleSignOut}
            title="Log Out"
            className="h-8 w-8 border border-[#D1D1CE] bg-white flex items-center justify-center text-[#141414] hover:bg-[#F2F2F2] transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Dynamic Main Dashboard Router */}
      <main className="flex-1 flex flex-col">
        {user.role === 'admin' && <AdminPanel />}
        {user.role === 'driver' && <DriverPanel />}
        {user.role !== 'admin' && user.role !== 'driver' && <UserPanel />}
      </main>
    </div>
  );
}
