import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  roles: string[];
  userFullName: string;
  userBranchId: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [userFullName, setUserFullName] = useState("");
  const [userBranchId, setUserBranchId] = useState<string | null>(null);

  const fetchRole = async (userId: string) => {
    try {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const r = (data || []).map((x: any) => x.role);
      setRoles(r);
      setIsSuperAdmin(r.includes("super_admin"));
      setIsAdmin(r.includes("super_admin") || r.includes("admin"));
    } catch {
      setRoles([]);
      setIsSuperAdmin(false);
      setIsAdmin(false);
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data } = await supabase.from("profiles").select("full_name, branch_id").eq("user_id", userId).single();
      setUserFullName((data as any)?.full_name || "");
      setUserBranchId((data as any)?.branch_id || null);
    } catch {
      setUserFullName("");
      setUserBranchId(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        setTimeout(() => {
          fetchRole(session.user.id);
          fetchProfile(session.user.id);
        }, 0);
      } else {
        setIsSuperAdmin(false);
        setIsAdmin(false);
        setRoles([]);
        setUserFullName("");
        setUserBranchId(null);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        fetchRole(session.user.id);
        fetchProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isSuperAdmin, isAdmin, roles, userFullName, userBranchId, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
