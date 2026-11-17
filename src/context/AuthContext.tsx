import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';

const BOOTSTRAPPED_TECH_EMAIL = 'jawedimtiaz@gmail.com';
export const STUDIO_HQ_ALLOWED_EMAILS = ['jawedimtiaz@gmail.com', 'jawed@jawed.co.in'];

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isTech: boolean;
  isStudioEmail: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isTech: false,
  isStudioEmail: false,
  signInWithGoogle: async () => {},
  logout: async () => {},
  getIdToken: async () => null,
  authError: null
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isTech, setIsTech] = useState(false);
  const [isStudioEmail, setIsStudioEmail] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthError(null);

      if (currentUser) {
        const lowerEmail = currentUser.email?.trim().toLowerCase() || '';
        setIsStudioEmail(Boolean(currentUser.emailVerified && STUDIO_HQ_ALLOWED_EMAILS.includes(lowerEmail)));

        // Check if bootstrapped technician or has admin doc
        const isBootstrapped = lowerEmail === BOOTSTRAPPED_TECH_EMAIL.toLowerCase();
        if (isBootstrapped) {
          setIsTech(true);
        } else {
          try {
            const adminDoc = await getDoc(doc(db, 'admins', currentUser.uid));
            setIsTech(adminDoc.exists());
          } catch {
            setIsTech(false);
          }
        }
      } else {
        setIsTech(false);
        setIsStudioEmail(false);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setAuthError('Sign-in cancelled. Please complete the Google login dialog.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignored duplicate
      } else {
        setAuthError(err.message || 'Google authentication failed. Please try again.');
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setAuthError(null);
    } catch (err: any) {
      console.error('Logout Error:', err);
    }
  };

  const getIdToken = async (forceRefresh = false) => {
    if (!auth.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isTech, isStudioEmail, signInWithGoogle, logout, getIdToken, authError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
