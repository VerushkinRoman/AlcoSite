let auth, db;
try {
    firebase.initializeApp(firebaseConfig);
    activateAppCheck();
    auth = firebase.auth();
    db = firebase.firestore();
} catch (e) {
    console.warn('Firebase init failed:', e);
}

// App Check attests that this client really is the site. It is best effort: a missing SDK, a
// missing key or a rejected token only means the requests go out without attestation, so it is
// never allowed to keep the session from starting.
function activateAppCheck() {
    if (!firebase.appCheck) {
        console.warn('App Check off: firebase-app-check-compat.js is not loaded');
        return;
    }
    if (!firebaseConfig.appCheckSiteKey) {
        console.warn('App Check off: appCheckSiteKey is missing in js/config.js');
        return;
    }
    try {
        firebase.appCheck().activate(
            new firebase.appCheck.ReCaptchaEnterpriseProvider(firebaseConfig.appCheckSiteKey),
            true // auto-refresh
        ).catch(e => console.warn('App Check token failed:', e));
    } catch (e) {
        console.warn('App Check off:', e.message);
    }
}

// Firestore layout shared with the mobile app. The account is addressed by `uid`; the legacy
// layout is addressed by email and is still filled in by older clients, so both are cleaned up
// when the account is deleted.
const FIRESTORE = {
    users: 'users',
    emailIndex: 'email_index',
    allUsers: 'Collection_of_all_users',
    allUsersDoc: 'Users',
    avatars: 'Avatars',
    data: 'data',
    settings: 'settings',
};

// Passwordless sign-in by email, the same flow the mobile app uses: a link is sent to the
// address and the session starts when the link is opened.
const EMAIL_LINK_RESEND_COOLDOWN_MS = 60 * 1000;
// Firebase requires a recent authentication to delete an account.
const RECENT_LOGIN_WINDOW_MS = 5 * 60 * 1000;
const AVATAR_MAX_SIZE_PX = 240;

const PENDING_EMAIL_KEY = 'alco.pendingEmail';
const PENDING_EMAIL_SENT_AT_KEY = 'alco.pendingEmailSentAt';
const PENDING_DELETE_KEY = 'alco.pendingDelete';

const AVATAR_PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#9ca3af">' +
    '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' +
    '</svg>'
);

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
const userUid = $('user-uid');
const modal = $('confirm-modal');
const confirmEmail = $('confirm-email');
const modalError = $('modal-error');
const modalCancelBtn = $('modal-cancel-btn');
const modalConfirmBtn = $('modal-confirm-btn');
const toast = $('toast');
const emailForm = $('email-form');
const emailInput = $('email-input');
const emailSigninBtn = $('email-signin-btn');
const emailSentBox = $('email-sent-box');
const emailSentText = $('email-sent-text');
const emailResendBtn = $('email-resend-btn');
const emailChangeBtn = $('email-change-btn');
const emailError = $('email-error');

let currentUser = null;
let deleteInProgress = false;
let pendingDeleteFlow = false;
let emailLinkSentTo = '';
let resendTimer = null;

// Avatar cache in memory: uid -> {version, base64}. The version mirrors `users/{uid}.avatarVersion`,
// so a stale avatar is refetched instead of being shown.
const avatarCache = new Map();

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

function showToast(message, type = '') {
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 4000);
}

/**
 * Canonical form of an address. Firebase stores addresses in the lower case and the email-link
 * comparison is case-sensitive, so the address typed by the user has to match the address the
 * link was sent to exactly.
 */
