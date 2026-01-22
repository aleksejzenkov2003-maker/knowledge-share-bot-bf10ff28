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

    // Get initial session first, then set up listener
    const initializeAuth = async () => {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        
        if (!isMounted) return;

        if (initialSession?.user) {
          setSession(initialSession);
          setUser(initialSession.user);
          
          // Load metadata in parallel
          const metadata = await loadUserMetadata(initialSession.user.id);
          if (isMounted) {
            setRole(metadata.role);
            setDepartmentId(metadata.departmentId);
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!isMounted) return;

        setSession(newSession);
        setUser(newSession?.user ?? null);
        
        if (newSession?.user) {
          // Load metadata on any session event (sign-in, token refresh, initial)
          const metadata = await loadUserMetadata(newSession.user.id);
          if (isMounted) {
            setRole(metadata.role);
            setDepartmentId(metadata.departmentId);
          }
        } else {
          setRole(null);
          setDepartmentId(null);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
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
