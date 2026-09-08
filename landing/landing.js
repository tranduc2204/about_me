/* ============================================
   DUSTIN PERSONAL BRANDING LANDING PAGE JS
   Completely isolated script for /landing/
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // --- Theme Toggle ---
  const themeBtn = document.getElementById('lpThemeBtn');
  const savedTheme = localStorage.getItem('dustin_theme_mode') || 'dark';

  function applyTheme(theme, save = false) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) localStorage.setItem('dustin_theme_mode', theme);
    if (themeBtn) {
      themeBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      themeBtn.setAttribute('title', theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối');
    }
  }

  applyTheme(savedTheme, false);

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });
  }

  // --- Smooth Scroll for in-page anchors ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href').slice(1);
      if (!targetId) return;
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // --- Landing Contact Form (FormSubmit AJAX) ---
  const contactForm = document.getElementById('lpContactForm');
  const statusBox = document.getElementById('lpStatusBox');

  if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn.innerHTML;

      const message = contactForm.querySelector('[name="message"]').value.trim();
      const name = contactForm.querySelector('[name="name"]').value.trim() || 'Bạn đọc / Nhà tuyển dụng ẩn danh';
      const email = contactForm.querySelector('[name="email"]').value.trim() || 'Không cung cấp email';

      if (!message) {
        alert('Vui lòng nhập nội dung lời nhắn.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Đang gửi thông điệp...</span>';
      if (statusBox) statusBox.style.display = 'none';

      try {
        const response = await fetch('https://formsubmit.co/ajax/trandc3015@gmail.com', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            '_subject': `[Dustin Landing Page] Lời nhắn từ: ${name}`,
            'Người gửi': name,
            'Email liên hệ': email,
            'Nội dung tin nhắn': message,
            'Trang gửi': window.location.href,
            '_template': 'table'
          })
        });

        const result = await response.json();

        if (response.ok) {
          contactForm.reset();
          contactForm.style.display = 'none';
          if (statusBox) {
            statusBox.style.display = 'flex';
            statusBox.style.background = 'rgba(0, 230, 153, 0.1)';
            statusBox.style.border = '1px solid rgba(0, 230, 153, 0.35)';
            statusBox.style.color = '#00E699';
            statusBox.innerHTML = `
              <div style="font-size: 1.5rem; line-height: 1; margin-right: 12px;">✅</div>
              <div>
                <strong>Đã gửi thành công!</strong>
                <p style="margin: 4px 0 0 0; font-size: 0.88rem; color: var(--text-secondary);">
                  Cảm ơn bạn rất nhiều vì đã kết nối. Thông điệp đã được chuyển thẳng tới hòm thư cá nhân của Dustin (<code>trandc3015@gmail.com</code>).
                </p>
              </div>
            `;
          }
        } else {
          throw new Error(result.message || 'Lỗi gửi tin');
        }
      } catch (err) {
        console.error('Contact form error:', err);
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        if (statusBox) {
          statusBox.style.display = 'flex';
          statusBox.style.background = 'rgba(255, 107, 107, 0.1)';
          statusBox.style.border = '1px solid rgba(255, 107, 107, 0.35)';
          statusBox.style.color = '#FF6B6B';
          statusBox.innerHTML = `
            <div style="font-size: 1.5rem; line-height: 1; margin-right: 12px;">⚠️</div>
            <div>
              <strong>Chưa thể gửi qua hệ thống tự động!</strong>
              <p style="margin: 4px 0 0 0; font-size: 0.88rem; color: var(--text-secondary);">
                Bạn có thể gửi thư trực tiếp cho tôi tại: <a href="mailto:trandc3015@gmail.com" style="color: var(--primary); text-decoration: underline;">trandc3015@gmail.com</a>.
              </p>
            </div>
          `;
        }
      }
    });
  }
});