function normalizeEmail(email) {
    return (email || '').trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function friendlyAuthError(err) {
    const code = err && err.code ? err.code : '';
    switch (code) {
        case 'auth/too-many-requests':
            return t('err_too_many_requests');
        case 'auth/unauthorized-domain':
        case 'auth/unauthorized-continue-uri':
        case 'auth/invalid-continue-uri':
            return t('err_unauthorized_domain');
        case 'auth/operation-not-allowed':
            return t('err_operation_not_allowed');
        case 'auth/email-already-in-use':
        case 'auth/account-exists-with-different-credential':
            return t('err_email_in_use');
        case 'auth/invalid-email-link':
        case 'auth/expired-action-code':
        case 'auth/invalid-action-code':
            return t('email_link_expired');
        case 'auth/requires-recent-login':
            return t('err_requires_recent_login');
        case 'auth/network-request-failed':
            return t('err_network');
        default:
            return err && err.message ? err.message : String(code || 'unknown-error');
    }
}

async function renderUser(user) {
    currentUser = user;
    userName.textContent = user.displayName || t('default_user');
    userEmail.textContent = user.email || '';
    userUid.textContent = user.uid || '';
    renderAvatar(null, user.photoURL);
    showScreen('dashboard');

    await loadProfileAndAvatar(user);
    ensureUidProfile(user);
}

/** True while the account is being removed: no profile may be written in that state. */
function isDeleting(uid) {
    if (!deleteInProgress && !pendingDeleteFlow) return false;
    return !uid || !currentUser || currentUser.uid === uid;
}

/**
 * Reads the uid-backed profile of the signed-in account and shows the avatar that is stored for
 * it. The stored avatar wins over the provider photo, the same priority the mobile app uses.
 */
async function loadProfileAndAvatar(user) {
    const uid = user.uid;
    if (!uid || !db) {
        renderAvatar(null, user.photoURL);
        return;
    }

    let profile = {};
    try {
        const snapshot = await db.collection(FIRESTORE.users).doc(uid).get();
        if (snapshot.exists) profile = snapshot.data() || {};
    } catch (e) {
        console.warn('profile read failed:', e);
    }
    if (!currentUser || currentUser.uid !== uid) return;

    const nickname = (profile.nickname || '').trim();
    if (nickname) userName.textContent = nickname;
    userUid.textContent = uid;

    const expectedVersion = Number(profile.avatarVersion || 0);
    const cached = avatarCache.get(uid);
    let base64 = cached && cached.version === expectedVersion ? cached.base64 : null;

    if (!base64) {
        try {
            const snapshot = await db.collection(FIRESTORE.avatars).doc(uid).get();
            if (snapshot.exists) {
                const data = snapshot.data() || {};
                base64 = data.avatar || null;
                avatarCache.set(uid, { version: expectedVersion, base64: base64 });
            } else {
                avatarCache.delete(uid);
            }
        } catch (e) {
            console.warn('avatar read failed:', e);
        }
    }
    if (!currentUser || currentUser.uid !== uid) return;

    renderAvatar(base64, user.photoURL);
    if (!base64) adoptProviderAvatar(user, profile);
}

/**
 * Moves the provider photo into the avatar storage when the account has no avatar of its own.
 * The mobile app does the same, so both surfaces end up showing the same picture. Every failure
 * degrades to the provider photo, which stays visible anyway.
 */
async function adoptProviderAvatar(user, profile) {
    const uid = user.uid;
    const photoUrl = user.photoURL;
    if (!uid || !photoUrl || !db) return;
    if (isDeleting(uid)) return;
    if (profile.avatarProviderMigrated === true) return;

    const base64 = await downloadAvatarBase64(photoUrl);
    if (!base64 || !currentUser || currentUser.uid !== uid) return;
    if (isDeleting(uid)) return;

    const version = Date.now();
    try {
        await db.collection(FIRESTORE.avatars).doc(uid).set({
            avatar: base64,
            version: version,
            updatedAt: version,
        });
        await db.collection(FIRESTORE.users).doc(uid).set({
            avatarVersion: version,
            avatarProviderMigrated: true,
        }, { merge: true });
        avatarCache.set(uid, { version: version, base64: base64 });
        renderAvatar(base64, photoUrl);
    } catch (e) {
        console.warn('avatar adoption failed:', e);
    }
}

/** Downloads a picture and encodes it as a base64 JPEG, the format the avatar storage uses. */
async function downloadAvatarBase64(url) {
    try {
        const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) return null;

        const blob = await response.blob();
        const image = await loadImageBlob(blob);
        const scale = Math.min(1, AVATAR_MAX_SIZE_PX / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        return dataUrl.indexOf(',') >= 0 ? dataUrl.split(',')[1] : null;
    } catch (e) {
        console.warn('avatar download failed:', e);
        return null;
    }
}

function loadImageBlob(blob) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('avatar-decode-failed'));
        };
        image.src = objectUrl;
    });
}

