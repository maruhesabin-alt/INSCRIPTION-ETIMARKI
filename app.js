(() => {
  const form = document.getElementById('registration-form');
  const statusBox = document.getElementById('form-status');
  const successPanel = document.getElementById('success-panel');
  const formTitle = document.getElementById('form-title');
  const newButton = document.getElementById('new-registration');
  document.getElementById('year').textContent = new Date().getFullYear();

  function showStatus(message, type = 'error') {
    statusBox.textContent = message;
    statusBox.className = `status ${type}`;
    statusBox.hidden = false;
  }
  function clearStatus() { statusBox.hidden = true; statusBox.textContent = ''; }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const payload = {
      fullName: String(data.get('fullName') || '').trim(),
      email: String(data.get('email') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      city: String(data.get('city') || '').trim(),
      program: String(data.get('program') || '').trim(),
      message: String(data.get('message') || '').trim(),
      consent: data.get('consent') === 'on'
    };

    const button = form.querySelector('button[type="submit"]');
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span>Envoi en cours…</span><span class="button-arrow">↻</span>';
    try {
      const base = (window.APP_CONFIG?.API_BASE_URL || '').replace(/\/+$/, '');
      if (!base) throw new Error("L’adresse de l’API n’est pas configurée. Vérifiez js/config.js.");
      const response = await fetch(`${base}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "L’envoi a échoué. Vérifiez votre connexion et réessayez.");
      form.hidden = true;
      formTitle.textContent = 'Inscription soumise';
      document.getElementById('registration-reference').textContent = result.registration?.reference || 'Enregistrée';
      successPanel.hidden = false;
    } catch (error) {
      const message = error instanceof TypeError
        ? "Impossible de joindre le serveur. Assurez-vous que le backend est démarré et que js/config.js contient la bonne URL."
        : error.message;
      showStatus(message, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  });

  newButton.addEventListener('click', () => {
    form.reset();
    form.hidden = false;
    successPanel.hidden = true;
    formTitle.textContent = 'Demande d’inscription';
    clearStatus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
