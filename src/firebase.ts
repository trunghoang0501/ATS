import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseAppletConfig from '../firebase-applet-config.json';

const isPlaceholder = (val: string | undefined) => 
  !val || val.includes('MY_') || val.includes('remixed-api-key') || val === '""' || val === "''";

const getFirebaseConfig = () => {
  const envConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID
  };

  return {
    apiKey: isPlaceholder(envConfig.apiKey) ? firebaseAppletConfig.apiKey : envConfig.apiKey,
    authDomain: isPlaceholder(envConfig.authDomain) ? firebaseAppletConfig.authDomain : envConfig.authDomain,
    projectId: isPlaceholder(envConfig.projectId) ? firebaseAppletConfig.projectId : envConfig.projectId,
    storageBucket: isPlaceholder(envConfig.storageBucket) ? firebaseAppletConfig.storageBucket : envConfig.storageBucket,
    messagingSenderId: isPlaceholder(envConfig.messagingSenderId) ? firebaseAppletConfig.messagingSenderId : envConfig.messagingSenderId,
    appId: isPlaceholder(envConfig.appId) ? firebaseAppletConfig.appId : envConfig.appId,
    measurementId: isPlaceholder(envConfig.measurementId) ? firebaseAppletConfig.measurementId : envConfig.measurementId,
    firestoreDatabaseId: isPlaceholder(envConfig.firestoreDatabaseId) ? firebaseAppletConfig.firestoreDatabaseId : envConfig.firestoreDatabaseId
  };
};

const firebaseConfig = getFirebaseConfig();

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);