/** Shows the stored avatar, falls back to the provider photo and finally to the silhouette. */
function renderAvatar(base64, photoUrl) {
    const src = base64
        ? 'data:image/jpeg;base64,' + base64
        : (photoUrl || AVATAR_PLACEHOLDER);
    userAvatar.onerror = () => {
        userAvatar.onerror = null;
        userAvatar.src = AVATAR_PLACEHOLDER;
    };
    userAvatar.src = src;
}

/**
 * Keeps the uid-backed profile and the email index in sync with the signed-in account, so the
 * mobile app finds the same account by the same address. Existing fields are never overwritten.
 */
async function ensureUidProfile(user) {
    if (!db || !user.uid) return;
    const uid = user.uid;
    if (isDeleting(uid)) return;
    const email = normalizeEmail(user.email || '');
    const nickname = (user.displayName || '').trim() || (email ? email.split('@')[0] : '');

    const providers = {};
    (user.providerData || []).forEach(info => {
        const id = (info.providerId || '').trim();
        if (!id) return;
        providers[id] = normalizeEmail(info.email || email);
    });

    try {
        const profileRef = db.collection(FIRESTORE.users).doc(uid);
        const snapshot = await profileRef.get();
        const profile = snapshot.exists ? (snapshot.data() || {}) : {};
        const existingProviders = (profile.providers && typeof profile.providers === 'object')
            ? profile.providers
            : {};

        const payload = {};
        if (!profile.email && email) payload.email = email;
        if (!profile.nickname && nickname) payload.nickname = nickname;
        const mergedProviders = Object.assign({}, existingProviders, providers);
        if (Object.keys(mergedProviders).length) payload.providers = mergedProviders;
        if (Object.keys(payload).length) {
            if (isDeleting(uid)) return;
            await profileRef.set(payload, { merge: true });
        }

        await ensureEmailIndex(email, uid);
    } catch (e) {
        console.warn('profile sync failed:', e);
    }
}

/** Writes `email_index/{email} -> {uid}` unless the address already belongs to another account. */
async function ensureEmailIndex(email, uid) {
    if (!email || !uid) return;
    try {
        const ref = db.collection(FIRESTORE.emailIndex).doc(email);
        const snapshot = await ref.get();
        if (!snapshot.exists) {
            await ref.set({ uid: uid });
            return;
        }
        const current = (snapshot.data() || {}).uid;
        if (!current) await ref.set({ uid: uid }, { merge: true });
    } catch (e) {
        console.warn('email index sync failed:', e);
    }
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
            showToast(t('toast_login_error') + friendlyAuthError(err), 'error');
        }
    } finally {
        googleBtn.disabled = false;
        googleBtn.innerHTML = googleBtnHtml;
        applyLang(currentLang);
    }
});

emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await requestEmailLink(emailInput.value);
});

emailResendBtn.addEventListener('click', async () => {
    if (resendSecondsLeft() > 0) return;
    await requestEmailLink(emailLinkSentTo);
});

emailChangeBtn.addEventListener('click', () => {
    emailLinkSentTo = '';
    emailSentBox.hidden = true;
    emailInput.disabled = false;
    emailSigninBtn.disabled = false;
    hideEmailError();
    clearResendTimer();
    emailInput.focus();
});

