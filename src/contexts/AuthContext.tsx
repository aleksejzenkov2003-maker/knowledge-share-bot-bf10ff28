import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'moderator' | 'employee';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  departmentId: string | null;
  isLoading: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Memoized function to load user metadata (role + department) in parallel
  const loadUserMetadata = useCallback(async (userId: string) => {
    try {
      const [roleResult, profileResult] = await Promise.all([
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .single(),
        supabase
          .from('profiles')
          .select('department_id')
          .eq('id', userId)
          .single()
      ]);

      const userRole = roleResult.error ? null : (roleResult.data?.role as AppRole);
      const userDeptId = profileResult.error ? null : (profileResult.data?.department_id as string | null);

      return { role: userRole, departmentId: userDeptId };
    } catch (error) {
      console.error('Error loading user metadata:', error);
      return { role: null, departmentId: null };
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let initialLoadComplete = false;
    let subscription: { unsubscribe: () => void } | null = null;

    // Hard safety timeout: if backend (auth) is unreachable, don't block UI forever.
    // Auth /token endpoint can hang on 504 for tens of seconds during Lovable Cloud
    // outages, which would leave the app stuck on the loading spinner.
    const safetyTimeout = setTimeout(() => {
      if (isMounted && !initialLoadComplete) {
        console.warn('Auth init safety timeout reached — releasing UI');
        initialLoadComplete = true;
        setIsLoading(false);
      }
    }, 8000);

    // Get initial session first, then set up listener
    const initializeAuth = async () => {
      try {
        // Race getSession against a timeout so a hanging /token refresh
        // doesn't keep the whole app on a blank loading screen.
        const sessionPromise = supabase.auth.getSession();
        const timeoutSession = new Promise<{ data: { session: Session | null }; error: Error | null }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null }, error: new Error('getSession timeout') }), 7000)
        );
        const { data: { session: initialSession }, error: sessionError } = await Promise.race([
          sessionPromise,
          timeoutSession,
        ]) as { data: { session: Session | null }; error: Error | null };

        if (sessionError) {
          console.error('Error getting session:', sessionError);
        }

        if (!isMounted) return;

        if (initialSession?.user) {
          console.log('Session restored for user:', initialSession.user.email);
          setSession(initialSession);
          setUser(initialSession.user);

          // Load metadata in parallel with timeout
          try {
            const metadataPromise = loadUserMetadata(initialSession.user.id);
            const timeoutPromise = new Promise<{ role: AppRole | null; departmentId: string | null }>((_, reject) =>
              setTimeout(() => reject(new Error('Metadata load timeout')), 5000)
            );

            const metadata = await Promise.race([metadataPromise, timeoutPromise]);
            if (isMounted) {
              setRole(metadata.role);
              setDepartmentId(metadata.departmentId);
            }
          } catch (metaError) {
            console.error('Error loading metadata:', metaError);
            // Don't block auth flow on metadata failure
          }
        } else {
          console.log('No active session found');
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        clearTimeout(safetyTimeout);
        if (isMounted) {
          initialLoadComplete = true;
          setIsLoading(false);
        }
      }
    };

    // Set up auth state listener first (before async call)
    try {
      const { data } = supabase.auth.onAuthStateChange(
        async (event, newSession) => {
          if (!isMounted) return;
          
          // Skip INITIAL_SESSION if already processed by initializeAuth
          if (event === 'INITIAL_SESSION' && !initialLoadComplete) {
            return;
          }

          setSession(newSession);
          setUser(newSession?.user ?? null);
          
          if (newSession?.user) {
            // Use setTimeout to avoid race conditions with Supabase's sync code
            setTimeout(async () => {
              if (!isMounted) return;
              try {
                const metadata = await loadUserMetadata(newSession.user.id);
                if (isMounted) {
                  setRole(metadata.role);
                  setDepartmentId(metadata.departmentId);
                }
              } catch (error) {
                console.error('Error loading metadata on auth change:', error);
              }
            }, 0);
          } else {
            setRole(null);
            setDepartmentId(null);
          }
        }
      );
      subscription = data.subscription;
    } catch (error) {
      console.error('Error setting up auth listener:', error);
      setIsLoading(false);
    }

    // Then initialize
    initializeAuth();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [loadUserMetadata]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setDepartmentId(null);
  };

  const value: AuthContextType = {
    user,
    session,
    role,
    departmentId,
    isLoading,
    isAdmin: role === 'admin',
    isModerator: role === 'moderator',
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
