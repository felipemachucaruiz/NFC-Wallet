import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { fetchAuthProviders } from "@/lib/api";

interface SocialAuthContextType {
  googleEnabled: boolean;
  loading: boolean;
}

const SocialAuthContext = createContext<SocialAuthContextType>({ googleEnabled: false, loading: true });

export function useSocialAuth() {
  return useContext(SocialAuthContext);
}

export function SocialAuthProvider({ children }: { children: ReactNode }) {
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuthProviders()
      .then((data) => {
        if (data.providers.google) {
          setGoogleClientId(data.providers.google);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const value = { googleEnabled: !!googleClientId, loading };

  if (googleClientId) {
    return (
      <SocialAuthContext.Provider value={value}>
        <GoogleOAuthProvider clientId={googleClientId}>
          {children}
        </GoogleOAuthProvider>
      </SocialAuthContext.Provider>
    );
  }

  return (
    <SocialAuthContext.Provider value={value}>
      {children}
    </SocialAuthContext.Provider>
  );
}
