const i18n = {
    ru: {
        lang_name: 'Русский',
        app_name: 'Алко Календарь',
        subtitle: 'Войдите, чтобы управлять своей учётной записью',
        signin_google: 'Войти через Google',
        signin_email: 'Войти по ссылке на email',
        email_label: 'Email',
        email_placeholder: 'email@example.com',
        divider_or: 'или',
        email_sent_title: 'Проверьте почту',
        email_link_sent_text: 'Мы отправили ссылку для входа на {email}. Откройте её в этом браузере.',
        email_link_sent_toast: 'Ссылка для входа отправлена',
        resend_email: 'Отправить ссылку ещё раз',
        resend_email_in: 'Отправить ещё раз через {seconds} с',
        change_email: 'Указать другой email',
        email_invalid: 'Введите корректный email',
        email_send_error: 'Не удалось отправить ссылку: ',
        email_link_missing_email: 'Не найден email, на который отправлена ссылка. Запросите ссылку заново.',
        email_link_invalid: 'Ссылка недействительна. Запросите новую ссылку.',
        email_link_expired: 'Срок действия ссылки истёк. Запросите новую ссылку.',
        reauth_required: 'Для удаления аккаунта подтвердите вход: мы отправили ссылку на ваш email',
        reauth_account_mismatch: 'Аккаунт входа не совпадает с удаляемым аккаунтом',
        reauth_not_supported: 'Этот способ входа не поддерживает повторное подтверждение',
        uid_label: 'UID',
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
        err_too_many_requests: 'Слишком много попыток. Попробуйте позже',
        err_unauthorized_domain: 'Домен не разрешён для входа по ссылке',
        err_operation_not_allowed: 'Вход по ссылке отключён в проекте Firebase',
        err_email_in_use: 'Этот email уже используется другим способом входа',
        err_requires_recent_login: 'Требуется недавний вход в аккаунт',
        err_network: 'Ошибка сети. Проверьте подключение',
        privacy_link: 'Политика конфиденциальности',
    },
    en: {
        lang_name: 'English',
        app_name: 'Alco Calendar',
        subtitle: 'Sign in to manage your account',
        signin_google: 'Sign in with Google',
        signin_email: 'Sign in with an email link',
        email_label: 'Email',
        email_placeholder: 'email@example.com',
        divider_or: 'or',
        email_sent_title: 'Check your inbox',
        email_link_sent_text: 'We sent a sign-in link to {email}. Open it in this browser.',
        email_link_sent_toast: 'Sign-in link sent',
        resend_email: 'Send the link again',
        resend_email_in: 'Send again in {seconds}s',
        change_email: 'Use another email',
        email_invalid: 'Enter a valid email address',
        email_send_error: 'Could not send the link: ',
        email_link_missing_email: 'The address the link was sent to is unknown. Request a new link.',
        email_link_invalid: 'This link is not valid. Request a new one.',
        email_link_expired: 'This link has expired. Request a new one.',
        reauth_required: 'Confirm your sign-in to delete the account: we sent a link to your email',
        reauth_account_mismatch: 'The signed-in account does not match the account being deleted',
        reauth_not_supported: 'This sign-in method does not support reauthentication',
        uid_label: 'UID',
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
        err_too_many_requests: 'Too many requests. Try again later',
        err_unauthorized_domain: 'This domain is not authorized for email link sign-in',
        err_operation_not_allowed: 'Email link sign-in is disabled in this Firebase project',
        err_email_in_use: 'This email is already used with another sign-in method',
        err_requires_recent_login: 'A recent sign-in is required',
        err_network: 'Network error. Check your connection',
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
