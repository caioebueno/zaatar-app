import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

const store = {
  get: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(localStorage.getItem(key))
      : SecureStore.getItemAsync(key),
  set: (key: string, value: string) =>
    Platform.OS === "web"
      ? Promise.resolve(void localStorage.setItem(key, value))
      : SecureStore.setItemAsync(key, value),
  del: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(void localStorage.removeItem(key))
      : SecureStore.deleteItemAsync(key),
};
import type { AuthOwner } from "@/services/authApi";
import { fetchBusinesses, fetchCurrentBusiness } from "@/services/orgApi";

const TOKEN_KEY      = "auth_token";
const OWNER_KEY      = "auth_owner";
const BUSINESSES_KEY = "auth_businesses";
const BIZ_ID_KEY     = "auth_selected_biz";
const BRANCH_ID_KEY  = "auth_selected_branch";

type Business = { id: string; name: string; logoUrl?: string | null };
type Branch   = { id: string; name: string };

type AuthContextValue = {
  token: string | null;
  owner: AuthOwner | null;
  businesses: Business[];
  selectedBusinessId: string | null;
  branches: Branch[];
  selectedBranchId: string | null;
  isLoading: boolean;
  signIn: (token: string, owner: AuthOwner, businesses?: { id: string; name: string; logoUrl?: string | null }[]) => Promise<void>;
  selectBusiness: (id: string) => Promise<void>;
  selectBranch: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token,              setToken]              = useState<string | null>(null);
  const [owner,              setOwner]              = useState<AuthOwner | null>(null);
  const [businesses,         setBusinesses]         = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [branches,           setBranches]           = useState<Branch[]>([]);
  const [selectedBranchId,   setSelectedBranchId]   = useState<string | null>(null);
  const [isLoading,          setIsLoading]          = useState(true);

  // Restore session from SecureStore
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedOwner, storedBiz, storedBizId, storedBranchId] = await Promise.all([
          store.get(TOKEN_KEY),
          store.get(OWNER_KEY),
          store.get(BUSINESSES_KEY),
          store.get(BIZ_ID_KEY),
          store.get(BRANCH_ID_KEY),
        ]);
        if (storedToken && storedOwner) {
          setToken(storedToken);
          setOwner(JSON.parse(storedOwner) as AuthOwner);
          if (storedBiz) setBusinesses(JSON.parse(storedBiz) as Business[]);
          if (storedBizId) setSelectedBusinessId(storedBizId);
          if (storedBranchId) setSelectedBranchId(storedBranchId);
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Refresh business list from API whenever token is available
  useEffect(() => {
    if (!token) return;
    fetchBusinesses(token)
      .then(({ items, selectedBusinessId: defaultBizId }) => {
        setBusinesses(items.map(({ id, name, logoUrl }) => ({ id, name, logoUrl })));
        if (defaultBizId) {
          setSelectedBusinessId((prev) => prev ?? defaultBizId);
        }
      })
      .catch(() => {});
  }, [token]);

  // Fetch branches whenever the selected business changes
  useEffect(() => {
    if (!token || !selectedBusinessId) {
      setBranches([]);
      return;
    }
    fetchCurrentBusiness(token, selectedBusinessId)
      .then(({ branches: list }) => {
        setBranches(list.map(({ id, name }) => ({ id, name })));
      })
      .catch(() => setBranches([]));
  }, [token, selectedBusinessId]);

  const signIn = useCallback(async (
    newToken: string,
    newOwner: AuthOwner,
    newBusinesses?: { id: string; name: string; logoUrl?: string | null }[],
  ) => {
    const biz = (newBusinesses ?? []).map(({ id, name, logoUrl }) => ({ id, name, logoUrl }));
    await Promise.all([
      store.set(TOKEN_KEY, newToken),
      store.set(OWNER_KEY, JSON.stringify(newOwner)),
      store.set(BUSINESSES_KEY, JSON.stringify(biz)),
      store.del(BIZ_ID_KEY),
      store.del(BRANCH_ID_KEY),
    ]);
    setToken(newToken);
    setOwner(newOwner);
    setBusinesses(biz);
    setSelectedBusinessId(null);
    setSelectedBranchId(null);
    setBranches([]);
  }, []);

  const selectBusiness = useCallback(async (id: string) => {
    await Promise.all([
      store.set(BIZ_ID_KEY, id),
      store.del(BRANCH_ID_KEY),
    ]);
    setSelectedBusinessId(id);
    setSelectedBranchId(null);
  }, []);

  const selectBranch = useCallback(async (id: string) => {
    await store.set(BRANCH_ID_KEY, id);
    setSelectedBranchId(id);
  }, []);

  const signOut = useCallback(async () => {
    await Promise.all([
      store.del(TOKEN_KEY),
      store.del(OWNER_KEY),
      store.del(BUSINESSES_KEY),
      store.del(BIZ_ID_KEY),
      store.del(BRANCH_ID_KEY),
    ]);
    setToken(null);
    setOwner(null);
    setBusinesses([]);
    setSelectedBusinessId(null);
    setBranches([]);
    setSelectedBranchId(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      token, owner, businesses, selectedBusinessId,
      branches, selectedBranchId,
      isLoading, signIn, selectBusiness, selectBranch, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