/** Sends the sign-in link to the address and shows the "check your mail" state. */
async function requestEmailLink(rawEmail) {
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) {
        showEmailError(t('email_invalid'));
        return;
    }
    hideEmailError();

    emailSigninBtn.disabled = true;
    const previousLabel = emailSigninBtn.textContent;
    emailSigninBtn.textContent = t('loading');
    try {
        await sendEmailSignInLink(email);
        rememberPendingEmail(email);
        emailLinkSentTo = email;
        showEmailSent(email);
        showToast(t('email_link_sent_toast'), 'success');
    } catch (err) {
        showEmailError(t('email_send_error') + friendlyAuthError(err));
    } finally {
        if (emailSigninBtn.textContent === t('loading')) emailSigninBtn.textContent = previousLabel;
        emailSigninBtn.disabled = !emailSentBox.hidden;
    }
}

/** Keeps the address of the pending link, it is needed to complete the sign-in. */
function rememberPendingEmail(email) {
    localStorage.setItem(PENDING_EMAIL_KEY, email);
    localStorage.setItem(PENDING_EMAIL_SENT_AT_KEY, String(Date.now()));
}

async function sendEmailSignInLink(email) {
    if (!auth) throw new Error('auth-unavailable');
    auth.languageCode = currentLang;
    await auth.sendSignInLinkToEmail(email, {
        url: emailLinkContinueUrl(),
        handleCodeInApp: true,
    });
}

function emailLinkContinueUrl() {
    return window.location.origin + window.location.pathname;
}

function showEmailSent(email) {
    emailInput.value = email;
    emailInput.disabled = true;
    emailSigninBtn.disabled = true;
    emailSentText.textContent = t('email_link_sent_text').replace('{email}', email);
    emailSentBox.hidden = false;
    startResendCountdown();
}

function resendSecondsLeft() {
    const sentAt = Number(localStorage.getItem(PENDING_EMAIL_SENT_AT_KEY) || 0);
    if (!sentAt) return 0;
    const elapsed = Math.floor((Date.now() - sentAt) / 1000);
    return Math.max(0, Math.floor(EMAIL_LINK_RESEND_COOLDOWN_MS / 1000) - elapsed);
}

function startResendCountdown() {
    clearResendTimer();
    const tick = () => {
        const left = resendSecondsLeft();
        if (left <= 0) {
            emailResendBtn.disabled = false;
            emailResendBtn.textContent = t('resend_email');
            clearResendTimer();
            return;
        }
        emailResendBtn.disabled = true;
        emailResendBtn.textContent = t('resend_email_in').replace('{seconds}', String(left));
    };
    tick();
    resendTimer = setInterval(tick, 1000);
}

function clearResendTimer() {
    if (resendTimer) {
        clearInterval(resendTimer);
        resendTimer = null;
    }
}

function showEmailError(message) {
    emailError.textContent = message;
    emailError.hidden = false;
}

function hideEmailError() {
    emailError.textContent = '';
    emailError.hidden = true;
}

/**
 * Completes the sign-in when the page was opened through the link from the email. The link has to
 * be opened in the browser that requested it, the same rule the mobile app follows.
 */
async function handleEmailLinkOnLoad() {
    if (!auth) return;
    const url = window.location.href;
    if (url.indexOf('oobCode=') < 0) return;

    const email = normalizeEmail(localStorage.getItem(PENDING_EMAIL_KEY) || '');
    if (!email) {
        showEmailError(t('email_link_missing_email'));
        return;
    }

    // The deletion that is waiting for this link must not race with the profile sync that runs
    // on sign-in, so the flag is raised before the sign-in starts.
    if (localStorage.getItem(PENDING_DELETE_KEY)) pendingDeleteFlow = true;

    try {
        if (!auth.isSignInWithEmailLink(url)) {
            showEmailError(t('email_link_invalid'));
            pendingDeleteFlow = false;
            return;
        }
        const credential = await auth.signInWithEmailLink(email, url);
        localStorage.removeItem(PENDING_EMAIL_KEY);
        localStorage.removeItem(PENDING_EMAIL_SENT_AT_KEY);
        clearEmailLinkFromUrl();
        showToast(t('toast_login_ok'), 'success');
        await resumePendingDeletion(credential.user);
    } catch (err) {
        pendingDeleteFlow = false;
        showEmailError(friendlyAuthError(err));
    }
}

