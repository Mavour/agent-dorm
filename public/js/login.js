const form = document.getElementById('login-form');
const password = document.getElementById('password');
const toggle = document.getElementById('toggle-password');
const error = document.getElementById('login-error');
const submit = form.querySelector('button[type="submit"]');
const label = document.getElementById('submit-label');

toggle.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  toggle.textContent = show ? 'Tutup' : 'Lihat';
  toggle.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
  toggle.setAttribute('aria-pressed', String(show));
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  error.hidden = true;
  submit.disabled = true;
  label.textContent = 'Membuka pintu…';
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ username: document.getElementById('username').value, password: password.value, remember: document.getElementById('remember').checked }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Belum bisa masuk. Coba lagi sebentar.');
    }
    password.value = '';
    location.replace('/');
  } catch (failure) {
    error.textContent = failure.message === 'Failed to fetch' ? 'Koneksi terputus. Periksa internet lalu coba lagi.' : failure.message;
    error.hidden = false;
    submit.disabled = false;
    label.textContent = 'Masuk ke Dorm';
  }
});
