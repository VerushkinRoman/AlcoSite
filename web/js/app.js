let auth, db;
try {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
} catch (e) {
    console.warn('Firebase init failed:', e);
}

const screens = {
    login: document.getElementById('login-screen'),
    dashboard: document.getElementById('dashboard-screen'),
};

const $ = (id) => document.getElementById(id);

const googleBtn = $('google-signin-btn');
const logoutBtn = $('logout-btn');
const deleteBtn = $('delete-account-btn');
const userAvatar = $('user-avatar');
const userName = $('user-name');
const userEmail = $('user-email');
const modal = $('confirm-modal');
const confirmEmail = $('confirm-email');
const modalError = $('modal-error');
const modalCancelBtn = $('modal-cancel-btn');
const modalConfirmBtn = $('modal-confirm-btn');
const toast = $('toast');

let currentUser = null;
let deleteInProgress = false;

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

function showToast(message, type = '') {
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 4000);
}

function renderUser(user) {
    currentUser = user;
    userName.textContent = user.displayName || t('default_user');
    userEmail.textContent = user.email;
    userAvatar.src = user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'U') + '&background=4f46e5&color=fff';
    showScreen('dashboard');
}

const googleBtnHtml = `
    <svg width="20" height="20" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
        <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
        <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
        <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
    <span data-i18n="signin_google">Войти через Google</span>`;

googleBtn.addEventListener('click', async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('profile');
    provider.addScope('email');
    try {
        googleBtn.disabled = true;
        googleBtn.innerHTML = '<span>' + t('loading') + '</span>';
        const result = await auth.signInWithPopup(provider);
        renderUser(result.user);
        showToast(t('toast_login_ok'), 'success');
    } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
            showToast(t('toast_login_error') + err.message, 'error');
        }
    } finally {
        googleBtn.disabled = false;
        googleBtn.innerHTML = googleBtnHtml;
        googleBtn.querySelector('[data-i18n]') && applyLang(currentLang);
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        await auth.signOut();
        currentUser = null;
        showScreen('login');
        showToast(t('toast_logout'), 'success');
    } catch (err) {
        showToast(t('toast_logout_error') + err.message, 'error');
    }
});

deleteBtn.addEventListener('click', () => {
    if (!currentUser) return;
    confirmEmail.value = '';
    modalError.textContent = '';
    modalConfirmBtn.disabled = true;
    modalConfirmBtn.textContent = t('modal_confirm');
    modal.classList.add('show');
    confirmEmail.focus();
});

confirmEmail.addEventListener('input', () => {
    const matches = confirmEmail.value.trim() === currentUser.email;
    modalConfirmBtn.disabled = !matches;
    modalError.textContent = matches ? '' : t('email_mismatch');
});

modalCancelBtn.addEventListener('click', () => {
    modal.classList.remove('show');
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
});

modalConfirmBtn.addEventListener('click', async () => {
    if (deleteInProgress || !currentUser) return;
    deleteInProgress = true;
    modalConfirmBtn.disabled = true;
    modalConfirmBtn.textContent = t('modal_deleting');

    try {
        const userEmailVal = currentUser.email;

        if (userEmailVal) {
            try {
                const userRef = db.collection('Collection_of_all_users').doc('Users');
                await userRef.set({
                    [userEmailVal]: firebase.firestore.FieldValue.delete()
                }, { merge: true });

                const userCollection = db.collection(userEmailVal);
                const snapshot = await userCollection.get();
                const batch = db.batch();
                snapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
            } catch (e) {
                console.warn(t('firestore_delete_warn'), e);
            }
        }

        await currentUser.delete();

        modal.classList.remove('show');
        showToast(t('toast_delete_ok'), 'success');
        currentUser = null;
        showScreen('login');
    } catch (err) {
        modalError.textContent = t('toast_login_error') + err.message;
        showToast(t('toast_delete_error') + err.message, 'error');
    } finally {
        deleteInProgress = false;
        modalConfirmBtn.disabled = false;
        modalConfirmBtn.textContent = t('modal_confirm');
    }
});

if (auth) {
    auth.onAuthStateChanged(user => {
        if (user) {
            renderUser(user);
        } else {
            showScreen('login');
        }
    });
}

