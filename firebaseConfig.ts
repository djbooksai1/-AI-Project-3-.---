// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA0sML_yUbYNb-iPVJqNYBKJFxq_CS-IvY",
  authDomain: "haejeok-eaa4f.firebaseapp.com",
  projectId: "haejeok-eaa4f",
  storageBucket: "haejeok-eaa4f.appspot.com",
  messagingSenderId: "646620208083",
  appId: "1:646620208083:web:8404d8be2c8cb07632ad26",
  measurementId: "G-XGSXTYNN50"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);