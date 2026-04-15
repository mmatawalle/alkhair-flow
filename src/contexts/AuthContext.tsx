import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
  userFullName: string;
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
  const [isStaff, setIsStaff] = useState(false);
  const [userFullName, setUserFullName] = useState("");

  const fetchRole = async (userId: string) => {
    try {
      const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
      setIsSuperAdmin(!!data);
      setIsStaff(false);
    } catch {
      setIsSuperAdmin(false);
      setIsStaff(false);
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", userId).single();
      setUserFullName(data?.full_name || "");
    } catch {
      setUserFullName("");
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoading(true);
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.all([
          fetchRole(session.user.id),
          fetchProfile(session.user.id),
        ]);
      } else {
        setIsSuperAdmin(false);
        setIsStaff(false);
        setUserFullName("");
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.all([
          fetchRole(session.user.id),
          fetchProfile(session.user.id),
        ]);
      } else {
        setIsSuperAdmin(false);
        setIsStaff(false);
        setUserFullName("");
      }
      setLoading(false);
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
    setSession(null);
    setUser(null);
    setIsSuperAdmin(false);
    setIsStaff(false);
    setUserFullName("");
    window.location.assign(`${import.meta.env.BASE_URL}login`);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, isSuperAdmin, isStaff, userFullName, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
