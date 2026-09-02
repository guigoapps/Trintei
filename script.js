document.addEventListener('DOMContentLoaded', () => {

    // ---------------------------------------------------------
    // 0. ÁUDIO DE FUNDO (musicas.mp3, volume baixo, loop)
    // ---------------------------------------------------------
    const audio = document.getElementById('party-audio');
    const discToggle = document.getElementById('disc-toggle');
    const discHeader = document.getElementById('disc-header');
    if (audio) audio.volume = 0.15;

    function tryPlayAudio() {
        if (!audio) return;
        audio.play().catch(() => {
            // Autoplay bloqueado — toca no primeiro toque no disco.
        });
    }

    function updateDiscState() {
        if (!discHeader) return;
        discHeader.classList.toggle('is-paused', audio.paused);
    }

    if (discToggle) {
        discToggle.addEventListener('click', () => {
            if (audio.paused) { audio.play().catch(() => {}); } else { audio.pause(); }
        });
        audio.addEventListener('play', updateDiscState);
        audio.addEventListener('pause', updateDiscState);
    }

    // ---------------------------------------------------------
    // 1. CAPA -> APP
    // ---------------------------------------------------------
    const coverScreen = document.getElementById('cover-screen');
    const appShell = document.getElementById('app-shell');

    window.__enterApp__ = function () {
        coverScreen.hidden = true;
        appShell.hidden = false;
        tryPlayAudio();
        updateDiscState();
    };

    // ---------------------------------------------------------
    // 2. ABAS — troca de painel + sobe suavemente passando o disco
    // ---------------------------------------------------------
    const panels = document.querySelectorAll('.tab-panel');
    const navItems = document.querySelectorAll('.nav-item');

    function goToTab(tabName) {
        panels.forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === tabName));
        navItems.forEach((item) => item.classList.toggle('is-active', item.dataset.goto === tabName));

        const target = document.querySelector(`.tab-panel[data-panel="${tabName}"] .panel-title`);
        if (target) {
            const offset = target.getBoundingClientRect().top + window.scrollY - 12;
            window.scrollTo({ top: offset, behavior: 'smooth' });
        }
    }

    navItems.forEach((item) => {
        item.addEventListener('click', () => goToTab(item.dataset.goto));
    });

    // ---------------------------------------------------------
    // 3. CHECKLIST INTERATIVA
    // ---------------------------------------------------------
    document.querySelectorAll('#checklist li').forEach((item) => {
        item.addEventListener('click', () => {
            item.classList.toggle('checked');
            if (window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate(50);
            }
        });
    });

    // ---------------------------------------------------------
    // 4. COPIAR ENDEREÇO
    // ---------------------------------------------------------
    const copyBtn = document.getElementById('copy-address-btn');
    const addressText = 'R. José Severino de Barros, 465 - km 13, Aldeia dos Camarás, Camaragibe - PE, CEP 54783-270';

    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(addressText);
                copyBtn.classList.add('is-copied');
                setTimeout(() => copyBtn.classList.remove('is-copied'), 2000);
            } catch {
                copyBtn.classList.add('is-error');
                setTimeout(() => copyBtn.classList.remove('is-error'), 2000);
            }
        });
    }
});
