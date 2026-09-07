/* ============================================
   DUSTIN'S BLOG — CORE JAVASCRIPT
   ============================================ */
document.addEventListener('DOMContentLoaded', () => {

  // --- Dark mode theme toggle ---
  const themeToggle = document.getElementById('themeToggle');
  try { localStorage.removeItem('dustin_theme'); } catch(e) {}
  const currentTheme = localStorage.getItem('dustin_theme_mode') || 'dark';
  
  function applyTheme(theme, save = false) {
    document.documentElement.setAttribute('data-theme', theme);
    if (save) {
      localStorage.setItem('dustin_theme_mode', theme);
    }
    if (themeToggle) {
      themeToggle.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      themeToggle.setAttribute('title', theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối');
      themeToggle.setAttribute('aria-label', theme === 'dark' ? 'Chuyển sang chế độ sáng' : 'Chuyển sang chế độ tối');
    }
  }

  // Initialize button icon to match current theme
  applyTheme(currentTheme, false);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme, true);
    });
  }

  // --- Navbar scroll effect ---
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  // --- Mobile menu toggle ---
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (toggle && navLinks) {
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navLinks.classList.toggle('open');
      toggle.classList.toggle('active', isOpen);
      document.body.classList.toggle('menu-open', isOpen);
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        toggle.classList.remove('active');
        document.body.classList.remove('menu-open');
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (navLinks.classList.contains('open') && !toggle.contains(e.target) && !navLinks.contains(e.target)) {
        navLinks.classList.remove('open');
        toggle.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    });

    // Reset state if resized above mobile breakpoint
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && navLinks.classList.contains('open')) {
        navLinks.classList.remove('open');
        toggle.classList.remove('active');
        document.body.classList.remove('menu-open');
      }
    });
  }

  // --- Typing effect ---
  const typingEl = document.querySelector('.hero-typing .text');
  if (typingEl) {
    const phrases = [
      'Analytics Engineer',
      'Data Engineer',
      'SQL & dbt Enthusiast',
      'Thủ khoa đầu ra UFM (GPA 3.7)'
    ];
    let phraseIdx = 0, charIdx = 0, isDeleting = false;
    function typeLoop() {
      const current = phrases[phraseIdx];
      typingEl.textContent = current.substring(0, charIdx);
      if (!isDeleting) {
        charIdx++;
        if (charIdx > current.length) {
          isDeleting = true;
          setTimeout(typeLoop, 2000);
          return;
        }
      } else {
        charIdx--;
        if (charIdx === 0) {
          isDeleting = false;
          phraseIdx = (phraseIdx + 1) % phrases.length;
        }
      }
      setTimeout(typeLoop, isDeleting ? 40 : 80);
    }
    typeLoop();
  }

  // --- Scroll reveal (IntersectionObserver) ---
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length) {
    const revealObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          revealObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    reveals.forEach(el => revealObs.observe(el));
  }

  // --- Counter animation ---
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    const counterObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const el = entry.target;
          const target = parseFloat(el.dataset.count);
          const suffix = el.dataset.suffix || '';
          const isFloat = String(target).includes('.');
          const duration = 1500;
          const start = performance.now();
          function animate(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const val = eased * target;
            el.textContent = (isFloat ? val.toFixed(1) : Math.floor(val)) + suffix;
            if (progress < 1) requestAnimationFrame(animate);
          }
          requestAnimationFrame(animate);
          counterObs.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(el => counterObs.observe(el));
  }

  // --- Progress bar animation ---
  const progressBars = document.querySelectorAll('.progress-fill[data-width]');
  if (progressBars.length) {
    const progressObs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.width = entry.target.dataset.width + '%';
          progressObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    progressBars.forEach(el => progressObs.observe(el));
  }

  // --- Active nav link highlight ---
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

});
