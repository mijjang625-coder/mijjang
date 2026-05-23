import { useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js';

const inputClass =
  'w-full rounded-lg border border-[#D8CEC5] px-3 py-2 text-sm text-[#2F2A26] outline-none focus:border-[#C8B6A6]';

export default function AuthGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const authBootstrappedRef = useRef(false);

  const userEmail = useMemo(() => session?.user?.email || '', [session]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return undefined;
    }

    let active = true;

    const bootstrapAuth = async () => {
      // React StrictMode(개발)에서 effect가 2번 실행되는 문제 방지
      if (authBootstrappedRef.current) {
        const { data } = await supabase.auth.getSession();
        if (active) {
          setSession(data.session ?? null);
          setLoading(false);
        }
        return;
      }
      authBootstrappedRef.current = true;

      try {
        const url = new URL(window.location.href);
        const oauthCode = url.searchParams.get('code');

        // PKCE(code) 플로우 지원
        if (oauthCode) {
          const doneKey = `oauth-exchanged:${oauthCode}`;
          const alreadyDone = sessionStorage.getItem(doneKey) === '1';

          if (!alreadyDone) {
            const { error } = await supabase.auth.exchangeCodeForSession(oauthCode);
            if (error && active) {
              setMessage(`Google 로그인 오류: ${error.message}`);
            }
            sessionStorage.setItem(doneKey, '1');
          }

          window.history.replaceState({}, document.title, window.location.pathname);
        }

        const rawHash = window.location.hash?.startsWith('#')
          ? window.location.hash.slice(1)
          : '';

        // Implicit(hash) 플로우 지원
        if (rawHash && (rawHash.includes('access_token=') || rawHash.includes('error='))) {
          const hashParams = new URLSearchParams(rawHash);
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          const oauthError = hashParams.get('error_description') || hashParams.get('error');

          if (oauthError && active) {
            setMessage(`Google 로그인 오류: ${decodeURIComponent(oauthError)}`);
          }

          if (accessToken && refreshToken) {
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (error && active) {
              setMessage(`Google 세션 저장 실패: ${error.message}`);
            }
            if (!error && active) {
              setSession(data.session ?? null);
            }
          }

          window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
        }

        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setSession(data.session ?? null);
      } catch (err) {
        if (active) {
          setMessage(err?.message || '로그인 상태 초기화 중 오류가 발생했어요.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (e) => {
    e.preventDefault();
    if (!supabase) return;

    try {
      setBusy(true);
      setMessage('');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setMessage('로그인 성공!');
    } catch (err) {
      setMessage(err?.message || '로그인에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  const signUp = async () => {
    if (!supabase) return;

    try {
      setBusy(true);
      setMessage('');
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      setMessage('회원가입 완료! 메일 인증이 켜져 있다면 이메일을 확인해 주세요.');
    } catch (err) {
      setMessage(err?.message || '회원가입에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    if (!supabase) return;

    try {
      setBusy(true);
      setMessage('');
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error) throw error;
    } catch (err) {
      setBusy(false);
      setMessage(err?.message || 'Google 로그인에 실패했어요.');
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[#F7F3EE] text-[#2F2A26] flex items-center justify-center">
        <p className="text-sm">로그인 상태 확인 중...</p>
      </div>
    );
  }

  if (!isSupabaseConfigured) {
    return (
      <>
        <div className="w-full border-b border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          로그인 기능을 켜려면 <code>VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>
          환경변수를 설정해 주세요. (지금은 기존 모드로 실행 중)
        </div>
        {children}
      </>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen w-full bg-[#F7F3EE] text-[#2F2A26] flex items-center justify-center px-4">
        <form
          className="w-full max-w-md rounded-2xl border border-[#E7DED5] bg-white p-6 shadow-sm"
          onSubmit={signIn}
        >
          <h1 className="text-xl font-semibold mb-2">로그인</h1>
          <p className="text-sm text-[#655C54] mb-5">회원가입 후 로그인하면 작업을 계정 기준으로 관리할 수 있어요.</p>

          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              required
              className={inputClass}
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호 (6자 이상)"
              minLength={6}
              required
              className={inputClass}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#2F2A26] px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              로그인
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={signUp}
              className="rounded-lg border border-[#D8CEC5] bg-white px-3 py-2 text-sm disabled:opacity-60"
            >
              회원가입
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={signInWithGoogle}
            className="mt-2 w-full rounded-lg bg-[#C8B6A6] px-3 py-2 text-sm text-[#2F2A26] disabled:opacity-60"
          >
            Google로 계속하기
          </button>

          {message && <p className="mt-3 text-xs text-[#655C54]">{message}</p>}
        </form>
      </div>
    );
  }

  return (
    <>
      <div className="fixed right-3 top-3 z-[1000] rounded-full border border-[#D8CEC5] bg-white/95 px-3 py-1.5 text-xs text-[#2F2A26] shadow-sm backdrop-blur">
        <span className="mr-2">{userEmail}</span>
        <button
          type="button"
          onClick={signOut}
          className="rounded-md border border-[#E7DED5] px-2 py-0.5 hover:bg-[#F7F3EE]"
        >
          로그아웃
        </button>
      </div>
      {children}
    </>
  );
}
