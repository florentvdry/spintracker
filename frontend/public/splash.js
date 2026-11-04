
    const translations = {
        en: {
            status: "Initializing...",
            updating: "Updating statistics"
        },
        fr: {
            status: "Initialisation en cours...",
            updating: "Mise à jour des statistiques"
        }
    };

    function getLanguage() {
        // Try to get stored language from localStorage if possible (might not persist from main app due to different context, but worth a try if same origin)
        // Otherwise fallback to navigator.language
        const lang = navigator.language || navigator.userLanguage || 'en';
        return lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
    }

    const lang = getLanguage();
    document.getElementById('status-text').textContent = translations[lang].status;

    // Called by the application while the stored statistics are recomputed (after an update).
    window.setStatsProgress = function (done, total) {
        const percent = total > 0 ? Math.min(100, Math.round((done * 100) / total)) : 0;
        document.getElementById('status-text').textContent =
            translations[lang].updating + ": " + done.toLocaleString() + " / " + total.toLocaleString() + " (" + percent + "%)";
        const bar = document.querySelector('.loader-bar');
        bar.style.animation = 'none';
        bar.style.transform = 'none';
        bar.style.width = percent + '%';
        document.querySelector('.loader').style.width = '160px';
    };