function clearEmailLinkFromUrl() {
    if (!window.history || !window.history.replaceState) return;
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
}

logoutBtn.addEventListener('click', async () => {
    try {
        await auth.signOut();
        currentUser = null;
        avatarCache.clear();
        pendingDeleteFlow = false;
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
    const matches = normalizeEmail(confirmEmail.value) === normalizeEmail(currentUser.email);
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
        const user = currentUser;
        const outcome = await deleteAccount(user);
        if (outcome === 'reauth_required') {
            modal.classList.remove('show');
            showToast(t('reauth_required'), 'success');
            return;
        }
        modal.classList.remove('show');
        showToast(t('toast_delete_ok'), 'success');
        currentUser = null;
        avatarCache.clear();
        showScreen('login');
    } catch (err) {
        pendingDeleteFlow = false;
        modalError.textContent = friendlyAuthError(err);
        showToast(t('toast_delete_error') + friendlyAuthError(err), 'error');
    } finally {
        deleteInProgress = false;
        modalConfirmBtn.disabled = false;
        modalConfirmBtn.textContent = t('modal_confirm');
    }
});

/**
 * Deletes the account: the legacy email-keyed data, the uid-keyed data and the Firebase Auth
 * account itself. The data goes first, because the rules that allow to clean it up need a signed
 * in user.
 */
async function deleteAccount(user) {
    if (await needsRecentLogin(user)) {
        const outcome = await reauthenticateForDeletion(user);
        if (outcome === 'email_link_sent') return 'reauth_required';
    }

    const email = normalizeEmail(user.email || '');
    const warnings = [];
    await deleteLegacyData(email, warnings);
    await deleteUidData(user.uid, email, warnings);

    try {
        await user.delete();
    } catch (err) {
        if (!err || err.code !== 'auth/requires-recent-login') throw err;
        const outcome = await reauthenticateForDeletion(user);
        if (outcome === 'email_link_sent') return 'reauth_required';
        await user.delete();
    }

    if (warnings.length) {
        console.warn(t('firestore_delete_warn'), warnings);
    }
    return 'deleted';
}

/** Legacy layout: the entry in the shared user list and the whole email-keyed collection. */
async function deleteLegacyData(email, warnings) {
    if (!email) return;
    try {
        const allUsersRef = db.collection(FIRESTORE.allUsers).doc(FIRESTORE.allUsersDoc);
        try {
            // The email contains dots, so it has to be addressed as a field path, otherwise it
            // would be read as a nested path. This is the same call the mobile app makes.
            await allUsersRef.update(
                new firebase.firestore.FieldPath(email),
                firebase.firestore.FieldValue.delete()
            );
        } catch (e) {
            if (!e || e.code !== 'not-found') throw e;
            // The legacy document does not exist, so there is nothing to remove.
        }
    } catch (e) {
        warnings.push(e);
        console.warn(t('firestore_delete_warn'), e);
    }
    try {
        await deleteCollectionDocs(db.collection(email));
    } catch (e) {
        warnings.push(e);
        console.warn(t('firestore_delete_warn'), e);
    }
}

/** Uid layout: the profile, its data and settings, the email index and the avatar. */
async function deleteUidData(uid, email, warnings) {
    if (!uid) return;

    let profile = {};
    try {
        const snapshot = await db.collection(FIRESTORE.users).doc(uid).get();
        if (snapshot.exists) profile = snapshot.data() || {};
    } catch (e) {
        warnings.push(e);
    }

    const providers = (profile.providers && typeof profile.providers === 'object')
        ? profile.providers
        : {};
    // The index key is the address itself, so every spelling that could have been written has to
    // be removed.
    const rawEmails = new Set();
    const addRawEmail = (value) => {
        const raw = (value || '').trim();
        if (raw) rawEmails.add(raw);
    };
    addRawEmail(profile.email);
    Object.keys(providers).forEach(id => addRawEmail(providers[id]));
    addRawEmail(email);

    const emails = new Set();
    rawEmails.forEach(raw => {
        emails.add(raw);
        emails.add(raw.toLowerCase());
    });

    for (const value of emails) {
        try {
            await db.collection(FIRESTORE.emailIndex).doc(value).delete();
        } catch (e) {
            warnings.push(e);
        }
    }
    try {
        await deleteCollectionDocs(db.collection(FIRESTORE.users).doc(uid).collection(FIRESTORE.data));
    } catch (e) {
        warnings.push(e);
    }
    try {
        await deleteCollectionDocs(db.collection(FIRESTORE.users).doc(uid).collection(FIRESTORE.settings));
    } catch (e) {
        warnings.push(e);
    }
    try {
        await db.collection(FIRESTORE.users).doc(uid).delete();
    } catch (e) {
        warnings.push(e);
    }
    try {
        await db.collection(FIRESTORE.avatars).doc(uid).delete();
    } catch (e) {
        warnings.push(e);
    }
}

