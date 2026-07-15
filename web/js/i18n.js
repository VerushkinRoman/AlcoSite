const i18n = {
    ru: {
        lang_name: 'Русский',
        app_name: 'Алко Календарь',
        subtitle: 'Войдите, чтобы управлять своей учётной записью',
        signin_google: 'Войти через Google',
        loading: 'Загрузка...',
        logout: 'Выйти',
        delete_account_title: 'Удаление аккаунта',
        delete_account_desc: 'Удаление учётной записи приведёт к безвозвратному удалению всех ваших данных. Это действие нельзя отменить.',
        delete_account_btn: 'Удалить учётную запись',
        modal_title: 'Подтвердите удаление',
        modal_text: 'Введите ваш email, чтобы подтвердить удаление аккаунта:',
        modal_email_mismatch: 'Email не совпадает',
        modal_cancel: 'Отмена',
        modal_confirm: 'Удалить',
        modal_deleting: 'Удаление...',
        toast_login_ok: 'Вход выполнен успешно',
        toast_login_error: 'Ошибка входа: ',
        toast_logout: 'Вы вышли из системы',
        toast_logout_error: 'Ошибка при выходе: ',
        toast_delete_ok: 'Аккаунт удалён',
        toast_delete_error: 'Не удалось удалить аккаунт: ',
        default_user: 'Пользователь',
        firestore_delete_warn: 'Ошибка при удалении данных Firestore:',
        email_mismatch: 'Email не совпадает',
        privacy_link: 'Политика конфиденциальности',
    },
    en: {
        lang_name: 'English',
        app_name: 'Alco Calendar',
        subtitle: 'Sign in to manage your account',
        signin_google: 'Sign in with Google',
        loading: 'Loading...',
        logout: 'Sign out',
        delete_account_title: 'Delete Account',
        delete_account_desc: 'Deleting your account will permanently remove all of your data. This action cannot be undone.',
        delete_account_btn: 'Delete account',
        modal_title: 'Confirm deletion',
        modal_text: 'Enter your email to confirm account deletion:',
        modal_email_mismatch: 'Email does not match',
        modal_cancel: 'Cancel',
        modal_confirm: 'Delete',
        modal_deleting: 'Deleting...',
        toast_login_ok: 'Signed in successfully',
        toast_login_error: 'Sign in error: ',
        toast_logout: 'Signed out',
        toast_logout_error: 'Sign out error: ',
        toast_delete_ok: 'Account deleted',
        toast_delete_error: 'Failed to delete account: ',
        default_user: 'User',
        firestore_delete_warn: 'Error deleting Firestore data:',
        email_mismatch: 'Email does not match',
        privacy_link: 'Privacy Policy',
    },
};

let currentLang = 'ru';

function detectLang() {
    const stored = localStorage.getItem('lang');
    if (stored) return stored;
    const browser = (navigator.language || navigator.userLanguage || '').slice(0, 2);
    return i18n[browser] ? browser : 'ru';
}

function t(key) {
    return i18n[currentLang][key] || i18n['ru'][key] || key;
}

function applyLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });

    const toggle = document.getElementById('lang-toggle');
    if (toggle) toggle.textContent = currentLang === 'ru' ? 'EN' : 'RU';
}

function initI18n() {
    applyLang(detectLang());
    document.getElementById('lang-toggle')?.addEventListener('click', () => {
        applyLang(currentLang === 'ru' ? 'en' : 'ru');
    });
}
