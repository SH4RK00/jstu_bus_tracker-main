import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfigJson from '../../firebase-applet-config.json';

const firebaseAdminConfig = {
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
};

if (!getApps().length) {
  initializeApp(firebaseAdminConfig);
}

export const adminAuth = getAuth();
