import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from '../../api';
import type { User } from '../../types';

interface AuthValue {
  user: User | null;
  ready: boolean;
  signingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue>({
  user: null, ready: false, signingIn: false,
  signIn: async () => {}, signOut: async () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(Ctx);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let alive = true;
    auth.getMe()
      .then((u) => { if (alive) setUser(u); })
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    try {
      setUser(await auth.signInWithGitHub());
    } finally {
      setSigningIn(false);
    }
  }, []);

  const doSignOut = useCallback(async () => {
    await auth.signOut();
    setUser(await auth.getMe());
  }, []);

  const value = useMemo(
    () => ({ user, ready, signingIn, signIn, signOut: doSignOut }),
    [user, ready, signingIn, signIn, doSignOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
