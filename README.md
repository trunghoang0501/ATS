# TalentFlow ATS - Deployment Guide for Vercel

This project is ready to be deployed to Vercel. Follow these steps to ensure a smooth deployment.

## 1. Environment Variables

You need to configure the following environment variables in your Vercel project settings:

### Gemini AI
- `GEMINI_API_KEY`: Your Google Gemini API key.

### Firebase Configuration
These variables allow the app to connect to your Firebase project. You can find these values in your Firebase Project Settings (Web App configuration).

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_FIRESTORE_DATABASE_ID` (Optional if using default database)
- `VITE_FIREBASE_MEASUREMENT_ID` (Optional)

## 2. Vercel Configuration

The project includes a `vercel.json` file that handles Single Page Application (SPA) routing, ensuring that all routes are directed to `index.html`.

## 3. Build Settings

Vercel should automatically detect the Vite project. If not, use these settings:
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Install Command:** `npm install`

## 4. Firebase Authentication

Make sure to add your Vercel deployment URL (e.g., `https://your-app.vercel.app`) to the **Authorized Domains** list in the Firebase Console under **Authentication > Settings > Authorized Domains**.

---

Developed with TalentFlow ATS.
