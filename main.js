// main.js (or app.js)

// 1. Capture the event
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
});

// 2. Show button when installable
const installBtn = document.querySelector('#installBtn');
window.addEventListener('load', () => {
    const isInstalled = window.matchMedia('(display-mode: standalone)').matches;
    if (deferredPrompt && !isInstalled) {
        installBtn.removeAttribute('hidden');
        // Optionally auto-hide after a few seconds
        setTimeout(() => installBtn.setAttribute('hidden', ''), 5000);
    }
});

// 3. Trigger the prompt on user click
installBtn.addEventListener('click', async() => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.setAttribute('hidden', '');
});

// 4. Clean up if already installed
window.addEventListener('appinstalled', () => {
    installBtn.setAttribute('hidden', '');
});