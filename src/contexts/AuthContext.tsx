import React, { createContext, useContext, useEffect, useState } from 'react';
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

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }
      return data?.role as AppRole;
    } catch (error) {
      console.error('Error fetching user role:', error);
      return null;
    }
  };

  const fetchUserDepartment = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('department_id')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.error('Error fetching user department:', error);
        return null;
      }
      return data?.department_id as string | null;
    } catch (error) {
      console.error('Error fetching user department:', error);
      return null;
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer role and department fetch to avoid blocking
          setTimeout(async () => {
            const [userRole, userDepartment] = await Promise.all([
              fetchUserRole(session.user.id),
              fetchUserDepartment(session.user.id)
            ]);
            setRole(userRole);
            setDepartmentId(userDepartment);
            setIsLoading(false);
          }, 0);
        } else {
          setRole(null);
          setDepartmentId(null);
          setIsLoading(false);
        }
      }
    );

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        Promise.all([
          fetchUserRole(session.user.id),
          fetchUserDepartment(session.user.id)
        ]).then(([userRole, userDepartment]) => {
          setRole(userRole);
          setDepartmentId(userDepartment);
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
