const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.firebasestorage.app",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:abc123def456",

    // App Check: reCAPTCHA Enterprise site key.
    // Google Cloud Console -> Fraud Defense -> key with Application type "Web".
    // Without it the site works, but App Check stays disabled (see js/app.js).
    appCheckSiteKey: "6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
};
