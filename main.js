// main.js (or app.js)

// --- Snackbar Install Prompt ---
let deferredPrompt;
const snackbar = document.getElementById('installSnackbar');
const snackbarBtn = document.getElementById('installSnackbarBtn');
const snackbarText = document.getElementById('installSnackbarText');

function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isInStandaloneMode() {
    return ('standalone' in window.navigator) && window.navigator.standalone;
}

window.addEventListener('beforeinstallprompt', e => {
    if (isIos()) return; // Don't show install prompt on iOS
    e.preventDefault();
    deferredPrompt = e;
    showInstallSnackbar();
});

function showInstallSnackbar() {
    if (isIos() && !isInStandaloneMode()) {
        snackbarText.textContent = "To install, tap the Share button \u2191 and then 'Add to Home Screen'.";
        snackbarBtn.style.display = 'none';
        snackbar.hidden = false;
        setTimeout(() => snackbar.classList.add('show'), 50);
        setTimeout(hideInstallSnackbar, 8000);
        return;
    }
    if (!deferredPrompt) return;
    snackbarText.textContent = 'Install Stagona App?';
    snackbarBtn.textContent = 'Install';
    snackbarBtn.style.display = '';
    snackbar.hidden = false;
    setTimeout(() => snackbar.classList.add('show'), 50);
    setTimeout(hideInstallSnackbar, 8000);
}

function hideInstallSnackbar() {
    snackbar.classList.remove('show');
    setTimeout(() => { snackbar.hidden = true; }, 400);
}

snackbarBtn.addEventListener('click', async() => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    hideInstallSnackbar();
});

window.addEventListener('appinstalled', () => {
    hideInstallSnackbar();
});

// Show iOS install instructions on load if on iOS and not standalone
window.addEventListener('load', () => {
    if (isIos() && !isInStandaloneMode()) {
        showInstallSnackbar();
    }
});