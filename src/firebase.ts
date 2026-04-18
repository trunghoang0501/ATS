import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseAppletConfig from '../firebase-applet-config.json';

const isPlaceholder = (val: string | undefined) =>
  !val || val.includes('MY_') || val.includes('remixed-api-key') || val === '""' || val === "''";

/** Per-field merge of env + firebase-applet-config breaks OAuth if any VITE_* is empty (two projects mixed). */
const envFirebase = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID as string | undefined,
};

const requiredEnvKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const;

const envFirebaseComplete = requiredEnvKeys.every((key) => !isPlaceholder(envFirebase[key]));

type ResolvedFirebase = { options: FirebaseOptions; firestoreDatabaseId?: string };

const resolveFirebase = (): ResolvedFirebase => {
  if (envFirebaseComplete) {
    const measurementId = isPlaceholder(envFirebase.measurementId)
      ? undefined
      : envFirebase.measurementId;
    const fid = envFirebase.firestoreDatabaseId;
    const firestoreDatabaseId = fid && !isPlaceholder(fid) ? fid : undefined;

    return {
      options: {
        apiKey: envFirebase.apiKey!,
        authDomain: envFirebase.authDomain!,
        projectId: envFirebase.projectId!,
        storageBucket: envFirebase.storageBucket!,
        messagingSenderId: envFirebase.messagingSenderId!,
        appId: envFirebase.appId!,
        ...(measurementId ? { measurementId } : {}),
      },
      firestoreDatabaseId,
    };
  }

  const measurementId = firebaseAppletConfig.measurementId || undefined;
  return {
    options: {
      apiKey: firebaseAppletConfig.apiKey,
      authDomain: firebaseAppletConfig.authDomain,
      projectId: firebaseAppletConfig.projectId,
      storageBucket: firebaseAppletConfig.storageBucket,
      messagingSenderId: firebaseAppletConfig.messagingSenderId,
      appId: firebaseAppletConfig.appId,
      ...(measurementId ? { measurementId } : {}),
    },
    firestoreDatabaseId: firebaseAppletConfig.firestoreDatabaseId || undefined,
  };
};

const { options: firebaseOptions, firestoreDatabaseId } = resolveFirebase();

const app = initializeApp(firebaseOptions);
export const auth = getAuth(app);
export const db = firestoreDatabaseId ? getFirestore(app, firestoreDatabaseId) : getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logout = () => signOut(auth);