async function deleteCollectionDocs(collectionRef) {
    const snapshot = await collectionRef.get();
    if (snapshot.empty) return;

    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += 400) {
        const batch = db.batch();
        docs.slice(i, i + 400).forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}

/** Firebase only allows to delete an account right after the authentication. */
async function needsRecentLogin(user) {
    try {
        const token = await user.getIdTokenResult();
        const authTime = Number((token.claims || {}).auth_time || 0);
        if (!authTime) return false;
        return Date.now() - authTime * 1000 > RECENT_LOGIN_WINDOW_MS;
    } catch (e) {
        return false;
    }
}

/**
 * Refreshes the authentication before the deletion. Google accounts are re-authenticated in a
 * popup, passwordless accounts get a fresh sign-in link by email: the deletion continues as soon
 * as the link is opened.
 */
async function reauthenticateForDeletion(user) {
    const providerIds = (user.providerData || []).map(info => info.providerId);
    if (providerIds.indexOf('google.com') >= 0) {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('profile');
        provider.addScope('email');
        const result = await auth.signInWithPopup(provider);
        if (!result.user || result.user.uid !== user.uid) {
            await auth.signOut();
            throw new Error(t('reauth_account_mismatch'));
        }
        try {
            await auth.currentUser.reauthenticateWithCredential(result.credential);
        } catch (e) {
            console.warn('reauthenticate failed:', e);
        }
        return 'reauthenticated';
    }

    const email = normalizeEmail(user.email || '');
    if (!email) throw new Error(t('reauth_not_supported'));
    localStorage.setItem(PENDING_DELETE_KEY, '1');
    pendingDeleteFlow = true;
    try {
        await sendEmailSignInLink(email);
        rememberPendingEmail(email);
    } catch (e) {
        localStorage.removeItem(PENDING_DELETE_KEY);
        pendingDeleteFlow = false;
        throw e;
    }
    return 'email_link_sent';
}

/** Continues the deletion that was waiting for a fresh authentication. */
async function resumePendingDeletion(user) {
    if (!localStorage.getItem(PENDING_DELETE_KEY)) return;
    localStorage.removeItem(PENDING_DELETE_KEY);
    deleteInProgress = true;
    try {
        const outcome = await deleteAccount(user);
        if (outcome === 'reauth_required') return;
        showToast(t('toast_delete_ok'), 'success');
        currentUser = null;
        avatarCache.clear();
        showScreen('login');
    } catch (err) {
        showToast(t('toast_delete_error') + friendlyAuthError(err), 'error');
    } finally {
        deleteInProgress = false;
        pendingDeleteFlow = false;
    }
}

if (auth) {
    auth.onAuthStateChanged(user => {
        if (user) {
            renderUser(user);
        } else {
            showScreen('login');
        }
    });

    restorePendingEmailState();
    handleEmailLinkOnLoad();
}

/** Restores the "check your mail" state after a page reload. */
function restorePendingEmailState() {
    const email = normalizeEmail(localStorage.getItem(PENDING_EMAIL_KEY) || '');
    if (!email) return;
    emailLinkSentTo = email;
    showEmailSent(email);
}
