// Contact and DMCA forms on the legal pages. Posts to /api/contact, which saves every message
// (admin > Messages) and emails it when mail delivery works.
(function () {
  function val(form, name) {
    var el = form.elements[name];
    return el ? String(el.value || '').trim() : '';
  }

  function setStatus(form, text, ok) {
    var el = form.querySelector('.legal-form-status');
    if (!el) return;
    el.textContent = text;
    el.className = 'legal-form-status ' + (ok ? 'ok' : 'err');
  }

  function collect(form) {
    var kind = form.getAttribute('data-kind') || 'contact';
    var data = {
      kind: kind,
      name: val(form, 'name'),
      email: val(form, 'email'),
      subject: val(form, 'subject'),
      message: val(form, 'message'),
      website: val(form, 'website')
    };
    if (kind === 'contact') {
      var topic = val(form, 'topic');
      if (topic === 'privacy') { data.kind = 'privacy'; topic = 'Privacy request'; }
      data.subject = (topic ? '[' + topic + '] ' : '') + data.subject;
    }
    if (kind === 'dmca') {
      data.subject = 'Copyright notice';
      data.details = {
        'Copyrighted work': val(form, 'work'),
        'Infringing URL(s) on modxnet.com': val(form, 'urls'),
        'Rights holder / organisation': val(form, 'owner'),
        'Postal address': val(form, 'address'),
        'Phone': val(form, 'phone'),
        'Good-faith statement': form.elements.goodfaith && form.elements.goodfaith.checked ? 'Confirmed' : 'Not confirmed',
        'Accuracy and authority statement': form.elements.accuracy && form.elements.accuracy.checked ? 'Confirmed' : 'Not confirmed',
        'Electronic signature': val(form, 'signature')
      };
    }
    return data;
  }

  function validate(form, data) {
    if (!data.name) return 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return 'Please enter a valid email address.';
    if (data.message.length < 10) return 'Your message must be at least 10 characters.';
    if (form.getAttribute('data-kind') === 'dmca') {
      if (!val(form, 'work')) return 'Please identify the copyrighted work.';
      if (!val(form, 'urls')) return 'Please list the URL(s) on modxnet.com that you are reporting.';
      if (!form.elements.goodfaith.checked || !form.elements.accuracy.checked) return 'Please confirm both statements.';
      if (!val(form, 'signature')) return 'Please type your full name as your electronic signature.';
    }
    return '';
  }

  function bind(form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = collect(form);
      var problem = validate(form, data);
      if (problem) { setStatus(form, problem, false); return; }
      var btn = form.querySelector('button[type="submit"]');
      var label = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...'; }
      setStatus(form, '', true);
      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          if (res.ok && res.d.success) {
            form.reset();
            setStatus(form, form.getAttribute('data-kind') === 'dmca'
              ? 'Thank you. Your notice has been received and will be reviewed.'
              : 'Thank you. Your message has been received.', true);
          } else {
            setStatus(form, (res.d && res.d.error) || 'Your message could not be sent. Please try again later.', false);
          }
        })
        .catch(function () { setStatus(form, 'Network error. Please check your connection and try again.', false); })
        .then(function () { if (btn) { btn.disabled = false; btn.innerHTML = label; } });
    });
  }

  document.querySelectorAll('form.legal-form').forEach(bind);
})();
