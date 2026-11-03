
    const translations = {
        en: {
            status: "Initializing..."
        },
        fr: {
            status: "Initialisation en cours..."
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
