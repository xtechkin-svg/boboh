import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyC8gzrjsiN9XirOJUpisQEx267d3FSoe3U",
  authDomain: "xtechstk.firebaseapp.com",
  projectId: "xtechstk",
  storageBucket: "xtechstk.firebasestorage.app",
  messagingSenderId: "107867078074",
  appId: "1:107867078074:web:e85ff0253458a3503a7183",
  measurementId: "G-H3QWQ9ZN32"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
